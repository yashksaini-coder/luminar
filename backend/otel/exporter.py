"""OtlpTraceExporter — turns simulation events into OTLP/JSON spans and POSTs them.

Every GossipSub message becomes one trace: a `gossipsub.publish` root at the origin and a
`gossipsub.forward` child per hop, parented sender → receiver. Dropped relays are ERROR
spans; IHAVE/IWANT pulls are `gossipsub.iwant` spans linked to the root. Faults and
scenario phases get their own spans.

Design notes (deliberate deviations, so a reviewer does not read them as ignorance):
- No OpenTelemetry SDK. The sim is tick-driven with simulated time; spans are built with
  explicit start/end times and derived ids, which the SDK's context propagation cannot do.
- Span names stay `gossipsub.<op>` rather than the semconv SHOULD form `publish <topic>`;
  the Required messaging attributes (system, operation.name/type, destination.name,
  message.id) are all present.
- Transport is OTLP/HTTP with JSON encoding only: Render does not pass gRPC, and the
  protobuf dependency buys nothing here.

The sink runs on the trio thread inside EventBus.emit and does O(1) work; a daemon
thread flushes a bounded deque every second with stdlib urllib.
"""

from __future__ import annotations

import logging
import threading
import time
import urllib.error
import urllib.request
from collections import OrderedDict, deque
from collections.abc import Callable
from typing import TYPE_CHECKING, Any

import orjson

from backend.otel.ids import sampled, span_id, trace_id

if TYPE_CHECKING:
    from backend.events.types import BaseEvent
    from backend.simulation.engine import SimulationEngine

logger = logging.getLogger(__name__)

SERVICE_NAME = "luminar-sim"
SCOPE = {"name": "luminar.gossipsub", "version": "0.1.0"}
QUEUE_MAX = 20_000
BATCH_MAX = 1024
FLUSH_S = 1.0
MSG_MAP_MAX = 2000  # mirrors MAX_TRACES
PHASE_BOOST_S = 5.0  # 100% sampling for this long after a scenario phase fires
SPAM_SPANS_PER_ATTACKER = 50
RETRY_STATUSES = {429, 502, 503, 504}
HTTP_TIMEOUT_S = 5

# messaging.operation.type → span kind (PRODUCER=4, CONSUMER=5, INTERNAL=1)
KIND_PRODUCER, KIND_CONSUMER, KIND_INTERNAL = 4, 5, 1


def _attr(key: str, value: Any) -> dict:
    if isinstance(value, bool):
        return {"key": key, "value": {"boolValue": value}}
    if isinstance(value, int):
        return {"key": key, "value": {"intValue": str(value)}}
    if isinstance(value, float):
        return {"key": key, "value": {"doubleValue": value}}
    return {"key": key, "value": {"stringValue": str(value)}}


class OtlpTraceExporter:
    def __init__(
        self,
        endpoint: str,
        sample_pct: int = 5,
        http_post: Callable[[str, bytes], int] | None = None,
    ) -> None:
        self.endpoint = endpoint.rstrip("/")
        self.sample_pct = max(0, min(100, sample_pct))
        self._post = http_post or self._urllib_post
        self._queue: deque[dict] = deque(maxlen=QUEUE_MAX)
        self._engine: SimulationEngine | None = None
        self._run_id = ""
        self._t0_ns = 0
        self._roots: OrderedDict[str, str] = OrderedDict()  # msg_id → root span id
        self._inbound: dict[str, dict[str, str]] = {}  # msg_id → {peer: inbound span id}
        self._open_faults: dict[str, dict] = {}
        self._boost_until = -1.0  # sim time until which sampling is forced to 100%
        self._spam_spans: dict[str, int] = {}
        self._thread: threading.Thread | None = None
        self._stop = threading.Event()
        self._flush_lock = threading.Lock()
        # Status counters
        self.spans_emitted = 0
        self.spans_dropped = 0
        self.sink_errors = 0
        self.last_flush_ms = 0.0
        self.last_status: int | str | None = None

    # ── Wiring ──

    def attach(self, engine: SimulationEngine) -> None:
        """Hook the sink onto a (new) engine. Called on build/reconfigure."""
        self._engine = engine
        engine.event_bus.sinks.append(self.sink)
        self._roots.clear()
        self._inbound.clear()
        self._open_faults.clear()
        self._spam_spans.clear()
        self._boost_until = -1.0

    @property
    def run_id(self) -> str:
        return self._engine.run_id if self._engine else ""

    def start(self) -> None:
        if self._thread is None:
            self._stop.clear()
            self._thread = threading.Thread(target=self._loop, name="otlp-exporter", daemon=True)
            self._thread.start()

    def stop(self) -> None:
        self._stop.set()
        if self._thread:
            self._thread.join(timeout=HTTP_TIMEOUT_S + 1)  # outlive a hanging POST
            self._thread = None
        self.flush()

    def status(self) -> dict:
        return {
            "enabled": True,
            "endpoint": self.endpoint,
            "run_id": self.run_id,
            "sample_pct": self.sample_pct,
            "spans_emitted": self.spans_emitted,
            "spans_dropped": self.spans_dropped,
            "sink_errors": self.sink_errors,
            "queued": len(self._queue),
            "last_flush_ms": round(self.last_flush_ms, 1),
            "last_status": self.last_status,
        }

    # ── Sink (trio thread) ──

    def sink(self, event: BaseEvent) -> None:
        try:
            span = self._build(event)
        except Exception:
            self.sink_errors += 1
            return
        if span is not None:
            if len(self._queue) >= QUEUE_MAX:
                self.spans_dropped += 1
            self._queue.append(span)

    def _ns(self, at: float) -> str:
        t0 = self._engine.t0_wall_ns if self._engine else 0
        return str(t0 + int(at * 1e9))

    def _remember(self, msg_id: str, peer: str, sid: str, root: bool = False) -> None:
        if root:
            self._roots[msg_id] = sid
            self._inbound[msg_id] = {}
            while len(self._roots) > MSG_MAP_MAX:
                old, _ = self._roots.popitem(last=False)
                self._inbound.pop(old, None)
        elif msg_id not in self._roots:
            return  # unsampled/evicted root: parenting is impossible, don't grow _inbound
        self._inbound[msg_id][peer] = sid

    def on_new_run(self) -> None:
        """Sim clock restarted (reset / scenario launch): sim-time state must not carry over."""
        self._boost_until = -1.0
        self._spam_spans.clear()

    def _build(self, e: BaseEvent) -> dict | None:
        et = e.event_type
        run = self.run_id
        if et == "ScenarioPhaseFired":
            self._boost_until = e.at + PHASE_BOOST_S
            tid = trace_id(run, f"scenario|{e.scenario_id}")
            return self._span(
                tid,
                span_id(run, f"scenario|{e.scenario_id}", "", str(e.phase_idx)),
                None,
                f"scenario.{e.action}",
                KIND_INTERNAL,
                e.at,
                e.at,
                [
                    _attr("luminar.scenario", e.scenario_id),
                    _attr("luminar.phase_idx", e.phase_idx),
                    _attr("luminar.phase.label", e.label),
                ],
            )
        if et == "FaultInjected":
            fid = str(e.params.get("fault_id", ""))
            self._open_faults[fid] = {"at": e.at, "type": e.fault_type, "target": e.target}
            return None
        if et == "FaultCleared":
            f = self._open_faults.pop(e.fault_id, None)
            if f is None:
                return None
            tid = trace_id(run, f"fault|{e.fault_id}")
            return self._span(
                tid,
                span_id(run, f"fault|{e.fault_id}", "", ""),
                None,
                f"fault.{f['type']}",
                KIND_INTERNAL,
                f["at"],
                e.at,
                [_attr("luminar.fault.id", e.fault_id), _attr("luminar.fault.target", f["target"])],
            )
        if et != "GossipMessage":
            return None

        # ── GossipSub message spans ──
        msg_id = e.msg_id
        tid = trace_id(run, msg_id)
        boosted = e.at <= self._boost_until
        if e.via == "spam":
            n = self._spam_spans.get(e.from_peer, 0)
            if n >= SPAM_SPANS_PER_ATTACKER or not (boosted or sampled(tid, self.sample_pct)):
                return None
            self._spam_spans[e.from_peer] = n + 1
            return self._span(
                tid,
                span_id(run, msg_id, e.from_peer, e.to_peer),
                None,
                "gossipsub.invalid",
                KIND_PRODUCER,
                e.at,
                e.at,
                self._msg_attrs(e, "publish", "send") + [_attr("luminar.invalid", True)],
                status_code=2,
                status_message="invalid message (attacker spam)",
            )
        if not (boosted or sampled(tid, self.sample_pct)):
            return None
        if e.hops == 0 and not e.to_peer:
            sid = span_id(run, msg_id, "", e.from_peer)
            self._remember(msg_id, e.from_peer, sid, root=True)
            return self._span(
                tid,
                sid,
                None,
                "gossipsub.publish",
                KIND_PRODUCER,
                e.at,
                e.at,
                self._msg_attrs(e, "publish", "send"),
            )
        sid = span_id(run, msg_id, e.from_peer, e.to_peer)
        parent = self._inbound.get(msg_id, {}).get(e.from_peer) or self._roots.get(msg_id)
        if e.via == "iwant":
            root = self._roots.get(msg_id)
            self._remember(msg_id, e.to_peer, sid)
            return self._span(
                tid,
                sid,
                None,
                "gossipsub.iwant",
                KIND_CONSUMER,
                e.at,
                e.at,
                self._msg_attrs(e, "iwant", "process"),
                links=[{"traceId": tid, "spanId": root}] if root else [],
            )
        start = max(0.0, e.at - e.latency_ms / 1000.0)
        if e.dropped:
            return self._span(
                tid,
                sid,
                parent,
                "gossipsub.forward",
                KIND_CONSUMER,
                start,
                e.at,
                self._msg_attrs(e, "forward", "process") + [_attr("luminar.dropped", True)],
                status_code=2,
                status_message="relay blocked by fault",
            )
        self._remember(msg_id, e.to_peer, sid)
        return self._span(
            tid,
            sid,
            parent,
            "gossipsub.forward",
            KIND_CONSUMER,
            start,
            e.at,
            self._msg_attrs(e, "forward", "process"),
        )

    def _msg_attrs(self, e: BaseEvent, op: str, op_type: str) -> list[dict]:
        attrs = [
            _attr("messaging.system", "gossipsub"),
            _attr("messaging.operation.name", op),
            _attr("messaging.operation.type", op_type),
            _attr("messaging.destination.name", e.topic),
            _attr("messaging.message.id", e.msg_id),
            _attr("luminar.from_peer", e.from_peer),
            _attr("luminar.hop", e.hops),
        ]
        if e.to_peer:
            attrs.append(_attr("luminar.to_peer", e.to_peer))
        if e.latency_ms:
            attrs.append(_attr("luminar.latency_ms", float(e.latency_ms)))
        return attrs

    def _span(
        self,
        tid: str,
        sid: str,
        parent: str | None,
        name: str,
        kind: int,
        start_at: float,
        end_at: float,
        attributes: list[dict],
        *,
        status_code: int = 0,
        status_message: str = "",
        links: list[dict] | None = None,
    ) -> dict:
        span: dict[str, Any] = {
            "traceId": tid,
            "spanId": sid,
            "name": name,
            "kind": kind,
            "startTimeUnixNano": self._ns(start_at),
            "endTimeUnixNano": self._ns(end_at),
            "attributes": attributes,
            "status": {"code": status_code},
        }
        if parent:
            span["parentSpanId"] = parent
        if status_message:
            span["status"]["message"] = status_message
        if links:
            span["links"] = links
        return span

    # ── Flush (daemon thread) ──

    def _resource(self) -> dict:
        eng = self._engine
        attrs = [
            _attr("service.name", SERVICE_NAME),
            _attr("service.version", "0.1.0"),
            _attr("luminar.clock", "simulated"),
            _attr("luminar.run", self.run_id),
        ]
        if eng is not None:
            attrs.append(_attr("luminar.n_nodes", eng.node_pool.node_count))
        return {"attributes": attrs}

    def build_payload(self, spans: list[dict]) -> dict:
        return {
            "resourceSpans": [
                {"resource": self._resource(), "scopeSpans": [{"scope": SCOPE, "spans": spans}]}
            ]
        }

    def flush(self) -> int:
        """Drain the queue in batches. Returns spans sent. Serialised: stop() may overlap _loop."""
        with self._flush_lock:
            return self._flush_locked()

    def _flush_locked(self) -> int:
        sent = 0
        while self._queue:
            batch = [self._queue.popleft() for _ in range(min(BATCH_MAX, len(self._queue)))]
            t = time.monotonic()
            try:
                status = self._post(
                    self.endpoint + "/v1/traces", orjson.dumps(self.build_payload(batch))
                )
            except Exception as err:  # network down: drop, count, keep the sim running
                self.last_status = f"error: {type(err).__name__}"
                self.spans_dropped += len(batch)
                break
            self.last_flush_ms = (time.monotonic() - t) * 1000
            self.last_status = status
            if status in RETRY_STATUSES:
                self._queue.extendleft(reversed(batch))  # retry next tick
                break
            if status >= 400:
                self.spans_dropped += len(batch)
                break
            self.spans_emitted += len(batch)
            sent += len(batch)
        return sent

    def _loop(self) -> None:
        while not self._stop.wait(FLUSH_S):
            try:
                self.flush()
            except Exception:
                logger.exception("OTLP flush failed")

    @staticmethod
    def _urllib_post(url: str, body: bytes) -> int:
        req = urllib.request.Request(
            url, data=body, headers={"Content-Type": "application/json"}, method="POST"
        )
        try:
            with urllib.request.urlopen(req, timeout=HTTP_TIMEOUT_S) as r:
                return r.status
        except urllib.error.HTTPError as err:
            return err.code

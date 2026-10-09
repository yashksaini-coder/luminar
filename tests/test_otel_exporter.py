"""Tests for the OTLP/JSON trace exporter (no network: HTTP POST is stubbed)."""

import orjson
import trio

from backend.events.types import (
    FaultCleared,
    FaultInjected,
    GossipMessage,
    ScenarioPhaseFired,
)
from backend.otel.exporter import OtlpTraceExporter
from backend.otel.ids import span_id, trace_id
from backend.simulation.engine import SimulationEngine

TOPIC = "lumina/blocks/1.0"


def _engine(n=4):
    eng = SimulationEngine(n_nodes=n)
    eng.wire_topology([(f"peer-{i}", f"peer-{(i + 1) % n}") for i in range(n)], {})
    return eng


def _exporter(engine, pct=100):
    posts: list[dict] = []

    def post(url, body):
        posts.append({"url": url, "body": orjson.loads(body)})
        return 200

    ex = OtlpTraceExporter("http://jaeger:4318/", sample_pct=pct, http_post=post)
    ex.attach(engine)
    return ex, posts


async def _emit_message_chain(engine):
    bus = engine.event_bus
    await bus.emit(GossipMessage(at=1.0, topic=TOPIC, from_peer="peer-0", msg_id="msg-1", hops=0))
    await bus.emit(
        GossipMessage(
            at=1.02,
            topic=TOPIC,
            from_peer="peer-0",
            to_peer="peer-1",
            msg_id="msg-1",
            hops=1,
            latency_ms=20,
        )
    )
    await bus.emit(
        GossipMessage(
            at=1.05,
            topic=TOPIC,
            from_peer="peer-1",
            to_peer="peer-2",
            msg_id="msg-1",
            hops=2,
            latency_ms=30,
        )
    )
    await bus.emit(
        GossipMessage(
            at=1.03,
            topic=TOPIC,
            from_peer="peer-0",
            to_peer="peer-3",
            msg_id="msg-1",
            hops=1,
            dropped=True,
        )
    )


def test_spans_form_a_tree_with_otlp_json_shape():
    engine = _engine()
    ex, posts = _exporter(engine)
    trio.run(_emit_message_chain, engine)
    assert ex.flush() == 4 and len(posts) == 1
    assert posts[0]["url"] == "http://jaeger:4318/v1/traces"

    rs = posts[0]["body"]["resourceSpans"][0]
    res_attrs = {a["key"]: a["value"] for a in rs["resource"]["attributes"]}
    assert res_attrs["service.name"] == {"stringValue": "luminar-sim"}
    assert res_attrs["luminar.run"] == {"stringValue": engine.run_id}
    scope = rs["scopeSpans"][0]
    assert scope["scope"]["name"] == "luminar.gossipsub"
    spans = {s["name"] + ":" + s["spanId"]: s for s in scope["spans"]}
    assert len(spans) == 4

    run = engine.run_id
    tid = trace_id(run, "msg-1")
    root_id = span_id(run, "msg-1", "", "peer-0")
    hop1 = span_id(run, "msg-1", "peer-0", "peer-1")
    hop2 = span_id(run, "msg-1", "peer-1", "peer-2")
    drop = span_id(run, "msg-1", "peer-0", "peer-3")
    root = spans[f"gossipsub.publish:{root_id}"]
    assert root["traceId"] == tid and "parentSpanId" not in root and root["kind"] == 4
    assert spans[f"gossipsub.forward:{hop1}"]["parentSpanId"] == root_id
    assert spans[f"gossipsub.forward:{hop2}"]["parentSpanId"] == hop1  # sender's inbound span
    d = spans[f"gossipsub.forward:{drop}"]
    assert d["status"]["code"] == 2 and d["parentSpanId"] == root_id

    # OTLP/JSON encoding details: hex ids, nanos as strings, start = end - latency
    assert len(root["traceId"]) == 32 and len(hop1) == 16
    h1 = spans[f"gossipsub.forward:{hop1}"]
    assert isinstance(h1["startTimeUnixNano"], str)
    assert int(h1["endTimeUnixNano"]) - int(h1["startTimeUnixNano"]) == 20_000_000
    assert int(root["startTimeUnixNano"]) == engine.t0_wall_ns + 1_000_000_000
    attrs = {a["key"]: a["value"] for a in h1["attributes"]}
    assert attrs["messaging.system"] == {"stringValue": "gossipsub"}
    assert attrs["messaging.operation.name"] == {"stringValue": "forward"}
    assert attrs["messaging.operation.type"] == {"stringValue": "process"}
    assert attrs["messaging.message.id"] == {"stringValue": "msg-1"}
    assert attrs["luminar.hop"] == {"intValue": "1"}


def test_run_id_scopes_trace_ids_and_reattach_survives_reconfigure():
    engine = _engine()
    ex, posts = _exporter(engine)
    run1 = engine.run_id
    trio.run(engine.reset)  # new run → different trace id for the same msg_id
    assert engine.run_id != run1
    assert trace_id(run1, "msg-1") != trace_id(engine.run_id, "msg-1")

    fresh = _engine()
    ex.attach(fresh)
    assert ex.sink in fresh.event_bus.sinks
    assert ex.run_id == fresh.run_id


def test_sampling_boosts_to_100pct_after_a_phase():
    engine = _engine()
    ex, posts = _exporter(engine, pct=0)

    async def run():
        bus = engine.event_bus
        await bus.emit(
            GossipMessage(at=1.0, topic=TOPIC, from_peer="peer-0", msg_id="msg-1", hops=0)
        )
        await bus.emit(
            ScenarioPhaseFired(
                at=2.0, scenario_id="demo", phase_idx=0, label="x", action="inject_sybil"
            )
        )
        await bus.emit(
            GossipMessage(at=3.0, topic=TOPIC, from_peer="peer-0", msg_id="msg-2", hops=0)
        )
        await bus.emit(
            GossipMessage(at=9.0, topic=TOPIC, from_peer="peer-0", msg_id="msg-3", hops=0)
        )

    trio.run(run)
    names = sorted(s["name"] for s in ex._queue)
    assert names == [
        "gossipsub.publish",
        "scenario.inject_sybil",
    ]  # msg-1 unsampled, msg-3 after boost


def test_fault_span_and_retry_then_drop():
    engine = _engine()
    statuses = iter([503, 200, 500])
    posts = []

    def post(url, body):
        posts.append(body)
        return next(statuses)

    ex = OtlpTraceExporter("http://x", sample_pct=100, http_post=post)
    ex.attach(engine)

    async def run():
        bus = engine.event_bus
        await bus.emit(
            FaultInjected(at=1.0, fault_type="sybil", target=TOPIC, params={"fault_id": "f1"})
        )
        await bus.emit(FaultCleared(at=5.0, fault_id="f1", fault_type="sybil"))

    trio.run(run)
    assert ex.flush() == 0 and ex.last_status == 503 and len(ex._queue) == 1  # retried
    assert ex.flush() == 1 and ex.spans_emitted == 1
    span = orjson.loads(posts[-1])["resourceSpans"][0]["scopeSpans"][0]["spans"][0]
    assert span["name"] == "fault.sybil"
    assert int(span["endTimeUnixNano"]) - int(span["startTimeUnixNano"]) == 4_000_000_000

    trio.run(run)
    assert ex.flush() == 0 and ex.spans_dropped == 1 and ex.last_status == 500


def test_sink_errors_never_reach_the_bus():
    engine = _engine()
    bad = OtlpTraceExporter("http://x", http_post=lambda u, b: 200)
    bad._build = lambda e: 1 / 0  # type: ignore[assignment]
    engine.event_bus.sinks.append(bad.sink)
    trio.run(_emit_message_chain, engine)
    assert bad.sink_errors == 4 and engine.event_bus.sink_errors == 0

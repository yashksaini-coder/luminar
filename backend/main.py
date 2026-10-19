"""Luminar P2P — FastAPI entrypoint.

Serves the REST API and WebSocket event stream.
The simulation runs in a background trio thread; the API server uses asyncio (uvicorn default).
Communication between the two happens via thread-safe queues and shared state.
"""

from __future__ import annotations

import asyncio
import hmac
import io
import logging
import os
import threading
from contextlib import asynccontextmanager

import orjson
import trio
from fastapi import FastAPI, HTTPException, Request, Response, WebSocket, WebSocketDisconnect
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, ConfigDict, Field

from backend.events.recorder import ReelRecorder
from backend.fault.injector import FaultInjector
from backend.live.mainnet import MainnetFeed
from backend.metrics.collector import MetricsCollector
from backend.otel.exporter import OtlpTraceExporter
from backend.otel.ids import trace_id as otel_trace_id
from backend.otel.metrics import GossipMetrics
from backend.scenarios.library import SCENARIOS
from backend.scenarios.runner import ScenarioRunner
from backend.simulation.engine import SimulationEngine
from backend.telemetry.manager import TelemetryManager
from backend.telemetry.models import TelemetryPayload
from backend.topology.manager import TopologyConfig, TopologyManager

logging.basicConfig(
    level=os.environ.get("LUMINAR_LOG_LEVEL", "INFO").upper(),
    format="%(asctime)s %(name)s %(levelname)s %(message)s",
)
logger = logging.getLogger(__name__)

# Global simulation state
engine: SimulationEngine | None = None
fault_injector: FaultInjector | None = None
metrics_collector: MetricsCollector | None = None
topology_manager = TopologyManager()
scenario_runner = ScenarioRunner()
telemetry_manager = TelemetryManager()
mainnet_feed = MainnetFeed()
gossip_metrics = GossipMetrics()
# OTel-out is opt-in: set OTEL_EXPORTER_OTLP_ENDPOINT (e.g. http://localhost:4318) to enable.
_otlp_endpoint = os.environ.get("OTEL_EXPORTER_OTLP_ENDPOINT") or os.environ.get(
    "LUMINAR_OTLP_ENDPOINT"
)
otlp_exporter: OtlpTraceExporter | None = (
    OtlpTraceExporter(_otlp_endpoint, int(os.environ.get("LUMINAR_OTLP_TRACE_PCT", "5")))
    if _otlp_endpoint
    else None
)
_trio_token: trio.lowlevel.TrioToken | None = None
_initial_edges: list[tuple[str, str]] = []
_sim_cancel_scope: trio.CancelScope | None = None
_sim_thread: threading.Thread | None = None
_launch_gen = 0  # bumped on every scenario launch/clear so WS clients get a fresh scenario frame
# One global lock: reconfigure is a whole-process teardown, so serialising it is the point
_reconfigure_lock = asyncio.Lock()


def _run_simulation_in_trio(
    engine_ref: SimulationEngine,
    fault_ref: FaultInjector,
    started_event: threading.Event,
) -> None:
    """Run the simulation engine inside a trio event loop on a background thread."""

    async def _main():
        global _trio_token, _sim_cancel_scope
        _trio_token = trio.lowlevel.current_trio_token()
        async with trio.open_nursery() as nursery:
            _sim_cancel_scope = nursery.cancel_scope
            await engine_ref.start(nursery)
            started_event.set()
            logger.info("Trio simulation loop running")
            # Scenario runner watches sim clock and fires timed fault phases
            nursery.start_soon(scenario_runner.run, engine_ref.clock, fault_ref)
            await trio.sleep_forever()

    trio.run(_main)


def _build_simulation(n_nodes: int) -> None:
    """Create and wire a fresh simulation with the given node count."""
    global engine, fault_injector, metrics_collector, _initial_edges

    engine = SimulationEngine(n_nodes=n_nodes)
    fault_injector = FaultInjector(engine.event_bus, engine.clock, engine.node_pool)
    metrics_collector = MetricsCollector(engine.event_bus, engine.node_pool)
    engine.node_pool.gossip._fault_injector = fault_injector
    # Observability sinks live on the bus, so a reconfigure (fresh bus) must re-attach them
    engine.event_bus.sinks.append(gossip_metrics.sink)
    gossip_metrics.active_faults = 0  # the old injector's faults vanish without FaultCleared
    if otlp_exporter is not None:
        otlp_exporter.attach(engine)

    # Scale edge probability so larger networks aren't fully connected
    p = max(0.08, min(0.4, 6.0 / n_nodes))
    config = TopologyConfig(topo_type="random", n_nodes=n_nodes, p=p)
    graph = topology_manager.generate(config)
    edges = topology_manager.graph_to_edges(graph)
    _initial_edges = edges
    positions = topology_manager.graph_layout(graph)
    engine.wire_topology(edges, positions)


def _start_sim_thread() -> None:
    """Spawn a new trio simulation thread from the current engine globals."""
    global _sim_thread
    started = threading.Event()
    _sim_thread = threading.Thread(
        target=_run_simulation_in_trio,
        args=(engine, fault_injector, started),
        daemon=True,
        name="trio-simulation",
    )
    _sim_thread.start()
    started.wait(timeout=10)


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _sim_thread

    n_nodes = int(os.environ.get("LUMINAR_NODE_COUNT", os.environ.get("LUMINA_NODE_COUNT", 20)))
    _build_simulation(n_nodes)
    _start_sim_thread()
    telemetry_manager.start()
    mainnet_feed.emit = _emit_from_asyncio
    mainnet_feed.sim_time = lambda: engine.clock.time if engine else 0.0
    if os.environ.get("LUMINAR_MAINNET_FEED") == "1":
        mainnet_feed.start()
    if otlp_exporter is not None:
        otlp_exporter.start()
        logger.info("OTLP trace export → %s", otlp_exporter.endpoint)
    logger.info("Luminar P2P ready — %d nodes, %d edges", n_nodes, len(_initial_edges))

    yield

    telemetry_manager.stop()
    mainnet_feed.stop()
    if otlp_exporter is not None:
        otlp_exporter.stop()
    engine.clock.stop()


app = FastAPI(title="Luminar P2P Simulator", version="0.1.0", lifespan=lifespan)

# Admin gate: when LUMINAR_ADMIN_TOKEN is set, every mutating request (and the telemetry
# WS) must carry it; unset (the laptop default) leaves the API fully open as before.
_ADMIN_TOKEN = os.environ.get("LUMINAR_ADMIN_TOKEN", "")


def _token_ok(token: str | None) -> bool:
    return not _ADMIN_TOKEN or hmac.compare_digest((token or "").encode(), _ADMIN_TOKEN.encode())


def _ws_token_ok(ws: WebSocket) -> bool:
    """Admin token for WebSocket handshakes: header only, so it never lands in URL/access logs.
    Browsers cannot set WS headers, which is fine: the UI never records and never ingests."""
    return _token_ok(ws.headers.get("x-luminar-token"))


@app.middleware("http")
async def _admin_gate(request: Request, call_next):
    if request.method not in ("GET", "HEAD", "OPTIONS") and not _token_ok(
        request.headers.get("x-luminar-token")
    ):
        return Response(
            b'{"detail":"X-Luminar-Token required"}', status_code=403, media_type="application/json"
        )
    return await call_next(request)


app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(RequestValidationError)
async def _validation_error(_request, exc: RequestValidationError) -> Response:
    """FastAPI's default 422 body is json.dumps'd and raises when the rejected input is
    inf/nan (e.g. `"ms": 1e400`), turning the rejection into a 500; orjson emits null."""
    body = orjson.dumps({"detail": jsonable_encoder(exc.errors())})
    return Response(body, status_code=422, media_type="application/json")


# --- WebSocket ---


@app.websocket("/ws/events")
async def websocket_events(ws: WebSocket):
    """Multiplexed WebSocket: streams events, snapshots, metrics, and analytics.

    Message format: JSON with a "type" field:
      - {"type": "event", ...event_fields}     — individual simulation events
      - {"type": "snapshot", ...snapshot_data}  — full sim state (every 500ms)
      - {"type": "metrics", ...metrics_data}    — aggregated metrics (every 2s)
      - {"type": "analytics", ...analytics}     — gossip analytics (every 2s)
    """
    if engine is None or metrics_collector is None:
        await ws.close(code=1013)
        return
    await ws.accept()
    # ?record=<name> appends every frame this client sees to recordings/<name>.jsonl (a reel)
    # Recording writes unbounded files to disk, so it is off unless LUMINAR_ALLOW_RECORD=1
    # (never set it on a public deploy).
    recorder = (
        ReelRecorder.open_if_valid(ws.query_params.get("record"))
        if os.environ.get("LUMINAR_ALLOW_RECORD") == "1" and _ws_token_ok(ws)
        else None
    )
    logger.info("WS client connected%s", f" (recording {recorder.path})" if recorder else "")

    async def send(frame: dict, *, text: bool = False) -> None:
        if text:
            await ws.send_text(orjson.dumps(frame).decode())
        else:
            await ws.send_bytes(orjson.dumps(frame))
        if recorder:
            recorder.write(frame)

    last_event_count = 0
    tick_counter = 0  # counts 50ms ticks
    last_edges: object = None
    last_launch_gen = -1  # always behind _launch_gen on connect → first frame is unconditional
    # Live clients get the newest 200 events per tick (UI can't show more); a recording
    # must be complete, so it takes the full delta and never silently drops.
    event_cap = 1_000_000 if recorder else 200

    try:
        while True:
            tick_counter += 1

            # ── Topology / scenario frames, on change (and once on connect) ──
            if _initial_edges is not last_edges:
                last_edges = _initial_edges
                await send({"type": "edges", "edges": _initial_edges})
            if _launch_gen != last_launch_gen:
                last_launch_gen = _launch_gen
                await send({"type": "scenario", **scenario_runner.get_status()})

            # ── Events (every tick, 20Hz) ──
            current_count = engine.event_bus.event_count
            if current_count < last_event_count:
                last_event_count = 0  # bus was cleared (reset / scenario launch) — resync
            if current_count > last_event_count:
                delta = current_count - last_event_count
                try:
                    snapshot = list(engine.event_bus.ring)
                    new_events = snapshot[-min(delta, event_cap) :]
                except RuntimeError:
                    new_events = []  # deque mutated during iteration
                if delta > event_cap:
                    await send({"type": "gap", "dropped": delta - event_cap})
                for event in new_events:
                    await send(event.to_dict(), text=True)
                last_event_count = current_count

            # ── Snapshot (every 10 ticks = 500ms) ──
            if tick_counter % 10 == 0:
                snap = engine.get_snapshot()
                snap["type"] = "snapshot"
                # Nothing in the UI reads per-snapshot traces (/api/trace/* serves them) and
                # they are ~60% of a reel's bytes, so the WS frame omits them.
                snap["gossip"].pop("recent_traces", None)
                _merge_real_peers(snap)
                await send(snap)

            # ── Metrics + Analytics (every 40 ticks = 2s) ──
            if tick_counter % 40 == 0:
                try:
                    metrics = metrics_collector.get_snapshot()
                    metrics["type"] = "metrics"
                    await send(metrics)
                except Exception:
                    pass  # metrics can fail during race conditions

                try:
                    analytics = engine.node_pool.gossip.get_analytics("lumina/blocks/1.0")
                    analytics["type"] = "analytics"
                    await send(analytics)
                except Exception:
                    pass

                try:
                    telem_status = telemetry_manager.get_status()
                    telem_status["type"] = "telemetry_status"
                    telem_status["mainnet"] = mainnet_feed.get_status()
                    telem_status["otel"] = (
                        otlp_exporter.status() if otlp_exporter else {"enabled": False}
                    )
                    await send(telem_status)
                except Exception:
                    pass

            await asyncio.sleep(0.05)  # 20Hz base rate
    except WebSocketDisconnect:
        logger.info("WS client disconnected")
    except Exception:
        logger.exception("WS handler error")
    finally:
        if recorder:
            recorder.close()
            logger.info("Reel %s: %d frames", recorder.path, recorder.frames)


# --- Simulation Control ---


@app.post("/api/sim/play")
async def sim_play():
    if engine is None:
        raise HTTPException(status_code=503, detail="Simulation not initialized")
    engine.clock.play()
    return {"state": engine.state}


@app.post("/api/sim/pause")
async def sim_pause():
    if engine is None:
        raise HTTPException(status_code=503, detail="Simulation not initialized")
    engine.clock.pause()
    return {"state": engine.state}


async def _reset_run() -> None:
    """Fresh run on the existing pool: clear faults, restart clock/bus/gossip, re-mesh at t=0.

    clear_all runs on the trio thread (it emits FaultCleared and strips attacker ids from
    meshes); the clock/bus reset afterwards so those events do not linger in the new run.
    """
    loop = asyncio.get_running_loop()
    await loop.run_in_executor(None, lambda: _run_trio_coro(fault_injector.clear_all))
    engine.clock.reset()
    engine.event_bus.clear()
    engine.node_pool.gossip.reset()
    engine.node_pool.reset()
    engine.node_pool.wire_topology(_initial_edges)  # re-graft every mesh member at t=0
    engine.new_run()  # fresh trace-id scope for the exporter
    if otlp_exporter is not None:
        otlp_exporter.on_new_run()  # sim clock restarted: drop the phase sampling boost


@app.post("/api/sim/reset")
async def sim_reset():
    if engine is None or fault_injector is None:
        raise HTTPException(status_code=503, detail="Simulation not initialized")
    await _reset_run()
    return {"state": engine.state}


class ReconfigureRequest(BaseModel):
    n_nodes: int = 20


@app.post("/api/sim/reconfigure")
async def sim_reconfigure(req: ReconfigureRequest):
    """Tear down the current simulation and restart with a new node count."""
    global _sim_thread, _sim_cancel_scope, _trio_token, _launch_gen

    n = max(2, min(500, req.n_nodes))
    loop = asyncio.get_running_loop()

    async with _reconfigure_lock:
        # Capture locally: the executor lambda must not read a global a later call replaced
        scope, token, thread = _sim_cancel_scope, _trio_token, _sim_thread
        if scope is not None and token is not None:
            try:
                await loop.run_in_executor(
                    None, lambda: trio.from_thread.run_sync(scope.cancel, trio_token=token)
                )
            except Exception as exc:
                logger.warning("Error cancelling trio nursery: %s", exc)

        # Wait for the old thread to stop (max 5 s) without blocking the asyncio loop
        if thread and thread.is_alive():
            await loop.run_in_executor(None, thread.join, 5)
        _sim_cancel_scope = None

        # Clear active scenario before rebuilding
        scenario_runner.set_scenario(None)
        _launch_gen += 1

        # Rebuild simulation with new node count and start fresh trio thread
        _build_simulation(n)
        _start_sim_thread()
        logger.info("Reconfigured: %d nodes, %d edges", n, len(_initial_edges))
        return {"n_nodes": n, "edge_count": len(_initial_edges)}


class SpeedRequest(BaseModel):
    speed: float


@app.post("/api/sim/speed")
async def sim_speed(req: SpeedRequest):
    if engine is None:
        raise HTTPException(status_code=503, detail="Simulation not initialized")
    engine.clock.speed = req.speed
    return {"speed": engine.clock.speed}


class SeekRequest(BaseModel):
    time: float


@app.post("/api/sim/seek")
async def sim_seek(req: SeekRequest):
    if engine is None:
        raise HTTPException(status_code=503, detail="Simulation not initialized")
    engine.clock.seek(req.time)
    return {"time": engine.clock.time}


def _merge_real_peers(snap: dict) -> dict:
    """Append telemetry peers and mainnet observers; node_count stays the simulated pool."""
    telem = telemetry_manager.get_nodes_as_peer_dicts()
    live = mainnet_feed.get_nodes_as_peer_dicts()
    if telem or live:
        snap["nodes"] = snap["nodes"] + telem + live
        snap["telemetry_count"] = len(telem)
        snap["observer_count"] = len(live)
    return snap


@app.get("/api/sim/snapshot")
async def sim_snapshot():
    if engine is None:
        raise HTTPException(status_code=503, detail="Simulation not initialized")
    return _merge_real_peers(engine.get_snapshot())


# --- Nodes ---


@app.get("/api/nodes")
async def get_nodes():
    if engine is None:
        raise HTTPException(status_code=503, detail="Simulation not initialized")
    return {"nodes": engine.node_pool.get_all_status()}


@app.get("/api/nodes/{peer_id}")
async def get_node(peer_id: str):
    if engine is None:
        raise HTTPException(status_code=503, detail="Simulation not initialized")
    node = engine.node_pool.get_node(peer_id)
    if node is None:
        return {"error": "not found"}
    return node.to_dict()


# --- Topology ---


@app.get("/api/topology/list")
async def topology_list():
    return {"types": TopologyManager.SUPPORTED_TYPES}


class TopologyRequest(BaseModel):
    topo_type: str = "random"
    n_nodes: int = Field(20, ge=2, le=500)  # same ceiling as /api/sim/reconfigure
    p: float = Field(0.15, ge=0.0, le=1.0)
    m: int = Field(3, ge=1, le=500)
    n_clusters: int = Field(3, ge=1, le=500)  # 0 -> ZeroDivisionError in _clustered
    intra_p: float = Field(0.3, ge=0.0, le=1.0)
    inter_p: float = Field(0.01, ge=0.0, le=1.0)


def _topology_config(req: TopologyRequest) -> TopologyConfig:
    if req.topo_type not in TopologyManager.SUPPORTED_TYPES:
        raise HTTPException(status_code=400, detail=f"Unknown topology: {req.topo_type}")
    return TopologyConfig(**req.model_dump())


def _build_topology(config: TopologyConfig, layout: bool):
    """Worker-thread helper: networkx is seconds of CPU at 500 nodes; keep it off the loop."""
    graph = topology_manager.generate(config)
    edges = topology_manager.graph_to_edges(graph)
    positions = topology_manager.graph_layout(graph) if layout else {}
    return edges, positions, topology_manager.compute_metrics(graph)


@app.post("/api/topology/apply")
async def topology_apply(req: TopologyRequest):
    global _initial_edges
    if engine is None:
        raise HTTPException(status_code=503, detail="Simulation not initialized")
    config = _topology_config(req)
    config.n_nodes = engine.node_pool.node_count  # topology must match the live pool
    loop = asyncio.get_running_loop()
    edges, positions, metrics = await loop.run_in_executor(None, _build_topology, config, True)

    # Actually rewire the live simulation
    engine.wire_topology(edges, positions)
    _initial_edges = edges

    return {
        "edges": edges,
        "positions": {k: {"x": v[0], "y": v[1]} for k, v in positions.items()},
        "node_count": config.n_nodes,
        "edge_count": len(edges),
        "metrics": metrics,
    }


@app.post("/api/topology/preview")
async def topology_preview(req: TopologyRequest):
    """Generate topology and return metrics without applying to the live simulation."""
    config = _topology_config(req)
    loop = asyncio.get_running_loop()
    edges, _, metrics = await loop.run_in_executor(None, _build_topology, config, False)
    return {
        "node_count": config.n_nodes,
        "edge_count": len(edges),
        "metrics": metrics,
    }


@app.get("/api/topology/metrics")
async def topology_metrics():
    """Return metrics for the currently active topology."""
    import networkx as nx

    if engine is None:
        raise HTTPException(status_code=503, detail="Simulation not initialized")
    # Rebuild graph from current edges
    g = nx.Graph()
    for a, b in _initial_edges:
        try:
            u = int(a.replace("peer-", ""))
            v = int(b.replace("peer-", ""))
            g.add_edge(u, v)
        except ValueError:
            continue  # Skip sybil/eclipse node IDs
    # Add isolated nodes
    for i in range(engine.node_pool.node_count):
        g.add_node(i)
    metrics = topology_manager.compute_metrics(g)
    return {"metrics": metrics}


# --- Fault Injection ---
#
# Fault methods are trio-async but we run on asyncio. Since the fault injector
# manipulates shared state (thread-safe enough for our single-writer model)
# we use a sync wrapper: mutate state directly, emit events via a helper.


async def _emit_from_asyncio(event) -> None:
    """Publish an event on the simulation bus from the asyncio side (live feeds)."""
    if engine is None or _trio_token is None:
        return
    loop = asyncio.get_running_loop()
    bus = engine.event_bus
    await loop.run_in_executor(None, lambda: _run_trio_coro(bus.emit, event))


def _run_trio_coro(async_fn, *args):
    """Run a trio-async fault method from the asyncio thread.

    We exploit the fact that FaultInjector methods only do sync mutations +
    EventBus.emit(). The emit just appends to a deque and sends on trio channels.

    IMPORTANT: Pass the async function and its arguments separately — do NOT call
    the function first (that creates a coroutine object, which trio rejects).
    """
    global _trio_token
    if _trio_token is not None:
        import trio

        return trio.from_thread.run(async_fn, *args, trio_token=_trio_token)
    return None


class LatencyRequest(BaseModel):
    # NaN here reaches trio.sleep(nan) in the relay task and kills the simulation thread
    model_config = ConfigDict(allow_inf_nan=False)
    peer_a: str
    peer_b: str
    ms: float = Field(ge=0, le=60_000)
    jitter_ms: float = Field(default=0.0, ge=0, le=60_000)


@app.post("/api/fault/latency")
async def fault_latency(req: LatencyRequest):
    if fault_injector is None:
        raise HTTPException(status_code=503, detail="Simulation not initialized")
    loop = asyncio.get_running_loop()
    fault_id = await loop.run_in_executor(
        None,
        lambda: _run_trio_coro(
            fault_injector.inject_latency,
            req.peer_a,
            req.peer_b,
            req.ms,
            req.jitter_ms,
        ),
    )
    return {"ok": True, "fault_id": fault_id}


class PartitionRequest(BaseModel):
    group_a: list[str]
    group_b: list[str]


@app.post("/api/fault/partition")
async def fault_partition(req: PartitionRequest):
    if fault_injector is None:
        raise HTTPException(status_code=503, detail="Simulation not initialized")
    loop = asyncio.get_running_loop()
    fault_id = await loop.run_in_executor(
        None,
        lambda: _run_trio_coro(fault_injector.inject_partition, req.group_a, req.group_b),
    )
    return {"ok": True, "fault_id": fault_id}


class SybilRequest(BaseModel):
    n_attackers: int = Field(ge=1, le=50)
    target_topic: str = "lumina/blocks/1.0"


@app.post("/api/fault/sybil")
async def fault_sybil(req: SybilRequest):
    if fault_injector is None:
        raise HTTPException(status_code=503, detail="Simulation not initialized")
    loop = asyncio.get_running_loop()
    fault_id = await loop.run_in_executor(
        None,
        lambda: _run_trio_coro(fault_injector.inject_sybil, req.n_attackers, req.target_topic),
    )
    return {"ok": True, "fault_id": fault_id}


class EclipseRequest(BaseModel):
    target_peer_id: str
    n_attackers: int = Field(ge=1, le=50)


@app.post("/api/fault/eclipse")
async def fault_eclipse(req: EclipseRequest):
    if fault_injector is None:
        raise HTTPException(status_code=503, detail="Simulation not initialized")
    loop = asyncio.get_running_loop()
    fault_id = await loop.run_in_executor(
        None,
        lambda: _run_trio_coro(fault_injector.inject_eclipse, req.target_peer_id, req.n_attackers),
    )
    return {"ok": True, "fault_id": fault_id}


class DropPeerRequest(BaseModel):
    peer_id: str


@app.post("/api/fault/drop")
async def fault_drop(req: DropPeerRequest):
    if fault_injector is None:
        raise HTTPException(status_code=503, detail="Simulation not initialized")
    loop = asyncio.get_running_loop()
    fault_id = await loop.run_in_executor(
        None,
        lambda: _run_trio_coro(fault_injector.drop_peer, req.peer_id),
    )
    return {"ok": True, "fault_id": fault_id}


class ClearFaultRequest(BaseModel):
    fault_id: str


@app.post("/api/fault/clear")
async def fault_clear(req: ClearFaultRequest):
    if fault_injector is None:
        raise HTTPException(status_code=503, detail="Simulation not initialized")
    loop = asyncio.get_running_loop()
    cleared = await loop.run_in_executor(
        None,
        lambda: _run_trio_coro(fault_injector.clear_fault, req.fault_id),
    )
    return {"ok": cleared}


@app.post("/api/fault/clear-all")
async def fault_clear_all():
    if fault_injector is None:
        raise HTTPException(status_code=503, detail="Simulation not initialized")
    loop = asyncio.get_running_loop()
    count = await loop.run_in_executor(
        None,
        lambda: _run_trio_coro(fault_injector.clear_all),
    )
    return {"ok": True, "cleared": count}


@app.get("/api/fault/active")
async def fault_active():
    if fault_injector is None:
        raise HTTPException(status_code=503, detail="Simulation not initialized")
    return {"faults": fault_injector.get_active_faults()}


# --- Metrics ---


@app.get("/api/metrics/snapshot")
async def metrics_snapshot():
    if metrics_collector is None:
        raise HTTPException(status_code=503, detail="Simulation not initialized")
    return metrics_collector.get_snapshot()


# --- Events ---


@app.get("/api/events/recent")
async def events_recent(since: float = 0.0):
    if engine is None:
        raise HTTPException(status_code=503, detail="Simulation not initialized")
    events = engine.event_bus.events_since(since)
    return {"events": [e.to_dict() for e in events[-1000:]]}


# --- Gossip / Trace ---


@app.get("/api/gossip/mesh")
async def gossip_mesh():
    if engine is None:
        raise HTTPException(status_code=503, detail="Simulation not initialized")
    return {"mesh": engine.node_pool.gossip.get_mesh_state("lumina/blocks/1.0")}


@app.get("/api/gossip/scores")
async def gossip_scores():
    if engine is None:
        raise HTTPException(status_code=503, detail="Simulation not initialized")
    return {"scores": engine.node_pool.gossip.get_scores("lumina/blocks/1.0")}


@app.get("/api/gossip/scores/{peer_id}")
async def gossip_score_detail(peer_id: str):
    if engine is None:
        raise HTTPException(status_code=503, detail="Simulation not initialized")
    return engine.node_pool.gossip.get_score_detail("lumina/blocks/1.0", peer_id)


@app.get("/api/gossip/analytics")
async def gossip_analytics():
    if engine is None:
        raise HTTPException(status_code=503, detail="Simulation not initialized")
    return engine.node_pool.gossip.get_analytics("lumina/blocks/1.0")


@app.get("/api/trace/recent")
async def trace_recent(limit: int = 50):
    if engine is None:
        raise HTTPException(status_code=503, detail="Simulation not initialized")
    return {"traces": engine.node_pool.gossip.get_recent_traces(limit)}


class MainnetFeedRequest(BaseModel):
    enabled: bool


@app.get("/api/live/mainnet")
async def live_mainnet_status():
    return mainnet_feed.get_status()


@app.post("/api/live/mainnet")
async def live_mainnet_toggle(req: MainnetFeedRequest):
    """Opt in/out of the mainnet block-arrival feed (ethPandaOps public data, ~2.5 min lag)."""
    if req.enabled:
        mainnet_feed.start()
    else:
        mainnet_feed.stop()
    return mainnet_feed.get_status()


@app.get("/metrics", response_class=PlainTextResponse)
async def prometheus_metrics():
    """Prometheus text exposition (Lighthouse gossipsub metric names). Counters-only pre-boot."""
    body = gossip_metrics.render(engine, telemetry_manager.get_status().get("peer_count", 0))
    return PlainTextResponse(body, media_type="text/plain; version=0.0.4; charset=utf-8")


@app.get("/api/otel/status")
async def otel_status():
    if otlp_exporter is None:
        return {"enabled": False, "hint": "set OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318"}
    return otlp_exporter.status()


@app.get("/api/trace/{msg_id}")
async def trace_detail(msg_id: str):
    if engine is None:
        raise HTTPException(status_code=503, detail="Simulation not initialized")
    trace = engine.node_pool.gossip.get_trace(msg_id)
    if trace is None:
        return {"error": "trace not found"}
    trace["run_id"] = engine.run_id
    trace["trace_id"] = otel_trace_id(engine.run_id, msg_id)  # same derivation as the exporter
    return trace


@app.get("/api/topology/edges")
async def topology_edges():
    """Return current topology edges for the graph."""
    return {"edges": _initial_edges}


# --- Export ---


@app.get("/api/export/events")
async def export_events(format: str = "jsonl", since: float = 0.0):
    """Export simulation events as JSONL or JSON."""
    if engine is None:
        raise HTTPException(status_code=503, detail="Simulation not initialized")
    events = engine.event_bus.events_since(since)

    if format == "json":
        # Streamed like jsonl: a full 500k ring dumped to one list is ~500 MB peak RSS
        def generate_json():
            yield b"["
            for i, event in enumerate(events):
                if i:
                    yield b","
                yield event.to_json()
            yield b"]"

        return StreamingResponse(
            generate_json(),
            media_type="application/json",
            headers={"Content-Disposition": "attachment; filename=luminar-events.json"},
        )

    # Default: JSONL (one JSON object per line)
    def generate_jsonl():
        for event in events:
            yield event.to_json() + b"\n"

    return StreamingResponse(
        generate_jsonl(),
        media_type="application/x-ndjson",
        headers={"Content-Disposition": "attachment; filename=luminar-events.jsonl"},
    )


@app.get("/api/export/snapshot")
async def export_full_snapshot():
    """Export full simulation snapshot (state + topology + traces + metrics)."""
    if engine is None:
        raise HTTPException(status_code=503, detail="Simulation not initialized")
    if metrics_collector is None:
        raise HTTPException(status_code=503, detail="Simulation not initialized")

    snapshot = {
        "simulation": engine.get_snapshot(),
        "topology": {
            "edges": _initial_edges,
        },
        "traces": engine.node_pool.gossip.get_recent_traces(200),
        "metrics": metrics_collector.get_snapshot(),
        "gossip": {
            "scores": engine.node_pool.gossip.get_scores("lumina/blocks/1.0"),
            "analytics": engine.node_pool.gossip.get_analytics("lumina/blocks/1.0"),
            "mesh": engine.node_pool.gossip.get_mesh_state("lumina/blocks/1.0"),
        },
    }

    data = orjson.dumps(snapshot, option=orjson.OPT_INDENT_2)
    return StreamingResponse(
        io.BytesIO(data),
        media_type="application/json",
        headers={"Content-Disposition": "attachment; filename=luminar-snapshot.json"},
    )


# --- Scenarios ---


class LaunchScenarioRequest(BaseModel):
    speed: float = 1.0


@app.get("/api/scenarios")
async def list_scenarios():
    """List all pre-built simulation scenarios."""
    return {"scenarios": [s.to_dict() for s in SCENARIOS.values()]}


@app.post("/api/scenarios/{scenario_id}/launch")
async def launch_scenario(scenario_id: str, req: LaunchScenarioRequest | None = None):
    """Launch a pre-built scenario: reset sim, apply topology, start playback, arm phase runner."""
    if req is None:
        req = LaunchScenarioRequest()
    scenario = SCENARIOS.get(scenario_id)
    if not scenario:
        raise HTTPException(status_code=404, detail=f"Unknown scenario: {scenario_id}")

    if engine is None:
        raise HTTPException(status_code=503, detail="Simulation not initialized")
    if fault_injector is None:
        raise HTTPException(status_code=503, detail="Simulation not initialized")

    # 1. Fresh run (faults cleared, clock/bus/gossip reset); wire_topology below re-meshes
    #    again on the scenario topology.
    await _reset_run()

    # 3. Apply scenario topology
    topo_config = TopologyConfig(
        topo_type=scenario.topology_type,
        n_nodes=engine.node_pool.node_count,  # not a hard-coded 20: the pool may be 50/100
        **scenario.topology_params,
    )
    graph = topology_manager.generate(topo_config)
    edges = topology_manager.graph_to_edges(graph)
    positions = topology_manager.graph_layout(graph)
    engine.wire_topology(edges, positions)
    global _initial_edges
    _initial_edges = edges  # so /api/topology/edges and the WS edges frame follow the launch

    # 4. Arm scenario runner (sets active scenario, resets phase index)
    scenario_runner.set_scenario(scenario)
    global _launch_gen
    _launch_gen += 1

    # 5. Set speed and start playback
    engine.clock.speed = max(0.1, min(100.0, req.speed))
    engine.clock.play()

    logger.info("Scenario '%s' launched", scenario.name)
    return {
        "status": "launched",
        "scenario": scenario.to_dict(),
        "edges": edges,
        "positions": {k: list(v) for k, v in positions.items()},
    }


@app.get("/api/scenarios/active")
async def active_scenario():
    """Return the currently running scenario and its phase progress."""
    return scenario_runner.get_status()


# --- Telemetry Ingestion ---


@app.post("/api/telemetry/submit")
async def telemetry_submit(payload: TelemetryPayload):
    """Accept a telemetry payload from a real peer node."""
    await telemetry_manager.ingest(payload, _trio_token, engine.event_bus if engine else None)
    return {"ok": True}


@app.websocket("/ws/telemetry")
async def websocket_telemetry(ws: WebSocket):
    """WebSocket endpoint for persistent telemetry streams.

    Peers send JSON payloads and receive {"ok": true} acknowledgements.
    """
    if not _ws_token_ok(ws):
        await ws.close(code=1008)  # before accept() → HTTP 403 handshake
        return
    await ws.accept()
    logger.info("Telemetry WS peer connected")
    try:
        while True:
            text = await ws.receive_text()
            try:
                data = orjson.loads(text)
                payload = TelemetryPayload(**data)
                await telemetry_manager.ingest(
                    payload, _trio_token, engine.event_bus if engine else None
                )
                await ws.send_text('{"ok":true}')
            except Exception as exc:
                await ws.send_text(f'{{"ok":false,"error":{str(exc)!r}}}')
    except WebSocketDisconnect:
        logger.info("Telemetry WS peer disconnected")
    except Exception:
        logger.exception("Telemetry WS handler error")


@app.get("/api/telemetry/status")
async def telemetry_status():
    """Return current telemetry peer registry status."""
    return telemetry_manager.get_status()


@app.get("/api/telemetry/peers")
async def telemetry_peers():
    """Return the list of active telemetry peers."""
    return {"peers": telemetry_manager.get_status()["peers"]}


# --- SPA static files (must be last — catches all non-API routes) ---

_FRONTEND_DIST = os.path.join(os.path.dirname(__file__), "..", "frontend", "dist")
if os.path.isdir(_FRONTEND_DIST):
    app.mount("/", StaticFiles(directory=_FRONTEND_DIST, html=True), name="frontend")

"""Lumina P2P — FastAPI entrypoint.

Serves the REST API and WebSocket event stream.
The simulation runs in a background trio thread; the API server uses asyncio (uvicorn default).
Communication between the two happens via thread-safe queues and shared state.
"""

from __future__ import annotations

import asyncio
import logging
import os
import threading
from contextlib import asynccontextmanager

import trio
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from backend.fault.injector import FaultInjector
from backend.metrics.collector import MetricsCollector
from backend.scenarios.library import SCENARIOS
from backend.scenarios.runner import ScenarioRunner
from backend.simulation.engine import SimulationEngine
from backend.topology.manager import TopologyConfig, TopologyManager

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

# Global simulation state
engine: SimulationEngine | None = None
fault_injector: FaultInjector | None = None
metrics_collector: MetricsCollector | None = None
topology_manager = TopologyManager()
scenario_runner = ScenarioRunner()
_trio_token: trio.lowlevel.TrioToken | None = None
_initial_edges: list[tuple[str, str]] = []
_sim_cancel_scope: trio.CancelScope | None = None
_sim_thread: threading.Thread | None = None


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

    n_nodes = int(os.environ.get("LUMINA_NODE_COUNT", 20))
    _build_simulation(n_nodes)
    _start_sim_thread()
    logger.info("Lumina P2P ready — %d nodes, %d edges", n_nodes, len(_initial_edges))

    yield

    engine.clock.stop()


app = FastAPI(title="Lumina P2P Simulator", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# --- WebSocket ---

@app.websocket("/ws/events")
async def websocket_events(ws: WebSocket):
    """Stream events to the browser via WebSocket.

    Since the EventBus uses trio channels, we poll it from asyncio
    via a thread-safe bridge.
    """
    assert engine is not None
    await ws.accept()
    logger.info("WS client connected")

    last_count = 0
    try:
        while True:
            # Poll for new events from the ring buffer
            current_count = engine.event_bus.event_count
            if current_count > last_count:
                # Send new events (up to 100 per batch to avoid flooding)
                new_events = list(engine.event_bus.ring)[-min(current_count - last_count, 100):]
                for event in new_events:
                    await ws.send_bytes(event.to_json())
                last_count = current_count
            await asyncio.sleep(0.05)  # 20Hz poll rate
    except (WebSocketDisconnect, Exception):
        logger.info("WS client disconnected")


# --- Simulation Control ---

@app.post("/api/sim/play")
async def sim_play():
    assert engine is not None
    engine.clock.play()
    return {"state": engine.state}


@app.post("/api/sim/pause")
async def sim_pause():
    assert engine is not None
    engine.clock.pause()
    return {"state": engine.state}


@app.post("/api/sim/reset")
async def sim_reset():
    assert engine is not None
    engine.clock.reset()
    engine.event_bus.clear()
    return {"state": engine.state}


class ReconfigureRequest(BaseModel):
    n_nodes: int = 20


@app.post("/api/sim/reconfigure")
async def sim_reconfigure(req: ReconfigureRequest):
    """Tear down the current simulation and restart with a new node count."""
    global _sim_thread, _sim_cancel_scope, _trio_token

    n = max(2, min(100, req.n_nodes))
    loop = asyncio.get_running_loop()

    # Cancel the running trio nursery from a thread-pool worker
    if _sim_cancel_scope is not None and _trio_token is not None:
        try:
            await loop.run_in_executor(
                None,
                lambda: trio.from_thread.run_sync(_sim_cancel_scope.cancel, trio_token=_trio_token),
            )
        except Exception as exc:
            logger.warning("Error cancelling trio nursery: %s", exc)

    # Wait for the old thread to stop (max 5 s)
    if _sim_thread and _sim_thread.is_alive():
        _sim_thread.join(timeout=5)

    # Rebuild simulation with new node count and start fresh trio thread
    _build_simulation(n)
    _start_sim_thread()
    logger.info("Reconfigured: %d nodes, %d edges", n, len(_initial_edges))
    return {"n_nodes": n, "edge_count": len(_initial_edges)}


class SpeedRequest(BaseModel):
    speed: float


@app.post("/api/sim/speed")
async def sim_speed(req: SpeedRequest):
    assert engine is not None
    engine.clock.speed = req.speed
    return {"speed": engine.clock.speed}


class SeekRequest(BaseModel):
    time: float


@app.post("/api/sim/seek")
async def sim_seek(req: SeekRequest):
    assert engine is not None
    engine.clock.seek(req.time)
    return {"time": engine.clock.time}


@app.get("/api/sim/snapshot")
async def sim_snapshot():
    assert engine is not None
    return engine.get_snapshot()


# --- Nodes ---

@app.get("/api/nodes")
async def get_nodes():
    assert engine is not None
    return {"nodes": engine.node_pool.get_all_status()}


@app.get("/api/nodes/{peer_id}")
async def get_node(peer_id: str):
    assert engine is not None
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
    n_nodes: int = 20
    p: float = 0.15
    m: int = 3
    n_clusters: int = 3
    intra_p: float = 0.3
    inter_p: float = 0.01


@app.post("/api/topology/apply")
async def topology_apply(req: TopologyRequest):
    global _initial_edges
    assert engine is not None
    config = TopologyConfig(**req.model_dump())
    graph = topology_manager.generate(config)
    edges = topology_manager.graph_to_edges(graph)
    positions = topology_manager.graph_layout(graph)
    metrics = topology_manager.compute_metrics(graph)

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
    config = TopologyConfig(**req.model_dump())
    graph = topology_manager.generate(config)
    edges = topology_manager.graph_to_edges(graph)
    metrics = topology_manager.compute_metrics(graph)
    return {
        "node_count": config.n_nodes,
        "edge_count": len(edges),
        "metrics": metrics,
    }


@app.get("/api/topology/metrics")
async def topology_metrics():
    """Return metrics for the currently active topology."""
    import networkx as nx
    assert engine is not None
    # Rebuild graph from current edges
    g = nx.Graph()
    for a, b in _initial_edges:
        u = int(a.replace("peer-", ""))
        v = int(b.replace("peer-", ""))
        g.add_edge(u, v)
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

import asyncio as _asyncio


def _run_trio_coro(coro):
    """Run a trio-async fault method from the asyncio thread.

    We exploit the fact that FaultInjector methods only do sync mutations +
    EventBus.emit(). The emit just appends to a deque and sends on trio channels.
    For the MVP, we call the coroutine via trio.from_thread if the trio token exists,
    otherwise fall back to sync-only state mutation.
    """
    global _trio_token
    if _trio_token is not None:
        import trio
        return trio.from_thread.run(coro, trio_token=_trio_token)
    return None


class LatencyRequest(BaseModel):
    peer_a: str
    peer_b: str
    ms: float
    jitter_ms: float = 0.0


@app.post("/api/fault/latency")
async def fault_latency(req: LatencyRequest):
    assert fault_injector is not None
    loop = _asyncio.get_event_loop()
    fault_id = await loop.run_in_executor(
        None,
        lambda: _run_trio_coro(fault_injector.inject_latency(req.peer_a, req.peer_b, req.ms, req.jitter_ms)),
    )
    return {"ok": True, "fault_id": fault_id}


class PartitionRequest(BaseModel):
    group_a: list[str]
    group_b: list[str]


@app.post("/api/fault/partition")
async def fault_partition(req: PartitionRequest):
    assert fault_injector is not None
    loop = _asyncio.get_event_loop()
    fault_id = await loop.run_in_executor(
        None,
        lambda: _run_trio_coro(fault_injector.inject_partition(req.group_a, req.group_b)),
    )
    return {"ok": True, "fault_id": fault_id}


class SybilRequest(BaseModel):
    n_attackers: int
    target_topic: str = "lumina/blocks/1.0"


@app.post("/api/fault/sybil")
async def fault_sybil(req: SybilRequest):
    assert fault_injector is not None
    loop = _asyncio.get_event_loop()
    fault_id = await loop.run_in_executor(
        None,
        lambda: _run_trio_coro(fault_injector.inject_sybil(req.n_attackers, req.target_topic)),
    )
    return {"ok": True, "fault_id": fault_id}


class EclipseRequest(BaseModel):
    target_peer_id: str
    n_attackers: int


@app.post("/api/fault/eclipse")
async def fault_eclipse(req: EclipseRequest):
    assert fault_injector is not None
    loop = _asyncio.get_event_loop()
    fault_id = await loop.run_in_executor(
        None,
        lambda: _run_trio_coro(fault_injector.inject_eclipse(req.target_peer_id, req.n_attackers)),
    )
    return {"ok": True, "fault_id": fault_id}


class DropPeerRequest(BaseModel):
    peer_id: str


@app.post("/api/fault/drop")
async def fault_drop(req: DropPeerRequest):
    assert fault_injector is not None
    loop = _asyncio.get_event_loop()
    fault_id = await loop.run_in_executor(
        None,
        lambda: _run_trio_coro(fault_injector.drop_peer(req.peer_id)),
    )
    return {"ok": True, "fault_id": fault_id}


class ClearFaultRequest(BaseModel):
    fault_id: str


@app.post("/api/fault/clear")
async def fault_clear(req: ClearFaultRequest):
    assert fault_injector is not None
    loop = _asyncio.get_event_loop()
    cleared = await loop.run_in_executor(
        None,
        lambda: _run_trio_coro(fault_injector.clear_fault(req.fault_id)),
    )
    return {"ok": cleared}


@app.post("/api/fault/clear-all")
async def fault_clear_all():
    assert fault_injector is not None
    loop = _asyncio.get_event_loop()
    count = await loop.run_in_executor(
        None,
        lambda: _run_trio_coro(fault_injector.clear_all()),
    )
    return {"ok": True, "cleared": count}


@app.get("/api/fault/active")
async def fault_active():
    assert fault_injector is not None
    return {"faults": fault_injector.get_active_faults()}


# --- Metrics ---

@app.get("/api/metrics/snapshot")
async def metrics_snapshot():
    assert metrics_collector is not None
    return metrics_collector.get_snapshot()


# --- Events ---

@app.get("/api/events/recent")
async def events_recent(since: float = 0.0):
    assert engine is not None
    events = engine.event_bus.events_since(since)
    return {"events": [e.to_dict() for e in events[-1000:]]}


# --- Gossip / Trace ---

@app.get("/api/gossip/mesh")
async def gossip_mesh():
    assert engine is not None
    return {"mesh": engine.node_pool.gossip.get_mesh_state("lumina/blocks/1.0")}


@app.get("/api/gossip/scores")
async def gossip_scores():
    assert engine is not None
    return {"scores": engine.node_pool.gossip.get_scores("lumina/blocks/1.0")}


@app.get("/api/gossip/scores/{peer_id}")
async def gossip_score_detail(peer_id: str):
    assert engine is not None
    return engine.node_pool.gossip.get_score_detail("lumina/blocks/1.0", peer_id)


@app.get("/api/gossip/analytics")
async def gossip_analytics():
    assert engine is not None
    return engine.node_pool.gossip.get_analytics("lumina/blocks/1.0")


@app.get("/api/trace/recent")
async def trace_recent(limit: int = 50):
    assert engine is not None
    return {"traces": engine.node_pool.gossip.get_recent_traces(limit)}


@app.get("/api/trace/{msg_id}")
async def trace_detail(msg_id: str):
    assert engine is not None
    trace = engine.node_pool.gossip.get_trace(msg_id)
    if trace is None:
        return {"error": "trace not found"}
    return trace


@app.get("/api/topology/edges")
async def topology_edges():
    """Return current topology edges for the graph."""
    return {"edges": _initial_edges}


# --- Export / Import ---

from fastapi.responses import StreamingResponse
import io


@app.get("/api/export/events")
async def export_events(format: str = "jsonl", since: float = 0.0):
    """Export simulation events as JSONL or JSON."""
    assert engine is not None
    events = engine.event_bus.events_since(since)

    if format == "json":
        import orjson
        data = orjson.dumps([e.to_dict() for e in events])
        return StreamingResponse(
            io.BytesIO(data),
            media_type="application/json",
            headers={"Content-Disposition": "attachment; filename=lumina-events.json"},
        )

    # Default: JSONL (one JSON object per line)
    def generate_jsonl():
        for event in events:
            yield event.to_json() + b"\n"

    return StreamingResponse(
        generate_jsonl(),
        media_type="application/x-ndjson",
        headers={"Content-Disposition": "attachment; filename=lumina-events.jsonl"},
    )


@app.get("/api/export/snapshot")
async def export_full_snapshot():
    """Export full simulation snapshot (state + topology + traces + metrics)."""
    assert engine is not None
    assert metrics_collector is not None
    import orjson

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
        headers={"Content-Disposition": "attachment; filename=lumina-snapshot.json"},
    )


class ImportEventsRequest(BaseModel):
    events: list[dict]


@app.post("/api/import/events")
async def import_events(req: ImportEventsRequest):
    """Import events into the event log for replay visualization.

    Events are added to the frontend store only — they don't replay through
    the simulation engine. This enables loading saved traces for analysis.
    """
    return {"imported": len(req.events), "events": req.events}


# --- Scenarios ---


class LaunchScenarioRequest(BaseModel):
    speed: float = 1.0


@app.get("/api/scenarios")
async def list_scenarios():
    """List all pre-built simulation scenarios."""
    return {"scenarios": [s.to_dict() for s in SCENARIOS.values()]}


@app.post("/api/scenarios/{scenario_id}/launch")
async def launch_scenario(scenario_id: str, req: LaunchScenarioRequest = LaunchScenarioRequest()):
    """Launch a pre-built scenario: reset sim, apply topology, start playback, arm phase runner."""
    from fastapi import HTTPException

    scenario = SCENARIOS.get(scenario_id)
    if not scenario:
        raise HTTPException(status_code=404, detail=f"Unknown scenario: {scenario_id}")

    assert engine is not None
    assert fault_injector is not None

    # 1. Reset simulation clock and events
    engine.clock.reset()
    engine.event_bus.clear()

    # 2. Clear any existing faults directly (no event emission needed — we reset the bus too)
    fault_injector._active_faults.clear()

    # 3. Apply scenario topology
    topo_config = TopologyConfig(
        topo_type=scenario.topology_type,
        n_nodes=20,
        **scenario.topology_params,
    )
    graph = topology_manager.generate(topo_config)
    edges = topology_manager.graph_to_edges(graph)
    positions = topology_manager.graph_layout(graph)
    engine.wire_topology(edges, positions)

    # 4. Arm scenario runner (sets active scenario, resets phase index)
    scenario_runner.set_scenario(scenario)

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


# --- Frontend (Jinja2 templates + static files) ---

from pathlib import Path
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi import Request
from fastapi.responses import HTMLResponse

_STATIC_DIR = Path(__file__).parent / "static"
_TEMPLATES_DIR = Path(__file__).parent / "templates"

app.mount("/static", StaticFiles(directory=_STATIC_DIR), name="static")
templates = Jinja2Templates(directory=str(_TEMPLATES_DIR))


@app.get("/", response_class=HTMLResponse)
async def index(request: Request):
    """Serve the main SPA shell."""
    return templates.TemplateResponse("index.html", {"request": request})


@app.get("/api/partials/gossip", response_class=HTMLResponse)
async def partial_gossip(request: Request):
    """HTMX partial: gossip activity counts."""
    assert engine is not None
    evts = list(engine.event_bus.ring)
    cats = ["connection", "stream", "dht", "gossip", "fault", "health"]
    counts = {c: sum(1 for e in evts if getattr(e, "category", None) and str(e.category) == c) for c in cats}
    counts["total events"] = len(evts)
    return templates.TemplateResponse("partials/gossip.html", {"request": request, "counts": counts})


@app.get("/api/partials/topology", response_class=HTMLResponse)
async def partial_topology(request: Request):
    """HTMX partial: topology stats."""
    assert engine is not None
    n = engine.node_pool.node_count
    edges_count = len(_initial_edges)
    stats = {
        "nodes": n,
        "edges": edges_count,
        "avg degree": f"{(2 * edges_count / max(n, 1)):.1f}",
        "sim time": f"{engine.clock.time:.2f}s",
    }
    return templates.TemplateResponse("partials/topology.html", {"request": request, "stats": stats})


@app.get("/api/partials/faults", response_class=HTMLResponse)
async def partial_faults(request: Request):
    """HTMX partial: active fault list."""
    assert fault_injector is not None
    faults = [
        {"fault_type": f.fault_type, "description": str(f)}
        for f in fault_injector._active_faults.values()
    ]
    return templates.TemplateResponse("partials/faults.html", {"request": request, "faults": faults})


@app.get("/api/partials/trace", response_class=HTMLResponse)
async def partial_trace(request: Request):
    """HTMX partial: recent event trace rows."""
    assert engine is not None
    evts = list(engine.event_bus.ring)[-100:]
    event_dicts = []
    for e in reversed(evts):
        event_dicts.append({
            "at": getattr(e, "at", 0),
            "category": str(getattr(e, "category", "")),
            "peer_id": getattr(e, "peer_id", ""),
            "message": getattr(e, "message", None) or getattr(e, "event_type", type(e).__name__),
            "event_type": getattr(e, "event_type", type(e).__name__),
        })
    return templates.TemplateResponse("partials/trace.html", {"request": request, "events": event_dicts})

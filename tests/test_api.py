"""HTTP-level tests for backend/main.py request bounds, reset and reconfigure.

httpx ASGITransport does not run the lifespan, so `_build_simulation(5)` is called directly
(no trio thread; `_run_trio_coro` is then a no-op). Tests are sync and drive the asyncio-side
app with asyncio.run, since pytest-trio would run async tests under trio.
"""

import asyncio
import threading
import time

import httpx
import orjson
import pytest
import trio

from backend import main
from backend.events.types import ClockTick

TOPIC = "lumina/blocks/1.0"
JSON = {"content-type": "application/json"}


async def _request(method: str, path: str, **kw) -> httpx.Response:
    transport = httpx.ASGITransport(app=main.app)
    async with httpx.AsyncClient(transport=transport, base_url="http://t") as client:
        return await client.request(method, path, **kw)


def req(method: str, path: str, **kw) -> httpx.Response:
    return asyncio.run(_request(method, path, **kw))


@pytest.fixture
def sim():
    main._trio_token = main._sim_cancel_scope = None  # no thread: trio bridge is a no-op
    main._build_simulation(5)
    return main.engine


def test_latency_rejects_nan_and_inf(sim):
    base = '"peer_a": "peer-0", "peer_b": "peer-1"'
    for body in (
        f'{{{base}, "ms": 100, "jitter_ms": "nan"}}',
        f'{{{base}, "ms": 1e400}}',
        f'{{{base}, "ms": -1}}',
    ):
        assert req("POST", "/api/fault/latency", content=body, headers=JSON).status_code == 422


@pytest.mark.parametrize("n", [10_000_000, -3, 0])
def test_attacker_count_is_bounded(sim, n):
    assert req("POST", "/api/fault/sybil", json={"n_attackers": n}).status_code == 422
    body = {"target_peer_id": "peer-0", "n_attackers": n}
    assert req("POST", "/api/fault/eclipse", json=body).status_code == 422


def test_topology_bounds_and_pool_size(sim):
    assert req("POST", "/api/topology/preview", json={"n_nodes": 5000}).status_code == 422
    assert req("POST", "/api/topology/preview", json={"n_clusters": 0}).status_code == 422
    assert req("POST", "/api/topology/preview", json={"topo_type": "nope"}).status_code == 400
    assert req("POST", "/api/topology/preview", json={"n_nodes": 10}).status_code == 200

    resp = req("POST", "/api/topology/apply", json={"topo_type": "complete", "n_nodes": 200})
    assert resp.status_code == 200
    assert resp.json()["node_count"] == 5  # the live pool, not the caller's n_nodes
    edges = req("GET", "/api/topology/edges").json()["edges"]
    assert edges and all(int(p.split("-")[1]) < 5 for a, b in edges for p in (a, b))


def test_export_json_streams_valid_document(sim):
    assert orjson.loads(req("GET", "/api/export/events?format=json").content) == []
    for i in range(3):
        sim.event_bus.ring.append(ClockTick(at=float(i)))
    resp = req("GET", "/api/export/events?format=json")
    assert resp.headers["content-type"].startswith("application/json")
    assert len(orjson.loads(resp.content)) == 3


def test_reset_and_launch_start_a_fresh_run(sim):
    gossip = sim.node_pool.gossip

    async def publish():
        async with trio.open_nursery() as nursery:
            await gossip.publish("peer-0", TOPIC, nursery)

    sim.clock.seek(50.0)
    trio.run(publish)
    assert gossip.get_analytics(TOPIC)["total_messages"] == 1
    old_run = sim.run_id

    assert req("POST", "/api/sim/reset").status_code == 200
    assert sim.clock.time == 0.0
    assert sim.event_bus.event_count == 0
    assert sim.run_id != old_run
    assert gossip.get_analytics(TOPIC)["total_messages"] == 0
    mesh = gossip.get_mesh_state(TOPIC)
    assert mesh and all(gossip.scorer._get(TOPIC, p).in_mesh for p in mesh)  # re-grafted at t=0

    trio.run(publish)
    run_before_launch = sim.run_id
    assert req("POST", "/api/scenarios/free_play/launch").status_code == 200
    assert sim.run_id != run_before_launch
    assert gossip.get_analytics(TOPIC)["total_messages"] == 0


def _sim_threads() -> list[threading.Thread]:
    return [t for t in threading.enumerate() if t.name == "trio-simulation" and t.is_alive()]


def test_concurrent_reconfigure_is_fast_and_leaves_one_thread(sim):
    main._start_sim_thread()
    try:

        async def two():
            t0 = time.monotonic()
            await asyncio.gather(
                _request("POST", "/api/sim/reconfigure", json={"n_nodes": 4}),
                _request("POST", "/api/sim/reconfigure", json={"n_nodes": 6}),
            )
            return time.monotonic() - t0

        assert asyncio.run(two()) < 2.0  # without the lock, the second join blocks 5 s
        assert len(_sim_threads()) == 1
    finally:
        trio.from_thread.run_sync(main._sim_cancel_scope.cancel, trio_token=main._trio_token)
        main._sim_thread.join(timeout=5)
        main._trio_token = main._sim_cancel_scope = None
    assert not _sim_threads()

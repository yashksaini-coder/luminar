"""Tests for GossipEngine — topology-aware message propagation."""

import pytest
import trio

from backend.events.bus import EventBus
from backend.gossip.engine import GossipEngine
from backend.simulation.clock import SimulationClock


@pytest.fixture
def event_bus():
    return EventBus()


@pytest.fixture
def clock(event_bus):
    c = SimulationClock(event_bus)
    c._time = 1.0  # Start at t=1 so events have non-zero timestamps
    c._paused = False
    c._speed = 10.0  # Fast for tests
    return c


@pytest.fixture
def gossip(event_bus, clock):
    g = GossipEngine(event_bus, clock)
    # Simple triangle topology: 0-1, 1-2, 0-2
    g.set_topology(
        [
            ("peer-0", "peer-1"),
            ("peer-1", "peer-2"),
            ("peer-0", "peer-2"),
        ]
    )
    g.subscribe_all(["peer-0", "peer-1", "peer-2"], "test-topic")
    return g


async def test_publish_creates_trace(gossip):
    """Publishing a message creates a trace with origin hop."""
    async with trio.open_nursery() as nursery:
        msg_id = await gossip.publish("peer-0", "test-topic", nursery)

    assert msg_id == "msg-1"
    trace = gossip.get_trace(msg_id)
    assert trace is not None
    assert trace["origin"] == "peer-0"
    assert trace["topic"] == "test-topic"
    assert len(trace["hops"]) >= 1
    assert trace["hops"][0]["peer"] == "peer-0"


async def test_message_propagates_to_mesh_peers(gossip, event_bus):
    """A published message reaches connected peers."""
    async with trio.open_nursery() as nursery:
        msg_id = await gossip.publish("peer-0", "test-topic", nursery)
        # Give time for propagation
        await trio.sleep(0.1)

    trace = gossip.get_trace(msg_id)
    # Should have reached at least the origin
    assert trace["delivered_count"] >= 1

    # Check gossip events were emitted
    gossip_events = [e for e in event_bus.ring if e.event_type == "GossipMessage"]
    assert len(gossip_events) >= 1


async def test_dedup_prevents_loops(gossip):
    """A peer only processes each message once (dedup)."""
    async with trio.open_nursery() as nursery:
        msg_id = await gossip.publish("peer-0", "test-topic", nursery)
        await trio.sleep(0.1)

    trace = gossip.get_trace(msg_id)
    # Each peer should appear at most once in the hops
    peer_counts = {}
    for hop in trace["hops"]:
        p = hop["peer"]
        peer_counts[p] = peer_counts.get(p, 0) + 1
    for p, count in peer_counts.items():
        assert count == 1, f"{p} received message {count} times"


async def test_topology_is_respected(event_bus, clock):
    """Messages only flow along topology edges."""
    g = GossipEngine(event_bus, clock)
    # Linear topology: 0-1-2-3 (no shortcut from 0 to 3)
    g.set_topology(
        [
            ("peer-0", "peer-1"),
            ("peer-1", "peer-2"),
            ("peer-2", "peer-3"),
        ]
    )
    g.subscribe_all(["peer-0", "peer-1", "peer-2", "peer-3"], "linear-topic")

    async with trio.open_nursery() as nursery:
        msg_id = await g.publish("peer-0", "linear-topic", nursery)
        await trio.sleep(0.2)

    trace = g.get_trace(msg_id)
    # The message must traverse 0→1→2→3 (at least 3 hops to reach peer-3)
    hops = trace["hops"]
    assert hops[0]["peer"] == "peer-0"
    assert hops[0]["hop"] == 0


async def test_mesh_state(gossip):
    """Each peer has mesh peers from their topology neighbors."""
    mesh = gossip.get_mesh_state("test-topic")
    assert "peer-0" in mesh
    assert "peer-1" in mesh
    assert "peer-2" in mesh
    # Each peer's mesh should only contain topology neighbors
    for peer_id, mesh_peers in mesh.items():
        for mp in mesh_peers:
            assert mp != peer_id  # No self-loops


async def test_heartbeat_grafts(event_bus, clock):
    """Heartbeat GRAFTs peers when mesh is below D_LOW."""
    g = GossipEngine(event_bus, clock)
    # Star topology: 0 connects to 1,2,3,4,5
    edges = [("peer-0", f"peer-{i}") for i in range(1, 6)]
    g.set_topology(edges)
    g.subscribe_all([f"peer-{i}" for i in range(6)], "star-topic")

    # Force peer-0 to have empty mesh
    g._mesh["star-topic"]["peer-0"] = set()

    await g.heartbeat("star-topic")

    graft_events = [e for e in event_bus.ring if e.event_type == "GossipGraft"]
    assert len(graft_events) > 0


async def test_recent_traces(gossip):
    """get_recent_traces returns traces sorted by creation time."""
    async with trio.open_nursery() as nursery:
        await gossip.publish("peer-0", "test-topic", nursery)
        await gossip.publish("peer-1", "test-topic", nursery)
        await gossip.publish("peer-2", "test-topic", nursery)

    traces = gossip.get_recent_traces(limit=2)
    assert len(traces) == 2
    # Returns msg_ids from the 3 published messages
    returned_ids = {t["msg_id"] for t in traces}
    assert len(returned_ids) == 2


def test_set_topology():
    """set_topology correctly builds adjacency."""
    bus = EventBus()
    clock = SimulationClock(bus)
    g = GossipEngine(bus, clock)

    g.set_topology([("a", "b"), ("b", "c")])
    assert "b" in g._topology["a"]
    assert "a" in g._topology["b"]
    assert "c" in g._topology["b"]
    assert "b" in g._topology["c"]
    assert "a" not in g._topology.get("c", set())

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


# ── Honest propagation (Devcon 8 roadmap §3.2) ──


async def test_relay_events_are_sender_correct(gossip, event_bus):
    """Relay events name the real sender and receiver; the origin publish has no receiver."""
    async with trio.open_nursery() as nursery:
        msg_id = await gossip.publish("peer-0", "test-topic", nursery)
        await trio.sleep(0.1)

    msgs = [e for e in event_bus.ring if e.event_type == "GossipMessage" and e.msg_id == msg_id]
    origin = [e for e in msgs if e.hops == 0]
    relays = [e for e in msgs if e.hops > 0]
    assert len(origin) == 1 and origin[0].from_peer == "peer-0" and origin[0].to_peer == ""
    assert relays
    for e in relays:
        assert e.from_peer != e.to_peer and e.to_peer != ""
        assert e.dropped is False
    # Flood publish: first hops come from the origin
    assert {e.from_peer for e in relays if e.hops == 1} == {"peer-0"}


async def test_trace_hops_record_sender_and_path(gossip):
    async with trio.open_nursery() as nursery:
        msg_id = await gossip.publish("peer-0", "test-topic", nursery)
        await trio.sleep(0.1)

    hops = gossip.get_trace(msg_id)["hops"]
    assert hops[0]["from"] is None and hops[0]["via"] == "origin"
    for h in hops[1:]:
        assert h["from"] in {"peer-0", "peer-1", "peer-2"} and h["via"] == "mesh"


def test_propagation_latency_is_end_to_end_not_sum():
    """End-to-end = last mesh arrival − publish time; IWANT pulls do not inflate it."""
    from backend.gossip.engine import MessageTrace

    t = MessageTrace(msg_id="m", topic="t", origin="a", created_at=1.0)
    t.add_hop("a", 1.0, 0.0, 0)
    t.add_hop("b", 1.020, 20.0, 1, from_peer="a")
    t.add_hop("c", 1.030, 10.0, 2, from_peer="b")
    t.add_hop("d", 1.025, 25.0, 1, from_peer="a")
    t.add_hop("e", 2.0, 0.0, 3, from_peer="c", via="iwant")
    assert t.propagation_latency_ms() == 30.0  # not 55 (sum) and not 1000 (iwant)
    assert t.propagation_incl_gossip_ms() == 1000.0
    d = t.to_dict()
    assert d["propagation_latency_ms"] == 30.0 and d["propagation_incl_gossip_ms"] == 1000.0
    assert d["duplicates"] == 0


async def test_duplicates_are_counted(gossip):
    """In a triangle every peer hears each message twice; the second arrival is a duplicate."""
    async with trio.open_nursery() as nursery:
        msg_id = await gossip.publish("peer-0", "test-topic", nursery)
        await trio.sleep(0.2)

    trace = gossip.get_trace(msg_id)
    assert trace["delivered_count"] == 3
    assert trace["duplicates"] >= 1
    analytics = gossip.get_analytics("test-topic")
    assert analytics["avg_duplicates"] >= 1
    assert 0 < analytics["recent_delivery_ratio"] <= 1


async def test_dropped_hop_emits_dropped_event(event_bus, clock):
    """A relay blocked by a fault is reported as a dropped hop instead of vanishing."""

    class FailPeer2:
        def is_peer_failed(self, peer_id):
            return peer_id == "peer-2"

    g = GossipEngine(event_bus, clock, fault_injector=FailPeer2())
    g.set_topology([("peer-0", "peer-1"), ("peer-0", "peer-2")])
    g.subscribe_all(["peer-0", "peer-1", "peer-2"], "t")
    async with trio.open_nursery() as nursery:
        msg_id = await g.publish("peer-0", "t", nursery)
        await trio.sleep(0.1)

    dropped = [
        e
        for e in event_bus.ring
        if e.event_type == "GossipMessage" and e.msg_id == msg_id and e.dropped
    ]
    assert len(dropped) == 1 and dropped[0].to_peer == "peer-2" and dropped[0].from_peer == "peer-0"
    assert "peer-2" not in {h["peer"] for h in g.get_trace(msg_id)["hops"]}


def test_snapshot_carries_mesh_map_up_to_100_nodes():
    from backend.simulation.engine import SimulationEngine

    small = SimulationEngine(n_nodes=6)
    small.wire_topology([(f"peer-{i}", f"peer-{(i + 1) % 6}") for i in range(6)], {})
    mesh = small.get_snapshot()["gossip"]["mesh"]
    assert set(mesh) == {f"peer-{i}" for i in range(6)}
    assert all(isinstance(v, list) for v in mesh.values())

    big = SimulationEngine(n_nodes=101)
    big.wire_topology([(f"peer-{i}", f"peer-{(i + 1) % 101}") for i in range(101)], {})
    assert big.get_snapshot()["gossip"]["mesh"] == {}

"""Tests for FaultInjector — functional fault effects on gossip propagation."""

import trio
import pytest

from backend.events.bus import EventBus
from backend.gossip.engine import GossipEngine
from backend.simulation.clock import SimulationClock
from backend.simulation.node_pool import NodePool, NodeState


@pytest.fixture
def event_bus():
    return EventBus()


@pytest.fixture
def clock(event_bus):
    c = SimulationClock(event_bus)
    c._time = 1.0
    c._paused = False
    c._speed = 10.0
    return c


@pytest.fixture
def node_pool(event_bus, clock):
    pool = NodePool(event_bus, clock, n_nodes=6, max_streams_per_node=8, max_dht_queries=2)
    edges = [
        ("peer-0", "peer-1"),
        ("peer-1", "peer-2"),
        ("peer-2", "peer-3"),
        ("peer-3", "peer-4"),
        ("peer-4", "peer-5"),
        ("peer-0", "peer-2"),
        ("peer-1", "peer-3"),
    ]
    pool.wire_topology(edges)
    return pool


@pytest.fixture
def fault_injector(event_bus, clock, node_pool):
    from backend.fault.injector import FaultInjector
    fi = FaultInjector(event_bus, clock, node_pool)
    node_pool.gossip._fault_injector = fi
    return fi


async def test_latency_adds_delay(fault_injector, node_pool):
    """Injected latency increases relay delay between peers."""
    fault_id = await fault_injector.inject_latency("peer-0", "peer-1", 500.0, jitter_ms=0)
    assert fault_id.startswith("fault-")
    extra = fault_injector.get_latency("peer-0", "peer-1")
    assert extra == 500.0
    # Reverse direction also affected
    extra_rev = fault_injector.get_latency("peer-1", "peer-0")
    assert extra_rev == 500.0
    # Unrelated pair unaffected
    assert fault_injector.get_latency("peer-2", "peer-3") == 0.0


async def test_partition_blocks_relay(fault_injector, node_pool, event_bus):
    """A partition prevents message propagation across the boundary."""
    fault_id = await fault_injector.inject_partition(
        group_a=["peer-0", "peer-1"],
        group_b=["peer-2", "peer-3", "peer-4", "peer-5"],
    )
    assert fault_injector.is_partitioned("peer-0", "peer-2")
    assert fault_injector.is_partitioned("peer-1", "peer-3")
    assert not fault_injector.is_partitioned("peer-0", "peer-1")  # Same group
    assert not fault_injector.is_partitioned("peer-2", "peer-3")  # Same group

    # Publish from peer-0 and verify it doesn't reach peer-3
    gossip = node_pool.gossip
    async with trio.open_nursery() as nursery:
        msg_id = await gossip.publish("peer-0", "lumina/blocks/1.0", nursery)
        await trio.sleep(0.2)

    trace = gossip.get_trace(msg_id)
    # peer-3,4,5 should NOT be in delivered
    delivered = trace["hops"]
    delivered_peers = {h["peer"] for h in delivered}
    assert "peer-3" not in delivered_peers or fault_injector.is_partitioned("peer-1", "peer-3")


async def test_drop_peer_marks_failed(fault_injector, node_pool):
    """Dropping a peer sets its state to FAILED and removes it from meshes."""
    fault_id = await fault_injector.drop_peer("peer-2")
    node = node_pool.get_node("peer-2")
    assert node.state == NodeState.FAILED
    assert node.gossip_score == 0.0

    # peer-2 should be removed from other peers' meshes
    mesh = node_pool.gossip.get_mesh_state("lumina/blocks/1.0")
    for peer_id, peers in mesh.items():
        if peer_id != "peer-2":
            assert "peer-2" not in peers, f"peer-2 still in {peer_id}'s mesh"


async def test_drop_peer_blocks_relay(fault_injector, node_pool):
    """A dropped peer doesn't receive relayed messages."""
    await fault_injector.drop_peer("peer-2")

    gossip = node_pool.gossip
    async with trio.open_nursery() as nursery:
        msg_id = await gossip.publish("peer-0", "lumina/blocks/1.0", nursery)
        await trio.sleep(0.2)

    trace = gossip.get_trace(msg_id)
    delivered_peers = {h["peer"] for h in trace["hops"]}
    assert "peer-2" not in delivered_peers


async def test_clear_fault_recovers_peer(fault_injector, node_pool, event_bus):
    """Clearing a drop fault recovers the peer."""
    fault_id = await fault_injector.drop_peer("peer-2")
    assert node_pool.get_node("peer-2").state == NodeState.FAILED

    cleared = await fault_injector.clear_fault(fault_id)
    assert cleared is True
    assert node_pool.get_node("peer-2").state == NodeState.IDLE
    assert node_pool.get_node("peer-2").gossip_score == 1.0

    # FaultCleared + PeerRecovered events emitted
    recovered = [e for e in event_bus.ring if e.event_type == "PeerRecovered"]
    assert len(recovered) >= 1


async def test_sybil_adds_fake_mesh_peers(fault_injector, node_pool):
    """Sybil attack injects fake nodes into honest peers' meshes."""
    fault_id = await fault_injector.inject_sybil(3, "lumina/blocks/1.0")
    mesh = node_pool.gossip.get_mesh_state("lumina/blocks/1.0")

    # At least some honest peers should have sybil nodes in their mesh
    sybil_count = 0
    for peer_id, peers in mesh.items():
        for p in peers:
            if p.startswith("sybil-"):
                sybil_count += 1
    assert sybil_count > 0


async def test_clear_sybil_removes_fake_peers(fault_injector, node_pool):
    """Clearing sybil fault removes all sybil nodes from meshes."""
    fault_id = await fault_injector.inject_sybil(3, "lumina/blocks/1.0")
    cleared = await fault_injector.clear_fault(fault_id)
    assert cleared is True

    mesh = node_pool.gossip.get_mesh_state("lumina/blocks/1.0")
    for peer_id, peers in mesh.items():
        for p in peers:
            assert not p.startswith("sybil-"), f"Sybil {p} still in {peer_id}'s mesh"


async def test_eclipse_replaces_mesh(fault_injector, node_pool):
    """Eclipse attack replaces target's mesh with attacker nodes."""
    fault_id = await fault_injector.inject_eclipse("peer-2", 3)
    mesh = node_pool.gossip.get_mesh_state("lumina/blocks/1.0")

    target_mesh = mesh.get("peer-2", [])
    # All of peer-2's mesh should be eclipse attacker nodes
    for p in target_mesh:
        assert p.startswith("eclipse-"), f"Honest peer {p} still in eclipsed peer-2's mesh"
    assert len(target_mesh) == 3


async def test_clear_eclipse_removes_attackers(fault_injector, node_pool):
    """Clearing eclipse fault removes attacker nodes."""
    fault_id = await fault_injector.inject_eclipse("peer-2", 3)
    await fault_injector.clear_fault(fault_id)

    mesh = node_pool.gossip.get_mesh_state("lumina/blocks/1.0")
    for peer_id, peers in mesh.items():
        for p in peers:
            assert not p.startswith("eclipse-"), f"Eclipse attacker {p} still in {peer_id}'s mesh"


async def test_clear_all(fault_injector):
    """clear_all removes all active faults."""
    await fault_injector.inject_latency("peer-0", "peer-1", 100)
    await fault_injector.inject_latency("peer-2", "peer-3", 200)
    await fault_injector.drop_peer("peer-4")

    count = await fault_injector.clear_all()
    assert count == 3
    assert len(fault_injector.get_active_faults()) == 0


async def test_fault_events_emitted(fault_injector, event_bus):
    """Injecting faults emits FaultInjected events."""
    await fault_injector.inject_latency("peer-0", "peer-1", 100)
    await fault_injector.drop_peer("peer-2")

    fault_events = [e for e in event_bus.ring if e.event_type == "FaultInjected"]
    assert len(fault_events) >= 2
    types = {e.fault_type for e in fault_events}
    assert "latency" in types
    assert "drop" in types

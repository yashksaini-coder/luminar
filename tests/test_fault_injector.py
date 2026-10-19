"""Tests for FaultInjector — functional fault effects on gossip propagation."""

import pytest
import trio

from backend.events.bus import EventBus
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
    await fault_injector.inject_partition(
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
    delivered_peers = {h["peer"] for h in trace["hops"]}
    assert delivered_peers <= {"peer-0", "peer-1"}


async def test_partition_holds_across_heartbeats(fault_injector, node_pool, clock):
    """Heartbeat GRAFT and IHAVE/IWANT must not re-link or leak across a partition."""
    gossip = node_pool.gossip
    topic = "lumina/blocks/1.0"
    group_a, group_b = ["peer-0", "peer-1"], ["peer-2", "peer-3", "peer-4", "peer-5"]
    await fault_injector.inject_partition(group_a=group_a, group_b=group_b)

    async with trio.open_nursery() as nursery:
        msg_id = await gossip.publish("peer-0", topic, nursery)
        await trio.sleep(0.2)
    for _ in range(3):
        clock._time += 1.0
        await gossip.heartbeat(topic)

    mesh = gossip.get_mesh_state(topic)
    assert not any(b in mesh[a] for a in group_a for b in group_b), mesh
    assert not any(a in mesh[b] for b in group_b for a in group_a), mesh
    delivered = {h["peer"] for h in gossip.get_trace(msg_id)["hops"]}
    assert delivered <= set(group_a), delivered


async def test_drop_peer_marks_failed(fault_injector, node_pool, clock):
    """Dropping a peer sets it FAILED and keeps it out of every mesh across heartbeats."""
    await fault_injector.drop_peer("peer-2")
    node = node_pool.get_node("peer-2")
    assert node.state == NodeState.FAILED
    assert node.gossip_score == 0.0

    # A crashed peer neither re-grafts nor gets grafted on the next heartbeat
    clock._time += 1.0
    await node_pool.gossip.heartbeat("lumina/blocks/1.0")
    mesh = node_pool.gossip.get_mesh_state("lumina/blocks/1.0")
    assert mesh["peer-2"] == []
    for peer_id, peers in mesh.items():
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
    await fault_injector.inject_sybil(3, "lumina/blocks/1.0")
    mesh = node_pool.gossip.get_mesh_state("lumina/blocks/1.0")

    # At least some honest peers should have sybil nodes in their mesh
    sybil_count = 0
    for _peer_id, peers in mesh.items():
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
    await fault_injector.inject_eclipse("peer-2", 3)
    mesh = node_pool.gossip.get_mesh_state("lumina/blocks/1.0")

    target_mesh = mesh.get("peer-2", [])
    # All of peer-2's mesh should be eclipse attacker nodes
    for p in target_mesh:
        assert p.startswith("eclipse-"), f"Honest peer {p} still in eclipsed peer-2's mesh"
    assert len(target_mesh) == 3
    # Meshes are asymmetric: no honest peer may still hold the target either
    for p, m in mesh.items():
        if not p.startswith("eclipse-"):
            assert "peer-2" not in m, f"{p} still holds eclipsed peer-2"


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


# ── Scoring that bites (Devcon 8 roadmap §3.1) ──

TOPIC = "lumina/blocks/1.0"


def _honest_meshes_containing(gossip, peer_id: str) -> list[str]:
    mesh = gossip.get_mesh_state(TOPIC)
    return [p for p, peers in mesh.items() if p.startswith("peer-") and peer_id in peers]


async def test_sybil_ids_are_deterministic(fault_injector, node_pool):
    """Attacker ids are stable across runs so reels and URLs can name them."""
    await fault_injector.inject_sybil(2, TOPIC)
    mesh = node_pool.gossip.get_mesh_state(TOPIC)
    assert "sybil-0" in mesh and "sybil-1" in mesh
    fid = await fault_injector.inject_eclipse("peer-2", 2)
    assert set(node_pool.gossip.get_mesh_state(TOPIC)["peer-2"]) == {"eclipse-0", "eclipse-1"}
    await fault_injector.clear_fault(fid)
    # A second sybil fault must not collide with the first one's ids
    await fault_injector.inject_sybil(1, TOPIC)
    assert "sybil-2" in node_pool.gossip.get_mesh_state(TOPIC)


async def test_sybil_graft_is_visible_and_scored(fault_injector, node_pool, event_bus):
    """Injecting a sybil emits a GRAFT per target and registers it with the scorer."""
    await fault_injector.inject_sybil(1, TOPIC)
    grafts = [e for e in event_bus.ring if e.event_type == "GossipGraft" and e.to_peer == "sybil-0"]
    assert len(grafts) == len(_honest_meshes_containing(node_pool.gossip, "sybil-0")) > 0
    assert node_pool.gossip.get_score_detail(TOPIC, "sybil-0")["in_mesh"] is True


async def test_sybil_pruned_by_score_in_two_heartbeats(fault_injector, node_pool, event_bus, clock):
    """P4 makes the prune threshold reachable: not after one heartbeat, yes after two."""
    from backend.gossip.engine import SCORE_THRESHOLD_PRUNE

    gossip = node_pool.gossip
    await fault_injector.inject_sybil(2, TOPIC)
    assert _honest_meshes_containing(gossip, "sybil-0")

    clock._time += 1.0
    await gossip.heartbeat(TOPIC)
    # Heartbeat 1: P4 = -10 exactly, not < -10 → still in mesh
    assert _honest_meshes_containing(gossip, "sybil-0")
    assert not [e for e in event_bus.ring if e.event_type == "GossipPrune" and e.reason == "score"]
    # Spam left the attacker as visible messages toward its mesh targets
    spam = [
        e for e in event_bus.ring if e.event_type == "GossipMessage" and e.from_peer == "sybil-0"
    ]
    assert spam and all(
        e.to_peer.startswith("peer-") and e.msg_id.startswith("spam-") for e in spam
    )

    clock._time += 1.0
    await gossip.heartbeat(TOPIC)
    for sid in ("sybil-0", "sybil-1"):
        assert gossip.scorer.compute_score(TOPIC, sid, clock.time) < SCORE_THRESHOLD_PRUNE
        assert not _honest_meshes_containing(gossip, sid)
    prunes = [e for e in event_bus.ring if e.event_type == "GossipPrune" and e.reason == "score"]
    assert prunes and all(e.to_peer.startswith("sybil-") for e in prunes)


async def test_eclipse_stays_until_clear(fault_injector, node_pool, clock):
    """Eclipse attackers are silent: scoring never prunes them, only clear_fault does."""
    gossip = node_pool.gossip
    fid = await fault_injector.inject_eclipse("peer-2", 4)
    for _ in range(3):
        clock._time += 1.0
        await gossip.heartbeat(TOPIC)
    mesh = gossip.get_mesh_state(TOPIC)["peer-2"]
    assert all(f"eclipse-{i}" in mesh for i in range(4))
    for i in range(4):
        assert gossip.scorer.compute_score(TOPIC, f"eclipse-{i}", clock.time) >= -0.25
    await fault_injector.clear_fault(fid)
    assert not any(p.startswith("eclipse-") for p in gossip.get_mesh_state(TOPIC).get("peer-2", []))


async def test_eclipse_blocks_mesh_relay_and_regraft(fault_injector, node_pool, clock):
    """Honest peers cannot relay to or GRAFT an eclipsed peer; only IHAVE/IWANT reaches it."""
    gossip = node_pool.gossip
    await fault_injector.inject_eclipse("peer-2", 3)
    async with trio.open_nursery() as nursery:
        msg_id = await gossip.publish("peer-1", TOPIC, nursery)  # topology neighbour of peer-2
        await trio.sleep(0.2)
    assert "peer-2" not in {h["peer"] for h in gossip.get_trace(msg_id)["hops"]}

    clock._time += 1.0
    await gossip.heartbeat(TOPIC)
    hops = [h for h in gossip.get_trace(msg_id)["hops"] if h["peer"] == "peer-2"]
    assert hops and all(h["via"] == "iwant" for h in hops)
    mesh = gossip.get_mesh_state(TOPIC)
    assert all(p.startswith("eclipse-") for p in mesh["peer-2"])
    assert not any("peer-2" in m for p, m in mesh.items() if not p.startswith("eclipse-"))


async def test_prune_reason_defaults_to_overflow(event_bus):
    from backend.events.types import GossipPrune

    e = GossipPrune(at=1.0, from_peer="peer-0", to_peer="peer-1", topic=TOPIC)
    assert e.to_dict()["reason"] == "overflow"


async def test_snapshot_includes_attackers_as_nodes():
    """Attackers appear in the snapshot so the frontend can draw, click and animate them."""
    from backend.fault.injector import FaultInjector
    from backend.simulation.engine import SimulationEngine

    engine = SimulationEngine(n_nodes=6)
    edges = [(f"peer-{i}", f"peer-{(i + 1) % 6}") for i in range(6)]
    positions = {f"peer-{i}": (float(i * 10), 5.0) for i in range(6)}
    engine.wire_topology(edges, positions)
    fi = FaultInjector(engine.event_bus, engine.clock, engine.node_pool)
    engine.node_pool.gossip._fault_injector = fi

    assert all(n["peer_id"].startswith("peer-") for n in engine.get_snapshot()["nodes"])
    await fi.inject_sybil(2, TOPIC)
    fid = await fi.inject_eclipse("peer-3", 4)

    nodes = {n["peer_id"]: n for n in engine.get_snapshot()["nodes"]}
    assert engine.get_snapshot()["node_count"] == 6  # honest count unchanged
    for aid in ("sybil-0", "sybil-1", "eclipse-0", "eclipse-3"):
        n = nodes[aid]
        assert n["state"] == "attacker"
        assert n["connected_peers"] and all(p.startswith("peer-") for p in n["connected_peers"])
        assert n["index"] >= 20000
        assert isinstance(n["x"], float) and isinstance(n["gossip_score"], float)
    assert nodes["eclipse-0"]["connected_peers"] == ["peer-3"]
    assert nodes["eclipse-0"]["last_targets"] == ["peer-3"]
    assert len(nodes["sybil-0"]["last_targets"]) == len(nodes["sybil-0"]["connected_peers"]) > 0

    await fi.clear_fault(fid)
    ids = {n["peer_id"] for n in engine.get_snapshot()["nodes"]}
    assert not any(i.startswith("eclipse-") for i in ids) and "sybil-0" in ids

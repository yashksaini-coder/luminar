"""Tests for GossipSub v1.1 peer scoring and advanced features."""

import pytest
import trio

from backend.events.bus import EventBus
from backend.gossip.engine import GossipEngine
from backend.gossip.scoring import PeerScoreTracker
from backend.simulation.clock import SimulationClock


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
def gossip(event_bus, clock):
    g = GossipEngine(event_bus, clock)
    g.set_topology(
        [
            ("peer-0", "peer-1"),
            ("peer-1", "peer-2"),
            ("peer-0", "peer-2"),
            ("peer-2", "peer-3"),
            ("peer-3", "peer-4"),
        ]
    )
    g.subscribe_all(["peer-0", "peer-1", "peer-2", "peer-3", "peer-4"], "test-topic")
    return g


# ── Scoring Tests ──


def test_score_increases_with_time_in_mesh():
    """P1: Time in mesh increases score."""
    scorer = PeerScoreTracker()
    scorer.on_graft("t", "peer-0", 0.0)

    score_t1 = scorer.compute_score("t", "peer-0", 1.0)
    score_t5 = scorer.compute_score("t", "peer-0", 5.0)
    assert score_t5 > score_t1 > 0


def test_score_first_delivery_bonus():
    """P2: First message delivery increases score."""
    scorer = PeerScoreTracker()
    scorer.on_graft("t", "peer-0", 0.0)

    before = scorer.compute_score("t", "peer-0", 1.0)
    scorer.on_first_delivery("t", "peer-0")
    scorer.on_first_delivery("t", "peer-0")
    after = scorer.compute_score("t", "peer-0", 1.0)
    assert after > before


def test_score_invalid_message_penalty():
    """P4: Invalid messages decrease score."""
    scorer = PeerScoreTracker()
    scorer.on_graft("t", "peer-0", 0.0)

    before = scorer.compute_score("t", "peer-0", 1.0)
    scorer.on_invalid_message("t", "peer-0")
    after = scorer.compute_score("t", "peer-0", 1.0)
    assert after < before


def test_score_decay():
    """Decay reduces first delivery and invalid message counters."""
    scorer = PeerScoreTracker()
    scorer.on_graft("t", "peer-0", 0.0)
    scorer.on_first_delivery("t", "peer-0")
    scorer.on_first_delivery("t", "peer-0")

    before = scorer.compute_score("t", "peer-0", 1.0)
    scorer.decay("t")
    scorer.decay("t")
    after = scorer.compute_score("t", "peer-0", 1.0)
    # P2 component should be smaller after decay
    assert after < before


def test_score_breakdown():
    """get_score_breakdown returns all components."""
    scorer = PeerScoreTracker()
    scorer.on_graft("t", "peer-0", 0.0)
    scorer.on_first_delivery("t", "peer-0")

    bd = scorer.get_score_breakdown("t", "peer-0", 5.0)
    assert "p1_time_in_mesh" in bd
    assert "p2_first_delivery" in bd
    assert "p3_mesh_delivery" in bd
    assert "p4_invalid_messages" in bd
    assert bd["in_mesh"] is True
    assert bd["time_in_mesh_s"] == 5.0


# ── Flood Publish Tests ──


async def test_flood_publish_reaches_non_mesh_neighbors(gossip, event_bus):
    """Flood publish sends to ALL topology neighbors, not just mesh."""
    # peer-0's mesh may not include all of its topology neighbors
    # but flood publish should reach them
    async with trio.open_nursery() as nursery:
        msg_id = await gossip.publish("peer-0", "test-topic", nursery)
        await trio.sleep(0.1)

    trace = gossip.get_trace(msg_id)
    delivered = {h["peer"] for h in trace["hops"]}
    # peer-1 and peer-2 are both topology neighbors of peer-0
    assert "peer-1" in delivered
    assert "peer-2" in delivered


async def test_flood_publish_then_mesh_relay(gossip, event_bus):
    """After flood publish, subsequent hops use mesh-only relay."""
    async with trio.open_nursery() as nursery:
        msg_id = await gossip.publish("peer-0", "test-topic", nursery)
        await trio.sleep(0.2)

    trace = gossip.get_trace(msg_id)
    # Message should propagate beyond peer-0's direct neighbors
    # via mesh relay (peer-2 → peer-3 → peer-4)
    delivered = {h["peer"] for h in trace["hops"]}
    assert "peer-3" in delivered or "peer-4" in delivered


# ── IWANT Tests ──


async def test_heartbeat_ihave_iwant(event_bus, clock):
    """IHAVE/IWANT fires when a peer has messages its non-mesh neighbor hasn't seen."""
    # Dense topology: peer-0 connects to 10 peers — mesh holds only D=6,
    # leaving 4 neighbors as gossip targets for IHAVE.
    g = GossipEngine(event_bus, clock)
    n = 12
    # Hub topology: peer-0 connected to all others
    edges = [("peer-0", f"peer-{i}") for i in range(1, n)]
    # Also connect others in a ring so meshes aren't trivial
    for i in range(1, n):
        edges.append((f"peer-{i}", f"peer-{(i % (n - 1)) + 1}"))
    g.set_topology(edges)
    peers = [f"peer-{i}" for i in range(n)]
    g.subscribe_all(peers, "t")

    # peer-0 has a message that others haven't seen
    from backend.gossip.engine import MessageTrace

    g._seen["peer-0"].add("msg-fake")
    g._history["peer-0"].append("msg-fake")
    g._traces["msg-fake"] = MessageTrace(
        msg_id="msg-fake", topic="t", origin="peer-0", created_at=clock.time
    )
    g._traces["msg-fake"].add_hop("peer-0", clock.time, 0.0, 0)

    clock._time += 2.0
    await g.heartbeat("t")

    ihave_events = [e for e in event_bus.ring if e.event_type == "GossipIHave"]
    # peer-0 has 11 neighbors but only D=6 in mesh, so 5 targets for IHAVE
    assert len(ihave_events) >= 1


# ── Score-Based Heartbeat Tests ──


async def test_heartbeat_prunes_low_score_peers(gossip, event_bus, clock):
    """Heartbeat prunes peers with very low scores."""
    # Give peer-1 a terrible score
    gossip.scorer.on_invalid_message("test-topic", "peer-1")
    gossip.scorer.on_invalid_message("test-topic", "peer-1")
    gossip.scorer.on_invalid_message("test-topic", "peer-1")

    clock._time += 2.0
    await gossip.heartbeat("test-topic")

    # peer-1 may have been pruned from some meshes
    prune_events = [
        e for e in event_bus.ring if e.event_type == "GossipPrune" and e.to_peer == "peer-1"
    ]
    # Score is -30 which is below SCORE_THRESHOLD_PRUNE (-10)
    assert len(prune_events) >= 1


async def test_heartbeat_grafts_high_score_peers_first(gossip, event_bus, clock):
    """When grafting, prefer higher-scored candidates."""
    # Force peer-0 to have empty mesh
    gossip._mesh["test-topic"]["peer-0"] = set()

    # Give peer-1 a high score, peer-2 a low score
    gossip.scorer.on_first_delivery("test-topic", "peer-1")
    gossip.scorer.on_first_delivery("test-topic", "peer-1")
    gossip.scorer.on_first_delivery("test-topic", "peer-1")

    clock._time += 2.0
    await gossip.heartbeat("test-topic")

    # peer-1 should be grafted (high score)
    graft_events = [
        e for e in event_bus.ring if e.event_type == "GossipGraft" and e.from_peer == "peer-0"
    ]
    grafted_peers = [e.to_peer for e in graft_events]
    assert "peer-1" in grafted_peers


# ── Analytics Tests ──


async def test_analytics_returns_metrics(gossip, clock):
    """get_analytics returns delivery ratio, latency CDF, and mesh stats."""
    async with trio.open_nursery() as nursery:
        await gossip.publish("peer-0", "test-topic", nursery)
        await gossip.publish("peer-1", "test-topic", nursery)
        await trio.sleep(0.1)

    clock._time += 1.0
    analytics = gossip.get_analytics("test-topic")

    assert analytics["total_messages"] == 2
    assert 0 <= analytics["avg_delivery_ratio"] <= 1.0
    assert analytics["avg_hops"] >= 0
    assert isinstance(analytics["delivery_ratios"], list)
    assert isinstance(analytics["latency_cdf"], list)
    assert "avg_degree" in analytics["mesh_stability"]


async def test_trace_includes_enhanced_fields(gossip):
    """MessageTrace includes first_delivery_peer and propagation_latency_ms."""
    async with trio.open_nursery() as nursery:
        msg_id = await gossip.publish("peer-0", "test-topic", nursery)
        await trio.sleep(0.1)

    trace = gossip.get_trace(msg_id)
    assert "first_delivery_peer" in trace
    assert "propagation_latency_ms" in trace
    assert "max_hops" in trace
    assert trace["max_hops"] >= 0


def test_get_scores(gossip):
    """get_scores returns scores for all subscribed peers."""
    scores = gossip.get_scores("test-topic")
    assert "peer-0" in scores
    assert "peer-4" in scores
    assert all(isinstance(v, float) for v in scores.values())

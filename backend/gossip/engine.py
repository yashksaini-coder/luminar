"""GossipSub simulation engine — topology-aware message propagation.

Implements GossipSub v1.1 protocol features:
- Peers maintain a mesh of D connected peers per topic
- Messages propagate hop-by-hop through the mesh
- Flood publish: first hop broadcasts to ALL topology neighbors
- GRAFT/PRUNE events manage mesh membership using peer scores
- IHAVE/IWANT enable lazy message pulling for peers outside the mesh
- Peer scoring (P1-P4): time in mesh, first delivery, delivery ratio, invalid msgs
- Each message is tracked through its full propagation path
"""

from __future__ import annotations

import logging
import random
from dataclasses import dataclass, field
from typing import TYPE_CHECKING

import trio

from backend.gossip.scoring import PeerScoreTracker

if TYPE_CHECKING:
    from backend.events.bus import EventBus
    from backend.simulation.clock import SimulationClock

logger = logging.getLogger(__name__)

# GossipSub parameters
D = 6        # Target mesh degree
D_LOW = 4    # Below this, GRAFT new peers
D_HIGH = 8   # Above this, PRUNE excess peers
D_LAZY = 6   # Number of peers to gossip IHAVE to
HEARTBEAT_INTERVAL = 1.0  # Seconds between heartbeats
SCORE_THRESHOLD_GRAFT = -5.0   # Don't graft peers with score below this
SCORE_THRESHOLD_PRUNE = -10.0  # Prune peers with score below this (regardless of mesh size)
HISTORY_WINDOW = 50  # Number of recent msg_ids to track for IHAVE/IWANT


@dataclass
class MessageTrace:
    """Tracks a single message through the network."""
    msg_id: str
    topic: str
    origin: str
    created_at: float
    hops: list[dict] = field(default_factory=list)
    delivered_to: set[str] = field(default_factory=set)
    first_delivery_peer: str | None = None
    fully_propagated_at: float | None = None

    def add_hop(self, peer_id: str, received_at: float, relay_latency_ms: float, hop_index: int):
        self.hops.append({
            "peer": peer_id,
            "time": received_at,
            "latency_ms": relay_latency_ms,
            "hop": hop_index,
        })
        if peer_id != self.origin and self.first_delivery_peer is None:
            self.first_delivery_peer = peer_id
        self.delivered_to.add(peer_id)

    def delivery_ratio(self, total_nodes: int) -> float:
        return len(self.delivered_to) / max(total_nodes, 1)

    def propagation_latency_ms(self) -> float:
        """Time from origin to last delivery in ms."""
        if len(self.hops) < 2:
            return 0.0
        return sum(h.get("latency_ms", 0) for h in self.hops[1:])

    def max_hop_depth(self) -> int:
        if not self.hops:
            return 0
        return max(h["hop"] for h in self.hops)

    def to_dict(self) -> dict:
        return {
            "msg_id": self.msg_id,
            "topic": self.topic,
            "origin": self.origin,
            "created_at": self.created_at,
            "hops": self.hops,
            "delivered_count": len(self.delivered_to),
            "first_delivery_peer": self.first_delivery_peer,
            "propagation_latency_ms": round(self.propagation_latency_ms(), 1),
            "max_hops": self.max_hop_depth(),
        }


class GossipEngine:
    """Simulates GossipSub v1.1 message propagation across a mesh topology."""

    def __init__(
        self,
        event_bus: EventBus,
        clock: SimulationClock,
        fault_injector: object | None = None,
    ) -> None:
        self._event_bus = event_bus
        self._clock = clock
        self._fault_injector = fault_injector

        # Topic → set of subscribed peer IDs
        self._subscriptions: dict[str, set[str]] = {}
        # Topic → peer_id → set of mesh peers
        self._mesh: dict[str, dict[str, set[str]]] = {}
        # Peer topology: peer_id → set of directly connected peers
        self._topology: dict[str, set[str]] = {}
        # Message traces
        self._traces: dict[str, MessageTrace] = {}
        # peer_id → set of msg_ids already seen (dedup)
        self._seen: dict[str, set[str]] = {}
        # peer_id → list of recent msg_ids (for IHAVE gossip, bounded)
        self._history: dict[str, list[str]] = {}
        # peer_id → set of msg_ids wanted (pending IWANT requests)
        self._iwant_pending: dict[str, set[str]] = {}
        # Message counter
        self._msg_counter = 0
        # Peer scoring
        self.scorer = PeerScoreTracker()

    @property
    def traces(self) -> dict[str, MessageTrace]:
        return self._traces

    def set_topology(self, edges: list[tuple[str, str]]) -> None:
        """Load the network topology from edge list."""
        self._topology.clear()
        for a, b in edges:
            self._topology.setdefault(a, set()).add(b)
            self._topology.setdefault(b, set()).add(a)

    def subscribe(self, peer_id: str, topic: str) -> None:
        """Subscribe a peer to a topic and build initial mesh."""
        self._subscriptions.setdefault(topic, set()).add(peer_id)
        self._seen.setdefault(peer_id, set())
        self._history.setdefault(peer_id, [])

        if topic not in self._mesh:
            self._mesh[topic] = {}
        neighbors = self._topology.get(peer_id, set())
        subscribed_neighbors = neighbors & self._subscriptions.get(topic, set())
        mesh_peers = set(random.sample(
            list(subscribed_neighbors),
            min(D, len(subscribed_neighbors))
        ))
        self._mesh[topic][peer_id] = mesh_peers

        # Record mesh join for scoring
        for mp in mesh_peers:
            self.scorer.on_graft(topic, mp, self._clock.time)
        self.scorer.on_graft(topic, peer_id, self._clock.time)

    def subscribe_all(self, peer_ids: list[str], topic: str) -> None:
        """Subscribe all peers to a topic, then build meshes."""
        for pid in peer_ids:
            self._subscriptions.setdefault(topic, set()).add(pid)
            self._seen.setdefault(pid, set())
            self._history.setdefault(pid, [])

        for pid in peer_ids:
            neighbors = self._topology.get(pid, set())
            subscribed_neighbors = neighbors & self._subscriptions.get(topic, set())
            mesh_peers = set(random.sample(
                list(subscribed_neighbors),
                min(D, len(subscribed_neighbors))
            ))
            self._mesh.setdefault(topic, {})[pid] = mesh_peers
            self.scorer.on_graft(topic, pid, self._clock.time)

    async def publish(self, origin: str, topic: str, nursery: trio.Nursery) -> str:
        """Publish a new message from origin peer. Returns msg_id.

        Uses flood publish: first hop sends to ALL topology neighbors
        (not just mesh peers), ensuring rapid initial dissemination.
        """
        from backend.events.types import GossipMessage

        self._msg_counter += 1
        msg_id = f"msg-{self._msg_counter}"
        sim_time = self._clock.time

        trace = MessageTrace(
            msg_id=msg_id,
            topic=topic,
            origin=origin,
            created_at=sim_time,
        )
        trace.add_hop(origin, sim_time, 0.0, 0)
        self._traces[msg_id] = trace
        self._seen.setdefault(origin, set()).add(msg_id)
        self._add_history(origin, msg_id)

        await self._event_bus.emit(GossipMessage(
            at=sim_time, topic=topic, from_peer=origin, msg_id=msg_id, hops=0
        ))

        # Flood publish: send to ALL topology neighbors who subscribe to this topic
        subscribers = self._subscriptions.get(topic, set())
        neighbors = self._topology.get(origin, set()) & subscribers
        for peer_id in neighbors:
            nursery.start_soon(self._relay_message, msg_id, topic, origin, peer_id, 1, nursery)

        # Mark mesh peers as having expected this message (for scoring)
        mesh_peers = self._mesh.get(topic, {}).get(origin, set())
        for mp in mesh_peers:
            self.scorer.on_mesh_expected(topic, mp)

        return msg_id

    async def _relay_message(
        self,
        msg_id: str,
        topic: str,
        from_peer: str,
        to_peer: str,
        hop: int,
        nursery: trio.Nursery,
    ) -> None:
        """Relay a message to a peer, simulating network latency and fault effects."""
        from backend.events.types import GossipMessage

        fi = self._fault_injector

        # Check if target peer is failed
        if fi and hasattr(fi, 'is_peer_failed') and fi.is_peer_failed(to_peer):
            return

        # Check partition
        if fi and hasattr(fi, 'is_partitioned') and fi.is_partitioned(from_peer, to_peer):
            return

        # Check dedup
        seen = self._seen.get(to_peer, set())
        if msg_id in seen:
            return
        seen.add(msg_id)
        self._add_history(to_peer, msg_id)

        # Clear any pending IWANT for this message
        pending = self._iwant_pending.get(to_peer, set())
        pending.discard(msg_id)

        trace = self._traces.get(msg_id)
        if trace is None:
            return

        # Simulate network latency (5-50ms base)
        latency_ms = random.uniform(5.0, 50.0)
        if fi and hasattr(fi, 'get_latency'):
            latency_ms += fi.get_latency(from_peer, to_peer)

        await trio.sleep(latency_ms / 1000.0 / max(self._clock.speed, 0.1))

        sim_time = self._clock.time
        trace.add_hop(to_peer, sim_time, latency_ms, hop)

        # Scoring: first delivery credit + mesh delivery tracking
        if trace.first_delivery_peer == to_peer:
            self.scorer.on_first_delivery(topic, from_peer)
        mesh_peers_of_origin = self._mesh.get(topic, {}).get(trace.origin, set())
        if to_peer in mesh_peers_of_origin:
            self.scorer.on_mesh_delivery(topic, to_peer)

        await self._event_bus.emit(GossipMessage(
            at=sim_time, topic=topic, from_peer=to_peer, msg_id=msg_id, hops=hop
        ))

        # Continue propagation ONLY to mesh peers (not flood after first hop)
        mesh_peers = self._mesh.get(topic, {}).get(to_peer, set())
        for next_peer in mesh_peers:
            if next_peer != from_peer:
                nursery.start_soon(
                    self._relay_message, msg_id, topic, to_peer, next_peer, hop + 1, nursery
                )

    async def heartbeat(self, topic: str) -> None:
        """GossipSub v1.1 heartbeat — score-based mesh maintenance + IHAVE/IWANT."""
        from backend.events.types import GossipGraft, GossipIHave, GossipIWant, GossipPrune

        sim_time = self._clock.time
        mesh = self._mesh.get(topic, {})
        subscribers = self._subscriptions.get(topic, set())

        # Decay scores
        self.scorer.decay(topic)

        for peer_id in list(subscribers):
            # Skip fake peers (sybil/eclipse)
            if peer_id.startswith(("sybil-", "eclipse-")):
                continue

            peer_mesh = mesh.get(peer_id, set())
            neighbors = self._topology.get(peer_id, set()) & subscribers

            # PRUNE: remove low-score peers first, then excess
            to_prune = set()
            for mp in list(peer_mesh):
                score = self.scorer.compute_score(topic, mp, sim_time)
                if score < SCORE_THRESHOLD_PRUNE:
                    to_prune.add(mp)

            if len(peer_mesh) - len(to_prune) > D_HIGH:
                # Still too many — prune lowest-scored excess
                remaining = [(mp, self.scorer.compute_score(topic, mp, sim_time))
                             for mp in peer_mesh if mp not in to_prune]
                remaining.sort(key=lambda x: x[1])
                target_remove = len(peer_mesh) - len(to_prune) - D
                for mp, _ in remaining[:target_remove]:
                    to_prune.add(mp)

            for prunee in to_prune:
                peer_mesh.discard(prunee)
                self.scorer.on_prune(topic, prunee)
                await self._event_bus.emit(GossipPrune(
                    at=sim_time, from_peer=peer_id, to_peer=prunee, topic=topic
                ))

            # GRAFT: if mesh too small, add highest-scored candidates
            if len(peer_mesh) < D_LOW:
                candidates = list(neighbors - peer_mesh)
                # Filter by graft threshold and sort by score
                scored = [(c, self.scorer.compute_score(topic, c, sim_time))
                          for c in candidates if self.scorer.compute_score(topic, c, sim_time) > SCORE_THRESHOLD_GRAFT]
                scored.sort(key=lambda x: -x[1])  # Highest score first
                needed = D - len(peer_mesh)
                to_graft = [c for c, _ in scored[:needed]]

                # Fallback: if not enough high-score candidates, allow any
                if len(to_graft) < needed:
                    remaining = [c for c in candidates if c not in to_graft]
                    random.shuffle(remaining)
                    to_graft.extend(remaining[:needed - len(to_graft)])

                for graftee in to_graft:
                    peer_mesh.add(graftee)
                    mesh.setdefault(graftee, set()).add(peer_id)
                    self.scorer.on_graft(topic, graftee, sim_time)
                    await self._event_bus.emit(GossipGraft(
                        at=sim_time, from_peer=peer_id, to_peer=graftee, topic=topic
                    ))

            mesh[peer_id] = peer_mesh

            # IHAVE: gossip recent message IDs to non-mesh neighbors
            history = self._history.get(peer_id, [])
            if history:
                recent = history[-10:]
                gossip_targets = list((neighbors - peer_mesh))[:D_LAZY]
                for target in gossip_targets:
                    # Only send IHAVE for messages the target hasn't seen
                    target_seen = self._seen.get(target, set())
                    unseen = [mid for mid in recent if mid not in target_seen]
                    if unseen:
                        await self._event_bus.emit(GossipIHave(
                            at=sim_time, from_peer=peer_id, msg_ids=unseen
                        ))
                        # Target responds with IWANT for missing messages
                        self._iwant_pending.setdefault(target, set()).update(unseen)
                        await self._event_bus.emit(GossipIWant(
                            at=sim_time, from_peer=target, msg_ids=unseen
                        ))

        # Process IWANT: deliver requested messages
        await self._process_iwants(topic, mesh, sim_time)

    async def _process_iwants(self, topic: str, mesh: dict, sim_time: float) -> None:
        """Fulfill IWANT requests by delivering messages from peers who have them."""
        from backend.events.types import GossipMessage

        for peer_id, wanted in list(self._iwant_pending.items()):
            if not wanted:
                continue

            neighbors = self._topology.get(peer_id, set())
            for msg_id in list(wanted):
                # Find a neighbor who has this message
                for neighbor in neighbors:
                    if msg_id in self._seen.get(neighbor, set()):
                        # Deliver via IWANT fulfillment
                        trace = self._traces.get(msg_id)
                        if trace and peer_id not in trace.delivered_to:
                            self._seen.setdefault(peer_id, set()).add(msg_id)
                            self._add_history(peer_id, msg_id)
                            trace.add_hop(peer_id, sim_time, 0.0, trace.max_hop_depth() + 1)
                            await self._event_bus.emit(GossipMessage(
                                at=sim_time, topic=topic, from_peer=peer_id,
                                msg_id=msg_id, hops=trace.max_hop_depth()
                            ))
                        wanted.discard(msg_id)
                        break

    def _add_history(self, peer_id: str, msg_id: str) -> None:
        """Add a message to a peer's history window (bounded)."""
        hist = self._history.setdefault(peer_id, [])
        hist.append(msg_id)
        if len(hist) > HISTORY_WINDOW:
            self._history[peer_id] = hist[-HISTORY_WINDOW:]

    # ── Query Methods ──

    def get_trace(self, msg_id: str) -> dict | None:
        trace = self._traces.get(msg_id)
        return trace.to_dict() if trace else None

    def get_recent_traces(self, limit: int = 50) -> list[dict]:
        traces = sorted(self._traces.values(), key=lambda t: t.created_at, reverse=True)
        return [t.to_dict() for t in traces[:limit]]

    def get_mesh_state(self, topic: str) -> dict[str, list[str]]:
        mesh = self._mesh.get(topic, {})
        return {peer: sorted(peers) for peer, peers in mesh.items()}

    def get_scores(self, topic: str) -> dict[str, float]:
        """Return all peer scores for a topic."""
        return self.scorer.get_all_scores(topic, self._clock.time)

    def get_score_detail(self, topic: str, peer_id: str) -> dict:
        """Return detailed score breakdown for one peer."""
        return self.scorer.get_score_breakdown(topic, peer_id, self._clock.time)

    def get_analytics(self, topic: str) -> dict:
        """Return aggregated gossip analytics for the GossipTab."""
        traces = [t for t in self._traces.values() if t.topic == topic]
        subscribers = self._subscriptions.get(topic, set())
        # Filter out fake peers for stats
        honest_subscribers = {p for p in subscribers if not p.startswith(("sybil-", "eclipse-"))}
        n = len(honest_subscribers)

        if not traces:
            return {
                "total_messages": 0,
                "avg_delivery_ratio": 0,
                "avg_propagation_ms": 0,
                "avg_hops": 0,
                "delivery_ratios": [],
                "latency_cdf": [],
                "mesh_stability": {},
            }

        # Delivery ratios
        ratios = [t.delivery_ratio(n) for t in traces]
        avg_ratio = sum(ratios) / len(ratios) if ratios else 0

        # Propagation latencies
        latencies = [t.propagation_latency_ms() for t in traces if t.propagation_latency_ms() > 0]
        avg_latency = sum(latencies) / len(latencies) if latencies else 0

        # Average hops
        hops = [t.max_hop_depth() for t in traces]
        avg_hops = sum(hops) / len(hops) if hops else 0

        # Latency CDF (10 percentile points)
        latency_cdf = []
        if latencies:
            sorted_lat = sorted(latencies)
            for pct in range(0, 101, 10):
                idx = min(int(len(sorted_lat) * pct / 100), len(sorted_lat) - 1)
                latency_cdf.append({"percentile": pct, "latency_ms": round(sorted_lat[idx], 1)})

        # Delivery ratio distribution (last 20 messages)
        recent_ratios = [{"msg_id": t.msg_id, "ratio": round(t.delivery_ratio(n), 3)}
                         for t in sorted(traces, key=lambda t: t.created_at)[-20:]]

        # Mesh stability: avg degree per peer
        mesh = self._mesh.get(topic, {})
        mesh_degrees = {}
        for pid in honest_subscribers:
            m = mesh.get(pid, set())
            mesh_degrees[pid] = len(m)

        return {
            "total_messages": len(traces),
            "avg_delivery_ratio": round(avg_ratio, 3),
            "avg_propagation_ms": round(avg_latency, 1),
            "avg_hops": round(avg_hops, 1),
            "delivery_ratios": recent_ratios,
            "latency_cdf": latency_cdf,
            "mesh_stability": {
                "avg_degree": round(sum(mesh_degrees.values()) / max(len(mesh_degrees), 1), 1),
                "min_degree": min(mesh_degrees.values(), default=0),
                "max_degree": max(mesh_degrees.values(), default=0),
            },
        }

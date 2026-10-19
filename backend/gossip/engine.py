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
from backend.peers import is_attacker, is_honest

if TYPE_CHECKING:
    from backend.events.bus import EventBus
    from backend.simulation.clock import SimulationClock

logger = logging.getLogger(__name__)

# GossipSub parameters
D = 6  # Target mesh degree
D_LOW = 4  # Below this, GRAFT new peers
D_HIGH = 8  # Above this, PRUNE excess peers
D_LAZY = 6  # Number of peers to gossip IHAVE to
HEARTBEAT_INTERVAL = 1.0  # Seconds between heartbeats
SCORE_THRESHOLD_GRAFT = -5.0  # Don't graft peers with score below this
SCORE_THRESHOLD_PRUNE = -10.0  # Prune peers with score below this (regardless of mesh size)
HISTORY_WINDOW = 50  # Number of recent msg_ids to track for IHAVE/IWANT
MAX_TRACES = 5000  # Maximum number of message traces to retain
MAX_SEEN_PER_PEER = 2000  # Maximum seen msg_ids per peer


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
    duplicates: int = 0  # arrivals at peers that had already seen the message

    def add_hop(
        self,
        peer_id: str,
        received_at: float,
        relay_latency_ms: float,
        hop_index: int,
        from_peer: str | None = None,
        via: str = "mesh",
    ):
        self.hops.append(
            {
                "peer": peer_id,
                "from": from_peer,
                "via": "origin" if hop_index == 0 and from_peer is None else via,
                "time": received_at,
                "latency_ms": relay_latency_ms,
                "hop": hop_index,
            }
        )
        if peer_id != self.origin and self.first_delivery_peer is None:
            self.first_delivery_peer = peer_id
        self.delivered_to.add(peer_id)

    def delivery_ratio(self, honest: set[str]) -> float:
        """Share of `honest` peers reached. Numerator and denominator are the same set by
        construction, so attackers that received relays can never push this above 1."""
        return len(self.delivered_to & honest) / max(len(honest), 1)

    def propagation_latency_ms(self) -> float:
        """Mesh end-to-end: publish → last arrival over mesh/flood hops, in ms.

        IWANT fulfilment hops are stamped at heartbeat granularity, so they are
        excluded here and reported separately by propagation_incl_gossip_ms().
        """
        mesh_times = [h["time"] for h in self.hops if h["via"] != "iwant"]
        if len(mesh_times) < 2:
            return 0.0
        return round((max(mesh_times) - self.created_at) * 1000.0, 3)

    def propagation_incl_gossip_ms(self) -> float:
        """Publish → last arrival by any route (mesh or IHAVE/IWANT pull), in ms."""
        if len(self.hops) < 2:
            return 0.0
        return round((max(h["time"] for h in self.hops) - self.created_at) * 1000.0, 3)

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
            "delivered_count": len(self.delivered_to),  # every receiver, attackers included
            "first_delivery_peer": self.first_delivery_peer,
            "propagation_latency_ms": round(self.propagation_latency_ms(), 1),
            "propagation_incl_gossip_ms": round(self.propagation_incl_gossip_ms(), 1),
            "duplicates": self.duplicates,
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
        self._spam_counter = 0
        # Peer scoring
        self.scorer = PeerScoreTracker()

    @property
    def traces(self) -> dict[str, MessageTrace]:
        return self._traces

    def reset(self) -> None:
        """Forget every message and score. Called when the sim clock restarts (reset /
        scenario launch); otherwise the analytics window keeps the previous run's traces
        because created_at restarts from 0 and the old ones sort last."""
        self._traces.clear()
        self._seen.clear()
        self._history.clear()
        self._iwant_pending.clear()
        self._msg_counter = 0
        self._spam_counter = 0
        self.scorer = PeerScoreTracker()

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
        mesh_peers = set(
            random.sample(list(subscribed_neighbors), min(D, len(subscribed_neighbors)))
        )
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
            mesh_peers = set(
                random.sample(list(subscribed_neighbors), min(D, len(subscribed_neighbors)))
            )
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

        # Evict oldest traces to bound memory
        if len(self._traces) > MAX_TRACES:
            keys = list(self._traces.keys())
            for k in keys[: len(keys) - MAX_TRACES]:
                del self._traces[k]

        self._seen.setdefault(origin, set()).add(msg_id)
        self._add_history(origin, msg_id)

        await self._event_bus.emit(
            GossipMessage(at=sim_time, topic=topic, from_peer=origin, msg_id=msg_id, hops=0)
        )

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

    def _link_blocked(self, peer_a: str, peer_b: str) -> bool:
        """True when a fault (dropped endpoint or partition) cuts the link between two peers.

        Used by relay, heartbeat GRAFT/IHAVE and IWANT fulfilment alike, so a partition
        cannot leak through the lazy gossip path. Duck-typed: tests pass partial injectors.
        """
        fi = self._fault_injector
        if fi is None:
            return False
        failed = getattr(fi, "is_peer_failed", None)
        if failed is not None and (failed(peer_a) or failed(peer_b)):
            return True
        partitioned = getattr(fi, "is_partitioned", None)
        return partitioned is not None and partitioned(peer_a, peer_b)

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

        # Fault checks: a blocked relay is reported as a dropped hop so the UI can show
        # the particle fizzle instead of the message silently vanishing.
        if self._link_blocked(from_peer, to_peer):
            await self._event_bus.emit(
                GossipMessage(
                    at=self._clock.time,
                    topic=topic,
                    from_peer=from_peer,
                    to_peer=to_peer,
                    msg_id=msg_id,
                    hops=hop,
                    dropped=True,
                )
            )
            return

        # Check dedup
        seen = self._seen.setdefault(to_peer, set())
        if msg_id in seen:
            trace = self._traces.get(msg_id)
            if trace is not None:
                trace.duplicates += 1
            return
        seen.add(msg_id)
        # Bound seen set per peer to prevent unbounded growth
        if len(seen) > MAX_SEEN_PER_PEER:
            seen_list = list(seen)
            self._seen[to_peer] = set(seen_list[-MAX_SEEN_PER_PEER:])
        self._add_history(to_peer, msg_id)

        # Clear any pending IWANT for this message
        pending = self._iwant_pending.get(to_peer, set())
        pending.discard(msg_id)

        trace = self._traces.get(msg_id)
        if trace is None:
            return

        # Simulate network latency (5-50ms base)
        latency_ms = random.uniform(5.0, 50.0)
        if fi and hasattr(fi, "get_latency"):
            latency_ms += fi.get_latency(from_peer, to_peer)

        await trio.sleep(latency_ms / 1000.0 / max(self._clock.speed, 0.1))

        sim_time = self._clock.time
        trace.add_hop(to_peer, sim_time, latency_ms, hop, from_peer=from_peer)

        # Scoring: first delivery credit + mesh delivery tracking
        if trace.first_delivery_peer == to_peer:
            self.scorer.on_first_delivery(topic, from_peer)
        mesh_peers_of_origin = self._mesh.get(topic, {}).get(trace.origin, set())
        if to_peer in mesh_peers_of_origin:
            self.scorer.on_mesh_delivery(topic, to_peer)

        await self._event_bus.emit(
            GossipMessage(
                at=sim_time,
                topic=topic,
                from_peer=from_peer,
                to_peer=to_peer,
                msg_id=msg_id,
                hops=hop,
                latency_ms=round(latency_ms, 2),
            )
        )

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

        # Decay scores — MUST precede the misbehaviour pass: decay(0.5) after +1 converges
        # at invalid=2 (P4=-20) so the prune line is crossed on heartbeat 2; the other order
        # converges at invalid=1 (P4=-10, never < threshold).
        self.scorer.decay(topic)
        await self._misbehave(topic, mesh, subscribers, sim_time)

        for peer_id in list(subscribers):
            # Skip fake peers (sybil/eclipse) — they do no mesh maintenance of their own
            if is_attacker(peer_id):
                continue

            peer_mesh = mesh.get(peer_id, set())
            # A failed peer or a partition cuts the link for GRAFT and IHAVE too, not just relay
            neighbors = {
                n
                for n in self._topology.get(peer_id, set()) & subscribers
                if not self._link_blocked(peer_id, n)
            }

            # PRUNE: remove low-score peers first, then excess. prunee → reason
            to_prune: dict[str, str] = {}
            for mp in list(peer_mesh):
                score = self.scorer.compute_score(topic, mp, sim_time)
                if score < SCORE_THRESHOLD_PRUNE:
                    to_prune[mp] = "score"

            if len(peer_mesh) - len(to_prune) > D_HIGH:
                # Still too many — prune lowest-scored excess
                remaining = [
                    (mp, self.scorer.compute_score(topic, mp, sim_time))
                    for mp in peer_mesh
                    if mp not in to_prune
                ]
                remaining.sort(key=lambda x: x[1])
                target_remove = len(peer_mesh) - len(to_prune) - D
                for mp, _ in remaining[:target_remove]:
                    to_prune[mp] = "overflow"

            for prunee, reason in to_prune.items():
                peer_mesh.discard(prunee)
                self.scorer.on_prune(topic, prunee)
                await self._event_bus.emit(
                    GossipPrune(
                        at=sim_time, from_peer=peer_id, to_peer=prunee, topic=topic, reason=reason
                    )
                )

            # GRAFT: if mesh too small, add highest-scored candidates
            if len(peer_mesh) < D_LOW:
                candidates = list(neighbors - peer_mesh)
                # Filter by graft threshold and sort by score (compute once per candidate)
                scored = [
                    (c, s)
                    for c in candidates
                    for s in (self.scorer.compute_score(topic, c, sim_time),)
                    if s > SCORE_THRESHOLD_GRAFT
                ]
                scored.sort(key=lambda x: -x[1])  # Highest score first
                needed = D - len(peer_mesh)
                to_graft = [c for c, _ in scored[:needed]]

                # Fallback: if not enough high-score candidates, allow any
                if len(to_graft) < needed:
                    remaining = [c for c in candidates if c not in to_graft]
                    random.shuffle(remaining)
                    to_graft.extend(remaining[: needed - len(to_graft)])

                for graftee in to_graft:
                    peer_mesh.add(graftee)
                    mesh.setdefault(graftee, set()).add(peer_id)
                    self.scorer.on_graft(topic, graftee, sim_time)
                    await self._event_bus.emit(
                        GossipGraft(at=sim_time, from_peer=peer_id, to_peer=graftee, topic=topic)
                    )

            mesh[peer_id] = peer_mesh

            # IHAVE: gossip recent message IDs to non-mesh neighbors
            history = self._history.get(peer_id, [])
            if history:
                recent = history[-10:]
                gossip_targets = list(neighbors - peer_mesh)[:D_LAZY]
                for target in gossip_targets:
                    # Only send IHAVE for messages the target hasn't seen
                    target_seen = self._seen.get(target, set())
                    unseen = [mid for mid in recent if mid not in target_seen]
                    if unseen:
                        await self._event_bus.emit(
                            GossipIHave(at=sim_time, from_peer=peer_id, msg_ids=unseen)
                        )
                        # Target responds with IWANT for missing messages
                        self._iwant_pending.setdefault(target, set()).update(unseen)
                        await self._event_bus.emit(
                            GossipIWant(at=sim_time, from_peer=target, msg_ids=unseen)
                        )

        # Process IWANT: deliver requested messages
        await self._process_iwants(topic, mesh, sim_time)

    async def _misbehave(
        self, topic: str, mesh: dict, subscribers: set[str], sim_time: float
    ) -> None:
        """Sybil attackers spam every honest mesh they sit in, once per heartbeat.

        One P4 penalty per attacker per heartbeat (the scorer is a single global tracker,
        so a per-target penalty would prune a fanout-4 sybil in one beat instead of two).
        Eclipse attackers stay silent on purpose: scoring only sees their P3 deficit
        (capped at -0.25), which is why an eclipse needs the fault to clear.
        """
        from backend.events.types import GossipMessage

        for attacker in [p for p in subscribers if p.startswith("sybil-")]:
            self.scorer.on_invalid_message(topic, attacker)
            for honest, peers in mesh.items():
                if attacker in peers and is_honest(honest):
                    self._spam_counter += 1
                    await self._event_bus.emit(
                        GossipMessage(
                            at=sim_time,
                            topic=topic,
                            from_peer=attacker,
                            to_peer=honest,
                            msg_id=f"spam-{self._spam_counter}",
                            hops=0,
                            via="spam",
                        )
                    )

    async def _process_iwants(self, topic: str, mesh: dict, sim_time: float) -> None:
        """Fulfill IWANT requests by delivering messages from peers who have them."""
        from backend.events.types import GossipMessage

        for peer_id, wanted in list(self._iwant_pending.items()):
            if not wanted:
                continue

            neighbors = self._topology.get(peer_id, set())
            for msg_id in list(wanted):
                # Find a neighbor who has this message and can still reach us
                for neighbor in neighbors:
                    if self._link_blocked(neighbor, peer_id):
                        continue
                    if msg_id in self._seen.get(neighbor, set()):
                        # Deliver via IWANT fulfillment
                        trace = self._traces.get(msg_id)
                        if trace and peer_id not in trace.delivered_to:
                            self._seen.setdefault(peer_id, set()).add(msg_id)
                            self._add_history(peer_id, msg_id)
                            trace.add_hop(
                                peer_id,
                                sim_time,
                                0.0,
                                trace.max_hop_depth() + 1,
                                from_peer=neighbor,
                                via="iwant",
                            )
                            await self._event_bus.emit(
                                GossipMessage(
                                    at=sim_time,
                                    topic=topic,
                                    from_peer=neighbor,
                                    to_peer=peer_id,
                                    msg_id=msg_id,
                                    hops=trace.max_hop_depth(),
                                    via="iwant",
                                )
                            )
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
        honest_subscribers = {p for p in subscribers if is_honest(p)}

        if not traces:
            return {
                "total_messages": 0,
                "avg_delivery_ratio": 0,
                "avg_propagation_ms": 0,
                "avg_hops": 0,
                "avg_duplicates": 0,
                "recent_delivery_ratio": 0,
                "delivery_ratios": [],
                "latency_cdf": [],
                "mesh_stability": {},
            }

        # Delivery ratios
        ratios = [t.delivery_ratio(honest_subscribers) for t in traces]
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

        # Delivery ratio distribution (last 20 messages). The windowed mean is what a
        # 60 s reel can move; the lifetime mean above barely budges after thousands of msgs.
        recent_ratios = [
            {"msg_id": t.msg_id, "ratio": round(t.delivery_ratio(honest_subscribers), 3)}
            for t in sorted(traces, key=lambda t: t.created_at)[-20:]
        ]
        recent_delivery_ratio = sum(r["ratio"] for r in recent_ratios) / max(len(recent_ratios), 1)
        avg_duplicates = sum(t.duplicates for t in traces) / len(traces)

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
            "avg_duplicates": round(avg_duplicates, 2),
            "recent_delivery_ratio": round(recent_delivery_ratio, 3),
            "delivery_ratios": recent_ratios,
            "latency_cdf": latency_cdf,
            "mesh_stability": {
                "avg_degree": round(sum(mesh_degrees.values()) / max(len(mesh_degrees), 1), 1),
                "min_degree": min(mesh_degrees.values(), default=0),
                "max_degree": max(mesh_degrees.values(), default=0),
            },
        }

"""GossipSub v1.1 peer scoring.

Each peer maintains a score per-topic that determines mesh membership priority.
Scores are computed from four components (P1-P4) following the GossipSub v1.1 spec:

P1: Time in mesh         — rewards long-lived mesh membership
P2: First message delivery — rewards peers that deliver messages first
P3: Mesh message delivery  — penalizes peers that don't deliver expected messages
P4: Invalid messages       — penalizes peers sending invalid/duplicate messages
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass
class PeerScoreParams:
    """Tunable scoring weights."""

    # P1: Time in mesh (positive, capped)
    time_in_mesh_weight: float = 0.5
    time_in_mesh_quantum: float = 1.0  # seconds per unit
    time_in_mesh_cap: float = 10.0  # max score from P1

    # P2: First message deliveries (positive)
    first_message_weight: float = 1.0
    first_message_decay: float = 0.9  # per heartbeat

    # P3: Mesh message delivery ratio (negative when low)
    mesh_delivery_weight: float = -1.0
    mesh_delivery_threshold: float = 0.5  # below this ratio → penalty
    mesh_delivery_activation: float = 5.0  # seconds before P3 activates

    # P4: Invalid messages (negative)
    invalid_message_weight: float = -10.0
    invalid_message_decay: float = 0.5


@dataclass
class TopicPeerScore:
    """Per-topic score state for a single peer."""

    mesh_join_time: float = -1.0
    first_message_deliveries: float = 0.0
    mesh_messages_delivered: int = 0
    mesh_messages_expected: int = 0
    invalid_messages: float = 0.0
    in_mesh: bool = False

    def time_in_mesh(self, now: float) -> float:
        if not self.in_mesh or self.mesh_join_time < 0:
            return 0.0
        return now - self.mesh_join_time

    def delivery_ratio(self) -> float:
        if self.mesh_messages_expected <= 0:
            return 1.0
        return self.mesh_messages_delivered / self.mesh_messages_expected


class PeerScoreTracker:
    """Tracks and computes GossipSub v1.1 scores for all peers."""

    def __init__(self, params: PeerScoreParams | None = None) -> None:
        self._params = params or PeerScoreParams()
        # topic → peer_id → TopicPeerScore
        self._scores: dict[str, dict[str, TopicPeerScore]] = {}

    def _get(self, topic: str, peer_id: str) -> TopicPeerScore:
        return self._scores.setdefault(topic, {}).setdefault(peer_id, TopicPeerScore())

    def on_graft(self, topic: str, peer_id: str, sim_time: float) -> None:
        """Called when a peer joins the mesh."""
        s = self._get(topic, peer_id)
        s.in_mesh = True
        s.mesh_join_time = sim_time

    def on_prune(self, topic: str, peer_id: str) -> None:
        """Called when a peer leaves the mesh."""
        s = self._get(topic, peer_id)
        s.in_mesh = False

    def on_first_delivery(self, topic: str, peer_id: str) -> None:
        """Called when this peer is the first to deliver a message."""
        s = self._get(topic, peer_id)
        s.first_message_deliveries += 1

    def on_mesh_delivery(self, topic: str, peer_id: str) -> None:
        """Called when a mesh peer delivers a message it was expected to."""
        s = self._get(topic, peer_id)
        s.mesh_messages_delivered += 1

    def on_mesh_expected(self, topic: str, peer_id: str) -> None:
        """Called for each message a mesh peer was expected to deliver."""
        s = self._get(topic, peer_id)
        s.mesh_messages_expected += 1

    def on_invalid_message(self, topic: str, peer_id: str) -> None:
        """Called when a peer sends an invalid/already-seen message."""
        s = self._get(topic, peer_id)
        s.invalid_messages += 1

    def decay(self, topic: str) -> None:
        """Apply per-heartbeat decay to counters."""
        p = self._params
        for _peer_id, s in self._scores.get(topic, {}).items():
            s.first_message_deliveries *= p.first_message_decay
            s.invalid_messages *= p.invalid_message_decay

    def compute_score(self, topic: str, peer_id: str, sim_time: float) -> float:
        """Compute the aggregate score for a peer on a topic."""
        p = self._params
        s = self._get(topic, peer_id)

        # P1: Time in mesh
        p1_raw = s.time_in_mesh(sim_time) / max(p.time_in_mesh_quantum, 0.01)
        p1 = min(p1_raw, p.time_in_mesh_cap) * p.time_in_mesh_weight

        # P2: First message deliveries
        p2 = s.first_message_deliveries * p.first_message_weight

        # P3: Mesh delivery ratio (only after activation period)
        p3 = 0.0
        if s.in_mesh and s.time_in_mesh(sim_time) > p.mesh_delivery_activation:
            ratio = s.delivery_ratio()
            if ratio < p.mesh_delivery_threshold:
                deficit = p.mesh_delivery_threshold - ratio
                p3 = deficit * deficit * p.mesh_delivery_weight

        # P4: Invalid messages
        p4 = s.invalid_messages * p.invalid_message_weight

        return p1 + p2 + p3 + p4

    def get_all_scores(self, topic: str, sim_time: float) -> dict[str, float]:
        """Return scores for all peers in a topic."""
        result = {}
        for peer_id in self._scores.get(topic, {}):
            result[peer_id] = round(self.compute_score(topic, peer_id, sim_time), 3)
        return result

    def get_score_breakdown(self, topic: str, peer_id: str, sim_time: float) -> dict:
        """Return detailed score breakdown for a single peer."""
        p = self._params
        s = self._get(topic, peer_id)

        p1_raw = s.time_in_mesh(sim_time) / max(p.time_in_mesh_quantum, 0.01)
        p1 = min(p1_raw, p.time_in_mesh_cap) * p.time_in_mesh_weight

        p2 = s.first_message_deliveries * p.first_message_weight

        p3 = 0.0
        if s.in_mesh and s.time_in_mesh(sim_time) > p.mesh_delivery_activation:
            ratio = s.delivery_ratio()
            if ratio < p.mesh_delivery_threshold:
                deficit = p.mesh_delivery_threshold - ratio
                p3 = deficit * deficit * p.mesh_delivery_weight

        p4 = s.invalid_messages * p.invalid_message_weight

        return {
            "peer_id": peer_id,
            "total": round(p1 + p2 + p3 + p4, 3),
            "p1_time_in_mesh": round(p1, 3),
            "p2_first_delivery": round(p2, 3),
            "p3_mesh_delivery": round(p3, 3),
            "p4_invalid_messages": round(p4, 3),
            "in_mesh": s.in_mesh,
            "delivery_ratio": round(s.delivery_ratio(), 3),
            "first_deliveries": round(s.first_message_deliveries, 1),
            "time_in_mesh_s": round(s.time_in_mesh(sim_time), 1),
        }

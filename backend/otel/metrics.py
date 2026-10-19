"""GossipMetrics — Prometheus text exposition with Lighthouse's gossipsub metric names.

Counters are updated O(1) per event by a bus sink; gauges/histograms are computed at
scrape time from the engine. Names, label keys and label values on the `gossipsub_*`
family match what rust-libp2p/Lighthouse emit, so one Grafana query works for both the
simulation row (job="luminar") and a real beacon node row (job="beacon"). Numbers are
NOT comparable across rows (toy constants vs mainnet thresholds) — same shape only.
"""

from __future__ import annotations

import time
from collections import Counter
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from backend.events.types import BaseEvent
    from backend.simulation.engine import SimulationEngine

# Luminar's score buckets. Lighthouse's are [-16000,...,100]; different bucket sets must
# never share a heatmap panel, so the dashboard keeps one panel per row.
SCORE_BUCKETS = [-20.0, -10.0, -5.0, -1.0, 0.0, 2.0, 5.0, 10.0]
CHURN_REASON = {"score": "BadScore", "overflow": "Excess", "fault": "Dc"}  # Lighthouse ChurnLabel

Labels = tuple[tuple[str, str], ...]


def _lbl(**kw: str) -> Labels:
    return tuple(sorted(kw.items()))


def _esc(v: str) -> str:
    """Escape a label value per the Prometheus text exposition format."""
    return v.replace("\\", "\\\\").replace('"', '\\"').replace("\n", "\\n")


def _fmt_labels(labels: Labels) -> str:
    if not labels:
        return ""
    return "{" + ",".join(f'{k}="{_esc(v)}"' for k, v in labels) + "}"


class GossipMetrics:
    def __init__(self, topic: str = "lumina/blocks/1.0") -> None:
        self.counters: Counter[tuple[str, Labels]] = Counter()
        self.gauges: dict[tuple[str, Labels], float] = {}
        self.active_faults = 0
        # Pre-register the counters a demo cares about at 0: Prometheus' rate() needs two
        # samples of a series, so a counter born at 20 on the Sybil prune would show no spike.
        for reason in ("BadScore", "Excess", "Prune"):
            self.counters[("gossipsub_mesh_peer_churn_events", _lbl(hash=topic, reason=reason))] = 0
        self.counters[
            ("gossipsub_mesh_peer_inclusion_events", _lbl(hash=topic, reason="Random"))
        ] = 0
        for name in (
            "gossipsub_topic_msg_published",
            "gossipsub_topic_msg_recv_counts",
            "gossipsub_topic_iwant_msgs",
        ):
            self.counters[(name, _lbl(hash=topic))] = 0
        for name in ("luminar_invalid_messages_total", "luminar_dropped_hops_total"):
            self.counters[(name, _lbl(topic=topic))] = 0

    # ── Sink (trio thread, O(1)) ──

    def sink(self, e: BaseEvent) -> None:
        et = e.event_type
        if et == "GossipMessage":
            if e.via == "spam":
                self.counters[("luminar_invalid_messages_total", _lbl(topic=e.topic))] += 1
            elif e.dropped:
                self.counters[("luminar_dropped_hops_total", _lbl(topic=e.topic))] += 1
            elif e.via == "iwant":
                self.counters[("gossipsub_topic_iwant_msgs", _lbl(hash=e.topic))] += 1
                self.counters[("gossipsub_topic_msg_recv_counts", _lbl(hash=e.topic))] += 1
            elif e.hops == 0:
                self.counters[("gossipsub_topic_msg_published", _lbl(hash=e.topic))] += 1
            else:
                self.counters[("gossipsub_topic_msg_recv_counts", _lbl(hash=e.topic))] += 1
        elif et == "GossipGraft":
            self.counters[
                ("gossipsub_mesh_peer_inclusion_events", _lbl(hash=e.topic, reason="Random"))
            ] += 1
        elif et == "GossipPrune":
            reason = CHURN_REASON.get(e.reason, "Prune")
            self.counters[
                ("gossipsub_mesh_peer_churn_events", _lbl(hash=e.topic, reason=reason))
            ] += 1
        elif et == "GossipIHave":
            self.counters[("luminar_ihave_msgs", _lbl())] += 1
        elif et == "ScenarioPhaseFired":
            self.gauges[
                (
                    "luminar_scenario_phase",
                    _lbl(scenario=e.scenario_id, label=e.label, action=e.action),
                )
            ] = time.time() * 1000  # wall ms: Grafana annotations use the value as the time
        elif et == "FaultInjected":
            self.active_faults += 1
            self.counters[("luminar_faults_injected_total", _lbl(type=e.fault_type))] += 1
        elif et == "FaultCleared":
            self.active_faults = max(0, self.active_faults - 1)

    # ── Exposition (asyncio thread) ──

    def render(self, engine: SimulationEngine | None, telemetry_peers: int = 0) -> str:
        out: list[str] = []
        seen_types: set[str] = set()

        def line(name: str, labels: Labels, value: float, kind: str, help_: str = "") -> None:
            if name not in seen_types:
                seen_types.add(name)
                if help_:
                    out.append(f"# HELP {name} {help_}")
                out.append(f"# TYPE {name} {kind}")
            v = int(value) if float(value).is_integer() else round(value, 4)
            out.append(f"{name}{_fmt_labels(labels)} {v}")

        for (name, labels), value in sorted(self.counters.items()):
            line(name, labels, value, "counter")
        for (name, labels), value in sorted(self.gauges.items()):
            line(name, labels, value, "gauge", "wall-clock ms at which the phase fired")
        line("luminar_faults_active", _lbl(), self.active_faults, "gauge")
        line("luminar_telemetry_peers", _lbl(source="json"), telemetry_peers, "gauge")

        if engine is None:
            return "\n".join(out) + "\n"

        topic = "lumina/blocks/1.0"
        try:
            gossip = engine.node_pool.gossip
            mesh = gossip.get_mesh_state(topic)
            scores = gossip.get_scores(topic)
            analytics = gossip.get_analytics(topic)
        except RuntimeError:  # concurrent mutation on the trio thread; skip this scrape
            return "\n".join(out) + "\n"

        honest = {p: m for p, m in mesh.items() if p.startswith("peer-")}
        degrees = [len(m) for m in honest.values()]
        avg_deg = sum(degrees) / len(degrees) if degrees else 0.0
        line(
            "gossipsub_mesh_peer_counts",
            _lbl(topic_hash=topic, supports_partial="false"),
            avg_deg,
            "gauge",
            "mean mesh degree over honest peers (Lighthouse MeshPeerLabel)",
        )
        line("luminar_mesh_peer_counts_min", _lbl(topic=topic), min(degrees, default=0), "gauge")
        line("luminar_mesh_peer_counts_max", _lbl(topic=topic), max(degrees, default=0), "gauge")

        vals = sorted(scores.values())
        name = "gossipsub_score_per_mesh"
        out.append(
            f"# HELP {name} peer score distribution (Luminar toy constants, NOT Lighthouse's)"
        )
        out.append(f"# TYPE {name} histogram")
        for le in SCORE_BUCKETS:
            n = sum(1 for v in vals if v <= le)
            out.append(f'{name}_bucket{{hash="{topic}",le="{le}"}} {n}')
        out.append(f'{name}_bucket{{hash="{topic}",le="+Inf"}} {len(vals)}')
        out.append(f'{name}_sum{{hash="{topic}"}} {round(sum(vals), 4)}')
        out.append(f'{name}_count{{hash="{topic}"}} {len(vals)}')

        bands = Counter(
            "pruned"
            if v < -10
            else "below_graft"
            if v < -5
            else "negative"
            if v < 0
            else "zero"
            if v == 0
            else "positive"
            for v in vals
        )
        for band in ("pruned", "below_graft", "negative", "zero", "positive"):
            line("luminar_peers_by_score_band", _lbl(band=band), bands.get(band, 0), "gauge")

        line("luminar_delivery_ratio", _lbl(), analytics.get("avg_delivery_ratio", 0), "gauge")
        line(
            "luminar_recent_delivery_ratio",
            _lbl(),
            analytics.get("recent_delivery_ratio", 0),
            "gauge",
        )
        line("luminar_propagation_ms", _lbl(), analytics.get("avg_propagation_ms", 0), "gauge")
        line("luminar_avg_hops", _lbl(), analytics.get("avg_hops", 0), "gauge")
        line("luminar_duplicates_per_msg", _lbl(), analytics.get("avg_duplicates", 0), "gauge")
        line("luminar_sim_time_seconds", _lbl(), engine.clock.time, "gauge")
        line("luminar_speed", _lbl(), engine.clock.speed, "gauge")
        line("luminar_node_count", _lbl(), engine.node_pool.node_count, "gauge")
        attackers = sum(1 for p in mesh if p.startswith(("sybil-", "eclipse-")))
        line("luminar_attackers", _lbl(), attackers, "gauge")
        return "\n".join(out) + "\n"

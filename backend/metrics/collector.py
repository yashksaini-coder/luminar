"""MetricsCollector — aggregates simulation metrics for the dashboard.

Computes CDF data, traffic stats, bandwidth, and per-node health scores.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from backend.events.types import EventCategory

if TYPE_CHECKING:
    from backend.events.bus import EventBus
    from backend.simulation.node_pool import NodePool


class MetricsCollector:
    def __init__(self, event_bus: EventBus, node_pool: NodePool) -> None:
        self._event_bus = event_bus
        self._node_pool = node_pool

    def get_snapshot(self) -> dict:
        """Return aggregated metrics for the dashboard."""
        nodes = self._node_pool.get_all_status()

        state_counts = {}
        total_sent = 0
        total_received = 0

        for node in nodes:
            state = node["state"]
            state_counts[state] = state_counts.get(state, 0) + 1
            total_sent += node["messages_sent"]
            total_received += node["messages_received"]

        # Count events by category — take a snapshot to avoid mutation during iteration
        event_counts = {}
        try:
            ring_snapshot = list(self._event_bus.ring)
        except RuntimeError:
            ring_snapshot = []
        for event in ring_snapshot:
            cat = event.category.value
            event_counts[cat] = event_counts.get(cat, 0) + 1

        return {
            "node_count": len(nodes),
            "state_distribution": state_counts,
            "total_messages_sent": total_sent,
            "total_messages_received": total_received,
            "event_counts": event_counts,
            "total_events": self._event_bus.event_count,
            "stream_manager": {
                "open": self._node_pool.stream_manager.open_count,
                "max": self._node_pool.stream_manager.max_streams,
                "available": self._node_pool.stream_manager.available,
            },
            "dht_coordinator": {
                "active": self._node_pool.dht_coordinator.active_count,
                "available": self._node_pool.dht_coordinator.available,
            },
        }

"""SimulationEngine — orchestrates the full P2P simulation lifecycle.

Manages the clock, node pool, event bus, and coordinates startup/shutdown.
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

import trio

from backend.events.bus import EventBus
from backend.events.types import SimulationStateChanged
from backend.simulation.clock import SimulationClock
from backend.simulation.node_pool import NodePool

if TYPE_CHECKING:
    pass

logger = logging.getLogger(__name__)


class SimulationEngine:
    def __init__(
        self,
        n_nodes: int = 20,
        max_streams: int = 64,
        max_dht_queries: int = 8,
    ) -> None:
        self.event_bus = EventBus()
        self.clock = SimulationClock(self.event_bus)
        self.node_pool = NodePool(
            event_bus=self.event_bus,
            clock=self.clock,
            n_nodes=n_nodes,
            max_streams_per_node=max_streams,
            max_dht_queries=max_dht_queries,
        )
        self._nursery: trio.Nursery | None = None

    @property
    def state(self) -> str:
        if self._nursery is None:
            return "stopped"
        return "paused" if self.clock.paused else "running"

    async def start(self, nursery: trio.Nursery) -> None:
        """Start the simulation engine within the given nursery."""
        self._nursery = nursery
        await nursery.start(self.clock.run)
        await self.node_pool.spawn_all(nursery)
        logger.info("Simulation engine started with %d nodes", self.node_pool.node_count)

    async def play(self) -> None:
        self.clock.play()
        await self.event_bus.emit(
            SimulationStateChanged(at=self.clock.time, state="running", speed=self.clock.speed)
        )

    async def pause(self) -> None:
        self.clock.pause()
        await self.event_bus.emit(
            SimulationStateChanged(at=self.clock.time, state="paused", speed=self.clock.speed)
        )

    async def set_speed(self, speed: float) -> None:
        self.clock.speed = speed
        await self.event_bus.emit(
            SimulationStateChanged(at=self.clock.time, state=self.state, speed=self.clock.speed)
        )

    async def reset(self) -> None:
        self.clock.reset()
        self.event_bus.clear()
        await self.event_bus.emit(
            SimulationStateChanged(at=0.0, state="stopped", speed=self.clock.speed)
        )

    def wire_topology(self, edges: list[tuple[str, str]], positions: dict[str, tuple[float, float]]) -> None:
        """Apply topology to the node pool."""
        for peer_id, (x, y) in positions.items():
            node = self.node_pool.get_node(peer_id)
            if node:
                node.x = x
                node.y = y
        self.node_pool.wire_topology(edges)

    def get_snapshot(self) -> dict:
        """Return current simulation state for API responses."""
        return {
            "state": self.state,
            "time": self.clock.time,
            "speed": self.clock.speed,
            "node_count": self.node_pool.node_count,
            "event_count": self.event_bus.event_count,
            "nodes": self.node_pool.get_all_status(),
            "gossip": {
                "recent_traces": self.node_pool.gossip.get_recent_traces(10),
                "mesh_size": len(self.node_pool.gossip.get_mesh_state("lumina/blocks/1.0")),
            },
        }

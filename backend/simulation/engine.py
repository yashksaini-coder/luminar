"""SimulationEngine — orchestrates the full P2P simulation lifecycle.

Manages the clock, node pool, event bus, and coordinates startup/shutdown.
"""

from __future__ import annotations

import logging
import time
import uuid
from typing import TYPE_CHECKING

import trio

from backend.events.bus import EventBus
from backend.events.types import SimulationStateChanged
from backend.peers import is_honest
from backend.simulation.clock import SimulationClock
from backend.simulation.node_pool import DEFAULT_TOPIC, NodePool

if TYPE_CHECKING:
    pass

logger = logging.getLogger(__name__)

MESH_MAP_MAX_NODES = 100


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
        self.run_id = ""
        self.t0_wall_ns = 0
        self.new_run()

    def new_run(self) -> None:
        """Re-anchor the run: new id (scopes OTel trace ids) and wall-clock origin for sim t=0.

        Called on construction, reset() and scenario launch so two runs never share trace ids
        in Jaeger even though msg counters restart at msg-1.
        """
        self.run_id = uuid.uuid4().hex[:12]
        self.t0_wall_ns = time.time_ns()

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
        self.node_pool.gossip.reset()
        self.node_pool.reset()
        self.new_run()
        await self.event_bus.emit(
            SimulationStateChanged(at=0.0, state="stopped", speed=self.clock.speed)
        )

    def wire_topology(
        self,
        edges: list[tuple[str, str]],
        positions: dict[str, tuple[float, float]],
    ) -> None:
        """Apply topology to the node pool."""
        for peer_id, (x, y) in positions.items():
            node = self.node_pool.get_node(peer_id)
            if node:
                node.x = x
                node.y = y
        self.node_pool.wire_topology(edges)

    def _attacker_nodes(self) -> list[dict]:
        """Synthetic PeerNode dicts for live sybil/eclipse attackers (not in the NodePool)."""
        gossip = self.node_pool.gossip
        fi = gossip._fault_injector
        ids = fi.attacker_ids() if fi is not None and hasattr(fi, "attacker_ids") else []
        if not ids:
            return []
        mesh = gossip.get_mesh_state(DEFAULT_TOPIC)
        scores = gossip.get_scores(DEFAULT_TOPIC)
        out = []
        for i, aid in enumerate(ids):
            targets = sorted(p for p, peers in mesh.items() if is_honest(p) and aid in peers)
            anchor = self.node_pool.get_node(targets[0]) if targets else None
            out.append(
                {
                    "peer_id": aid,
                    "index": 20000 + i,  # above telemetry's 10000+ range
                    "state": "attacker",
                    "connected_peers": targets,
                    "x": float(anchor.x + 12.0 if anchor else 0.0),
                    "y": float(anchor.y + 12.0 if anchor else 0.0),
                    "messages_sent": 0,
                    "messages_received": 0,
                    "gossip_score": float(scores.get(aid, 0.0)),
                }
            )
        return out

    def get_snapshot(self) -> dict:
        """Return current simulation state for API responses."""
        return {
            "state": self.state,
            "time": self.clock.time,
            "speed": self.clock.speed,
            "node_count": self.node_pool.node_count,
            "event_count": self.event_bus.event_count,
            "nodes": self.node_pool.get_all_status() + self._attacker_nodes(),
            "gossip": {
                "recent_traces": self.node_pool.gossip.get_recent_traces(10),
                "mesh_size": len(self.node_pool.gossip.get_mesh_state(DEFAULT_TOPIC)),
                # ponytail: full mesh map every 500 ms is fine to 100 nodes (~600 ids);
                # above that send nothing rather than 3K ids per frame on the 500 preset.
                "mesh": (
                    self.node_pool.gossip.get_mesh_state(DEFAULT_TOPIC)
                    if self.node_pool.node_count <= MESH_MAP_MAX_NODES
                    else {}
                ),
            },
        }

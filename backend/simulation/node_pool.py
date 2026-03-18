"""NodePool — manages N simulated P2P peers with topology-aware gossip.

Peers only communicate with their topology neighbors. Message propagation
follows the GossipSub mesh overlay, tracked hop-by-hop for trace visualization.
"""

from __future__ import annotations

import logging
import random
from dataclasses import dataclass, field
from enum import Enum
from typing import TYPE_CHECKING

import trio

from backend.concurrency.dht_coordinator import DHTQueryCoordinator
from backend.concurrency.stream_manager import StreamManager
from backend.gossip.engine import GossipEngine

if TYPE_CHECKING:
    from backend.events.bus import EventBus
    from backend.simulation.clock import SimulationClock

logger = logging.getLogger(__name__)

DEFAULT_TOPIC = "lumina/blocks/1.0"


class NodeState(str, Enum):
    IDLE = "idle"
    ORIGIN = "origin"
    RECEIVING = "receiving"
    DECODED = "decoded"
    ERROR = "error"
    JOINING = "joining"
    FAILED = "failed"


@dataclass
class PeerNode:
    peer_id: str
    index: int
    state: NodeState = NodeState.IDLE
    connected_peers: list[str] = field(default_factory=list)
    x: float = 0.0
    y: float = 0.0
    messages_sent: int = 0
    messages_received: int = 0
    gossip_score: float = 1.0

    def to_dict(self) -> dict:
        return {
            "peer_id": self.peer_id,
            "index": self.index,
            "state": self.state.value,
            "connected_peers": self.connected_peers,
            "x": self.x,
            "y": self.y,
            "messages_sent": self.messages_sent,
            "messages_received": self.messages_received,
            "gossip_score": round(self.gossip_score, 3),
        }


class NodePool:
    def __init__(
        self,
        event_bus: EventBus,
        clock: SimulationClock,
        n_nodes: int = 20,
        max_streams_per_node: int = 64,
        max_dht_queries: int = 8,
    ) -> None:
        self._event_bus = event_bus
        self._clock = clock
        self._nodes: dict[str, PeerNode] = {}
        self._nursery: trio.Nursery | None = None

        # Shared concurrency controllers
        self.stream_manager = StreamManager(event_bus, max_streams=max_streams_per_node)
        self.dht_coordinator = DHTQueryCoordinator(event_bus, max_parallel=max_dht_queries)

        # GossipSub engine (fault_injector wired in after construction)
        self.gossip = GossipEngine(event_bus, clock)

        # Create nodes
        for i in range(n_nodes):
            peer_id = f"peer-{i}"
            self._nodes[peer_id] = PeerNode(
                peer_id=peer_id,
                index=i,
                x=random.uniform(-300, 300),
                y=random.uniform(-300, 300),
            )

    @property
    def node_count(self) -> int:
        return len(self._nodes)

    def get_node(self, peer_id: str) -> PeerNode | None:
        return self._nodes.get(peer_id)

    def get_all_status(self) -> list[dict]:
        return [node.to_dict() for node in self._nodes.values()]

    def wire_topology(self, edges: list[tuple[str, str]]) -> None:
        """Apply topology edges to nodes and gossip engine."""
        # Clear old connections first
        for node in self._nodes.values():
            node.connected_peers.clear()

        # Wire node connections
        for a, b in edges:
            node_a = self.get_node(a)
            node_b = self.get_node(b)
            if node_a and b not in node_a.connected_peers:
                node_a.connected_peers.append(b)
            if node_b and a not in node_b.connected_peers:
                node_b.connected_peers.append(a)

        # Set topology in gossip engine
        self.gossip.set_topology(edges)

        # Subscribe all nodes to default topic
        peer_ids = list(self._nodes.keys())
        self.gossip.subscribe_all(peer_ids, DEFAULT_TOPIC)

    async def spawn_all(self, nursery: trio.Nursery) -> None:
        """Start all peer simulation loops."""
        from backend.events.types import PeerConnected

        self._nursery = nursery

        for node in self._nodes.values():
            node.state = NodeState.JOINING
            await self._event_bus.emit(
                PeerConnected(at=self._clock.time, peer_id=node.peer_id)
            )
            node.state = NodeState.IDLE

        # Start peer loops and heartbeat
        for node in self._nodes.values():
            nursery.start_soon(self._peer_loop, node)
        nursery.start_soon(self._heartbeat_loop)
        nursery.start_soon(self._dht_walk_loop)

    async def _peer_loop(self, node: PeerNode) -> None:
        """Main loop for a simulated peer — periodic gossip publishing."""
        # Stagger startup so not all peers publish at once
        await trio.sleep(random.uniform(0.1, 2.0))

        while True:
            if self._clock.paused:
                await trio.sleep(0.1)
                continue

            if node.state == NodeState.FAILED:
                await trio.sleep(0.5)
                continue

            # Each peer publishes a message every 5-15 sim-seconds
            wait = random.uniform(5.0, 15.0) / max(self._clock.speed, 0.1)
            await trio.sleep(wait)

            if self._clock.paused or node.state == NodeState.FAILED:
                continue

            if self._nursery is None:
                continue

            # Publish a gossip message — propagation handled by GossipEngine
            node.state = NodeState.ORIGIN
            try:
                msg_id = await self.gossip.publish(
                    origin=node.peer_id,
                    topic=DEFAULT_TOPIC,
                    nursery=self._nursery,
                )
                node.messages_sent += 1
                logger.debug("%s published %s", node.peer_id, msg_id)
            except Exception as e:
                logger.debug("Publish error for %s: %s", node.peer_id, e)
                node.state = NodeState.ERROR
                await trio.sleep(0.3)

            # Return to idle after a short display period
            await trio.sleep(0.2 / max(self._clock.speed, 0.1))
            if node.state == NodeState.ORIGIN:
                node.state = NodeState.IDLE

    async def _heartbeat_loop(self) -> None:
        """Periodic GossipSub heartbeat — maintain mesh, emit GRAFT/PRUNE."""
        while True:
            if self._clock.paused:
                await trio.sleep(0.1)
                continue

            await trio.sleep(1.0 / max(self._clock.speed, 0.1))

            if not self._clock.paused:
                await self.gossip.heartbeat(DEFAULT_TOPIC)

                # Update node states and scores from gossip engine
                scores = self.gossip.get_scores(DEFAULT_TOPIC)
                for node in self._nodes.values():
                    if node.state == NodeState.FAILED:
                        continue

                    # Sync gossip score
                    if node.peer_id in scores:
                        node.gossip_score = scores[node.peer_id]

                    seen = self.gossip._seen.get(node.peer_id, set())
                    if len(seen) > node.messages_received:
                        node.messages_received = len(seen)
                        if node.state == NodeState.IDLE:
                            node.state = NodeState.RECEIVING
                    elif node.state == NodeState.RECEIVING:
                        node.state = NodeState.DECODED
                    elif node.state == NodeState.DECODED:
                        node.state = NodeState.IDLE

    async def _dht_walk_loop(self) -> None:
        """Periodic random DHT walk — exercises the DHTQueryCoordinator."""
        while True:
            if self._clock.paused:
                await trio.sleep(0.1)
                continue

            await trio.sleep(3.0 / max(self._clock.speed, 0.1))

            if self._clock.paused:
                continue

            # Pick a random peer to initiate a DHT query
            peers = [p for p in self._nodes.values() if p.state != NodeState.FAILED]
            if not peers:
                continue

            initiator = random.choice(peers)
            target_key = f"key-{random.randint(0, 999)}"

            try:
                await self.dht_coordinator.query_peer(
                    initiator=initiator.peer_id,
                    target_key=target_key,
                    sim_time=self._clock.time,
                )
            except Exception:
                pass  # Query failures are logged by the coordinator

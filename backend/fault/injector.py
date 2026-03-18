"""FaultInjector — injects network faults that affect live simulation behavior.

Faults are identified by unique IDs and actively modify gossip propagation:
- Latency: adds extra delay to message relay between specific peers
- Partition: blocks message relay across partition boundary
- Drop: crashes a peer (FAILED state, pruned from mesh)
- Sybil: injects attacker nodes into a topic's mesh
- Eclipse: rewires a target peer's mesh to attacker nodes
"""

from __future__ import annotations

import logging
import random
import uuid
from typing import TYPE_CHECKING

from backend.events.types import FaultCleared, FaultInjected, PeerRecovered

if TYPE_CHECKING:
    from backend.events.bus import EventBus
    from backend.gossip.engine import GossipEngine
    from backend.simulation.clock import SimulationClock
    from backend.simulation.node_pool import NodePool

logger = logging.getLogger(__name__)

# Sybil fanout: how many honest peers each sybil targets
D_SYBIL_FANOUT = 4


class FaultInjector:
    def __init__(
        self,
        event_bus: EventBus,
        clock: SimulationClock,
        node_pool: NodePool,
    ) -> None:
        self._event_bus = event_bus
        self._clock = clock
        self._node_pool = node_pool
        # fault_id → fault dict
        self._active_faults: dict[str, dict] = {}

    @property
    def gossip(self) -> GossipEngine:
        return self._node_pool.gossip

    # ── Query ──

    def get_active_faults(self) -> list[dict]:
        return list(self._active_faults.values())

    def get_latency(self, peer_a: str, peer_b: str) -> float:
        """Return extra latency (ms) between two peers from active faults."""
        extra = 0.0
        for f in self._active_faults.values():
            if f["type"] != "latency":
                continue
            pair = {f["peer_a"], f["peer_b"]}
            if peer_a in pair and peer_b in pair:
                jitter = random.uniform(-f.get("jitter_ms", 0), f.get("jitter_ms", 0))
                extra += f["ms"] + jitter
        return max(extra, 0.0)

    def is_partitioned(self, peer_a: str, peer_b: str) -> bool:
        """Return True if a partition fault blocks communication between these peers."""
        for f in self._active_faults.values():
            if f["type"] != "partition":
                continue
            ga = f["group_a"]
            gb = f["group_b"]
            if (peer_a in ga and peer_b in gb) or (peer_a in gb and peer_b in ga):
                return True
        return False

    def is_peer_failed(self, peer_id: str) -> bool:
        """Check if peer was dropped by fault injection."""
        for f in self._active_faults.values():
            if f["type"] == "drop" and f["peer_id"] == peer_id:
                return True
        return False

    # ── Injection ──

    async def inject_latency(
        self, peer_a: str, peer_b: str, ms: float, jitter_ms: float = 0
    ) -> str:
        """Inject latency between two peers. Returns fault_id."""
        fault_id = f"fault-{uuid.uuid4().hex[:8]}"
        fault = {
            "id": fault_id,
            "type": "latency",
            "peer_a": peer_a,
            "peer_b": peer_b,
            "ms": ms,
            "jitter_ms": jitter_ms,
        }
        self._active_faults[fault_id] = fault
        await self._event_bus.emit(
            FaultInjected(
                at=self._clock.time,
                fault_type="latency",
                target=f"{peer_a}<->{peer_b}",
                params={"ms": ms, "jitter_ms": jitter_ms, "fault_id": fault_id},
            )
        )
        logger.info("Injected latency %s: %s<->%s +%.0fms", fault_id, peer_a, peer_b, ms)
        return fault_id

    async def inject_partition(self, group_a: list[str], group_b: list[str]) -> str:
        """Create a network partition. Returns fault_id."""
        fault_id = f"fault-{uuid.uuid4().hex[:8]}"
        ga_set = set(group_a)
        gb_set = set(group_b)
        fault = {"id": fault_id, "type": "partition", "group_a": ga_set, "group_b": gb_set}
        self._active_faults[fault_id] = fault

        # Prune cross-partition mesh links
        for topic_mesh in self.gossip._mesh.values():
            for peer_id, mesh_peers in topic_mesh.items():
                if peer_id in ga_set:
                    mesh_peers -= gb_set
                elif peer_id in gb_set:
                    mesh_peers -= ga_set

        await self._event_bus.emit(
            FaultInjected(
                at=self._clock.time,
                fault_type="partition",
                target="network",
                params={"group_a": group_a, "group_b": group_b, "fault_id": fault_id},
            )
        )
        logger.info("Injected partition %s: %d vs %d peers", fault_id, len(group_a), len(group_b))
        return fault_id

    async def drop_peer(self, peer_id: str) -> str:
        """Simulate a peer crash. Returns fault_id."""
        from backend.simulation.node_pool import NodeState

        fault_id = f"fault-{uuid.uuid4().hex[:8]}"
        node = self._node_pool.get_node(peer_id)
        if node:
            node.state = NodeState.FAILED
            node.gossip_score = 0.0

        # Remove peer from all mesh memberships
        for topic_mesh in self.gossip._mesh.values():
            # Remove from others' meshes
            for _other_peer, mesh_peers in topic_mesh.items():
                mesh_peers.discard(peer_id)
            # Clear this peer's own mesh
            if peer_id in topic_mesh:
                topic_mesh[peer_id] = set()

        fault = {"id": fault_id, "type": "drop", "peer_id": peer_id}
        self._active_faults[fault_id] = fault

        await self._event_bus.emit(
            FaultInjected(
                at=self._clock.time,
                fault_type="drop",
                target=peer_id,
                params={"fault_id": fault_id},
            )
        )
        logger.info("Dropped peer %s (fault %s)", peer_id, fault_id)
        return fault_id

    async def inject_sybil(self, n_attackers: int, target_topic: str) -> str:
        """Inject sybil attacker nodes into a topic's mesh.

        Sybil nodes occupy mesh slots but never relay messages,
        degrading propagation reliability.
        """
        fault_id = f"fault-{uuid.uuid4().hex[:8]}"
        sybil_ids = [f"sybil-{fault_id}-{i}" for i in range(n_attackers)]

        topic_mesh = self.gossip._mesh.get(target_topic, {})
        subscribers = self.gossip._subscriptions.get(target_topic, set())

        # Inject sybil nodes into random honest peers' meshes
        honest_peers = [p for p in subscribers if not p.startswith("sybil-")]
        for sybil_id in sybil_ids:
            # Add sybil to gossip data structures
            self.gossip._seen[sybil_id] = set()
            subscribers.add(sybil_id)
            topic_mesh[sybil_id] = set()  # Sybils have empty mesh (don't relay)

            # Force sybil into D random honest peers' meshes
            targets = random.sample(honest_peers, min(len(honest_peers), D_SYBIL_FANOUT))
            for target_peer in targets:
                mesh = topic_mesh.get(target_peer, set())
                mesh.add(sybil_id)
                topic_mesh[target_peer] = mesh

        fault = {
            "id": fault_id,
            "type": "sybil",
            "n_attackers": n_attackers,
            "target_topic": target_topic,
            "sybil_ids": sybil_ids,
        }
        self._active_faults[fault_id] = fault

        await self._event_bus.emit(
            FaultInjected(
                at=self._clock.time,
                fault_type="sybil",
                target=target_topic,
                params={"n_attackers": n_attackers, "fault_id": fault_id},
            )
        )
        logger.info(
            "Injected %d sybils into topic %s (fault %s)",
            n_attackers,
            target_topic,
            fault_id,
        )
        return fault_id

    async def inject_eclipse(self, target_peer_id: str, n_attackers: int) -> str:
        """Eclipse a target peer by replacing its mesh with attacker nodes.

        The eclipsed peer can only communicate with attacker-controlled nodes,
        effectively isolating it from honest traffic.
        """
        fault_id = f"fault-{uuid.uuid4().hex[:8]}"
        attacker_ids = [f"eclipse-{fault_id}-{i}" for i in range(n_attackers)]

        # Replace the target's mesh in all topics with attacker nodes
        for topic, topic_mesh in self.gossip._mesh.items():
            if target_peer_id not in topic_mesh:
                continue

            subscribers = self.gossip._subscriptions.get(topic, set())

            # Save original mesh for potential recovery
            original_mesh = set(topic_mesh.get(target_peer_id, set()))

            # Remove target from honest peers' meshes
            for peer_id in original_mesh:
                if peer_id in topic_mesh:
                    topic_mesh[peer_id].discard(target_peer_id)

            # Replace target's mesh entirely with attackers
            for aid in attacker_ids:
                self.gossip._seen[aid] = set()
                subscribers.add(aid)
                topic_mesh[aid] = {target_peer_id}  # Attackers only connect to target

            topic_mesh[target_peer_id] = set(attacker_ids)

        fault = {
            "id": fault_id,
            "type": "eclipse",
            "target": target_peer_id,
            "n_attackers": n_attackers,
            "attacker_ids": attacker_ids,
        }
        self._active_faults[fault_id] = fault

        await self._event_bus.emit(
            FaultInjected(
                at=self._clock.time,
                fault_type="eclipse",
                target=target_peer_id,
                params={"n_attackers": n_attackers, "fault_id": fault_id},
            )
        )
        logger.info(
            "Eclipsed %s with %d attackers (fault %s)",
            target_peer_id,
            n_attackers,
            fault_id,
        )
        return fault_id

    # ── Recovery ──

    async def clear_fault(self, fault_id: str) -> bool:
        """Remove a specific fault by ID. Returns True if found."""
        fault = self._active_faults.pop(fault_id, None)
        if fault is None:
            return False

        fault_type = fault["type"]

        if fault_type == "drop":
            # Recover the peer
            from backend.simulation.node_pool import NodeState

            node = self._node_pool.get_node(fault["peer_id"])
            if node:
                node.state = NodeState.IDLE
                node.gossip_score = 1.0
                await self._event_bus.emit(
                    PeerRecovered(at=self._clock.time, peer_id=fault["peer_id"])
                )

        elif fault_type == "sybil":
            # Remove sybil nodes from meshes
            sybil_ids = set(fault.get("sybil_ids", []))
            for topic_mesh in self.gossip._mesh.values():
                for sid in sybil_ids:
                    topic_mesh.pop(sid, None)
                for _peer_id, mesh_peers in topic_mesh.items():
                    mesh_peers -= sybil_ids
            for sid in sybil_ids:
                self.gossip._seen.pop(sid, None)
                for sub_set in self.gossip._subscriptions.values():
                    sub_set.discard(sid)

        elif fault_type == "eclipse":
            # Remove attacker nodes, target will re-mesh via heartbeat
            attacker_ids = set(fault.get("attacker_ids", []))
            for topic_mesh in self.gossip._mesh.values():
                for aid in attacker_ids:
                    topic_mesh.pop(aid, None)
                for _peer_id, mesh_peers in topic_mesh.items():
                    mesh_peers -= attacker_ids
            for aid in attacker_ids:
                self.gossip._seen.pop(aid, None)
                for sub_set in self.gossip._subscriptions.values():
                    sub_set.discard(aid)

        await self._event_bus.emit(
            FaultCleared(at=self._clock.time, fault_id=fault_id, fault_type=fault_type)
        )
        logger.info("Cleared fault %s (%s)", fault_id, fault_type)
        return True

    async def clear_all(self) -> int:
        """Clear all active faults. Returns count cleared."""
        fault_ids = list(self._active_faults.keys())
        count = 0
        for fid in fault_ids:
            if await self.clear_fault(fid):
                count += 1
        return count

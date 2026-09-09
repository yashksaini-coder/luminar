"""TelemetryManager — registry for real peer telemetry.

Real peers POST or stream their metrics here. The manager:
  - Upserts peers into an in-memory registry
  - Evicts peers that have not reported in > 60s (TTL)
  - Converts peers to PeerNode-compatible dicts for snapshot merge
  - Optionally emits NodeHealthSnapshot events into the trio event bus
"""

from __future__ import annotations

import asyncio
import logging
import re
import time
from dataclasses import dataclass, field

logger = logging.getLogger(__name__)

# Reject peer_ids that look like simulated nodes
_SIM_ID_RE = re.compile(r"^peer-\d+$")

# Canvas region for telemetry nodes: x in [400, 700], y scattered
_TELEM_X_MIN = 400
_TELEM_X_MAX = 700
_TELEM_Y_MIN = 50
_TELEM_Y_MAX = 550

# Peers not heard from in this many seconds are evicted
_TTL_SECONDS = 60


@dataclass
class TelemetryPeer:
    peer_id: str
    node_name: str = ""
    network: str = "mainnet"
    client_version: str = ""
    connected_peers: list[str] = field(default_factory=list)
    best_block: int = 0
    finalized_block: int = 0
    cpu: float = 0.0
    mem_mb: float = 0.0
    open_streams: int = 0
    gossip_score: float = 1.0
    messages_sent: int = 0
    messages_received: int = 0
    lat: float | None = None
    lon: float | None = None
    city: str = ""
    last_seen: float = field(default_factory=time.time)
    index: int = 0  # assigned on first arrival


def _geo_to_canvas(lat: float | None, lon: float | None, peer_id: str) -> tuple[float, float]:
    """Map lat/lon to canvas coords, or scatter deterministically if no geo."""
    if lat is not None and lon is not None:
        # Normalize lat [-90,90] → y, lon [-180,180] → x within telemetry region
        x = _TELEM_X_MIN + (lon + 180) / 360 * (_TELEM_X_MAX - _TELEM_X_MIN)
        y = _TELEM_Y_MIN + (1 - (lat + 90) / 180) * (_TELEM_Y_MAX - _TELEM_Y_MIN)
    else:
        # Deterministic hash scatter — stable across snapshots, no jitter
        h = hash(peer_id) & 0xFFFF
        x = _TELEM_X_MIN + (h & 0xFF) / 255 * (_TELEM_X_MAX - _TELEM_X_MIN)
        y = _TELEM_Y_MIN + ((h >> 8) & 0xFF) / 255 * (_TELEM_Y_MAX - _TELEM_Y_MIN)
    return round(x, 1), round(y, 1)


class TelemetryManager:
    def __init__(self) -> None:
        self._peers: dict[str, TelemetryPeer] = {}
        self._index_counter = 10000  # offset avoids collision with simulated indices
        self._lock = asyncio.Lock()
        self._eviction_task: asyncio.Task | None = None

    def start(self) -> None:
        """Start the background TTL eviction loop. Call after asyncio loop is running."""
        self._eviction_task = asyncio.create_task(self._eviction_loop(), name="telemetry-eviction")

    def stop(self) -> None:
        """Cancel the eviction loop. Call before shutting down."""
        if self._eviction_task:
            self._eviction_task.cancel()
            self._eviction_task = None

    async def ingest(self, payload, trio_token=None, event_bus=None) -> None:
        """Upsert a telemetry payload. Optionally emit a NodeHealthSnapshot event."""
        from backend.telemetry.models import TelemetryPayload

        if isinstance(payload, dict):
            payload = TelemetryPayload(**payload)

        peer_id = payload.peer_id
        if _SIM_ID_RE.match(peer_id):
            logger.warning("Rejecting telemetry peer_id matching simulated format: %s", peer_id)
            return

        async with self._lock:
            existing = self._peers.get(peer_id)
            if existing is None:
                self._index_counter += 1
                idx = self._index_counter
            else:
                idx = existing.index

            loc = payload.location
            fields = payload.model_dump(exclude={"location", "timestamp"})
            node_name = fields.pop("node_name") or peer_id
            fields.update(
                node_name=node_name,
                lat=loc.lat if loc else None,
                lon=loc.lon if loc else None,
                city=loc.city if loc else "",
                last_seen=time.time(),
                index=idx,
            )
            self._peers[peer_id] = TelemetryPeer(**fields)

        # Emit NodeHealthSnapshot into trio event bus if bridge is available
        if trio_token is not None and event_bus is not None:
            try:
                import trio

                from backend.events.types import NodeHealthSnapshot

                snapshot_event = NodeHealthSnapshot(
                    at=time.time(),
                    peer_id=peer_id,
                    cpu=payload.cpu,
                    mem_mb=payload.mem_mb,
                    open_streams=payload.open_streams,
                    score=payload.gossip_score,
                )
                trio.from_thread.run(event_bus.emit, snapshot_event, trio_token=trio_token)
            except Exception as exc:
                logger.debug("Skipping trio event emit: %s", exc)

        logger.debug("Telemetry ingested: %s (total: %d)", peer_id, len(self._peers))

    def get_nodes_as_peer_dicts(self) -> list[dict]:
        """Return current telemetry peers in PeerNode-compatible format."""
        result = []
        for p in list(self._peers.values()):
            x, y = _geo_to_canvas(p.lat, p.lon, p.peer_id)
            result.append(
                {
                    "peer_id": p.peer_id,
                    "index": p.index,
                    "state": "receiving",  # telemetry nodes are always "active"
                    "connected_peers": p.connected_peers,
                    "messages_sent": p.messages_sent,
                    "messages_received": p.messages_received,
                    "gossip_score": p.gossip_score,
                    "cpu": p.cpu,
                    "mem_mb": p.mem_mb,
                    "open_streams": p.open_streams,
                    "best_block": p.best_block,
                    "finalized_block": p.finalized_block,
                    "node_name": p.node_name,
                    "network": p.network,
                    "client_version": p.client_version,
                    "city": p.city,
                    "x": x,
                    "y": y,
                    "is_telemetry": True,
                }
            )
        return result

    def get_status(self) -> dict:
        """Return a summary for the /api/telemetry/status endpoint."""
        peers = list(self._peers.values())
        return {
            "active": len(peers) > 0,
            "peer_count": len(peers),
            "peers": [
                {
                    "peer_id": p.peer_id,
                    "node_name": p.node_name,
                    "network": p.network,
                    "last_seen": p.last_seen,
                    "age_seconds": round(time.time() - p.last_seen, 1),
                    "cpu": p.cpu,
                    "best_block": p.best_block,
                }
                for p in peers
            ],
        }

    async def _eviction_loop(self) -> None:
        """Periodically remove stale peers."""
        while True:
            await asyncio.sleep(10)
            now = time.time()
            async with self._lock:
                stale = [pid for pid, p in self._peers.items() if now - p.last_seen > _TTL_SECONDS]
                for pid in stale:
                    del self._peers[pid]
                    logger.info("Evicted stale telemetry peer: %s", pid)

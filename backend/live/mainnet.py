"""MainnetFeed — mainnet beacon-block arrival wave from ethPandaOps' public arrival data.

Every 12 s the feed asks the ethPandaOps CBT API which nodes saw the block of a slot that
started ~2.5 minutes ago (rows land about two minutes after slot start), turns those ~150
observers into PeerNode-compatible dicts with geo positions, and replays their arrivals as
`BlockSeen` events paced at the real spread so the UI shows the wave at real speed.

Honesty: this is observer arrival time at nodes run by ethPandaOps and contributors, not
the gossip mesh path; the API is undocumented infrastructure (no published terms), so the
feed is opt-in, polls once per slot, and degrades to "no data" rather than retrying hard.
Data licence for the underlying Xatu dataset: CC BY 4.0.
"""

from __future__ import annotations

import asyncio
import json
import logging
import time
import urllib.error
import urllib.request
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from backend.events.types import BaseEvent

logger = logging.getLogger(__name__)

GENESIS = 1606824023  # mainnet genesis time (unix seconds)
SLOT_SECONDS = 12
LAG_SLOTS = 13  # rows exist ~120 s after slot start; 13 slots = 156 s keeps a margin
API = (
    "https://cbt-api-mainnet.analytics.production.platform.ethpandaops.io"
    "/api/v1/fct_block_first_seen_by_node"
)
INDEX_BASE = 30000  # above sim (0..), telemetry (10000+) and attacker (20000+) indices
GEO_SCALE = 2.5  # degrees → canvas units: world spans 900 × 450 units
MAX_WAVE_S = 10.0  # cap replay spread so a straggler never runs into the next slot
USER_AGENT = "luminar/0.1 (+https://github.com/yashksaini-coder/luminar)"


def slot_at(unix: float) -> int:
    return int((unix - GENESIS) // SLOT_SECONDS)


def slot_start(slot: int) -> int:
    return GENESIS + slot * SLOT_SECONDS


def geo_xy(lat: float, lon: float) -> tuple[float, float]:
    """Equirectangular projection into canvas units (y down)."""
    return round(lon * GEO_SCALE, 1), round(-lat * GEO_SCALE, 1)


@dataclass
class Observer:
    node_id: str
    index: int
    client: str
    country: str
    city: str
    lat: float
    lon: float
    state: str = "idle"
    seen_ms: int | None = None
    last_slot: int | None = None

    @property
    def peer_id(self) -> str:
        return f"obs-{self.node_id}"

    def to_dict(self) -> dict[str, Any]:
        x, y = geo_xy(self.lat, self.lon)
        return {
            "peer_id": self.peer_id,
            "index": self.index,
            "state": self.state,
            "connected_peers": [],
            "x": x,
            "y": y,
            "messages_sent": 0,
            "messages_received": 0,
            "gossip_score": 0.0,
            "is_real": True,
            "client": self.client,
            "country": self.country,
            "city": self.city,
            "seen_ms": self.seen_ms,
        }


def normalise_rows(rows: list[dict]) -> list[dict]:
    """Keep rows with a node id, geo and a timing; one row per node (earliest sighting)."""
    best: dict[str, dict] = {}
    for r in rows:
        node_id = str(r.get("node_id") or "").removeprefix("hashed-")
        lat, lon = r.get("meta_client_geo_latitude"), r.get("meta_client_geo_longitude")
        seen = r.get("seen_slot_start_diff")
        if not node_id or lat in (None, 0) or lon in (None, 0) or seen is None:
            continue
        if node_id not in best or seen < best[node_id]["seen_slot_start_diff"]:
            best[node_id] = r
    return sorted(best.values(), key=lambda r: r["seen_slot_start_diff"])


def wave_schedule(rows: list[dict], max_spread_s: float = MAX_WAVE_S) -> list[tuple[float, dict]]:
    """(delay_seconds_from_first, row) pairs replaying the real spread, capped."""
    if not rows:
        return []
    first = rows[0]["seen_slot_start_diff"]
    return [(min((r["seen_slot_start_diff"] - first) / 1000.0, max_spread_s), r) for r in rows]


def fetch_slot_rows(slot: int, timeout: float = 15.0) -> list[dict]:
    """Blocking HTTP GET for one slot's observer rows (call from a thread)."""
    url = f"{API}?slot_start_date_time_eq={slot_start(slot)}&page_size=1000"
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        body = json.loads(resp.read())
    rows = body.get("fct_block_first_seen_by_node", []) if isinstance(body, dict) else []
    return rows if isinstance(rows, list) else []


@dataclass
class MainnetFeed:
    """Opt-in poller; `emit` publishes a BaseEvent on the simulation bus (thread-safe wrapper
    supplied by main.py), `sim_time` reads the simulation clock for event timestamps."""

    emit: Callable[[BaseEvent], Any] | None = None
    sim_time: Callable[[], float] = time.time
    fetch: Callable[[int], list[dict]] = fetch_slot_rows
    enabled: bool = False
    _observers: dict[str, Observer] = field(default_factory=dict)
    _task: asyncio.Task | None = None
    _last_slot: int | None = None
    _status: dict[str, Any] = field(default_factory=dict)

    # ── lifecycle ──

    def start(self) -> None:
        if self._task is None or self._task.done():
            self.enabled = True
            self._task = asyncio.create_task(self._loop(), name="mainnet-feed")
            logger.info("Mainnet feed started")

    def stop(self) -> None:
        self.enabled = False
        if self._task:
            self._task.cancel()
            self._task = None
        for o in self._observers.values():
            o.state = "idle"
            o.seen_ms = None
        logger.info("Mainnet feed stopped")

    # ── views ──

    def get_nodes_as_peer_dicts(self) -> list[dict]:
        if not self.enabled:
            return []
        return [o.to_dict() for o in self._observers.values()]

    def get_status(self) -> dict[str, Any]:
        return {"enabled": self.enabled, "observers": len(self._observers), **self._status}

    # ── ingest (pure enough to unit test) ──

    def ingest_slot(self, slot: int, rows: list[dict]) -> list[tuple[float, Observer, dict]]:
        """Register observers for a slot and return the paced replay plan."""
        clean = normalise_rows(rows)
        for o in self._observers.values():  # new block: everybody back to idle
            o.state = "idle"
            o.seen_ms = None
        plan = []
        for delay, r in wave_schedule(clean):
            node_id = str(r["node_id"]).removeprefix("hashed-")
            o = self._observers.get(node_id)
            if o is None:
                o = Observer(
                    node_id=node_id,
                    index=INDEX_BASE + len(self._observers),
                    client=str(r.get("meta_consensus_implementation") or ""),
                    country=str(r.get("meta_client_geo_country_code") or ""),
                    city=str(r.get("meta_client_geo_city") or ""),
                    lat=float(r["meta_client_geo_latitude"]),
                    lon=float(r["meta_client_geo_longitude"]),
                )
                self._observers[node_id] = o
            plan.append((delay, o, r))
        diffs = [r["seen_slot_start_diff"] for r in clean]
        self._status = {
            "slot": slot,
            "block_root": clean[0]["block_root"] if clean else "",
            "rows": len(rows),
            "with_geo": len(clean),
            "first_ms": diffs[0] if diffs else None,
            "p50_ms": diffs[len(diffs) // 2] if diffs else None,
            "max_ms": diffs[-1] if diffs else None,
            "first_client": clean[0].get("meta_consensus_implementation") if clean else "",
            "first_country": clean[0].get("meta_client_geo_country") if clean else "",
            "lag_s": LAG_SLOTS * SLOT_SECONDS,
            "fetched_at": time.time(),
        }
        self._last_slot = slot
        return plan

    def mark_seen(self, o: Observer, r: dict, slot: int, first: bool) -> BaseEvent:
        from backend.events.types import BlockSeen

        o.state = "origin" if first else "decoded"
        o.seen_ms = int(r["seen_slot_start_diff"])
        o.last_slot = slot
        return BlockSeen(
            at=self.sim_time(),
            peer_id=o.peer_id,
            slot=slot,
            block_root=str(r.get("block_root") or ""),
            seen_ms=o.seen_ms,
            client=o.client,
            country=o.country,
            source=str(r.get("source") or ""),
            first=first,
        )

    # ── loop ──

    async def _loop(self) -> None:
        loop = asyncio.get_running_loop()
        while True:
            try:
                target = slot_at(time.time()) - LAG_SLOTS
                if target != self._last_slot:
                    try:
                        rows = await loop.run_in_executor(None, self.fetch, target)
                    except (urllib.error.URLError, TimeoutError, ValueError) as err:
                        logger.warning("Mainnet feed: slot %d fetch failed: %s", target, err)
                        rows = []
                    plan = self.ingest_slot(target, rows)
                    t0 = loop.time()
                    for i, (delay, o, r) in enumerate(plan):
                        await asyncio.sleep(max(0.0, t0 + delay - loop.time()))
                        ev = self.mark_seen(o, r, target, first=(i == 0))
                        if self.emit is not None:
                            await self.emit(ev)
                # wake at the next slot boundary (+1 s margin)
                next_slot_start = slot_start(slot_at(time.time()) + 1) + 1
                await asyncio.sleep(max(1.0, next_slot_start - time.time()))
            except asyncio.CancelledError:
                raise
            except Exception:
                logger.exception("Mainnet feed loop error — continuing")
                await asyncio.sleep(SLOT_SECONDS)

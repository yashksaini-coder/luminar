#!/usr/bin/env python3
"""Build an offline reel of real mainnet block arrivals (ethPandaOps public data).

    uv run python scripts/mainnet_to_reel.py --slots 8 --out mainnet-block-wave

Fetches `--slots` consecutive past slots from the same arrival API the live feed uses,
and writes frontend/public/reels/<out>.jsonl in the reel format the player expects:
observers as real nodes on a geo layout, one BlockSeen event per arrival at its real
offset, snapshots every 500 ms. No backend, no DuckDB. Honesty: observer arrival times at
~150 nodes run by ethPandaOps and contributors, one row per node, not gossip mesh paths.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))  # run from anywhere

from backend.live.mainnet import (  # noqa: E402
    LAG_SLOTS,
    SLOT_SECONDS,
    MainnetFeed,
    fetch_slot_rows,
    slot_at,
)

ROOT = Path(__file__).resolve().parent.parent
REELS = ROOT / "frontend" / "public" / "reels"
SNAPSHOT_S = 0.5


def build_frames(feed: MainnetFeed, slot_rows: list[tuple[int, list[dict]]]) -> list[dict]:
    """Deterministic frame list from (slot, rows) pairs; sim time starts at 0."""
    frames: list[dict] = []
    sim_t = 0.0
    feed.enabled = True
    feed.sim_time = lambda: sim_t

    def frame(obj: dict) -> None:
        frames.append({"t": int(sim_t * 1000), "frame": obj})

    def snapshot(state: str) -> None:
        nodes = feed.get_nodes_as_peer_dicts()
        frame(
            {
                "type": "snapshot",
                "state": state,
                "time": round(sim_t, 3),
                "speed": 1.0,
                "node_count": len(nodes),
                "event_count": 0,
                "nodes": nodes,
                "gossip": {"mesh_size": 0, "mesh": {}},
            }
        )

    frame({"type": "edges", "edges": []})
    frame({"type": "scenario", "active": False, "scenario": None})
    for i, (slot, rows) in enumerate(slot_rows):
        sim_t = i * SLOT_SECONDS
        plan = feed.ingest_slot(slot, rows)
        frame(
            {
                "type": "telemetry_status",
                "active": False,
                "peer_count": 0,
                "mainnet": feed.get_status(),
            }
        )
        snapshot("running")
        next_snap = sim_t + SNAPSHOT_S
        for j, (delay, o, r) in enumerate(plan):
            sim_t = i * SLOT_SECONDS + delay
            while next_snap <= sim_t:
                saved = sim_t
                sim_t = next_snap
                snapshot("running")
                sim_t = saved
                next_snap += SNAPSHOT_S
            frame(feed.mark_seen(o, r, slot, first=(j == 0)).to_dict())
        # pad the rest of the slot with snapshots so the scrubber is continuous
        while next_snap < (i + 1) * SLOT_SECONDS:
            sim_t = next_snap
            snapshot("running")
            next_snap += SNAPSHOT_S
    sim_t = len(slot_rows) * SLOT_SECONDS
    snapshot("paused")
    return frames


def main() -> int:
    p = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    p.add_argument("--slots", type=int, default=8, help="how many consecutive slots to include")
    p.add_argument(
        "--end-slot", type=int, default=None, help="last slot (default: newest available)"
    )
    p.add_argument("--out", default="mainnet-block-wave")
    p.add_argument("--title", default="Mainnet block wave")
    args = p.parse_args()

    end = args.end_slot or (slot_at(time.time()) - LAG_SLOTS - 1)
    slots = list(range(end - args.slots + 1, end + 1))
    slot_rows = []
    for s in slots:
        rows = fetch_slot_rows(s)
        print(f"slot {s}: {len(rows)} rows", file=sys.stderr)
        slot_rows.append((s, rows))
        time.sleep(0.5)  # be gentle: undocumented API

    frames = build_frames(MainnetFeed(), slot_rows)
    REELS.mkdir(parents=True, exist_ok=True)
    out = REELS / f"{args.out}.jsonl"
    with out.open("w") as fh:
        for f in frames:
            fh.write(json.dumps(f, separators=(",", ":")) + "\n")
    seen = sum(1 for f in frames if f["frame"].get("event_type") == "BlockSeen")
    size_mb = out.stat().st_size / 1e6
    print(f"wrote {out} ({size_mb:.2f} MB, {len(frames)} frames, {seen} arrivals)")
    print(f"slots {slots[0]}–{slots[-1]}")

    manifest = REELS / "manifest.json"
    entries = json.loads(manifest.read_text()) if manifest.exists() else []
    entry = {
        "name": args.out,
        "title": args.title,
        "file": f"/reels/{args.out}.jsonl",
        "nodes": max(
            (
                f["frame"].get("node_count", 0)
                for f in frames
                if f["frame"].get("type") == "snapshot"
            ),
            default=0,
        ),
        "real": True,
        "blurb": (
            f"Real mainnet block arrivals, slots {slots[0]}–{slots[-1]}: ~150 observer nodes "
            "light up in the order they saw each block. Arrival at observer nodes, not mesh "
            "paths. Data: ethPandaOps (CC BY 4.0)."
        ),
    }
    entries = [e for e in entries if e.get("name") != args.out] + [entry]
    manifest.write_text(json.dumps(entries, indent=2) + "\n")
    print(f"manifest updated ({len(entries)} reels)")
    return 0


if __name__ == "__main__":
    sys.exit(main())

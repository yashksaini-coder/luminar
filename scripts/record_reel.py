#!/usr/bin/env python3
"""Record or check a reel (an offline-replayable WebSocket frame stream).

Record:  uv run python scripts/record_reel.py record sybil-eclipse demo_sybil_eclipse \
             --nodes 50 --duration 40
Check:   uv run python scripts/record_reel.py check frontend/public/reels/sybil-eclipse.jsonl \
             --min-score-prunes 1

Recording talks to a running backend (default http://localhost:8000): reconfigures the
pool, opens /ws/events?record=<name>, launches the scenario at 1x, waits, then copies
recordings/<name>.jsonl to frontend/public/reels/. Uses the `websockets` package that
uvicorn[standard] already pulls in — no new dependency.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import shutil
import sys
import urllib.request
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
REELS_DIR = ROOT / "frontend" / "public" / "reels"


def _post(base: str, path: str, body: dict | None = None) -> dict:
    data = json.dumps(body or {}).encode()
    req = urllib.request.Request(
        base + path, data=data, headers={"Content-Type": "application/json"}, method="POST"
    )
    with urllib.request.urlopen(req, timeout=10) as r:
        return json.loads(r.read())


async def record(args: argparse.Namespace) -> int:
    import websockets

    base = args.base.rstrip("/")
    ws_base = base.replace("https://", "wss://").replace("http://", "ws://")
    _post(base, "/api/sim/reconfigure", {"n_nodes": args.nodes})
    _post(base, "/api/sim/pause")

    async with websockets.connect(f"{ws_base}/ws/events?record={args.name}", max_size=None) as ws:
        # Let the connect-time edges/scenario frames land before the launch resets everything
        await asyncio.sleep(0.5)
        _post(base, f"/api/scenarios/{args.scenario}/launch", {"speed": 1})
        print(f"recording {args.name}: {args.scenario} @ {args.nodes} nodes for {args.duration}s")

        async def drain() -> None:
            async for _ in ws:
                pass

        drainer = asyncio.create_task(drain())
        await asyncio.sleep(args.duration)
        drainer.cancel()
    _post(base, "/api/sim/pause")

    src = ROOT / "recordings" / f"{args.name}.jsonl"
    dst = REELS_DIR / f"{args.name}.jsonl"
    REELS_DIR.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(src, dst)
    print(f"wrote {dst} ({dst.stat().st_size / 1e6:.2f} MB)")
    return check_file(dst, args.min_score_prunes)


def check_file(path: Path, min_score_prunes: int) -> int:
    kinds: Counter[str] = Counter()
    score_prunes = 0
    cleared = 0
    phases: list[str] = []
    last_t = 0
    sim_end = 0.0
    with path.open() as fh:
        for line in fh:
            rec = json.loads(line)
            f = rec["frame"]
            last_t = rec["t"]
            k = f.get("type") or f.get("event_type", "?")
            kinds[k] += 1
            if k == "GossipPrune" and f.get("reason") == "score":
                score_prunes += 1
            elif k == "FaultCleared":
                cleared += 1
            elif k == "ScenarioPhaseFired":
                phases.append(f["label"])
            elif k == "snapshot":
                sim_end = f["time"]
    print(
        f"{path.name}: {sum(kinds.values())} frames, {last_t / 1000:.1f}s wall, "
        f"sim {sim_end:.1f}s, {kinds['snapshot']} snapshots, {kinds.get('gap', 0)} gaps"
    )
    print(f"  phases: {phases}")
    print(f"  score prunes: {score_prunes}, faults cleared: {cleared}")
    if kinds.get("gap"):
        print("  FAIL: gap frames present (events dropped)")
        return 1
    if score_prunes < min_score_prunes:
        print(f"  FAIL: expected >= {min_score_prunes} GossipPrune(reason=score)")
        return 1
    return 0


def main() -> int:
    p = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    sub = p.add_subparsers(dest="cmd", required=True)
    r = sub.add_parser("record")
    r.add_argument("name")
    r.add_argument("scenario")
    r.add_argument("--nodes", type=int, default=50)
    r.add_argument("--duration", type=float, default=40)
    r.add_argument("--base", default="http://localhost:8000")
    r.add_argument("--min-score-prunes", type=int, default=0)
    c = sub.add_parser("check")
    c.add_argument("file", type=Path)
    c.add_argument("--min-score-prunes", type=int, default=0)
    args = p.parse_args()
    if args.cmd == "record":
        return asyncio.run(record(args))
    return check_file(args.file, args.min_score_prunes)


if __name__ == "__main__":
    sys.exit(main())

"""The offline mainnet reel builder produces a player-compatible frame stream."""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
from mainnet_to_reel import build_frames  # noqa: E402

from backend.live.mainnet import MainnetFeed


def _row(node, seen):
    return {
        "node_id": f"hashed-{node}",
        "seen_slot_start_diff": seen,
        "meta_client_geo_latitude": 1.0 + seen / 1e5,
        "meta_client_geo_longitude": 2.0,
        "meta_consensus_implementation": "prysm",
        "meta_client_geo_country_code": "US",
        "meta_client_geo_country": "United States",
        "meta_client_geo_city": "x",
        "block_root": f"0x{seen:x}",
        "source": "s",
    }


def test_frames_are_ordered_and_complete():
    frames = build_frames(
        MainnetFeed(), [(100, [_row("a", 1500), _row("b", 2000)]), (101, [_row("a", 1200)])]
    )
    kinds = [f["frame"].get("type") or f["frame"].get("event_type") for f in frames]
    assert kinds[:2] == ["edges", "scenario"]
    assert kinds.count("BlockSeen") == 3
    ts = [f["t"] for f in frames]
    assert ts == sorted(ts) and ts[-1] == 24_000
    seen = [f["frame"] for f in frames if f["frame"].get("event_type") == "BlockSeen"]
    assert [s["at"] for s in seen] == [0.0, 0.5, 12.0] and seen[0]["first"] and not seen[1]["first"]
    snaps = [f["frame"] for f in frames if f["frame"].get("type") == "snapshot"]
    assert snaps[0]["nodes"][0]["is_real"] and snaps[0]["nodes"][0]["state"] == "idle"
    # every frame serialises
    for f in frames:
        json.dumps(f)

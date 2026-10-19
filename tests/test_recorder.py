"""Tests for ReelRecorder and reel-related scenario helpers."""

import orjson

from backend.events.recorder import ReelRecorder


def test_rejects_unsafe_names(tmp_path):
    for bad in ("../x", "a.b", "A", "", "x" * 41, "a/b", None):
        assert ReelRecorder.open_if_valid(bad, tmp_path) is None
    assert not list(tmp_path.iterdir())


def test_writes_jsonl_with_monotonic_offsets(tmp_path):
    rec = ReelRecorder.open_if_valid("sybil-eclipse", tmp_path)
    assert rec is not None and rec.path == tmp_path / "sybil-eclipse.jsonl"
    rec.write({"type": "edges", "edges": [["peer-0", "peer-1"]]})
    rec.write({"event_type": "GossipGraft", "at": 1.0})
    rec.close()
    lines = [orjson.loads(line) for line in rec.path.read_bytes().splitlines()]
    assert [line["frame"].get("type", line["frame"].get("event_type")) for line in lines] == [
        "edges",
        "GossipGraft",
    ]
    assert lines[0]["t"] <= lines[1]["t"] and rec.frames == 2

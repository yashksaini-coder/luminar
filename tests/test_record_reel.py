"""record_reel.py targets the web/ reel directory after the frontend swap."""

from __future__ import annotations

import importlib.util
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
_spec = importlib.util.spec_from_file_location("record_reel", ROOT / "scripts" / "record_reel.py")
record_reel = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(record_reel)


def test_reels_dir_is_web_public_reels():
    assert record_reel.REELS_DIR == ROOT / "web" / "public" / "reels"
    assert record_reel.REELS_DIR.is_dir()
    assert (record_reel.REELS_DIR / "manifest.json").is_file()


def test_check_passes_on_shipped_sybil_reel():
    assert record_reel.check_file(record_reel.REELS_DIR / "sybil-eclipse.jsonl", 1) == 0

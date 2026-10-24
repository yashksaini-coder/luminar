"""ReelRecorder — append every WebSocket frame to a JSONL file for offline replay.

A "reel" is the exact frame stream one client saw: events, snapshots, metrics,
analytics, edges, scenario. Replaying it client-side needs no backend, which is
what makes the Devcon booth work without Wi-Fi.
"""

from __future__ import annotations

import re
import time
from pathlib import Path
from typing import IO

import orjson

NAME_RE = re.compile(r"^[a-z0-9-]{1,40}$")  # used as a file name: no slashes, no dots
DEFAULT_ROOT = Path("recordings")


class ReelRecorder:
    def __init__(self, name: str, root: Path = DEFAULT_ROOT) -> None:
        if not NAME_RE.match(name):
            raise ValueError(f"invalid reel name: {name!r}")
        root.mkdir(parents=True, exist_ok=True)
        self.path = root / f"{name}.jsonl"
        self._fh: IO[bytes] = self.path.open("wb")
        self._t0 = time.monotonic()
        self.frames = 0

    @classmethod
    def open_if_valid(cls, name: str | None, root: Path = DEFAULT_ROOT) -> ReelRecorder | None:
        """None for a missing or malformed name (the WS then just streams normally)."""
        if not name or not NAME_RE.match(name):
            return None
        return cls(name, root)

    def write(self, frame: dict) -> None:
        t = int((time.monotonic() - self._t0) * 1000)
        self._fh.write(orjson.dumps({"t": t, "frame": frame}) + b"\n")
        self._fh.flush()  # the recorder script copies the file as soon as its socket closes
        self.frames += 1

    def close(self) -> None:
        self._fh.close()

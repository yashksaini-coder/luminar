"""Deterministic trace/span ids so the exporter and /api/trace/{msg_id} agree."""

from __future__ import annotations

import hashlib


def trace_id(run_id: str, msg_id: str) -> str:
    return hashlib.md5(f"{run_id}|{msg_id}".encode()).hexdigest()  # 32 hex = 16 bytes


def span_id(run_id: str, msg_id: str, from_peer: str, to_peer: str) -> str:
    # from_peer is part of the id: several senders can attempt the same partitioned
    # receiver, so msg|to alone would collide for dropped spans.
    return hashlib.md5(f"{run_id}|{msg_id}|{from_peer}>{to_peer}".encode()).hexdigest()[:16]


def sampled(tid: str, pct: int) -> bool:
    return int(tid[:8], 16) % 100 < pct

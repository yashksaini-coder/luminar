#!/usr/bin/env python3
"""Round-trip smoke: Luminar → OTLP/JSON → Jaeger. Not in CI (needs docker + a running backend).

make otel-up
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318 make backend   # in another shell
make otel-smoke
"""

from __future__ import annotations

import json
import sys
import time
import urllib.request

BASE = "http://localhost:8000"
JAEGER = "http://localhost:16686"


def _get(url: str) -> dict:
    with urllib.request.urlopen(url, timeout=5) as r:
        return json.loads(r.read())


def _post(url: str, body: dict | None = None) -> dict:
    req = urllib.request.Request(
        url,
        data=json.dumps(body or {}).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=5) as r:
        return json.loads(r.read())


def main() -> int:
    status = _get(f"{BASE}/api/otel/status")
    if not status.get("enabled"):
        print(
            "FAIL: exporter disabled — start the backend with OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318"
        )
        return 1
    _post(f"{BASE}/api/sim/play")
    # Peers publish after a random 5-15 sim-second wait: poll for the first trace (≤ 20 s)
    trace = None
    for _ in range(40):
        recent = _get(f"{BASE}/api/trace/recent?limit=1")
        items = recent if isinstance(recent, list) else recent.get("traces", [])
        if items:
            trace = _get(f"{BASE}/api/trace/{items[0]['msg_id']}")
            break
        time.sleep(0.5)
    if trace is None:
        print("FAIL: no message published within 20 s")
        return 1
    tid = trace["trace_id"]
    time.sleep(2.5)  # exporter flushes every 1 s
    for _ in range(10):
        try:
            res = _get(f"{JAEGER}/api/v3/traces/{tid}")  # the stable, OTLP-shaped API
        except Exception:
            res = {}
        spans = [
            s
            for rs in res.get("result", {}).get("resourceSpans", [])
            for ss in rs["scopeSpans"]
            for s in ss["spans"]
        ]
        if len(spans) >= 2:
            names = sorted({s["name"] for s in spans})
            print(f"OK: trace {tid} ({trace['msg_id']}) has {len(spans)} spans in Jaeger: {names}")
            print(f"    {JAEGER}/trace/{tid}")
            return 0
        time.sleep(1)
    status = _get(f"{BASE}/api/otel/status")
    print(f"FAIL: Jaeger returned < 2 spans for {tid}; exporter status: {status}")
    return 1


if __name__ == "__main__":
    sys.exit(main())

"""TelemetryManager / TelemetryPayload bounds: registry cap, unknown keys, list length."""

import asyncio

import pytest
from pydantic import ValidationError

from backend.telemetry.manager import _MAX_PEERS, TelemetryManager
from backend.telemetry.models import TelemetryPayload


def ingest(tm: TelemetryManager, **fields) -> None:
    asyncio.run(tm.ingest(TelemetryPayload(**fields)))


def test_registry_caps_new_peers_but_still_updates_known_ones():
    tm = TelemetryManager()
    for i in range(_MAX_PEERS + 1):
        ingest(tm, peer_id=f"real-{i}")
    assert len(tm._peers) == _MAX_PEERS
    assert f"real-{_MAX_PEERS}" not in tm._peers
    ingest(tm, peer_id="real-0", best_block=42)  # upsert of an existing peer is not a new slot
    assert tm._peers["real-0"].best_block == 42


def test_unknown_payload_keys_are_ignored():
    tm = TelemetryManager()
    ingest(tm, peer_id="real-x", bogus_field=1)  # extra="allow" used to TypeError in ingest
    assert "real-x" in tm._peers


def test_payload_lengths_are_bounded():
    with pytest.raises(ValidationError):
        TelemetryPayload(peer_id="p", connected_peers=["q"] * 257)
    with pytest.raises(ValidationError):
        TelemetryPayload(peer_id="p" * 129)

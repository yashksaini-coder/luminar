"""Pydantic model for telemetry payloads submitted by real peers."""

from __future__ import annotations

import time
from typing import Annotated

from pydantic import BaseModel, Field


class GeoLocation(BaseModel):
    lat: float = 0.0
    lon: float = 0.0
    city: str = Field("", max_length=128)


class TelemetryPayload(BaseModel):
    # Every string is re-sent in each 500 ms snapshot frame, so all are length-bounded
    peer_id: str = Field(max_length=128)  # required — unique node identifier
    node_name: str = Field("", max_length=128)
    network: str = Field("mainnet", max_length=64)
    client_version: str = Field("", max_length=128)
    connected_peers: list[Annotated[str, Field(max_length=128)]] = Field(
        default_factory=list, max_length=256
    )
    best_block: int = 0
    finalized_block: int = 0
    cpu: float = 0.0
    mem_mb: float = 0.0
    open_streams: int = 0
    gossip_score: float = 1.0
    messages_sent: int = 0
    messages_received: int = 0
    location: GeoLocation | None = None
    timestamp: float = Field(default_factory=time.time)

    # "ignore", not "allow": model_dump() must match TelemetryPeer's fields exactly
    model_config = {"extra": "ignore"}

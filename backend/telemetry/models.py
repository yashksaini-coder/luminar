"""Pydantic model for telemetry payloads submitted by real peers."""

from __future__ import annotations

import time

from pydantic import BaseModel, Field


class GeoLocation(BaseModel):
    lat: float = 0.0
    lon: float = 0.0
    city: str = ""


class TelemetryPayload(BaseModel):
    peer_id: str  # required — unique node identifier
    node_name: str = ""
    network: str = "mainnet"
    client_version: str = ""
    connected_peers: list[str] = Field(default_factory=list)
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

    model_config = {"extra": "allow"}  # forward-compatible: ignore unknown fields

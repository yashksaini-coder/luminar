"""Typed event dataclasses for the Lumina P2P event bus.

Every event emitted by the simulation flows through EventBus as one of these types.
All events carry an `at` timestamp (simulation time in seconds) and serialize to JSON
via orjson for WebSocket fan-out.
"""

from __future__ import annotations

from dataclasses import dataclass, field, asdict
from enum import Enum
from typing import Any

import orjson


class EventCategory(str, Enum):
    CLOCK = "clock"
    CONNECTION = "connection"
    STREAM = "stream"
    DHT = "dht"
    GOSSIP = "gossip"
    FAULT = "fault"
    HEALTH = "health"
    SIMULATION = "simulation"


@dataclass(slots=True, frozen=True)
class BaseEvent:
    at: float

    @property
    def category(self) -> EventCategory:
        raise NotImplementedError

    @property
    def event_type(self) -> str:
        return type(self).__name__

    def to_dict(self) -> dict[str, Any]:
        d = asdict(self)
        d["event_type"] = self.event_type
        d["category"] = self.category.value
        return d

    def to_json(self) -> bytes:
        return orjson.dumps(self.to_dict())


# --- Clock ---

@dataclass(slots=True, frozen=True)
class ClockTick(BaseEvent):
    speed: float = 1.0

    @property
    def category(self) -> EventCategory:
        return EventCategory.CLOCK


# --- Connection ---

@dataclass(slots=True, frozen=True)
class PeerConnected(BaseEvent):
    peer_id: str = ""
    remote_peer_id: str = ""

    @property
    def category(self) -> EventCategory:
        return EventCategory.CONNECTION


@dataclass(slots=True, frozen=True)
class PeerDisconnected(BaseEvent):
    peer_id: str = ""
    reason: str = ""

    @property
    def category(self) -> EventCategory:
        return EventCategory.CONNECTION


# --- Stream ---

@dataclass(slots=True, frozen=True)
class StreamOpened(BaseEvent):
    stream_id: str = ""
    from_peer: str = ""
    to_peer: str = ""
    protocol: str = ""

    @property
    def category(self) -> EventCategory:
        return EventCategory.STREAM


@dataclass(slots=True, frozen=True)
class StreamClosed(BaseEvent):
    stream_id: str = ""
    reason: str = ""

    @property
    def category(self) -> EventCategory:
        return EventCategory.STREAM


@dataclass(slots=True, frozen=True)
class StreamTimeout(BaseEvent):
    peer_id: str = ""

    @property
    def category(self) -> EventCategory:
        return EventCategory.STREAM


@dataclass(slots=True, frozen=True)
class SemaphoreBlocked(BaseEvent):
    layer: str = ""
    peer_id: str = ""

    @property
    def category(self) -> EventCategory:
        return EventCategory.STREAM


# --- DHT ---

@dataclass(slots=True, frozen=True)
class DHTQueryStarted(BaseEvent):
    query_id: str = ""
    target: str = ""
    initiator: str = ""

    @property
    def category(self) -> EventCategory:
        return EventCategory.DHT


@dataclass(slots=True, frozen=True)
class DHTQueryCompleted(BaseEvent):
    query_id: str = ""
    target: str = ""
    hops: int = 0
    duration_ms: float = 0.0

    @property
    def category(self) -> EventCategory:
        return EventCategory.DHT


@dataclass(slots=True, frozen=True)
class DHTQueryFailed(BaseEvent):
    query_id: str = ""
    reason: str = ""

    @property
    def category(self) -> EventCategory:
        return EventCategory.DHT


@dataclass(slots=True, frozen=True)
class DHTRoutingTableUpdate(BaseEvent):
    peer_id: str = ""
    added: list[str] = field(default_factory=list)
    removed: list[str] = field(default_factory=list)

    @property
    def category(self) -> EventCategory:
        return EventCategory.DHT


# --- GossipSub ---

@dataclass(slots=True, frozen=True)
class GossipGraft(BaseEvent):
    from_peer: str = ""
    to_peer: str = ""
    topic: str = ""

    @property
    def category(self) -> EventCategory:
        return EventCategory.GOSSIP


@dataclass(slots=True, frozen=True)
class GossipPrune(BaseEvent):
    from_peer: str = ""
    to_peer: str = ""
    topic: str = ""

    @property
    def category(self) -> EventCategory:
        return EventCategory.GOSSIP


@dataclass(slots=True, frozen=True)
class GossipIHave(BaseEvent):
    from_peer: str = ""
    msg_ids: list[str] = field(default_factory=list)

    @property
    def category(self) -> EventCategory:
        return EventCategory.GOSSIP


@dataclass(slots=True, frozen=True)
class GossipIWant(BaseEvent):
    from_peer: str = ""
    msg_ids: list[str] = field(default_factory=list)

    @property
    def category(self) -> EventCategory:
        return EventCategory.GOSSIP


@dataclass(slots=True, frozen=True)
class GossipMessage(BaseEvent):
    topic: str = ""
    from_peer: str = ""
    msg_id: str = ""
    hops: int = 0

    @property
    def category(self) -> EventCategory:
        return EventCategory.GOSSIP


# --- Fault ---

@dataclass(slots=True, frozen=True)
class FaultInjected(BaseEvent):
    fault_type: str = ""
    target: str = ""
    params: dict[str, Any] = field(default_factory=dict)

    @property
    def category(self) -> EventCategory:
        return EventCategory.FAULT


@dataclass(slots=True, frozen=True)
class FaultCleared(BaseEvent):
    fault_id: str = ""
    fault_type: str = ""

    @property
    def category(self) -> EventCategory:
        return EventCategory.FAULT


@dataclass(slots=True, frozen=True)
class PeerRecovered(BaseEvent):
    peer_id: str = ""

    @property
    def category(self) -> EventCategory:
        return EventCategory.FAULT


# --- Health ---

@dataclass(slots=True, frozen=True)
class NodeHealthSnapshot(BaseEvent):
    peer_id: str = ""
    cpu: float = 0.0
    mem_mb: float = 0.0
    open_streams: int = 0
    score: float = 1.0

    @property
    def category(self) -> EventCategory:
        return EventCategory.HEALTH


# --- Simulation ---

@dataclass(slots=True, frozen=True)
class SimulationStateChanged(BaseEvent):
    state: str = ""  # "running", "paused", "stopped", "recording"
    speed: float = 1.0

    @property
    def category(self) -> EventCategory:
        return EventCategory.SIMULATION

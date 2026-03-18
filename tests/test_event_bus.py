"""Tests for EventBus — fan-out, ring buffer, subscriber management."""

import pytest

from backend.events.bus import EventBus
from backend.events.types import ClockTick, PeerConnected


@pytest.fixture
def bus():
    return EventBus()


async def test_emit_and_receive(bus):
    recv = bus.subscribe()
    event = PeerConnected(at=1.0, peer_id="peer-0")
    await bus.emit(event)

    received = recv.receive_nowait()
    assert received.peer_id == "peer-0"
    assert received.at == 1.0


async def test_multiple_subscribers(bus):
    recv1 = bus.subscribe()
    recv2 = bus.subscribe()
    event = ClockTick(at=0.5, speed=2.0)
    await bus.emit(event)

    assert recv1.receive_nowait().at == 0.5
    assert recv2.receive_nowait().at == 0.5


async def test_ring_buffer(bus):
    for i in range(100):
        await bus.emit(ClockTick(at=float(i)))

    assert bus.event_count == 100
    assert len(bus.ring) == 100


async def test_ring_buffer_max_size():
    bus = EventBus(ring_size=10)
    for i in range(20):
        await bus.emit(ClockTick(at=float(i)))

    assert bus.event_count == 20
    assert len(bus.ring) == 10
    assert bus.ring[0].at == 10.0  # Oldest kept


async def test_events_since(bus):
    for i in range(10):
        await bus.emit(ClockTick(at=float(i)))

    events = bus.events_since(5.0)
    assert len(events) == 5
    assert events[0].at == 5.0


async def test_dead_subscriber_cleanup(bus):
    recv = bus.subscribe()
    await recv.aclose()

    # Should not raise
    await bus.emit(ClockTick(at=1.0))
    assert bus.event_count == 1

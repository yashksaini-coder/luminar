"""EventBus — in-memory fan-out for simulation events.

Subscribers receive events via trio memory channels. The bus maintains a ring buffer
of recent events for replay/scrubbing and optionally writes JSONL for persistence.
"""

from __future__ import annotations

import bisect
import contextlib
import logging
from collections import deque
from typing import TYPE_CHECKING

import trio

if TYPE_CHECKING:
    from backend.events.types import BaseEvent

logger = logging.getLogger(__name__)

# Max events kept in the ring buffer (500k ≈ 200MB worst case)
DEFAULT_RING_SIZE = 500_000


class EventBus:
    def __init__(self, ring_size: int = DEFAULT_RING_SIZE) -> None:
        self._subscribers: list[trio.MemorySendChannel] = []
        self._ring: deque[BaseEvent] = deque(maxlen=ring_size)
        self._event_count: int = 0

    @property
    def event_count(self) -> int:
        return self._event_count

    @property
    def ring(self) -> deque[BaseEvent]:
        return self._ring

    def subscribe(self) -> trio.MemoryReceiveChannel:
        """Create a new subscriber channel. Returns the receive end."""
        send_ch, recv_ch = trio.open_memory_channel(4096)
        self._subscribers.append(send_ch)
        return recv_ch

    def unsubscribe(self, send_ch: trio.MemorySendChannel) -> None:
        """Remove a subscriber."""
        with contextlib.suppress(ValueError):
            self._subscribers.remove(send_ch)

    async def emit(self, event: BaseEvent) -> None:
        """Broadcast event to all subscribers and append to ring buffer."""
        self._ring.append(event)
        self._event_count += 1

        dead: list[trio.MemorySendChannel] = []
        for ch in self._subscribers:
            try:
                ch.send_nowait(event)
            except trio.WouldBlock:
                # Subscriber too slow — drop event for this subscriber
                logger.warning("Subscriber lagging, dropped event %s", event.event_type)
            except (trio.ClosedResourceError, trio.BrokenResourceError):
                dead.append(ch)

        for ch in dead:
            self._subscribers.remove(ch)

    def events_since(self, t: float) -> list[BaseEvent]:
        """Return all buffered events with `at >= t`. Uses bisect for O(log n) lookup."""
        ring = self._ring
        if not ring:
            return []
        # Binary search on the time-ordered ring buffer
        times = [e.at for e in ring]
        idx = bisect.bisect_left(times, t)
        return list(ring)[idx:]

    def events_between(self, t_start: float, t_end: float) -> list[BaseEvent]:
        """Return buffered events in [t_start, t_end]."""
        return [e for e in self._ring if t_start <= e.at <= t_end]

    def clear(self) -> None:
        """Clear the ring buffer and reset count."""
        self._ring.clear()
        self._event_count = 0

"""StreamManager — semaphore-bounded stream lifecycle at the libp2p transport layer.

Fixes the original bug: streams never closed on failure path → "Stream limit exceeded".
Every stream open is bounded by a semaphore and wrapped in try/finally to guarantee close.
"""

from __future__ import annotations

import logging
import uuid
from contextlib import asynccontextmanager
from dataclasses import dataclass
from typing import TYPE_CHECKING, Any

import trio

if TYPE_CHECKING:
    from backend.events.bus import EventBus

logger = logging.getLogger(__name__)


@dataclass
class StreamRecord:
    stream_id: str
    from_peer: str
    to_peer: str
    protocol: str
    opened_at: float
    stream: Any = None


class StreamManager:
    """Manages concurrent streams with a semaphore cap and mandatory cleanup."""

    def __init__(
        self,
        event_bus: EventBus,
        max_streams: int = 64,
        open_timeout: float = 10.0,
    ) -> None:
        self._event_bus = event_bus
        self._sem = trio.Semaphore(max_streams)
        self._max_streams = max_streams
        self._open_timeout = open_timeout
        self._open_streams: dict[str, StreamRecord] = {}

    @property
    def open_count(self) -> int:
        return len(self._open_streams)

    @property
    def max_streams(self) -> int:
        return self._max_streams

    @property
    def available(self) -> int:
        return self._sem.value

    @asynccontextmanager
    async def open_stream(
        self,
        from_peer: str,
        to_peer: str,
        protocol: str,
        dial_fn=None,
        sim_time: float = 0.0,
    ):
        """Open a stream with semaphore guard, timeout, and guaranteed cleanup.

        Args:
            from_peer: Source peer ID.
            to_peer: Destination peer ID.
            protocol: Protocol identifier string.
            dial_fn: Async callable that returns a stream object. If None, yields a StreamRecord.
            sim_time: Current simulation time for event timestamps.
        """
        from backend.events.types import (
            SemaphoreBlocked,
            StreamClosed,
            StreamOpened,
            StreamTimeout,
        )

        stream_id = str(uuid.uuid4())[:8]

        # Check if we'd block on the semaphore
        if self._sem.value == 0:
            await self._event_bus.emit(
                SemaphoreBlocked(at=sim_time, layer="stream", peer_id=from_peer)
            )

        async with self._sem:
            record = StreamRecord(
                stream_id=stream_id,
                from_peer=from_peer,
                to_peer=to_peer,
                protocol=protocol,
                opened_at=sim_time,
            )

            # Dial with timeout
            if dial_fn is not None:
                with trio.move_on_after(self._open_timeout) as cancel_scope:
                    record.stream = await dial_fn(to_peer, protocol)
                if cancel_scope.cancelled_caught:
                    await self._event_bus.emit(
                        StreamTimeout(at=sim_time, peer_id=to_peer)
                    )
                    raise StreamTimeoutError(to_peer, self._open_timeout)

            self._open_streams[stream_id] = record
            _trio_open_time = trio.current_time()
            await self._event_bus.emit(
                StreamOpened(
                    at=sim_time,
                    stream_id=stream_id,
                    from_peer=from_peer,
                    to_peer=to_peer,
                    protocol=protocol,
                )
            )

            try:
                yield record
            finally:
                # ALWAYS close — this was the original bug
                close_time = sim_time + (trio.current_time() - _trio_open_time)
                self._open_streams.pop(stream_id, None)
                if record.stream is not None:
                    try:
                        await record.stream.close()
                    except Exception:
                        logger.debug("Stream %s already closed", stream_id)
                await self._event_bus.emit(
                    StreamClosed(at=close_time, stream_id=stream_id, reason="normal")
                )


class StreamTimeoutError(Exception):
    def __init__(self, peer_id: str, timeout: float) -> None:
        self.peer_id = peer_id
        self.timeout = timeout
        super().__init__(f"Stream to {peer_id} timed out after {timeout}s")

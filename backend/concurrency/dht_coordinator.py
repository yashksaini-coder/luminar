"""DHTQueryCoordinator — semaphore-bounded DHT queries with exponential backoff.

Fixes the original bug: find_peer hangs forever because nursery.start_soon has no timeout.
Every query is wrapped in trio.move_on_after + bounded retries with backoff.
Also prevents random walk and find_peer from starving each other via a shared semaphore.
"""

from __future__ import annotations

import logging
import math
import random
import uuid
from typing import TYPE_CHECKING, Any

import trio

if TYPE_CHECKING:
    from backend.events.bus import EventBus

logger = logging.getLogger(__name__)


class ExponentialBackoff:
    """Simple exponential backoff with jitter."""

    def __init__(self, base: float = 0.2, cap: float = 5.0, jitter: float = 0.1) -> None:
        self._base = base
        self._cap = cap
        self._jitter = jitter
        self._attempt = 0

    def next(self) -> float:
        delay = min(self._base * math.pow(2, self._attempt), self._cap)
        delay += random.uniform(0, self._jitter * delay)
        self._attempt += 1
        return delay

    def reset(self) -> None:
        self._attempt = 0


class DHTQueryCoordinator:
    """Coordinates DHT queries with concurrency limiting and retry logic."""

    def __init__(
        self,
        event_bus: EventBus,
        max_parallel: int = 8,
        query_timeout: float = 5.0,
        max_retries: int = 3,
    ) -> None:
        self._event_bus = event_bus
        self._sem = trio.Semaphore(max_parallel)
        self._max_parallel = max_parallel
        self._query_timeout = query_timeout
        self._max_retries = max_retries
        self._active_queries: dict[str, dict[str, Any]] = {}

    @property
    def active_count(self) -> int:
        return len(self._active_queries)

    @property
    def available(self) -> int:
        return self._sem.value

    async def query_peer(
        self,
        initiator: str,
        target_key: str,
        query_fn=None,
        sim_time: float = 0.0,
    ) -> Any:
        """Execute a DHT query with semaphore guard, timeout, and retry.

        Args:
            initiator: Peer ID initiating the query.
            target_key: DHT key being looked up.
            query_fn: Async callable(target_key) -> result. If None, simulates a query.
            sim_time: Current simulation time.

        Returns:
            Query result from query_fn, or None if all retries exhausted.

        Raises:
            DHTQueryExhaustedError: If all retries fail.
        """
        from backend.events.types import (
            DHTQueryCompleted,
            DHTQueryFailed,
            DHTQueryStarted,
            SemaphoreBlocked,
        )

        query_id = str(uuid.uuid4())[:8]

        if self._sem.value == 0:
            await self._event_bus.emit(
                SemaphoreBlocked(at=sim_time, layer="dht", peer_id=initiator)
            )

        async with self._sem:
            self._active_queries[query_id] = {
                "initiator": initiator,
                "target": target_key,
                "started_at": trio.current_time(),
            }

            await self._event_bus.emit(
                DHTQueryStarted(
                    at=sim_time, query_id=query_id, target=target_key, initiator=initiator
                )
            )

            backoff = ExponentialBackoff(base=0.2, cap=5.0)

            try:
                for attempt in range(self._max_retries):
                    with trio.move_on_after(self._query_timeout) as cancel_scope:
                        if query_fn is not None:
                            result = await query_fn(target_key)
                        else:
                            # Simulated query — just sleep briefly
                            await trio.sleep(0.01)
                            result = {"found": True, "target": target_key}

                        start_time = self._active_queries[query_id]["started_at"]
                        elapsed_ms = (trio.current_time() - start_time) * 1000
                        await self._event_bus.emit(
                            DHTQueryCompleted(
                                at=sim_time,
                                query_id=query_id,
                                target=target_key,
                                hops=attempt + 1,
                                duration_ms=elapsed_ms,
                            )
                        )
                        return result

                    if cancel_scope.cancelled_caught:
                        logger.debug("DHT query %s attempt %d timed out", query_id, attempt + 1)
                        if attempt < self._max_retries - 1:
                            await trio.sleep(backoff.next())

                # All retries exhausted
                await self._event_bus.emit(
                    DHTQueryFailed(
                        at=sim_time,
                        query_id=query_id,
                        reason=f"exhausted {self._max_retries} retries",
                    )
                )
                raise DHTQueryExhaustedError(query_id, target_key, self._max_retries)

            finally:
                self._active_queries.pop(query_id, None)


class DHTQueryExhaustedError(Exception):
    def __init__(self, query_id: str, target: str, retries: int) -> None:
        self.query_id = query_id
        self.target = target
        self.retries = retries
        super().__init__(f"DHT query {query_id} for {target} failed after {retries} retries")

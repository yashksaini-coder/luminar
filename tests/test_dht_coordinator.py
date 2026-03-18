"""Tests for DHTQueryCoordinator — verifies timeout, retry, and semaphore guards."""

import pytest
import trio

from backend.concurrency.dht_coordinator import DHTQueryCoordinator, DHTQueryExhaustedError
from backend.events.bus import EventBus


@pytest.fixture
def event_bus():
    return EventBus()


@pytest.fixture
def coordinator(event_bus):
    return DHTQueryCoordinator(event_bus, max_parallel=4, query_timeout=0.5, max_retries=3)


async def test_basic_query(coordinator):
    """Simple query completes and returns result."""
    result = await coordinator.query_peer("peer-0", "target-key")
    assert result["found"] is True
    assert coordinator.active_count == 0


async def test_query_with_custom_fn(coordinator):
    """Custom query function is called and result returned."""

    async def my_query(key):
        return {"key": key, "value": 42}

    result = await coordinator.query_peer("peer-0", "my-key", query_fn=my_query)
    assert result == {"key": "my-key", "value": 42}


async def test_query_timeout_retries(event_bus):
    """Query that always times out exhausts retries and raises."""
    coord = DHTQueryCoordinator(event_bus, max_parallel=4, query_timeout=0.1, max_retries=2)

    async def hang_forever(key):
        await trio.sleep(100)

    with pytest.raises(DHTQueryExhaustedError):
        await coord.query_peer("peer-0", "unreachable", query_fn=hang_forever)

    # DHTQueryFailed emitted
    failed = [e for e in event_bus.ring if e.event_type == "DHTQueryFailed"]
    assert len(failed) == 1
    assert coord.active_count == 0


async def test_semaphore_limits_parallel(event_bus):
    """No more than max_parallel queries run concurrently."""
    coord = DHTQueryCoordinator(event_bus, max_parallel=2, query_timeout=5.0)
    max_concurrent = 0
    current = 0

    async def slow_query(key):
        nonlocal max_concurrent, current
        current += 1
        max_concurrent = max(max_concurrent, current)
        await trio.sleep(0.05)
        current -= 1
        return {"ok": True}

    async with trio.open_nursery() as nursery:
        for i in range(10):
            nursery.start_soon(coord.query_peer, f"peer-{i}", f"key-{i}", slow_query)

    assert max_concurrent <= 2


async def test_100x_find_peer_no_hang(event_bus):
    """Stress test: 100 concurrent DHT queries don't hang.

    This is the original bug reproduction for find_peer.
    """
    coord = DHTQueryCoordinator(event_bus, max_parallel=8, query_timeout=1.0)
    completed = 0

    async def fast_query(key):
        await trio.sleep(0.005)
        return {"found": True}

    async def do_query(i):
        nonlocal completed
        await coord.query_peer(f"peer-{i}", f"key-{i}", query_fn=fast_query)
        completed += 1

    with trio.move_on_after(30) as cancel:
        async with trio.open_nursery() as nursery:
            for i in range(100):
                nursery.start_soon(do_query, i)

    assert not cancel.cancelled_caught, "100× find_peer test hung — deadlock?"
    assert completed == 100
    assert coord.active_count == 0

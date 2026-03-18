"""Tests for StreamManager — verifies semaphore exhaustion, timeout, and always-close guarantees."""

import pytest
import trio

from backend.concurrency.stream_manager import StreamManager, StreamTimeoutError
from backend.events.bus import EventBus


@pytest.fixture
def event_bus():
    return EventBus()


@pytest.fixture
def stream_manager(event_bus):
    return StreamManager(event_bus, max_streams=4, open_timeout=1.0)


async def test_basic_open_close(stream_manager):
    """Stream opens, yields, and closes cleanly."""
    async with stream_manager.open_stream("peer-0", "peer-1", "/test/1.0") as record:
        assert record.stream_id
        assert record.from_peer == "peer-0"
        assert stream_manager.open_count == 1
    assert stream_manager.open_count == 0


async def test_semaphore_limits_concurrent_streams(stream_manager, event_bus):
    """Opening more than max_streams blocks on the semaphore."""
    records = []

    async def open_and_hold(i, task_status=trio.TASK_STATUS_IGNORED):
        async with stream_manager.open_stream(f"peer-{i}", "peer-target", "/test/1.0") as rec:
            records.append(rec)
            task_status.started()
            await trio.sleep_forever()

    async with trio.open_nursery() as nursery:
        # Open max_streams (4)
        for i in range(4):
            await nursery.start(open_and_hold, i)

        assert stream_manager.open_count == 4
        assert stream_manager.available == 0

        # 5th stream should emit SemaphoreBlocked and then block
        blocked = False

        async def try_5th():
            nonlocal blocked
            blocked = True
            async with stream_manager.open_stream("peer-99", "peer-target", "/test/1.0"):
                pass

        # Give it a short time to confirm it blocks
        with trio.move_on_after(0.2):
            async with trio.open_nursery() as inner:
                inner.start_soon(try_5th)
                await trio.sleep(0.1)
                inner.cancel_scope.cancel()

        # Check SemaphoreBlocked was emitted
        blocked_events = [e for e in event_bus.ring if e.event_type == "SemaphoreBlocked"]
        assert len(blocked_events) >= 1

        nursery.cancel_scope.cancel()


async def test_timeout_on_slow_dial(event_bus):
    """Stream dial that exceeds timeout raises StreamTimeoutError."""
    sm = StreamManager(event_bus, max_streams=4, open_timeout=0.1)

    async def slow_dial(peer, protocol):
        await trio.sleep(10)  # Way longer than timeout
        return None

    with pytest.raises(StreamTimeoutError):
        async with sm.open_stream("peer-0", "peer-1", "/test/1.0", dial_fn=slow_dial):
            pass

    # Timeout event emitted
    timeout_events = [e for e in event_bus.ring if e.event_type == "StreamTimeout"]
    assert len(timeout_events) == 1
    assert sm.open_count == 0  # Cleaned up


async def test_always_closes_on_exception(stream_manager):
    """Even if user code raises, the stream is cleaned up."""
    with pytest.raises(ValueError, match="boom"):
        async with stream_manager.open_stream("peer-0", "peer-1", "/test/1.0"):
            raise ValueError("boom")

    assert stream_manager.open_count == 0


async def test_100x_find_peer_no_hang(event_bus):
    """Stress test: 100 concurrent stream attempts don't hang or leak.

    This is the original bug reproduction: loop find_peer 100×,
    assert no hang, stream count stays bounded.
    """
    sm = StreamManager(event_bus, max_streams=8, open_timeout=0.5)

    completed = 0

    async def do_stream(i):
        nonlocal completed
        async with sm.open_stream(f"peer-{i}", f"peer-{i + 100}", "/test/1.0"):
            await trio.sleep(0.01)
        completed += 1

    with trio.move_on_after(10) as cancel:
        async with trio.open_nursery() as nursery:
            for i in range(100):
                nursery.start_soon(do_stream, i)

    assert not cancel.cancelled_caught, "100× stream test hung — semaphore deadlock?"
    assert completed == 100
    assert sm.open_count == 0

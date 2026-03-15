# 8. Testing Strategy

## 8.1 Testing Framework

| Tool | Purpose |
|------|---------|
| pytest | Test runner and assertions |
| pytest-trio | Async test support for Trio |
| trio.testing | Mock clocks, memory channels |

**Run all tests:**
```bash
uv run pytest tests/ -v
```

## 8.2 Test Suite Overview

| Test File | Module Under Test | Tests | Focus |
|-----------|------------------|-------|-------|
| `test_stream_manager.py` | `backend/concurrency/stream_manager.py` | 4+ | Stream lifecycle, semaphore limits, timeouts, cleanup |
| `test_dht_coordinator.py` | `backend/concurrency/dht_coordinator.py` | 5+ | DHT queries, timeouts, retries, semaphore limits, stress |
| `test_event_bus.py` | `backend/events/bus.py` | 3+ | Pub/sub, ring buffer, backpressure |
| `test_fault_injector.py` | `backend/fault/injector.py` | 5+ | Each fault type, clear, active listing |
| `test_gossip_engine.py` | `backend/gossip/engine.py` | 4+ | Publish, propagation, mesh maintenance, traces |
| `test_gossip_scoring.py` | `backend/gossip/scoring.py` | 4+ | P1–P4 parameters, decay, thresholds |
| `test_topology.py` | `backend/topology/manager.py` | 8+ | Each topology type, metrics computation |

## 8.3 Concurrency Tests (Critical)

### StreamManager Tests

#### `test_basic_open_close`
Verifies the fundamental stream lifecycle:

```python
async def test_basic_open_close():
    sm = StreamManager(max_streams=64, event_bus=bus)

    async with sm.open_stream("peer-00", "peer-01", "/proto/1.0"):
        assert sm.open_count == 1

    assert sm.open_count == 0  # Cleaned up
```

#### `test_semaphore_limits_concurrent_streams`
Verifies semaphore prevents exceeding max concurrent streams:

```python
async def test_semaphore_limits_concurrent_streams():
    sm = StreamManager(max_streams=2, event_bus=bus)

    async with sm.open_stream("a", "b", "/p"):
        async with sm.open_stream("c", "d", "/p"):
            assert sm.open_count == 2
            assert sm.available == 0
            # Third stream would block here
```

#### `test_timeout_on_slow_dial`
Verifies that slow dial operations are cancelled:

```python
async def test_timeout_on_slow_dial():
    sm = StreamManager(max_streams=64, open_timeout=0.1, event_bus=bus)

    async def slow_dial(peer, proto):
        await trio.sleep(10)  # Way longer than timeout

    with pytest.raises(StreamTimeoutError):
        async with sm.open_stream("a", "b", "/p", dial_fn=slow_dial):
            pass  # Should never reach here
```

#### `test_always_closes_on_exception`
**Critical test** — verifies the bug fix that streams are always cleaned up:

```python
async def test_always_closes_on_exception():
    sm = StreamManager(max_streams=64, event_bus=bus)

    with pytest.raises(ValueError):
        async with sm.open_stream("a", "b", "/p"):
            raise ValueError("Application error")

    assert sm.open_count == 0  # Stream was cleaned up despite exception
    assert sm.available == 64  # Semaphore slot was released
```

### DHTQueryCoordinator Tests

#### `test_100x_find_peer_no_hang` (Stress Test)
The most important test — verifies that 100 concurrent DHT queries complete without deadlock:

```python
async def test_100x_find_peer_no_hang():
    coord = DHTQueryCoordinator(max_parallel=8, query_timeout=1.0, event_bus=bus)
    results = []

    async def run_query(i):
        result = await coord.query_peer(f"peer-{i}", f"target-{i}")
        results.append(result)

    async with trio.open_nursery() as nursery:
        for i in range(100):
            nursery.start_soon(run_query, i)

    assert len(results) == 100  # All completed, no hangs
```

**What this tests:**
- Semaphore correctly limits to 8 parallel queries
- Remaining 92 queries wait and eventually complete
- No deadlock between semaphore acquisition and query execution
- Memory doesn't leak from 100 concurrent tasks

#### `test_query_timeout_retries`
Verifies exponential backoff on timeout:

```python
async def test_query_timeout_retries():
    attempt_count = 0

    async def failing_query(target):
        nonlocal attempt_count
        attempt_count += 1
        await trio.sleep(100)  # Always times out

    coord = DHTQueryCoordinator(
        max_parallel=8, query_timeout=0.1, max_retries=3, event_bus=bus
    )

    with pytest.raises(DHTQueryExhaustedError):
        await coord.query_peer("a", "target", query_fn=failing_query)

    assert attempt_count == 3  # Retried exactly 3 times
```

## 8.4 Event Bus Tests

#### `test_pub_sub_delivery`
```python
async def test_pub_sub_delivery():
    bus = EventBus()
    recv = bus.subscribe()

    await bus.emit(ClockTick(at=1.0, speed=1.0))

    event = recv.receive_nowait()
    assert event.event_type == "ClockTick"
    assert event.at == 1.0
```

#### `test_ring_buffer_eviction`
```python
async def test_ring_buffer_eviction():
    bus = EventBus(max_events=3)

    await bus.emit(ClockTick(at=1.0, speed=1.0))
    await bus.emit(ClockTick(at=2.0, speed=1.0))
    await bus.emit(ClockTick(at=3.0, speed=1.0))
    await bus.emit(ClockTick(at=4.0, speed=1.0))  # Evicts at=1.0

    events = bus.events_since(0)
    assert len(events) == 3
    assert events[0].at == 2.0  # Oldest remaining
```

#### `test_backpressure_drops`
```python
async def test_backpressure_drops():
    bus = EventBus()
    recv = bus.subscribe()  # Never consumed

    # Fill subscriber's channel buffer
    for i in range(300):
        await bus.emit(ClockTick(at=float(i), speed=1.0))

    # Bus should not block — slow subscriber gets dropped events
    assert bus.event_count == 300
```

## 8.5 Gossip Engine Tests

#### `test_message_propagation`
```python
async def test_message_propagation():
    engine = GossipEngine(event_bus=bus)
    engine.set_topology({"a": {"b", "c"}, "b": {"a", "c"}, "c": {"a", "b"}})
    engine.subscribe_all("topic")
    engine.build_mesh("topic")

    await engine.publish("a", "topic", "hello")

    trace = engine.get_trace("msg-...")
    assert len(trace.delivered_to) == 3  # All peers received
    assert trace.origin == "a"
```

#### `test_mesh_rebalancing`
```python
async def test_mesh_rebalancing():
    engine = GossipEngine(event_bus=bus)
    # Set up mesh with too many peers (> D_HIGH)
    engine._mesh["topic"]["peer-00"] = {"p1", "p2", "p3", "p4", "p5",
                                         "p6", "p7", "p8", "p9"}  # 9 > D_HIGH=8

    engine.heartbeat()

    assert len(engine._mesh["topic"]["peer-00"]) == 6  # Pruned to D=6
```

## 8.6 Topology Tests

```python
@pytest.mark.parametrize("topo_type,params", [
    ("random", {"nodes": 20, "p": 0.15}),
    ("scale_free", {"nodes": 20, "m": 2}),
    ("small_world", {"nodes": 20, "p": 0.3}),
    ("clustered", {"nodes": 20, "clusters": 3, "intra_p": 0.7, "inter_p": 0.1}),
    ("ring", {"nodes": 20}),
    ("star", {"nodes": 20}),
    ("tree", {"nodes": 20}),
    ("complete", {"nodes": 20}),
])
async def test_topology_generation(topo_type, params):
    manager = TopologyManager()
    G, positions = manager.generate(topo_type, params)

    assert G.number_of_nodes() == params["nodes"]
    assert G.number_of_edges() > 0
    assert len(positions) == params["nodes"]

    metrics = manager.compute_metrics(G)
    assert metrics["nodes"] == params["nodes"]
    assert 0 <= metrics["density"] <= 1
    assert metrics["clustering"] >= 0
```

## 8.7 Fault Injector Tests

```python
async def test_latency_injection():
    injector = FaultInjector()
    fault_id = injector.inject_latency("a", "b", ms=200, jitter_ms=50)

    latency = injector.get_latency("a", "b")
    assert 200 <= latency <= 250  # base + jitter

    latency_other = injector.get_latency("a", "c")
    assert latency_other == 0  # No fault between a and c

async def test_partition():
    injector = FaultInjector()
    injector.inject_partition(["a", "b"], ["c", "d"])

    assert injector.is_partitioned("a", "c") == True
    assert injector.is_partitioned("a", "b") == False  # Same group

async def test_clear_fault():
    injector = FaultInjector()
    fid = injector.inject_latency("a", "b", ms=100, jitter_ms=0)

    injector.clear(fid)
    assert injector.get_latency("a", "b") == 0
    assert len(injector.active_faults) == 0
```

## 8.8 Testing Methodology

### Unit Tests
Each backend module has isolated unit tests that:
- Use mock EventBus to capture emitted events
- Use Trio's testing utilities for async tests
- Test both happy path and error paths

### Stress Tests
Concurrency components include stress tests (100x concurrent operations) to verify:
- No deadlocks under high load
- Semaphores correctly bound parallelism
- Memory doesn't leak
- All operations complete within timeout

### Integration Tests
The API endpoints are tested via HTTP:
```bash
# All 16 core API endpoints tested manually:
curl http://localhost:8000/api/sim/snapshot    # 200 OK
curl -X POST http://localhost:8000/api/sim/play  # 200 OK
curl http://localhost:8000/api/nodes           # 200 OK
curl http://localhost:8000/api/topology/list   # 200 OK
curl http://localhost:8000/api/gossip/mesh     # 200 OK
curl http://localhost:8000/api/fault/active    # 200 OK
curl http://localhost:8000/api/trace/recent    # 200 OK
curl http://localhost:8000/api/metrics/snapshot # 200 OK
# ... and more
```

### Frontend Testing
The Angular frontend is tested by:
- Building successfully (`npm run build` — no TypeScript errors)
- Dev server startup (`ng serve` — no runtime errors)
- Proxy configuration validation (API and WebSocket proxies work)
- Visual verification of all 5 feature tabs

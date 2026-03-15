# 4. Backend Design

## 4.1 Technology Choices

| Technology | Version | Purpose |
|------------|---------|---------|
| Python | 3.12 | Core language |
| FastAPI | Latest | HTTP + WebSocket server |
| uvicorn | Latest | ASGI server |
| Trio | Latest | Structured concurrency (async runtime) |
| py-libp2p | Latest | P2P protocol primitives |
| NetworkX | Latest | Graph theory / topology generation |
| orjson | Latest | Fast JSON serialization (binary output) |
| Pydantic | v2 | Data validation for API models |

### Why Trio over asyncio?

Trio provides **structured concurrency** — every async task has a well-defined lifetime within a nursery. This guarantees:

- No orphaned tasks (all tasks in a nursery must complete before the nursery exits)
- Clean cancellation (cancelling a nursery cancels all child tasks)
- No silent exception swallowing (exceptions propagate to parent nurseries)

Since py-libp2p is built on Trio, Lumina uses Trio exclusively to avoid the complexity and bugs of mixing async runtimes.

## 4.2 Entry Point — `backend/main.py`

The FastAPI application serves as both the HTTP API and WebSocket server.

### Lifespan Management

```python
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: create engine, injector, metrics, gossip
    engine = SimulationEngine(node_count=NODE_COUNT)
    fault_injector = FaultInjector()
    metrics = MetricsCollector()

    # Start trio simulation in background thread
    trio_thread = Thread(target=trio.run, args=(run_simulation,))
    trio_thread.start()

    yield  # Application runs

    # Shutdown: stop engine, join thread
    engine.stop()
    trio_thread.join()
```

### Trio–asyncio Bridge

FastAPI runs on asyncio; the simulation runs on Trio. Communication uses thread-safe primitives:

```python
# From FastAPI handler (asyncio) to Trio simulation:
async def inject_fault(request):
    # Uses trio.from_thread to call into Trio nursery
    result = await trio.from_thread.run(fault_injector.inject, ...)
    return result
```

### WebSocket Handler

```python
@app.websocket("/ws/events")
async def websocket_events(ws: WebSocket):
    await ws.accept()

    while True:
        # Poll EventBus every 50ms
        events = event_bus.drain_since_last_poll()
        for event in events:
            await ws.send_bytes(event.to_json())  # orjson binary
        await trio.sleep(0.05)
```

## 4.3 Event System

### Event Types (`backend/events/types.py`)

All events inherit from `BaseEvent` and carry a timestamp, event type, and category:

```python
@dataclass
class BaseEvent:
    at: float           # Simulation time
    event_type: str     # e.g., "GossipMessage"
    category: str       # e.g., "gossip"

    def to_dict(self) -> dict: ...
    def to_json(self) -> bytes:
        return orjson.dumps(self.to_dict())
```

#### Event Catalog

| Category | Event | Key Fields | When Emitted |
|----------|-------|------------|-------------|
| **clock** | ClockTick | time, speed | Every 0.1 sim-seconds |
| **simulation** | SimulationStateChanged | old_state, new_state | Play/pause/reset |
| **connection** | PeerConnected | peer_id | Node joins network |
| **connection** | PeerDisconnected | peer_id | Node leaves/crashes |
| **stream** | StreamOpened | from_peer, to_peer, protocol | Stream dial succeeds |
| **stream** | StreamClosed | stream_id, duration | Stream cleanup (always) |
| **stream** | StreamTimeout | from_peer, to_peer, timeout | Dial exceeds timeout |
| **stream** | SemaphoreBlocked | peer_id, layer | Semaphore at capacity |
| **dht** | DHTQueryStarted | initiator, target_key | DHT lookup begins |
| **dht** | DHTQueryCompleted | initiator, target_key, hops | Lookup succeeds |
| **dht** | DHTQueryFailed | initiator, target_key, reason | All retries exhausted |
| **gossip** | GossipMessage | from_peer, msg_id, topic, hops | Message propagated |
| **gossip** | GraftEvent | peer_id, other_peer, topic | Mesh peer added |
| **gossip** | PruneEvent | peer_id, other_peer, topic | Mesh peer removed |
| **fault** | FaultInjected | fault_type, fault_id, params | Fault activated |
| **fault** | FaultCleared | fault_id | Fault removed |
| **fault** | PeerRecovered | peer_id | Node restored after drop |

### EventBus (`backend/events/bus.py`)

Central pub/sub hub with ring buffer for replay:

```python
class EventBus:
    _subscribers: list[trio.MemorySendChannel]
    _ring: deque[BaseEvent]  # maxlen=500_000
    _event_count: int

    async def emit(self, event: BaseEvent):
        self._ring.append(event)
        self._event_count += 1

        for channel in self._subscribers:
            try:
                channel.send_nowait(event)
            except trio.WouldBlock:
                pass  # Drop for slow subscriber (backpressure)

    def subscribe(self) -> trio.MemoryReceiveChannel:
        send, recv = trio.open_memory_channel(256)
        self._subscribers.append(send)
        return recv

    def events_since(self, t: float) -> list[BaseEvent]:
        return [e for e in self._ring if e.at >= t]
```

**Design Decisions:**
- **Ring buffer (500k)**: Bounded memory (~200MB worst case), oldest events evicted
- **Backpressure**: Slow subscribers get dropped events (not blocked)
- **events_since()**: Enables timeline scrubbing — seek to time T, replay events from T

## 4.4 Simulation Engine

### SimulationEngine (`backend/simulation/engine.py`)

Orchestrates the full simulation lifecycle:

```python
class SimulationEngine:
    event_bus: EventBus
    clock: SimulationClock
    node_pool: NodePool
    state: str  # "stopped" | "running" | "paused"

    async def start(self, nursery: trio.Nursery):
        self.clock = SimulationClock(self.event_bus)
        self.node_pool = NodePool(self.node_count, self.event_bus)

        nursery.start_soon(self.clock.run)
        nursery.start_soon(self.node_pool.run)

        self.state = "running"
        self.event_bus.emit(SimulationStateChanged("stopped", "running"))

    def play(self):
        self.clock.resume()
        self.state = "running"

    def pause(self):
        self.clock.pause()
        self.state = "paused"

    def reset(self):
        self.clock.reset()
        self.node_pool.reset()
        self.event_bus.clear()
        self.state = "stopped"
```

### SimulationClock (`backend/simulation/clock.py`)

Controllable time source with speed adjustment:

```python
class SimulationClock:
    _time: float = 0.0
    _speed: float = 1.0
    _running: bool = False
    TICK_INTERVAL: float = 0.1  # Simulation seconds per tick

    async def run(self):
        while True:
            if self._running:
                wall_sleep = self.TICK_INTERVAL / self._speed
                await trio.sleep(wall_sleep)
                self._time += self.TICK_INTERVAL
                await self.event_bus.emit(ClockTick(self._time, self._speed))
            else:
                await trio.sleep(0.05)  # Idle when paused

    def set_speed(self, speed: float):
        self._speed = speed  # 0.1× to 100×

    def seek(self, time: float):
        self._time = time
```

**Time dilation example:** At speed=5×, a 0.1s simulation tick takes 0.02s wall time. At speed=0.5×, it takes 0.2s wall time.

### NodePool (`backend/simulation/node_pool.py`)

Manages N simulated peers with concurrent task loops:

```python
class NodePool:
    _nodes: dict[str, PeerNode]
    stream_manager: StreamManager
    dht_coordinator: DHTQueryCoordinator
    gossip: GossipEngine

    async def run(self, nursery: trio.Nursery):
        for peer_id, node in self._nodes.items():
            nursery.start_soon(self._peer_loop, peer_id)

        nursery.start_soon(self._heartbeat_loop)
        nursery.start_soon(self._dht_walk_loop)

    async def _peer_loop(self, peer_id: str):
        """Each peer publishes messages at random intervals."""
        while True:
            delay = random.uniform(5.0, 15.0)  # sim-seconds
            await self.clock.sleep(delay)

            if self._nodes[peer_id].state != NodeState.FAILED:
                await self.gossip.publish(peer_id, "lumina-topic", message)

    async def _heartbeat_loop(self):
        """GossipSub heartbeat every 1 sim-second."""
        while True:
            await self.clock.sleep(1.0)
            self.gossip.heartbeat()

    async def _dht_walk_loop(self):
        """Random DHT queries every 3 sim-seconds."""
        while True:
            await self.clock.sleep(3.0)
            initiator = random.choice(list(self._nodes.keys()))
            target = random.choice(list(self._nodes.keys()))
            await self.dht_coordinator.query_peer(initiator, target)
```

**Node State Machine:**
```
                    ┌──────────┐
         ┌─────────│  JOINING  │─────────┐
         │         └──────────┘          │
         ▼                               ▼
    ┌──────────┐  publish    ┌──────────┐
    │   IDLE   │────────────▶│  ORIGIN  │
    └──────────┘             └──────────┘
         ▲                        │
         │  decoded               │ gossip
         │                        ▼
    ┌──────────┐             ┌──────────┐
    │ DECODED  │◀────────────│RECEIVING │
    └──────────┘             └──────────┘
         │
         │  error/timeout
         ▼
    ┌──────────┐  drop fault ┌──────────┐
    │  ERROR   │────────────▶│  FAILED  │
    └──────────┘             └──────────┘
                                  │
                                  │ recover
                                  ▼
                             ┌──────────┐
                             │   IDLE   │
                             └──────────┘
```

## 4.5 Concurrency Layer

### StreamManager (`backend/concurrency/stream_manager.py`)

Manages the lifecycle of libp2p streams with guaranteed cleanup:

```python
class StreamManager:
    _sem: trio.Semaphore  # Default capacity: 64
    _open_streams: dict[str, StreamRecord]

    @asynccontextmanager
    async def open_stream(self, from_peer, to_peer, protocol, dial_fn=None):
        if self._sem.value == 0:
            await self.event_bus.emit(SemaphoreBlocked(from_peer, "stream"))

        async with self._sem:  # Acquire slot (blocks if full)
            record = StreamRecord(from_peer, to_peer, protocol)

            # Dial with timeout
            if dial_fn:
                with trio.move_on_after(self.open_timeout) as cancel:
                    record.stream = await dial_fn(to_peer, protocol)

                if cancel.cancelled_caught:
                    await self.event_bus.emit(StreamTimeout(...))
                    raise StreamTimeoutError(...)

            self._open_streams[record.id] = record
            await self.event_bus.emit(StreamOpened(...))

            try:
                yield record  # Caller uses the stream
            finally:
                # CRITICAL: Always close, even on exception
                del self._open_streams[record.id]
                if record.stream:
                    await record.stream.close()
                await self.event_bus.emit(StreamClosed(...))
```

**Bug this fixes:** Without `try/finally`, a stream that fails mid-operation leaks the semaphore slot. After 64 leaked streams, all future stream operations block forever.

### DHTQueryCoordinator (`backend/concurrency/dht_coordinator.py`)

Bounded DHT queries with timeout and exponential backoff:

```python
class DHTQueryCoordinator:
    _sem: trio.Semaphore  # Default capacity: 8

    async def query_peer(self, initiator, target_key, query_fn=None):
        if self._sem.value == 0:
            await self.event_bus.emit(SemaphoreBlocked(initiator, "dht"))

        async with self._sem:
            await self.event_bus.emit(DHTQueryStarted(initiator, target_key))

            backoff = ExponentialBackoff(base=0.2, cap=5.0)

            for attempt in range(self.max_retries):  # Default: 3
                with trio.move_on_after(self.query_timeout) as cancel:
                    result = await (query_fn or self._default_query)(target_key)
                    await self.event_bus.emit(DHTQueryCompleted(..., hops=result.hops))
                    return result

                if cancel.cancelled_caught and attempt < self.max_retries - 1:
                    delay = backoff.next()  # 0.2s, 0.4s, 0.8s... + jitter
                    await trio.sleep(delay)

            await self.event_bus.emit(DHTQueryFailed(initiator, target_key, "exhausted"))
            raise DHTQueryExhaustedError(...)
```

**Exponential Backoff Formula:**
```
delay = min(base × 2^attempt, cap) + random(0, jitter)
     = min(0.2 × 2^attempt, 5.0) + random(0, 0.1)

Attempt 0: 0.2s + jitter
Attempt 1: 0.4s + jitter
Attempt 2: 0.8s + jitter
```

## 4.6 Topology Management

### TopologyManager (`backend/topology/manager.py`)

Uses NetworkX to generate and analyze graph topologies:

```python
class TopologyManager:
    def generate(self, topo_type: str, params: dict) -> tuple[Graph, dict]:
        match topo_type:
            case "random":
                G = nx.erdos_renyi_graph(n, p)
            case "scale_free":
                G = nx.barabasi_albert_graph(n, m)
            case "small_world":
                G = nx.watts_strogatz_graph(n, k=4, p=p)
            case "clustered":
                sizes = [n // clusters] * clusters
                G = nx.stochastic_block_model(sizes, probs)
            case "ring":
                G = nx.cycle_graph(n)
            case "star":
                G = nx.star_graph(n - 1)
            case "tree":
                G = nx.random_tree(n)
            case "complete":
                G = nx.complete_graph(n)

        positions = nx.spring_layout(G, scale=400)
        return G, positions

    def compute_metrics(self, G: Graph) -> dict:
        return {
            "nodes": G.number_of_nodes(),
            "edges": G.number_of_edges(),
            "density": nx.density(G),
            "clustering": nx.average_clustering(G),
            "diameter": nx.diameter(G),
            "avg_path_length": nx.average_shortest_path_length(G),
            "algebraic_connectivity": nx.algebraic_connectivity(G),
            "degree_distribution": dict(Counter(dict(G.degree()).values())),
        }
```

## 4.7 Fault Injection

### FaultInjector (`backend/fault/injector.py`)

```python
class FaultInjector:
    _active_faults: dict[str, dict]  # fault_id → fault config

    def inject_latency(self, peer_a, peer_b, ms, jitter_ms) -> str:
        fault_id = uuid4()
        self._active_faults[fault_id] = {
            "type": "latency", "peer_a": peer_a, "peer_b": peer_b,
            "ms": ms, "jitter_ms": jitter_ms
        }
        return fault_id

    def get_latency(self, peer_a, peer_b) -> float:
        """Returns extra latency in ms for this peer pair."""
        for fault in self._active_faults.values():
            if fault["type"] == "latency":
                if {fault["peer_a"], fault["peer_b"]} == {peer_a, peer_b}:
                    return fault["ms"] + random.uniform(0, fault["jitter_ms"])
        return 0.0

    def inject_partition(self, group_a, group_b) -> str:
        """Block all communication between two groups."""
        ...

    def is_partitioned(self, peer_a, peer_b) -> bool:
        """Check if two peers are in different partition groups."""
        ...

    def drop_peer(self, peer_id) -> str:
        """Crash a peer — set FAILED state, score=0, remove from mesh."""
        ...

    def inject_sybil(self, n_attackers, target_topic) -> str:
        """Add fake peers to mesh."""
        ...

    def inject_eclipse(self, target_peer_id, n_attackers) -> str:
        """Rewire target's mesh to only contain attacker nodes."""
        ...
```

## 4.8 Metrics Collection

### MetricsCollector (`backend/metrics/collector.py`)

Aggregates real-time state for the metrics API:

```python
class MetricsCollector:
    def snapshot(self) -> dict:
        return {
            "node_count": len(node_pool.nodes),
            "state_distribution": {
                "idle": count_by_state("idle"),
                "origin": count_by_state("origin"),
                "receiving": count_by_state("receiving"),
                "failed": count_by_state("failed"),
                ...
            },
            "total_messages_sent": sum(n.messages_sent for n in nodes),
            "total_messages_received": sum(n.messages_received for n in nodes),
            "event_counts": event_bus.count_by_category(),
            "stream_manager": {
                "open": stream_manager.open_count,
                "max": stream_manager.max_streams,
                "available": stream_manager.available,
            },
            "dht_coordinator": {
                "active": dht_coordinator.active_count,
                "available": dht_coordinator.available,
            },
        }
```

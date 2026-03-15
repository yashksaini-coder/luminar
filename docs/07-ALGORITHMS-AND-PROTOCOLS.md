# 7. Algorithms and Protocols

## 7.1 GossipSub v1.1 Protocol Implementation

### Overview

GossipSub is a topic-based pub/sub protocol that creates an overlay mesh network on top of the physical peer connections. Lumina implements the core GossipSub v1.1 specification as used in Ethereum 2.0.

### Data Structures

```python
class GossipEngine:
    # Topic subscriptions: which peers are subscribed to which topics
    _subscriptions: dict[str, set[str]]  # topic → {peer_ids}

    # Mesh overlay: per-topic, per-peer mesh neighbors
    _mesh: dict[str, dict[str, set[str]]]  # topic → peer → {mesh_peers}

    # Physical topology: who can talk to whom
    _topology: dict[str, set[str]]  # peer → {connected_peers}

    # Message deduplication: per-peer seen message IDs
    _seen: dict[str, set[str]]  # peer → {msg_ids}

    # Message history: for IHAVE/IWANT protocol
    _history: dict[str, list[str]]  # peer → [recent_msg_ids] (max 50)

    # Message traces: hop-by-hop propagation records
    _traces: dict[str, MessageTrace]  # msg_id → trace

    # Peer scoring
    scorer: PeerScoreTracker
```

### Message Propagation Algorithm

```
PUBLISH(peer_id, topic, message):
    1. Create msg_id = hash(message)
    2. Create MessageTrace(msg_id, peer_id, topic, current_time)
    3. Mark message as seen by peer_id
    4. Add to peer's message history

    5. FLOOD to all topology neighbors of peer_id:
       FOR each neighbor in topology[peer_id]:
           IF neighbor subscribed to topic:
               IF msg_id NOT in seen[neighbor]:
                   Mark seen[neighbor] += msg_id
                   Record hop in trace
                   Emit GossipMessage event
                   Schedule PROPAGATE(neighbor, msg_id, topic, hop+1)

PROPAGATE(peer_id, msg_id, topic, hop_count):
    1. Get mesh peers for this peer on this topic
    2. FOR each mesh_peer in mesh[topic][peer_id]:
           IF msg_id NOT in seen[mesh_peer]:
               Check fault_injector for:
                   - Partition: skip if partitioned(peer_id, mesh_peer)
                   - Latency: add delay if latency fault active
                   - Drop: skip if mesh_peer is failed

               Mark seen[mesh_peer] += msg_id
               Record hop in trace
               Emit GossipMessage event
               Schedule PROPAGATE(mesh_peer, msg_id, topic, hop+1)

    3. Update trace: delivered_to count, propagation time
```

### Heartbeat Algorithm (runs every 1 simulation second)

```
HEARTBEAT():
    FOR each topic in subscriptions:
        FOR each peer in subscriptions[topic]:
            current_degree = len(mesh[topic][peer])

            IF current_degree < D_LOW (4):
                # GRAFT: add peers to mesh
                candidates = subscriptions[topic] - mesh[topic][peer]
                candidates = filter(c: scorer.score(c) > GRAFT_THRESHOLD)
                to_add = random.sample(candidates, D_LOW - current_degree)
                FOR each new_peer in to_add:
                    mesh[topic][peer].add(new_peer)
                    mesh[topic][new_peer].add(peer)  # Bidirectional
                    Emit GraftEvent(peer, new_peer, topic)

            ELIF current_degree > D_HIGH (8):
                # PRUNE: remove excess peers from mesh
                to_remove = random.sample(mesh[topic][peer], current_degree - D)
                FOR each old_peer in to_remove:
                    mesh[topic][peer].remove(old_peer)
                    mesh[topic][old_peer].remove(peer)
                    Emit PruneEvent(peer, old_peer, topic)

    # Decay peer scores
    scorer.decay_all()
```

### Mesh Maintenance Visualization

```
Before heartbeat (degree=3, below D_LOW=4):

    peer-00 ─── peer-03
       │
    peer-07
       │
    peer-12

After GRAFT (degree=4, at D_LOW):

    peer-00 ─── peer-03
       │
    peer-07
       │
    peer-12
       │
    peer-15  ← newly grafted
```

## 7.2 Peer Scoring Algorithm

### Score Formula

Each peer A computes a score for peer B based on four weighted parameters:

```
Score(B) = P1(B) + P2(B) + P3(B) + P4(B)
```

### P1 — Time in Mesh (Stability Reward)

```
P1 = min(time_in_mesh / quantum, cap) × weight

Where:
  time_in_mesh = seconds since B joined A's mesh
  quantum = 1.0 second
  cap = 10.0 (max contribution)
  weight = +0.5

Range: [0, +5.0]
```

**Purpose:** Rewards peers that maintain stable mesh connections. New peers start at 0 and build up credit over time.

### P2 — First Message Deliveries (Freshness Reward)

```
P2 = first_deliveries × weight

Where:
  first_deliveries = count of messages B delivered to A before anyone else
  weight = +1.0
  decay = 0.9 per heartbeat (exponential)

After each heartbeat:
  first_deliveries *= 0.9

Range: [0, +∞) (practically bounded by decay)
```

**Purpose:** Rewards peers that consistently deliver fresh content. The decay ensures recent behavior matters more than historical.

### P3 — Mesh Delivery Ratio (Freeloading Penalty)

```
P3 = weight × deficit

Where:
  delivery_ratio = messages_delivered_by_B / total_messages_in_mesh
  threshold = 0.5
  deficit = max(0, threshold - delivery_ratio)
  weight = -1.0
  activation = 5.0 seconds (grace period for new peers)

If time_in_mesh < activation: P3 = 0
If delivery_ratio >= threshold: P3 = 0
If delivery_ratio < threshold: P3 = weight × (threshold - ratio)

Range: [-0.5, 0]
```

**Purpose:** Penalizes peers that consume messages but don't forward them. The activation delay prevents penalizing newly joined peers.

### P4 — Invalid Messages (Malicious Penalty)

```
P4 = invalid_count × weight

Where:
  invalid_count = number of invalid messages sent by B
  weight = -10.0
  decay = 0.5 per heartbeat (fast decay)

After each heartbeat:
  invalid_count *= 0.5

Range: (-∞, 0]
```

**Purpose:** Heavily penalizes peers sending corrupt or invalid messages. The steep weight (-10) means even one invalid message significantly drops the score.

### Score Thresholds

```
Total Score > 0         → Normal operation
Total Score < -5.0      → Cannot GRAFT into mesh (GRAFT_THRESHOLD)
Total Score < -10.0     → Actively PRUNED from mesh (PRUNE_THRESHOLD)
```

### Scoring Example

```
Peer-07 in mesh for 8 seconds:
  P1 = min(8.0/1.0, 10.0) × 0.5 = 4.0
  P2 = 3 first deliveries × 1.0 = 3.0
  P3 = ratio=0.85 > 0.5 → 0.0
  P4 = 0 invalid × -10.0 = 0.0
  Total = 7.0 (healthy peer)

Peer-12 with poor delivery:
  P1 = min(20.0/1.0, 10.0) × 0.5 = 5.0
  P2 = 0.5 (decayed) × 1.0 = 0.5
  P3 = ratio=0.3 < 0.5 → -1.0 × (0.5-0.3) = -0.2
  P4 = 1 invalid × -10.0 = -10.0
  Total = -4.7 (approaching GRAFT threshold)
```

## 7.3 Exponential Backoff with Jitter (DHT Queries)

### Problem

DHT queries can fail due to network issues, slow peers, or high load. Immediate retry wastes resources and causes thundering herd.

### Algorithm

```python
class ExponentialBackoff:
    def __init__(self, base=0.2, cap=5.0, jitter=0.1):
        self.base = base
        self.cap = cap
        self.jitter = jitter
        self.attempt = 0

    def next(self) -> float:
        delay = min(self.base * (2 ** self.attempt), self.cap)
        delay += random.uniform(0, self.jitter)
        self.attempt += 1
        return delay
```

### Retry Schedule

| Attempt | Base Delay | With Jitter | Total Wait |
|---------|-----------|-------------|------------|
| 0 | 0.20s | 0.20–0.30s | 0.20–0.30s |
| 1 | 0.40s | 0.40–0.50s | 0.60–0.80s |
| 2 | 0.80s | 0.80–0.90s | 1.40–1.70s |
| 3 | 1.60s | 1.60–1.70s | 3.00–3.40s |
| 4 | 3.20s | 3.20–3.30s | 6.20–6.70s |
| 5+ | 5.00s (cap) | 5.00–5.10s | 11.2–11.8s |

### Jitter Purpose

Without jitter, all failed queries retry at exact same times → thundering herd:
```
Time 0.0:  Query A fails, Query B fails, Query C fails
Time 0.2:  A retries, B retries, C retries  ← ALL at once (bad)
```

With jitter (each adds random 0–0.1s):
```
Time 0.0:  Query A fails, Query B fails, Query C fails
Time 0.22: A retries
Time 0.25: B retries
Time 0.29: C retries  ← Spread out (good)
```

## 7.4 Semaphore-Based Concurrency Control

### Two-Semaphore Design

Lumina uses two independent semaphores for different protocol layers:

```
┌──────────────────────────────────────────┐
│            Application Layer             │
│                                          │
│   ┌──────────────────────────────────┐   │
│   │  DHTQueryCoordinator (sem=8)     │   │
│   │                                  │   │
│   │  Limits: 8 parallel DHT queries  │   │
│   │  Timeout: 5s per query           │   │
│   │  Retries: 3 with backoff         │   │
│   └──────────────────────────────────┘   │
│                                          │
├──────────────────────────────────────────┤
│            Transport Layer               │
│                                          │
│   ┌──────────────────────────────────┐   │
│   │  StreamManager (sem=64)          │   │
│   │                                  │   │
│   │  Limits: 64 concurrent streams   │   │
│   │  Timeout: 10s per dial           │   │
│   │  Cleanup: guaranteed via finally │   │
│   └──────────────────────────────────┘   │
│                                          │
└──────────────────────────────────────────┘
```

### Why Two Semaphores?

A single semaphore for both layers causes **priority inversion**:
- DHT queries (short, frequent) get blocked by long-running streams
- Or streams (critical for data transfer) get starved by many DHT queries

Separate semaphores ensure:
- DHT can always query (up to 8 parallel) regardless of stream count
- Streams can always open (up to 64 concurrent) regardless of DHT load
- Each layer manages its own backpressure independently

### Semaphore Blocking Visualization

When a semaphore is full, the component emits a `SemaphoreBlocked` event:

```
Event: SemaphoreBlocked
  peer_id: "peer-07"
  layer: "stream"         ← Which semaphore is full
  available: 0
  max: 64
  at: 45.2               ← Simulation time
```

This appears in the event log and metrics panel, allowing users to see when resources are constrained.

## 7.5 Force-Directed Graph Layout (D3.js)

### Algorithm

D3's force simulation uses velocity Verlet integration to compute node positions:

```
Forces applied each tick:
1. d3.forceLink()     — Edges act as springs (attract connected nodes)
2. d3.forceManyBody() — Nodes repel each other (charge = -300)
3. d3.forceCenter()   — Gentle pull toward center (prevents drift)

Each tick:
  FOR each node:
    velocity += sum(forces) × alpha
    position += velocity
    velocity *= (1 - friction)

  alpha *= alphaDecay  (0.99, cools down over time)
```

### Parameters Used

| Force | Parameter | Value | Effect |
|-------|-----------|-------|--------|
| Link | distance | 100 | Natural spring length |
| Link | strength | 0.3 | Spring stiffness |
| Charge | strength | -300 | Node repulsion force |
| Center | x, y | width/2, height/2 | Center of viewport |

### Convergence

The simulation starts with `alpha=1.0` and decays toward 0. Higher alpha means more movement. The graph settles after ~300 ticks (5 seconds at 60fps).

## 7.6 Network Topology Algorithms

### Erdos-Renyi Random Graph — G(n, p)

```
For each pair of nodes (i, j):
    Add edge with probability p

Expected edges: n(n-1)/2 × p
Expected degree: (n-1) × p
Connected when: p > ln(n)/n
```

### Barabasi-Albert Scale-Free — BA(n, m)

```
Start with m+1 fully connected nodes
For each new node:
    Connect to m existing nodes
    Probability of connecting to node i ∝ degree(i)
    (Preferential attachment — "rich get richer")

Result: Power-law degree distribution P(k) ~ k^(-3)
```

### Watts-Strogatz Small-World — WS(n, k, p)

```
Start with ring of n nodes, each connected to k nearest neighbors
For each edge:
    With probability p, rewire to random node

p=0: Regular ring (high clustering, long paths)
p=1: Random graph (low clustering, short paths)
p~0.1: Small-world (high clustering AND short paths)
```

### Stochastic Block Model (Clustered)

```
Divide n nodes into c clusters
For nodes in same cluster: edge probability = p_intra (high)
For nodes in different clusters: edge probability = p_inter (low)

Creates community structure with dense intra-cluster
and sparse inter-cluster connections
```

## 7.7 Event Ring Buffer

### Design

```python
class EventBus:
    _ring: deque(maxlen=500_000)  # Fixed-size circular buffer

    def emit(event):
        _ring.append(event)  # O(1), auto-evicts oldest when full

    def events_since(t):
        # Binary search would be optimal, but linear scan is fine
        # for scrubbing (called once per seek, not per tick)
        return [e for e in _ring if e.at >= t]
```

### Memory Analysis

```
Event size (average): ~400 bytes (JSON with peer IDs, timestamps)
Ring capacity: 500,000 events
Max memory: 500,000 × 400 = 200 MB

At 100 events/second:
  Buffer duration: 500,000 / 100 = 5,000 seconds (~83 minutes)

At 1000 events/second:
  Buffer duration: 500,000 / 1000 = 500 seconds (~8 minutes)
```

### Replay/Scrubbing

When user seeks to time T:
1. `events_since(T)` retrieves all events from T to present
2. Events are replayed through the frontend services
3. State is reconstructed from events (event sourcing)

This enables full timeline scrubbing without snapshots or checkpoints.

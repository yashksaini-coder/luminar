# 6. API Reference

## 6.1 Overview

Lumina exposes a REST API for control operations and a WebSocket for real-time event streaming. All endpoints are served by FastAPI on port 8000.

**Base URL:** `http://localhost:8000`
**WebSocket:** `ws://localhost:8000/ws/events`

## 6.2 Simulation Control

### GET `/api/sim/snapshot`
Returns current simulation state.

**Response:**
```json
{
  "state": "running",
  "time": 45.2,
  "speed": 1.0,
  "node_count": 20,
  "event_count": 1247,
  "edges": [["peer-00", "peer-03"], ["peer-01", "peer-05"]]
}
```

### POST `/api/sim/play`
Start or resume simulation.

**Response:** `{ "status": "ok", "state": "running" }`

### POST `/api/sim/pause`
Pause simulation (clock stops, state preserved).

**Response:** `{ "status": "ok", "state": "paused" }`

### POST `/api/sim/reset`
Reset simulation to initial state (time=0, events cleared).

**Response:** `{ "status": "ok", "state": "stopped" }`

### POST `/api/sim/speed`
Set simulation speed.

**Request:** `{ "speed": 5.0 }`

**Response:** `{ "status": "ok", "speed": 5.0 }`

### POST `/api/sim/seek`
Seek to a specific simulation time (for replay).

**Request:** `{ "time": 30.0 }`

**Response:** `{ "status": "ok", "time": 30.0 }`

## 6.3 Nodes

### GET `/api/nodes`
List all simulated peers.

**Response:**
```json
[
  {
    "peer_id": "peer-00",
    "state": "idle",
    "connected_peers": ["peer-03", "peer-07", "peer-12"],
    "gossip_score": 4.2,
    "messages_sent": 15,
    "messages_received": 42,
    "x": 120.5,
    "y": -45.3
  }
]
```

### GET `/api/nodes/{peer_id}`
Get single peer detail.

**Response:** Same as above, single object.

## 6.4 Topology

### GET `/api/topology/list`
List supported topology types.

**Response:**
```json
{
  "types": ["random", "scale_free", "small_world", "clustered",
            "ring", "star", "tree", "complete"]
}
```

### POST `/api/topology/preview`
Compute topology metrics without applying.

**Request:**
```json
{
  "type": "small_world",
  "params": { "nodes": 30, "p": 0.3 }
}
```

**Response:**
```json
{
  "nodes": 30,
  "edges": 60,
  "density": 0.138,
  "clustering": 0.467,
  "diameter": 4,
  "avg_path_length": 2.31,
  "algebraic_connectivity": 0.89,
  "degree_distribution": { "2": 4, "3": 8, "4": 12, "5": 6 }
}
```

### POST `/api/topology/apply`
Generate and apply new topology to live simulation.

**Request:** Same as preview.

**Response:** `{ "status": "ok", "nodes": 30, "edges": 60 }`

### GET `/api/topology/metrics`
Get metrics of current topology.

### GET `/api/topology/edges`
Get current edge list.

**Response:**
```json
{
  "edges": [["peer-00", "peer-03"], ["peer-01", "peer-05"]]
}
```

## 6.5 Gossip (GossipSub)

### GET `/api/gossip/mesh`
Get current GossipSub mesh state.

**Response:**
```json
{
  "peer-00": ["peer-03", "peer-07", "peer-12", "peer-15", "peer-18", "peer-19"],
  "peer-01": ["peer-02", "peer-04", "peer-09", "peer-11", "peer-14", "peer-17"]
}
```

### GET `/api/gossip/scores`
Get peer scores for all peers.

**Response:**
```json
{
  "peer-00": 4.2,
  "peer-01": 3.8,
  "peer-02": -1.5
}
```

### GET `/api/gossip/scores/{peer_id}`
Get detailed score breakdown for a specific peer.

**Response:**
```json
{
  "peer_id": "peer-00",
  "total": 4.2,
  "p1_time_in_mesh": 2.5,
  "p2_first_deliveries": 3.0,
  "p3_mesh_delivery": 0.0,
  "p4_invalid_messages": -1.3,
  "in_mesh": true,
  "time_in_mesh": 45.2,
  "first_deliveries": 3,
  "delivery_ratio": 0.85
}
```

### GET `/api/gossip/analytics`
Get aggregated gossip analytics.

**Response:**
```json
{
  "total_messages": 142,
  "avg_delivery_ratio": 0.92,
  "avg_propagation_latency_ms": 23.4,
  "avg_hops": 2.8,
  "mesh_peers_avg": 5.7,
  "latency_cdf": [
    { "percentile": 50, "latency_ms": 18.2 },
    { "percentile": 90, "latency_ms": 34.1 },
    { "percentile": 99, "latency_ms": 67.3 }
  ]
}
```

## 6.6 Fault Injection

### POST `/api/fault/latency`
Add artificial latency between two peers.

**Request:**
```json
{
  "peer_a": "peer-00",
  "peer_b": "peer-05",
  "ms": 200,
  "jitter_ms": 50
}
```

**Response:** `{ "fault_id": "abc123", "type": "latency" }`

### POST `/api/fault/partition`
Create network partition between two groups.

**Request:**
```json
{
  "group_a": ["peer-00", "peer-01", "peer-02"],
  "group_b": ["peer-10", "peer-11", "peer-12"]
}
```

**Response:** `{ "fault_id": "def456", "type": "partition" }`

### POST `/api/fault/drop`
Crash a specific peer.

**Request:** `{ "peer_id": "peer-05" }`

**Response:** `{ "fault_id": "ghi789", "type": "drop" }`

### POST `/api/fault/sybil`
Inject Sybil (fake) nodes into GossipSub mesh.

**Request:**
```json
{
  "n_attackers": 5,
  "target_topic": "lumina-topic"
}
```

**Response:** `{ "fault_id": "jkl012", "type": "sybil" }`

### POST `/api/fault/eclipse`
Eclipse attack — rewire target's mesh to only contain attackers.

**Request:**
```json
{
  "target_peer_id": "peer-07",
  "n_attackers": 4
}
```

**Response:** `{ "fault_id": "mno345", "type": "eclipse" }`

### POST `/api/fault/clear`
Remove a specific active fault.

**Request:** `{ "fault_id": "abc123" }`

**Response:** `{ "status": "ok" }`

### POST `/api/fault/clear-all`
Remove all active faults.

**Response:** `{ "status": "ok", "cleared": 3 }`

### GET `/api/fault/active`
List all currently active faults.

**Response:**
```json
[
  {
    "fault_id": "abc123",
    "type": "latency",
    "created_at": 12.5,
    "params": { "peer_a": "peer-00", "peer_b": "peer-05", "ms": 200 }
  }
]
```

## 6.7 Trace

### GET `/api/trace/recent`
Get recent message propagation traces.

**Response:**
```json
[
  {
    "msg_id": "msg-a1b2c3",
    "origin": "peer-07",
    "topic": "lumina-topic",
    "created_at": 42.1,
    "delivered_to": 18,
    "total_hops": 54
  }
]
```

### GET `/api/trace/{msg_id}`
Get detailed hop-by-hop trace for a message.

**Response:**
```json
{
  "msg_id": "msg-a1b2c3",
  "origin": "peer-07",
  "topic": "lumina-topic",
  "created_at": 42.1,
  "hops": [
    { "hop": 1, "peer": "peer-03", "time": 42.15, "latency_ms": 12 },
    { "hop": 2, "peer": "peer-11", "time": 42.22, "latency_ms": 45 },
    { "hop": 3, "peer": "peer-19", "time": 42.28, "latency_ms": 8 }
  ],
  "delivered_to": 18,
  "first_delivery_peer": "peer-03",
  "fully_propagated_at": 43.1
}
```

## 6.8 Export / Import

### GET `/api/export/events?format=jsonl`
Export all events as newline-delimited JSON.

**Response:** `application/x-ndjson` stream

### GET `/api/export/events?format=json`
Export all events as JSON array.

**Response:** `application/json`

### GET `/api/export/snapshot`
Export full simulation snapshot (state + events + traces + metrics).

**Response:** `application/json`

## 6.9 Metrics

### GET `/api/metrics/snapshot`
Get aggregated metrics.

**Response:**
```json
{
  "node_count": 20,
  "state_distribution": { "idle": 15, "origin": 2, "receiving": 3 },
  "total_messages_sent": 142,
  "total_messages_received": 2130,
  "event_counts": {
    "clock": 450, "connection": 40, "stream": 220,
    "dht": 80, "gossip": 340, "fault": 5
  },
  "total_events": 1135,
  "stream_manager": { "open": 3, "max": 64, "available": 61 },
  "dht_coordinator": { "active": 1, "available": 7 }
}
```

## 6.10 WebSocket — Event Stream

### Connect: `ws://localhost:8000/ws/events`

**Protocol:** WebSocket with binary frames (orjson bytes)

**Message Format:** Each frame is a JSON object representing one event:

```json
{
  "at": 45.2,
  "event_type": "GossipMessage",
  "category": "gossip",
  "from_peer": "peer-07",
  "msg_id": "msg-a1b2c3",
  "topic": "lumina-topic",
  "hops": 2
}
```

**Event Types Streamed:**
All 15+ event types flow through the single WebSocket connection. The client filters by `category` or `event_type` as needed.

**Frequency:** Events are polled and sent in 50ms batches (20 Hz).

**Reconnection:** Clients should implement auto-reconnect (recommended: 2 second delay).

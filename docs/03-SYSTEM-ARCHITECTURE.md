# 3. System Architecture

## 3.1 High-Level Overview

Lumina follows a **client-server architecture** with an event-sourced backend and a reactive frontend. All P2P simulation happens server-side; the frontend is a pure visualization layer.

```
┌─────────────────────────────────────────────────────────┐
│                    BROWSER (Angular 19)                  │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────┐  │
│  │ D3 Force │  │  ECharts │  │  CDK     │  │ Signal │  │
│  │  Graph   │  │  Metrics │  │  VScroll │  │Services│  │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └───┬────┘  │
│       └──────────────┴─────────────┴────────────┘       │
│                          │                               │
│              ┌───────────┴───────────┐                   │
│              │   WebSocket Service   │                   │
│              │   (binary decode,     │                   │
│              │    50ms batching)     │                   │
│              └───────────┬───────────┘                   │
└──────────────────────────┼───────────────────────────────┘
                           │ ws://host/ws/events
                           │ http://host/api/*
┌──────────────────────────┼───────────────────────────────┐
│               BACKEND (Python 3.12)                       │
│              ┌───────────┴───────────┐                   │
│              │    FastAPI + uvicorn   │                   │
│              │  (REST API + WebSocket)│                   │
│              └───────────┬───────────┘                   │
│                          │                               │
│         ┌────────────────┼────────────────┐              │
│         │           EventBus              │              │
│         │  (pub/sub + 500k ring buffer)   │              │
│         └──┬─────┬──────┬───────┬────┬───┘              │
│            │     │      │       │    │                   │
│   ┌────────┴┐ ┌──┴───┐ ┌┴─────┐│┌───┴────┐             │
│   │Simulation│ │Gossip│ │Fault ││ │Topology│             │
│   │ Engine  │ │Engine│ │Inject││ │Manager │             │
│   └────┬────┘ └──┬───┘ └──────┘│ └────────┘             │
│        │         │              │                        │
│   ┌────┴────┐    │         ┌────┴─────┐                  │
│   │  Clock  │    │         │ Metrics  │                  │
│   │NodePool │    │         │Collector │                  │
│   └────┬────┘    │         └──────────┘                  │
│        │         │                                       │
│   ┌────┴─────────┴──────────────┐                        │
│   │     Concurrency Layer       │                        │
│   │  StreamManager  DHTCoord    │                        │
│   │  (sem=64)       (sem=8)    │                        │
│   └─────────────────────────────┘                        │
└──────────────────────────────────────────────────────────┘
```

## 3.2 Component Diagram

### Backend Components

| Component | Module | Responsibility |
|-----------|--------|---------------|
| **SimulationEngine** | `backend/simulation/engine.py` | Lifecycle orchestrator — start, pause, reset, wire topology |
| **SimulationClock** | `backend/simulation/clock.py` | Controllable time source with speed adjustment and seek |
| **NodePool** | `backend/simulation/node_pool.py` | Manages N peer nodes, spawns per-node task loops |
| **EventBus** | `backend/events/bus.py` | Central pub/sub with ring buffer for event replay |
| **Event Types** | `backend/events/types.py` | 15+ typed dataclass events with orjson serialization |
| **StreamManager** | `backend/concurrency/stream_manager.py` | Semaphore-bounded stream lifecycle (open/close/timeout) |
| **DHTQueryCoordinator** | `backend/concurrency/dht_coordinator.py` | Semaphore + timeout + exponential backoff for DHT |
| **GossipEngine** | `backend/gossip/engine.py` | GossipSub v1.1 mesh, propagation, GRAFT/PRUNE |
| **PeerScoreTracker** | `backend/gossip/scoring.py` | P1–P4 peer scoring with decay |
| **TopologyManager** | `backend/topology/manager.py` | 8 NetworkX graph generators + metrics |
| **FaultInjector** | `backend/fault/injector.py` | 5 fault types with active fault tracking |
| **MetricsCollector** | `backend/metrics/collector.py` | Aggregated state counts and resource utilization |

### Frontend Components

| Component | Path | Responsibility |
|-----------|------|---------------|
| **AppComponent** | `app/app.component.ts` | Root grid layout (header/tabs/content/scrubber) |
| **HeaderComponent** | `app/shell/header.component.ts` | Playback controls, export, file import |
| **TabBarComponent** | `app/shell/tab-bar.component.ts` | Route navigation (5 tabs) |
| **ScrubberComponent** | `app/shell/scrubber.component.ts` | Timeline with event density and seek |
| **NetworkGraphComponent** | `app/features/dashboard/network-graph.component.ts` | D3 force graph with particles |
| **EventLogComponent** | `app/features/dashboard/event-log.component.ts` | CDK virtual scroll event list |
| **MetricsPanelComponent** | `app/features/dashboard/metrics-panel.component.ts` | ECharts sparklines and stats |
| **GossipComponent** | `app/features/gossip/gossip.component.ts` | Mesh stats, scores, propagation charts |
| **TopologyComponent** | `app/features/topology/topology.component.ts` | Topology generator with preview/apply |
| **FaultComponent** | `app/features/fault/fault.component.ts` | Fault injection interface |
| **TraceComponent** | `app/features/trace/trace.component.ts` | Message trace hop-by-hop detail |

### Services (Angular Signals-Based)

| Service | Signals | Responsibility |
|---------|---------|---------------|
| **SimulationService** | state, time, speed, nodeCount, eventCount, connected | Simulation control + state |
| **NodeService** | nodes (Map), edges, selectedNodeId | Node management + polling |
| **WebSocketService** | connected | Binary WS client + event routing |
| **EventService** | events (10k ring), filteredCategory | Event log + filtering |
| **GossipService** | meshData, scores, analytics, selectedPeer, scoreDetail | GossipSub state |
| **TopologyService** | currentType, preview, metrics | Topology generation |
| **FaultService** | activeFaults, lastError | Fault injection |
| **TraceService** | traces, selectedTrace, detail | Message trace queries |
| **KeyboardService** | — | Global keyboard shortcuts |
| **ExportService** | — | Download/upload event data |

## 3.3 Data Flow

### Event Flow (Backend → Frontend)

```
1. SimulationEngine tick
   │
2. NodePool: peer publishes message
   │
3. GossipEngine: propagate through mesh
   │  ├── emit GossipMessage (per hop)
   │  ├── emit GraftEvent / PruneEvent (heartbeat)
   │  └── update PeerScoreTracker
   │
4. StreamManager: open_stream → emit StreamOpened
   │  └── close → emit StreamClosed
   │
5. EventBus: broadcast to all subscribers
   │  └── append to ring buffer (500k max)
   │
6. FastAPI WebSocket handler: poll EventBus every 50ms
   │  └── serialize with orjson → send_bytes()
   │
7. Angular WebSocketService: receive ArrayBuffer
   │  ├── TextDecoder → JSON.parse
   │  ├── Route to SimulationService (clock/state events)
   │  ├── Route to NodeService (state transitions)
   │  └── Batch 50ms → EventService.addBatch()
   │
8. Angular Components: read signals → render
   ├── NetworkGraph: D3 force simulation update
   ├── EventLog: virtual scroll append
   ├── MetricsPanel: ECharts data update
   └── Scrubber: playhead position update
```

### User Action Flow (Frontend → Backend)

```
User clicks "Play" button
   │
HeaderComponent: sim.play()
   │
SimulationService: POST /api/sim/play
   │
FastAPI: engine.play()
   │
SimulationEngine: clock.resume(), emit SimulationStateChanged
   │
EventBus → WebSocket → Frontend: state signal = "running"
```

## 3.4 Communication Protocols

### REST API
- **Purpose**: User-initiated actions (play, pause, inject fault, apply topology)
- **Format**: JSON request/response
- **Endpoints**: 30+ across 7 route groups
- **Proxy**: Angular dev server proxies `/api/*` to `http://localhost:8000`

### WebSocket
- **Purpose**: Real-time event streaming (backend → frontend)
- **Format**: Binary (orjson bytes → ArrayBuffer)
- **Endpoint**: `/ws/events`
- **Frequency**: 50ms poll batches (20 Hz)
- **Reconnect**: 2 second auto-reconnect on disconnect

### Why Single WebSocket?
A single WebSocket connection carries all event types. The frontend filters client-side. This design:
- Reduces connection overhead (one TCP connection vs. many)
- Simplifies server-side fan-out (one subscriber per client)
- Enables unified event ordering (total order across all event types)
- Makes replay straightforward (single event stream to record/replay)

## 3.5 Directory Structure

```
P2P-NOPS-Simulator/
├── backend/                    # Python backend
│   ├── main.py                 # FastAPI entry point (30+ endpoints)
│   ├── events/
│   │   ├── types.py            # 15+ typed event dataclasses
│   │   ├── bus.py              # EventBus (pub/sub + ring buffer)
│   │   └── websocket.py        # WS fan-out handler
│   ├── simulation/
│   │   ├── engine.py           # SimulationEngine orchestrator
│   │   ├── clock.py            # Controllable SimulationClock
│   │   └── node_pool.py        # NodePool (N peers + task loops)
│   ├── concurrency/
│   │   ├── stream_manager.py   # Semaphore-bounded stream lifecycle
│   │   └── dht_coordinator.py  # DHT query coordinator
│   ├── gossip/
│   │   ├── engine.py           # GossipSub v1.1 protocol
│   │   └── scoring.py          # Peer scoring (P1–P4)
│   ├── topology/
│   │   └── manager.py          # 8 topology generators (NetworkX)
│   ├── fault/
│   │   └── injector.py         # 5 fault types
│   └── metrics/
│       └── collector.py        # Aggregated metrics
├── frontend-ng/                # Angular 19 frontend
│   ├── src/
│   │   ├── app/
│   │   │   ├── core/
│   │   │   │   ├── models/     # TypeScript interfaces
│   │   │   │   └── services/   # 10 signal-based services
│   │   │   ├── shell/          # Header, TabBar, Scrubber
│   │   │   └── features/       # Dashboard, Gossip, Topology, Fault, Trace
│   │   └── styles.css          # Bloomberg dark theme
│   ├── angular.json            # Build config
│   ├── .postcssrc.json         # Tailwind CSS 4 PostCSS config
│   └── proxy.conf.js           # Dev server API proxy
├── tests/                      # pytest-trio test suite
├── docker-compose.yml          # Docker orchestration
├── docker/                     # Dockerfiles
├── start.sh                    # Unified start script
└── pyproject.toml              # Python project config
```

## 3.6 Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Async runtime | Trio (not asyncio) | py-libp2p uses Trio; mixing runtimes causes deadlocks |
| State management | Angular Signals (not NgRx) | 15 pieces of state; NgRx would be over-engineering |
| Visualization | D3 direct DOM (not Angular templates) | D3 must own SVG for force simulation; Angular stays out |
| Charts | ECharts (not ngx-charts) | Better dark theme support, canvas rendering, richer types |
| Event transport | Single WebSocket (not SSE or polling) | Bidirectional, binary-capable, unified event stream |
| Event storage | Ring buffer (not database) | In-memory for speed; JSONL export for persistence |
| PostCSS config | `.postcssrc.json` (not `.js`) | Angular 19's Vite dev server only loads JSON format |
| CSS framework | Tailwind CSS 4 | Utility-first, excellent dark mode, small bundle |
| Proxy config | Object map (not array) | Angular 19's Vite-based dev server requires this format |

# Lumina P2P Simulator

## Project Overview
Local-first, replay-capable P2P network simulator with real-time NOC-style visualization.
Simulates py-libp2p peers with DHT, GossipSub, and stream machinery — making internal protocol state visible.

## Tech Stack
- **Backend:** Python 3.12, FastAPI, trio (async), py-libp2p, NetworkX
- **Frontend — primary (Angular):** Angular 19, D3.js (force graph), ECharts via ngx-echarts, Angular CDK (virtual scroll), Tailwind CSS 4, Signals — lives in `frontend-ng/`
- **Frontend — legacy (React):** React 19, Vite, D3.js, Zustand, Recharts, Tailwind CSS, react-window — lives in `frontend/` and is kept as a historical prototype / playground
- **Package Management:** uv (Python), npm (frontend)
- **Testing:** pytest + pytest-trio

## Commands
```bash
# Backend
uv sync                        # Install all deps
uv run pytest tests/ -v        # Run tests
uv run uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload  # Start API

# Frontend (Angular — primary)
cd frontend-ng && npm install  # Install deps
npm run dev                    # Dev server (port 4200, proxies to :8000)
npm run build                  # Production build

# Start both (backend + Angular frontend)
./start.sh                     # Default: 20 nodes, port 4200/8000
./start.sh --nodes 50          # Custom node count

# Docker
docker-compose up              # Backend :8000 + Angular :4200
```

## Architecture
- `backend/events/` — EventBus + typed events + WS fan-out
- `backend/concurrency/` — StreamManager + DHTQueryCoordinator (semaphore-bounded)
- `backend/simulation/` — Engine, Clock, NodePool
- `backend/topology/` — NetworkX topology generation
- `backend/fault/` — Fault injection + attack scenarios
- `frontend-ng/src/app/core/services/` — Angular signals-based services (WebSocket, Simulation, Node, Event, etc.)
- `frontend-ng/src/app/shell/` — Header, TabBar, Scrubber components
- `frontend-ng/src/app/features/` — Dashboard (NetworkGraph, EventLog, MetricsPanel), Gossip, Topology, Fault, Trace

## Key Design Decisions
- **Trio everywhere** — py-libp2p uses trio; no asyncio mixing
- **Two semaphores** — StreamManager (libp2p layer) + DHTQueryCoordinator (DHT layer)
- **Event sourcing** — all state derived from events; JSONL replay for scrubbing
- **Single WebSocket** — all event types on one connection; client-side filtering
- **Angular Signals** — no NgRx, ~15 pieces of state managed via signals
- **D3 direct DOM** — Angular doesn't touch SVG internals; `effect()` bridges signals; `runOutsideAngular()` for RAF
- **ECharts over ngx-charts** — better dark theme, canvas rendering, richer chart types
- **Bloomberg dark theme** — `#08090d` base, `#00d4ff` cyan accent, sharp corners, glass panels

## Conventions
- Python: ruff for linting, dataclasses for events, type hints everywhere
- Angular: standalone components, signals for state, CSS vars for design tokens, JetBrains Mono for data text
- PostCSS: must use `.postcssrc.json` (not `postcss.config.js`) for Angular compatibility with Tailwind 4
- Tests: pytest-trio, each concurrency component has stress tests (100× no-hang)

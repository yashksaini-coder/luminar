# Lumina P2P Simulator — Gemini Context

## Project Overview
Lumina is a local-first, replay-capable P2P network simulator with real-time NOC-style visualization. It simulates libp2p peers (DHT, GossipSub, Stream machinery) using a Trio-based async backend in Python and visualizes internal protocol states.

**Note on Frontend:** While some documentation (`CLAUDE.md`, `docs/`) refers to an Angular 19 or React 19 frontend, this workspace currently implements a **built-in UI** using **FastAPI + Jinja2 + HTMX + D3.js**. No Node.js is required for this version.

### Tech Stack
- **Backend:** Python 3.12, FastAPI, Trio (async), py-libp2p, NetworkX, Pydantic, orjson.
- **Frontend (Built-in):** Jinja2 Templates, HTMX 2.0, D3.js v7, Vanilla CSS (Bloomberg dark theme).
- **Package Management:** `uv` (Python).
- **Testing:** `pytest` + `pytest-trio`.

---

## Building and Running

### Prerequisites
- Python 3.12+
- `uv` (recommended) or `pip`

### Key Commands
```bash
# Install dependencies
uv sync

# Run the simulation (API + Frontend)
./start.sh                           # Default: 20 nodes, port 8000
./start.sh --nodes 50 --port 8080    # Custom configuration

# Run the backend manually (Uvicorn)
uv run uvicorn backend.main:app --reload

# Run tests
uv run pytest                        # Run all tests
uv run pytest tests/test_topology.py # Run specific test
```

### Environment Variables
- `LUMINA_NODE_COUNT`: Number of simulated peers (default: 20).
- `LUMINA_LOG_LEVEL`: Logging level (DEBUG, INFO, WARNING, ERROR).
- `LUMINA_PORT`: Port for the FastAPI server (default: 8000).

---

## Development Conventions

### Backend (Python)
- **Async Runtime:** Uses **Trio** exclusively for simulation logic. Do not mix with `asyncio` except at the FastAPI/Uvicorn boundary (using thread-safe bridges).
- **Event-Driven:** All state transitions must emit events via the `EventBus` (`backend/events/bus.py`).
- **Data Integrity:** Use Pydantic models for API schemas and Python dataclasses for internal events.
- **Linting:** Use `ruff` for linting and formatting (configured in `pyproject.toml`).

### Frontend (HTMX + D3)
- **Templates:** Located in `backend/templates/`. Main entry point is `index.html`.
- **Partials:** HTMX partials are in `backend/templates/partials/`, served via `/api/partials/*`.
- **Visualization:** D3.js logic resides in `backend/static/js/app.js`. It handles the force-directed graph and real-time node state updates.
- **Styling:** CSS is in `backend/static/css/styles.css`. Follows the "Bloomberg dark" aesthetic (`#08090d` base, cyan accents).

### Testing
- All core components (Gossip, DHT, StreamManager, Topology) must have corresponding tests in `tests/`.
- Use `pytest-trio` for testing async components.
- Stress tests (e.g., 100x no-hang) are encouraged for concurrency primitives.

---

## Directory Structure
- `backend/`: Core FastAPI application and simulation modules.
  - `concurrency/`: Semaphore-bounded managers for streams and DHT queries.
  - `events/`: Event bus, typed events, and WebSocket streaming.
  - `fault/`: Fault injection (partitions, Sybil attacks, eclipse, etc.).
  - `gossip/`: GossipSub v1.1 implementation and scoring logic.
  - `metrics/`: Real-time metric collection and snapshots.
  - `simulation/`: Core engine, controllable clock, and node pool.
  - `topology/`: NetworkX-based topology generators and layout logic.
  - `templates/` & `static/`: Built-in web UI.
- `docs/`: Comprehensive project documentation (Architecture, API, Algorithms).
- `tests/`: Pytest suite for backend components.
- `docker/`: Dockerfiles for containerized deployment.

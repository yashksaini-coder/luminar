# 9. Deployment Guide

## 9.1 Prerequisites

| Requirement | Version | Purpose |
|-------------|---------|---------|
| Python | 3.12+ | Backend runtime |
| Node.js | 20+ | Frontend build/serve |
| npm | 9+ | Frontend package management |
| uv | Latest | Python dependency management |
| Git | Any | Version control |

**Optional:**
| Requirement | Version | Purpose |
|-------------|---------|---------|
| Docker | 20+ | Containerized deployment |
| Docker Compose | 2+ | Multi-container orchestration |

## 9.2 Installation

### Clone Repository
```bash
git clone <repo-url>
cd P2P-NOPS-Simulator
```

### Install Backend Dependencies
```bash
uv sync
```

This creates a `.venv/` directory with all Python packages (FastAPI, Trio, py-libp2p, NetworkX, etc.).

### Install Frontend Dependencies
```bash
cd frontend-ng
npm install
cd ..
```

This installs Angular 19, D3.js, ECharts, Tailwind CSS 4, and all other frontend packages.

## 9.3 Running the Application

### Option A: Unified Start Script (Recommended)

```bash
./start.sh
```

This starts both backend and frontend with:
- Automatic port conflict detection and cleanup
- Dependency installation check
- Health check before declaring ready
- Graceful shutdown on Ctrl-C

**Custom Options:**
```bash
./start.sh --nodes 50         # 50 simulated peers (default: 20)
./start.sh --port 9000        # Backend on port 9000 (default: 8000)
./start.sh --fport 3000       # Frontend on port 3000 (default: 4200)
./start.sh --prod             # Build and serve production frontend
./start.sh --log DEBUG        # Verbose logging
./start.sh --help             # Show all options
```

**Expected Output:**
```
[20:36:57] Starting backend on port 8000...
[20:36:57] Waiting for backend to be ready...
[20:36:59] Backend ready on port 8000 (PID 107970)
[20:36:59] Starting Angular frontend on port 4200...
[20:36:59] Waiting for frontend to be ready...
[20:37:03] Frontend ready on port 4200 (PID 108054)

  ╔══════════════════════════════════════════════╗
  ║                                              ║
  ║  Lumina P2P Simulator                        ║
  ║                                              ║
  ║  Frontend  http://localhost:4200             ║
  ║  Backend   http://localhost:8000             ║
  ║  Nodes     20                                ║
  ║  Log level info                              ║
  ║                                              ║
  ║  Press Ctrl-C to stop all services           ║
  ║                                              ║
  ╚══════════════════════════════════════════════╝
```

### Option B: Manual Start (Two Terminals)

**Terminal 1 — Backend:**
```bash
uv run uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload
```

**Terminal 2 — Frontend:**
```bash
cd frontend-ng
npx ng serve --host 0.0.0.0 --port 4200 --proxy-config proxy.conf.js
```

### Option C: Docker Compose

```bash
docker-compose up
```

**Services:**
| Service | Port | Image |
|---------|------|-------|
| backend | 8000 | Python 3.12 (custom Dockerfile) |
| frontend-ng | 4200 | Node 22 (custom Dockerfile) |

**Docker Compose Configuration:**
```yaml
services:
  backend:
    build:
      context: .
      dockerfile: docker/Dockerfile.backend
    ports:
      - "8000:8000"
    volumes:
      - ./backend:/app/backend
    environment:
      - LUMINA_NODE_COUNT=20

  frontend-ng:
    build:
      context: .
      dockerfile: docker/Dockerfile.frontend-ng
    ports:
      - "4200:4200"
    volumes:
      - ./frontend-ng/src:/app/frontend-ng/src
    environment:
      - API_URL=http://backend:8000
    depends_on:
      - backend
```

## 9.4 Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `LUMINA_NODE_COUNT` | 20 | Number of simulated peers |
| `LUMINA_LOG_LEVEL` | INFO | Logging level (DEBUG, INFO, WARNING) |
| `LUMINA_BACKEND_PORT` | 8000 | Backend HTTP port |
| `LUMINA_FRONTEND_PORT` | 4200 | Frontend dev server port |
| `API_URL` | http://localhost:8000 | Backend URL (for Docker networking) |

### Proxy Configuration (`frontend-ng/proxy.conf.js`)

The Angular dev server proxies API and WebSocket requests to the backend:

```javascript
const target = process.env.API_URL || 'http://localhost:8000';
const wsTarget = target.replace(/^http/, 'ws');

module.exports = {
  '/api': {
    target,
    secure: false,
    changeOrigin: true,
  },
  '/ws': {
    target: wsTarget,
    ws: true,
    secure: false,
    changeOrigin: true,
  },
};
```

**Important:** Angular 19's Vite-based dev server requires the **object map format** (not the array format used by webpack-dev-server).

### PostCSS Configuration (`frontend-ng/.postcssrc.json`)

```json
{
  "plugins": {
    "@tailwindcss/postcss": {}
  }
}
```

**Important:** Must be `.postcssrc.json` (not `postcss.config.js`). Angular's build system only properly loads PostCSS plugins from JSON format.

## 9.5 Accessing the Application

| URL | Description |
|-----|-------------|
| http://localhost:4200 | Frontend (Angular) — main application |
| http://localhost:8000 | Backend (FastAPI) — API only |
| http://localhost:8000/docs | Swagger UI (auto-generated API docs) |
| http://localhost:8000/redoc | ReDoc (alternative API docs) |

### First Use

1. Open http://localhost:4200
2. The dashboard loads with 20 nodes in a force-directed graph
3. Click **Play** (▶) to start the simulation
4. Watch nodes change color as messages propagate
5. Switch tabs to explore Gossip, Topology, Fault, and Trace features

## 9.6 Troubleshooting

| Issue | Solution |
|-------|----------|
| Port already in use | `lsof -ti :8000 \| xargs kill` or use `--port` flag |
| Blank page | Check `.postcssrc.json` exists (Tailwind CSS won't generate without it) |
| WS "Invalid HTTP request" flood | Ensure `proxy.conf.js` uses object format, not array format |
| `uv: command not found` | Install uv: `curl -LsSf https://astral.sh/uv/install.sh \| sh` |
| `ng: command not found` | Run from `frontend-ng/` directory, or use `npx ng` |
| Frontend build errors | Run `cd frontend-ng && npm install` to ensure deps are installed |
| Backend import errors | Run `uv sync` to ensure Python deps are installed |

## 9.7 Production Build

For production deployment (no dev server, optimized bundle):

```bash
# Build frontend
cd frontend-ng
npm run build
# Output in frontend-ng/dist/

# Serve with any static file server
# Or use start.sh --prod
./start.sh --prod
```

Production bundle size: ~207 KB initial (well under 2 MB budget).

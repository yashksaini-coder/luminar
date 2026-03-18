
### Clone Repository
```bash
git clone https://github.com/yashksaini-coder/Luminar
cd Luminar 
```

### Install Backend Dependencies
```bash
uv sync
```

This creates a `.venv/` directory with all Python packages (FastAPI, Trio, py-libp2p, NetworkX, etc.).

### Install Frontend Dependencies
```bash
cd frontend
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

### Option B: Manual Start (Two Terminals)

**Terminal 1 — Backend:**
```bash
uv run uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload
```

**Terminal 2 — Frontend:**
```bash
cd frontend
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
| frontend | 4200 | Node 22 (custom Dockerfile) |

## 9.4 Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `LUMINA_NODE_COUNT` | 20 | Number of simulated peers |
| `LUMINA_LOG_LEVEL` | INFO | Logging level (DEBUG, INFO, WARNING) |
| `LUMINA_BACKEND_PORT` | 8000 | Backend HTTP port |
| `LUMINA_FRONTEND_PORT` | 4200 | Frontend dev server port |
| `API_URL` | http://localhost:8000 | Backend URL (for Docker networking) |

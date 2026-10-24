# Deployment

Luminar is one FastAPI process that runs the simulation on a background trio thread and,
in production, also serves the built frontend from `frontend/dist`. There is no separate
frontend service to deploy.

## Local development

```bash
git clone https://github.com/yashksaini-coder/luminar
cd luminar
make install          # uv sync --all-extras + npm install (frontend/)
make dev              # backend :8000 (uvicorn --reload) + Vite dev server :5173
```

Open http://localhost:5173. The Vite dev server (`frontend/vite.config.ts`) proxies `/api`
and `/ws` to `:8000`, so the frontend needs no configuration. Swagger UI is at
http://localhost:8000/docs.

Run the two halves separately with `make backend` and `make frontend`, or start only the
backend with `./start.sh`:

```bash
./start.sh                    # 20 nodes on :8000, hot-reload on
./start.sh --nodes 50         # node count (2-500)
./start.sh --port 9000        # backend port (default: 8000)
./start.sh --log DEBUG        # log level
./start.sh --prod             # no --reload (demo mode)
./start.sh --help
```

`start.sh` only starts the backend; it does not build or serve the frontend.

## Single container (Docker)

The root `Dockerfile` builds the frontend in a Node stage, installs the backend with
`uv sync --no-dev --frozen`, copies `frontend/dist` next to `backend/`, and runs uvicorn on
`$PORT` (8080). `backend/main.py` mounts `frontend/dist` as a single-page app at `/`.

```bash
make docker           # docker compose up --build  →  http://localhost:8080
```

`docker-compose.yml` defines one `app` service on `8080:8080`. `VITE_API_URL` is left unset
on purpose: the frontend then uses relative URLs and `location.host`, so the API and the
WebSocket are same-origin and no CORS or proxy setup is needed.

## Environment variables

| Variable | Default | Read by | Description |
|----------|---------|---------|-------------|
| `LUMINAR_NODE_COUNT` | 20 | `backend/main.py` | Simulated peers at startup (`.do/app.yaml` sets 50). |
| `LUMINAR_LOG_LEVEL` | INFO | `backend/main.py`, `start.sh` | Python log level; `start.sh` also passes it to uvicorn. |
| `PORT` | 8080 (Docker) / 8000 (`start.sh`) | `Dockerfile`, `start.sh` | Listening port. |
| `LUMINAR_PORT` | 8000 | `start.sh` only | Alias for `PORT`. |
| `VITE_API_URL` | unset | `frontend/src/api/client.ts`, `websocket.ts` | **Build-time** (`import.meta.env`): set it when `npm run build` runs for a split deploy. Leave unset for the single container. |
| `LUMINAR_ALLOW_RECORD` | unset | `backend/main.py` | `1` enables `/ws/events?record=<name>` reel recording to `recordings/`. Never set on a public deploy. |
| `LUMINAR_RING_SIZE` | see `backend/events/bus.py` | `backend/events/bus.py` | Event ring-buffer size; lower it on small instances. |
| `LUMINAR_ADMIN_TOKEN` | unset | `backend/main.py` | When set, every non-GET request must carry `X-Luminar-Token`; the public deploy is then viewer/reel-only. |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | unset | `backend/main.py` | Enables OTLP/JSON trace export (`<endpoint>/v1/traces`). `LUMINAR_OTLP_ENDPOINT` is an alias. |
| `LUMINAR_OTLP_TRACE_PCT` | 5 | `backend/main.py` | Percentage of message traces exported. |

Grep to confirm before relying on a name: `grep -rn 'os.environ' backend/`.

## Render

`render.yaml`: Docker runtime from the root `Dockerfile`, free plan, `PORT=8080`,
`LUMINAR_NODE_COUNT=20`, health check `GET /api/sim/snapshot`. Push to `master` and connect
the repo as a Blueprint; nothing else to configure.

## DigitalOcean App Platform

`.do/app.yaml`: same `Dockerfile`, `http_port: 8080`, health check `/api/sim/snapshot`,
`LUMINAR_NODE_COUNT=50` (not 20), `LUMINAR_LOG_LEVEL=INFO`.

## Laptop observability (not deployed)

`make otel-up` starts Jaeger, Prometheus and Grafana from `deploy/otel/docker-compose.yml`
on host networking; run the backend with `OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318`
and `make otel-smoke` to round-trip one trace. `GET /metrics` is Prometheus text.

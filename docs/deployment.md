# Deployment

Luminar is one FastAPI process that runs the simulation on a background trio thread and,
in production, also serves the Next.js static export (built from `web/`, copied to
`frontend/dist`). There is no separate frontend service to deploy and no Node process in
production.

## Local development

```bash
git clone https://github.com/yashksaini-coder/luminar
cd luminar
make install          # uv sync --all-extras + npm ci (web/)
make dev              # backend :8000 (uvicorn --reload) + Next dev server :3000
```

Open http://localhost:3000. `web/next.config.ts` rewrites `/api/*` to `:8000` in dev; the
WebSocket connects to `NEXT_PUBLIC_WS_URL ?? ws://localhost:8000` when `location.port === '3000'`,
so the frontend needs no configuration. Swagger UI is at http://localhost:8000/docs.

Run the two halves separately with `make backend` and `make web`, or start only the
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

To serve the export through FastAPI locally:
`make build && mkdir -p frontend && ln -sfn ../web/out frontend/dist && make backend` →
http://localhost:8000/sim/ (do not commit the symlink; `.gitignore` does not cover it).

## Single container (Docker)

The root `Dockerfile` builds `web/` in a `node:22-slim` stage (`npm ci`, `npm run build` →
`web/out`), installs the backend with `uv sync --no-dev --frozen`, copies `web/out` to
`frontend/dist`, the path `backend/main.py` mounts with `StaticFiles(html=True)`, and runs
uvicorn on `$PORT` (8080). Trailing-slash routes (`/sim/`) are directories with an
`index.html`; `/sim` redirects 307 to `/sim/`.

```bash
make docker           # docker compose up --build  →  http://localhost:8080
```

`docker-compose.yml` defines one `app` service on `8080:8080`. `NEXT_PUBLIC_API_URL` is a
Docker build arg left empty on purpose: the frontend then uses relative URLs and
`location.host`, so the API and the WebSocket are same-origin and no CORS or proxy setup is
needed.

## Environment variables

| Variable | Default | Read by | Description |
|----------|---------|---------|-------------|
| `LUMINAR_NODE_COUNT` | 20 | `backend/main.py` | Simulated peers at startup (`.do/app.yaml` sets 50). |
| `LUMINAR_LOG_LEVEL` | INFO | `backend/main.py`, `start.sh` | Python log level; `start.sh` also passes it to uvicorn. |
| `PORT` | 8080 (Docker) / 8000 (`start.sh`) | `Dockerfile`, `start.sh` | Listening port. |
| `LUMINAR_PORT` | 8000 | `start.sh` only | Alias for `PORT`. |
| `NEXT_PUBLIC_API_URL` | unset | `web/lib/api/client.ts`, `websocket.ts` | **Build-time** (inlined by `next build`; Dockerfile `ARG`): set it only for a split deploy. Leave unset for the single container. |
| `NEXT_PUBLIC_WS_URL` | `ws://localhost:8000` | `web/lib/api/websocket.ts` | Dev only (port 3000): where the WebSocket connects when the API is proxied. Ignored in production. |
| `LUMINAR_ALLOW_RECORD` | unset | `backend/main.py` | `1` enables `/ws/events?record=<name>` reel recording to `recordings/`. Never set on a public deploy. |
| `LUMINAR_RING_SIZE` | see `backend/events/bus.py` | `backend/events/bus.py` | Event ring-buffer size; lower it on small instances. |
| `LUMINAR_ADMIN_TOKEN` | unset | `backend/main.py` | When set, every non-GET request must carry `X-Luminar-Token`; the public deploy is then viewer/reel-only. |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | unset | `backend/main.py` | Enables OTLP/JSON trace export (`<endpoint>/v1/traces`). `LUMINAR_OTLP_ENDPOINT` is an alias. |
| `LUMINAR_OTLP_TRACE_PCT` | 5 | `backend/main.py` | Percentage of message traces exported. |

Grep to confirm before relying on a name: `grep -rn 'os.environ' backend/`.

## Render

Backend only. `render.yaml`: Docker runtime from `Dockerfile.backend` (Python + `backend/`, no
Node stage, no `frontend/dist`, so `/` is 404 and only `/api/*`, `/ws/events`, `/metrics`
answer), free plan, Singapore, `PORT=8080`, `LUMINAR_NODE_COUNT=20`, health check
`GET /api/sim/snapshot`. The build filter skips deploys unless `backend/`, `pyproject.toml`,
`uv.lock` or `Dockerfile.backend` changed. Set `LUMINAR_ADMIN_TOKEN` in the dashboard.
The site is on Vercel (below) and talks to this service through `NEXT_PUBLIC_API_URL`.

## DigitalOcean App Platform

`.do/app.yaml`: same `Dockerfile`, `http_port: 8080`, health check `/api/sim/snapshot`,
`LUMINAR_NODE_COUNT=50` (not 20), `LUMINAR_LOG_LEVEL=INFO`. No change for the Next.js build:
the same `Dockerfile`, health check and env apply.

## Vercel

Serves the site (`web/` static export). Project settings: Root Directory `web`, Framework
Next.js, Build / Install / Output Directory all defaults (an Output Directory override breaks
the Next.js builder: it reads `.next/routes-manifest.json`, then picks up `out/` itself).
Config variables (not Secret; they are public): `NEXT_PUBLIC_API_URL` = the Render origin,
`NEXT_PUBLIC_SITE_URL` = the Vercel origin. Both are inlined at build, so redeploy after a change.

## Laptop observability (not deployed)

`make otel-up` starts Jaeger, Prometheus and Grafana from `deploy/otel/docker-compose.yml`
on host networking; run the backend with `OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318`
and `make otel-smoke` to round-trip one trace. `GET /metrics` is Prometheus text.

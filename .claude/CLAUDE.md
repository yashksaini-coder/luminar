# Luminar — project instructions

Real-time P2P network simulator: Python backend simulates py-libp2p-style peers
(GossipSub v1.1, DHT, fault injection); Next.js (static export) frontend in web/ renders it with deck.gl.
Owned by Yash (not an OSS contribution — the `~/oss_contribution_logs/` rule does not apply).

## Layout
- `backend/` — FastAPI entry in `backend/main.py`. Simulation runs in a **trio** loop on a
  background thread; the API server is asyncio (uvicorn). Cross-thread calls go through
  `trio.from_thread` / the `_trio_token`. Never block the trio loop from an asyncio handler.
  - `simulation/` engine, clock, node_pool · `gossip/` engine + P1-P4 scoring ·
    `fault/` injector · `topology/` generators · `events/` bus + typed events + websocket ·
    `concurrency/` stream/DHT semaphores · `scenarios/` timed phases · `telemetry/` ingestion ·
    `metrics/` collector
- `web/` — Next 16 static export, React 19, zustand, plain CSS Modules. `app/` routes (`/`,
  `/sim/`, `/reels/[name]/`, `/figure/`); `components/sim|map|dither|landing`; `lib/` (store,
  api, copy, keys); `remotion/`; `public/reels`, `public/fonts`.
- `tests/` — pytest with `trio_mode = true`; tests are `async def` using trio, fixtures build
  `EventBus` → `SimulationClock` → engine by hand (see `tests/test_gossip_engine.py`).
- `docs/` — reference docs. `docs/architecture.md` is partly stale (mentions Angular; the
  frontend is Next.js in `web/`). Trust code over docs.

## Commands (Makefile is the source of truth)
- `make install` — `uv sync --all-extras` + `npm ci` in `web/`
- `make dev` — backend :8000 + web :3000 · `make backend` / `make web` individually
- `make test` — `uv run pytest tests/ -v`
- `make lint` / `make fmt` — ruff check + format (line-length 100, rules E F W I UP B SIM)
- `make typecheck` — `cd web && npx tsc --noEmit`
- `make web-check` — tsc + eslint + vitest in `web/`
- `make build` — `next build` static export → `web/out`
- `make check` — lint + test + web-check + build. CI (`.github/workflows/ci.yml`) runs the same.
- Always use `uv run …`, never bare `python`/`pytest`. `web/` uses `npm` (lockfile committed).

## Conventions
- Python 3.12, `from __future__ import annotations`, module docstring at top of every file,
  `X | None` unions, pydantic v2 models for API bodies, orjson for serialization.
- Commits: conventional style `type(scope): message` — scopes: backend, web, video, deploy.
- Single WebSocket `/ws/events` multiplexes everything as orjson bytes at 20 Hz; add new
  stream data as a new event type on it rather than a new socket.
- Frontend fetches go through web/lib/api/client.ts (get/post return {ok,status,data}; getStatic
  for same-origin files).
- Deployment: root `Dockerfile` serves built frontend + backend on `$PORT` (8080);
  `render.yaml`, `.do/`, `docker-compose.yml`, `start.sh`. Docker copies web/out to
  frontend/dist (the path main.py mounts; backend untouched). Hosted split: site on Vercel
  (Root `web`, Next.js preset, no output override), backend on Render via `Dockerfile.backend`. Env: NEXT_PUBLIC_API_URL
  (build-time, unset in the container), `LUMINAR_NODE_COUNT`, `LUMINAR_LOG_LEVEL`, `PORT`.

## Devcon 8 work (branch feat/devcon8, Oct–Nov 2026)
- Reels: `web/public/reels/*.jsonl` + `manifest.json`; record with
  `uv run python scripts/record_reel.py record <name> <scenario> --nodes 50 --duration 40`
  against a backend started with `LUMINAR_ALLOW_RECORD=1`; `/reels/<name>/?theme=stage&hero=1`
  opens the offline demo.
- OTel: `make otel-up` (Jaeger/Prometheus/Grafana on host networking; Prometheus and Grafana
  loopback-bound, Jaeger binds all interfaces, so keep the laptop firewall on at the venue),
  backend with `OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318 make backend`,
  `make otel-smoke`. `/metrics` uses Lighthouse's gossipsub_* names; no OTel SDK, by design.
- Honesty line for talk copy: "same mechanism, toy constants"; never "the scoring your
  beacon node runs"; "reproducible recordings", never "identical runs".
- Attackers are synthetic snapshot nodes (state `attacker`, ids `sybil-N`/`eclipse-N`);
  the P4 spam pre-pass in `GossipEngine.heartbeat` must run AFTER `scorer.decay`.

- Live network: `backend/live/mainnet.py` polls ethPandaOps' arrival API once per slot and
  replays each slot's observer arrivals as `BlockSeen` events (category `live`); observers
  are snapshot nodes with `is_real` and geo `x,y`; the Geo layout hides simulated peers.
  Never claim the mesh path: it is arrival time at observer nodes, ~2.5 min behind.
- Research note on the SCL comparison and data sources: `docs/research-live-network.md`.

## Before claiming done
Run `make lint` and `make test` (both must be green). Run `make web-check`
for any web change.

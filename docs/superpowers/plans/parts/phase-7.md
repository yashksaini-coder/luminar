# UI Overhaul — Phase 7: Swap and Deploy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `web/` the only frontend: Docker, Makefile, CI, the recorder script and every doc point at it, the old `frontend/` is deleted, `master` is tagged `pre-overhaul`, and the swap PR merges so Render/DO and the public URL serve the new UI for the talk (spec §11 phase 7, §13 item 1).

**Architecture:** Builder's call taken (spec §12): **`web/` keeps its name; `frontend/` is deleted; nothing is `git mv`'d.** The Dockerfile's Node stage builds `web/` and stage 2 copies `/web/out` to `frontend/dist`, the path `backend/main.py:1043` already mounts, so the backend is not edited (spec §3). Every path in plans 0–6 and the interfaces contract stays valid. Deploy manifests (`render.yaml`, `.do/app.yaml`, `docker-compose.yml`, `start.sh`) do not change.

**Tech Stack:** Docker (`node:22-slim` → `python:3.12-slim`), GNU make, GitHub Actions (`actions/setup-node@v4`, `node-version: 22`), pytest (trio mode) for the one Python change, curl + a browser walk for the container.

**Spec:** `/home/yks/Projects/luminar/docs/superpowers/specs/2026-10-24-ui-overhaul-design.md` §3, §4.1–4.2, §11 phase 7, §12, §13 item 1. Supporting: `docs/design/nextjs-architecture.md` §13 (Dockerfile stage), interfaces contract `/home/yks/Projects/luminar/docs/superpowers/plans/2026-10-24-ui-overhaul-interfaces.md` A.24 (Makefile, CI, env).

## New interfaces introduced by this phase

| Name | Kind | Definition |
|---|---|---|
| `Makefile` post-swap targets | make | `install` (`uv sync --all-extras` + `cd web && npm ci`), `dev` (backend :8000 + `web` :3000), `typecheck` (`cd web && npx tsc --noEmit`), `build` (`cd web && npm run build`), `check: lint test web-check build`, `clean` (`rm -rf web/out web/.next`). Target **`frontend` is removed**. `web`, `web-build`, `web-test`, `web-check`, `web-stats`, `web-video` unchanged from A.24. |
| `frontend-build` (Dockerfile stage name) | docker | kept as the stage name; `WORKDIR /web`; `ARG NEXT_PUBLIC_API_URL=` / `ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL`; stage 2 `COPY --from=frontend-build /web/out frontend/dist` |
| `pre-overhaul` | git tag (annotated) | the `master` commit the swap PR merges onto; the last commit whose tree holds `frontend/` |
| `scripts/record_reel.py` `REELS_DIR` | Python constant | `ROOT / "web" / "public" / "reels"` |
| `tests/test_record_reel.py` | pytest | `test_reels_dir_is_web_public_reels`, `test_check_passes_on_shipped_sybil_reel` |
| CI job set | GitHub Actions | `backend-lint`, `backend-test`, `web-build` (from phase 0). Job **`frontend-build` is removed**. |

## Global Constraints

- Backend untouched: `backend/main.py:1043` keeps `_FRONTEND_DIST = .../frontend/dist`; no new API, no new socket (spec §3, §2 non-goals).
- Single-container deploy on `$PORT=8080`; no Node process in production; `start.sh` unchanged; `render.yaml` and `.do/app.yaml` need no edit beyond the build stage (spec §3, §11 phase 7).
- Node 22 in Docker (`node:22-slim`) and CI (`node-version: 22`); `cache-dependency-path: web/package-lock.json`; `npm ci`, never `npm install`, in CI and Docker (spec §3, §11 phase 0).
- Env: `VITE_API_URL` → `NEXT_PUBLIC_API_URL`, build-time, **unset in the container**; `NEXT_PUBLIC_WS_URL` dev only, default `ws://localhost:8000` (spec §4.2, A.24).
- Next static export: `output: 'export'`, `trailingSlash: true` (Starlette resolves `sim/index.html`), `images.unoptimized: true` (spec §4.2).
- No runtime dependency on Google Fonts, Fontshare, any CDN or a YouTube embed; reels keep working with no backend (spec §2 anti-goals).
- Honesty copy appears in docs exactly as in `lib/copy.ts`: "same mechanism, toy constants"; "reproducible recordings", never "identical runs"; "arrival at observer nodes, ~2.5 min behind"; never "the scoring your beacon node runs" (spec §2, §4.10).
- `master` stays shippable until the swap PR merges; phase 7 **must land by 1 Nov** (spec §11, §13 item 1).
- Commits `type(scope): message`, scope `web` for this phase; `deploy` is acceptable for Dockerfile-only commits (spec §12). This plan uses `web` throughout as the task text asks.
- Every task ends with `cd web && npx tsc --noEmit && npm run lint && npx vitest run && npm run build` green and `make check` green (spec §11).

## Review Focus

1. **Host build artefacts leaking into the image** (`web/out`, `web/.next`, `web/node_modules` present on the laptop when `docker compose up --build` runs): the image must contain only what the Node stage built, never a stale `out/` — Task 7.1 Step 6 plants a canary file and asserts it is absent in the container.
2. **Slash-less routes through the Starlette mount** (`/sim`, `/reels/sybil-eclipse`, `/figure` typed by hand or in old talk notes): must 307 to the trailing-slash page, never 404 — Task 7.1 Step 5 asserts the 307 and the `Location` header.
3. **Reels and geo missing from the image** (a `.dockerignore` rule that swallows `web/public/reels` would make `/reels/<n>/` load a page that fetches a 404 and sit on the dithered progress bar forever): Task 7.1 Step 5 asserts `/reels/sybil-eclipse.jsonl` serves 3631205 bytes and `/geo/land-110m.json` 200.
4. **A Make or CI target still saying `cd frontend` after the directory is gone** (fails only when someone runs it on stage): Task 7.2 Step 1 greps the dry-run of every target, Task 7.4 Step 4 greps the whole tree.
5. **`record_reel.py record` on a fresh clone copying into a path that no longer exists** (`shutil.copy` into `frontend/public/reels/` raises after a 40 s recording): Task 7.3's test asserts `REELS_DIR.is_dir()` on the committed tree.

---

## Prerequisites (verified before Task 7.1 starts)

- [ ] Phases 0–6 merged into `feat/ui-overhaul`; `cd web && npm run build` writes `web/out/sim/index.html`, `web/out/reels/sybil-eclipse/index.html`, `web/out/figure/index.html`, `web/out/404.html`.
- [ ] `git check-ignore -q web/out web/.next web/node_modules` exits 0 (phase 0 added them); `git ls-files web/public/reels | wc -l` prints `5` (phase 4 committed the four reels + manifest, with `!web/public/reels/*.jsonl` in `.gitignore`).
- [ ] Docker daemon running; `docker compose version` prints a v2 version.

---

### Task 7.1: Dockerfile stage 1 builds `web/`, stage 2 copies `web/out` to `frontend/dist`

**Files:**
- Modify: `Dockerfile:1-10` (stage 1), `Dockerfile:26-27` (the `COPY --from`)
- Modify: `.dockerignore:11-12` (`frontend/node_modules`, `frontend/dist` → `web/` rules)
- Test: `docker compose up --build` + the curl walk below (no unit test: the deliverable is the image)

**Interfaces:**
- Consumes: `web/package.json` scripts `build` and `prebuild` (A.24), `web/out/` layout from `next.config.ts` (`trailingSlash: true` → `<route>/index.html`, `404.html`).
- Produces: image where `/app/frontend/dist` = `web/out`; build arg `NEXT_PUBLIC_API_URL` (default empty) for a split deploy nobody uses today.

- [ ] **Step 1: Write the failing check**

```bash
docker compose build 2>&1 | tail -3 && docker compose up -d && sleep 8
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:8080/sim/
```
Expected now: build fails at `COPY frontend/package.json` once `frontend/` is gone (Task 7.4), or, before that, serves the **old** Vite `index.html` (no `/sim/` route → `404`). Either is the failure this task removes.

- [ ] **Step 2: Rewrite stage 1 of `Dockerfile`** to the architecture doc's block (§13), verbatim:

```dockerfile
# ── Stage 1: Build web (Next static export) ────────────────────────────────
FROM node:22-slim AS frontend-build
WORKDIR /web
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ ./
ARG NEXT_PUBLIC_API_URL=
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
RUN npm run build
```
Stage 2 line 26–27 becomes `COPY --from=frontend-build /web/out frontend/dist` with the comment `# web/out → the path backend/main.py:1043 mounts; the backend is not edited`. Everything else in the file (uv install, `ENV`, `EXPOSE 8080`, `CMD`) is unchanged.

- [ ] **Step 3: Update `.dockerignore`**: replace lines 11–12 with
```
web/node_modules
web/.next
web/out
web/remotion/out
frontend
```
(`frontend` stays listed so a leftover local `frontend/dist` symlink from the mount trick never enters the context.) Keep `docs`, `assets`, `tests` ignored as today.

- [ ] **Step 4: Build and start**

Run: `docker compose up --build -d && docker compose logs -f app | sed -n '1,20p'`
Expected: stage 1 log shows `> prebuild` → `reel-stats` then `✓ Generating static pages`; uvicorn logs `Uvicorn running on http://0.0.0.0:8080`.

- [ ] **Step 5: curl walk (the phase's acceptance list plus the review-focus routes)**

```bash
for p in / /sim/ /reels/sybil-eclipse/ /figure/ /metrics /api/sim/snapshot /geo/land-110m.json; do
  printf '%-28s %s\n' "$p" "$(curl -s -o /dev/null -w '%{http_code}' http://localhost:8080$p)"; done
curl -s -o /dev/null -w '%{http_code} %{redirect_url}\n' http://localhost:8080/sim
curl -s -o /dev/null -w '%{http_code} %{redirect_url}\n' http://localhost:8080/reels/sybil-eclipse
curl -s -o /dev/null -w '%{http_code} %{size_download}\n' http://localhost:8080/reels/sybil-eclipse.jsonl
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:8080/nope
curl -s http://localhost:8080/ | grep -c 'fonts.googleapis\|fontshare\|youtube'
```
Expected, line by line: all seven → `200`; `307 http://localhost:8080/sim/`; `307 http://localhost:8080/reels/sybil-eclipse/`; `200 3631205`; `404`; `0`.

- [ ] **Step 6: Canary — host artefacts do not reach the image**

```bash
mkdir -p web/out && touch web/out/CANARY && docker compose build -q && rm web/out/CANARY
docker compose run --rm --no-deps app sh -c 'test ! -e frontend/dist/CANARY && echo clean'
```
Expected: `clean`.

- [ ] **Step 7: Browser walk on the container** (Chrome at 1440×900 against `http://localhost:8080`)
  1. Open `/` → landing renders in Instrument Serif (DevTools → Network → no request to any host but `localhost:8080`); Fig. 1 plate reveals; `Open the simulator` → `/sim/`.
  2. `/sim/` → pill reads `LIVE` within 2 s, `Space` plays, `T+` counts; Inject fault ▾ → Sybil → toast `Sybil ×5 injected`; five flame diamonds appear.
  3. `/reels/sybil-eclipse/?theme=stage&hero=1` → pill `REEL · Sybil → Eclipse`, dithered progress bar, plays, ticker visible; press `0` → navigates to `/sim/`.
  4. `/figure/` → the sorter iframe renders; `?press=Post@300,Heartbeat@1500,Sybil@2500,Heartbeat@4000,Heartbeat@5500` runs the sequence.
  5. `/metrics` → Prometheus text with `gossipsub_` names.
  Then `docker compose down`.

- [ ] **Step 8: Commit**

```bash
git add Dockerfile .dockerignore
git commit -m "feat(web): Dockerfile builds web/ and ships web/out as frontend/dist"
```

---

### Task 7.2: Makefile targets renamed; CI `web-build` replaces `frontend-build`

**Files:**
- Modify: `Makefile:1` (`.PHONY`), `:8-10` (`install`), `:17-25` (`frontend`, `dev`), `:40-46` (`typecheck`, `build`, `check`), `:70-73` (`clean`)
- Modify: `.github/workflows/ci.yml:29-41` (delete the `frontend-build` job; `web-build` from phase 0 stays)
- Test: `make -n` dry runs + `make check`

**Interfaces:**
- Consumes: `web-check`, `web-build`, `web` targets as pinned in A.24.
- Produces: the post-swap target set in *New interfaces* above; `make check` = `lint test web-check build` (same four job shapes CI runs: ruff, pytest, tsc+eslint+vitest, next build).

- [ ] **Step 1: Write the failing check**

```bash
make -n install dev typecheck build check clean 2>/dev/null | grep -c 'cd frontend'
grep -c 'frontend' .github/workflows/ci.yml
```
Expected now: a number ≥ 5, and `4`. Target after this task: `0` and `0`.

- [ ] **Step 2: Edit the Makefile**
  - `.PHONY`: drop `frontend`, add `web web-build web-test web-check web-stats web-video` if phase 0 did not.
  - `install`: `uv sync --all-extras` then `cd web && npm ci` (help text `Install all dependencies (backend + web)`).
  - Delete the `frontend` target. `dev`: backend line unchanged; echo `Starting web on :3000...`; last line `@cd web && npm run dev`.
  - `typecheck`: `cd web && npx tsc --noEmit`. `build`: `cd web && npm run build` (help `Build the web app (static export → web/out)`).
  - `check: lint test web-check build ## Run all checks (ruff + pytest + tsc/eslint/vitest + next build)`.
  - `clean`: `rm -rf web/out web/.next` in place of `frontend/dist frontend/node_modules/.vite`.

- [ ] **Step 3: Edit `.github/workflows/ci.yml`**: remove the whole `frontend-build` job (lines 29–41). Confirm the remaining `web-build` job reads exactly (A.24): `node-version: 22`, `cache: npm`, `cache-dependency-path: web/package-lock.json`, steps `cd web && npm ci`, `npx tsc --noEmit`, `npm run lint`, `npx vitest run`, `npm run build`. Job `name: Web Build`.

- [ ] **Step 4: Run the checks**

Run: `make -n install dev typecheck build check clean 2>/dev/null | grep -c 'cd frontend'; grep -c frontend .github/workflows/ci.yml; make help`
Expected: `0`, `0`, and `make help` lists no `frontend` row and does list `web`, `web-build`, `web-check`.

Run: `make check`
Expected: ruff clean, `126 passed` (or the current count) under trio, `tsc` silent, eslint clean, vitest green, `✓ Generating static pages`, exit 0.

- [ ] **Step 5: Commit**

```bash
git add Makefile .github/workflows/ci.yml
git commit -m "feat(web): make targets and CI point at web/; drop frontend-build"
```

---

### Task 7.3: `scripts/record_reel.py` writes to `web/public/reels/`

**Files:**
- Modify: `scripts/record_reel.py:6` (docstring `Check:` path), `:12` (docstring copy path), `:29` (`REELS_DIR`)
- Create: `tests/test_record_reel.py`

**Interfaces:**
- Consumes: `scripts/record_reel.py` `check_file(path: Path, min_score_prunes: int) -> int` (exists, line 83).
- Produces: `REELS_DIR: Path = ROOT / "web" / "public" / "reels"`.

- [ ] **Step 1: Write the failing test**

```python
"""record_reel.py targets the web/ reel directory after the frontend swap."""

from __future__ import annotations

import importlib.util
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
_spec = importlib.util.spec_from_file_location("record_reel", ROOT / "scripts" / "record_reel.py")
record_reel = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(record_reel)


def test_reels_dir_is_web_public_reels():
    assert record_reel.REELS_DIR == ROOT / "web" / "public" / "reels"
    assert record_reel.REELS_DIR.is_dir()
    assert (record_reel.REELS_DIR / "manifest.json").is_file()


def test_check_passes_on_shipped_sybil_reel():
    assert record_reel.check_file(record_reel.REELS_DIR / "sybil-eclipse.jsonl", 1) == 0
```
(Plain `def`, not `async def`: trio mode only wraps coroutine tests.)

- [ ] **Step 2: Run to verify it fails**

Run: `uv run pytest tests/test_record_reel.py -v`
Expected: `test_reels_dir_is_web_public_reels FAILED` (`REELS_DIR` is `.../frontend/public/reels`).

- [ ] **Step 3: Implement**: line 29 → `REELS_DIR = ROOT / "web" / "public" / "reels"`; docstring lines 6 and 12 → `web/public/reels/`. Nothing else in the script references `frontend`.

- [ ] **Step 4: Run to verify it passes**

Run: `uv run pytest tests/test_record_reel.py -v && uv run python scripts/record_reel.py check web/public/reels/sybil-eclipse.jsonl --min-score-prunes 1 && make lint`
Expected: `2 passed`; the `check` command prints its summary and exits 0; ruff clean.

- [ ] **Step 5: Commit**

```bash
git add scripts/record_reel.py tests/test_record_reel.py
git commit -m "feat(web): record_reel.py copies reels into web/public/reels"
```

---

### Task 7.4: Delete the old `frontend/`; scrub ignore files and the project CLAUDE.md

**Files:**
- Delete: `frontend/` (whole tree: `index.html`, `src/`, `public/`, `package.json`, `package-lock.json`, `tsconfig.json`, `vite.config.ts`)
- Modify: `.gitignore:16-17` (`frontend/dist/`, `frontend/build/`), `:49-51` (reel comment + `!frontend/public/reels/*.jsonl`)
- Modify: `.claude/CLAUDE.md:4`, `:15-21` (Layout), `:24-28` (Commands), `:36` (scopes), `:40` (Deployment), `:46` (Reels), `:67` (Before claiming done)
- Modify: `docs/roadmap-devcon8.md` status block (one line)
- Test: `git grep` over the tree + `make check`

**Interfaces:**
- Consumes: Tasks 7.1–7.3 (nothing else may reference `frontend/` except the mount path `frontend/dist`).
- Produces: a tree where the string `frontend/` appears only in `backend/main.py:1043-1045`, `Dockerfile` stage 2, `.dockerignore`, `tests/test_api.py:133`, and history docs (`docs/roadmap-devcon8.md`, `docs/design/*`, `docs/superpowers/*`).

- [ ] **Step 1: Write the failing check**

```bash
git grep -n 'frontend/src\|frontend/public\|cd frontend\|5173\|VITE_API_URL\|vite' -- . ':!docs/design' ':!docs/superpowers' ':!docs/roadmap-devcon8.md' ':!frontend' ':!web/package-lock.json'
```
Expected now: hits in `.gitignore`, `.claude/CLAUDE.md`, `README.md`, `docs/deployment.md`, `docs/ui.md`, `docs/architecture.md`. After Tasks 7.4–7.6: no output.

- [ ] **Step 2: Remove the tree**

Run: `git rm -r -q frontend && rm -rf frontend && git status --short | grep -c '^D  frontend/'`
Expected: a count equal to the number of tracked files that were under `frontend/` (≥ 30; the five reels and `land-110m.json` among them).

- [ ] **Step 3: Edit ignore files and CLAUDE.md**
  - `.gitignore`: delete lines 16–17; comment on line 49 → `# Reel recordings (raw); shipped reels live in web/public/reels/`; line 51 → `!web/public/reels/*.jsonl` (if phase 4 already added it, delete the `frontend` line only). Confirm `web/out/` and `.next/` are ignored.
  - `.claude/CLAUDE.md`: line 4 `TypeScript frontend` → `Next.js (static export) frontend in web/`; Layout bullet → `` `web/` — Next 16 static export, React 19, zustand, plain CSS Modules. `app/` routes (`/`, `/sim/`, `/reels/[name]/`, `/figure/`); `components/sim|map|dither|landing`; `lib/` (store, api, copy, keys); `remotion/`; `public/reels`, `public/fonts` ``; Commands → `make install` (`npm ci` in `web/`), `make dev` (backend :8000 + web :3000), `make typecheck` (`cd web && npx tsc --noEmit`), `make web-check`, `make check` (lint + test + web-check + build); scopes `backend, web, video, deploy`; Deployment line → `Docker copies web/out to frontend/dist (the path main.py mounts; backend untouched). Env: NEXT_PUBLIC_API_URL (build-time, unset in the container)`; Reels line → `web/public/reels/*.jsonl` and the offline URL `/reels/<name>/?theme=stage&hero=1`; "Before claiming done" → `make web-check` for any web change. Add one line under Conventions: `Frontend fetches go through web/lib/api/client.ts (get/post return {ok,status,data}; getStatic for same-origin files).`
  - `docs/roadmap-devcon8.md` status block: append `Paths under frontend/ in the tables below describe the pre-overhaul tree (git tag pre-overhaul); the shipped frontend is web/ since the 1 Nov swap.`

- [ ] **Step 4: Run the checks**

Run: `git grep -n 'cd frontend\|frontend/src\|frontend/public' -- . ':!docs/design' ':!docs/superpowers' ':!docs/roadmap-devcon8.md' ':!web/package-lock.json' | grep -v 'README.md\|docs/deployment.md\|docs/ui.md\|docs/architecture.md'`
Expected: no output (the four docs are Tasks 7.5–7.6).

Run: `git check-ignore -q web/out web/.next && git ls-files web/public/reels | wc -l && make check`
Expected: exit 0, `5`, and `make check` green with `frontend/` gone (proves no target still depends on it).

- [ ] **Step 5: Commit**

```bash
git add .gitignore .claude/CLAUDE.md docs/roadmap-devcon8.md   # the frontend/ deletions are already staged by git rm
git commit -m "feat(web): remove the Vite frontend; web/ is the only frontend"
```

---

### Task 7.5: `docs/deployment.md`, `README.md`, `docs/architecture.md` describe the `web/` build

**Files:**
- Modify: `docs/deployment.md:3-5`, `:9-32` (Local development), `:34-47` (Docker), `:56` (env row), `:66-75` (Render/DO)
- Modify: `README.md:23` (offline URL), `:38-42` (Quick start), `:161` (mermaid subgraph label), `:189-192` (repo layout rows), `:203-207` (Development), `:212` (Deploy), `:231` (env row)
- Modify: `docs/architecture.md:36-37`
- Test: greps below

**Interfaces:**
- Consumes: routes and params from A.24; env names `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_WS_URL`; Makefile targets from Task 7.2.
- Produces: docs a presenter can follow on the venue laptop; the deployment env table row the spec names.

- [ ] **Step 1: Write the failing check**

```bash
grep -n 'NEXT_PUBLIC_API_URL' docs/deployment.md README.md | wc -l
grep -n '5173\|VITE_API_URL\|Vite\|vite' docs/deployment.md README.md docs/architecture.md | wc -l
grep -rn "identical run\|beacon node's scoring\|mesh path" docs/deployment.md README.md docs/architecture.md | grep -v 'not mesh paths\|not identical runs\|not an identical run\|does not predict your beacon node'
```
Expected now: `0`, ≥ 8, (may be empty). Target: ≥ 2, `0`, empty.

- [ ] **Step 2: Rewrite `docs/deployment.md`** (keep its section order):
  - Intro: `serves the built frontend from frontend/dist` → `serves the Next.js static export (built from web/, copied to frontend/dist) …`.
  - Local development: `make dev` → `backend :8000 + Next dev server :3000`; `Open http://localhost:3000`; `next.config.ts rewrites /api/* to :8000; the WebSocket connects to NEXT_PUBLIC_WS_URL ?? ws://localhost:8000 when location.port === '3000'`; `make web` replaces `make frontend`. Add the mount-proof paragraph: `` To serve the export through FastAPI locally: `make build && ln -sfn ../web/out frontend/dist && make backend` → http://localhost:8000/sim/ (the symlink is git-ignored). ``
  - Docker: `builds web/ in a node:22-slim stage (npm ci, npm run build → web/out), copies web/out to frontend/dist, the path backend/main.py mounts with StaticFiles(html=True); trailing-slash routes (/sim/) are directories with index.html, /sim redirects 307`. `VITE_API_URL` sentence → `NEXT_PUBLIC_API_URL is a Docker build arg left empty on purpose: …same-origin…`.
  - Env table: replace the `VITE_API_URL` row with
    `| NEXT_PUBLIC_API_URL | unset | web/lib/api/client.ts, websocket.ts | **Build-time** (inlined by next build; Dockerfile ARG): set it only for a split deploy. Leave unset for the single container. |`
    and add
    `| NEXT_PUBLIC_WS_URL | ws://localhost:8000 | web/lib/api/websocket.ts | Dev only (port 3000): where the WebSocket connects when the API is proxied. Ignored in production. |`
  - Render / DigitalOcean: add one sentence each: `No change for the Next.js build: the same Dockerfile, health check and env apply.` Add a short `## Vercel` line: `Not a deploy target. The app is a static export served by FastAPI (no Node in production); a Vercel preview of web/ would need NEXT_PUBLIC_API_URL pointed at a running backend and is outside the deploy story.`

- [ ] **Step 3: Edit `README.md`**:
  - line 23: `http://localhost:3000/reels/sybil-eclipse/?theme=stage&hero=1`.
  - Quick start: `make dev       # backend :8000 + web :3000`; `Open http://localhost:3000/sim/ and press Space. For the offline demo, make web is enough: open http://localhost:3000/reels/sybil-eclipse/ …`.
  - mermaid line 161: `subgraph frontend ["web · Next.js static export · React"]`.
  - repo layout rows 189–192 → `| web/app/ | routes: / landing, /sim/, /reels/[name]/, /figure/ |`, `| web/components/map/ | deck.gl renderer, frozen d3-force layout, icon atlas |`, `| web/components/sim/ | toolbar, command strip, rails, inspector, narrator, legend |`, `| web/components/dither/ | Bayer 8×8 dither, halo ring, diamond, stamp, figure, loupe |`, `| web/lib/ | zustand store, REST + WebSocket + reel player, copy.ts |`, `| web/remotion/ | the launch video (npm run video, local Chrome) |`.
  - Development block: `make typecheck   # cd web && npx tsc --noEmit`, add `make web-check   # tsc + eslint + vitest`; scopes sentence → `backend, web, video, deploy`.
  - Deploy line 212: `make docker      # builds web/, serves it with the backend from one container on :8080`.
  - Env row 231: `| NEXT_PUBLIC_API_URL | same origin | build-time; where the frontend finds the API |`.

- [ ] **Step 4: Edit `docs/architecture.md:36-37`**: `Dev proxy: Next (web/next.config.ts) rewrites /api to http://localhost:8000; the WebSocket connects to NEXT_PUBLIC_WS_URL ?? ws://localhost:8000 in dev` and `Production: backend/main.py mounts frontend/dist (= web/out, the Next static export) with StaticFiles(html=True) at /`.

- [ ] **Step 5: Run the checks**

Run: the three greps from Step 1.
Expected: `≥ 2`, `0`, empty.

Run: `grep -o '`web/[^` ]*`' README.md docs/deployment.md docs/architecture.md | sed 's/.*`\(web[^`]*\)`/\1/' | sort -u | while read p; do test -e "$p" || echo "MISSING $p"; done`
Expected: no `MISSING` lines (every `web/...` path named in the docs exists).

- [ ] **Step 6: Commit**

```bash
git add docs/deployment.md README.md docs/architecture.md
git commit -m "docs(web): deployment, README and architecture describe the web/ build"
```

---

### Task 7.6: `docs/ui.md` rewritten against the design document

**Files:**
- Rewrite: `docs/ui.md` (whole file; today's text describes the Vite UI and is wrong in places: 3 reels, a "grid" mode)
- Test: greps below

**Interfaces:**
- Consumes: spec §4.8 (routes/params), §6.2 (toolbar, strip, canvas, render table, rails, keyboard), §6.3 (stage/hero), §6.4 (reels), §13 (decisions); `web/lib/copy.ts` strings; `web/lib/keys.ts` `KEY_BINDINGS` labels.
- Produces: the presenter's reference for the new UI; "Trust code over this file" retained.

- [ ] **Step 1: Write the failing check**

```bash
grep -c 'frontend/src\|ui/stats-panel.ts\|index.html:\|grid' docs/ui.md
grep -c '/sim/\|/reels/\|web/components' docs/ui.md
```
Expected now: a large number, `0`. Target: `0`, ≥ 10.

- [ ] **Step 2: Write the new `docs/ui.md`** with these sections, each stating what the screen does and the file that does it (`web/components/...`), ≤ 250 lines, no restating of the spec's reasoning:
  1. `# Luminar UI reference` + `Verified against web/ at <commit sha> on <date>. Trust code over this file.` + the three screenshots table kept with the paths under `assets/` that still exist (re-capture at `/reels/sybil-eclipse/?t=11.9&peer=sybil-0`, `?t=20.7`, and Radial, if the old JPEGs no longer match; otherwise drop the table).
  2. `## 1. Routes and URL parameters` — the table from spec §4.8 verbatim (4 rows) + prefs persistence line.
  3. `## 2. Screen map` — desktop ≥1024 (toolbar 44 · left rail 264 · canvas · right rail 312 · floating strip) and ≤1023 (drawers, bottom sheet, `Menu +`) from §6.2 first paragraph.
  4. `## 3. Toolbar` · `## 4. Command strip` (scrubber-is-for-recordings rule, menus, fault menu items with their disabled reasons, toasts reflect `{ok}`).
  5. `## 5. Canvas` — the render table of §6.2 copied as-is (shape · colour · notes) and the legend sentence `gossip mesh · hidden above 100 peers (backend sends none)`.
  6. `## 6. Rails` — left rail sections, right rail (log, inspector incl. MESH PEERS vs TOPOLOGY PEERS and the WHY line verbatim from `copy.ts`).
  7. `## 7. Keyboard` — one row per `KEY_BINDINGS` entry in `web/lib/keys.ts` (key, action, label) and the hint row `SPACE play · F fit · T stage · H hero · ? keys`.
  8. `## 8. Stage and hero` — §6.3 in prose; ticker cells; `aria-live` rules.
  9. `## 9. Reels` — the four manifest entries (name, title, nodes, blurb from `web/public/reels/manifest.json`), load/seek/guard behaviour from §6.4, the offline test URL.
  10. `## 10. Telemetry and live mainnet` — badge only (§13 item 2); provenance sentence verbatim; `arrival at observer nodes, ~2.5 min behind`.
  11. `## 11. Demo script: Sybil → Eclipse` — ported from today's §9.1/9.2 with the new URLs and keys (`r` reset, `?`).

- [ ] **Step 3: Run the checks**

```bash
grep -c 'frontend/src\|ui/stats-panel.ts\|index.html:\|grid' docs/ui.md          # 0
grep -c '/sim/\|/reels/\|web/components' docs/ui.md                               # ≥ 10
grep -n "identical run\|beacon node's scoring\|mesh path" docs/ui.md | grep -v 'not mesh paths\|not an identical run'   # empty
grep -o '`web/[^` ]*`' docs/ui.md | sed 's/`//g' | sort -u | while read p; do test -e "$p" || echo "MISSING $p"; done   # empty
for k in Space f Escape 0 s t h r '?'; do grep -q -- "\`$k\`" docs/ui.md || echo "missing key $k"; done                # empty
grep -c 'arrival at observer nodes, not mesh paths · data: ethPandaOps (CC BY 4.0)' docs/ui.md                          # ≥ 1
```

- [ ] **Step 4: Commit**

```bash
git add docs/ui.md assets/
git commit -m "docs(web): rewrite docs/ui.md for the Next.js UI"
```

---

### Task 7.7: `pre-overhaul` tag, deploy env check, swap PR and merge

**Files:**
- No source files. Produces: git tag `pre-overhaul` on `origin/master`, PR `feat/ui-overhaul → master`, the merge, and a post-deploy smoke.
- Test: the command outputs below; the public URL walk after Render/DO redeploy.

**Interfaces:**
- Consumes: everything above; `render.yaml`, `.do/app.yaml` unchanged.
- Produces: `master` serving the new UI (spec §13 item 1); `pre-overhaul` as the fallback tree.

- [ ] **Step 1: Write the failing check**

Run: `git fetch origin && git tag -l pre-overhaul && git diff origin/master -- render.yaml .do/app.yaml docker-compose.yml start.sh | wc -l`
Expected now: empty tag list (fails the "tag exists" expectation), and `0` (the four deploy files are untouched; if not `0`, stop and revert the diff — spec §11 phase 7).

- [ ] **Step 2: Tag the last pre-overhaul `master` commit**

```bash
git tag -a pre-overhaul "$(git rev-parse origin/master)" -m "Vite frontend before the Next.js overhaul (feat/ui-overhaul). Fallback demo for Devcon 8."
git push origin pre-overhaul
git ls-remote --tags origin | grep -c pre-overhaul
```
Expected: `1` (or `2` with the `^{}` peeled line). `git show pre-overhaul:frontend/package.json | head -3` prints the Vite package.

- [ ] **Step 3: Deploy env check (Render / DO / Vercel)**
  - `grep -rn 'NEXT_PUBLIC_API_URL' render.yaml .do/app.yaml docker-compose.yml` → no output (unset = same origin, spec §4.2).
  - Render dashboard → service `luminar-backend` → Environment: only `PORT=8080`, `LUMINAR_NODE_COUNT=20` (+ `LUMINAR_ADMIN_TOKEN` if the public deploy is read-only). Nothing to add.
  - DO app `luminar` → `LUMINAR_NODE_COUNT=50`, `LUMINAR_LOG_LEVEL=INFO`. Nothing to add.
  - Vercel: no project is part of this deploy (spec §3: no Node in production). If a preview project exists, leave it; it is not the talk's URL.

- [ ] **Step 4: Final green on the branch**

Run: `make check && docker compose up --build -d && sleep 8 && curl -s -o /dev/null -w '%{http_code}\n' http://localhost:8080/reels/sybil-eclipse/ && docker compose down`
Expected: `make check` exit 0; `200`.

- [ ] **Step 5: Open the PR**

```bash
git push -u origin feat/ui-overhaul
gh pr create --base master --head feat/ui-overhaul --title "feat(web): Next.js UI overhaul — swap web/ in, retire the Vite frontend" --body-file /tmp/claude-1000/-home-yks-Projects-luminar/344950f1-b57c-4874-90b3-764debeb2b83/scratchpad/pr-swap.md
```
`pr-swap.md` carries this checklist (every box ticked before merge):
```
## Swap checklist (spec §11 phase 7, §13 item 1)
- [ ] CI green: backend-lint, backend-test, web-build
- [ ] `make check` green locally with frontend/ deleted
- [ ] `docker compose up --build` serves / , /sim/ , /reels/sybil-eclipse/ , /figure/ , /metrics on :8080; /sim → 307 /sim/; /nope → 404
- [ ] canary: host web/out never reaches the image
- [ ] start.sh, render.yaml, .do/app.yaml, docker-compose.yml: zero diff vs master
- [ ] NEXT_PUBLIC_API_URL unset everywhere (same-origin); docs/deployment.md row added
- [ ] tag pre-overhaul pushed and points at origin/master's pre-merge commit
- [ ] reel offline test (phase 4) re-run on this branch's web/out via python3 -m http.server
- [ ] Lighthouse accessibility ≥ 90 on /, /sim/, /reels/sybil-eclipse/ (phase 5 numbers pasted here)
- [ ] copy grep: `grep -rn "identical run\|beacon node's scoring\|mesh path" web/ docs/ README.md` returns only web/lib/copy.ts negations and "not mesh paths"
- [ ] docs: README quick start opens :3000; docs/ui.md rewritten; docs/deployment.md env table
- [ ] Merge method: **merge commit** (keeps per-phase history; pre-overhaul stays the first parent's tree)
## After merge
- [ ] Render auto-deploy finished; public URL: / 200, /sim/ shows LIVE, /reels/sybil-eclipse/?theme=stage&hero=1 plays
- [ ] DO app redeployed; same three checks
- [ ] Venue laptop: `git pull`, `make install`, `make build`, `ln -sfn ../web/out frontend/dist`, `make backend` → http://localhost:8000/reels/sybil-eclipse/ with Wi-Fi off

🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

- [ ] **Step 6: Merge and smoke the public URL** (owner clicks merge once CI is green; merge commit, not squash)

```bash
gh pr merge --merge --delete-branch=false
# wait until the Render dashboard shows the new deploy as Live (≈ 5 min; `gh run list --branch master --limit 1` shows CI green first)
for p in / /sim/ /reels/sybil-eclipse/ /figure/ /api/sim/snapshot; do printf '%-26s %s\n' "$p" "$(curl -s -o /dev/null -w '%{http_code}' https://<render-origin>$p)"; done
```
Expected: five `200`s. Then open `https://<render-origin>/reels/sybil-eclipse/?theme=stage&hero=1` on a phone: reel plays, no horizontal scroll, pill `REEL · Sybil → Eclipse`.

---

## Phase acceptance gate (spec §11, Phase 7 — verbatim)

> ### Phase 7 — swap and deploy (1 Nov, ½ day; **must land**: the talk is served from `master`, §13 item 1)
>
> Checklist: `git mv web frontend` (or keep `web/` and repoint — builder's call, but
> `backend/main.py` is not edited: Docker copies `web/out` to `frontend/dist`), Dockerfile stage
> 1 per the architecture doc, Makefile targets renamed, CI job replaces `frontend-build`,
> `scripts/record_reel.py` output path, `docs/deployment.md` env row (`NEXT_PUBLIC_API_URL`),
> `docs/ui.md` rewritten against this document, `frontend/` (old) deleted.
> Acceptance: `make check` green; `docker compose up --build` serves `/`, `/sim/`,
> `/reels/sybil-eclipse/`, `/figure/`, `/metrics` on `:8080`; `start.sh` unchanged;
> `render.yaml` and `.do/app.yaml` need no edit beyond the build stage.

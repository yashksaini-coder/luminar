# Luminar UI Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild Luminar's frontend as a Next.js 16 static export in `web/` with one visual system (near-black field, off-white ink, one flame accent, 1-bit Bayer dither used as an instrument), at feature parity with `frontend/` for every inventory Keep/Improve row, plus the landing page, the sorter colorfigure, offline reels, the stage/hero broadcast view and the Remotion launch video — and swap it onto `master` before Devcon 8 (Mumbai, 3–6 Nov 2026) without ever breaking the fallback demo.

**Architecture:** `web/` sits beside `frontend/` until the swap. A zustand 5 store (`lib/store.ts`) is written only by one frame dispatcher (`lib/api/dispatch.ts`) that both the live WebSocket and the reel player feed, so live and recorded playback produce identical state; `lib/actions.ts` holds every side effect (REST, reel player, URL, clipboard). The mesh is a plain-module deck.gl renderer (`components/map/renderer.ts`) reading the store in rAF with no React re-render per frame, drawing every glyph from one procedural icon atlas whose score halos are pre-dithered. One Bayer 8×8 module (`components/dither/dither.ts`) serves the landing plates, the atlas and the video. The simulator is a set of client components under `components/sim/` built on pure, vitest-tested `lib/*` modules; the landing is server-rendered with three client islands; the video is Remotion inside the same package reading the same reel file; phase 7 points Docker at `web/out` and deletes `frontend/`.

**Tech Stack:** Next 16.4.3 (`output: 'export'`), React 19.3.1, TypeScript 5.9.3, zustand 5.0.16, `@deck.gl/core|layers|extensions` 9.4.0 + `@luma.gl/core|webgl` 9.4.2, d3-force 3.0.0, culori 4.0.2, `remotion`/`@remotion/cli`/`@remotion/player` 4.0.538 + zod 3, plain CSS Modules on `docs/design/tokens.css`, `next/font/local` with `@fontsource/*` 5.3.0 woff2 files, vitest + jsdom (unit), chrome-devtools MCP browser walks (canvas/UI acceptance), the owner's `colorfigures` skill (Fig. 2), Docker `node:22-slim` → `python:3.12-slim`.

**Spec:** `/home/yks/Projects/luminar/docs/superpowers/specs/2026-10-24-ui-overhaul-design.md` (approved 24 Oct 2026; §4 architecture, §5 tokens, §6 surfaces, §7 dither incl. §7.4 the twist, §8 figure, §9 video, §10 accessibility, §11 build sequence, §13 decisions). Supporting, all under `/home/yks/Projects/luminar/docs/design/`: `ui-inventory.md` (the parity checklist — every Keep/Improve row is Must), `nextjs-architecture.md`, `tokens.css` (the single styling source), `backboard-teardown.md` (§6, §9 dither recipe), `figure-concept.md` (Candidate A), `launch-video-storyboard.md`. Source being ported: `/home/yks/Projects/luminar/frontend/src/`. The backend is untouched. The phase parts this plan was assembled from stay in `docs/superpowers/plans/parts/phase-0.md … phase-7.md` and `2026-10-24-ui-overhaul-interfaces.md`; this file supersedes them where they differ.

## Global Constraints

Copied from the spec; every task's requirements implicitly include this list.

- Backend untouched: `backend/main.py:1043` mounts `frontend/dist` with `StaticFiles(html=True)`; **no backend changes, no new API, no new WebSocket, no gzip for reels, no sampled mesh above 100 nodes (the backend sends `{}`; the UI says so)** (spec §2, §3).
- Same WebSocket contract (`/ws/events`, orjson binary frames + text event batches at 20 Hz) and same REST contract (inventory §4.1); `post()` returns `{ok, status, data}` and never throws (spec §3, §4.9).
- Next **static export**: `output: 'export'`, `trailingSlash: true`, `images.unoptimized: true`; dev `rewrites()` proxies `/api/:path*` to `:8000`; no rewrites/middleware in the output; `useSearchParams` only under `<Suspense>`; only `/reels/[name]` is dynamic (spec §4.2).
- `VITE_API_URL` → `NEXT_PUBLIC_API_URL` (build-time, unset in the container); dev WebSocket connects to `NEXT_PUBLIC_WS_URL ?? 'ws://localhost:8000'` when `location.port === '3000'`, in prod `location.host` (spec §4.2).
- Exact pins, lockfile committed: `next` 16.4.3, `react`/`react-dom` 19.3.1, `typescript` 5.9.3 (not 7.x), `eslint-config-next` 16.4.3, `zustand` 5.0.16, `@deck.gl/core|layers|extensions` 9.4.0, `@luma.gl/core|webgl` 9.4.2, `d3-force` 3.0.0, `culori` 4.0.2, `remotion` + `@remotion/player` 4.0.538, `@fontsource/instrument-serif` 5.3.0, `@fontsource/ibm-plex-mono` 5.3.0, `@fontsource-variable/manrope` 5.3.0; the builder re-runs `npm view <pkg> version` before pinning. **Absent on purpose: `@deck.gl/react`, Tailwind, immer, any UI kit, any icon set** (spec §4.2, §4.6, §4.7).
- Single-container deploy (`Dockerfile`, `render.yaml`, `.do/app.yaml`, `docker-compose.yml`, `start.sh`, `$PORT=8080`): no Node process in production; Node 22 (`node:22-slim` in Docker, `node-version: 22` in CI) (spec §3).
- `master` must stay shippable: the new app lives in `web/` beside `frontend/` until the swap PR; `frontend/` is not touched until phase 7 (spec §3, §4.1).
- Styling: `app/globals.css` = `docs/design/tokens.css` verbatim (edit tokens only there) + ≈300 lines of base rules; every component ships a CSS Module; **no utility framework, no CSS-in-JS**; token values, the render table's shape assignments, the honesty copy, the phase order and cut rule are **not the builder's to change** (spec §4.3, §12).
- Fonts: Instrument Serif (400 roman + italic), IBM Plex Mono (400/500/600), Manrope variable via `next/font/local` from `public/fonts/*.woff2`; **no runtime dependency on Google Fonts, Fontshare, any CDN, `next/image` optimisation or a YouTube embed. Venue Wi-Fi is assumed down** (spec §2, §4.6).
- Honesty copy, verbatim and only from `lib/copy.ts`: **"same mechanism, toy constants"**, never "the scoring your beacon node runs"; reels are **"reproducible recordings"**, never "identical runs"; mainnet copy is **"arrival at observer nodes, ~2.5 min behind"**; the provenance card keeps `arrival at observer nodes, not mesh paths · data: ethPandaOps (CC BY 4.0)` verbatim; `grep -rn "identical run\|beacon node's scoring\|mesh path" web/` must return only `copy.ts` negations (spec §2, §4.10).
- Offline reels keep working with **no backend**: `/reels/<name>/` from a static file server, socket never opened, every panel populated from the recording (spec §2, §6.4).
- `--flame` is never a brand accent, hover, link or primary button; it means attacker / fault / alarm and nothing else; never on `--signal` (flame on signal 1.9:1) (spec §2, §5, §10).
- **No dither on text, numbers, attackers, particles, focus rings, or any chart under 12 px tall**; also never on pruned diamonds, pulses, the selection reticle, the scrubber head, state-strip cells, stamps, menu and toast surfaces (spec §2, §7).
- §7.4 twist: plates are alive (Fig. 1 replays real reel snapshots), decoration is the legend (the only floating objects on any plate are the hollow Bayer **halo ring** and the flame **attacker diamond**; **the orange trapezoid shard and the grey halftone slab are gone everywhere** — owner, 24 Oct), the cursor is the reticle on plates and the mesh canvas, dither is the honest state; "if a new decorative element cannot be named in the legend, it does not go on the page" (spec §7.4).
- Accessibility: WCAG AA for every text pair (`--paper-2` is the smallest text colour allowed; `--paper-3` **never text**); Lighthouse accessibility ≥ 90 on `/`, `/sim/`, `/reels/<name>/`; every role = colour **and** shape; `prefers-reduced-motion: reduce` zeroes every `--d-*`, `--stagger`, `--parallax-travel`, jumps the dither reveal to the final cell, turns particles and pulses off (store `particlesEnabled` forced false with a hint in settings), observer ring static at .5, caption drain static, menu rows without rise; the loupe stays; `:focus-visible` 2 px `--focus` outline everywhere, never removed; `color-scheme: dark`; tabular numerals on every readout; 44 px minimum hit targets on the strip at ≤1023 px (spec §2 goal 6, §10).
- Decisions (spec §13): served from the merged branch — phase 7 must finish by **1 Nov**, `master` tagged `pre-overhaul`; **telemetry drawer: badge only** (`TELEMETRY` badge with `peer_count` + breathing observer ring ship; the drawer is deferred); **video audio: silent, both cuts**; **colorfigure buttons 4–5 deferred**; **node presets capped at 200** (`20 50 100 200`; the backend still accepts 500).
- Build sequence and cut rule are binding (spec §11): dates assume start Sat 25 Oct; **if phase 2 is not rendering the live mesh by the evening of Mon 27 Oct, stop the port, present from `master`, and spend the remaining days on phases 5–6 only**; parity freeze Thu 30 Oct; Sun 2 Nov is rehearsal, no code. Every phase ends with `cd web && npx tsc --noEmit && npm run lint && npm run build` green and `make check` still green for `frontend/` and `backend/`; every task additionally runs `npx vitest run`.
- Commits: conventional `type(scope): message`, scopes `web`, `video`, `deploy` (spec §12). Tests sit next to the module they test (`*.test.ts` / `*.test.tsx`); vitest (jsdom) accepts `lib/` and every pure module; canvas and UI behaviour is accepted by the scripted browser walk named in the task (chrome-devtools MCP against `make backend` + `make web`, or the same steps by hand in Chrome DevTools). No Playwright suite in this branch (spec §2).

## Review Focus

Five input classes the spec implies but no part's tests exercised. Each is pinned by a test added to the owning task (named in brackets); the per-phase review-focus lists that the parts already pinned are kept at the top of each phase section.

1. **Backend down when `/sim/` loads** (the talk's encore after the venue router restarts): `bootSim({ reel: null })` must swallow `{ok:false,status:0}` from `simSnapshot`, `topologyEdges` and `scenariosList`, leave the store at its defaults with the pill `OFFLINE`, push no toast (the pill already says it), and let the socket's back-off reconnect — never throw out of the mount effect or render a blank shell [test added to Task 4.2].
2. **A reel file truncated mid-line at EOF** (interrupted `cp`, a partial download, a `.jsonl` cut by hand): the final partial line is dropped, the reel still loads, `durationMs` is the last complete frame's `t`, and no `SyntaxError` escapes `loadReel` [test added to Task 1.8].
3. **`prefers-reduced-motion: reduce` at boot**: `particlesEnabled` must already be `false` before the first WebSocket batch (not flipped later by a settings panel that may never open), and the settings switch must render disabled with the hint; the renderer never spawns a particle in between [test added to Task 1.9; walk in Task 3.8].
4. **The canvas container at 0 × 0** (backgrounded tab, projector hot-plug, the rail drawer animating over a phone): `resizeRenderer(0, 0)` followed by a relayout must not push a `NaN`/`-Infinity` zoom into deck.gl; `fitView` returns early below a 200 × 200 px field and the pending fit runs on the next real resize [test added to Task 2.4].
5. **`navigator.clipboard` absent** (phones on the venue LAN load `http://192.168…`, which is not a secure context) and **`?peer=` naming an unknown id**: `shareMoment` falls back to `window.prompt('Copy this link', href)` and still toasts; `applyUrlMoment` ignores an unknown peer without throwing [tests added to Task 4.5].

## How to read this plan

- Tasks are numbered by phase (`0.1 … 7.7`) so the parts' cross-references stay valid. Tasks that the interfaces contract carried as its own Part B are placed where their first consumer needs them: **1.9** (actions + prefs), **2.0a** (layout + palette), **2.0b** (dither core), **3.0** (event codes), **5.0** (reel-stats script), **7.0** (contract smoke test). Two tasks are new from the self-review: **5.12** (mesh-canvas first-snapshot reveal, spec §7 loading states) and the `Provenance` card folded into **3.1**.
- Every identifier a task uses comes from the **Interfaces** section below (the contract A.1–A.24 plus the phase additions A.25–A.32 and the amendments in A.0). Where a part and the contract disagreed, A.0 states the decision; the task text below has been edited to match.
- "Accepted by" names the gate for each task: **vitest** (pure modules, static markup via `react-dom/server`, `createRoot` + `act` in jsdom) or a **browser walk** (chrome-devtools MCP tool names: `navigate_page`, `resize_page`, `take_snapshot`, `take_screenshot`, `click`, `press_key`, `fill`, `evaluate_script`, `list_network_requests`, `list_console_messages`, `emulate`, `performance_start_trace`/`performance_stop_trace`, `lighthouse_audit`; the manual equivalent is the same step in Chrome DevTools). A walk step reads "observe: …"; a task is accepted only when every observation matches.
- Terminals for walks, from `/home/yks/Projects/luminar`: `make backend` (`:8000`; variant `LUMINAR_ADMIN_TOKEN=secret make backend` for the 403 tests), `make web` (`:3000`; free the port first — another app binds `[::1]:3000` on this machine, kill the listener only: `kill $(lsof -ti TCP:3000 -sTCP:LISTEN)`), `python3 -m http.server -d web/out 9000` for the no-backend walks. Scenario launch from a shell: `curl -s -X POST localhost:8000/api/scenarios/demo_sybil_eclipse/launch -H 'Content-Type: application/json' -d '{"speed":1}'` (phases `inject_sybil` T+10, `inject_eclipse` peer-10 T+16, `clear_faults` T+24, duration 60).

---

# Interfaces

Every later task imports these names. Tag legend: **[spec §x]** copied from the design doc; **[plan]** decided here. A.0 settles the conflicts between the parts; A.25–A.32 fold in each phase's additions.


## A.0 Amendments to A.1–A.24 (conflicts between the parts, settled by the assembler)

Each line names the contract item, the decision, and the task that implements it. The task texts below already follow these.

| Contract item | Decision | Why / where |
|---|---|---|
| A.3 / A.14 `isSimPeer` | Defined once in `lib/format.ts` (`!nd.is_real && !nd.is_telemetry`); `components/map/layout.ts` re-exports it (`export { isSimPeer } from '@/lib/format'`). | The store (phase 1) needs it before `layout.ts` exists (Task 1.1, 2.0a). |
| A.8 `dispatchFrame` | Flushes pending events **before** applying a typed frame, so a newer snapshot's `time` wins over an older `ClockTick` in the same tick. | Task 1.6; phase 1 review focus 4. |
| A.10 / A.11 `playing` in reel mode | `applySnapshot` leaves `playing` untouched while `store.reel` is set; `playReel()` → `setPlaying(true)`, `pauseReel()`, end-of-reel and `loadReel()` → `setPlaying(false)`. Removes the `dispatch ↔ replay` import cycle; no `reelPlaying` stub in `dispatch.ts`. | Tasks 1.5, 1.8. |
| A.11 beat labels | `FaultInjected` → `{ label: \`${fault_type ?? 'fault'} injected\`, kind: 'fault' }`; `FaultCleared` → `{ label: \`${fault_type ?? 'faults'} cleared\`, kind: 'fault' }`; prune → `First Sybil pruned`; healed → `Mesh healed`; phase → the `ScenarioPhaseFired.label`. Captions: `First Sybil pruned by score` (kind `narrator`), `Mesh healed in N.Ns` (kind `healed`). | Task 1.5. |
| A.11 `particlesEnabled` default | The store default is `true`; `initPrefs()` (A.13) calls `setDisplay({ particlesEnabled: false })` when `reducedMotion()` before anything subscribes, so the first batch never spawns. | Task 1.9; global review focus 3. |
| A.11 `applyTelemetryStatus` | Also sets `geoAutoDone = false` when `mainnet.enabled` goes true → false (feed-off re-arms auto-Geo). | Task 1.5. |
| A.12 `runKey` | `runKey(action, arg?, manifest = REEL_MANIFEST)`; `'reel'` → `openReel(manifest[arg].name)` (no-op past the last); `'backToLive'` → `exitReel()`; `'fitView'` → renderer `fitView()`; `'escape'` → `selectPeer(null)` + `setKeyHelp(false)`; `'toggleKeyHelp'` → `setKeyHelp(!open)`. | Tasks 1.9, 2.4, 4.2. |
| A.12 `enterReel` / `exitReel` | `enterReel` sets a provisional `setReel({ name, title, durationMs: 0, durationSim: 0 })` before `loadReel`, passes an `AbortSignal`, and returns `false` without `exitReel()` when that signal aborted. `exitReel()` aborts a pending load; on a `/reels/` path it navigates to `liveHref(carryParams(location.search, ['theme','hero']))`, else `ws.connect()`. | Task 4.2. |
| A.12 auto-Geo | `initAutoGeo()` (store subscription on `[mainnet?.enabled, geoAvailable]` → `maybeAutoGeo()`) lives in `lib/actions.ts` and is mounted by `SimApp`; `ModeSwitcher` keeps only the "restore the previous layout when real nodes vanish" effect. One trigger, not two. | Task 2.7 implements; Task 4.6 pins the frame-order test. |
| A.13 `initPrefs()` | Persists and applies the DOM attributes once after the two `setPref` calls, before subscribing (storage catches up with a URL override on load). | Task 4.7. |
| A.17 `TextLayer` font | The family is the first entry of the computed `--font-mono` on `<html>` (`next/font/local` registers a hashed family such as `__IBM_Plex_Mono_abc123`); `document.fonts.load('500 10px <that family>')` gates `fontsReady`. A literal `"IBM Plex Mono"` would never load. | Tasks 0.3, 2.4, 2.5. |
| A.18 `SimApp` / `sim/page.tsx` | `SimApp` is a plain `'use client'` component rendered directly by the server pages (`/sim/page.tsx` → `<SimApp/>`, `/reels/[name]/page.tsx` → `<SimApp reel={meta}/>`); **no `SimShell`, no `dynamic(..., { ssr: false })` around it** — the toolbar and pill are server-rendered (`OFFLINE` in `out/sim/index.html`, Lighthouse). `DeckCanvas` is the only `ssr:false` import. | Tasks 1.10, 2.4, 4.3. |
| A.20 `Reticle` | Built once, in Task 2.1. The component's JSX uses `var(--paper-0)` / `var(--pitch-0)`; `RETICLE_SVG` (the cursor markup, single-quoted attributes, `width='14'`) uses the literal hex `#f2f2ef` / `#0b0b0d` because custom properties do not resolve inside a cursor data URI. Exports: `default Reticle` and named `Reticle`, `RETICLE_SVG`, `RETICLE_CURSOR`. | Task 2.1; phase 5 does not recreate it. |
| A.20 `HaloRing`, `Diamond` | Built once, in Task 3.4, as plain-React **SVG** (SSR-renderable, Remotion-safe): `HaloRing` = `<pattern>` of `<rect>` cells (one per `(cx, cy)` with `bayer(cx, cy) < BAND_DENSITY[band]`, tile `8 × cell`) filling an annulus (outer `R = size/2`, inner `0.6 R`, `fill-rule="evenodd"`) + a 1 px paper rim; new optional prop `cell?: number` (default 4; the Legend and `Glyph` pass 2). `Diamond` = `viewBox 0 0 100 100`, `<polygon points="50,0 100,50 50,100 0,50">`; grafted `fill="var(--flame)"` + a hatch `<pattern patternUnits="userSpaceOnUse" width=3 height=3 patternTransform="rotate(45)">` of 1×3 rects in `rgb(11 11 13 / .55)` (`--hatch`), id from `useId`; pruned `fill="none" stroke="var(--paper-3)" stroke-width="1" stroke-dasharray="3 2" vector-effect="non-scaling-stroke"`. Never a `<canvas>`. | Task 3.4 (tests from phase 5 moved there); Tasks 5.1, 5.11 consume. |
| A.21 `scripts/reel-stats.mjs` | Lands as Task 5.0 (first consumer is the landing); it requires `web/public/reels/sybil-eclipse.jsonl`, copied in Task 4.1. Phase 5 extends it with `computeCard` (A.30). | Tasks 5.0, 5.4. |
| A.22 outputs | Social renders go to `web/video-out/` (gitignored), not `web/out/` — `next build` with `output:'export'` wipes `web/out`. The landing mp4 + poster still land in `public/video/`. `remotion/index.ts` is the entry (`Config.setEntryPoint`). | Task 6.1. |
| A.24 vitest config | `include: ['**/*.test.{ts,tsx}']`, `esbuild: { jsx: 'automatic' }`, `environment: 'jsdom'`, alias `@` → `web/`; written once in Task 0.1 (phase 2's `.test.tsx` files depend on it). Tests import `test`/`expect` from `'vitest'` explicitly (no `globals: true`). | Task 0.1. |
| A.24 Makefile after the swap | `install` (`uv sync --all-extras` + `cd web && npm ci`), `dev` (backend :8000 + web :3000), `typecheck` (`cd web && npx tsc --noEmit`), `build` (`cd web && npm run build`), `check: lint test web-check build`, `clean` (`rm -rf web/out web/.next`); target `frontend` removed; `web*` targets unchanged. | Task 7.2. |
| Part B Task 1 Step 3 | No-op: phase 0 installs vitest + jsdom, writes `vitest.config.ts`, the `test`/`test:watch` scripts, the Makefile `web-test`/`web-check` targets and the CI vitest step. | Task 0.1, 0.4. |


Every later plan imports these names. Tag legend: **[spec §x]** copied from the design doc; **[plan]** decided here.

## A.1 Directory tree

Verbatim from spec §4.1 **[spec §4.1]**:

```
web/
  next.config.ts          output:'export', trailingSlash:true, images.unoptimized:true, dev rewrites /api → :8000
  app/
    layout.tsx            fonts (next/font/local), <html data-theme="dark">, globals.css
    globals.css           = docs/design/tokens.css verbatim + base/layout rules (§4.3)
    page.tsx              /            landing (server component + client islands)
    sim/page.tsx          /sim/        shell (server) → <SimApp/> (client, dynamic, ssr:false)
    reels/[name]/page.tsx /reels/<n>/  generateStaticParams from public/reels/manifest.json
    figure/page.tsx       /figure/     the colorfigure alone, full bleed, for screenshots
    not-found.tsx
  components/
    sim/                  SimApp, Toolbar, CommandStrip, StatsRail, LogRail, Inspector, Legend,
                          Narrator, Ticker, ModeSwitcher, Provenance, Toasts, Menus, KeyHelp
    map/                  DeckCanvas.tsx (owns <canvas>), renderer.ts, layout.ts, atlas.ts, palette.ts
    dither/               DitherCanvas.tsx, dither.ts (Bayer 8×8), HaloRing, Diamond, Stamp, Figure, Loupe, Reticle
    landing/              Nav, Hero, Readouts, Sections, VideoPlate, FigurePlate, Footer
  lib/
    store.ts              zustand 5
    api/                  client.ts, websocket.ts, replay.ts (ported ~1:1)
    copy.ts               the honesty sentences, once
    types.ts, format.ts, keys.ts
  remotion/               Root.tsx, Launch.tsx, timeline.ts, scenes/, mesh/, type/, layers/ (§9)
  figures/sorter/         figure.html + core.js (colorfigures source, §8)
  public/
    reels/                copied from frontend/public/reels at phase 4
    geo/land-110m.json
    fonts/*.woff2         copied once from the fontsource packages
    figures/sorter.html   built single-file colorfigure
    video/launch-16x9.mp4 rendered launch cut for the landing (§9)
  package.json, package-lock.json, tsconfig.json, eslint.config.mjs, remotion.config.ts
```

Additions **[plan]** (files, not new directories, except `scripts/`):

| Path | Role |
|---|---|
| `web/lib/api/dispatch.ts` | one frame router shared by the live socket and the reel player (replaces `ws.dispatch`) |
| `web/lib/actions.ts` | the async store actions that call the API or the reel player (spec §4.4's "CustomEvents become store actions"; kept out of `store.ts` so the store stays pure and unit-testable) |
| `web/lib/prefs.ts` | `luminar.prefs` localStorage + URL mirror + `data-stage`/`data-hero` on `<html>` |
| `web/lib/event-codes.ts` | `TYPE_CODES`, filter groups, row detail builders (shared by LogRail and Inspector) |
| `web/lib/reel-stats.json`, `web/lib/plate-frames.json` | outputs of `scripts/reel-stats.mjs`, committed |
| `web/scripts/reel-stats.mjs` | build script (spec §6.1 items 3–4) |
| `web/vitest.config.ts` | `environment: 'jsdom'`, `include: ['**/*.test.ts']`, alias `@` → `web/` |
| `web/**/*.test.ts` | tests sit next to the module they test |
| `web/components/dither/*.tsx` | the seven components of §4.1 are `.tsx`: `DitherCanvas.tsx HaloRing.tsx Diamond.tsx Stamp.tsx Figure.tsx Loupe.tsx Reticle.tsx` |
| `web/remotion/fonts.css`, `web/remotion/props.ts` | `@font-face` from `public/fonts`; zod schema (spec §9) |

Path alias **[plan]**: `tsconfig.json` `"paths": {"@/*": ["./*"]}`; imports are `@/lib/store`, `@/components/map/renderer`.

## A.2 `lib/types.ts`

Derived from `frontend/src/types.ts` and the backend producers listed in the header. Names kept from today unless noted.

```ts
export type LayoutMode = 'force' | 'radial' | 'geo'                                   // [spec §6.2]
export type SimState = 'running' | 'paused' | 'stopped'
export type NodeState = 'idle' | 'origin' | 'receiving' | 'decoded' | 'error' | 'joining' | 'failed' | 'attacker'
export type EventCategory = 'gossip' | 'connection' | 'stream' | 'dht' | 'fault' | 'health' | 'clock' | 'simulation' | 'live'

export interface PeerNode {                       // snapshot.nodes[] (engine.get_snapshot + _merge_real_peers)
  peer_id: string; index: number; state: NodeState
  connected_peers: string[]
  last_targets?: string[]                         // attackers only: victims at injection time
  is_real?: boolean; is_telemetry?: boolean
  client?: string; country?: string; city?: string; seen_ms?: number | null
  x: number; y: number
  messages_sent: number; messages_received: number; gossip_score: number
}

export type Edge = [string, string]
export type LayoutEdge = [string, string] | [string, string, true]   // third = weak tether [plan: moved here from layout.ts]

export interface AppEvent {                        // text frames; no `type` field (events/types.py to_dict)
  at: number; event_type: string; category: EventCategory
  peer_id?: string; from_peer?: string; to_peer?: string
  msg_id?: string; msg_ids?: string[]; topic?: string; hops?: number
  latency_ms?: number; via?: 'mesh' | 'iwant' | 'spam'; dropped?: boolean
  fault_type?: string; fault_id?: string; target?: string; params?: Record<string, unknown>; count?: number
  reason?: string; speed?: number; state?: string; label?: string; action?: string
  initiator?: string; score?: number
  slot?: number; block_root?: string; seen_ms?: number; client?: string; country?: string; first?: boolean
  [key: string]: unknown
}

export interface SnapshotFrame {
  type: 'snapshot'; state: SimState; time: number; speed: number
  node_count: number; event_count: number; nodes: PeerNode[]
  gossip?: { mesh_size?: number; mesh?: Record<string, string[]> }   // mesh is {} above 100 nodes
}
export interface MetricsFrame {
  type: 'metrics'; node_count: number; state_distribution: Record<string, number>
  total_messages_sent: number; total_messages_received: number
  event_counts: Record<string, number>; total_events: number
  stream_manager: { open: number; max: number; available: number }
  dht_coordinator: { active: number; available: number }
}
export interface CdfPoint { percentile: number; latency_ms: number }
export interface AnalyticsFrame {
  type: 'analytics'; total_messages: number; avg_delivery_ratio: number; avg_propagation_ms: number
  avg_hops: number; avg_duplicates?: number; recent_delivery_ratio?: number
  delivery_ratios: { msg_id: string; ratio: number }[]; latency_cdf: CdfPoint[]
  mesh_stability: { avg_degree?: number; min_degree?: number; max_degree?: number }   // {} before the first message
}
export interface TelemetryPeer { peer_id: string; node_name: string; network: string; last_seen: number; age_seconds: number; cpu: number; best_block: number }
export interface MainnetStatus {
  enabled: boolean; observers: number
  slot?: number; block_root?: string; rows?: number; with_geo?: number
  first_ms?: number | null; p50_ms?: number | null; max_ms?: number | null
  first_client?: string; first_country?: string; lag_s?: number; fetched_at?: number
}
export interface TelemetryStatusFrame { type: 'telemetry_status'; active: boolean; peer_count: number; peers: TelemetryPeer[]; mainnet?: MainnetStatus; otel?: unknown }
export interface EdgesFrame { type: 'edges'; edges: Edge[] }
export interface ScenarioPhase { at: number; label: string; action: string }
export interface ScenarioDefinition { id: string; name: string; description: string; icon: string; topology_type: string; phases: ScenarioPhase[]; duration: number }
export interface ScenarioStatus {
  active: boolean; scenario: ScenarioDefinition | null
  phase_idx?: number; total_phases?: number; next_phase_at?: number | null; next_phase_label?: string | null
  completed_phases?: string[]; all_phases_done?: boolean
}
export type ScenarioFrame = ScenarioStatus & { type: 'scenario' }
export interface GapFrame { type: 'gap'; dropped: number }
export type TypedFrame = SnapshotFrame | MetricsFrame | AnalyticsFrame | TelemetryStatusFrame | EdgesFrame | ScenarioFrame | GapFrame
export type WsFrame = TypedFrame | AppEvent
export function isTypedFrame(f: WsFrame): f is TypedFrame     // 'type' in f && typeof f.type === 'string'

export interface ReelMeta { name: string; title: string; file: string; nodes?: number; blurb?: string; real?: boolean }   // manifest.json entry
export type ReelManifest = ReelMeta[]
export interface ReelFrame { t: number; frame: WsFrame }       // one JSONL line
export interface ReelState { name: string; title: string; durationMs: number; durationSim: number }

export interface ActiveFault { id: string; type: string; [key: string]: unknown }   // kept for FaultInjected.params typing; /api/fault/active wrapper is dropped

export interface Toast { id: number; text: string; kind: 'ok' | 'fail' | 'info'; at: number }        // [spec §4.4 toasts queue]
export type BeatKind = 'phase' | 'prune' | 'healed' | 'fault'
export interface Beat { label: string; time: number; kind: BeatKind }                                  // [spec §4.4 beats replace milestones; plan: kind not colour]
export interface Caption { text: string; kind: 'phase' | 'narrator' | 'healed'; at: number; seq: number }  // [plan] seq restarts the drain bar
export interface Scale { node: number; particle: number; edgeAlpha: number }
export interface AnalyticsSample { t: number; delivery: number; propagationMs: number; hops: number; degree: number }  // [plan] sparkline sample
export type ScoreBand = 0 | 1 | 2 | 3                                                                  // [spec §6.2 render table]
export type ConnectionPill = 'offline' | 'live' | 'reel'
export type RGBA = [number, number, number, number]
```

## A.3 `lib/format.ts` **[plan]** (ported from `frontend/src/format.ts`, `events-panel.ts`, `renderer.ts`, `charts/sparkline.ts`)

```ts
export function formatTime(seconds: number): string        // '12.3s' under 60, 'm:ss' after; round before splitting
export function formatNumber(n: number): string            // 1.2K / 1.2M
export function fmtCount(n: number): string                // '1,284' under 10k else formatNumber
export function fmtLatency(ms: number): string             // '190ms' / '1.2s'
export function signed(v: number): string                  // '+1.00' / '-0.25'
export function shortName(node: { peer_id: string; index: number }): string   // 'n12' for peer-*, raw id otherwise
export function shortId(id: string): string                // 'peer-7' → 'n7'; others unchanged
export function isAttackerId(id: string): boolean          // sybil-* | eclipse-*
export function isPruned(node: Pick<PeerNode, 'state' | 'connected_peers'>): boolean   // attacker with no connected_peers
export function cdfStats(pts: CdfPoint[]): { min: number; max: number; p50: number }
```

## A.4 `lib/copy.ts` **[spec §2, §4.10, §6.1, §6.2; strings verbatim]**

```ts
export const MECHANISM = 'Same mechanism, toy constants.'
export const RECORDINGS = 'reproducible recordings'                                   // plural form for blurbs
export const RECORDING_NOT_RUN = 'reproducible recording, not an identical run'       // readout 4 sub-caption
export const ARRIVAL = 'arrival at observer nodes, ~2.5 min behind'
export const PROVENANCE = 'arrival at observer nodes, not mesh paths · data: ethPandaOps (CC BY 4.0)'
export const MESH_HIDDEN = 'gossip mesh · hidden above 100 peers (backend sends none)'
export const SCRUB_LIVE = 'scrubbing rewinds recordings only; the live clock cannot rewind'
export const ECLIPSE_WHY = 'silent attackers send nothing invalid, so P4 never fires; only the P3 deficit, floored at −0.25'
export const SAME_NAMES = 'the metric names Lighthouse emits'
export const REEL_GUARD = 'Press 0 to leave the reel first'
export const geoOnly = (back: 'force' | 'radial') => `Geo shows real observers only — switched to ${back}`
export const FIG1 = 'Fifty peers, five Sybils grafted at once. P4 scoring prunes them in two heartbeats.'
export const FIG2 = 'Same mechanism, toy constants.'
export const FIG3 = 'Fifty-seven seconds: one publish, five Sybils, one eclipse, one heal.'
export const EVENT_LINE = 'Devcon 8 · Mumbai · 3–6 Nov 2026'
export const REPO_URL = 'github.com/yashksaini-coder/luminar'
/** Phrases that may appear nowhere but this file (spec §4.10 grep). */
export const FORBIDDEN = ['identical run', "beacon node's scoring", 'the scoring your beacon node runs', 'mesh path'] as const
```

`web/lib/copy.test.ts` greps `app/`, `components/`, `lib/`, `remotion/` for `FORBIDDEN` and allows only `lib/copy.ts`.

## A.5 `lib/keys.ts` **[spec §6.2 Keyboard; inventory §2]**

```ts
export type KeyAction =
  | 'togglePlay' | 'fitView' | 'escape' | 'reel' | 'backToLive' | 'share'
  | 'toggleStage' | 'toggleHero' | 'reset' | 'toggleKeyHelp'
export interface KeyBinding { key: string; action: KeyAction; label: string; arg?: number }
export const KEY_BINDINGS: readonly KeyBinding[] = [
  { key: ' ',      action: 'togglePlay',    label: 'play / pause' },
  { key: 'f',      action: 'fitView',       label: 'fit view' },
  { key: 'Escape', action: 'escape',        label: 'deselect / close' },
  { key: '1'..'9', action: 'reel',          label: 'open recording N', arg: N - 1 },   // nine entries
  { key: '0',      action: 'backToLive',    label: 'back to live' },
  { key: 's',      action: 'share',         label: 'copy link to this moment' },
  { key: 't',      action: 'toggleStage',   label: 'stage theme' },
  { key: 'h',      action: 'toggleHero',    label: 'hero layout' },
  { key: 'r',      action: 'reset',         label: 'reset' },
  { key: '?',      action: 'toggleKeyHelp', label: 'this list' },
]
export function isTypingTarget(t: EventTarget | null): boolean
  // TEXTAREA, SELECT, contenteditable, or INPUT whose type !== 'range'
export function actionForKey(e: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'altKey' | 'target'>): { action: KeyAction; arg?: number } | null
  // null when isTypingTarget(e.target) or ctrl/meta/alt held (shift is allowed: '?' needs it)
export const KBD_HINT = 'SPACE play · F fit · T stage · H hero · ? keys'          // [spec §6.2 hint row]
```

Menus (arrow keys, Enter, Escape) are handled inside `components/sim/Menus.tsx`, not here.

## A.6 `lib/event-codes.ts` **[plan; values from `frontend/src/ui/events-panel.ts`]**

```ts
export type Tone = 'fg' | 'fg2' | 'fg3' | 'ok' | 'alarm'        // ok → --signal, alarm → --flame; never a colour string
export const TYPE_CODES: Record<string, { code: string; tone: Tone }>   // 23 entries as today: gm fg2 · gf ok · gp alarm · ih fg3 · iw fg3 · cn fg2 · dc alarm · so fg2 · sc fg3 · st alarm · sb fg3 · ds fg3 · dd fg3 · df alarm · dr fg3 · fi alarm · fc ok · pr ok · hs fg3 · bs ok · ck fg3 · ss fg3 · sp fg
export const DEFAULT_TYPE = { code: '??', tone: 'fg3' } as const
export const FILTER_GROUPS: readonly [label: string, cat: EventCategory][]   // Gossip Conn Stream DHT Fault Health Clock Sim Live
export const DEFAULT_OFF: ReadonlySet<EventCategory>   // {'clock'}
export function formatNode(evt: AppEvent): string     // shortId(peer_id ?? from_peer) | 'net' | 'sim' | '—'
export function buildDetail(evt: AppEvent): string    // per-type detail as today (events-panel.ts buildDetail)
export function inspectorDetail(evt: AppEvent): string // prune reason · ih/iw '<n> ids' · gm 'spam' | msg_id
```

## A.7 `lib/api/client.ts` **[spec §3, §4.9; inventory §4.1]**

```ts
export const API_BASE: string = process.env.NEXT_PUBLIC_API_URL ?? ''      // [spec §4.2] build-time; '' in the container
export interface ApiResult<T> { ok: boolean; status: number; data: T | null }   // status 0 = network error / no response
export const TOKEN_KEY = 'luminar.token'                                         // [inventory §3]
export function adminToken(): string | null                 // localStorage[TOKEN_KEY], try/catch
export function setAdminToken(token: string | null): void   // Legend settings field [spec §6.2]
export async function get<T>(path: string): Promise<ApiResult<T>>            // never throws
export async function post<T>(path: string, body?: unknown): Promise<ApiResult<T>>
  // headers: 'Content-Type: application/json' only when body != null; 'X-Luminar-Token' only when adminToken() is non-empty
export async function getStatic<T>(path: string): Promise<T | null>          // frontend origin: API_BASE is NOT prepended (reels, manifest, geo)
export function toastFor(r: ApiResult<unknown>, label: string): Pick<Toast, 'text' | 'kind'>
  // ok → {`${label} injected`,'ok'} · status 0 → {'backend offline','fail'} · else {`${label} failed · ${status}`,'fail'}

// Typed wrappers (kept). Dropped per spec §4.9: topologyMetrics, metricsSnapshot, eventsRecent,
// gossipMesh/Scores/Analytics, faultActive, scenarioActive; and simSeek (live seek is never called, spec §6.2).
export const simSnapshot   = () => get<SnapshotFrame>('/api/sim/snapshot')          // response lacks `type`; cast
export const simPlay       = () => post<{ state: string }>('/api/sim/play')
export const simPause      = () => post<{ state: string }>('/api/sim/pause')
export const simReset      = () => post<{ state: string }>('/api/sim/reset')
export const simSpeed      = (speed: number) => post<{ speed: number }>('/api/sim/speed', { speed })
export const simReconfigure= (n_nodes: number) => post<{ n_nodes: number; edge_count: number }>('/api/sim/reconfigure', { n_nodes })
export const topologyEdges = () => get<{ edges: Edge[] }>('/api/topology/edges')
export const scenariosList = () => get<{ scenarios: ScenarioDefinition[] }>('/api/scenarios')
export const scenarioLaunch= (id: string, speed = 1) => post<{ status: string }>(`/api/scenarios/${encodeURIComponent(id)}/launch`, { speed })
export const faultPartition= (group_a: string[], group_b: string[]) => post<{ ok: boolean; fault_id: string }>('/api/fault/partition', { group_a, group_b })
export const faultSybil    = (n_attackers: number) => post<{ ok: boolean; fault_id: string }>('/api/fault/sybil', { n_attackers, target_topic: 'lumina/blocks/1.0' })
export const faultEclipse  = (target_peer_id: string, n_attackers = 4) => post<{ ok: boolean; fault_id: string }>('/api/fault/eclipse', { target_peer_id, n_attackers })
export const faultDrop     = (peer_id: string) => post<{ ok: boolean; fault_id: string }>('/api/fault/drop', { peer_id })
export const faultClearAll = () => post<{ ok: boolean; cleared: number }>('/api/fault/clear-all')
export const liveMainnet   = (enabled: boolean) => post<MainnetStatus>('/api/live/mainnet', { enabled })
```

## A.8 `lib/api/dispatch.ts` **[plan]** — one router for live and reel frames

```ts
export function dispatchFrame(frame: WsFrame): void
  // typed → store.applySnapshot/applyMetrics/applyAnalytics/applyTelemetryStatus/applyEdges/applyScenario/applyGap
  // untyped (event) → pending batch
export function flushEvents(): void                      // if batch non-empty: store.applyEvents(batch) once, then every subscriber(batch)
export function subscribeEvents(cb: (batch: AppEvent[]) => void): () => void   // renderer registers particle spawning here
export function pendingEventCount(): number              // tests
```

## A.9 `lib/api/websocket.ts` **[spec §3, §4.2; inventory §4.2; ported from `frontend/src/api/websocket.ts`]**

```ts
export const BATCH_MS = 50
export const RECONNECT_MIN_MS = 1000
export const RECONNECT_MAX_MS = 10_000        // delays: 1000, 2000, 4000, 8000, 10000, 10000, …; reset to 1000 on open
export function wsUrl(loc: Pick<Location, 'protocol' | 'host' | 'port'> = location): string
  // API_BASE set → API_BASE with http(s)→ws(s) + '/ws/events'
  // else loc.port === '3000' → (process.env.NEXT_PUBLIC_WS_URL ?? 'ws://localhost:8000') + '/ws/events'
  // else `${loc.protocol === 'https:' ? 'wss:' : 'ws:'}//${loc.host}/ws/events`
export const ws: {
  connect(): void        // single-socket invariant: no-op while a socket is CONNECTING or OPEN; clears `closed`
  disconnect(): void     // sets closed, cancels reconnect + batch timers, flushEvents(), closes socket, store.setConnected(false)
  connected(): boolean
}
// onopen → store.setConnected(true), batch timer setInterval(flushEvents, BATCH_MS)
// onmessage → string: JSON.parse → dispatchFrame; Blob: .text() then same; ArrayBuffer: TextDecoder then same
// onclose → store.setConnected(false), stop batch timer, flushEvents(), scheduleReconnect() unless closed
// handlers of a superseded socket (sock !== current) return early
```

## A.10 `lib/api/replay.ts` **[spec §4.9, §6.4; inventory §10; ported from `frontend/src/api/replay.ts`]**

```ts
export const REEL_TICK_MS = 50              // setInterval, survives background tabs
export const REEL_MIN_SPEED = 0.1
export const SEEK_STATE_TYPES = ['edges', 'scenario', 'telemetry_status', 'snapshot', 'metrics', 'analytics'] as const
export async function loadReel(meta: ReelMeta, opts?: { signal?: AbortSignal }): Promise<boolean>
  // fetch(meta.file) (frontend origin); reads response.body with getReader() + TextDecoder({stream:true});
  // splits on '\n', carries the partial tail across chunks; JSON.parse per line, malformed lines skipped;
  // store.setReelLoad({ loaded: bytesRead, total: Number(content-length) || 0 }) at most every 100 ms;
  // PRIMING: when the first snapshot is parsed, dispatchFrame the latest edges + scenario + that snapshot and
  //   flushEvents() so the mesh renders before the file finishes (7 MB mainnet reel);
  // on end: stopReel() (keeps the parsed frames), store.setReel({ name, title, durationMs, durationSim: last snapshot.time }),
  //   store.resetRun(), seekReel(firstSnapshot.t), store.setReelLoad(null); returns false on fetch failure or zero frames
export function playReel(): void            // from the end → seekReel(0) first; elapsed is wall-clock × speed
export function pauseReel(): void
export function toggleReel(): void
export function setReelSpeed(s: number): void    // max(REEL_MIN_SPEED, s)
export function seekReel(ms: number, opts?: { eventTailMs?: number }): void
  // clamp to [0, durationMs]; dispatch the last frame of each SEEK_STATE_TYPES with t ≤ ms in that order; events skipped,
  // except events with t in (ms − eventTailMs, ms] which are dispatched when eventTailMs > 0 (default 0; phase 4 may pass 2000)
export function seekReelToSimTime(sec: number): void   // first snapshot with time ≥ sec, else durationMs
export function stopReel(): void            // pause, cursor 0, elapsed 0, frames kept until next loadReel; store.setReel(null) is the caller's job (exitReel)
export function unloadReel(): void          // stopReel + frames = []
export function reelLoaded(): boolean; reelDurationMs(): number; reelElapsedMs(): number; reelPlaying(): boolean
export function parseReelChunk(text: string, carry: string): { frames: ReelFrame[]; carry: string }   // pure; tested
// step(now): dispatch all frames with t ≤ elapsed, flushEvents(); at the end: pauseReel() + store.setPlaying(false)
// Guards [spec §6.4]: in reel mode applySnapshot ignores snapshot.state/speed and applyEvents ignores SimulationStateChanged
```

## A.11 `lib/store.ts` **[spec §4.4; inventory §4.3]** — zustand 5, `create<AppStore>()`

```ts
export const MAX_EVENTS = 2000           // ring cap (field dropped; constant)
export const MAX_SAMPLES = 60            // analyticsHistory [spec §6.2 "last 60 analytics frames"]
export const SCORE_HISTORY = 50          // inspector sparkline [spec §6.2]
export const STAGE_SCALE: Scale = { node: 1.4, particle: 1.8, edgeAlpha: 1.6 }   // [spec §6.3]
export const BASE_SCALE: Scale  = { node: 1, particle: 1, edgeAlpha: 1 }

export interface AppState {
  // connection                                   default
  connected: boolean                              // false
  // simulation
  simState: SimState                              // 'stopped'
  simTime: number                                 // 0
  simSpeed: number                                // 1
  nodeCount: number                               // 0
  eventCount: number                              // 0
  playing: boolean                                // false
  // graph (positions live in renderer.ts, not here)  [spec §4.4]
  nodes: PeerNode[]                               // []
  nodeById: ReadonlyMap<string, PeerNode>         // new Map()   [plan] rebuilt per snapshot
  edges: Edge[]                                   // []
  mesh: Record<string, string[]>                  // {}
  layoutMode: LayoutMode                          // 'force'
  geoAvailable: boolean                           // false  [plan] = nodes.some(n => !isSimPeer(n)), set per snapshot
  layoutBeforeGeo: LayoutMode | null              // null   (auto-Geo restore)
  geoAutoDone: boolean                            // false  (auto-Geo once per feed-on)
  // selection by id                              [spec §4.4]
  selectedPeer: string | null                     // null
  hoveredPeer: string | null                      // null
  highlightPeers: string[]                        // []
  scoreHistory: { t: number; v: number }[]        // []  last SCORE_HISTORY samples of selectedPeer.gossip_score, one per snapshot
  // events
  events: AppEvent[]                              // []  ring, MAX_EVENTS
  droppedEvents: number                           // 0   [spec §4.4 displayed]
  // scenarios / reels / live
  scenarios: ScenarioDefinition[]                 // []
  activeScenario: ScenarioStatus | null           // null
  reel: ReelState | null                          // null
  reelLoad: { loaded: number; total: number } | null   // null  [plan] dithered progress bar
  mainnet: MainnetStatus | null                   // null
  telemetry: { active: boolean; peerCount: number }    // { active: false, peerCount: 0 }  [spec §13.2 badge only]
  // metrics (2 s)
  stateDistribution: Record<string, number>       // {}
  totalMessagesSent: number                       // 0
  totalMessagesReceived: number                   // 0
  eventCounts: Record<string, number>             // {}
  streamManager: { open: number; max: number; available: number }   // { 0, 64, 64 }
  dhtCoordinator: { active: number; available: number }             // { 0, 8 }  (UI reads `available`, never a literal 8)
  gossipAnalytics: AnalyticsFrame | null          // null
  analyticsHistory: AnalyticsSample[]             // []  cap MAX_SAMPLES
  // narrator                                      [plan] latches moved from ui/narrator.ts
  beats: Beat[]                                   // []
  caption: Caption | null                         // null
  phaseLabel: string                              // ''
  invalidCount: number                            // 0   GossipMessage with msg_id 'spam-*'
  narrator: { firstSybilPrunedAt: number | null; healStartAt: number | null; healedAnnounced: boolean }   // nulls/false
  // duration                                      [inventory §6 pause-at-limit]
  maxDuration: number                             // 300
  durationStep: number                            // 300
  // display
  particlesEnabled: boolean                       // true (false when prefers-reduced-motion at boot)
  showLabels: boolean                             // true
  showEdges: boolean                              // true
  allLabels: boolean                              // false  [spec §6.2 "All labels ≤ 50 nodes"]
  stageTheme: boolean                             // false
  hero: boolean                                   // false
  scale: Scale                                    // BASE_SCALE (STAGE_SCALE when stageTheme)
  // ui
  toasts: Toast[]                                 // []
  keyHelpOpen: boolean                            // false
}

export interface AppActions {
  // frame appliers (called only from dispatch.ts); each is ONE setState and writes only fields whose value changed
  applySnapshot(f: SnapshotFrame): void
    // nodes, nodeById, mesh, nodeCount, eventCount, simTime, geoAvailable; simState/simSpeed/playing only when !reel;
    // playing = reel ? reelPlaying() : state==='running'; selectedPeer → null if its id vanished (highlightPeers [] too);
    // scoreHistory push when selectedPeer; BlockSeen-lit states already applied by applyEvents are overwritten by the frame
  applyMetrics(f: MetricsFrame): void
  applyAnalytics(f: AnalyticsFrame): void         // + analyticsHistory sample (only when total_messages > 0) + heal latch → beat/caption
  applyTelemetryStatus(f: TelemetryStatusFrame): void   // telemetry {active, peerCount}; mainnet = f.mainnet ?? null (auto-Geo handled by setLayoutMode caller in actions)
  applyEdges(f: EdgesFrame): void
  applyScenario(f: ScenarioFrame): void           // activeScenario; maxDuration = scenario.duration when active & > 0; resets narrator latches + beats + caption
  applyGap(f: GapFrame): void                     // droppedEvents += dropped
  applyEvents(batch: AppEvent[]): void
    // events ring; eventCount += n; simTime from the last ClockTick in the batch (if any);
    // live only: SimulationStateChanged → simState/simSpeed/playing; BlockSeen → node state origin/decoded + seen_ms (new nodes array only if any BlockSeen);
    // narrator: ScenarioPhaseFired → phaseLabel + caption('phase') + beat('phase'); first GossipPrune reason=score to sybil-* → caption + beat('prune');
    //   spam-* → invalidCount; FaultCleared → healStartAt; FaultInjected → beat('fault')
  setConnected(v: boolean): void
  setPlaying(v: boolean): void
  // selection
  selectPeer(id: string | null, highlight?: string[]): void   // clears scoreHistory when id changes; highlight default []
  hoverPeer(id: string | null): void
  // layout
  setLayoutMode(mode: LayoutMode, opts?: { remember?: boolean }): void
    // 'geo' without geoAvailable → 'force'; drops a selection not visible in the new mode; remember=true stores layoutBeforeGeo
  // playback / duration
  setDuration(maxDuration: number, step?: number): void
  extendDuration(): void                          // maxDuration = simTime + durationStep (Play at the limit)
  // reels
  setReel(r: ReelState | null): void
  setReelLoad(p: { loaded: number; total: number } | null): void
  // prefs & display
  setPref(key: 'stageTheme' | 'hero', value?: boolean): void   // toggle when omitted; scale follows stageTheme
  setDisplay(p: Partial<Pick<AppState, 'particlesEnabled' | 'showLabels' | 'showEdges' | 'allLabels'>>): void
  // ui
  pushToast(text: string, kind?: Toast['kind']): number        // returns id; Toasts.tsx removes after 2000 ms
  dismissToast(id: number): void
  setKeyHelp(open: boolean): void
  setCaption(c: Omit<Caption, 'seq'> | null): void
  // reset (what Reset ⟲ and loadReel clear)
  resetRun(): void   // events [], eventCount 0, droppedEvents 0, selectedPeer null, highlightPeers [], scoreHistory [], beats [], caption null, phaseLabel '', invalidCount 0, narrator latches, analyticsHistory [], simTime 0
}
export type AppStore = AppState & AppActions
export const useStore: UseBoundStore<StoreApi<AppStore>>     // create<AppStore>()(...)

// selectors (components never call useStore() without one) [spec §4.4]
export const selectTimelineTotal = (s: AppState) => s.reel ? s.reel.durationSim : s.maxDuration
export const selectPill = (s: AppState): ConnectionPill => s.reel ? 'reel' : s.connected ? 'live' : 'offline'
export const selectSelectedNode = (s: AppState) => s.selectedPeer ? s.nodeById.get(s.selectedPeer) : undefined
export const selectHoveredNode  = (s: AppState) => s.hoveredPeer ? s.nodeById.get(s.hoveredPeer) : undefined
export const selectAttackers = (s: AppState) => s.nodes.filter(n => n.state === 'attacker')   // use with useShallow
export const selectPrunedCount = (s: AppState) => s.nodes.reduce((k, n) => k + (isPruned(n) ? 1 : 0), 0)
export const selectStateCounts = (s: AppState): Record<string, number>   // stateDistribution + pruned, attacker −= pruned
export const selectKpis = (s: AppState): { delivery: number | null; propagationMs: number | null; hops: number | null; degree: { avg: number; min: number; max: number } | null }   // null before total_messages > 0; delivery prefers recent_delivery_ratio
export const selectHasMessages = (s: AppState) => (s.gossipAnalytics?.total_messages ?? 0) > 0
export const selectCanGeo = (s: AppState) => s.geoAvailable
```

Rules **[spec §4.4]**: never `useStore()` without a selector; node arrays only via `useShallow` in panels that list them; per-frame data no DOM reads (`nodePositions`, particles, atlas) lives in `renderer.ts`; the WS batch handler calls `setState` once per batch; 20 Hz frames write only the fields that changed (Task 1.5's test asserts referential stability of every untouched field).

## A.12 `lib/actions.ts` **[plan; semantics from `frontend/src/app.ts`, `ui/playback.ts`]** — the nine `luminar:*` events as functions

```ts
export function reelGuard(): boolean                 // reel → pushToast(REEL_GUARD, 'info'), true
export function leaveGeoForSim(): void               // geo → setLayoutMode(layoutBeforeGeo ?? 'force') + toast geoOnly(back)
export async function fetchTopology(): Promise<void> // simSnapshot + topologyEdges in parallel; applyEdges then applySnapshot
export async function fetchScenarios(): Promise<void>
export async function togglePlay(): Promise<void>    // reel: toggleReel + setPlaying; live: pause → simPause; play → extendDuration() if at limit, simPlay
export async function reset(): Promise<void>         // reel: pauseReel + seekReelToSimTime(0) + setPlaying(false); live: leaveGeoForSim, simReset, resetRun, applyScenario-like narrator reset
export async function setSpeed(speed: number): Promise<void>     // store.simSpeed; reel setReelSpeed else simSpeed POST
export function seekTo(simSec: number): void         // reels only; live callers never reach this (scrubber disabled) [spec §6.2]
export function autoPauseIfDue(): void               // live, playing, simTime ≥ maxDuration > 0 → simPause + setPlaying(false)
export async function launchScenario(id: string): Promise<void>  // reelGuard → leaveGeoForSim → scenarioLaunch(id, simSpeed) → fetchTopology; toast on failure
export type FaultKind = 'partition' | 'sybil' | 'eclipse' | 'drop' | 'clear-all'
export async function injectFault(kind: FaultKind, opts?: { n?: number }): Promise<void>
  // reelGuard → leaveGeoForSim → post → pushToast(toastFor(r, label)); labels: 'Partition' 'Sybil ×N' `Eclipse on ${shortName}` `Drop ${shortName}` 'Clear all';
  // partition groups: visible sim peers with x < median x (from renderer.visiblePositions()) vs the rest [spec §6.2];
  // sybil n default 5 (1–10); eclipse/drop require selectedPeer that isSimPeer, else no call
export async function setNodePreset(n: 20 | 50 | 100 | 200): Promise<void>   // reelGuard, leaveGeoForSim, simReconfigure, renderer.resetTopology(), fetchTopology
export function setDurationPreset(sec: 60 | 120 | 300 | 600): void          // reelGuard, setDuration(sec, sec)
export async function toggleMainnet(): Promise<void>  // reelGuard; liveMainnet(!enabled); fail → 'backend offline'; ok → store.applyTelemetryStatus-like mainnet set + maybeAutoGeo()
export function maybeAutoGeo(): void                  // mainnet.enabled && geoAvailable && !geoAutoDone → setLayoutMode('geo', {remember:true})
export async function enterReel(meta: ReelMeta): Promise<boolean>   // ws.disconnect(); mainnet null; renderer.resetTopology(); loadReel; false → exitReel()
export function exitReel(): void                      // unloadReel; setReel(null); mainnet null; renderer.resetTopology(); ws.connect()  — on /reels/<n>/ the page navigates to /sim/ instead [spec §6.4]
export function shareMoment(): Promise<void>          // syncUrlMoment(); clipboard.writeText(location.href) → toast 'Link copied'; fallback window.prompt
export function syncUrlMoment(): void                 // ?peer= always; ?t= only while reel && !playing
export function applyUrlMoment(q: URLSearchParams): void   // t → seekReelToSimTime; peer → selectPeer if known
export function runKey(action: KeyAction, arg?: number, manifest?: ReelManifest): void   // dispatch table for keys.ts
```

## A.13 `lib/prefs.ts` **[spec §4.8; inventory §3, §9]**

```ts
export const PREFS_KEY = 'luminar.prefs'
export interface Prefs { stageTheme: boolean; hero: boolean }
export function loadPrefs(search: URLSearchParams): Prefs     // localStorage first, URL wins (?theme=stage, ?hero=1)
export function persistPrefs(p: Prefs): void                  // localStorage + history.replaceState mirror (theme=stage / hero=1 set or deleted)
export function applyDomPrefs(p: Prefs): void                 // <html data-stage="1"> / data-hero="1" set or removed
export function initPrefs(): () => void                       // loadPrefs → store.setPref ×2 → subscribe(store, persist + applyDom); returns unsubscribe
export function reducedMotion(): boolean                      // matchMedia('(prefers-reduced-motion: reduce)').matches, false in SSR
```

## A.14 `components/map/layout.ts` **[inventory §5; ported from `frontend/src/map/layout.ts` + `app.ts` key helpers]**

```ts
export interface LayoutResult { positions: [number, number][] }     // index-aligned with nodes; hidden nodes at [0,0]
export const GEO_SCALE = 2.5                                        // must match backend/live/mainnet.py
export const WORLD_BOUNDS = { minX: -180 * GEO_SCALE, maxX: 180 * GEO_SCALE, minY: -58 * GEO_SCALE, maxY: 84 * GEO_SCALE }
export function isSimPeer(nd: { is_real?: boolean; is_telemetry?: boolean }): boolean
export function isNodeVisible(mode: LayoutMode, nd: { is_real?: boolean; is_telemetry?: boolean } | undefined): boolean   // geo ↔ !isSimPeer
export function computeLayout(mode: LayoutMode, nodes: PeerNode[], edges: LayoutEdge[], topologyKey = ''): LayoutResult
export function attackerLayoutEdges(nodes: PeerNode[]): LayoutEdge[]   // grafted: [attacker, victim] per connected_peers; pruned: [attacker, t, true] for ≤2 last_targets
export function edgesKey(edges: Edge[]): string                        // sorted 's-t' joined by ','
export function topologyKey(mode: LayoutMode, nodes: PeerNode[], edges: Edge[]): string   // visible `${i}:${id}` list | edgesKey | mode
export function resetLayoutMemory(): void                              // clears the frozen-position map (tests, reel enter/exit, node preset)
```

Frozen Force rules, unchanged from PR #5 **[spec §6.2 "unchanged from inventory §5"]**: one-shot d3-force, `forceLink` strength 0.4 (0.2 weak) distance `max(40, 400/√n)` (×1.6 weak), `forceManyBody` −800 `distanceMax` 6×dist θ .9, `forceCenter` .03, `forceCollide` .25×dist ×2 iterations; **cold** when `topologyKey` changed or more than half the visible nodes are new → 300 ticks (150 when n > 200), alpha 1; **warm** otherwise → known nodes pinned (`fx/fy`), newcomers start beside their first linked neighbour (else on a ring of radius `min(300, 6n)`), 60 ticks, alpha .5; isolated newcomers parked on the rim; positions remembered per id only for nodes still present; radial: highest degree at centre, rings ≥ 6 per ring; geo: `[x, −y]`.

## A.15 `components/map/palette.ts` **[spec §5, §6.2 render table; tokens.css]**

```ts
export const PALETTE_TOKENS = {
  bg: '--bg', paper0: '--paper-0', paper1: '--paper-1', paper2: '--paper-2', paper3: '--paper-3', pitch4: '--pitch-4',
  flame: '--flame', flameDim: '--flame-dim', signal: '--signal',
  nodeIdle: '--node-idle', nodeOrigin: '--node-origin', nodeReceiving: '--node-receiving', nodeDecoded: '--node-decoded',
  nodeObserver: '--node-observer', nodeJoining: '--node-joining', nodeFailed: '--node-failed', nodeError: '--node-error',
  nodeAttacker: '--node-attacker', nodePruned: '--node-pruned', nodeSelected: '--node-selected',
  linkTopology: '--link-topology', linkMesh: '--link-mesh', linkAttack: '--link-attack', linkHighlight: '--link-highlight',
  particle: '--particle', particleSpam: '--particle-spam', particleGraft: '--particle-graft', particleDht: '--particle-dht',
  ringTelemetry: '--ring-telemetry', scorePos: '--score-pos', scoreNeg: '--score-neg',
} as const
export type PaletteKey = keyof typeof PALETTE_TOKENS
export const PAL: Record<PaletteKey, RGBA>                     // filled by refreshPalette(); grey until then
export function cssToRgba(css: string, alpha?: number): RGBA   // culori parse+rgb; hex/rgb()/oklch(); alpha overrides (0–255)
export function refreshPalette(): boolean                      // re-reads when `${data-theme}|${data-stage}` changed; false if tokens not applied yet
export const BAND_DENSITY = [0.12, 0.35, 0.65, 1.0] as const   // = --band-0..3
export function scoreBand(score: number): ScoreBand            // <0 → 0 · [0,2) → 1 · [2,6) → 2 · ≥6 → 3
export type ParticleKind = 'message' | 'spam' | 'graft' | 'prune' | 'dht' | 'fault'   // 'sybil' renamed 'spam' [plan, token name]
export const PARTICLE_KEY: Record<ParticleKind, PaletteKey> = { message: 'particle', spam: 'particleSpam', graft: 'particleGraft', prune: 'flame', dht: 'particleDht', fault: 'flame' }
export function withAlpha(c: RGBA, a: number): RGBA
```

## A.16 `components/map/atlas.ts` **[spec §7 "On the deck.gl canvas"]**

```ts
export type GlyphId =
  | 'disc' | 'idle' | 'origin' | 'decoded' | 'observer' | 'joining' | 'failed' | 'error'
  | 'attacker' | 'pruned' | 'reticle' | 'square' | 'squareTrail'
  | 'halo-0' | 'halo-1' | 'halo-2' | 'halo-3'          // paper halos at BAND_DENSITY[1..3]; 'halo-0' is the flame .12 halo
export interface IconAtlas { image: HTMLCanvasElement; mapping: Record<GlyphId, { x: number; y: number; width: number; height: number; mask: boolean }>; nodePx: number; cellPx: number }
export function buildAtlas(opts: { nodePx: number; cellPx: number; dpr: number; pal: Record<PaletteKey, RGBA> }): IconAtlas
  // every glyph of the render table at actual pixel size; halos pre-dithered with dither.bayer at cellPx; attacker hatch 45°; never dithered: attacker, pruned, reticle, squares
export function haloFor(score: number): GlyphId        // `halo-${scoreBand(score)}`
```

## A.17 `components/map/renderer.ts` **[spec §4.5, §6.2; inventory §5]** — plain module, no React

```ts
export function initRenderer(canvas: HTMLCanvasElement, tooltipEl: HTMLElement | null): void
  // new Deck({canvas, views: OrthographicView({flipY:false}), controller:true, getCursor: hovering ? 'pointer' : RETICLE_CURSOR, onClick(empty) → store.selectPeer(null)});
  // document.fonts.load('500 10px "IBM Plex Mono"') before the first TextLayer; buildAtlas(); subscribes to the store and to subscribeEvents()
export function destroyRenderer(): void                 // deck.finalize(), cancel rAF, unsubscribe; StrictMode double-mount safe (idempotent)
export function resizeRenderer(w: number, h: number): void
export function renderLayers(): void                    // reads useStore.getState(); layer order 0 world-land · 1 edges · 1a attack-links · 1b mesh-edges · 2 hover · 3 pulses · 3.5 particles · 4a halos · 4 nodes (pickable) · 4b observer rings · 5 reticle · 6 event-highlight · 7 labels
export function fitView(opts?: { durationMs?: number }): void   // WORLD_BOUNDS in geo; visible bbox otherwise; pad 80; zoom ≤ 4; 500 ms
export function spawnParticle(fromId: string, toId: string, kind?: ParticleKind, fizzle?: boolean): void   // cap 600; no-op when !particlesEnabled or unknown/hidden peer
export function visiblePositions(): Map<string, [number, number]>   // for the partition split [plan]
export function resetTopology(): void                   // topoKey = '' + resetLayoutMemory(): next snapshot relayouts cold
export function getViewState(): unknown                 // debug (window.__luminar)
```

Reads from the store (via `subscribe` + `getState` in rAF): `nodes, nodeById, edges, mesh, layoutMode, selectedPeer, hoveredPeer, highlightPeers, showEdges, showLabels, allLabels, particlesEnabled, scale, stageTheme, nodeCount`. Writes to the store: `selectPeer`, `hoverPeer` only. Owns in module scope: `deck`, `nodePositions`, `nodeIndex`, `topoKey`, `pulses`, `particles`, `prevStates`, `landPolygons`, `atlas`, `fontsReady`. Relayout when `topologyKey(mode, nodes, edges) !== topoKey` after a snapshot, edges frame or layoutMode change; `fitView()` on the next rAF after every relayout. Tooltip: renderer positions `tooltipEl` (`transform: translate(x+16, y−10)`, clamped) and React's `<Tooltip>` renders its content from `selectHoveredNode`. Particle triggers (from `subscribeEvents`): `GossipMessage` from→to (`spam` when `from_peer` is `sybil-*`, fizzle when `dropped`), `GossipGraft`/`GossipPrune`, `DHTQueryStarted` to one random connected peer, `FaultInjected` burst to first 4 peers when `target` is a node id. Pulses: any state change to non-idle (attacker graft↔prune flip counts), 2.5 r, alpha 56→0 over 800 ms, cap 200; off under reduced motion. Render table and layer semantics: spec §6.2 verbatim.

## A.18 `components/map/DeckCanvas.tsx` **[spec §4.5]**

```ts
export default function DeckCanvas(props: { className?: string }): JSX.Element
// 'use client'; useRef<HTMLCanvasElement>; useEffect → initRenderer(canvas, tooltipRef.current) / destroyRenderer;
// ResizeObserver on the canvas parent → resizeRenderer(w, h); renders <canvas> + <div ref={tooltipRef} role="tooltip"><Tooltip/></div>
// imported with next/dynamic(() => import('@/components/map/DeckCanvas'), { ssr: false })
```

## A.19 `components/dither/dither.ts` **[spec §7; teardown §6, §9]**

```ts
export const BAYER8: readonly number[]            // 64 thresholds (v + .5) / 64 from the canonical 8×8 matrix (teardown §6)
export function bayer(x: number, y: number): number   // BAYER8[(y & 7) * 8 + (x & 7)]
export function luma601(r: number, g: number, b: number): number     // (.299r + .587g + .114b) / 255
export function applyContrast(l: number, contrast: number, level: number): number   // clamp((l − .5) * contrast + .5 + level, 0, 1)
export const DITHER_CONTRAST = 1.15               // = --dither-contrast [spec §7]
export const REVEAL_STEPS = [28, 20, 14, 10, 7, 5, 4, 3] as const   // = --dither-reveal-steps
export const REVEAL_STEP_MS = 150                 // = --d-reveal
export const LOUPE_PX = 132                       // = --loupe
export const PAPER: RGBA = [242, 242, 239, 255]
export const PITCH: RGBA = [11, 11, 13, 255]
export const FLAME: RGBA = [255, 90, 44, 255]

export interface RawImage { width: number; height: number; data: Uint8ClampedArray }   // ImageData-compatible, no DOM needed
export interface DitherPalette { paper: RGBA; pitch: RGBA }
export interface DitherOpts { contrast?: number; level?: number; positive?: boolean; density?: number }
  // density (0..1): when set, ignores luma and lights a cell iff bayer(x,y) < density — the score-halo and loading-bar case
export function ditherImageData(src: RawImage, cell: number, palette: DitherPalette, opts?: DitherOpts): RawImage
  // PURE. Output is src.width × src.height. For each cell-aligned block, luma of the block's top-left source pixel
  // (src is expected to be pre-downsampled by drawDither; cell = 1 means per-pixel) → lit = (applyContrast(luma) >= bayer(cx, cy)) === positive
  // lit → palette.paper, else palette.pitch; alpha 255 everywhere (1-bit)
export function revealSteps(finalCell: number): number[]   // REVEAL_STEPS.filter(c => c > finalCell).concat(finalCell)
export function coverRect(iw: number, ih: number, w: number, h: number, fx: number, fy: number): [sx: number, sy: number, sw: number, sh: number]
export function drawDither(canvas: HTMLCanvasElement, source: CanvasImageSource & { width: number; height: number }, cell: number, opts?: DitherOpts & { focus?: [number, number]; palette?: DitherPalette }): ImageData | null
  // BROWSER. dpr = min(devicePixelRatio, 2); offscreen ceil(w/cell) × ceil(h/cell) cover-fit downsample (willReadFrequently);
  // ditherImageData(…, 1, …) on that tiny image; fillRect cell squares in paper on a pitch-filled canvas; returns the final ImageData (loupe); null when canvas has no size
export function drawLoupe(ctx: CanvasRenderingContext2D, final: ImageData, source: CanvasImageSource, cover: [number, number, number, number], x: number, y: number, size?: number): void
  // putImageData(final) → clip(size² centred at x,y) → filter 'grayscale(1) contrast(1.15)' → drawImage(source, cover) → 1 px paper strokeRect
```

## A.20 Dither components (props) **[spec §7, §7.4, §6.1]**

```ts
// DitherCanvas.tsx — 'use client'
export interface DitherCanvasProps {
  source: HTMLImageElement | HTMLCanvasElement | ((ctx: CanvasRenderingContext2D, w: number, h: number) => void)   // image, or a draw callback run on an offscreen canvas every frame
  cell?: number            // default: computed --cell-final (3; 4 in stage)
  reveal?: boolean         // default true: REVEAL_STEPS at REVEAL_STEP_MS once ≥ 30 % in view (IntersectionObserver); jumps to final under reduced motion
  loop?: { fps: number; paused?: boolean }   // redraw source at fps (Fig. 1: 2); hover/focus pause is the parent's job
  focus?: [number, number] // cover-fit focal point, default [.5, .5]
  loupe?: boolean          // fine pointers only; 132 px; default false
  onFinal?: (img: ImageData) => void
  className?: string; 'aria-label'?: string; depth?: number   // depth → data-depth for the parallax
}
// HaloRing.tsx — hollow Bayer annulus [spec §7.4 twist 2]
export interface HaloRingProps { size: number; band?: ScoreBand /* default 2 */; flame?: boolean; depth?: number; className?: string }
// Diamond.tsx — the attacker glyph, never dithered
export interface DiamondProps { size: number; pruned?: boolean; depth?: number; className?: string; label?: string }
// Stamp.tsx — Manrope 600 uppercase .1em, paper on pitch, rotate(var(--stamp-tilt)), --stamp-shadow
export interface StampProps { children: string /* ≤ 24 chars */; tilt?: number /* deg, default 3 */; flame?: boolean; depth?: number; className?: string }
// Figure.tsx — plate + "Fig. N" + italic caption (right-aligned; left under 450 px)
export interface FigureProps { n: number; caption: string; aspect?: string /* '16 / 6.4' */; narrowAspect?: string /* '4 / 3' */; narrowAt?: number /* 450 */; stamp?: string; children: React.ReactNode; className?: string }
// Loupe.tsx — pointer-driven, fine pointers only
export interface LoupeProps { plateRef: React.RefObject<HTMLElement>; final: ImageData | null; source: CanvasImageSource | null; cover: [number, number, number, number]; size?: number /* 132 */ }
// Reticle.tsx — the selection/cursor glyph: 14 px ring + four 4 px ticks, paper, 1 px pitch outline
export interface ReticleProps { size?: number /* 14 */; className?: string; title?: string }
export const RETICLE_CURSOR: string   // `url("data:image/svg+xml,…") 7 7, crosshair` — used by .plate and the deck canvas [spec §7.4 twist 3]
```

Removed everywhere **[spec §7.4.2, owner 24 Oct]**: the orange trapezoid/parallelogram shard and the grey halftone slab. The only floating objects on any plate (landing, menu reel cards, video) are `HaloRing` and `Diamond`.

## A.21 `scripts/reel-stats.mjs` **[spec §6.1 items 3–4]** — Node ESM, no dependencies

Invocation: `node scripts/reel-stats.mjs [public/reels/sybil-eclipse.jsonl]`; `package.json` `"reel-stats": "node scripts/reel-stats.mjs"` and `"prebuild": "npm run reel-stats"` **[plan]**. Outputs are committed.

`lib/reel-stats.json` **[plan shape]**:

```json
{ "reel": "sybil-eclipse", "generatedAt": "2026-10-24T00:00:00Z", "simDurationS": 40.5,
  "peers": 50, "sybils": 5, "heartbeatsToPrune": 2, "deliveryPct": 100,
  "firstPublishAt": 5.8, "sybilAt": 10.2, "firstScorePruneAt": 11.9, "eclipseAt": 16.2, "eclipseTarget": "peer-10", "clearedAt": 24.1, "healedInS": 1.4,
  "avgHops": 4, "avgPropagationMs": 190 }
```
Derivations: `peers` = first snapshot `node_count`; `sybils` = `FaultInjected fault_type=sybil params.n_attackers`; `firstScorePruneAt` = first `GossipPrune reason=score` with `to_peer sybil-*`; `heartbeatsToPrune` = `ceil(firstScorePruneAt − sybilAt)`; `eclipseTarget` = `FaultInjected fault_type=eclipse target`; `clearedAt` = first `FaultCleared`; `healedInS` = (sim time of the first `analytics` with `recent_delivery_ratio ≥ .95` after `clearedAt`) − `clearedAt`, rounded .1; `deliveryPct`, `avgHops`, `avgPropagationMs` from the first `analytics` with `total_messages > 0` after `firstPublishAt` (`recent_delivery_ratio × 100` rounded, `avg_hops` rounded .1, `avg_propagation_ms` rounded). Sim time of a typed frame = `time` of the latest snapshot at or before it.

`lib/plate-frames.json` **[spec §6.1 item 3: ≈32 snapshots × node x,y,state + edges, ≈60 KB]**:

```json
{ "reel": "sybil-eclipse", "from": 8, "to": 24, "step": 0.5,
  "nodes": [{ "id": "peer-0", "x": -62.1, "y": 294.7 }],            // honest peers from the first snapshot, 1-decimal, index = position
  "edges": [[0, 6], [0, 11]],                                        // index pairs from the edges frame
  "bounds": { "minX": 0, "minY": 0, "maxX": 0, "maxY": 0 },
  "frames": [{
    "t": 10.5,
    "s": "iirrdd…",                                                 // one char per honest node: i o r d j f e (idle origin receiving decoded joining failed error)
    "b": "3321…",                                                   // score band per honest node, '0'..'3' (0 = negative → flame halo)
    "a": [{ "id": "sybil-0", "x": 1.2, "y": -3.4, "p": false, "v": [12, 40] }],   // attackers in this snapshot; p = pruned; v = victim indexes (connected_peers)
    "m": [[12, 40], [7, 9]],                                         // GossipMessage hops since the previous frame, ≤ 40 per frame (evenly sampled), honest→honest or attacker(−1−k)→honest
    "r": { "peers": 50, "sybil": 5, "pruned": 3 },                   // the readout box
    "stamp": "3/5 PRUNED · T+13S"                                    // latest beat at t (see below), ≤ 24 chars
  }]
}
```
Stamps, derived not typed **[spec §6.1 item 3 wording]**: `SYBIL FLOOD · T+${⌊sybilAt⌋}S` at `sybilAt`; `${pruned}/${sybils} PRUNED · T+${⌊t⌋}S` at the first snapshot where pruned > 0; `ECLIPSE · N${index of eclipseTarget} · T+${⌊eclipseAt⌋}S` (the spec's example reads `N7`; this reel's target is peer-10 → `N10`; data wins); `CLEARED · T+${⌊clearedAt⌋}S`. The script fails (exit 1) if the JSON exceeds 80 KB or any stamp exceeds 24 characters.

## A.22 Remotion **[spec §9; storyboard]**

```ts
// remotion/props.ts
export type Orientation = 'wide' | 'tall'
export const launchSchema = z.object({ orientation: z.enum(['wide', 'tall']), reel: z.string(), repoUrl: z.string(), eventLine: z.string() })
export type LaunchProps = z.infer<typeof launchSchema>
export const LAUNCH_DEFAULTS: Omit<LaunchProps, 'orientation'> = { reel: 'reels/sybil-eclipse.jsonl', repoUrl: REPO_URL, eventLine: EVENT_LINE }
// remotion/timeline.ts
export type SceneId = 'cold-open' | 'title' | 'healthy' | 'sybils' | 'pruned' | 'eclipse' | 'heal' | 'same-names' | 'mainnet' | 'honesty' | 'end'
export interface SceneSpan { id: SceneId; from: number; durationInFrames: number; simOffset?: number; speed?: number }
export const timeline: Record<Orientation, SceneSpan[]>   // wide: 0–75, 75–240, 240–480 (T+4.0), 480–660 (T+9.5), 660–840 (T+11.4, 0.6×), 840–1110 (T+15.5), 1110–1230 (T+23.6), 1230–1410, 1410–1500, 1500–1590, 1590–1710; tall: per the storyboard's 9:16 table, no 'mainnet'
export const SAFE_TALL = { top: 220, bottom: 320 }
// remotion/Root.tsx
<Composition id="LaunchWide" component={Launch} width={1920} height={1080} fps={30} durationInFrames={1710} schema={launchSchema} defaultProps={{ orientation: 'wide', ...LAUNCH_DEFAULTS }} />
<Composition id="LaunchTall" component={Launch} width={1080} height={1920} fps={30} durationInFrames={1440} schema={launchSchema} defaultProps={{ orientation: 'tall', ...LAUNCH_DEFAULTS }} />
```
Scripts **[spec §9 outputs]**: `"studio": "remotion studio"`, `"video": "remotion render LaunchWide out/luminar-16x9.mp4 --codec h264 --crf 18 && remotion render LaunchTall out/luminar-9x16.mp4 --codec h264 --crf 18 && remotion still LaunchWide out/cover.png --frame 1620 && remotion render LaunchWide public/video/launch-16x9.mp4 --codec h264 --crf <builder> --scale 0.6667 && remotion still LaunchWide public/video/poster.png --frame 1620"` (the landing mp4 ≤ 12 MB; poster is dithered by `DitherCanvas` at runtime). Audio: none **[spec §13.3]**. Accent shapes: storyboard's parallelograms/halftone rectangles are replaced by `Diamond` (flame) and `HaloRing` **[spec §7.4.2]**. `remotion.config.ts`: `setPublicDir('./public')`, `setVideoImageFormat('jpeg')`, `setChromiumOpenGlRenderer('angle')` if slow. Shared components must be plain React (no `next/*`, no `"use client"` dependence).

## A.23 Colorfigure **[spec §8; figure-concept.md]**

Source `web/figures/sorter/figure.html` + `core.js`; built `web/public/figures/sorter.html`. Button labels (Must): `Post` · `Heartbeat` · `Bolt on a Sybil`. Deferred: `Lower the hood` / `Lift the hood` (toggle), `Slide the bulkhead`. Stats labels: `mesh 6/6 (toy)` · `score port-3` · `delivered` · `IWANT pulls` · `beat`. Flashes: `nothing in the history yet`, `lift the hood first`. Stamp `SORTER No. 6`. Caption `Fig. 2 ` + `copy.FIG2`. Iframe title `Sorting office: GossipSub as a pneumatic-tube desk`. `?press=` grammar: `Name@ms(,Name@ms)*`, e.g. `?press=Post@300,Heartbeat@1500,Sybil@2500,Heartbeat@4000,Heartbeat@5500` (`Sybil` is the short name of the third button); `/figure/` passes `press` through to the iframe untouched.

## A.24 Routes, params, storage, env, Makefile

Routes **[spec §4.8]**: `/` (landing; `?reel=<n>` → client redirect to `/reels/<n>/` carrying `theme`, `hero`, `t`, `peer`) · `/sim/` (`theme=stage`, `hero=1`, `peer=<id>`; `?reel=` redirects as above) · `/reels/<name>/` (`theme`, `hero`, `t` sim seconds, `peer`; socket never opened) · `/figure/` (`?press=` passthrough). Share (`s`) copies `/reels/<n>/?t=…&peer=…`.

Storage **[inventory §3]**: `localStorage['luminar.prefs']` = `{"stageTheme":bool,"hero":bool}`; `localStorage['luminar.token']` = admin token string.

Env **[spec §4.2]**: `NEXT_PUBLIC_API_URL` (build-time, default `''`), `NEXT_PUBLIC_WS_URL` (dev only, default `ws://localhost:8000`). Backend env unchanged (`LUMINAR_NODE_COUNT`, `LUMINAR_LOG_LEVEL`, `LUMINAR_ADMIN_TOKEN`, `LUMINAR_ALLOW_RECORD`, `PORT`).

Makefile **[spec §4.1 + plan]**, old targets untouched until phase 7:

```make
web:        cd web && npm run dev                                   # :3000
web-build:  cd web && npm run build                                 # writes web/out
web-test:   cd web && npx vitest run                                # [plan]
web-check:  cd web && npx tsc --noEmit && npm run lint && npx vitest run   # [plan: + test]
web-stats:  cd web && npm run reel-stats                            # [plan]
web-video:  cd web && npm run video                                 # [plan] local Chrome, not CI
```
CI **[spec §11 phase 0]**: job `web-build` (`node-version: 22`, `cache-dependency-path: web/package-lock.json`, `npm ci`, `npx tsc --noEmit`, `npm run lint`, `npx vitest run`, `npm run build`).

`package.json` scripts **[plan]**: `dev`, `build`, `start` (unused), `lint` (`eslint .`), `test` (`vitest run`), `test:watch`, `reel-stats`, `prebuild`, `studio`, `video`. Dev deps added for tests **[plan]**: `vitest`, `jsdom` (exact versions after `npm view`).

Component inventory names **[spec §4.1]** (files under `components/sim/`): `SimApp.tsx Toolbar.tsx CommandStrip.tsx StatsRail.tsx LogRail.tsx Inspector.tsx Legend.tsx Narrator.tsx Ticker.tsx ModeSwitcher.tsx Provenance.tsx Toasts.tsx Menus.tsx KeyHelp.tsx`; plus **[plan]** `Tooltip.tsx`, `Scrubber.tsx` (inside CommandStrip), `Sparkline.tsx` (dithered area; used by StatsRail and Inspector). Under `components/landing/`: `Nav.tsx Hero.tsx Readouts.tsx Sections.tsx VideoPlate.tsx FigurePlate.tsx Footer.tsx` plus **[plan]** `PlateReplay.tsx` (the Fig. 1 offscreen draw callback from `plate-frames.json`).

## A.25 Phase 0 additions — base CSS, font variables, config shape

| Name | Where | Why |
|---|---|---|
| Base CSS classes `.hair`, `.plate`, `.btn`, `.btn-primary`, `.menu`, `.menu-item`, `.menu-sep`, `.t-display`, `.t-poster`, `.t-fig`, `.t-narr`, `.t-ui`, `.t-label`, `.t-micro`, `.t-kpi`, `.num`, `.sr-only`, element rules `kbd`, `:focus-visible`, `html { color-scheme: dark }` | `web/app/globals.css` after the verbatim tokens block | spec §4.3 "≈300 lines of base rules (reset, type classes, `.hair`, `.plate`, buttons, menu, kbd)"; later phases' CSS Modules compose these instead of restating tokens. Exact rules in Task 0.2. |
| `--font-display`, `--font-mono`, `--font-ui` set as an **inline `style` on `<html>`** from `localFont(...).style.fontFamily` | `web/app/layout.tsx` | spec §4.6 says `layout.tsx` exposes these names and `tokens.css` is verbatim; `tokens.css:160-162` already declares them on `:root` with real family names, and `next/font/local` registers hashed families. An inline style wins the cascade deterministically; a `variable` class on `<html>` ties with `:root`. Consequence: see A.0 (A.17 `TextLayer` font). |
| `config(phase: string): NextConfig` default export | `web/next.config.ts` | rewrites exist only when `phase === PHASE_DEVELOPMENT_SERVER`, so the export never carries custom routes. |
| `web/next.config.test.ts`, `web/app/globals.test.ts`, `web/app/fonts.test.ts` | next to the module they test | the phase's vitest guards |
| `--strip-bottom`, `data-hero-hide` | `web/app/globals.css` base rules, added in Task 4.8 | `:root { --strip-bottom: 36px } :root[data-hero="1"] { --strip-bottom: 60px; --t-narr: 24px } :root[data-hero="1"] [data-hero-hide], :root[data-hero="1"] [role="tooltip"] { display: none }`; CommandStrip uses `bottom: var(--strip-bottom)`; the attribute goes on StatsRail, the LogRail/Inspector wrapper, Legend and the kbd hint row. |

## A.26 Phase 1 additions — fixtures and the phase-1 shell subset

```ts
// lib/fixtures.ts — test fixtures shared by every *.test.ts
export function peerNode(id: string, index: number, extra?: Partial<PeerNode>): PeerNode
  // state 'idle', connected_peers [], x 0 y 0, messages_* 0, gossip_score 1
export function snapWith(ids: string[], extra?: Partial<SnapshotFrame>): SnapshotFrame
  // type 'snapshot', state 'running', time 0, speed 1, node_count ids.length, event_count 0, gossip { mesh: {} }
export function peers(n: number): PeerNode[]                       // peer-0 … peer-(n−1) via peerNode (added in Task 2.0a)
export function ring(n: number): Edge[]                             // [peer-i, peer-(i+1)%n]           (added in Task 2.0a)
```

- `Toolbar` (phase-1 subset, `web/components/sim/Toolbar.tsx`): `export default function Toolbar(): JSX.Element` renders brand + `<Pill/>` (`data-testid="pill"`, `data-state={ConnectionPill}`) + `<Clock/>` (`<time data-testid="clock">` whose only child is the text `T+${formatTime(simTime)}`). Phase 3 adds badges, presets, the GitHub link and the `onMenu` prop to this same file.
- `SimApp` (phase-1 subset, `web/components/sim/SimApp.tsx`): `'use client'`; `export default function SimApp(): JSX.Element`; `useEffect(() => { ws.connect(); return () => ws.disconnect() }, [])`; renders `<Toolbar/>` and `<main data-slot="canvas"/>`. Phase 2 mounts `DeckCanvas` there; phase 4 replaces the effect with `bootSim`/`teardownSim` and adds `SimAppProps`.

## A.27 Phase 2 additions — geometry, atlas layout, renderer debug surface, mode switcher, tooltip

```ts
// components/map/geometry.ts — pure, no DOM
export function nodeRadiusPx(n: number, mode: LayoutMode, nodeScale: number): number   // clamp(200/√n, 3, 8) × nodeScale, × 0.5 when mode !== 'force'
export function glyphScale(d: { state: NodeState }, selected: boolean): number         // 1 · ×1.5 selected · ×1.15 attacker (multiplicative)
export function bezierPoint(src: [number, number], tgt: [number, number], t: number): [number, number]   // bow left, min(18, len × .12)
export const PARTICLE_TRAVEL_MS = 800, PARTICLE_LIFETIME_MS = 1200, PARTICLE_CAP = 600, PULSE_CAP = 200, PULSE_MS = 800, FIZZLE_AT = 0.6, FIZZLE_ALPHA = 89
export function particleFrame(age: number, fizzle: boolean): { t: number; alpha: number } | null   // null when age > lifetime; ease-out; fizzle stalls at .6 and fades over the last 400 ms; alpha 0–255
export function pulseAlpha(age: number): number           // 56 × (1 − age/800), 0 after 800
export function breathe(now: number): number              // .475 + .275 × sin(2π now / 5600)  (.2 → .75)
export const OBSERVER_STATIC_ALPHA = 0.5                  // reduced motion [spec §10]

// components/map/atlas.ts (additions to A.16)
export interface GlyphBox { x: number; y: number; width: number; height: number; mask: boolean }
export function atlasLayout(nodePx: number, cellPx: number, dpr: number): { width: number; height: number; mapping: Record<GlyphId, GlyphBox> }   // pure; one row, 2 px gutters
export function haloCells(outerPx: number, innerPx: number, cellPx: number, density: number): [number, number][]   // pure; cell origins (centred box) with bayer(cx, cy) < density inside the annulus
export const HALO_OUTER = 1.7, HALO_INNER = 1.2           // × node radius [spec §6.2 "halo at 1.7 r"]; inner is plan
export function glyphFor(d: Pick<PeerNode, 'state' | 'connected_peers' | 'is_real' | 'is_telemetry'>): GlyphId   // attacker → pruned|attacker · real/telemetry → 'observer' · else state → GlyphId ('receiving' → 'disc')
export function atlasKey(nodePx: number, cellPx: number, dpr: number, paletteVersion: string): string

// components/map/renderer.ts (additions to A.17)
export const LAYER_IDS = ['world-land', 'edges', 'attack-links', 'mesh-edges', 'hover-edges', 'hover-peer-rings', 'pulses', 'particles', 'halos', 'nodes', 'observer-rings', 'reticle', 'event-highlight-edges', 'event-highlight-rings', 'labels'] as const
export function layerIds(): string[]                      // ids of the layers currently set on the deck, in order (tests, window.__luminar)
export function particlesFor(evt: AppEvent, pick: (ids: string[]) => string | undefined): { from: string; to: string; kind: ParticleKind; fizzle: boolean }[]   // pure trigger table [A.17 "Particle triggers"]
export function markDirty(): void                         // next rAF re-renders (store subscription + tests)
export function monoFamily(): string                      // first family of computed --font-mono on <html>; '"IBM Plex Mono"' when unset [A.0]
// window.__luminar = { store: useStore, fitView, viewState: getViewState, layerIds }   // debug handle, set by initRenderer

// components/sim/ModeSwitcher.tsx
export default function ModeSwitcher(): JSX.Element       // 'use client'; FORCE | RADIAL | GEO; Geo disabled with title GEO_DISABLED until geoAvailable
export const GEO_DISABLED = 'Geo needs real observers · turn MAINNET on'   // tooltip reason [spec §6.2 "disabled with reason"]

// components/sim/Tooltip.tsx
export default function Tooltip(): JSX.Element | null     // 'use client'; content from selectHoveredNode; null when nothing hovered
export function tooltipRows(node: PeerNode, mesh: Record<string, string[]>, nodeById: ReadonlyMap<string, PeerNode>): { head: { name: string; badge: string; id: string; alarm: boolean }; rows: [string, string, boolean][]; peers?: string[] }   // pure; third tuple = alarm tone

// components/dither/Reticle.tsx — built here (phases 3, 5, 6 reuse it); props per A.20, exports per A.0
export const RETICLE_SVG: string                          // the 14 px cursor glyph markup (single-quoted attrs, literal hex) used by RETICLE_CURSOR
```

## A.28 Phase 3 additions — pure panel logic, primitives, component props

| Path | Role |
|---|---|
| `web/lib/timeline-marks.ts` | pure: scrubber wash bands and tick marks from `ScenarioPhase[]` + `Beat[]` (spec §6.2 "beats and phases are drawn as ticks"; `.lm-tl-tick` finally gets a producer) |
| `web/lib/menu-keys.ts` | pure: roving-tabindex arithmetic for `role="menu"` (spec §10) |
| `web/lib/fault-items.ts` | pure: the fault menu's rows with `disabled` + `reason` derived from state; active fault count |
| `web/lib/log-filter.ts` | pure: chip toggling (Alt/Meta isolates), visible rows (cap 500), row-click resolution (visible node only, toggle off, highlight targets) |
| `web/lib/inspector-peers.ts` | pure: mesh vs topology peer lists, "pruned by", per-peer events (cap 200), direction glyph |
| `web/lib/spark.ts` | pure: polyline geometry for `Sparkline.tsx` (domain, zero line) |
| `web/components/sim/Glyph.tsx` | the render-table glyph as inline SVG for DOM surfaces (legend `<dl>`, inspector header, state rows); wraps `Diamond`/`HaloRing` for the two legend twins |
| `web/components/sim/Overlay.tsx` | full-screen overlay primitive: `role="dialog"`, focus trap, Escape, staggered rows; used by `KeyHelp` and the ≤1023 px `Menu +`; phase 5's landing `Nav` may reuse it |
| `web/components/sim/Provenance.tsx` | the top-left provenance card (spec §6.2 Canvas overlays), live variant here, recorded variant in Task 4.6 |
| `web/components/dither/HaloRing.tsx`, `web/components/dither/Diamond.tsx` | created **here** (A.20 props + A.0 construction) because the simulator legend needs them (spec §7.4 twist 2); phase 5 consumes, it must not recreate them |

```ts
// lib/timeline-marks.ts
export interface Band { left: number; width: number; action: string; label: string; at: number }   // left/width as 0..1 fractions of total
export interface Tick { pos: number; time: number; label: string; kind: BeatKind }                // pos 0..1
export function bandsFor(phases: ScenarioPhase[], total: number): Band[]      // one per inject_* phase until the next clear_faults (else total); [] when total ≤ 0
export function ticksFor(beats: Beat[], phases: ScenarioPhase[], total: number): Tick[]   // phases as kind 'phase' + beats; deduped when |Δt| < 0.05 s (beat wins); sorted by time; dropped when time > total
export function washVar(action: string): '--wash-sybil' | '--wash-eclipse' | '--wash-partition' | '--wash-latency'   // inject_<x> → --wash-<x>; unknown → --wash-partition

// lib/menu-keys.ts
export function nextMenuIndex(current: number, key: string, count: number): number | null
  // ArrowDown → (c+1)%n · ArrowUp → (c−1+n)%n · Home → 0 · End → n−1 · anything else → null; null when count === 0

// lib/fault-items.ts
export interface FaultItem { kind: FaultKind; label: string; aside: string; disabled: boolean; reason?: string }
export function activeFaultCount(events: AppEvent[]): number      // FaultInjected rows after the last FaultCleared
export function faultItems(s: Pick<AppState, 'selectedPeer' | 'nodeById' | 'events'>, sybilN: number): FaultItem[]
  // Partition 'split by layout side' · Sybil `${n} peers` · Eclipse (selected sim peer else disabled 'select a peer first'; aside shortName) ·
  // Drop peer (same rule) · Clear all (aside `${activeFaultCount} active`, disabled when 0)
  // labels: Partition · Sybil attack · Eclipse attack · Drop peer · Clear all faults

// lib/log-filter.ts
export function initialFilters(): Set<EventCategory>                                   // every FILTER_GROUPS cat minus DEFAULT_OFF
export function toggleFilter(active: ReadonlySet<EventCategory>, cat: EventCategory, isolate: boolean): Set<EventCategory>
export function visibleRows(events: AppEvent[], active: ReadonlySet<EventCategory>, cap?: number): AppEvent[]   // last `cap` (500) matching rows, oldest first
export function rowClick(evt: AppEvent, s: Pick<AppState, 'nodeById' | 'layoutMode' | 'selectedPeer'>): { select: string | null; highlight: string[] } | null
  // referenced id = peer_id ?? from_peer; unknown or !isNodeVisible → null (no-op); already selected → { select: null, highlight: [] };
  // else highlight = [to_peer] + first 8 connected_peers when GossipMessage, deduped

// lib/inspector-peers.ts
export function meshPeers(mesh: Record<string, string[]>, id: string): string[] | null    // null when `id` is not a key (mesh hidden above 100 nodes, or attacker)
export function prunedBy(events: AppEvent[], id: string): string[]                       // unique from_peer of GossipPrune with to_peer === id
export function peerEvents(events: AppEvent[], id: string, cap?: number): AppEvent[]     // peer_id | from_peer | to_peer === id; last `cap` (200)
export function direction(evt: AppEvent, id: string): '↑' | '↓' | '·'

// lib/spark.ts
export function scoreDomain(values: number[]): [number, number]                          // [min(values, −0.5), max(values, 0.5)]
export function sparkPoints(values: number[], w: number, h: number, domain?: [number, number]): { pts: [number, number][]; zeroY: number | null }
  // x evenly spaced 0..w; y = 1 + (h − 2)(1 − (v − lo)/(hi − lo)); domain default [min, max] (equal → ±0.5); zeroY when 0 ∈ domain

// components/sim/Glyph.tsx
export type GlyphRole = NodeState | 'pruned' | 'observer' | 'honest'
export default function Glyph(props: { role: GlyphRole; size?: number /* 12 */; band?: ScoreBand; title?: string }): JSX.Element

// components/sim/Overlay.tsx
export default function Overlay(props: { open: boolean; onClose: () => void; title: string; children: React.ReactNode; className?: string }): JSX.Element | null
  // role="dialog" aria-modal aria-label={title}; focus moves to the first focusable child on open and returns to the opener on close;
  // Tab/Shift+Tab wrap; Escape → onClose; backdrop click → onClose; direct children with data-row get animation-delay calc(var(--stagger) * i)

// components/sim/Provenance.tsx
export default function Provenance(): JSX.Element | null
  // null unless mainnet?.enabled (or reel && mainnet); kicker `LIVE MAINNET` (Task 4.6: `RECORDED MAINNET` when reel);
  // cells `slot ${slot ?? '—'}` · `T−${lag_s ?? 156}s` (Task 4.6: `recorded` when reel) · `${with_geo ?? observers} observers` · copy.PROVENANCE verbatim;
  // suffix ` · shown on the Geo layout` when layoutMode !== 'geo'; top-left inside <main>, --panel surface, 1 px --hair, --t-micro, no dither

// components/sim/Menus.tsx
export function Menu(props: { id: string; label: string; children: React.ReactNode; disabledReason?: string }): JSX.Element
  // trigger <button aria-haspopup="menu" aria-expanded popovertarget={id}> + <div id popover="auto" role="menu">; positioned under the trigger from getBoundingClientRect on toggle
export function MenuItem(props: { onSelect: () => void; disabled?: boolean; reason?: string; active?: boolean; kbd?: string; aside?: string; meta?: string; tag?: string; children: React.ReactNode }): JSX.Element
  // <button role="menuitem" tabIndex={-1} aria-disabled aria-current={active}>; disabled items stay focusable so the reason is read
export interface MenuRow { key: string; name: string; onSelect: () => void; disabled?: boolean; reason?: string; active?: boolean; kbd?: string; aside?: string; meta?: string; tag?: string }
export function scenarioRows(scenarios: ScenarioDefinition[], activeId: string | null): MenuRow[]   // name, aside `${duration}s`, meta description → launchScenario(id)
export function reelRows(manifest: ReelManifest, activeName: string | null): MenuRow[]            // kbd 1..n, title, meta blurb, tag 'REAL' when real → openReel(name) (Task 4.4; enterReel until then); last row kbd '0' 'Back to live' → exitReel
export function faultRows(items: FaultItem[], n: number): MenuRow[]                                // one row per FaultItem → injectFault(kind, { n })
export function ScenariosMenu(): JSX.Element            // Menu + rows.map(MenuItem) from scenarioRows
export function ReelsMenu(props: { manifest: ReelManifest }): JSX.Element
export function FaultMenu(): JSX.Element                // holds the Sybil stepper state n (1–10, default 5)

// components/sim/*.tsx default exports
Toolbar(props: { onMenu: () => void })                         // onMenu opens the ≤1023 px overlay
CommandStrip(props: { manifest: ReelManifest; onDrawer: (d: 'stats' | 'log') => void })
Scrubber()                                                     // inside CommandStrip
Sparkline(props: { values: number[]; height?: number /* 36 */; domain?: [number, number]; zeroLine?: boolean; alarm?: boolean; 'aria-label': string })
StatsRail(props: { onBeat: (b: Beat) => void })
LogRail()
Inspector()
Legend()
Narrator()                                                     // CAPTION_MS = 4000
Toasts()                                                       // TOAST_MS = 2000
KeyHelp()
export const SIM_BREAKPOINT = 1023                             // SimApp: rails become drawers at ≤ 1023 px
```

## A.29 Phase 4 additions — reel routes, boot, moments, ticker

| Name | File | Signature / shape |
|---|---|---|
| `REEL_MANIFEST` | `web/lib/reels.ts` | `export const REEL_MANIFEST: ReelManifest` — `import manifest from '@/public/reels/manifest.json'` (build-time, bundled, no runtime fetch; one source for the page, the redirect, keys `1`–`9` and the landing `Nav`) |
| `reelHref` | `web/lib/reels.ts` | `export function reelHref(name: string, q?: URLSearchParams): string` → `/reels/${name}/` + `?${q}` when `q` non-empty |
| `liveHref` | `web/lib/reels.ts` | `export function liveHref(q?: URLSearchParams): string` → `/sim/` + query |
| `carryParams` | `web/lib/reels.ts` | `export function carryParams(search: string, keys: readonly string[] = CARRY_KEYS): URLSearchParams` — keeps `keys` in that order, drops the rest; `export const CARRY_KEYS = ['theme', 'hero', 't', 'peer'] as const` |
| `redirectTarget` | `web/lib/reels.ts` | `export function redirectTarget(search: string, names: readonly string[] = REEL_MANIFEST.map(r => r.name)): string \| null` — `?reel=<known>` → `reelHref(name, carryParams(search))`; no `reel` or unknown name → `null` |
| `loadLabel` | `web/lib/reels.ts` | `export function loadLabel(p: { loaded: number; total: number } \| null): string` — `'2.1 / 3.5 MB · 60%'`; `total` 0 → `'2.1 MB'`; `null` → `''` |
| `SimAppProps` | `web/components/sim/SimApp.tsx` | `export interface SimAppProps { reel?: ReelMeta \| null }`; `export default function SimApp({ reel = null }: SimAppProps)` (no `SimShell`, A.0) |
| `ReelRedirect` | `web/components/sim/ReelRedirect.tsx` | `'use client'`; `useEffect` → `const to = redirectTarget(location.search); if (to) location.replace(to)`; renders `null`. No `useSearchParams`, so no `<Suspense>` |
| `ReelProgress` | `web/components/sim/ReelProgress.tsx` | `export default function ReelProgress(props: { title: string }): JSX.Element \| null` — reads `reelLoad`; 12 px bar whose fill is `background: var(--dither-50)` and `width: pct%`; label `REEL · ${title} · ${loadLabel(p)}`; `role="progressbar"` with `aria-valuenow`; null when `reelLoad` is null |
| `Ticker` + `tickerCells` | `web/components/sim/Ticker.tsx`, `web/lib/ticker.ts` | `export interface TickerCell { key: string; value: string; danger?: boolean }`; `export function tickerCells(s: AppState): TickerCell[]` (pure; 8 cells: `phase · delivery · mesh d · hops · e2e · attackers · invalid · T+`; in Geo with mainnet on cells 2–5 become `slot · first seen · p50 · observers`) |
| `bootSim` / `teardownSim` | `web/lib/actions.ts` | `export interface BootOpts { reel: ReelMeta \| null; search: string }`; `export async function bootSim(o: BootOpts): Promise<void>` (reel → `enterReel` then `applyUrlMoment`; live → `ws.connect()`, `await fetchTopology()`, `applyUrlMoment`, `void fetchScenarios()`; failed fetches are silent); `export function teardownSim(): void` (abort pending load, `ws.disconnect()`, `unloadReel()`) |
| `openReel` | `web/lib/actions.ts` | `export function openReel(name: string): void` → `location.assign(reelHref(name, carryParams(location.search, ['theme', 'hero'])))` |
| `initUrlMoment` / `initAutoGeo` | `web/lib/actions.ts` | `export function initUrlMoment(): () => void` (store subscription on `[selectedPeer, playing]` → `syncUrlMoment()`); `export function initAutoGeo(): () => void` (subscription on `[mainnet?.enabled, geoAvailable]` → `maybeAutoGeo()`; implemented in Task 2.7) |

## A.30 Phase 5 additions — dither components, plate drawing, landing components, colorfigure embed

| Path / name | Signature or shape | Why |
|---|---|---|
| `web/components/dither/parallax.ts` | `export function attachParallax(root: HTMLElement): () => void` (the testable body) · `export function useParallax(ref: React.RefObject<HTMLElement \| null>): void` — on scroll/resize (rAF-throttled) sets `transform: translate3d(0, ((p − .5) × travel × depth)px, 0)` on every `[data-depth]` descendant, `p = clamp((innerHeight − rect.top) / (innerHeight + rect.height), 0, 1)`, `travel` = computed `--parallax-travel` (−170; 0 under reduced motion → no listeners) | teardown §9 `parallax()` as a hook; Figure calls it |
| `web/components/dither/DitherImage.tsx` | `'use client'`; `export default function DitherImage(props: { src: string; alt: string; cell?: number; depth?: number; focus?: [number, number]; loupe?: boolean; className?: string }): JSX.Element` — loads `src` into an `HTMLImageElement`, shows a `--dither-25` skeleton until `decode()` resolves, then renders `<DitherCanvas source={img} …/>` | a server component cannot construct an `HTMLImageElement`; used by "Same names" stills and the Fig. 3 poster |
| `web/components/dither/glyphs.module.css` | one CSS module shared by Reticle, HaloRing, Diamond, Stamp | four 10-line modules would be noise |
| `web/components/landing/plate-draw.ts` | `export interface PlateFrames { reel: string; from: number; to: number; step: number; geo?: boolean; nodes: { id: string; x: number; y: number }[]; edges: [number, number][]; bounds: { minX: number; minY: number; maxX: number; maxY: number }; frames: PlateFrame[] }` · `export interface PlateFrame { t: number; s: string; b: string; a: { id: string; x: number; y: number; p: boolean; v: number[] }[]; m: [number, number][]; r: { peers: number; sybil: number; pruned: number }; stamp: string }` (A.21 typed; `geo` is new: y is negated when true) · `export type PlateLayer = 'base' \| 'attackers' \| 'loupe'` · `export const PLATE_FPS = 2` · `export const STILL_T = 11.9` · `export function plateTransform(bounds: PlateFrames['bounds'], w: number, h: number, pad = 0.08): (x: number, y: number) => [number, number]` (uniform fit + centre; degenerate bounds → scale 1) · `export function frameIndexAt(plate: PlateFrames, t: number): number` (first index with `frames[i].t ≥ t`, else last) · `export function drawPlateFrame(ctx: CanvasRenderingContext2D, plate: PlateFrames, i: number, w: number, h: number, layer: PlateLayer): void` | the Fig. 1 offscreen draw, split so attackers stay un-dithered and ids appear only under the loupe |
| `web/lib/reel-cards.json` | `Record<string /* manifest name */, PlateFrames>` with exactly one frame per reel (`stamp: ''`) | §7.4.1 reel cards in the menu overlay |
| `scripts/reel-stats.mjs` additions | `export function computeCard(lines: string[], meta: { name: string; real?: boolean }): PlateFrames` · `export const CARDS_MAX_BYTES = 40_000`; `main()` also writes `lib/reel-cards.json` from every manifest entry | same script, one more output |
| `web/components/landing/PlateReplay.tsx` | `'use client'`; `export default function PlateReplay(props: { plate: PlateFrames; className?: string }): JSX.Element` | named in A.24; props pinned here |
| `web/components/landing/FigureFrame.tsx` | `export default function FigureFrame(props: { press?: string; fullBleed?: boolean }): JSX.Element` — the `<iframe>` of `/figures/sorter.html`; `press` appended as `?press=<encodeURIComponent>`; `fullBleed` → `position:fixed; inset:0`, eager; otherwise `loading="lazy"`, fills the plate | shared by the Fig. 2 plate and `/figure/` |
| `web/app/figure/FigureRoute.tsx` | `'use client'`; reads `useSearchParams().get('press')` and renders `<FigureFrame fullBleed press={…}/>`; mounted under `<Suspense>` by `app/figure/page.tsx` | keeps `useSearchParams` off the landing |
| `web/components/landing/{Nav,Hero,Readouts,Sections,FigurePlate,VideoPlate,Footer}.tsx` | `Nav({ reels: ReelManifest; cards: Record<string, PlateFrames> })` (`'use client'`); `Hero()`, `Readouts()`, `WhatItDoes()`, `SameNames()`, `LiveMainnet()`, `Footer()`, `FigurePlate()` (server components; `Sections.tsx` exports the three sections); `VideoPlate()` (`'use client'`) | A.24 names with props |
| `web/components/sim/CanvasReveal.tsx` | `'use client'`; `export default function CanvasReveal(): JSX.Element \| null` — a `DitherCanvas` overlay on the mesh field that runs `revealSteps(cellMesh)` once when `nodes.length` goes 0 → > 0, drawing paper discs at `visiblePositions()`, then unmounts; skipped under `reducedMotion()` and in reel mode until the priming snapshot | spec §7 loading states "canvas reveal on first snapshot (28→3 over the rendered frame)" — Task 5.12 |
| `web/public/stills/grafana.png`, `web/public/stills/jaeger.png` | copies of `assets/readme/grafana.png` / `jaeger.png` (1440×840) | static export serves only `public/` |
| `web/figures/sorter/figure.html` press alias | before `mountFigure`, `history.replaceState` rewrites `press=…Sybil@…` → `Bolt on a Sybil@` (the engine matches button text by prefix) | A.23's `Sybil` short name vs `core.js` `startsWith` matching |
| `Figure` sets `data-narrow="1"` on `.plate` while its width `< narrowAt` | children size themselves (`[data-narrow] .halo { … }`) | the 450 px rule is a ResizeObserver, not a media query |

## A.31 Phase 6 additions — Remotion modules

All under `web/remotion/` unless noted; names A.22 already pins (`props.ts`, `timeline.ts`, `Root.tsx`, `Launch.tsx`, `fonts.css`, `SceneId`, `SceneSpan`, `timeline`, `SAFE_TALL`, `launchSchema`, `LaunchProps`, `LAUNCH_DEFAULTS`) are used verbatim.

| Name | Where | Signature / value | Why |
|---|---|---|---|
| `index.ts` | `remotion/index.ts` | `registerRoot(Root)` | Remotion needs an entry file; `remotion.config.ts` sets `Config.setEntryPoint('./remotion/index.ts')` |
| `video-out/` | `web/video-out/` (gitignored) | replaces `out/` in A.22's `video` script for the three social outputs | `next build` with `output:'export'` deletes and rewrites `web/out` |
| `FPS`, `SIZE` | `timeline.ts` | `FPS = 30`; `SIZE: Record<Orientation, { width; height; durationInFrames }>` = wide 1920×1080×1710, tall 1080×1920×1440 | one source for `Root.tsx` and tests |
| `sceneAt`, `simTimeAt`, `frameForSimTime` | `timeline.ts` | `sceneAt(o: Orientation, frame: number): SceneSpan \| undefined` · `simTimeAt(span: SceneSpan, localFrame: number): number` = `(span.simOffset ?? 0) + localFrame / FPS × (span.speed ?? 1)` · `frameForSimTime(span, t): number` = `span.from + Math.round((t − simOffset) / speed × FPS)` | frame ↔ sim time, tested |
| `ReelData`, `ReelNode`, `ReelSnapshot`, `ReelMessage`, `parseReel`, `snapshotAt`, `analyticsAt` | `reel/parse.ts` | see Task 6.3 | the video's data model |
| `useReel` | `reel/useReel.ts` | `useReel(reel: string): ReelData \| null` | fetch + parse under `delayRender`, module-cached |
| `Box`, `Camera`, `Projector`, `makeProjector`, `lerpCamera` | `mesh/view.ts` | see Task 6.4 | fit the frozen layout into any box; camera scale/focus |
| `Dither` | `layers/Dither.tsx` | `props { width: number; height: number; cell: number; draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void; style?: CSSProperties }` | per-frame deterministic 1-bit pass (the browser `DitherCanvas` is IntersectionObserver/reveal-driven and is not used in the video) |
| `activeParticles`, `PARTICLE_MIN_MS` | `mesh/particles.ts` | see Task 6.5 | message/spam/iwant squares interpolated over `latency_ms` with a 400 ms display floor |
| `attackersAt`, `attackEdgesAt`, `FADE_S` | `mesh/attackers.ts` | see Task 6.5 | attacker presence, grafted/pruned, edge lifetimes from GRAFT/PRUNE events |
| `drawMesh`, `MeshStyle`, `Mesh`, `Attackers` | `mesh/drawMesh.ts`, `mesh/Mesh.tsx`, `mesh/Attackers.tsx` | see Task 6.5 | paper layer (dithered) and flame layer (flat) |
| `tickerAt`, `invalidCountAt`, `scoreAt`, `healedInS`, `fmtTicker` | `mesh/readouts.ts` | see Task 6.6 | every number on screen |
| `Ticker`, `ScoreStrip` | `mesh/Ticker.tsx`, `mesh/ScoreStrip.tsx` | see Task 6.6 | readouts (video-only; not the simulator's `components/sim/Ticker.tsx`) |
| `TOY`, `LIGHTHOUSE`, `SERIES` | `constants.ts` | see Task 6.6 | honesty-card constants, tested against `backend/gossip/engine.py` |
| `Fig`, `Mono`, `StampIn`, `Headline` | `type/*.tsx` | see Task 6.7 | video-only type components; `Stamp` itself is the shared `components/dither/Stamp.tsx` |
| `Parallax`, `useImage`, `DitheredStill` | `layers/Parallax.tsx`, `layers/useImage.ts`, `layers/DitheredStill.tsx` | see Tasks 6.7, 6.11 | depth drift; image → `Dither` |
| `SceneProps`, `LAYOUT`, `SceneLayout`, `Anchor`, `boxes`, `STAMP`, `STAMP_TILT`, `FIG`, `FIG_N`, `HEADLINE`, `HONESTY_ROWS` | `scenes/types.ts`, `scenes/layout.ts`, `scenes/copy.ts` | see Tasks 6.7, 6.12 (`SceneProps` gains `repoUrl: string; eventLine: string` in 6.12) | per-scene layout tables (safe-zone tested), all video strings in one file |
| `public/stills/{grafana,jaeger,geo-wave-0,geo-wave-1,geo-wave-2}.png` | `web/public/stills/` | PNG sources for scenes 8–9, dithered at render time | Remotion `staticFile` needs them under `public/`; phase 5's "Same names" section points at the same two files |
| `make web-video` | `Makefile` | `cd web && npm run video` | A.24 already lists it; this phase adds it |

## A.32 Phase 7 additions — swap artefacts

| Name | Kind | Definition |
|---|---|---|
| `Makefile` post-swap targets | make | see A.0 (A.24 Makefile after the swap) |
| `frontend-build` (Dockerfile stage name) | docker | kept as the stage name; `WORKDIR /web`; `ARG NEXT_PUBLIC_API_URL=` / `ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL`; stage 2 `COPY --from=frontend-build /web/out frontend/dist` |
| `pre-overhaul` | git tag (annotated) | the `master` commit the swap PR merges onto; the last commit whose tree holds `frontend/` |
| `scripts/record_reel.py` `REELS_DIR` | Python constant | `ROOT / "web" / "public" / "reels"` |
| `tests/test_record_reel.py` | pytest | `test_reels_dir_is_web_public_reels`, `test_check_passes_on_shipped_sybil_reel` |
| CI job set | GitHub Actions | `backend-lint`, `backend-test`, `web-build` (from phase 0). Job **`frontend-build` is removed**. |
| `web/lib/contract.test.ts` | vitest | imports every public name of A.2–A.15, A.19, A.21 and the phase additions A.26–A.30 that are modules under `lib/`, `components/map/`, `components/dither/`, `scripts/`; asserts `typeof` for each (Task 7.0) |

---

# Tasks

## Phase 0 — scaffold, tokens, fonts (25 Oct, ½ day)

**Goal:** Stand up `web/` as a Next 16 static export that FastAPI already knows how to serve, with `tokens.css` as the one styling source, three self-hosted fonts visible on empty `/`, `/sim/`, `/figure/`, and `make web*` + a CI `web-build` job — without touching `frontend/`, `backend/` or the deploy files.

**Review focus pinned in this phase** (each line names the task whose test covers it):

1. **`/sim` without a trailing slash** — Starlette must answer 307 → `/sim/`, which only happens when the export writes `sim/index.html` (`trailingSlash: true`); pinned by `next.config.test.ts` and the curl walk in Task 0.1.
2. **A junk URL** — must get `404.html` with status 404, never `index.html` with 200 (a SPA-style catch-all would hide broken reel links in talk notes); curl walk in Task 0.1.
3. **The dev `/api` rewrite leaking into `next build`** — Next warns and the export silently has no proxy; `next.config.test.ts` asserts `rewrites` is `undefined` in the build phase (Task 0.1).
4. **Token drift** — someone edits the tokens block inside `globals.css` instead of `docs/design/tokens.css`; `globals.test.ts` asserts `globals.css` starts with `tokens.css` byte-for-byte (Task 0.2).
5. **Silent font fallback** — if `--font-display` resolves to the `:root` string, text renders in Georgia with no error; `fonts.test.ts` asserts the inline-style override and the browser walk checks `document.fonts` and the computed variable (Task 0.3).

### Task 0.1: Scaffold `web/` as a static export that FastAPI serves

**Files:**
- Create: `web/package.json`, `web/tsconfig.json`, `web/next.config.ts`, `web/eslint.config.mjs`, `web/vitest.config.ts`, `web/app/layout.tsx`, `web/app/page.tsx`, `web/app/sim/page.tsx`, `web/app/figure/page.tsx`, `web/app/not-found.tsx`
- Modify: `.gitignore` (append `web/out/`, `web/next-env.d.ts`, `web/*.tsbuildinfo`; `node_modules/` and `.next/` are already ignored)
- Test: `web/next.config.test.ts`

**Interfaces:**
- Consumes: spec §4.1 tree, §4.2, §4.7; A.1 path alias `@/*`; `backend/main.py:1043` mount.
- Produces: `config(phase: string): NextConfig` (default export of `next.config.ts`); `package.json` scripts `dev` (`next dev`), `build` (`next build`), `start` (`next start`, unused), `lint` (`eslint .`), `test` (`vitest run`), `test:watch` (`vitest`); `vitest.config.ts` with `test: { environment: 'jsdom', include: ['**/*.test.{ts,tsx}'] }`, `esbuild: { jsx: 'automatic' }` and `resolve.alias: { '@': __dirname }` (phase 2's `.test.tsx` files depend on both); `tsconfig.json` `paths: { '@/*': ['./*'] }`; four pre-rendered routes `/`, `/sim/`, `/figure/`, `/404.html`; `RootLayout` rendering `<html lang="en" data-theme="dark">`.

- [ ] **Step 1: Write the failing test**

```ts
// web/next.config.test.ts
import { test, expect } from 'vitest'
import config from './next.config'

test('export settings the FastAPI mount depends on', () => {
  const c = config('phase-production-build')
  expect(c.output).toBe('export')
  expect(c.trailingSlash).toBe(true)
  expect(c.images?.unoptimized).toBe(true)
  expect(c.rewrites).toBeUndefined()
})

test('dev proxies /api to :8000 and nothing else', async () => {
  const c = config('phase-development-server')
  expect(await c.rewrites!()).toEqual([
    { source: '/api/:path*', destination: 'http://localhost:8000/api/:path*' },
  ])
})
```

- [ ] **Step 2: Write `web/package.json` and resolve the open pins**

Run: `cd /home/yks/Projects/luminar && mkdir -p web && cd web && for p in eslint vitest jsdom @types/culori @types/react @types/react-dom; do echo "$p $(npm view $p version)"; done; echo "@types/node $(npm view @types/node@22 version | tail -1 | awk '{print $2}' | tr -d "'")"`
Expected: one line per package; write each value **exact** (no `^`) into `package.json`:

- `dependencies`: `next` 16.4.3 · `react` 19.3.1 · `react-dom` 19.3.1 · `zustand` 5.0.16 · `@deck.gl/core` `@deck.gl/layers` `@deck.gl/extensions` 9.4.0 · `@luma.gl/core` `@luma.gl/webgl` 9.4.2 · `d3-force` 3.0.0 · `culori` 4.0.2
- `devDependencies`: `typescript` 5.9.3 · `eslint-config-next` 16.4.3 · `@types/d3-force` 3.0.10 · `@fontsource/instrument-serif` 5.3.0 · `@fontsource/ibm-plex-mono` 5.3.0 · `@fontsource-variable/manrope` 5.3.0 · `eslint`, `vitest`, `jsdom`, `@types/node` (22.x), `@types/react`, `@types/react-dom`, `@types/culori` at the values just printed
- `"name": "luminar-web"`, `"private": true`, scripts exactly as listed under Produces. No `"type": "module"` (Next's default; `eslint.config.mjs` is ESM by extension).

- [ ] **Step 3: Install and verify the pins are exact**

Run: `cd /home/yks/Projects/luminar/web && npm install && grep -c '"\^\|"~' package.json; node -e "console.log(require('next/package.json').version)"`
Expected: `package-lock.json` written; grep prints `0`; node prints `16.4.3`.

- [ ] **Step 4: Run the test to verify it fails**

Run: `cd /home/yks/Projects/luminar/web && npx vitest run next.config.test.ts`
Expected: FAIL — `vitest.config.ts` / `next.config.ts` not found.

- [ ] **Step 5: Write the config files**

`web/next.config.ts` — `import type { NextConfig } from 'next'`, `import { PHASE_DEVELOPMENT_SERVER } from 'next/constants'`; default-export `(phase: string): NextConfig => ({ output: 'export', trailingSlash: true, images: { unoptimized: true }, ...(phase === PHASE_DEVELOPMENT_SERVER && { rewrites: async () => [{ source: '/api/:path*', destination: 'http://localhost:8000/api/:path*' }] }) })`.

`web/tsconfig.json` — Next 16 defaults (`target` ES2022, `lib` `["dom","dom.iterable","esnext"]`, `strict`, `noEmit`, `module` esnext, `moduleResolution` bundler, `jsx` `react-jsx`, `isolatedModules`, `resolveJsonModule`, `esModuleInterop`, `skipLibCheck`, `incremental`, `plugins: [{ "name": "next" }]`) plus `"paths": { "@/*": ["./*"] }`; `include` `["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"]`, `exclude` `["node_modules", "out"]`. If `next build` appends fields, keep its edits.

`web/eslint.config.mjs` — the shape `create-next-app@16` writes: `defineConfig([...nextVitals, ...nextTs, globalIgnores(['.next/**', 'out/**', 'next-env.d.ts'])])` with `nextVitals` from `eslint-config-next/core-web-vitals` and `nextTs` from `eslint-config-next/typescript` (follow the installed package's README if its export names differ).

`web/vitest.config.ts` — `defineConfig({ test: { environment: 'jsdom', include: ['**/*.test.{ts,tsx}'], exclude: ['**/node_modules/**', 'out/**', '.next/**'] }, esbuild: { jsx: 'automatic' }, resolve: { alias: { '@': __dirname } } })` from `vitest/config`.

- [ ] **Step 6: Write the layout and the four pages**

`web/app/layout.tsx` — server component; `export const metadata: Metadata = { title: { default: 'Luminar', template: '%s · Luminar' }, description: 'Real-time GossipSub v1.1 simulator' }`; `export default function RootLayout({ children }: { children: React.ReactNode })` returning `<html lang="en" data-theme="dark"><body>{children}</body></html>`. No CSS import yet (Task 0.2), no fonts yet (Task 0.3).

`web/app/page.tsx`, `web/app/sim/page.tsx` (`metadata.title = 'Simulator'`), `web/app/figure/page.tsx` (`metadata.title = 'Figure'`) — each returns the same specimen with its own route label, using classes Task 0.2 defines (unstyled until then):

```tsx
<main style={{ padding: 'var(--gutter, 16px)' }}>
  <p className="t-ui">LUMINAR <span className="t-label">gossipsub v1.1</span></p>
  <h1 className="t-display">Fifty peers, <em>five Sybils grafted at once.</em></h1>
  <p className="num">T+ 12.3s · /sim/</p>   {/* '/' and '/figure/' on the other two */}
</main>
```

`web/app/not-found.tsx` — `<main>` with `<h1 className="t-display">Not found</h1>` and a `<p className="t-ui">` holding links to `/` and `/sim/`.

- [ ] **Step 7: Build, type-check, lint, test**

Run: `cd /home/yks/Projects/luminar/web && npm run build && ls out/index.html out/sim/index.html out/figure/index.html out/404.html && npx tsc --noEmit && npm run lint && npx vitest run`
Expected: build log lists `○ /`, `○ /_not-found`, `○ /figure`, `○ /sim` as static; all four files listed; tsc and lint clean; `2 passed`. The build log must **not** contain `Specified "rewrites"` (Review Focus 3).

- [ ] **Step 8: Prove the FastAPI mount (curl walk, backend on a spare port)**

Run, as one block from `/home/yks/Projects/luminar`:

```bash
[ -e frontend/dist ] && mv frontend/dist frontend/dist.bak
ln -s ../web/out frontend/dist
uv run uvicorn backend.main:app --port 8001 & PID=$!; sleep 4
curl -s -o /dev/null -w '%{http_code} %{redirect_url}\n' http://localhost:8001/sim
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:8001/sim/
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:8001/figure/
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:8001/no-such-page
curl -s http://localhost:8001/no-such-page | grep -c 'Not found'
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:8001/api/sim/snapshot
kill $PID; rm frontend/dist; [ -e frontend/dist.bak ] && mv frontend/dist.bak frontend/dist; ls -la frontend/dist 2>&1 | head -1
```

Expected, line by line: `307 http://localhost:8001/sim/` · `200` · `200` · `404` · `1` (our `not-found.tsx` text, served as `404.html`) · `200` (API still wins over the mount) · final `ls` shows no symlink left behind (either the restored directory or "No such file").

- [ ] **Step 9: Append to `.gitignore` and commit**

Append under the `# Node` block: `web/out/`, `web/next-env.d.ts`, `web/*.tsbuildinfo`. Then:

```bash
git add .gitignore web/package.json web/package-lock.json web/tsconfig.json web/next.config.ts web/next.config.test.ts web/eslint.config.mjs web/vitest.config.ts web/app
git status --short web | grep -v '^A ' ; git commit -m "feat(web): scaffold Next 16 static export with the FastAPI mount contract"
```

Expected: the `grep` prints nothing (no `node_modules`, `out`, `.next` staged).

### Task 0.2: `globals.css` = tokens verbatim + base rules

**Files:**
- Create: `web/app/globals.css`
- Modify: `web/app/layout.tsx` (add `import './globals.css'`)
- Test: `web/app/globals.test.ts`

**Interfaces:**
- Consumes: `docs/design/tokens.css` (307 lines, the single source); spec §4.3, §5, §10.
- Produces: the base classes listed under "New interfaces" with these exact rules —
  - `.hair` (`border-top: var(--hair-w) solid var(--hair)`), `.plate` (`background: var(--bg); color: var(--fg); position: relative`; the light-mode override already lives in tokens.css:280-290)
  - `.t-display` (`font: 400 var(--t-h1)/var(--lh-tight) var(--font-display)`; `em` inside → `font-style: italic`), `.t-poster` (same face at `--t-poster`, `letter-spacing: var(--track-poster)`), `.t-fig` (display italic `--t-fig`), `.t-narr` (display italic `--t-narr`), `.t-ui` (`600 var(--t-ui)/var(--lh-ui) var(--font-ui)`), `.t-label` (`500 var(--t-label)/1 var(--font-mono)`, `text-transform: uppercase`, `letter-spacing: var(--track-label)`, `color: var(--fg-3)`), `.t-micro` (`--t-micro`, mono), `.t-kpi` (`500 var(--t-kpi)/1 var(--font-mono)`), `.num` (mono, `font-feature-settings: var(--tnum)`, `font-variant-numeric: tabular-nums`)
  - `.btn` (mono `--t-ui`, `border: var(--hair-w) solid var(--hair-strong)`, `padding: 0 var(--s-3)`, `height: 32px`, `border-radius: var(--r-0)`, `transition: transform var(--d-press) var(--ease)`, `:active { transform: scale(.97) }`, `:hover { background: var(--wash) }`), `.btn-primary` (`background: var(--fg); color: var(--bg); border-color: var(--fg)`)
  - `.menu` (`background: var(--raised); border: var(--hair-w) solid var(--hair-strong); padding: var(--s-1) 0; min-width: 220px; margin: 0`; popover positioning is phase 3's call, spec §12), `.menu-item` (mono `--t-body`, `height: var(--row-h)` min, `padding: 0 var(--s-3)`, `:hover, &[aria-current="true"] { background: var(--wash-bg) }`), `.menu-sep` (`border-top: var(--hair-w) solid var(--hair); margin: var(--s-1) 0`)
  - `kbd` (`font: 500 var(--t-micro)/1 var(--font-mono); border: var(--hair-w) solid var(--hair-strong); padding: 1px 4px; color: var(--fg-2)`), `.sr-only` (the standard clip pattern)
  - reset: `*, *::before, *::after { box-sizing: border-box; margin: 0 }`; `html { background: var(--bg); color: var(--fg); font: 400 var(--t-body)/var(--lh-body) var(--font-mono); font-variant-numeric: tabular-nums; -webkit-font-smoothing: antialiased; color-scheme: dark; }`; `body { min-height: 100dvh }`; `button, input, select, textarea { font: inherit; color: inherit; background: none; border: 0; border-radius: var(--r-0) }`; `a { color: inherit }`; `canvas, img, video, svg { display: block; max-width: 100% }`
  - `:focus-visible { outline: var(--hair-w2) solid var(--focus); outline-offset: 2px }` — never removed anywhere (spec §10)

- [ ] **Step 1: Write the failing test**

```ts
// web/app/globals.test.ts
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { test, expect } from 'vitest'

const tokens = readFileSync(resolve(__dirname, '../../docs/design/tokens.css'), 'utf8')
const globals = readFileSync(resolve(__dirname, 'globals.css'), 'utf8')

test('globals.css begins with docs/design/tokens.css verbatim', () => {
  expect(globals.startsWith(tokens)).toBe(true)
})

test('base rules keep the focus ring, tabular numerals and square corners', () => {
  expect(globals).toMatch(/:focus-visible\s*\{[^}]*outline:\s*var\(--hair-w2\) solid var\(--focus\)/)
  expect(globals).toMatch(/font-variant-numeric:\s*tabular-nums/)
  expect(globals.slice(tokens.length)).toMatch(/color-scheme:\s*dark/)
  expect(globals.slice(tokens.length)).not.toMatch(/outline:\s*(none|0)\b/)
  expect(globals.slice(tokens.length)).not.toMatch(/border-radius:(?!\s*var\(--r-(0|node)\))/)
})

test('no network stylesheet or shard/slab decoration', () => {
  expect(globals).not.toMatch(/googleapis|fontshare|@import\s+url\(\s*['"]?https?:/)
  expect(globals.slice(tokens.length)).not.toMatch(/shard|slab|--halftone/)
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd /home/yks/Projects/luminar/web && npx vitest run app/globals.test.ts`
Expected: FAIL — `ENOENT ... app/globals.css`.

- [ ] **Step 3: Write `web/app/globals.css`**

Run: `cd /home/yks/Projects/luminar/web && cp ../docs/design/tokens.css app/globals.css && printf '\n/* ===== base rules (phase 0; tokens above are verbatim from docs/design/tokens.css — edit them only there) ===== */\n' >> app/globals.css`, then append the base rules from the Interfaces block (reset → focus → type classes → `.hair`/`.plate` → buttons → menu → `kbd`/`.sr-only`). Target ≤ 150 added lines. Add `import './globals.css'` as the first line of `web/app/layout.tsx`.

- [ ] **Step 4: Run the tests, type-check, lint, build**

Run: `cd /home/yks/Projects/luminar/web && npx vitest run && npx tsc --noEmit && npm run lint && npm run build`
Expected: `5 passed`; tsc, lint, build clean.

- [ ] **Step 5: Browser walk (chrome-devtools MCP against `npm run dev`)**

Run: `cd /home/yks/Projects/luminar/web && npm run dev` (port 3000). Then:

1. `navigate_page` → `http://localhost:3000/sim/`.
2. `evaluate_script` → `getComputedStyle(document.documentElement).getPropertyValue('--pitch-0').trim()` — expected `oklch(15.1% 0.004 286)` (Chrome applies the `@supports` override; `#0b0b0d` only on a browser without OKLCH).
3. `evaluate_script` → `getComputedStyle(document.body).backgroundColor` — expected a near-black (`oklch(0.151 0.004 286)` or `rgb(11, 11, 13)`), and `getComputedStyle(document.body).color` an off-white (`rgb(242, 242, 239)` equivalent).
4. `take_screenshot` — the specimen is light text on a near-black field, square corners, `T+ 12.3s · /sim/` with tabular digits; no scrollbar colour mismatch (`color-scheme: dark`).
5. `press_key` `Tab` until the first link in `not-found` (navigate to `http://localhost:3000/zzz` first) has focus; `take_screenshot` — a 2 px off-white outline 2 px outside the link, no rounded corners.

- [ ] **Step 6: Commit**

```bash
git add web/app/globals.css web/app/globals.test.ts web/app/layout.tsx
git commit -m "feat(web): tokens.css verbatim and base rules in globals.css"
```

### Task 0.3: Self-hosted fonts via `next/font/local`

**Files:**
- Create: `web/public/fonts/instrument-serif-latin-400-normal.woff2`, `web/public/fonts/instrument-serif-latin-400-italic.woff2`, `web/public/fonts/ibm-plex-mono-latin-400-normal.woff2`, `web/public/fonts/ibm-plex-mono-latin-500-normal.woff2`, `web/public/fonts/ibm-plex-mono-latin-600-normal.woff2`, `web/public/fonts/manrope-latin-wght-normal.woff2`
- Modify: `web/app/layout.tsx`
- Test: `web/app/fonts.test.ts`

**Interfaces:**
- Consumes: spec §4.6; `tokens.css:160-162` (`--font-display`, `--font-mono`, `--font-ui` fallback stacks); the fontsource packages installed in Task 0.1.
- Produces: `<html>` carrying `style="--font-display: …; --font-mono: …; --font-ui: …"` with the hashed `next/font` families; `/fonts/*.woff2` served from the frontend origin (for Remotion's `@font-face` in phase 6 and the `/figure/` iframe in phase 5); the six file names above are the canonical ones later phases reference.

- [ ] **Step 1: Write the failing test**

```ts
// web/app/fonts.test.ts
import { existsSync, statSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { test, expect } from 'vitest'

const FILES = [
  'instrument-serif-latin-400-normal.woff2', 'instrument-serif-latin-400-italic.woff2',
  'ibm-plex-mono-latin-400-normal.woff2', 'ibm-plex-mono-latin-500-normal.woff2', 'ibm-plex-mono-latin-600-normal.woff2',
  'manrope-latin-wght-normal.woff2',
]
const layout = readFileSync(resolve(__dirname, 'layout.tsx'), 'utf8')

test('the six woff2 files are in public/fonts and non-empty', () => {
  for (const f of FILES) {
    const p = resolve(__dirname, '../public/fonts', f)
    expect(existsSync(p), f).toBe(true)
    expect(statSync(p).size).toBeGreaterThan(1000)
  }
})

test('layout loads fonts locally and writes the three variables as an inline style', () => {
  expect(layout).toMatch(/from 'next\/font\/local'/)
  expect(layout).not.toMatch(/next\/font\/google|googleapis|fontshare/)
  for (const v of ['--font-display', '--font-mono', '--font-ui']) expect(layout).toContain(`'${v}'`)
  expect(layout).toMatch(/<html[^>]*style=\{/)
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd /home/yks/Projects/luminar/web && npx vitest run app/fonts.test.ts`
Expected: FAIL — `instrument-serif-latin-400-normal.woff2: expected false to be true`.

- [ ] **Step 3: Copy the files once from the fontsource packages**

Run:
```bash
cd /home/yks/Projects/luminar/web && mkdir -p public/fonts && \
cp node_modules/@fontsource/instrument-serif/files/instrument-serif-latin-400-{normal,italic}.woff2 public/fonts/ && \
cp node_modules/@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-{400,500,600}-normal.woff2 public/fonts/ && \
cp node_modules/@fontsource-variable/manrope/files/manrope-latin-wght-normal.woff2 public/fonts/ && \
ls -la public/fonts && du -sh public/fonts
```
Expected: six files, total under 400 KB. (OFL licences ship inside the packages; no licence file is needed next to the woff2s.)

- [ ] **Step 4: Declare the fonts in `web/app/layout.tsx`**

`import localFont from 'next/font/local'`, then at module scope:
- `const display = localFont({ src: [{ path: '../public/fonts/instrument-serif-latin-400-normal.woff2', weight: '400', style: 'normal' }, { path: '../public/fonts/instrument-serif-latin-400-italic.woff2', weight: '400', style: 'italic' }], display: 'swap' })`
- `const mono = localFont({ src: [400, 500, 600 weights from the three ibm-plex-mono files, style 'normal'], display: 'swap' })`
- `const ui = localFont({ src: '../public/fonts/manrope-latin-wght-normal.woff2', weight: '200 800', display: 'swap' })`

Render `<html lang="en" data-theme="dark" style={{ '--font-display': display.style.fontFamily, '--font-mono': mono.style.fontFamily, '--font-ui': ui.style.fontFamily } as React.CSSProperties}>`. No `variable:` option, no `className` on `<html>` (one mechanism only; see "New interfaces").

- [ ] **Step 5: Run the tests, type-check, lint, build, and the CDN grep**

Run: `cd /home/yks/Projects/luminar/web && npx vitest run && npx tsc --noEmit && npm run lint && npm run build && grep -r "fonts.googleapis\|fontshare" out; echo "grep exit $?"; ls out/_next/static/media/*.woff2 | wc -l; ls out/fonts | wc -l`
Expected: `7 passed`; tsc/lint/build clean; `grep exit 1` (no matches); `6` media files emitted by `next/font`; `6` raw files under `out/fonts`.

- [ ] **Step 6: Browser walk (chrome-devtools MCP against `npm run dev`)**

For each of `http://localhost:3000/`, `http://localhost:3000/sim/`, `http://localhost:3000/figure/`:

1. `navigate_page` → URL; `wait_for` text `LUMINAR`.
2. `evaluate_script` → `document.fonts.ready.then(() => [...document.fonts].filter(f => f.status === 'loaded').map(f => f.family + ' ' + f.weight + ' ' + f.style).sort())` — expected entries whose families start with `__Instrument_Serif` (400 normal **and** 400 italic), `__IBM_Plex_Mono` (400, 500, 600) and `__Manrope` (`200 800`); no `Georgia`, `Menlo` or `Segoe UI` entry.
3. `evaluate_script` → `getComputedStyle(document.documentElement).getPropertyValue('--font-display').trim().startsWith("'__Instrument_Serif")` — expected `true` (Review Focus 5); same for `--font-mono` → `__IBM_Plex_Mono`, `--font-ui` → `__Manrope`.
4. `take_screenshot` — headline in a high-contrast serif with the second clause italic; `LUMINAR` in a geometric sans at 600; `T+ 12.3s` in a mono with equal-width digits.
5. `list_network_requests` — every request host is `localhost:3000`; zero requests to any other host.

- [ ] **Step 7: Commit**

```bash
git add web/public/fonts web/app/layout.tsx web/app/fonts.test.ts
git commit -m "feat(web): self-host Instrument Serif, IBM Plex Mono and Manrope via next/font/local"
```

### Task 0.4: Makefile targets and the CI `web-build` job

**Files:**
- Modify: `Makefile` (`.PHONY` line; new section `# ── Web (Next.js overhaul) ──` after `# ── Quality ──`), `.github/workflows/ci.yml` (new job after `frontend-build`)
- Test: none in vitest (shell assertions below); `make check` remains the regression guard for `frontend/` and `backend/`.

**Interfaces:**
- Consumes: A.24 Makefile block; spec §11 Phase 0 CI line; the scripts from Task 0.1.
- Produces: `make web` (`cd web && npm run dev`), `make web-build` (`cd web && npm run build`), `make web-test` (`cd web && npx vitest run`), `make web-check` (`cd web && npx tsc --noEmit && npm run lint && npx vitest run`); CI job id `web-build`, name `Web Build`. (`web-stats` is added by Task 5.0, `web-video` by Task 6.1.)

- [ ] **Step 1: Verify the targets are missing**

Run: `cd /home/yks/Projects/luminar && make -n web-check; echo "exit $?"`
Expected: `make: *** No rule to make target 'web-check'.  Stop.` and `exit 2`.

- [ ] **Step 2: Add the Makefile targets**

Each with a `## …` help comment so `make help` lists it; add `web web-build web-test web-check` to `.PHONY`. Old targets untouched (`install`, `clean`, `check` change in phase 7).

- [ ] **Step 3: Add the CI job**

After `frontend-build` in `.github/workflows/ci.yml`:

```yaml
  web-build:
    name: Web Build
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
          cache-dependency-path: web/package-lock.json
      - run: cd web && npm ci
      - run: cd web && npx tsc --noEmit
      - run: cd web && npm run lint
      - run: cd web && npx vitest run
      - run: cd web && npm run build
```

- [ ] **Step 4: Verify locally**

Run: `cd /home/yks/Projects/luminar && make -n web-check && make help | grep -c '^.*web' && make web-check && make web-build && make check && grep -c 'web-build:\|cache-dependency-path: web/package-lock.json\|node-version: 22' .github/workflows/ci.yml && python3 -c "import yaml,sys; d=yaml.safe_load(open('.github/workflows/ci.yml')); print(sorted(d['jobs']))" 2>/dev/null || echo "pyyaml absent — grep line above is the check"`
Expected: the `-n` line prints `cd web && npx tsc --noEmit && npm run lint && npx vitest run`; help count `4`; `make web-check`, `make web-build`, `make check` all exit 0 (ruff, pytest, `frontend/` tsc + vite build untouched); grep count `4` (two `node-version: 22`, one job key, one cache path); the yaml line, if pyyaml is present, prints `['backend-lint', 'backend-test', 'frontend-build', 'web-build']`.

- [ ] **Step 5: Node 22 parity check (CI runs 22, the laptop runs 26)**

Run: `cd /home/yks/Projects/luminar/web && node -e "const v=process.versions.node.split('.')[0]; console.log(v>=22?'ok '+v:'too old '+v)"; grep -o '"node": *"[^"]*"' package.json || echo "no engines field (intended)"`
Expected: `ok 26` (or `ok 22`); no `engines` field — the pin lives in CI and the Dockerfile, not in `package.json`.

- [ ] **Step 6: Commit**

```bash
git add Makefile .github/workflows/ci.yml
git commit -m "chore(web): Makefile web targets and CI web-build job"
```

---

### Phase acceptance gate (spec §11, Phase 0 — verbatim)

> Parity checklist: `web/` created with §4.1's `next.config.ts`; `globals.css` = tokens.css +
> base rules; three fonts self-hosted and visible on an empty `/`, `/sim/`, `/figure/`; `make web`,
> `make web-build`, `make web-check`; `.github/workflows/ci.yml` gains a `web-build` job
> (`node-version: 22`, `npm ci`, `tsc`, `lint`, `build`, `cache-dependency-path: web/package-lock.json`).
> Acceptance: `npm run build` writes `web/out/sim/index.html`; `ln -s ../web/out frontend/dist`
> on a scratch copy proves FastAPI serves `/sim/` with a 307 from `/sim` and `404.html` for junk;
> `grep -r "fonts.googleapis\|fontshare" web/out` is empty.

> Every phase ends with `cd web && npx tsc --noEmit && npm run lint && npm run build` green and
> `make check` still green for `frontend/` and `backend/`.

---

## Phase 1 — data layer and store (25–26 Oct, 1 day)

**Goal:** Land `web/lib/` (types, format, copy, keys, REST client, frame dispatcher, WebSocket manager, reel player, zustand store) as vitest-tested modules, and a `SimApp` that connects on mount, disconnects on unmount, and shows the connection pill and the clock from selectors.

**Review focus pinned in this phase** (each line names the task whose test covers it):

1. **Reel JSONL line split across two stream chunks** — the parser carries the partial tail; no frame dropped or parsed twice (Task 1.8 `parseReelChunk carries a partial line across chunks`).
2. **`post()` against a 403 or a dead backend** — `{ok:false,status:403}` / `{ok:false,status:0}`, never a throw, and `toastFor` says `failed · 403` / `backend offline` (Task 1.4).
3. **`disconnect()` during a pending reconnect; `connect()` twice; StrictMode mount→unmount→mount** — no reconnect after disconnect, one live socket, superseded handlers inert (Task 1.7 and the walk in Task 1.10).
4. **A stale `ClockTick` in the same reel step as a newer snapshot** — pending events flush before a typed frame applies, so the snapshot's `time` wins (Task 1.6 `a typed frame flushes pending events first`, Task 1.8 play test asserts `simTime` 1.5).
5. **Keys with modifiers, `?` (Shift+/), focus in a range input vs a text input** (Task 1.3).

### Task 1.1: vitest harness, `lib/types.ts`, `lib/format.ts`

**Files:**
- Create: `web/lib/types.ts`, `web/lib/format.ts`, `web/lib/fixtures.ts`
- Modify: none (vitest, `vitest.config.ts`, the `test` scripts, `make web-test`/`web-check` and the CI vitest step exist since Tasks 0.1 and 0.4)
- Test: `web/lib/types.test.ts`, `web/lib/format.test.ts`

**Interfaces:**
- Consumes: the phase-0 scaffold (`web/package.json`, `tsconfig.json`, `app/globals.css`).
- Produces: every type in A.2 (`LayoutMode`, `SimState`, `NodeState`, `EventCategory`, `PeerNode`, `Edge`, `LayoutEdge`, `AppEvent`, `SnapshotFrame`, `MetricsFrame`, `CdfPoint`, `AnalyticsFrame`, `TelemetryPeer`, `MainnetStatus`, `TelemetryStatusFrame`, `EdgesFrame`, `ScenarioPhase`, `ScenarioDefinition`, `ScenarioStatus`, `ScenarioFrame`, `GapFrame`, `TypedFrame`, `WsFrame`, `isTypedFrame`, `ReelMeta`, `ReelManifest`, `ReelFrame`, `ReelState`, `ActiveFault`, `Toast`, `BeatKind`, `Beat`, `Caption`, `Scale`, `AnalyticsSample`, `ScoreBand`, `ConnectionPill`, `RGBA`); A.3 (`formatTime`, `formatNumber`, `fmtCount`, `fmtLatency`, `signed`, `shortName`, `shortId`, `isAttackerId`, `isPruned`, `cdfStats`) plus `isSimPeer`; fixtures `peerNode`, `snapWith`.

- [ ] **Step 1: Write the failing tests**

```ts
// web/lib/types.test.ts
import { test, expect } from 'vitest'
import { isTypedFrame } from '@/lib/types'
test('events have no type field; typed frames do', () => {
  expect(isTypedFrame({ at: 1, event_type: 'ClockTick', category: 'clock' })).toBe(false)
  expect(isTypedFrame({ type: 'gap', dropped: 3 })).toBe(true)
})

// web/lib/format.test.ts
import { test, expect } from 'vitest'
import { formatTime, formatNumber, fmtCount, fmtLatency, signed, shortName, shortId, isAttackerId, isPruned, isSimPeer, cdfStats } from '@/lib/format'
test('formatTime rounds before splitting', () => {
  expect(formatTime(119.96)).toBe('2:00'); expect(formatTime(12.34)).toBe('12.3s'); expect(formatTime(-1)).toBe('0.0s'); expect(formatTime(NaN)).toBe('0.0s')
})
test('shortName / shortId / isAttackerId / isPruned / isSimPeer', () => {
  expect(shortName({ peer_id: 'peer-12', index: 12 })).toBe('n12')
  expect(shortName({ peer_id: 'sybil-0', index: 50 })).toBe('sybil-0')
  expect(shortId('peer-7')).toBe('n7'); expect(shortId('eclipse-1')).toBe('eclipse-1')
  expect(isAttackerId('eclipse-3')).toBe(true); expect(isAttackerId('sybil-0')).toBe(true); expect(isAttackerId('peer-3')).toBe(false)
  expect(isPruned({ state: 'attacker', connected_peers: [] })).toBe(true)
  expect(isPruned({ state: 'attacker', connected_peers: ['peer-1'] })).toBe(false)
  expect(isPruned({ state: 'idle', connected_peers: [] })).toBe(false)
  expect(isSimPeer({})).toBe(true); expect(isSimPeer({ is_real: true })).toBe(false); expect(isSimPeer({ is_telemetry: true })).toBe(false)
})
test('fmtCount / formatNumber / fmtLatency / signed / cdfStats', () => {
  expect(fmtCount(1284)).toBe('1,284'); expect(fmtCount(61900)).toBe('61.9K'); expect(formatNumber(1_200_000)).toBe('1.2M')
  expect(fmtLatency(1200)).toBe('1.2s'); expect(fmtLatency(190.4)).toBe('190ms')
  expect(signed(-0.25)).toBe('-0.25'); expect(signed(1)).toBe('+1.00')
  expect(cdfStats([{ percentile: 0, latency_ms: 10 }, { percentile: 50, latency_ms: 40 }, { percentile: 100, latency_ms: 90 }])).toEqual({ min: 10, max: 90, p50: 40 })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `cd /home/yks/Projects/luminar/web && npx vitest run lib/types.test.ts lib/format.test.ts`
Expected: FAIL — "Cannot find module '@/lib/types'".

- [ ] **Step 3: Confirm the harness** — `cd /home/yks/Projects/luminar/web && npx vitest --version && grep -c "test.{ts,tsx}" vitest.config.ts` → the pinned version and `1` (Task 0.1). Nothing to add.

- [ ] **Step 4: Implement `web/lib/types.ts` (A.2 verbatim; `isTypedFrame = (f) => 'type' in f && typeof f.type === 'string'`), `web/lib/format.ts` (A.3 signatures ported from `frontend/src/format.ts`, `ui/stats-panel.ts:24`, `charts/sparkline.ts:9-16`; `signed(v) = (v < 0 ? '-' : '+') + Math.abs(v).toFixed(2)`; `shortId(id) = id.startsWith('peer-') ? 'n' + id.slice(5) : id`; `isAttackerId = /^(sybil|eclipse)-/`; `isPruned = state === 'attacker' && connected_peers.length === 0`; `isSimPeer` per A.0/A.3), and `web/lib/fixtures.ts` (`peerNode`, `snapWith` per A.26).**

- [ ] **Step 5: Run to verify pass**

Run: `cd /home/yks/Projects/luminar/web && npx vitest run lib/types.test.ts lib/format.test.ts && npx tsc --noEmit && npm run lint`
Expected: `Tests 4 passed`, tsc and lint clean.

- [ ] **Step 6: Commit**

```bash
git add web/lib/types.ts web/lib/format.ts web/lib/fixtures.ts web/lib/types.test.ts web/lib/format.test.ts
git commit -m "feat(web): shared types, format helpers and vitest harness"
```

### Task 1.2: Copy module and the forbidden-phrase guard

**Files:**
- Create: `web/lib/copy.ts`
- Test: `web/lib/copy.test.ts`

**Interfaces:**
- Produces: A.4 names (`MECHANISM`, `RECORDINGS`, `RECORDING_NOT_RUN`, `ARRIVAL`, `PROVENANCE`, `MESH_HIDDEN`, `SCRUB_LIVE`, `ECLIPSE_WHY`, `SAME_NAMES`, `REEL_GUARD`, `geoOnly`, `FIG1`, `FIG2`, `FIG3`, `EVENT_LINE`, `REPO_URL`, `FORBIDDEN`).

- [ ] **Step 1: Write the failing test**

```ts
import { test, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { FORBIDDEN, PROVENANCE, MECHANISM, RECORDING_NOT_RUN, ARRIVAL, REEL_GUARD, geoOnly } from '@/lib/copy'
test('honesty sentences are verbatim', () => {
  expect(MECHANISM).toBe('Same mechanism, toy constants.')
  expect(PROVENANCE).toBe('arrival at observer nodes, not mesh paths · data: ethPandaOps (CC BY 4.0)')
  expect(ARRIVAL).toBe('arrival at observer nodes, ~2.5 min behind')
  expect(RECORDING_NOT_RUN).toBe('reproducible recording, not an identical run')
  expect(REEL_GUARD).toBe('Press 0 to leave the reel first')
  expect(geoOnly('radial')).toBe('Geo shows real observers only — switched to radial')
})
test('forbidden phrases appear only in lib/copy.ts', () => {
  const hits: string[] = []
  const walk = (d: string) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) { if (!/node_modules|^out$|\.next/.test(f)) walk(p) } else if (/\.(tsx?|mjs|css|json)$/.test(f) && !p.endsWith('lib/copy.ts') && !p.endsWith('copy.test.ts')) { const s = readFileSync(p, 'utf8').toLowerCase(); for (const w of FORBIDDEN) if (s.includes(w.toLowerCase())) hits.push(`${p}: ${w}`) } } }
  for (const d of ['app', 'components', 'lib', 'remotion']) { try { walk(join(__dirname, '..', d)) } catch { /* dir absent in this phase */ } }
  expect(hits).toEqual([])
})
```

- [ ] **Step 2: Run to verify failure** — `cd /home/yks/Projects/luminar/web && npx vitest run lib/copy.test.ts` → FAIL, "Cannot find module '@/lib/copy'".
- [ ] **Step 3: Implement `web/lib/copy.ts` exactly as A.4** (every string verbatim; `FORBIDDEN` is `as const`).
- [ ] **Step 4: Run to verify pass** — same command → `Tests 2 passed`.
- [ ] **Step 5: Commit**

```bash
git add web/lib/copy.ts web/lib/copy.test.ts
git commit -m "feat(web): copy module with the honesty sentences and a forbidden-phrase test"
```

### Task 1.3: Keyboard binding table

**Files:**
- Create: `web/lib/keys.ts`
- Test: `web/lib/keys.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: A.5 (`KeyAction`, `KeyBinding`, `KEY_BINDINGS`, `isTypingTarget`, `actionForKey`, `KBD_HINT`). Phase 3's `SimApp` keydown listener and `KeyHelp` overlay consume these; the dispatch table `runKey` is A.12 (phase 3).

- [ ] **Step 1: Write the failing test** (inventory §2: ignored in `TEXTAREA`/`SELECT`/non-range `INPUT` and with Ctrl/Meta/Alt; spec §6.2 adds `r` and `?`)

```ts
import { test, expect } from 'vitest'
import { actionForKey, isTypingTarget, KEY_BINDINGS, KBD_HINT } from '@/lib/keys'
const ev = (key: string, extra: Partial<Pick<KeyboardEvent, 'ctrlKey' | 'metaKey' | 'altKey'>> = {}, tag = 'div', type = '') => {
  const target = document.createElement(tag); if (type) (target as HTMLInputElement).type = type
  return { key, ctrlKey: false, metaKey: false, altKey: false, target, ...extra }
}
test('every spec shortcut maps to its action', () => {
  expect(actionForKey(ev(' '))).toEqual({ action: 'togglePlay' })
  expect(actionForKey(ev('f'))).toEqual({ action: 'fitView' })
  expect(actionForKey(ev('Escape'))).toEqual({ action: 'escape' })
  expect(actionForKey(ev('3'))).toEqual({ action: 'reel', arg: 2 })
  expect(actionForKey(ev('9'))).toEqual({ action: 'reel', arg: 8 })
  expect(actionForKey(ev('0'))).toEqual({ action: 'backToLive' })
  for (const [k, a] of [['s', 'share'], ['t', 'toggleStage'], ['h', 'toggleHero'], ['r', 'reset'], ['?', 'toggleKeyHelp']] as const) expect(actionForKey(ev(k))).toEqual({ action: a })
  expect(actionForKey(ev('F'))).toBeNull()   // case-sensitive lowercase, as today
})
test('modifiers and typing targets are ignored; range input is not', () => {
  expect(actionForKey(ev('f', { ctrlKey: true }))).toBeNull(); expect(actionForKey(ev('h', { metaKey: true }))).toBeNull(); expect(actionForKey(ev('1', { altKey: true }))).toBeNull()
  expect(actionForKey(ev('f', {}, 'input', 'text'))).toBeNull(); expect(actionForKey(ev('f', {}, 'textarea'))).toBeNull(); expect(actionForKey(ev('f', {}, 'select'))).toBeNull()
  expect(actionForKey(ev(' ', {}, 'input', 'range'))).toEqual({ action: 'togglePlay' })
  const ce = document.createElement('div'); ce.setAttribute('contenteditable', 'true'); expect(isTypingTarget(ce)).toBe(true)
  expect(isTypingTarget(null)).toBe(false)
})
test('KEY_BINDINGS lists 18 rows and KBD_HINT is verbatim', () => {
  expect(KEY_BINDINGS).toHaveLength(18)
  expect(KEY_BINDINGS.filter(b => b.action === 'reel').map(b => b.arg)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8])
  expect(KBD_HINT).toBe('SPACE play · F fit · T stage · H hero · ? keys')
})
```

- [ ] **Step 2: Run to verify failure** — `cd /home/yks/Projects/luminar/web && npx vitest run lib/keys.test.ts` → FAIL.
- [ ] **Step 3: Implement `web/lib/keys.ts` per A.5.** `isTypingTarget(t)`: `t instanceof HTMLElement` and (`tagName` in `TEXTAREA`/`SELECT`, or `isContentEditable`, or `INPUT` with `type !== 'range'`). `actionForKey(e)`: null when `isTypingTarget(e.target)` or any of `ctrlKey/metaKey/altKey`; else look up `e.key` in `KEY_BINDINGS` and return `{ action, arg }` (omit `arg` when undefined).
- [ ] **Step 4: Run to verify pass** — same command → `Tests 3 passed`.
- [ ] **Step 5: Commit**

```bash
git add web/lib/keys.ts web/lib/keys.test.ts
git commit -m "feat(web): keyboard binding table with r and ? shortcuts"
```

### Task 1.4: REST client returning `{ok, status, data}`

**Files:**
- Create: `web/lib/api/client.ts`
- Test: `web/lib/api/client.test.ts`

**Interfaces:**
- Consumes: `Toast` (A.2); frame/response types from Task 1.1.
- Produces: A.7 (`API_BASE`, `ApiResult<T>`, `TOKEN_KEY`, `adminToken`, `setAdminToken`, `get`, `post`, `getStatic`, `toastFor`, and the typed wrappers `simSnapshot simPlay simPause simReset simSpeed simReconfigure topologyEdges scenariosList scenarioLaunch faultPartition faultSybil faultEclipse faultDrop faultClearAll liveMainnet`).

- [ ] **Step 1: Write the failing tests** (inventory §4.1 payloads; `vi.stubGlobal('fetch', …)`; `afterEach(() => vi.unstubAllGlobals())`)

```ts
import { test, expect, vi, afterEach } from 'vitest'
import { faultSybil, simPlay, faultClearAll, toastFor, getStatic, get, setAdminToken, adminToken, TOKEN_KEY } from '@/lib/api/client'
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); localStorage.clear() })
const init = (m: ReturnType<typeof vi.fn>) => m.mock.calls[0][1] as RequestInit & { headers: Record<string, string> }

test('post returns ok/status/data and sets headers', async () => {
  setAdminToken('secret'); expect(adminToken()).toBe('secret'); expect(localStorage.getItem(TOKEN_KEY)).toBe('secret')
  const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true, fault_id: 'f1' }), { status: 200 })); vi.stubGlobal('fetch', fetchMock)
  expect(await faultSybil(5)).toEqual({ ok: true, status: 200, data: { ok: true, fault_id: 'f1' } })
  expect(fetchMock.mock.calls[0][0]).toBe('/api/fault/sybil')
  expect(init(fetchMock).method).toBe('POST'); expect(init(fetchMock).headers['X-Luminar-Token']).toBe('secret'); expect(init(fetchMock).headers['Content-Type']).toBe('application/json')
  expect(JSON.parse(init(fetchMock).body as string)).toEqual({ n_attackers: 5, target_topic: 'lumina/blocks/1.0' })
})
test('post without body sends no Content-Type; without token sends no token header', async () => {
  setAdminToken(null); expect(adminToken()).toBeNull()
  const fetchMock = vi.fn(async () => new Response('{"state":"running"}', { status: 200 })); vi.stubGlobal('fetch', fetchMock)
  expect(await simPlay()).toEqual({ ok: true, status: 200, data: { state: 'running' } })
  expect(init(fetchMock).headers['Content-Type']).toBeUndefined(); expect(init(fetchMock).headers['X-Luminar-Token']).toBeUndefined(); expect(init(fetchMock).body).toBeUndefined()
})
test('403, non-JSON and network error never throw', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{"detail":"X-Luminar-Token required"}', { status: 403 })))
  expect(await faultClearAll()).toEqual({ ok: false, status: 403, data: { detail: 'X-Luminar-Token required' } })
  vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>bad gateway</html>', { status: 502 })))
  expect(await faultClearAll()).toEqual({ ok: false, status: 502, data: null })
  vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch') }))
  expect(await faultClearAll()).toEqual({ ok: false, status: 0, data: null })
  expect(await get('/api/scenarios')).toEqual({ ok: false, status: 0, data: null })
})
test('toastFor', () => {
  expect(toastFor({ ok: true, status: 200, data: null }, 'Sybil ×5')).toEqual({ text: 'Sybil ×5 injected', kind: 'ok' })
  expect(toastFor({ ok: false, status: 403, data: null }, 'Sybil ×5')).toEqual({ text: 'Sybil ×5 failed · 403', kind: 'fail' })
  expect(toastFor({ ok: false, status: 0, data: null }, 'Sybil ×5')).toEqual({ text: 'backend offline', kind: 'fail' })
})
test('get prepends API_BASE; getStatic does not', async () => {
  vi.stubEnv('NEXT_PUBLIC_API_URL', 'https://api.example'); vi.resetModules()
  const c = await import('@/lib/api/client')
  const fetchMock = vi.fn(async () => new Response('[]', { status: 200 })); vi.stubGlobal('fetch', fetchMock)
  await c.scenariosList(); await c.getStatic('/reels/manifest.json')
  expect(fetchMock.mock.calls.map(x => x[0])).toEqual(['https://api.example/api/scenarios', '/reels/manifest.json'])
})
```

- [ ] **Step 2: Run to verify failure** — `cd /home/yks/Projects/luminar/web && npx vitest run lib/api/client.test.ts` → FAIL.
- [ ] **Step 3: Implement `web/lib/api/client.ts` per A.7.** Port `frontend/src/api/client.ts`; `get`/`post` share one `request<T>(path, init)` that returns `{ ok: res.ok, status: res.status, data: await res.json().catch(() => null) }` and `{ ok: false, status: 0, data: null }` on a thrown fetch. `getStatic` returns `T | null` (kept as today). `setAdminToken(null)` removes the key; both token functions are `try/catch` around `localStorage`.
- [ ] **Step 4: Run to verify pass** — same command → `Tests 5 passed`.
- [ ] **Step 5: Commit**

```bash
git add web/lib/api/client.ts web/lib/api/client.test.ts
git commit -m "feat(web): REST client returning {ok,status,data} so toasts can tell the truth"
```

### Task 1.5: zustand store — state, frame appliers, narrator beats, selectors

**Files:**
- Create: `web/lib/store.ts`
- Modify: `web/package.json` (dependency `zustand` 5.0.16 exact, after `npm view zustand version` confirms it is published)
- Test: `web/lib/store.test.ts`

**Interfaces:**
- Consumes: A.2 types, `isSimPeer`/`isPruned` (Task 1.1), fixtures.
- Produces: A.11 — `MAX_EVENTS 2000`, `MAX_SAMPLES 60`, `SCORE_HISTORY 50`, `STAGE_SCALE`, `BASE_SCALE`, `AppState`, `AppActions`, `AppStore`, `useStore`, selectors `selectTimelineTotal selectPill selectSelectedNode selectHoveredNode selectAttackers selectPrunedCount selectStateCounts selectKpis selectHasMessages selectCanGeo`.

- [ ] **Step 1: Write the failing tests** (`beforeEach(() => useStore.setState(useStore.getInitialState(), true))`)

```ts
import { test, expect, beforeEach } from 'vitest'
import { useStore, MAX_EVENTS, selectPill, selectTimelineTotal, selectStateCounts, selectKpis, selectPrunedCount } from '@/lib/store'
import { snapWith, peerNode } from '@/lib/fixtures'
import type { AppEvent } from '@/lib/types'
beforeEach(() => useStore.setState(useStore.getInitialState(), true))
const S = () => useStore.getState()

test('defaults', () => {
  expect(S().maxDuration).toBe(300); expect(S().durationStep).toBe(300)
  expect(S().dhtCoordinator).toEqual({ active: 0, available: 8 }); expect(S().streamManager).toEqual({ open: 0, max: 64, available: 64 })
  expect(S().selectedPeer).toBeNull(); expect(S().scale).toEqual({ node: 1, particle: 1, edgeAlpha: 1 })
  expect(S().layoutMode).toBe('force'); expect(S().telemetry).toEqual({ active: false, peerCount: 0 }); expect(S().toasts).toEqual([])
})
test('applyEvents touches only the fields that changed', () => {
  const before = S() as unknown as Record<string, unknown>
  S().applyEvents([{ at: 5.8, event_type: 'GossipMessage', category: 'gossip', from_peer: 'peer-22', to_peer: 'peer-3', msg_id: 'msg-1' }])
  const after = S() as unknown as Record<string, unknown>
  const changed = Object.keys(after).filter(k => after[k] !== before[k] && typeof after[k] !== 'function')
  expect(changed.sort()).toEqual(['eventCount', 'events'])
})
test('ClockTick moves simTime; SimulationStateChanged applies live and is ignored in reel mode', () => {
  S().applyEvents([{ at: 3.2, event_type: 'ClockTick', category: 'clock' }]); expect(S().simTime).toBe(3.2)
  S().applyEvents([{ at: 3.3, event_type: 'SimulationStateChanged', category: 'simulation', state: 'running', speed: 2 }])
  expect(S().playing).toBe(true); expect(S().simState).toBe('running'); expect(S().simSpeed).toBe(2)
  useStore.setState(useStore.getInitialState(), true)
  useStore.setState({ reel: { name: 'x', title: 'x', durationMs: 1, durationSim: 1 } })
  S().applyEvents([{ at: 4, event_type: 'SimulationStateChanged', category: 'simulation', state: 'running', speed: 2 }])
  expect(S().playing).toBe(false); expect(S().simSpeed).toBe(1)
})
test('applySnapshot rebuilds nodeById, drops a vanished selection, samples score history, honours reel guard', () => {
  S().selectPeer('peer-1')
  S().applySnapshot(snapWith(['peer-0', 'peer-1'])); expect(S().scoreHistory).toEqual([{ t: 0, v: 1 }]); expect(S().nodeById.get('peer-1')?.index).toBe(1)
  expect(S().playing).toBe(true); expect(S().simState).toBe('running')
  S().applySnapshot(snapWith(['peer-0'])); expect(S().selectedPeer).toBeNull(); expect(S().highlightPeers).toEqual([]); expect(S().nodeById.has('peer-1')).toBe(false)
  useStore.setState({ reel: { name: 'x', title: 'x', durationMs: 1, durationSim: 1 }, playing: false })
  S().applySnapshot(snapWith(['peer-0'], { state: 'running', speed: 3, time: 7 }))
  expect(S().playing).toBe(false); expect(S().simSpeed).toBe(1); expect(S().simTime).toBe(7)
})
test('geoAvailable follows real nodes; setLayoutMode guards geo and drops an invisible selection', () => {
  S().applySnapshot(snapWith(['peer-0'])); expect(S().geoAvailable).toBe(false)
  S().setLayoutMode('geo'); expect(S().layoutMode).toBe('force')
  S().applySnapshot({ ...snapWith(['peer-0']), nodes: [peerNode('peer-0', 0), peerNode('obs-1', 1, { is_real: true, x: 10, y: 20 })] }); expect(S().geoAvailable).toBe(true)
  S().selectPeer('peer-0'); S().setLayoutMode('geo', { remember: true })
  expect(S().layoutMode).toBe('geo'); expect(S().layoutBeforeGeo).toBe('force'); expect(S().selectedPeer).toBeNull()
})
test('events ring caps at MAX_EVENTS; gap counts dropped', () => {
  S().applyEvents(Array.from({ length: 2500 }, (_, i): AppEvent => ({ at: i, event_type: 'ClockTick', category: 'clock' })))
  expect(S().events).toHaveLength(MAX_EVENTS); expect(S().events[0].at).toBe(500); expect(S().eventCount).toBe(2500)
  S().applyGap({ type: 'gap', dropped: 7 }); S().applyGap({ type: 'gap', dropped: 2 }); expect(S().droppedEvents).toBe(9)
})
test('narrator beats: phase, first score prune to a sybil, fault cleared, healed', () => {
  S().applyEvents([{ at: 10.2, event_type: 'ScenarioPhaseFired', category: 'simulation', label: 'Sybil attack: 5 attackers graft in' }])
  expect(S().caption).toMatchObject({ text: 'Sybil attack: 5 attackers graft in', kind: 'phase', at: 10.2 })
  S().applyEvents([
    { at: 11.9, event_type: 'GossipPrune', category: 'gossip', from_peer: 'peer-42', to_peer: 'sybil-3', reason: 'score' },
    { at: 12.0, event_type: 'GossipPrune', category: 'gossip', from_peer: 'peer-1', to_peer: 'sybil-0', reason: 'score' },
    { at: 12.1, event_type: 'GossipMessage', category: 'gossip', from_peer: 'sybil-0', to_peer: 'peer-1', msg_id: 'spam-7' },
  ])
  expect(S().caption?.text).toBe('First Sybil pruned by score'); expect(S().invalidCount).toBe(1); expect(S().narrator.firstSybilPrunedAt).toBe(11.9)
  S().applyEvents([{ at: 24.1, event_type: 'FaultCleared', category: 'fault', fault_type: 'sybil' }])
  useStore.setState({ simTime: 25.5 })
  S().applyAnalytics({ type: 'analytics', total_messages: 9, avg_delivery_ratio: 1, avg_propagation_ms: 190, avg_hops: 4, recent_delivery_ratio: 0.97, delivery_ratios: [], latency_cdf: [], mesh_stability: {} })
  expect(S().beats.map(b => [b.kind, b.time])).toEqual([['phase', 10.2], ['prune', 11.9], ['fault', 24.1], ['healed', 25.5]])
  expect(S().caption?.text).toBe('Mesh healed in 1.4s'); expect(S().phaseLabel).toBe('Sybil attack: 5 attackers graft in')
  S().applyAnalytics({ type: 'analytics', total_messages: 10, avg_delivery_ratio: 1, avg_propagation_ms: 190, avg_hops: 4, recent_delivery_ratio: 0.99, delivery_ratios: [], latency_cdf: [], mesh_stability: {} })
  expect(S().beats).toHaveLength(4)   // healed announced once
  expect(S().analyticsHistory).toHaveLength(2); expect(S().analyticsHistory[0]).toEqual({ t: 25.5, delivery: 0.97, propagationMs: 190, hops: 4, degree: 0 })
})
test('BlockSeen lights observers between snapshots', () => {
  S().applySnapshot({ ...snapWith([]), nodes: [peerNode('obs-1', 0, { is_real: true }), peerNode('obs-2', 1, { is_real: true, state: 'decoded' })] })
  S().applyEvents([{ at: 1, event_type: 'BlockSeen', category: 'live', peer_id: 'obs-1', seen_ms: 320, first: true, slot: 1 }])
  expect(S().nodeById.get('obs-1')).toMatchObject({ state: 'origin', seen_ms: 320 }); expect(S().nodeById.get('obs-2')?.state).toBe('idle')
})
test('applyScenario, applyMetrics, applyTelemetryStatus, applyEdges', () => {
  S().applyScenario({ type: 'scenario', active: true, scenario: { id: 'a', name: 'A', description: '', icon: '', topology_type: 'random', phases: [], duration: 90 } })
  expect(S().maxDuration).toBe(90); expect(S().activeScenario?.scenario?.id).toBe('a'); expect(S().beats).toEqual([])
  S().applyScenario({ type: 'scenario', active: false, scenario: null }); expect(S().activeScenario).toBeNull(); expect(S().maxDuration).toBe(90)
  S().applyMetrics({ type: 'metrics', node_count: 50, state_distribution: { idle: 50 }, total_messages_sent: 3, total_messages_received: 9, event_counts: { gossip: 12 }, total_events: 12, stream_manager: { open: 5, max: 64, available: 59 }, dht_coordinator: { active: 1, available: 8 } })
  expect(S().stateDistribution).toEqual({ idle: 50 }); expect(S().streamManager.open).toBe(5)
  S().applyTelemetryStatus({ type: 'telemetry_status', active: true, peer_count: 2, peers: [], mainnet: { enabled: true, observers: 150 } })
  expect(S().telemetry).toEqual({ active: true, peerCount: 2 }); expect(S().mainnet?.enabled).toBe(true)
  S().applyEdges({ type: 'edges', edges: [['peer-0', 'peer-1']] }); expect(S().edges).toEqual([['peer-0', 'peer-1']])
})
test('setPref flips scale; toasts queue; resetRun clears the run; selectors', () => {
  S().setPref('stageTheme'); expect(S().stageTheme).toBe(true); expect(S().scale).toEqual({ node: 1.4, particle: 1.8, edgeAlpha: 1.6 })
  S().setPref('stageTheme', false); expect(S().scale).toEqual({ node: 1, particle: 1, edgeAlpha: 1 })
  const id = S().pushToast('Sybil ×5 injected', 'ok'); S().pushToast('Link copied'); expect(S().toasts.map(t => t.text)).toEqual(['Sybil ×5 injected', 'Link copied']); expect(S().toasts[1].kind).toBe('info')
  S().dismissToast(id); expect(S().toasts).toHaveLength(1)
  S().applyEvents([{ at: 9, event_type: 'ClockTick', category: 'clock' }]); S().selectPeer('peer-0', ['peer-1']); S().resetRun()
  expect(S().events).toEqual([]); expect(S().eventCount).toBe(0); expect(S().simTime).toBe(0); expect(S().selectedPeer).toBeNull(); expect(S().highlightPeers).toEqual([]); expect(S().caption).toBeNull()
  expect(selectPill(S())).toBe('offline'); S().setConnected(true); expect(selectPill(S())).toBe('live')
  useStore.setState({ reel: { name: 'r', title: 'R', durationMs: 1000, durationSim: 40.5 } }); expect(selectPill(S())).toBe('reel'); expect(selectTimelineTotal(S())).toBe(40.5)
  S().applySnapshot({ ...snapWith([]), nodes: [peerNode('peer-0', 0), peerNode('sybil-0', 1, { state: 'attacker' }), peerNode('sybil-1', 2, { state: 'attacker', connected_peers: ['peer-0'] })] })
  S().applyMetrics({ type: 'metrics', node_count: 1, state_distribution: { idle: 1, attacker: 2 }, total_messages_sent: 0, total_messages_received: 0, event_counts: {}, total_events: 0, stream_manager: { open: 0, max: 64, available: 64 }, dht_coordinator: { active: 0, available: 8 } })
  expect(selectPrunedCount(S())).toBe(1); expect(selectStateCounts(S())).toEqual({ idle: 1, attacker: 1, pruned: 1 })
  expect(selectKpis(S())).toEqual({ delivery: null, propagationMs: null, hops: null, degree: null })
})
```

- [ ] **Step 2: Run to verify failure** — `cd /home/yks/Projects/luminar/web && npx vitest run lib/store.test.ts` → FAIL, "Cannot find module 'zustand'" / "'@/lib/store'".
- [ ] **Step 3: `npm view zustand version`, add `"zustand": "5.0.16"` (exact), `npm install`; implement `web/lib/store.ts` per A.11.** Decisions the signatures leave open:
  - Every applier builds a `patch: Partial<AppState>` and calls `set(patch)` once; a key enters `patch` only when `!Object.is(next, prev)` for primitives, or when an array/object was rebuilt.
  - `applySnapshot`: `nodes`, `nodeById` (new `Map`), `mesh = f.gossip?.mesh ?? {}`, `nodeCount`, `eventCount`, `simTime = f.time`, `geoAvailable = nodes.some(n => !isSimPeer(n))`; when `!reel`: `simState`, `simSpeed`, `playing = f.state === 'running'`; when `reel`: none of those three (see "New interfaces"). Selection: if `selectedPeer` is not in `nodeById` → `selectedPeer null`, `highlightPeers []`, `scoreHistory []`; else push `{ t: f.time, v: gossip_score }` capped at `SCORE_HISTORY`.
  - `applyEvents`: ring `events.concat(batch).slice(-MAX_EVENTS)`; `eventCount += batch.length`; `simTime` from the last `ClockTick.at`; live-only `SimulationStateChanged`; `BlockSeen` (`frontend/src/app.ts:156-168`): copy `nodes` once per batch when any `BlockSeen` targets a known id, `first` resets every `is_real` node to `idle` and captions `slot ${slot} · block ${String(block_root).slice(0, 10)}… · first seen ${seen_ms} ms (${client || '?'}, ${country || '?'})` only when `layoutMode === 'geo'`; then `state = first ? 'origin' : 'decoded'`, `seen_ms`. Narrator (`frontend/src/ui/narrator.ts:81-104`) per the beat-label table; caption texts `First Sybil pruned by score` (kind `narrator`), phase label (kind `phase`).
  - `applyAnalytics`: `gossipAnalytics = f`; sample when `total_messages > 0`: `{ t: simTime, delivery: recent_delivery_ratio ?? avg_delivery_ratio, propagationMs: avg_propagation_ms, hops: avg_hops, degree: mesh_stability.avg_degree ?? 0 }` capped at `MAX_SAMPLES`; heal latch (`narrator.ts:106-115`): `Mesh healed in ${(simTime − healStartAt).toFixed(1)}s`, kind `healed`, beat `Mesh healed` at `simTime`, `healedAnnounced = true`.
  - `applyMetrics`: each field `?? previous`. `applyTelemetryStatus`: `telemetry {active, peerCount: peer_count}`, `mainnet = f.mainnet ?? null`; when `enabled` goes true→false also `geoAutoDone = false`. `applyScenario`: `activeScenario = f.active ? f : null`; `maxDuration = scenario.duration` only when `active && duration > 0`; always resets `beats [] caption null phaseLabel '' invalidCount 0 narrator latches`. `applyEdges`: `edges = f.edges`. `applyGap`: `droppedEvents += dropped`.
  - `setLayoutMode(mode, { remember })`: `'geo'` without `geoAvailable` → `'force'`; `remember && layoutMode !== 'geo'` → `layoutBeforeGeo = layoutMode`; a selected node invisible in the new mode (`(mode === 'geo') === isSimPeer(node)`) → `selectedPeer null`, `highlightPeers []`.
  - `selectPeer(id, highlight = [])`: `scoreHistory []` when id changes. `setPref`: toggle when `value` omitted; `scale = stageTheme ? STAGE_SCALE : BASE_SCALE`. `pushToast`: module counter id, `kind` default `'info'`, `at = Date.now()`. `setCaption`: module `seq` counter. `resetRun`: the A.11 list verbatim.
  - Selectors: `selectStateCounts`: copy `stateDistribution`; when `pruned > 0` set `attacker = max(0, (attacker ?? 0) − pruned)` and `pruned`; otherwise return the copy unchanged. `selectKpis`: all null until `total_messages > 0`; `delivery = recent_delivery_ratio ?? avg_delivery_ratio`; `degree = { avg, min, max }` from `mesh_stability`, null when `avg_degree == null`.
  - `BlockSeen` clones `nodes` and rebuilds `nodeById` from the clone (one `Map` per batch that had a hit), so `nodeById.get(id)` always points at the current node object.
- [ ] **Step 4: Run to verify pass** — `npx vitest run lib/store.test.ts && npx tsc --noEmit && npm run lint` → `Tests 11 passed`, clean.
- [ ] **Step 5: Commit**

```bash
git add web/package.json web/package-lock.json web/lib/store.ts web/lib/store.test.ts
git commit -m "feat(web): zustand store with frame appliers, narrator beats and selectors"
```

### Task 1.6: Frame dispatcher

**Files:**
- Create: `web/lib/api/dispatch.ts`
- Test: `web/lib/api/dispatch.test.ts`

**Interfaces:**
- Consumes: `useStore` appliers (Task 1.5), `isTypedFrame` (Task 1.1).
- Produces: A.8 — `dispatchFrame(frame: WsFrame): void`, `flushEvents(): void`, `subscribeEvents(cb: (batch: AppEvent[]) => void): () => void`, `pendingEventCount(): number`. Phase 2's renderer registers particle spawning through `subscribeEvents`.

- [ ] **Step 1: Write the failing test**

```ts
import { test, expect, beforeEach } from 'vitest'
import { dispatchFrame, flushEvents, subscribeEvents, pendingEventCount } from '@/lib/api/dispatch'
import { useStore } from '@/lib/store'
import { snapWith } from '@/lib/fixtures'
import type { AppEvent } from '@/lib/types'
beforeEach(() => { useStore.setState(useStore.getInitialState(), true); flushEvents() })

test('typed frames route to appliers; events batch until flush; subscribers see the batch once', () => {
  const seen: AppEvent[][] = []; const off = subscribeEvents(b => seen.push(b))
  dispatchFrame({ type: 'gap', dropped: 2 }); expect(useStore.getState().droppedEvents).toBe(2)
  dispatchFrame({ at: 1, event_type: 'ClockTick', category: 'clock' }); expect(pendingEventCount()).toBe(1); expect(useStore.getState().events).toHaveLength(0)
  flushEvents(); expect(useStore.getState().events).toHaveLength(1); expect(seen).toHaveLength(1); expect(pendingEventCount()).toBe(0)
  flushEvents(); expect(seen).toHaveLength(1)
  off(); dispatchFrame({ at: 2, event_type: 'ClockTick', category: 'clock' }); flushEvents(); expect(seen).toHaveLength(1)
})
test('a typed frame flushes pending events first, so a newer snapshot time wins over an older ClockTick', () => {
  dispatchFrame({ at: 0.5, event_type: 'ClockTick', category: 'clock' })
  dispatchFrame(snapWith(['peer-0'], { time: 1.5 }))
  expect(useStore.getState().events).toHaveLength(1); expect(useStore.getState().simTime).toBe(1.5); expect(pendingEventCount()).toBe(0)
})
test('every typed frame type reaches its applier', () => {
  dispatchFrame({ type: 'edges', edges: [['a', 'b']] }); expect(useStore.getState().edges).toEqual([['a', 'b']])
  dispatchFrame({ type: 'scenario', active: false, scenario: null }); expect(useStore.getState().activeScenario).toBeNull()
  dispatchFrame({ type: 'telemetry_status', active: true, peer_count: 1, peers: [] }); expect(useStore.getState().telemetry.peerCount).toBe(1)
  dispatchFrame({ type: 'metrics', node_count: 1, state_distribution: {}, total_messages_sent: 4, total_messages_received: 0, event_counts: {}, total_events: 0, stream_manager: { open: 0, max: 64, available: 64 }, dht_coordinator: { active: 0, available: 8 } }); expect(useStore.getState().totalMessagesSent).toBe(4)
  dispatchFrame({ type: 'analytics', total_messages: 0, avg_delivery_ratio: 0, avg_propagation_ms: 0, avg_hops: 0, delivery_ratios: [], latency_cdf: [], mesh_stability: {} }); expect(useStore.getState().gossipAnalytics?.total_messages).toBe(0)
})
```

- [ ] **Step 2: Run to verify failure** — `cd /home/yks/Projects/luminar/web && npx vitest run lib/api/dispatch.test.ts` → FAIL.
- [ ] **Step 3: Implement `web/lib/api/dispatch.ts` per A.8** with the flush-before-typed rule: `dispatchFrame` → `isTypedFrame(frame) ? (flushEvents(), route by frame.type) : pending.push(frame)`; unknown `type` strings are ignored. `flushEvents` swaps the pending array for `[]` before calling `applyEvents` once and then each subscriber (so a subscriber that dispatches does not re-enter the same batch).
- [ ] **Step 4: Run to verify pass** — same command → `Tests 3 passed`.
- [ ] **Step 5: Commit**

```bash
git add web/lib/api/dispatch.ts web/lib/api/dispatch.test.ts
git commit -m "feat(web): one frame dispatcher for the live socket and the reel player"
```

### Task 1.7: WebSocket manager

**Files:**
- Create: `web/lib/api/websocket.ts`
- Test: `web/lib/api/websocket.test.ts`

**Interfaces:**
- Consumes: `dispatchFrame`, `flushEvents` (Task 1.6); `useStore.getState().setConnected` (Task 1.5); `API_BASE` (Task 1.4).
- Produces: A.9 — `BATCH_MS 50`, `RECONNECT_MIN_MS 1000`, `RECONNECT_MAX_MS 10_000`, `wsUrl(loc?)`, `ws.connect()`, `ws.disconnect()`, `ws.connected()`.

- [ ] **Step 1: Write the failing tests** — a `FakeWebSocket` installed with `vi.stubGlobal('WebSocket', FakeWebSocket)` (static `CONNECTING 0 OPEN 1 CLOSING 2 CLOSED 3`; `readyState` starts 0; `close()` sets 3 and calls `onclose`; helpers `open()` → 1 + `onopen()`, `message(data)` → `onmessage({ data })`, `closeFromServer()` → 3 + `onclose()`; every instance pushed to `sockets`); `vi.useFakeTimers()`; `beforeEach` resets `sockets`, store state and calls `ws.disconnect()`.

```ts
test('wsUrl', () => {
  expect(wsUrl({ protocol: 'http:', host: 'localhost:3000', port: '3000' })).toBe('ws://localhost:8000/ws/events')
  expect(wsUrl({ protocol: 'https:', host: 'luminar.onrender.com', port: '' })).toBe('wss://luminar.onrender.com/ws/events')
  expect(wsUrl({ protocol: 'http:', host: 'localhost:8080', port: '8080' })).toBe('ws://localhost:8080/ws/events')
})
test('reconnect backs off 1s ×2 to 10s and resets on open', () => {
  ws.connect(); expect(sockets).toHaveLength(1); sockets[0].closeFromServer()
  for (const d of [1000, 2000, 4000, 8000, 10000, 10000]) { vi.advanceTimersByTime(d - 1); const n = sockets.length; vi.advanceTimersByTime(1); expect(sockets.length).toBe(n + 1); sockets.at(-1)!.closeFromServer() }
  vi.advanceTimersByTime(10000); sockets.at(-1)!.open(); sockets.at(-1)!.closeFromServer(); vi.advanceTimersByTime(1000); expect(sockets).toHaveLength(9)
})
test('connect twice is a no-op; disconnect cancels a pending reconnect and reports offline', () => {
  ws.connect(); ws.connect(); expect(sockets).toHaveLength(1)
  sockets[0].open(); expect(ws.connected()).toBe(true); ws.connect(); expect(sockets).toHaveLength(1)
  sockets[0].closeFromServer(); ws.disconnect(); vi.advanceTimersByTime(60_000); expect(sockets).toHaveLength(1)
  expect(useStore.getState().connected).toBe(false); expect(ws.connected()).toBe(false)
})
test('StrictMode sequence connect→disconnect→connect leaves one live socket and no reconnect from the first', () => {
  ws.connect(); ws.disconnect(); ws.connect(); expect(sockets).toHaveLength(2); expect(sockets[0].readyState).toBe(3)
  sockets[0].onclose?.(); vi.advanceTimersByTime(60_000); expect(sockets).toHaveLength(2)
  sockets[1].open(); expect(useStore.getState().connected).toBe(true)
})
test('text frames batch for 50 ms; binary frames dispatch at once; superseded socket is ignored; close flushes', async () => {
  ws.connect(); sockets[0].open(); expect(useStore.getState().connected).toBe(true)
  sockets[0].message(JSON.stringify({ at: 1, event_type: 'ClockTick', category: 'clock' })); expect(useStore.getState().events).toHaveLength(0)
  vi.advanceTimersByTime(50); expect(useStore.getState().events).toHaveLength(1)
  sockets[0].message(new TextEncoder().encode(JSON.stringify({ type: 'gap', dropped: 4 })).buffer); expect(useStore.getState().droppedEvents).toBe(4)
  sockets[0].message(new Blob([JSON.stringify({ type: 'gap', dropped: 1 })])); await vi.waitFor(() => expect(useStore.getState().droppedEvents).toBe(5))
  sockets[0].message('not json'); expect(useStore.getState().events).toHaveLength(1)
  sockets[0].message(JSON.stringify({ at: 2, event_type: 'ClockTick', category: 'clock' })); sockets[0].closeFromServer(); expect(useStore.getState().events).toHaveLength(2)   // close flushes
  vi.advanceTimersByTime(1000); expect(sockets).toHaveLength(2)
  sockets[1].message(JSON.stringify({ type: 'gap', dropped: 9 })); expect(useStore.getState().droppedEvents).toBe(14)     // current socket: handlers live from construction
  sockets[0].message(JSON.stringify({ type: 'gap', dropped: 100 })); expect(useStore.getState().droppedEvents).toBe(14)   // superseded socket: ignored
})
```

- [ ] **Step 2: Run to verify failure** — `cd /home/yks/Projects/luminar/web && npx vitest run lib/api/websocket.test.ts` → FAIL.
- [ ] **Step 3: Port `frontend/src/api/websocket.ts` → `web/lib/api/websocket.ts` per A.9.** Replace `bind` callbacks with `dispatchFrame`/`flushEvents`/`useStore.getState().setConnected`; `wsUrl` per the three-way rule in A.9 (`API_BASE` → `http(s)`→`ws(s)`; `port === '3000'` → `process.env.NEXT_PUBLIC_WS_URL ?? 'ws://localhost:8000'`; else same host); keep the single-socket invariant (`socket.readyState <= WebSocket.OPEN` → return), the `sock !== this.socket` early returns, `reconnectDelay` reset to `RECONNECT_MIN_MS` on open and doubled to `RECONNECT_MAX_MS` after scheduling. Export `ws` as a module singleton; `connected()` returns `socket?.readyState === WebSocket.OPEN`.
- [ ] **Step 4: Run to verify pass** — same command → `Tests 5 passed`.
- [ ] **Step 5: Commit**

```bash
git add web/lib/api/websocket.ts web/lib/api/websocket.test.ts
git commit -m "feat(web): websocket manager ported with backoff and the single-socket invariant"
```

### Task 1.8: Reel player with streaming parse

**Files:**
- Create: `web/lib/api/replay.ts`
- Test: `web/lib/api/replay.test.ts`

**Interfaces:**
- Consumes: `dispatchFrame`, `flushEvents` (Task 1.6); store `setReel`, `setReelLoad`, `setPlaying`, `resetRun`, `reel` (Task 1.5); `ReelMeta`, `ReelFrame` (Task 1.1).
- Produces: A.10 — `REEL_TICK_MS 50`, `REEL_MIN_SPEED 0.1`, `SEEK_STATE_TYPES`, `loadReel(meta, opts?)`, `playReel`, `pauseReel`, `toggleReel`, `setReelSpeed`, `seekReel(ms, opts?)`, `seekReelToSimTime(sec)`, `stopReel`, `unloadReel`, `reelLoaded`, `reelDurationMs`, `reelElapsedMs`, `reelPlaying`, `parseReelChunk(text, carry)`.

- [ ] **Step 1: Write the failing tests** — preamble: `vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date', 'performance'] })`; `fetch` stubbed to return `new Response(stream, { status: 200, headers: { 'content-length': String(bytes) } })` where `stream` is a `ReadableStream` enqueuing the fixture as three `TextEncoder` chunks cut at byte 70 and 300 (mid-line); `beforeEach`: reset store, `unloadReel()`.

```ts
const meta = { name: 'r', title: 'R', file: '/reels/r.jsonl' }
const lines = [
  { t: 0, frame: { type: 'edges', edges: [['peer-0', 'peer-1']] } },
  { t: 452, frame: snapWith(['peer-0', 'peer-1'], { time: 0 }) },
  { t: 1000, frame: { at: 0.5, event_type: 'ClockTick', category: 'clock' } },
  { t: 2000, frame: snapWith(['peer-0', 'peer-1'], { time: 1.5, state: 'running', speed: 4 }) },
  { t: 2100, frame: { at: 1.6, event_type: 'GossipMessage', category: 'gossip', from_peer: 'peer-0', to_peer: 'peer-1', msg_id: 'msg-1' } },
].map(l => JSON.stringify(l)).join('\n') + '\n'

test('parseReelChunk carries a partial line across chunks and skips malformed lines', () => {
  const a = parseReelChunk(lines.slice(0, 70), ''); const b = parseReelChunk(lines.slice(70), a.carry)
  expect(a.frames.length + b.frames.length).toBe(5); expect(b.carry).toBe('')
  expect(parseReelChunk('{"t":1,"frame":{"type":"gap","dropped":1}}\n{bad\n', '').frames).toHaveLength(1)
  expect(parseReelChunk('{"t":1,"fra', '').carry).toBe('{"t":1,"fra')
})
test('loadReel streams, primes on the first snapshot, seeks to it, reports progress, lands paused', async () => {
  const loads: unknown[] = []; const un = useStore.subscribe(s => loads.push(s.reelLoad))
  const ok = await loadReel(meta); un()
  expect(ok).toBe(true); expect(useStore.getState().reel).toEqual({ name: 'r', title: 'R', durationMs: 2100, durationSim: 1.5 })
  expect(useStore.getState().nodes).toHaveLength(2); expect(useStore.getState().edges).toEqual([['peer-0', 'peer-1']]); expect(useStore.getState().simTime).toBe(0)
  expect(useStore.getState().playing).toBe(false); expect(useStore.getState().simSpeed).toBe(1); expect(useStore.getState().reelLoad).toBeNull()
  expect(loads.some(l => l && (l as { loaded: number }).loaded > 0)).toBe(true); expect(reelLoaded()).toBe(true); expect(reelElapsedMs()).toBe(452)
})
test('loadReel returns false on a fetch failure or an empty file and leaves no reel', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 404 }))); expect(await loadReel(meta)).toBe(false)
  vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 200 }))); expect(await loadReel(meta)).toBe(false)
  expect(useStore.getState().reel).toBeNull(); expect(useStore.getState().reelLoad).toBeNull()
})
test('play dispatches by wall clock × speed, ignores recorded state, auto-pauses at the end', async () => {
  await loadReel(meta); setReelSpeed(2); playReel(); expect(reelPlaying()).toBe(true); expect(useStore.getState().playing).toBe(true)
  vi.advanceTimersByTime(1100)
  expect(useStore.getState().simTime).toBe(1.5); expect(useStore.getState().simSpeed).toBe(1); expect(useStore.getState().events.map(e => e.event_type)).toEqual(['ClockTick', 'GossipMessage'])
  expect(reelPlaying()).toBe(false); expect(useStore.getState().playing).toBe(false); expect(reelElapsedMs()).toBe(2100)
  playReel(); expect(reelElapsedMs()).toBe(0)   // from the end → seekReel(0) first
})
test('seek replays state frames in order, skips events, clamps, optional tail; speed floors at 0.1', async () => {
  await loadReel(meta); seekReelToSimTime(1.0); expect(useStore.getState().simTime).toBe(1.5); expect(useStore.getState().events).toHaveLength(0)
  seekReelToSimTime(99); expect(reelElapsedMs()).toBe(2100)
  seekReel(99_999); expect(reelElapsedMs()).toBe(2100); seekReel(-5); expect(reelElapsedMs()).toBe(0)
  seekReel(2100, { eventTailMs: 200 }); expect(useStore.getState().events.map(e => e.msg_id)).toEqual(['msg-1'])
  setReelSpeed(0.01); seekReel(0); playReel(); vi.advanceTimersByTime(50); expect(reelElapsedMs()).toBe(5); pauseReel()
})
test('stopReel keeps frames; unloadReel drops them', async () => {
  await loadReel(meta); playReel(); stopReel(); expect(reelPlaying()).toBe(false); expect(reelElapsedMs()).toBe(0); expect(reelLoaded()).toBe(true)
  unloadReel(); expect(reelLoaded()).toBe(false); expect(reelDurationMs()).toBe(0)
})
test('a file truncated mid-line at EOF loads with the frames before the cut (global review focus 2)', async () => {
  const cut = lines.trimEnd().slice(0, -12)                                   // the last line loses its tail and its newline
  vi.stubGlobal('fetch', vi.fn(async () => new Response(cut, { status: 200 })))
  expect(await loadReel(meta)).toBe(true); expect(useStore.getState().reel?.durationMs).toBe(2000); expect(reelLoaded()).toBe(true)
})
```

- [ ] **Step 2: Run to verify failure** — `cd /home/yks/Projects/luminar/web && npx vitest run lib/api/replay.test.ts` → FAIL.
- [ ] **Step 3: Port `frontend/src/api/replay.ts` → `web/lib/api/replay.ts` per A.10** with the streaming reader. `loadReel`: `stopReel()` first; `fetch(meta.file, { signal })`; `!res.ok || !res.body` → false; `getReader()` + `TextDecoder` with `{ stream: true }`; `parseReelChunk` per chunk; progress `setReelLoad({ loaded, total })` at most every 100 ms (`Date.now()`), always once on the first chunk; priming on the first parsed snapshot: dispatch the latest `edges` and `scenario` seen so far, then that snapshot, then `flushEvents()`; on end parse `carry + decoder.decode()`; zero frames → `setReelLoad(null)`, false; else `frames = parsed`, `setReel({ name, title, durationMs: last.t, durationSim: last snapshot .time })`, `resetRun()`, `seekReel(firstSnapshot.t)`, `setPlaying(false)`, `setReelLoad(null)`, true. `seekReel(ms, { eventTailMs = 0 })`: clamp; walk frames with `t ≤ target` keeping the last of each `SEEK_STATE_TYPES` and, when `eventTailMs > 0`, the events with `t > target − eventTailMs`; dispatch state frames in `SEEK_STATE_TYPES` order, then the tail events, then `flushEvents()`; `cursor`, `elapsed`, `lastTick = performance.now()`. `playReel`/`pauseReel`/end-of-reel call `setPlaying` per "New interfaces". `step(now)`: as today (`elapsed += (now − lastTick) × speed`, dispatch `t ≤ elapsed`, `flushEvents()`), plus at the end `elapsed = durationMs` (so the scrubber lands on the total) then `pauseReel()`.
- [ ] **Step 4: Run to verify pass** — `npx vitest run lib/api` → all `lib/api` suites pass (dispatch, websocket, replay, client).
- [ ] **Step 5: Commit**

```bash
git add web/lib/api/replay.ts web/lib/api/replay.test.ts
git commit -m "feat(web): reel player with streaming JSONL parse, priming, seek tail and progress"
```

### Task 1.9: Actions and prefs

**Files:**
- Create: `web/lib/actions.ts`, `web/lib/prefs.ts`
- Test: `web/lib/actions.test.ts`, `web/lib/prefs.test.ts`

**Accepted by:** vitest.

**Interfaces:**
- Consumes: client (Task 1.4), store (Task 1.5), `ws` (Task 1.7), replay (Task 1.8), `visiblePositions`/`resetTopology` from `@/components/map/renderer` (mocked with `vi.mock` until Task 2.4 exists), `fitView` (same mock), fixtures.
- Produces: A.12 (`reelGuard`, `leaveGeoForSim`, `fetchTopology`, `fetchScenarios`, `togglePlay`, `reset`, `setSpeed`, `seekTo`, `autoPauseIfDue`, `launchScenario`, `FaultKind`, `injectFault`, `setNodePreset`, `setDurationPreset`, `toggleMainnet`, `maybeAutoGeo`, `enterReel`, `exitReel`, `shareMoment`, `syncUrlMoment`, `applyUrlMoment`, `runKey`) and A.13 (`PREFS_KEY`, `Prefs`, `loadPrefs`, `persistPrefs`, `applyDomPrefs`, `initPrefs`, `reducedMotion`). Phase 4 amends `enterReel`/`exitReel`/`runKey` (A.0) and adds `bootSim`, `teardownSim`, `openReel`, `initUrlMoment`; Task 2.7 adds `initAutoGeo`.

- [ ] **Step 1: Write the failing tests** (`vi.mock('@/lib/api/client')`, `vi.mock('@/lib/api/websocket')`, `vi.mock('@/lib/api/replay')`, `vi.mock('@/components/map/renderer', () => ({ visiblePositions: () => positions, resetTopology: vi.fn(), fitView: vi.fn() }))`; `beforeEach` resets the store and `localStorage`)

```ts
// actions.test.ts
test('injectFault toasts from {ok}; reel guard refuses', async () => {
  client.faultSybil.mockResolvedValue({ ok: false, status: 403, data: null }); await injectFault('sybil', { n: 5 })
  expect(useStore.getState().toasts.at(-1)?.text).toBe('Sybil ×5 failed · 403')
  useStore.setState({ reel: { name: 'r', title: 'R', durationMs: 1, durationSim: 1 } }); await injectFault('clear-all')
  expect(useStore.getState().toasts.at(-1)?.text).toBe('Press 0 to leave the reel first'); expect(client.faultClearAll).not.toHaveBeenCalled()
})
test('partition splits visible sim peers by median x', async () => {
  positions = new Map([['peer-0', [-10, 0]], ['peer-1', [-5, 0]], ['peer-2', [5, 0]], ['peer-3', [10, 0]]]); useStore.getState().applySnapshot(snapWith(['peer-0', 'peer-1', 'peer-2', 'peer-3']))
  client.faultPartition.mockResolvedValue({ ok: true, status: 200, data: null }); await injectFault('partition')
  expect(client.faultPartition).toHaveBeenCalledWith(['peer-0', 'peer-1'], ['peer-2', 'peer-3'])
})
test('eclipse and drop need a selected sim peer', async () => {
  await injectFault('eclipse'); expect(client.faultEclipse).not.toHaveBeenCalled()
  useStore.getState().applySnapshot({ ...snapWith([]), nodes: [peerNode('obs-1', 0, { is_real: true })] }); useStore.getState().selectPeer('obs-1'); await injectFault('drop'); expect(client.faultDrop).not.toHaveBeenCalled()
  useStore.getState().applySnapshot(snapWith(['peer-7'])); useStore.getState().selectPeer('peer-7'); client.faultEclipse.mockResolvedValue({ ok: true, status: 200, data: null }); await injectFault('eclipse')
  expect(client.faultEclipse).toHaveBeenCalledWith('peer-7', 4); expect(useStore.getState().toasts.at(-1)?.text).toBe('Eclipse on n7 injected')
})
test('togglePlay at the limit extends maxDuration by durationStep before POST play; reel mode toggles the player', async () => {
  useStore.setState({ simTime: 300, maxDuration: 300, durationStep: 120, playing: false }); client.simPlay.mockResolvedValue({ ok: true, status: 200, data: null })
  await togglePlay(); expect(useStore.getState().maxDuration).toBe(420); expect(client.simPlay).toHaveBeenCalled()
  useStore.setState({ reel: { name: 'r', title: 'R', durationMs: 1, durationSim: 1 } }); await togglePlay(); expect(toggleReel).toHaveBeenCalled(); expect(client.simPlay).toHaveBeenCalledTimes(1)
})
test('autoPauseIfDue pauses live at the limit, never in reels', () => {
  client.simPause.mockResolvedValue({ ok: true, status: 200, data: null })
  useStore.setState({ playing: true, simTime: 60.1, maxDuration: 60 }); autoPauseIfDue(); expect(client.simPause).toHaveBeenCalledTimes(1); expect(useStore.getState().playing).toBe(false)
  useStore.setState({ playing: true, simTime: 60.1, maxDuration: 60, reel: { name: 'r', title: 'R', durationMs: 1, durationSim: 1 } }); autoPauseIfDue(); expect(client.simPause).toHaveBeenCalledTimes(1)
})
test('leaveGeoForSim restores the remembered layout and toasts; setNodePreset and launchScenario go through reelGuard → leaveGeoForSim → fetchTopology', async () => {
  useStore.setState({ geoAvailable: true, layoutMode: 'geo', layoutBeforeGeo: 'radial' }); client.simReconfigure.mockResolvedValue({ ok: true, status: 200, data: { n_nodes: 50, edge_count: 1 } })
  client.simSnapshot.mockResolvedValue({ ok: true, status: 200, data: snapWith(['peer-0']) }); client.topologyEdges.mockResolvedValue({ ok: true, status: 200, data: { edges: [] } })
  await setNodePreset(50); expect(useStore.getState().layoutMode).toBe('radial'); expect(useStore.getState().toasts.at(-1)?.text).toBe('Geo shows real observers only — switched to radial')
  expect(resetTopology).toHaveBeenCalled(); expect(client.simSnapshot).toHaveBeenCalled(); expect(client.topologyEdges).toHaveBeenCalled()
  client.scenarioLaunch.mockResolvedValue({ ok: false, status: 0, data: null }); await launchScenario('demo'); expect(useStore.getState().toasts.at(-1)?.text).toBe('backend offline')
})
test('toggleMainnet posts the inverse and stores the status; fail → backend offline', async () => {
  client.liveMainnet.mockResolvedValue({ ok: true, status: 200, data: { enabled: true, observers: 3 } }); await toggleMainnet(); expect(client.liveMainnet).toHaveBeenCalledWith(true); expect(useStore.getState().mainnet?.enabled).toBe(true)
  client.liveMainnet.mockResolvedValue({ ok: false, status: 0, data: null }); await toggleMainnet(); expect(client.liveMainnet).toHaveBeenLastCalledWith(false); expect(useStore.getState().toasts.at(-1)?.text).toBe('backend offline')
})
test('runKey dispatch table', () => {
  useStore.getState().applySnapshot(snapWith(['peer-0'])); useStore.getState().selectPeer('peer-0'); useStore.getState().setKeyHelp(true)
  runKey('escape'); expect(useStore.getState().selectedPeer).toBeNull(); expect(useStore.getState().keyHelpOpen).toBe(false)
  runKey('toggleKeyHelp'); expect(useStore.getState().keyHelpOpen).toBe(true)
  runKey('fitView'); expect(fitView).toHaveBeenCalled()
  runKey('toggleStage'); expect(useStore.getState().stageTheme).toBe(true); runKey('toggleHero'); expect(useStore.getState().hero).toBe(true)
})
test('syncUrlMoment writes ?peer always and ?t only while a reel is paused', () => {
  history.replaceState(null, '', '/reels/r/'); useStore.getState().applySnapshot(snapWith(['peer-3'])); useStore.getState().selectPeer('peer-3'); syncUrlMoment(); expect(location.search).toBe('?peer=peer-3')
  useStore.setState({ reel: { name: 'r', title: 'R', durationMs: 1, durationSim: 1 }, playing: false, simTime: 12.4 }); syncUrlMoment(); expect(location.search).toBe('?peer=peer-3&t=12.4')
  useStore.setState({ playing: true }); syncUrlMoment(); expect(location.search).toBe('?peer=peer-3')
})
// prefs.test.ts
test('URL wins over localStorage; persist mirrors URL and data attributes', () => {
  localStorage.setItem('luminar.prefs', JSON.stringify({ stageTheme: true, hero: true }))
  expect(loadPrefs(new URLSearchParams('theme=off'))).toEqual({ stageTheme: false, hero: true })
  expect(loadPrefs(new URLSearchParams('theme=stage&hero=1'))).toEqual({ stageTheme: true, hero: true })
  history.replaceState(null, '', '/sim/'); persistPrefs({ stageTheme: true, hero: false }); expect(location.search).toContain('theme=stage'); expect(location.search).not.toContain('hero=')
  expect(JSON.parse(localStorage.getItem('luminar.prefs')!)).toEqual({ stageTheme: true, hero: false })
  applyDomPrefs({ stageTheme: true, hero: true }); expect(document.documentElement.dataset.stage).toBe('1'); expect(document.documentElement.dataset.hero).toBe('1')
  applyDomPrefs({ stageTheme: false, hero: false }); expect(document.documentElement.dataset.stage).toBeUndefined()
})
test('reducedMotion reads matchMedia and is false without a window; initPrefs forces particles off under reduced motion before anything subscribes', () => {
  vi.stubGlobal('matchMedia', () => ({ matches: false })); expect(reducedMotion()).toBe(false)
  vi.stubGlobal('matchMedia', () => ({ matches: true })); expect(reducedMotion()).toBe(true)
  const off = initPrefs(); expect(useStore.getState().particlesEnabled).toBe(false); off()        // global review focus 3
  vi.stubGlobal('matchMedia', () => ({ matches: false })); useStore.setState(useStore.getInitialState(), true)
  const off2 = initPrefs(); expect(useStore.getState().particlesEnabled).toBe(true); off2(); vi.unstubAllGlobals()
})
```

- [ ] **Step 2: Run to verify failure** — `cd /home/yks/Projects/luminar/web && npx vitest run lib/actions.test.ts lib/prefs.test.ts` → FAIL, modules not found.

- [ ] **Step 3: Implement `web/lib/actions.ts` (A.12) and `web/lib/prefs.ts` (A.13).** Decisions the signatures leave open: `injectFault` labels `'Partition'`, `` `Sybil ×${n}` ``, `` `Eclipse on ${shortName(node)}` ``, `` `Drop ${shortName(node)}` ``, `'Clear all'`; partition groups from `visiblePositions()` sorted by `x`, the lower half (median split, `floor(n/2)`) is `group_a`; `fetchTopology` runs `simSnapshot` and `topologyEdges` with `Promise.all`, applies edges first, snapshot second, and is silent on failure (the pill reports it); `toggleMainnet` writes `mainnet` through `applyTelemetryStatus`-like `setState({ mainnet: data })` then `maybeAutoGeo()`; `shareMoment`: `syncUrlMoment()` then `navigator.clipboard?.writeText(location.href)` → toast `Link copied`, else `window.prompt('Copy this link', location.href)` and the same toast; `applyUrlMoment(q)`: `t` first (`seekReelToSimTime(Number(t))` only when `reel`), then `peer` (`selectPeer(id)` only when `nodeById.has(id)`). `prefs.ts`: `reducedMotion()` = `typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true`; `initPrefs()` = `loadPrefs(new URLSearchParams(location.search))` → `setPref('stageTheme', p.stageTheme)`, `setPref('hero', p.hero)`, `if (reducedMotion()) setDisplay({ particlesEnabled: false })`, `persistPrefs(p)`, `applyDomPrefs(p)`, then `useStore.subscribe` on `[stageTheme, hero]` → `persistPrefs` + `applyDomPrefs`; returns the unsubscribe. `persistPrefs` edits only the `theme` and `hero` keys of the current query (every other param survives).

- [ ] **Step 4: Run to verify pass** — same command → PASS; `npx tsc --noEmit && npm run lint` clean.

- [ ] **Step 5: Commit**

```bash
git add web/lib/actions.ts web/lib/actions.test.ts web/lib/prefs.ts web/lib/prefs.test.ts
git commit -m "feat(web): store actions (faults, playback, reels, share) and prefs persistence"
```

### Task 1.10: `SimApp` — connect on mount, pill and clock from selectors

**Files:**
- Create: `web/components/sim/SimApp.tsx`, `web/components/sim/Toolbar.tsx`, `web/components/sim/Toolbar.module.css`
- Modify: `web/app/sim/page.tsx` (phase-0 empty shell → `export const metadata = { title: 'Luminar — simulator' }` and `return <SimApp />`)
- Test: browser walk (below); no DOM unit test.

**Interfaces:**
- Consumes: `ws` (Task 1.7), `useStore`, `selectPill` (Task 1.5), `formatTime` (Task 1.1), tokens from `app/globals.css` (`--toolbar-h`, `--paper-*`, `--flame-dim`, `--signal`, `--hair`, `--t-label`, `--font-ui`, `--font-mono`).
- Produces: `SimApp` and `Toolbar` per "New interfaces" (phase 2 fills `<main data-slot="canvas">` with `DeckCanvas`; phase 3 grows `Toolbar`).

- [ ] **Step 1: Write `Toolbar.tsx`** — three components in one file; only `Toolbar` is exported:
  - `Pill()`: `const pill = useStore(selectPill); const title = useStore(s => s.reel?.title ?? '')`; renders `<span data-testid="pill" data-state={pill} className={styles.pill}>` with text `OFFLINE` / `LIVE` / `REEL · ${title}` and, for `live`, a leading `<i aria-hidden className={styles.dot}/>`; for `reel` a `<i className={styles.square}/>`. CSS: `[data-state="offline"]` → `color: var(--flame-dim)`, no background; `live` → `color: var(--signal)`, 6 px signal dot; `reel` → `color: var(--paper-0)`, 6 px paper square; font `var(--t-label)`, uppercase, letter-spacing .12em, `--r-0` (square corners).
  - `Clock()`: `const t = useStore(s => s.simTime); return <time data-testid="clock" className={styles.clock}>{'T+' + formatTime(t)}</time>` — one string child so React updates one text node; `font-variant-numeric: tabular-nums`, `var(--font-mono)`.
  - `Toolbar()`: `<header className={styles.bar}>` height `var(--toolbar-h)`, bottom hairline `1px solid var(--hair)`; brand `LUMINAR` (Manrope 600, `.14em`) + `gossipsub v1.1` mono sub-label; `<Pill/>`; `<Clock/>` right-aligned.
- [ ] **Step 2: Write `SimApp.tsx`** — `'use client'`; `useEffect(() => { ws.connect(); return () => ws.disconnect() }, [])`; `return <><Toolbar/><main data-slot="canvas" style={{ minHeight: 'calc(100dvh - var(--toolbar-h))' }}/></>`. No `useStore()` call without a selector anywhere (grep: `useStore()` must not appear).
- [ ] **Step 3: Wire `app/sim/page.tsx`** to render `<SimApp/>`; keep it a server component (no hooks), `metadata` exported.
- [ ] **Step 4: Static checks**

Run: `cd /home/yks/Projects/luminar/web && npx tsc --noEmit && npm run lint && npx vitest run && npm run build && ls out/sim/index.html && grep -c 'data-testid="pill"' out/sim/index.html`
Expected: all green; `out/sim/index.html` exists and contains the pill markup once (`OFFLINE` server-rendered).

- [ ] **Step 5: Browser walk — the phase acceptance** (chrome-devtools MCP; manual equivalent in parentheses). Preconditions: port 3000 free (`lsof -ti TCP:3000 -sTCP:LISTEN` prints nothing — on this machine another node app binds `[::1]:3000`; stop it, otherwise Next falls back to 3001 and `wsUrl`'s dev rule does not match, which is by design, not a bug). Terminal A: `make backend`. Terminal B: `make web`.
  1. `navigate_page` → `http://localhost:3000/sim/`; `wait_for` text `LIVE` (≤ 3 s). (Manual: open the URL, pill reads `LIVE` with a signal dot.)
  2. `evaluate_script` twice, 1 s apart: `document.querySelector('[data-testid=clock]').textContent` → two different `T+…s` values (clock advances; the backend boots paused on some deploys — if it reads `T+0.0s` both times, `curl -X POST localhost:8000/api/sim/play` first).
  3. **Only the clock text node changes at 20 Hz** — `evaluate_script`:
     ```js
     (async () => { const m = new Set(); const o = new MutationObserver(rs => rs.forEach(r => m.add(r.type + ':' + ((r.target.nodeType === 3 ? r.target.parentElement : r.target).dataset?.testid ?? r.target.nodeName)))); o.observe(document.querySelector('header'), { subtree: true, childList: true, characterData: true, attributes: true }); await new Promise(r => setTimeout(r, 2000)); o.disconnect(); return [...m] })()
     ```
     Expected: `["characterData:clock"]` and nothing else. (Manual, as the spec words it: React DevTools → Profiler → record 3 s → only `Clock` commits; `Pill`, `Toolbar`, `SimApp` show no renders.)
  4. Kill the backend listener only: `kill $(lsof -ti TCP:8000 -sTCP:LISTEN)`. `wait_for` text `OFFLINE` (≤ 2 s); pill `data-state="offline"`, flame-dim text, no fill; clock frozen.
  5. Back-off: `list_network_requests` with `resourceTypes: ['websocket']` after 30 s → `/ws/events` attempts whose start times are spaced ≈ 1 s, 2 s, 4 s, 8 s, 10 s, 10 s (±100 ms). (Manual: DevTools Network → WS filter, read the timestamps.)
  6. `make backend` again. `wait_for` text `LIVE` (≤ 11 s, one back-off period); clock advances again.
  7. Unmount disconnects: `navigate_page` → `http://localhost:3000/` then back to `/sim/`; backend log shows `WS client disconnected` for the first socket and exactly one new `WS client connected`. In dev StrictMode the first load logs connected → disconnected → connected once (the Task 1.7 sequence); `list_network_requests` shows two `/ws/events` entries, the first closed, the second open.
  8. `list_console_messages` → no errors or warnings from `web/` code.
- [ ] **Step 6: Commit**

```bash
git add web/components/sim/SimApp.tsx web/components/sim/Toolbar.tsx web/components/sim/Toolbar.module.css web/app/sim/page.tsx
git commit -m "feat(web): SimApp connects on mount and shows the connection pill and clock from selectors"
```

### Phase gate

- [ ] `cd /home/yks/Projects/luminar/web && npx tsc --noEmit && npm run lint && npx vitest run && npm run build` → green; `npx vitest run` reports every suite from Tasks 1.1–1.9 (`types format copy keys client store dispatch websocket replay actions prefs`).
- [ ] `cd /home/yks/Projects/luminar && make check` → green (old `frontend/` and `backend/` untouched; `git status -- frontend backend` is clean).
- [ ] `grep -rn "useStore()" web/components web/app` → no output.
- [ ] `grep -rn "VITE_\|import.meta.env" web/lib web/components web/app` → no output.
- [ ] The browser walk of Task 1.10 Step 5 passed on the day the phase closes (record the backend commit SHA and the timestamps from step 5 in the PR description).

### Acceptance gate (spec §11, Phase 1, verbatim)

Checklist: `lib/types.ts`, `format.ts`, `api/client.ts` (env rename, `{ok,status,data}`),
`api/websocket.ts`, `api/replay.ts` (streaming parse), `lib/store.ts` (zustand, peer ids, toast
queue, beats), `lib/copy.ts`, `lib/keys.ts`; `SimApp` connects on mount, disconnects on
unmount, shows the connection pill and `simTime` from a selector.
Acceptance: against `make backend`, React DevTools profiler shows only the clock text node
re-rendering at 20 Hz; kill the backend → pill goes `OFFLINE`, reconnect backs off 1 s ×2 → 10 s;
restart → `LIVE`.

---

## Phase 2 — canvas (26–27 Oct, 1½ days; the risk — cut rule applies)

**Goal:** Render the live mesh in the Next app: the deck.gl renderer, the icon atlas with pre-dithered score halos, the full render table of spec §6.2, particles and pulses, the Geo land fill, the mode switcher, fitView and the tooltip, all reading one zustand store with no React re-render per frame.

**Review focus pinned in this phase** (each line names the task whose test covers it):

1. **Snapshot with zero visible nodes in the current mode** (Force on a mainnet-only reel, or Geo right after observers vanish): `renderLayers` sets `layers: []` and `fitView` returns without touching the view; no NaN zoom, no exception — test in Task 2.4.
2. **StrictMode double mount** (React 19 dev runs effect → cleanup → effect): the second `initRenderer` must not leak a `Deck`, a rAF or a store subscription; `destroyRenderer` is idempotent — test in Task 2.4.
3. **A particle whose endpoint leaves the visible set mid-flight** (node preset shrinks, Geo switch, attacker pruned and re-indexed): the particle is dropped, never drawn at `[0,0]` or thrown on — test in Task 2.6.
4. **Atlas rebuild on `data-stage` toggle and on node-count bucket change**: glyph sizes follow `scale.node` and `nodeRadiusPx(n)`; a stale atlas would draw 20-node discs at 200 nodes — test in Task 2.3 (key) and Task 2.4 (rebuild triggered).
5. **Hover on a node that the next snapshot removes**: `hoveredPeer` points at a vanished id; `Tooltip` renders `null`, the renderer clears `hover-*` layers, nothing throws — test in Task 2.8.

### Prerequisites

- Phase 0 scaffold (`web/`, `app/globals.css` = tokens, fonts) and phase 1 (`lib/types.ts`, `lib/format.ts`, `lib/store.ts`, `lib/api/dispatch.ts`, `lib/actions.ts`, `lib/prefs.ts`, `components/sim/SimApp.tsx`) are merged.
- Tasks 2.0a (`components/map/layout.ts`, `components/map/palette.ts`) and 2.0b (`components/dither/dither.ts`) below come first; after them `cd web && npx vitest run components/map components/dither` → PASS.
- `web/public/geo/land-110m.json` exists (copy from `frontend/public/geo/` if phase 4 has not yet; the copy is part of Task 2.7 when missing).
- `@deck.gl/core`, `@deck.gl/layers`, `@deck.gl/extensions` 9.4.0 and `@luma.gl/core`, `@luma.gl/webgl` 9.4.2 are in `web/package.json` (phase 0 pinned them; if not, pin in Task 2.4 after `npm view`).
- Backend: `make backend` on `:8000` with `LUMINAR_ADMIN_TOKEN` unset (POSTs are gated only when it is set; `backend/main.py:176-184`). Web dev server: `make web` on `:3000`.

Browser walks below use chrome-devtools MCP tool names (`navigate_page`, `evaluate_script`, `take_screenshot`, `click`, `press_key`, `performance_start_trace`/`performance_stop_trace`, `emulate`); the same steps work by hand in Chrome DevTools.

### Task 2.0a: Frozen force layout and token palette

**Files:**
- Create: `web/components/map/layout.ts`, `web/components/map/palette.ts`
- Modify: `web/lib/fixtures.ts` (add `peers(n)`, `ring(n)`, A.26)
- Test: `web/components/map/layout.test.ts`, `web/components/map/palette.test.ts`

**Accepted by:** vitest.

**Interfaces:**
- Consumes: A.2 types, `isSimPeer` (`@/lib/format`), `culori`, `d3-force`.
- Produces: A.14 (`LayoutResult`, `GEO_SCALE`, `WORLD_BOUNDS`, `isSimPeer` re-export, `isNodeVisible`, `computeLayout`, `attackerLayoutEdges`, `edgesKey`, `topologyKey`, `resetLayoutMemory`) and A.15 (`PALETTE_TOKENS`, `PaletteKey`, `PAL`, `cssToRgba`, `refreshPalette`, `BAND_DENSITY`, `scoreBand`, `ParticleKind`, `PARTICLE_KEY`, `withAlpha`).

- [ ] **Step 1: Write the failing tests**

```ts
// layout.test.ts
import { peers, ring } from '@/lib/fixtures'
beforeEach(resetLayoutMemory)
test('snapshot before edges: finite positions on the rim, then one cold relayout when edges land', () => {
  const a = computeLayout('force', peers(10), [], edgesKey([])); expect(a.positions.every(([x, y]) => Number.isFinite(x) && Number.isFinite(y))).toBe(true)
  const b = computeLayout('force', peers(10), ring(10), edgesKey(ring(10))); expect(b.positions).not.toEqual(a.positions)
})
test('warm relayout pins known nodes and places a new attacker beside its victim', () => {
  const base = computeLayout('force', peers(20), ring(20), 'k'); const nodes = [...peers(20), { ...peers(1)[0], peer_id: 'sybil-0', index: 20, state: 'attacker' as const, connected_peers: ['peer-3'] }]
  const next = computeLayout('force', nodes, [...ring(20), ...attackerLayoutEdges(nodes)], 'k')
  for (let i = 0; i < 20; i++) expect(next.positions[i]).toEqual(base.positions[i])
  const d = Math.hypot(next.positions[20][0] - base.positions[3][0], next.positions[20][1] - base.positions[3][1]); expect(d).toBeLessThan(Math.max(40, 400 / Math.sqrt(21)) * 2.5)
})
test('attackerLayoutEdges: pruned attacker tethers weakly to ≤2 last_targets', () => {
  expect(attackerLayoutEdges([{ ...peers(1)[0], peer_id: 'sybil-1', state: 'attacker', connected_peers: [], last_targets: ['peer-1', 'peer-2', 'peer-3'] }])).toEqual([['sybil-1', 'peer-1', true], ['sybil-1', 'peer-2', true]])
})
test('geo flips y and hides sim peers; radial centres the highest degree; visibility rule', () => {
  const real = { ...peers(1)[0], peer_id: 'obs-1', is_real: true, x: 10, y: -25 }
  expect(computeLayout('geo', [real], []).positions[0]).toEqual([10, 25]); expect(isNodeVisible('geo', peers(1)[0])).toBe(false); expect(isNodeVisible('force', real)).toBe(false); expect(isNodeVisible('force', undefined)).toBe(false)
  const r = computeLayout('radial', peers(7), [['peer-3', 'peer-0'], ['peer-3', 'peer-1'], ['peer-3', 'peer-2']]); expect(r.positions[3]).toEqual([0, 0])
})
test('topologyKey ignores state changes and hidden nodes', () => {
  const a = topologyKey('force', peers(5), ring(5)); const b = topologyKey('force', peers(5).map(p => ({ ...p, state: 'decoded' as const })), ring(5)); expect(a).toBe(b)
  const withObs = [...peers(5), { ...peers(1)[0], peer_id: 'obs-1', index: 5, is_real: true }]; expect(topologyKey('force', withObs, ring(5))).toBe(a); expect(topologyKey('geo', withObs, ring(5))).not.toBe(a)
})
// palette.test.ts
test('cssToRgba', () => { expect(cssToRgba('#ff5a2c')).toEqual([255, 90, 44, 255]); expect(cssToRgba('rgb(242 242 239 / 0.14)')).toEqual([242, 242, 239, 36]); expect(cssToRgba('oklch(68.3% 0.209 36)')[0]).toBeGreaterThan(240); expect(cssToRgba('#ff5a2c', 0.5)[3]).toBe(128) })
test('scoreBand and densities', () => { expect([-0.1, 0, 1.9, 2, 5.9, 6, 12].map(scoreBand)).toEqual([0, 1, 1, 2, 2, 3, 3]); expect(BAND_DENSITY).toEqual([0.12, 0.35, 0.65, 1]); expect(withAlpha([1, 2, 3, 255], 0.5)).toEqual([1, 2, 3, 128]) })
test('refreshPalette reads tokens and re-reads on data-stage', () => {
  for (const [k, v] of Object.entries(PALETTE_TOKENS)) document.documentElement.style.setProperty(v, k === 'flame' ? '#ff5a2c' : '#f2f2ef')
  expect(refreshPalette()).toBe(true); expect(PAL.flame).toEqual([255, 90, 44, 255]); expect(refreshPalette()).toBe(false)
  document.documentElement.dataset.stage = '1'; expect(refreshPalette()).toBe(true); delete document.documentElement.dataset.stage
})
```

- [ ] **Step 2: Run to verify failure** — `cd /home/yks/Projects/luminar/web && npx vitest run components/map/layout.test.ts components/map/palette.test.ts` → FAIL.

- [ ] **Step 3: Port `frontend/src/map/layout.ts` → `web/components/map/layout.ts` per A.14** (the frozen Force rules under A.14 are binding; add `attackerLayoutEdges`, `edgesKey`, `topologyKey`, `WORLD_BOUNDS`, `resetLayoutMemory`; `export { isSimPeer } from '@/lib/format'`) **and write `web/components/map/palette.ts` per A.15** (token names from `tokens.css`, no `--lm-*`; `refreshPalette` keys its cache on `` `${html.dataset.theme}|${html.dataset.stage}` `` and returns `false` when the computed `--paper-0` is empty). Add `peers`/`ring` to `lib/fixtures.ts`.

- [ ] **Step 4: Run to verify pass** — same command → PASS; `npx tsc --noEmit && npm run lint` clean.

- [ ] **Step 5: Commit**

```bash
git add web/components/map/layout.ts web/components/map/layout.test.ts web/components/map/palette.ts web/components/map/palette.test.ts web/lib/fixtures.ts
git commit -m "feat(web): frozen force layout and token palette ported for the deck.gl renderer"
```

### Task 2.0b: Dither core — ordered Bayer 8×8

**Files:**
- Create: `web/components/dither/dither.ts`
- Test: `web/components/dither/dither.test.ts`

**Accepted by:** vitest for the pure part; `drawDither`/`drawLoupe` are browser-only and are accepted by the Task 5.3 walk.

**Interfaces:**
- Consumes: `RGBA` (A.2).
- Produces: A.19 (`BAYER8`, `bayer`, `luma601`, `applyContrast`, `DITHER_CONTRAST`, `REVEAL_STEPS`, `REVEAL_STEP_MS`, `LOUPE_PX`, `PAPER`, `PITCH`, `FLAME`, `RawImage`, `DitherPalette`, `DitherOpts`, `ditherImageData`, `revealSteps`, `coverRect`, `drawDither`, `drawLoupe`).

- [ ] **Step 1: Write the failing tests**

```ts
test('BAYER8 is the canonical matrix with (v+.5)/64 thresholds', () => { expect(BAYER8).toHaveLength(64); expect(bayer(0, 0)).toBeCloseTo(0.5 / 64); expect(bayer(1, 0)).toBeCloseTo(32.5 / 64); expect(bayer(0, 1)).toBeCloseTo(48.5 / 64); expect(bayer(7, 7)).toBeCloseTo(21.5 / 64); expect(new Set(BAYER8).size).toBe(64) })
test('luma and contrast', () => { expect(luma601(255, 255, 255)).toBeCloseTo(1); expect(applyContrast(0.5, 1.15, 0)).toBeCloseTo(0.5); expect(applyContrast(0, 1.15, 0)).toBe(0); expect(DITHER_CONTRAST).toBe(1.15) })
test('ditherImageData is 1-bit, pure, and density-exact for flat input', () => {
  const grey = (v: number, w = 16, h = 16): RawImage => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4).map((_, i) => (i % 4 === 3 ? 255 : v)) })
  const out = ditherImageData(grey(128), 1, { paper: PAPER, pitch: PITCH }, { contrast: 1 })
  const lit = Array.from({ length: 256 }, (_, i) => out.data[i * 4] === 242).filter(Boolean).length
  expect(lit).toBeGreaterThanOrEqual(124); expect(lit).toBeLessThanOrEqual(132)                         // ~50 % of cells lit
  expect(ditherImageData(grey(0), 1, { paper: PAPER, pitch: PITCH }).data.every((v, i) => i % 4 === 3 || v === [11, 11, 13][i % 4])).toBe(true)
  expect(ditherImageData(grey(128), 1, { paper: PAPER, pitch: PITCH }, { contrast: 1 })).toEqual(out)   // same input → same output (no shimmer)
})
test('cell > 1 lights whole blocks; density mode ignores luma', () => {
  const grey = (v: number, w: number, h: number): RawImage => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4).map((_, i) => (i % 4 === 3 ? 255 : v)) })
  const out = ditherImageData(grey(255, 8, 8), 4, { paper: PAPER, pitch: PITCH }); expect(out.data[0]).toBe(242); expect(out.data[(3 * 8 + 3) * 4]).toBe(242)
  const d = ditherImageData(grey(0, 8, 8), 1, { paper: PAPER, pitch: PITCH }, { density: 0.35 }); const n = Array.from({ length: 64 }, (_, i) => d.data[i * 4] === 242).filter(Boolean).length; expect(n).toBeGreaterThanOrEqual(21); expect(n).toBeLessThanOrEqual(23)
})
test('revealSteps and coverRect', () => { expect(revealSteps(3)).toEqual([28, 20, 14, 10, 7, 5, 4, 3]); expect(revealSteps(4)).toEqual([28, 20, 14, 10, 7, 5, 4]); expect(coverRect(200, 100, 100, 100, 0.5, 0.5)).toEqual([50, 0, 100, 100]); expect(coverRect(100, 200, 100, 100, 0.5, 0)).toEqual([0, 0, 100, 100]) })
```

- [ ] **Step 2: Run to verify failure** — `cd /home/yks/Projects/luminar/web && npx vitest run components/dither/dither.test.ts` → FAIL.

- [ ] **Step 3: Implement `web/components/dither/dither.ts` per A.19** (the 8×8 table from `docs/design/backboard-teardown.md:286-288`; `drawDither` per teardown §9 with `OffscreenCanvas` falling back to a detached `<canvas>`; `willReadFrequently: true` on the small context; DPR = `min(devicePixelRatio, 2)`).

- [ ] **Step 4: Run to verify pass** — same command → PASS; `npx tsc --noEmit && npm run lint` clean.

- [ ] **Step 5: Commit**

```bash
git add web/components/dither/dither.ts web/components/dither/dither.test.ts
git commit -m "feat(web): ordered Bayer 8x8 dither core"
```

### Task 2.1: Reticle glyph and cursor

**Files:**
- Create: `web/components/dither/Reticle.tsx`
- Test: `web/components/dither/Reticle.test.tsx`

**Interfaces:**
- Consumes: nothing.
- Produces: `RETICLE_CURSOR: string` (A.20), `RETICLE_SVG: string`, `Reticle(props: ReticleProps)` (A.20: `size?: number /* 14 */; className?: string; title?: string`).

- [ ] **Step 1: Write the failing test**

```tsx
import { renderToStaticMarkup } from 'react-dom/server'
import { Reticle, RETICLE_CURSOR, RETICLE_SVG } from '@/components/dither/Reticle'
test('reticle is a 14 px ring with four 4 px ticks, paper on a 1 px pitch outline', () => {
  const html = renderToStaticMarkup(<Reticle title="selected" />)
  expect(html).toContain('width="14"'); expect(html).toContain('height="14"')
  expect(html.match(/<line /g)).toHaveLength(4); expect(html.match(/<circle /g)).toHaveLength(2)   // ring + outline ring
  expect(html).toContain('<title>selected</title>')
  expect(html).not.toMatch(/#ff5a2c|flame/i)                                                      // never flame [spec §7.4.3]
  expect(html).toContain('var(--paper-0)'); expect(html).toContain('var(--pitch-0)')                 // the component follows the theme
})
test('RETICLE_CURSOR is a data-URI SVG cursor with hotspot 7 7 and a crosshair fallback', () => {
  expect(RETICLE_CURSOR.startsWith('url("data:image/svg+xml,')).toBe(true)
  expect(RETICLE_CURSOR.endsWith('") 7 7, crosshair')).toBe(true)
  expect(RETICLE_CURSOR).not.toContain('#')                                                       // colours percent-encoded
  expect(decodeURIComponent(RETICLE_CURSOR)).toContain(RETICLE_SVG.slice(0, 40)); expect(decodeURIComponent(RETICLE_CURSOR)).toContain("width='14'")
})
```

- [ ] **Step 2: Run to verify failure**

Run: `cd /home/yks/Projects/luminar/web && npx vitest run components/dither/Reticle.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `components/dither/Reticle.tsx`**

`RETICLE_SVG` (the cursor markup; single-quoted attributes, `width='14' height='14'`): a 14×14 `viewBox` with an outer `circle r='5.5' stroke='#0b0b0d' stroke-width='3'` (the 1 px pitch outline), an inner `circle r='5.5' stroke='#f2f2ef' stroke-width='1'`, and four `line`s of length 4 at N/E/S/W (ticks run 0→3 and 11→14 on each axis, `stroke='#f2f2ef' stroke-width='1'`) — literal hex, because custom properties do not resolve inside a cursor data URI. `Reticle` renders the same drawing as JSX (`<svg width={size} height={size} viewBox="0 0 14 14" role="img">`, optional `<title>`) with `stroke="var(--pitch-0)"` / `stroke="var(--paper-0)"` so it follows the theme. Exports: `default Reticle` and named `Reticle`, `RETICLE_SVG`, `RETICLE_CURSOR = \`url("data:image/svg+xml,${encodeURIComponent(RETICLE_SVG)}") 7 7, crosshair\``. Plain React, no `next/*` import (Remotion reuses it, spec §9); phases 3, 5 and 6 import it and never recreate it (A.0).

- [ ] **Step 4: Run to verify pass**

Run: `cd /home/yks/Projects/luminar/web && npx vitest run components/dither/Reticle.test.tsx && npx tsc --noEmit`
Expected: PASS, tsc clean.

- [ ] **Step 5: Commit**

```bash
git add web/components/dither/Reticle.tsx web/components/dither/Reticle.test.tsx
git commit -m "feat(web): reticle glyph and SVG cursor for plates and the mesh canvas"
```

### Task 2.2: Geometry helpers (radius, Bézier, particle and pulse curves)

**Files:**
- Create: `web/components/map/geometry.ts`
- Test: `web/components/map/geometry.test.ts`

**Interfaces:**
- Consumes: `LayoutMode`, `NodeState` (A.2).
- Produces: the `geometry.ts` block under "New interfaces".

- [ ] **Step 1: Write the failing test**

```ts
test('nodeRadiusPx follows clamp(200/√n, 3, 8) × scale, halved off Force', () => {
  expect(nodeRadiusPx(20, 'force', 1)).toBe(8); expect(nodeRadiusPx(50, 'force', 1)).toBeCloseTo(5.657, 2)
  expect(nodeRadiusPx(200, 'force', 1)).toBeCloseTo(3, 5); expect(nodeRadiusPx(5000, 'force', 1)).toBe(3)
  expect(nodeRadiusPx(50, 'force', 1.4)).toBeCloseTo(7.92, 2); expect(nodeRadiusPx(50, 'radial', 1)).toBeCloseTo(2.828, 2)
})
test('glyphScale: selected ×1.5, attacker ×1.15, both multiply', () => {
  expect(glyphScale({ state: 'idle' }, false)).toBe(1); expect(glyphScale({ state: 'idle' }, true)).toBe(1.5)
  expect(glyphScale({ state: 'attacker' }, false)).toBe(1.15); expect(glyphScale({ state: 'attacker' }, true)).toBeCloseTo(1.725)
})
test('bezierPoint hits the endpoints and bows left of travel', () => {
  expect(bezierPoint([0, 0], [100, 0], 0)).toEqual([0, 0]); expect(bezierPoint([0, 0], [100, 0], 1)).toEqual([100, 0])
  expect(bezierPoint([0, 0], [100, 0], 0.5)[1]).toBeCloseTo(6)                   // bow = min(18, 100 × .12) = 12; midpoint offset = bow/2
  expect(bezierPoint([100, 0], [0, 0], 0.5)[1]).toBeCloseTo(-6)                  // A→B and B→A separate
})
test('particleFrame: ease-out travel over 800 ms, fizzle stalls at .6, null after lifetime', () => {
  expect(particleFrame(0, false)).toEqual({ t: 0, alpha: 242 })
  expect(particleFrame(800, false)!.t).toBe(1); expect(particleFrame(800, false)!.alpha).toBeCloseTo(121)
  expect(particleFrame(400, false)!.t).toBeCloseTo(0.75)
  expect(particleFrame(800, true)!.t).toBe(0.6); expect(particleFrame(800, true)!.alpha).toBeCloseTo(89); expect(particleFrame(1000, true)!.alpha).toBeCloseTo(44.5)
  expect(particleFrame(1201, false)).toBeNull()
})
test('pulseAlpha and breathe', () => {
  expect(pulseAlpha(0)).toBe(56); expect(pulseAlpha(400)).toBe(28); expect(pulseAlpha(900)).toBe(0)
  expect(breathe(0)).toBeCloseTo(0.475); expect(breathe(1400)).toBeCloseTo(0.75); expect(breathe(4200)).toBeCloseTo(0.2)
})
```

- [ ] **Step 2: Run to verify failure**

Run: `cd /home/yks/Projects/luminar/web && npx vitest run components/map/geometry.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `components/map/geometry.ts`** with the signatures and constants above (values ported from `frontend/src/map/renderer.ts:36-80, 234-262`; the non-fizzle alpha is `242 × (1 − progress × .5)`).

- [ ] **Step 4: Run to verify pass**

Run: `cd /home/yks/Projects/luminar/web && npx vitest run components/map/geometry.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/components/map/geometry.ts web/components/map/geometry.test.ts
git commit -m "feat(web): canvas geometry helpers (radius, bezier, particle and pulse curves)"
```

### Task 2.3: Icon atlas with pre-dithered score halos

**Files:**
- Create: `web/components/map/atlas.ts`
- Test: `web/components/map/atlas.test.ts`

**Interfaces:**
- Consumes: `bayer` (A.19), `BAND_DENSITY`, `scoreBand`, `PaletteKey`, `RGBA` (A.15), `PeerNode` (A.2).
- Produces: A.16 (`GlyphId`, `IconAtlas`, `buildAtlas`, `haloFor`) plus `GlyphBox`, `atlasLayout`, `haloCells`, `HALO_OUTER`, `HALO_INNER`, `glyphFor`, `atlasKey`.

- [ ] **Step 1: Write the failing tests** (pure parts only; `buildAtlas` needs a 2D context and is accepted in Task 2.5's walk)

```ts
test('atlasLayout places every GlyphId once, in one row, at dpr-scaled sizes with 2 px gutters', () => {
  const L = atlasLayout(10, 2, 2)
  const ids: GlyphId[] = ['disc', 'idle', 'origin', 'decoded', 'observer', 'joining', 'failed', 'error', 'attacker', 'pruned', 'reticle', 'square', 'squareTrail', 'halo-0', 'halo-1', 'halo-2', 'halo-3']
  expect(Object.keys(L.mapping).sort()).toEqual([...ids].sort())
  expect(L.mapping.disc.width).toBe(Math.ceil((10 + 2) * 2)); expect(L.mapping.disc.mask).toBe(false)
  expect(L.mapping.attacker.width).toBe(Math.ceil(10 * 1.15 * 2) + 4); expect(L.mapping.reticle.width).toBeGreaterThanOrEqual(Math.ceil(10 * 2 * 2))
  expect(L.mapping['halo-3'].width).toBe(Math.ceil(10 * 1.7 * 2) + 4); expect(L.mapping.square.width).toBe(2 * 2 * 2)
  const boxes = Object.values(L.mapping).sort((a, b) => a.x - b.x)
  for (let i = 1; i < boxes.length; i++) expect(boxes[i].x).toBeGreaterThanOrEqual(boxes[i - 1].x + boxes[i - 1].width + 2)
  expect(L.width).toBe(boxes.at(-1)!.x + boxes.at(-1)!.width); expect(L.height).toBe(Math.max(...boxes.map(b => b.height)))
})
test('haloCells fills the annulus at the band density with Bayer, never inside the inner radius', () => {
  const all = haloCells(34, 24, 2, 1)                     // r_out 34, r_in 24 (nodePx 20 × 1.7 / 1.2), 2 px cells
  for (const [x, y] of all) { const d = Math.hypot(x + 1 - 34, y + 1 - 34); expect(d).toBeLessThanOrEqual(34 + 1.5); expect(d).toBeGreaterThanOrEqual(24 - 1.5) }
  const ratio = (dens: number) => haloCells(34, 24, 2, dens).length / all.length
  expect(ratio(0.12)).toBeGreaterThan(0.08); expect(ratio(0.12)).toBeLessThan(0.16)
  expect(ratio(0.35)).toBeGreaterThan(0.30); expect(ratio(0.35)).toBeLessThan(0.40)
  expect(ratio(0.65)).toBeGreaterThan(0.60); expect(ratio(0.65)).toBeLessThan(0.70)
  expect(haloCells(34, 24, 2, 0.35)).toEqual(haloCells(34, 24, 2, 0.35))        // pure: no shimmer between frames
})
test('haloFor and glyphFor follow the render table', () => {
  expect([-1, 0, 2, 6].map(haloFor)).toEqual(['halo-0', 'halo-1', 'halo-2', 'halo-3'])
  const g = (p: Partial<PeerNode>) => glyphFor({ state: 'receiving', connected_peers: [], ...p })
  expect(g({})).toBe('disc'); expect(g({ state: 'idle' })).toBe('idle'); expect(g({ state: 'origin' })).toBe('origin'); expect(g({ state: 'decoded' })).toBe('decoded')
  expect(g({ state: 'joining' })).toBe('joining'); expect(g({ state: 'failed' })).toBe('failed'); expect(g({ state: 'error' })).toBe('error')
  expect(g({ state: 'attacker', connected_peers: ['peer-1'] })).toBe('attacker'); expect(g({ state: 'attacker', connected_peers: [] })).toBe('pruned')
  expect(g({ is_real: true })).toBe('observer'); expect(g({ is_telemetry: true, state: 'decoded' })).toBe('observer')
})
test('atlasKey changes with any input', () => { expect(atlasKey(10, 2, 2, 'dark|')).not.toBe(atlasKey(10, 3, 2, 'dark|1')); expect(atlasKey(10, 2, 2, 'a')).toBe(atlasKey(10, 2, 2, 'a')) })
```

- [ ] **Step 2: Run to verify failure**

Run: `cd /home/yks/Projects/luminar/web && npx vitest run components/map/atlas.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `components/map/atlas.ts`**

Glyph boxes (CSS px before `× dpr`, +4 px padding on glyphs with strokes outside the disc): `disc idle origin decoded joining failed error` = `nodePx + 2`; `decoded` = `nodePx × 1.6 + 2` (ring at 1.6 r); `observer` = `nodePx × 2.0 + 2` (double ring at 1.6 r and 1.9 r); `attacker`/`pruned` = `nodePx × 1.15 + 4`; `reticle` = `nodePx × 2 + 8` (ring at 2 r, 2 px, four 4 px ticks); `square` = `2 × cellPx`, `squareTrail` = `3 × cellPx` wide (trailing cell at half alpha); `halo-*` = `nodePx × HALO_OUTER + 4`. `buildAtlas` draws each glyph with `CanvasRenderingContext2D` at `dpr` scale (`imageSmoothingEnabled = false` for cells): colours from `pal` (`paper0` disc + 1 px rim; `idle` = `pitch4` fill + 1 px `paper3` rim; `origin` = disc + `pitch4` centre dot r/3; `decoded` = disc + 1 px `signal` ring at 1.6 r; `observer` = two 1 px `signal` rings, no fill; `joining` = 1 px `paper1` hollow; `failed` = `paper3` disc with an X in `pitch0`; `error` = same in `flameDim`; `attacker` = `flame` rhombus with 45° hatch lines `pitch0` at .55 every 3 px; `pruned` = 1 px dashed `paper3` rhombus; `reticle` = `paper0`; `square`/`squareTrail` = `paper0` (the layer tints per kind via `getColor`, so `mask: true` for the squares only); `halo-0` = `haloCells(..., BAND_DENSITY[0])` in `flame`; `halo-1..3` in `paper0` at `BAND_DENSITY[1..3]`). `atlasKey` = `${nodePx}|${cellPx}|${dpr}|${paletteVersion}`. `haloFor(score) = \`halo-${scoreBand(score)}\``. Never dither anything but the halos.

- [ ] **Step 4: Run to verify pass**

Run: `cd /home/yks/Projects/luminar/web && npx vitest run components/map/atlas.test.ts && npx tsc --noEmit`
Expected: PASS, tsc clean.

- [ ] **Step 5: Commit**

```bash
git add web/components/map/atlas.ts web/components/map/atlas.test.ts
git commit -m "feat(web): procedural icon atlas with Bayer score halos for the mesh canvas"
```

### Task 2.4: Renderer core, DeckCanvas, layout wiring, fitView

**Files:**
- Create: `web/components/map/renderer.ts`, `web/components/map/DeckCanvas.tsx`, `web/components/map/DeckCanvas.module.css`
- Modify: `web/components/sim/SimApp.tsx` (mount `<DeckCanvas/>` in the canvas slot via `next/dynamic(..., { ssr: false })`), `web/lib/actions.ts` (`runKey('fitView')` → `renderer.fitView()`; `resetTopology`/`visiblePositions` now import the real module — remove any phase-1 stub)
- Test: `web/components/map/renderer.test.ts`, `web/components/map/DeckCanvas.test.tsx`

**Interfaces:**
- Consumes: `useStore`, selectors (A.11); `computeLayout`, `topologyKey`, `attackerLayoutEdges`, `isNodeVisible`, `WORLD_BOUNDS`, `resetLayoutMemory` (A.14); `PAL`, `refreshPalette`, `withAlpha` (A.15); `buildAtlas`, `glyphFor`, `atlasKey` (2.3); `nodeRadiusPx`, `glyphScale` (2.2); `RETICLE_CURSOR` (2.1); `reducedMotion` (A.13).
- Produces: A.17 `initRenderer`, `destroyRenderer`, `resizeRenderer`, `renderLayers`, `fitView`, `visiblePositions`, `resetTopology`, `getViewState`; `LAYER_IDS`, `layerIds`, `markDirty`; A.18 `DeckCanvas`. (`spawnParticle` lands in 2.6.)

- [ ] **Step 1: Write the failing tests** (`vi.mock('@deck.gl/core', ...)` with a `FakeDeck` class recording `props` from the constructor and every `setProps`, exposing `finalize = vi.fn()`; `vi.mock('@/components/map/atlas', ...)` returning `buildAtlas: () => ({ image: document.createElement('canvas'), mapping: {...every GlyphId: {x:0,y:0,width:8,height:8,mask:false}}, nodePx: 8, cellPx: 2 })` plus the real `glyphFor`/`haloFor`/`atlasKey`; fixtures `peers(n)` / `ring(n)` from `lib/fixtures.ts` (Task 2.0a); `beforeEach`: reset store, `resetLayoutMemory()`, `destroyRenderer()`)

```ts
const mount = () => { const c = document.createElement('canvas'); const p = document.createElement('div'); p.appendChild(c); document.body.appendChild(p); initRenderer(c, null); return c }
const flush = () => { vi.advanceTimersByTime(20) }   // one rAF (fake timers drive requestAnimationFrame)
test('init is StrictMode-safe and destroy is idempotent', () => {
  mount(); mount(); expect(FakeDeck.instances).toHaveLength(2); expect(FakeDeck.instances[0].finalize).toHaveBeenCalledTimes(1)
  destroyRenderer(); destroyRenderer(); expect(FakeDeck.instances[1].finalize).toHaveBeenCalledTimes(1)
  useStore.getState().applySnapshot(snapWith(['peer-0'])); flush(); expect(FakeDeck.instances[1].setPropsCalls.filter(p => p.layers)).toHaveLength(0)   // no render after destroy
})
test('deck is created with an OrthographicView, controller, reticle cursor, and empty-click deselects', () => {
  mount(); const d = FakeDeck.instances[0]
  expect(d.props.controller).toBe(true); expect(d.props.getCursor({ isHovering: false })).toBe(RETICLE_CURSOR); expect(d.props.getCursor({ isHovering: true })).toBe('pointer')
  useStore.getState().selectPeer('peer-1'); d.props.onClick({ picked: false }); expect(useStore.getState().selectedPeer).toBeNull()
})
test('snapshot + edges lay out once and emit the pinned layer order with nodes pickable', () => {
  mount(); useStore.getState().applyEdges({ type: 'edges', edges: ring(10) }); useStore.getState().applySnapshot(snapWith(peers(10).map(p => p.peer_id))); flush()
  const ids = layerIds(); expect(ids).toEqual(['edges', 'mesh-edges', 'nodes'].filter(id => ids.includes(id)))   // subset of LAYER_IDS, in LAYER_IDS order
  expect(ids).toContain('nodes'); expect(ids).toContain('edges'); expect(ids.indexOf('edges')).toBeLessThan(ids.indexOf('nodes'))
  const nodes = FakeDeck.instances[0].lastLayer('nodes'); expect(nodes.props.pickable).toBe(true); expect(nodes.props.sizeUnits).toBe('pixels'); expect(nodes.props.data).toHaveLength(10)
  expect([...visiblePositions().keys()]).toHaveLength(10); expect([...visiblePositions().values()].every(([x, y]) => Number.isFinite(x) && Number.isFinite(y))).toBe(true)
  expect(performance.getEntriesByName('layout').length).toBeGreaterThanOrEqual(1)
})
test('state-only snapshots never relayout; a changed edge set relayouts once', () => {
  mount(); useStore.getState().applyEdges({ type: 'edges', edges: ring(10) }); useStore.getState().applySnapshot(snapWith(peers(10).map(p => p.peer_id))); flush()
  const before = performance.getEntriesByName('layout').length; const pos = [...visiblePositions().values()]
  useStore.getState().applySnapshot({ ...snapWith(peers(10).map(p => p.peer_id)), nodes: peers(10).map(p => ({ ...p, state: 'decoded' as const })) }); flush()
  expect(performance.getEntriesByName('layout').length).toBe(before); expect([...visiblePositions().values()]).toEqual(pos)
  useStore.getState().applyEdges({ type: 'edges', edges: ring(10).slice(1) }); flush(); expect(performance.getEntriesByName('layout').length).toBe(before + 1)
})
test('showEdges off removes edges; mesh pairs are deduped and honest-only', () => {
  mount(); useStore.getState().applyEdges({ type: 'edges', edges: ring(6) })
  useStore.getState().applySnapshot({ ...snapWith([...peers(6).map(p => p.peer_id), 'sybil-0']), gossip: { mesh: { 'peer-0': ['peer-1', 'sybil-0'], 'peer-1': ['peer-0'] } } }); flush()
  expect(FakeDeck.instances[0].lastLayer('mesh-edges').props.data).toHaveLength(1)
  useStore.getState().setDisplay({ showEdges: false }); flush(); expect(layerIds()).not.toContain('edges'); expect(layerIds()).not.toContain('mesh-edges')
})
test('geo draws only real nodes; empty visible set yields no layers and fitView is a no-op', () => {
  mount(); useStore.getState().applySnapshot(snapWith(peers(5).map(p => p.peer_id))); useStore.getState().setLayoutMode('geo'); flush()   // no real nodes → store keeps force
  useStore.setState({ geoAvailable: true }); useStore.getState().setLayoutMode('geo'); flush()
  expect(layerIds()).toEqual([]); const calls = FakeDeck.instances[0].setPropsCalls.length; fitView(); expect(FakeDeck.instances[0].setPropsCalls.length).toBe(calls)
  useStore.getState().applySnapshot({ ...snapWith(['obs-1']), nodes: [{ ...peers(1)[0], peer_id: 'obs-1', is_real: true, x: 10, y: -25 }] }); flush()
  expect(FakeDeck.instances[0].lastLayer('nodes').props.data).toHaveLength(1)
  fitView(); const vs = FakeDeck.instances[0].setPropsCalls.at(-1)!.initialViewState; expect(vs.target).toEqual([0, (WORLD_BOUNDS.minY + WORLD_BOUNDS.maxY) / 2, 0]); expect(vs.zoom).toBeLessThanOrEqual(4); expect(vs.transitionDuration).toBe(500)
})
test('fitView pads 80 px, caps zoom at 4 and is called on the rAF after a relayout', () => {
  const c = mount(); Object.defineProperty(c.parentElement!, 'clientWidth', { value: 800 }); Object.defineProperty(c.parentElement!, 'clientHeight', { value: 600 }); resizeRenderer(800, 600)
  useStore.getState().applyEdges({ type: 'edges', edges: ring(2) }); useStore.getState().applySnapshot(snapWith(['peer-0', 'peer-1'])); flush(); flush()
  const vs = FakeDeck.instances[0].setPropsCalls.filter(p => p.initialViewState).at(-1)!.initialViewState; expect(vs.zoom).toBe(4)   // two nodes → tiny bbox → capped
})
test('a 0×0 field never produces a NaN view state; the pending fit runs on the next real resize (global review focus 4)', () => {
  mount(); resizeRenderer(0, 0); useStore.getState().applyEdges({ type: 'edges', edges: ring(3) }); useStore.getState().applySnapshot(snapWith(peers(3).map(p => p.peer_id))); flush(); flush()
  for (const c of FakeDeck.instances[0].setPropsCalls.filter(p => p.initialViewState)) { expect(Number.isFinite(c.initialViewState.zoom)).toBe(true); expect(c.initialViewState.target.every(Number.isFinite)).toBe(true) }
  const before = FakeDeck.instances[0].setPropsCalls.filter(p => p.initialViewState).length
  resizeRenderer(800, 600); flush(); expect(FakeDeck.instances[0].setPropsCalls.filter(p => p.initialViewState).length).toBe(before + 1)
})
test('atlas is rebuilt when data-stage flips or the node-count bucket changes', () => {
  mount(); useStore.getState().applySnapshot(snapWith(peers(20).map(p => p.peer_id))); flush(); const n0 = buildAtlasMock.mock.calls.length
  useStore.getState().applySnapshot(snapWith(peers(20).map(p => p.peer_id))); flush(); expect(buildAtlasMock.mock.calls.length).toBe(n0)
  useStore.getState().setPref('stageTheme', true); document.documentElement.dataset.stage = '1'; flush(); expect(buildAtlasMock.mock.calls.length).toBe(n0 + 1)
  useStore.getState().applySnapshot(snapWith(peers(200).map(p => p.peer_id))); flush(); expect(buildAtlasMock.mock.calls.length).toBe(n0 + 2)
})
// DeckCanvas.test.tsx — renderToStaticMarkup only (effects do not run server-side)
test('DeckCanvas renders a canvas and a tooltip host', () => {
  const html = renderToStaticMarkup(<DeckCanvas className="x" />)
  expect(html).toContain('<canvas'); expect(html).toContain('role="tooltip"'); expect(html).toContain('class="x')
})
```

- [ ] **Step 2: Run to verify failure**

Run: `cd /home/yks/Projects/luminar/web && npx vitest run components/map/renderer.test.ts components/map/DeckCanvas.test.tsx`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement `components/map/renderer.ts` (core)**

Module scope: `deck`, `tooltipEl`, `nodePositions: [number, number][]`, `nodeIndex: Map<string, number>`, `topoKey = ''`, `atlas: IconAtlas | null`, `atlasK = ''`, `fontsReady`, `dirty`, `raf`, `unsubStore`, `fitPending`, `W/H`. `initRenderer(canvas, tooltipEl)`: if a deck exists, `destroyRenderer()` first (StrictMode); `refreshPalette()`; `new Deck({ canvas, views: new OrthographicView({ flipY: false }), initialViewState: { target: [0, 0, 0], zoom: 0 }, controller: true, layers: [], getCursor: ({ isHovering }) => isHovering ? 'pointer' : RETICLE_CURSOR, onClick: info => { if (!info.picked) useStore.getState().selectPeer(null) }, width, height })`; `document.fonts?.load(\`500 10px ${monoFamily()}\`)` then `fontsReady = true; markDirty()` (`monoFamily()` = first entry of the computed `--font-mono` on `<html>`, falling back to `"IBM Plex Mono"` — the hashed `next/font` family, A.0); `unsubStore = useStore.subscribe(markDirty)`; start the rAF loop; `window.__luminar = { store: useStore, fitView, viewState: getViewState, layerIds }`. rAF loop: `if (dirty || animating()) renderLayers()`; `animating()` is false until 2.6 adds particles/pulses/observers. `renderLayers()`: read `useStore.getState()`; `refreshPalette()`; compute `key = topologyKey(layoutMode, nodes, edges)`; when `key !== topoKey`: `performance.mark('layout:start')`, `computeLayout(layoutMode, nodes, [...edges, ...attackerLayoutEdges(nodes)], key)`, `performance.measure('layout', 'layout:start')`, rebuild `nodeIndex`, `topoKey = key`, `fitPending = true`; ensure the atlas (`nodePx = 2 × nodeRadiusPx(visibleCount, layoutMode, scale.node)`, `cellPx` = computed `--cell-mesh` (2; 3 in stage), `dpr = min(devicePixelRatio, 2)`, `paletteVersion = \`${data-theme}|${data-stage}\``; rebuild when `atlasKey(...)` differs); build layers in `LAYER_IDS` order (this task: `edges` as a `PathLayer` + `PathStyleExtension({ dash: true, highPrecisionDash: true })`, `getDashArray: [1, 3]`, `widthUnits: 'pixels'`, width 1, colour `PAL.linkTopology` × `scale.edgeAlpha` (× .4 off Force); `mesh-edges` as a `LineLayer`, `PAL.linkMesh`, 1 px, honest pairs deduped undirected; `nodes` as an `IconLayer({ iconAtlas: atlas.image, iconMapping: atlas.mapping, sizeUnits: 'pixels', getIcon: d => glyphFor(d), getSize: d => atlas.mapping[glyphFor(d)].height / dpr × glyphScale(d, d.peer_id === selectedPeer), getPosition, pickable: true, onClick: info → selectPeer(toggle), onHover: info → hoverPeer(id | null) + tooltip placement (2.8), updateTriggers })`); when no node is visible: `deck.setProps({ layers: [] })` and return; if `fitPending`, call `fitView()` on the next rAF. `fitView({ durationMs = reducedMotion() ? 0 : 500 })`: bbox of visible positions (or `WORLD_BOUNDS` in geo), return when empty **or when `W < 200 || H < 200` (leave `fitPending` set; `resizeRenderer` calls `markDirty()` so the fit runs on the next real size — global review focus 4)**, `pad 80`, `zoom = min(4, log2(min((W − 160)/dx, (H − 160)/dy)))`, `setProps({ initialViewState: { target, zoom, transitionDuration } })`. `resizeRenderer(w, h)` stores `W/H` and `setProps({ width, height })`. `destroyRenderer()`: cancel rAF, unsubscribe, `deck?.finalize()`, null everything; safe to call twice. `resetTopology()`: `topoKey = ''; resetLayoutMemory(); markDirty()`. `visiblePositions()`: `Map` of visible ids → position. `layerIds()`: ids of the last `layers` array passed to `setProps`. `getViewState()`: as today (`renderer.ts:483-486`).

- [ ] **Step 4: Implement `components/map/DeckCanvas.tsx` and mount it**

`'use client'`; `useRef<HTMLCanvasElement>` and `useRef<HTMLDivElement>` for the tooltip host; `useEffect(() => { initRenderer(canvas, tip); const ro = new ResizeObserver(([e]) => resizeRenderer(e.contentRect.width, e.contentRect.height)); ro.observe(canvas.parentElement!); return () => { ro.disconnect(); destroyRenderer() } }, [])`; renders `<div className={styles.field}><canvas className={styles.canvas}/><div ref={tip} role="tooltip" className={styles.tip}><Tooltip/></div></div>` (`Tooltip` is a stub returning `null` until 2.8). `DeckCanvas.module.css`: `.field { position: relative; inset: 0; background: var(--bg); cursor: var(--reticle-cursor, crosshair) }`, `.canvas { position: absolute; inset: 0; width: 100%; height: 100% }`, `.tip { position: absolute; left: 0; top: 0; pointer-events: none; display: none } .tip[data-show="1"] { display: block } :root[data-hero="1"] .tip { display: none !important }`. In `SimApp.tsx` import with `const DeckCanvas = dynamic(() => import('@/components/map/DeckCanvas'), { ssr: false })` and place it in the canvas slot. In `lib/actions.ts`, `runKey('fitView')` calls `fitView()` from `@/components/map/renderer`.

- [ ] **Step 5: Run to verify pass**

Run: `cd /home/yks/Projects/luminar/web && npx vitest run components/map lib && npx tsc --noEmit && npm run lint`
Expected: PASS (phase-1 `actions.test.ts` still passes with its renderer mock), tsc and lint clean.

- [ ] **Step 6: Browser walk — the live mesh renders (the cut-rule milestone)**

1. `make backend` (terminal 1), `make web` (terminal 2). `navigate_page` → `http://localhost:3000/sim/`.
2. Expect: within 1 s of `LIVE` in the pill, paper discs on a near-black field joined by faint dotted edges; no console errors (`list_console_messages` → none at `error` level).
3. `evaluate_script`: `window.__luminar.layerIds()` → an array that is a subsequence of `LAYER_IDS` and contains `'edges'`, `'nodes'` (and `'mesh-edges'` once the first message has built a mesh).
4. Drag the canvas → pans; wheel → zooms; node discs stay the same pixel size (`sizeUnits: 'pixels'`) and edges scale. The pointer over the empty field is the reticle (14 px ring with ticks); over a disc it is the hand.
5. `press_key` `f` → the view animates back to the fitted mesh in ~500 ms. `evaluate_script`: `window.__luminar.viewState().zoom <= 4` → `true`.
6. `curl -s -X POST localhost:8000/api/sim/reconfigure -H 'Content-Type: application/json' -d '{"n_nodes":50}'` → the mesh relays out cold once and refits; `evaluate_script`: `performance.getEntriesByName('layout').length` increased by exactly 1 (a second snapshot with the same edges does not add another).
7. Toggle React StrictMode is on by default in dev: `evaluate_script` → `document.querySelectorAll('canvas').length === 1` and `window.__luminar.layerIds().length > 0` (the second mount owns the deck).
8. React DevTools profiler (or `evaluate_script` wrapping `console.count` in `DeckCanvas`'s render): `DeckCanvas` renders once; the 20 Hz snapshots cause no component render.

- [ ] **Step 7: Commit**

```bash
git add web/components/map/renderer.ts web/components/map/DeckCanvas.tsx web/components/map/DeckCanvas.module.css web/components/map/renderer.test.ts web/components/map/DeckCanvas.test.tsx web/components/sim/SimApp.tsx web/lib/actions.ts
git commit -m "feat(web): deck.gl renderer core with DeckCanvas, frozen layout wiring and fitView"
```

### Task 2.5: Full render table — states, halos, attackers, rings, reticle, hover, highlight, labels

**Files:**
- Modify: `web/components/map/renderer.ts` (layers `attack-links`, `hover-edges`, `hover-peer-rings`, `halos`, `observer-rings`, `reticle`, `event-highlight-edges`, `event-highlight-rings`, `labels`)
- Test: `web/components/map/renderer.test.ts` (append)

**Interfaces:**
- Consumes: `haloFor`, `glyphFor` (2.3), `breathe`, `OBSERVER_STATIC_ALPHA` (2.2), `shortName`, `isAttackerId`, `isPruned` (A.3), `PAL` keys `linkAttack linkHighlight paper1 paper0 flame paper3 flameDim nodeSelected ringTelemetry` (A.15), `reducedMotion` (A.13).
- Produces: every layer of `LAYER_IDS` except `world-land`, `pulses`, `particles`.

- [ ] **Step 1: Write the failing tests** (append to `renderer.test.ts`; fixtures: `grafted = { ...peers(1)[0], peer_id: 'sybil-0', index: 50, state: 'attacker', connected_peers: ['peer-1', 'peer-2'], gossip_score: -0.3 }`, `pruned = { ...grafted, peer_id: 'sybil-1', connected_peers: [], last_targets: ['peer-3'] }`)

```ts
test('glyphs per state; halos only on participating honest peers, band from gossip_score', () => {
  mount(); const nodes = [...peers(6).map((p, i) => ({ ...p, state: (['idle', 'origin', 'receiving', 'decoded', 'joining', 'failed'] as const)[i], gossip_score: [0, 1, 3, 7, 0, 0][i] })), grafted, pruned]
  useStore.getState().applyEdges({ type: 'edges', edges: ring(6) }); useStore.getState().applySnapshot({ ...snapWith(nodes.map(n => n.peer_id)), nodes }); flush()
  const nl = FakeDeck.instances[0].lastLayer('nodes'); expect(nl.props.data.map((d: PeerNode) => nl.props.getIcon(d))).toEqual(['idle', 'origin', 'disc', 'decoded', 'joining', 'failed', 'attacker', 'pruned'])
  const halos = FakeDeck.instances[0].lastLayer('halos'); expect(halos.props.data.map((d: PeerNode) => d.peer_id)).toEqual(['peer-1', 'peer-2', 'peer-3'])   // origin, receiving, decoded; never idle/joining/failed/attacker
  expect(halos.props.data.map((d: PeerNode) => halos.props.getIcon(d))).toEqual(['halo-1', 'halo-2', 'halo-3']); expect(halos.props.pickable).toBe(false)
  expect(layerIds().indexOf('halos')).toBeLessThan(layerIds().indexOf('nodes'))
})
test('negative score → flame halo-0; attack links dashed 4/3 from grafted attackers to each victim; pruned has none', () => {
  mount(); const nodes = [...peers(4).map(p => ({ ...p, state: 'receiving' as const, gossip_score: -0.25 })), grafted, pruned]
  useStore.getState().applyEdges({ type: 'edges', edges: ring(4) }); useStore.getState().applySnapshot({ ...snapWith(nodes.map(n => n.peer_id)), nodes }); flush()
  const halos = FakeDeck.instances[0].lastLayer('halos'); expect(halos.props.data.every((d: PeerNode) => halos.props.getIcon(d) === 'halo-0')).toBe(true)
  const al = FakeDeck.instances[0].lastLayer('attack-links'); expect(al.props.data).toHaveLength(2); expect(al.props.getDashArray).toEqual([4, 3]); expect(al.props.widthUnits).toBe('pixels')
  expect(layerIds().indexOf('attack-links')).toBeGreaterThan(layerIds().indexOf('edges')); expect(layerIds().indexOf('attack-links')).toBeLessThan(layerIds().indexOf('mesh-edges') === -1 ? 99 : layerIds().indexOf('mesh-edges'))
})
test('selection draws the reticle at 2 r and ×1.5 size; hover draws 2 px edges and r+4 rings; event highlight lines + rings', () => {
  mount(); useStore.getState().applyEdges({ type: 'edges', edges: ring(5) }); useStore.getState().applySnapshot(snapWith(peers(5).map(p => p.peer_id))); flush()
  useStore.getState().selectPeer('peer-0', ['peer-2', 'peer-3']); useStore.getState().hoverPeer('peer-1'); flush()
  const nl = FakeDeck.instances[0].lastLayer('nodes'); const d0 = nl.props.data.find((d: PeerNode) => d.peer_id === 'peer-0'); const d4 = nl.props.data.find((d: PeerNode) => d.peer_id === 'peer-4')
  expect(nl.props.getSize(d0) / nl.props.getSize(d4)).toBeCloseTo(1.5)
  const ret = FakeDeck.instances[0].lastLayer('reticle'); expect(ret.props.data).toHaveLength(1); expect(ret.props.getIcon(ret.props.data[0])).toBe('reticle')
  expect(FakeDeck.instances[0].lastLayer('hover-edges').props.data).toHaveLength(2); expect(FakeDeck.instances[0].lastLayer('hover-edges').props.getWidth).toBe(2)
  expect(FakeDeck.instances[0].lastLayer('hover-peer-rings').props.data).toHaveLength(2); expect(FakeDeck.instances[0].lastLayer('hover-peer-rings').props.getRadius).toBe(nodeRadiusPx(5, 'force', 1) + 4)
  expect(FakeDeck.instances[0].lastLayer('event-highlight-edges').props.data).toHaveLength(2); expect(FakeDeck.instances[0].lastLayer('event-highlight-rings').props.data).toHaveLength(2)
  useStore.getState().selectPeer(null); flush(); expect(layerIds()).not.toContain('reticle'); expect(layerIds()).not.toContain('event-highlight-edges')
})
test('observer rings breathe .2→.75 and are static at .5 under reduced motion', () => {
  mount(); const obs = { ...peers(1)[0], peer_id: 'obs-1', is_real: true, x: 1, y: 1 }; useStore.setState({ geoAvailable: true }); useStore.getState().setLayoutMode('geo')
  useStore.getState().applySnapshot({ ...snapWith(['obs-1']), nodes: [obs] }); flush()
  const r1 = FakeDeck.instances[0].lastLayer('observer-rings'); expect(r1.props.data).toHaveLength(1); const a1 = r1.props.getLineColor[3]
  vi.advanceTimersByTime(1400); flush(); expect(FakeDeck.instances[0].lastLayer('observer-rings').props.getLineColor[3]).not.toBe(a1)
  reducedMotionMock.mockReturnValue(true); destroyRenderer(); mount(); useStore.getState().applySnapshot({ ...snapWith(['obs-1']), nodes: [obs] }); flush()
  expect(FakeDeck.instances[1].lastLayer('observer-rings').props.getLineColor[3]).toBe(Math.round(0.5 * 255))
})
test('labels: attackers always (raw id, flame / paper-3 when pruned), selected + hovered as nN, all labels when ≤ 50 visible, none when showLabels off or fonts not ready', () => {
  mount(); fontsReadyForTest(true); const nodes = [...peers(3), grafted, pruned]; useStore.getState().applyEdges({ type: 'edges', edges: ring(3) }); useStore.getState().applySnapshot({ ...snapWith(nodes.map(n => n.peer_id)), nodes }); flush()
  let L = FakeDeck.instances[0].lastLayer('labels'); expect(L.props.data.map((d: PeerNode) => L.props.getText(d))).toEqual(['sybil-0', 'sybil-1']); expect(L.props.fontFamily).toBe(monoFamily()); expect(L.props.fontWeight).toBe(500); expect(L.props.getSize).toBe(10)
  expect(L.props.getColor(grafted)).toEqual(PAL.flame); expect(L.props.getColor(pruned)).toEqual(PAL.paper3)
  useStore.getState().selectPeer('peer-0'); useStore.getState().hoverPeer('peer-2'); flush(); L = FakeDeck.instances[0].lastLayer('labels'); expect(L.props.data.map((d: PeerNode) => L.props.getText(d)).sort()).toEqual(['n0', 'n2', 'sybil-0', 'sybil-1'])
  useStore.getState().setDisplay({ allLabels: true }); flush(); expect(FakeDeck.instances[0].lastLayer('labels').props.data).toHaveLength(5)
  useStore.getState().applySnapshot(snapWith(peers(60).map(p => p.peer_id))); flush(); expect(FakeDeck.instances[0].lastLayer('labels')?.props.data.length ?? 0).toBeLessThanOrEqual(2)   // > 50 visible: all-labels ignored
  useStore.getState().setPref('stageTheme', true); flush(); expect(FakeDeck.instances[0].lastLayer('labels')?.props.getSize ?? 12).toBe(12)
  useStore.getState().setDisplay({ showLabels: false }); flush(); expect(layerIds()).not.toContain('labels')
})
```

(`fontsReadyForTest` is a test-only export guarded by `process.env.NODE_ENV === 'test'`, or the test resolves a mocked `document.fonts.load` — builder's choice; `reducedMotionMock` is `vi.mock('@/lib/prefs')`; `beforeEach` sets `document.documentElement.style.setProperty('--font-mono', '"__IBM_Plex_Mono_test", monospace')` so `monoFamily()` returns `"__IBM_Plex_Mono_test"`.)

- [ ] **Step 2: Run to verify failure**

Run: `cd /home/yks/Projects/luminar/web && npx vitest run components/map/renderer.test.ts`
Expected: FAIL on the new tests (missing layers).

- [ ] **Step 3: Implement the remaining layers in `renderer.ts`**

In `LAYER_IDS` order. `attack-links`: `PathLayer` + `PathStyleExtension({ dash: true })`, `getDashArray: [4, 3]`, 1 px, `PAL.linkAttack` (alpha × `scale.edgeAlpha`), source = each grafted attacker, target = each `connected_peers` victim with a visible position. `hover-edges`: topology edges touching `hoveredPeer`, `LineLayer` width 2 `widthMinPixels 2`, `PAL.paper1`; `hover-peer-rings`: `ScatterplotLayer` stroked, `radiusUnits: 'pixels'`, `getRadius: nodeRadiusPx + 4`, `PAL.paper1`, over the hovered node's `connected_peers`. `halos`: `IconLayer`, `data` = visible sim peers whose `state ∈ {origin, receiving, decoded}` (idle has no history yet; joining/failed/error/attacker carry their own glyphs), `getIcon: d => haloFor(d.gossip_score)`, size = `mapping[halo].height / dpr`, not pickable, `updateTriggers.getIcon = [bandKey]` where `bandKey` is the joined `scoreBand` string. `observer-rings`: observers draw in `nodes` with the static `'observer'` double-ring glyph; the breathing is alpha only, so `observer-rings` is a stroked `ScatterplotLayer` ring at 1.6 r, 1.5 px, `radiusUnits: 'pixels'`, `withAlpha(PAL.ringTelemetry, (reducedMotion() ? OBSERVER_STATIC_ALPHA : breathe(now)) × 255)`; `animating()` returns true while any observer is visible and motion is allowed. `reticle`: `IconLayer` glyph `'reticle'` at the selected node (visible in the current mode), size `mapping.reticle.height / dpr`. `event-highlight-edges`: `LineLayer` from the selected node to each `highlightPeers` position, 2.5 px, `withAlpha(PAL.linkHighlight, 161)`; `event-highlight-rings`: stroked `ScatterplotLayer` at 1.8 r, 1.5 px, `withAlpha(PAL.linkHighlight, 230)`. `labels`: `TextLayer` gated by `showLabels && fontsReady`; data = attackers ∪ selected ∪ hovered ∪ (allLabels && visibleCount ≤ 50 ? all visible : ∅); `getText`: attacker → `peer_id`, else `shortName`; `getColor`: attacker → grafted `PAL.flame` / pruned `PAL.paper3`, else `PAL.paper0`; `getSize: stageTheme ? 12 : 10`, `sizeUnits: 'pixels'`, `fontFamily: monoFamily()`, `fontWeight: 500`, `getTextAnchor: 'start'`, `getAlignmentBaseline: 'center'`, `getPixelOffset: [nodeRadiusPx × glyphScale + 3, 0]` (pixels, so the label hugs the disc at any zoom), `characterSet: 'auto'`. Selected node: `glyphScale(d, true)` in `nodes`' `getSize`, `updateTriggers.getSize = [selectedPeer]`.

- [ ] **Step 4: Run to verify pass**

Run: `cd /home/yks/Projects/luminar/web && npx vitest run components/map/renderer.test.ts && npx tsc --noEmit && npm run lint`
Expected: PASS, clean.

- [ ] **Step 5: Browser walk — the Sybil/eclipse demo reads by shape**

1. Backend + web up; `navigate_page` → `http://localhost:3000/sim/`; wait for `LIVE`.
2. `curl -s -X POST localhost:8000/api/scenarios/demo_sybil_eclipse/launch -H 'Content-Type: application/json' -d '{"speed":1}'` → `{"status": ...}`.
3. T+0–10: paper discs; after the first publish (≈T+6) the origin disc shows a pitch centre dot, receiving/decoded peers show the 2 px-cell halo (band 1 → 2 as scores grow), decoded peers carry the signal ring. `take_screenshot` at 2× zoom: halo cells are square and crisp (no grey smear).
4. T+10: **five flame diamonds** appear beside their victims, each with 45° hatch, dashed (4/3) flame links to every victim, raw `sybil-N` label in flame. `evaluate_script`: `__luminar.layerIds()` contains `'attack-links'`, `'halos'`, `'labels'` in that relative order.
5. T+11–13: victims' halos flip to **sparse flame cells** (band 0) as their scores dip, then the first prune: a diamond goes **hollow dashed paper-3**, its attack links disappear, its label turns paper-3; by ≈T+14 all five are hollow. No diamond is ever dithered or blurred.
6. T+16: `eclipse-0..3` diamonds appear around one peer (peer-10 in the recorded reel). Hover that peer: its topology edges go 2 px paper-1 and its peers get r+4 rings; the tooltip (2.8) is not required yet.
7. Click a disc → reticle (ring at 2 r + four ticks, 2 px) and the disc grows ×1.5; click the empty field → deselect; drag → never deselects.
8. Legend settings are phase 3; toggle via console instead: `__luminar.store.getState().setDisplay({ allLabels: true })` → every disc labelled `nN` (50 nodes); `setDisplay({ showEdges: false })` → dotted edges and mesh lines vanish, attack links stay; `setDisplay({ showLabels: false })` → no labels at all.
9. `emulate` `prefers-reduced-motion: reduce` and reload: no observers yet, so only check later in 2.7; note for 2.6.
10. `press_key` `t` (stage, phase-1 prefs): discs ×1.4, labels 12 px, halo cells 3 px, edges brighter; `evaluate_script`: `__luminar.layerIds()` unchanged.

- [ ] **Step 6: Commit**

```bash
git add web/components/map/renderer.ts web/components/map/renderer.test.ts
git commit -m "feat(web): full render table on the canvas (halos, diamonds, rings, reticle, hover, highlight, labels)"
```

### Task 2.6: Particles and pulses

**Files:**
- Modify: `web/components/map/renderer.ts` (`spawnParticle`, `particlesFor`, layers `pulses`, `particles`, `subscribeEvents` registration, `animating()`)
- Test: `web/components/map/renderer.test.ts` (append), `web/components/map/particles.test.ts` (pure trigger table)

**Interfaces:**
- Consumes: `subscribeEvents` (A.8), `ParticleKind`, `PARTICLE_KEY` (A.15), `particleFrame`, `bezierPoint`, `pulseAlpha`, caps (2.2), `reducedMotion` (A.13), `STATE` colours via `PAL` (`nodeOrigin nodeReceiving nodeDecoded nodeJoining nodeFailed nodeError nodeAttacker nodePruned`).
- Produces: A.17 `spawnParticle(fromId, toId, kind = 'message', fizzle = false)`; `particlesFor`.

- [ ] **Step 1: Write the failing tests**

```ts
// particles.test.ts — pure
const pick = (ids: string[]) => ids[0]
const E = (p: Partial<AppEvent>): AppEvent => ({ at: 1, event_type: 'GossipMessage', category: 'gossip', ...p })
test('trigger table', () => {
  expect(particlesFor(E({ from_peer: 'peer-1', to_peer: 'peer-2' }), pick)).toEqual([{ from: 'peer-1', to: 'peer-2', kind: 'message', fizzle: false }])
  expect(particlesFor(E({ from_peer: 'sybil-3', to_peer: 'peer-2', msg_id: 'spam-9' }), pick)).toEqual([{ from: 'sybil-3', to: 'peer-2', kind: 'spam', fizzle: false }])
  expect(particlesFor(E({ from_peer: 'peer-1', to_peer: 'peer-2', dropped: true }), pick)[0].fizzle).toBe(true)
  expect(particlesFor(E({ event_type: 'GossipGraft', from_peer: 'a', to_peer: 'b' }), pick)[0].kind).toBe('graft')
  expect(particlesFor(E({ event_type: 'GossipPrune', from_peer: 'a', to_peer: 'b' }), pick)[0].kind).toBe('prune')
  expect(particlesFor(E({ event_type: 'DHTQueryStarted', category: 'dht', peer_id: 'peer-1' }), ids => ids[0])).toEqual([{ from: 'peer-1', to: expect.any(String), kind: 'dht', fizzle: false }])
  expect(particlesFor(E({ event_type: 'FaultInjected', category: 'fault', fault_type: 'eclipse', target: 'peer-5' }), pick).every(p => p.kind === 'fault' && p.from === 'peer-5')).toBe(true)
  expect(particlesFor(E({ event_type: 'FaultInjected', category: 'fault', fault_type: 'sybil', count: 5 }), pick)).toEqual([])   // target not a node id → no burst
  expect(particlesFor(E({ event_type: 'ClockTick', category: 'clock' }), pick)).toEqual([])
  expect(particlesFor(E({ event_type: 'FaultInjected', category: 'fault', fault_type: 'drop', target: 'peer-5' }), pick).length).toBeLessThanOrEqual(4)   // first 4 peers only
})
// renderer.test.ts — append
test('spawnParticle: cap 600, unknown/hidden peers no-op, disabled no-op; particles layer uses the square glyph and spam gets the trail', () => {
  mount(); useStore.getState().applyEdges({ type: 'edges', edges: ring(10) }); useStore.getState().applySnapshot(snapWith(peers(10).map(p => p.peer_id))); flush()
  spawnParticle('peer-0', 'nope'); flush(); expect(layerIds()).not.toContain('particles')
  for (let i = 0; i < 700; i++) spawnParticle('peer-0', 'peer-1'); spawnParticle('sybil-x', 'peer-1'); flush()
  const P = FakeDeck.instances[0].lastLayer('particles'); expect(P.props.data.length).toBeLessThanOrEqual(600); expect(P.props.getIcon(P.props.data[0])).toBe('square'); expect(P.props.sizeUnits).toBe('pixels'); expect(P.props.pickable).toBe(false)
  useStore.getState().applySnapshot({ ...snapWith([...peers(10).map(p => p.peer_id), 'sybil-0']), nodes: [...peers(10), grafted] }); flush(); spawnParticle('sybil-0', 'peer-1', 'spam'); flush()
  const P2 = FakeDeck.instances[0].lastLayer('particles'); const spam = P2.props.data.at(-1); expect(P2.props.getIcon(spam)).toBe('squareTrail'); expect(P2.props.getColor(spam).slice(0, 3)).toEqual(PAL.particleSpam.slice(0, 3))
  useStore.getState().setDisplay({ particlesEnabled: false }); spawnParticle('peer-0', 'peer-1'); // no throw, no push
  vi.advanceTimersByTime(1300); flush(); expect(layerIds()).not.toContain('particles')   // all expired
})
test('a particle whose endpoint leaves the visible set is dropped, not drawn at [0,0]', () => {
  mount(); useStore.getState().applyEdges({ type: 'edges', edges: ring(10) }); useStore.getState().applySnapshot(snapWith(peers(10).map(p => p.peer_id))); flush()
  spawnParticle('peer-0', 'peer-9'); useStore.getState().applySnapshot(snapWith(peers(5).map(p => p.peer_id))); flush()
  const P = FakeDeck.instances[0].lastLayer('particles'); expect(P?.props.data.length ?? 0).toBe(0)
})
test('event subscription spawns from the batch; pulses on state change to non-idle incl. graft↔prune flip; both off under reduced motion', () => {
  mount(); useStore.getState().applyEdges({ type: 'edges', edges: ring(4) }); useStore.getState().applySnapshot(snapWith(peers(4).map(p => p.peer_id))); flush()
  dispatchFrame({ at: 1, event_type: 'GossipMessage', category: 'gossip', from_peer: 'peer-0', to_peer: 'peer-1', msg_id: 'm' }); flushEvents(); flush(); expect(FakeDeck.instances[0].lastLayer('particles').props.data).toHaveLength(1)
  useStore.getState().applySnapshot({ ...snapWith(peers(4).map(p => p.peer_id)), nodes: peers(4).map((p, i) => ({ ...p, state: i === 0 ? 'decoded' : 'idle' })) }); flush()
  const pulses = FakeDeck.instances[0].lastLayer('pulses'); expect(pulses.props.data).toHaveLength(1); expect(pulses.props.getRadius).toBeCloseTo(nodeRadiusPx(4, 'force', 1) * 2.5); expect(pulses.props.data[0].color[3]).toBeLessThanOrEqual(56)
  useStore.getState().applySnapshot({ ...snapWith([...peers(4).map(p => p.peer_id), 'sybil-0']), nodes: [...peers(4), grafted] }); flush(); useStore.getState().applySnapshot({ ...snapWith([...peers(4).map(p => p.peer_id), 'sybil-0']), nodes: [...peers(4), { ...grafted, connected_peers: [] }] }); flush()
  expect(FakeDeck.instances[0].lastLayer('pulses').props.data.some((d: any) => d.id === 'sybil-0')).toBe(true)
  vi.advanceTimersByTime(900); flush(); expect(layerIds()).not.toContain('pulses')
  reducedMotionMock.mockReturnValue(true); destroyRenderer(); mount(); useStore.getState().applySnapshot(snapWith(peers(4).map(p => p.peer_id))); flush()
  useStore.getState().applySnapshot({ ...snapWith(peers(4).map(p => p.peer_id)), nodes: peers(4).map(p => ({ ...p, state: 'decoded' as const })) }); flush(); expect(layerIds()).not.toContain('pulses')
})
```

- [ ] **Step 2: Run to verify failure**

Run: `cd /home/yks/Projects/luminar/web && npx vitest run components/map/particles.test.ts components/map/renderer.test.ts`
Expected: FAIL (`particlesFor`/`spawnParticle` not exported; layers missing).

- [ ] **Step 3: Implement**

`particlesFor(evt, pick)`: `GossipMessage` → `[{from: from_peer, to: to_peer, kind: isAttackerId(from_peer) && from_peer.startsWith('sybil-') ? 'spam' : 'message', fizzle: !!dropped}]`; `GossipGraft`/`GossipPrune` → `graft`/`prune`; `DHTQueryStarted` with `peer_id` → one particle to `pick(nodeById.get(peer_id).connected_peers)` (renderer passes a random picker); `FaultInjected` with `target` that is a known node id → `fault` burst to the first 4 `connected_peers`; everything else `[]`. `initRenderer` registers `subscribeEvents(batch => { for (const e of batch) for (const p of particlesFor(e, rnd)) spawnParticle(p.from, p.to, p.kind, p.fizzle) })` and unsubscribes in `destroyRenderer`. `spawnParticle`: return when `!particlesEnabled`, `particles.length >= PARTICLE_CAP`, or either id is not in `nodeIndex`; push `{ fromId, toId, start: performance.now(), kind, fizzle }`. `particles` layer: `IconLayer`, `getIcon: p => p.kind === 'spam' ? 'squareTrail' : 'square'`, `sizeUnits: 'pixels'`, size `2 × cellPx × scale.particle` (`squareTrail` 3 cells wide), `getColor: p => withAlpha(fizzle ? PAL.nodeError : PAL[PARTICLE_KEY[kind]], frame.alpha)`, `getPosition: bezierPoint(posOf(from), posOf(to), frame.t)`, `getAngle` for the trail = direction of travel; a particle whose `particleFrame` is null or whose endpoint has no visible position is removed from the array in the same pass. `pulses`: `prevStateKeys` per id (`state` + `'+'|'-'` for attackers by `connected_peers.length`), state change to non-idle and `!reducedMotion()` → push `{ id, start, color: PAL[node<State>] }`, cap `PULSE_CAP`; `ScatterplotLayer`, `radiusUnits: 'pixels'`, `getRadius: nodeRadiusPx × 2.5`, `getFillColor: withAlpha(color, pulseAlpha(age))`, expired pulses spliced. `animating()` = `particles.length > 0 || pulses.length > 0 || (observersVisible && !reducedMotion())`. Positions are looked up by id each frame (not by index), so a reindexed snapshot cannot move a particle onto the wrong node.

- [ ] **Step 4: Run to verify pass**

Run: `cd /home/yks/Projects/luminar/web && npx vitest run components/map && npx tsc --noEmit && npm run lint`
Expected: PASS, clean.

- [ ] **Step 5: Browser walk — traffic reads as hard squares**

1. Backend + web; `/sim/`; launch `demo_sybil_eclipse` by curl as in 2.5.
2. T+6 onward: 2-cell paper squares ride bowed paths from the origin outward (A→B and B→A on separate bows), no blur, no glow; each delivered hop ends at the target and fades; `take_screenshot` zoomed: squares are square.
3. T+10–12: **flame squares with a trailing cell** stream from each `sybil-N` diamond into its victims (spam); once a diamond goes hollow its spam stops.
4. T+16–24: the four `eclipse-N` diamonds emit **no** spam particles (silent attackers); the eclipsed peer's halo stays band 1–2 (never flame) — the WHY line of the inspector in phase 3 depends on this being visibly true.
5. Pulses: when a disc changes state (idle → receiving, graft → prune) a 2.5 r disc flashes at alpha 56 and fades over 800 ms; never on idle.
6. `evaluate_script` during the burst: `__luminar.layerIds()` has `'pulses'` before `'particles'` before `'halos'`.
7. `emulate` `prefers-reduced-motion: reduce`, reload, relaunch the scenario: no particles, no pulses; the mesh and diamonds still appear.
8. Idle (no traffic for 2 s): `performance_start_trace` 3 s → `performance_stop_trace`; the main thread shows no per-frame `renderLayers` work (the rAF loop skips when nothing animates and the store is clean).

- [ ] **Step 6: Commit**

```bash
git add web/components/map/renderer.ts web/components/map/renderer.test.ts web/components/map/particles.test.ts
git commit -m "feat(web): gossip particles and state pulses as hard squares on the canvas"
```

### Task 2.7: Geo land, mode switcher, auto-Geo

**Files:**
- Create: `web/components/sim/ModeSwitcher.tsx`, `web/components/sim/ModeSwitcher.module.css`
- Modify: `web/components/map/renderer.ts` (`world-land` layer, land loading), `web/lib/actions.ts` (`initAutoGeo`, A.29), `web/components/sim/SimApp.tsx` (mount `<ModeSwitcher/>` top-centre over the canvas; call `initAutoGeo()` in the mount effect and its unsubscribe in cleanup), `web/lib/store.ts` only if `geoAutoDone` is not reset when `mainnet.enabled` flips false (add + test)
- Copy if missing: `web/public/geo/land-110m.json` ← `frontend/public/geo/land-110m.json`
- Test: `web/components/sim/ModeSwitcher.test.tsx`, `web/components/map/renderer.test.ts` (append)

**Interfaces:**
- Consumes: `getStatic` (A.7), `GEO_SCALE`, `WORLD_BOUNDS` (A.14), `setLayoutMode`, `selectCanGeo`, `layoutBeforeGeo`, `mainnet`, `geoAutoDone` (A.11), `maybeAutoGeo`, `leaveGeoForSim` (A.12), `FillStyleExtension` (`@deck.gl/extensions`).
- Produces: `ModeSwitcher`, `GEO_DISABLED`; `world-land` layer; `initAutoGeo(): () => void` (A.29).

- [ ] **Step 1: Write the failing tests**

```tsx
// ModeSwitcher.test.tsx (renderToStaticMarkup reads the store at render time; interactions tested through the store)
test('three tabs, aria-pressed follows layoutMode, Geo disabled with reason until geoAvailable', () => {
  let html = renderToStaticMarkup(<ModeSwitcher />)
  expect(html.match(/<button/g)).toHaveLength(3); expect(html).toMatch(/FORCE[\s\S]*RADIAL[\s\S]*GEO/)
  expect(html).toContain('aria-pressed="true">FORCE'); expect(html).toMatch(/<button[^>]*disabled[^>]*title="Geo needs real observers · turn MAINNET on"[^>]*>GEO/)
  useStore.setState({ geoAvailable: true, layoutMode: 'radial' }); html = renderToStaticMarkup(<ModeSwitcher />)
  expect(html).not.toMatch(/disabled[^>]*>GEO/); expect(html).toContain('aria-pressed="true">RADIAL')
  expect(html).toContain('role="group"'); expect(html).toContain('aria-label="Layout"')
})
test('a manual pick writes layoutMode through setLayoutMode and clears the remembered layout', () => {
  useStore.setState({ geoAvailable: true, layoutMode: 'geo', layoutBeforeGeo: 'radial' }); useStore.getState().setLayoutMode('force'); expect(useStore.getState().layoutMode).toBe('force'); expect(useStore.getState().layoutBeforeGeo).toBeNull()
})
// store.test.ts (only if missing): geoAutoDone resets when mainnet turns off
test('auto-Geo happens once per feed-on', () => {
  useStore.setState({ geoAvailable: true }); useStore.getState().applyTelemetryStatus({ type: 'telemetry_status', active: false, peer_count: 0, peers: [], mainnet: { enabled: true, observers: 3 } }); maybeAutoGeo()
  expect(useStore.getState().layoutMode).toBe('geo'); expect(useStore.getState().geoAutoDone).toBe(true)
  useStore.getState().setLayoutMode('force'); maybeAutoGeo(); expect(useStore.getState().layoutMode).toBe('force')
  useStore.getState().applyTelemetryStatus({ type: 'telemetry_status', active: false, peer_count: 0, peers: [], mainnet: { enabled: false, observers: 0 } }); expect(useStore.getState().geoAutoDone).toBe(false)
})
// renderer.test.ts — append (vi.mock('@/lib/api/client', () => ({ getStatic: vi.fn(async () => ({ features: [{ geometry: { type: 'Polygon', coordinates: [[[0, 0], [10, 0], [10, 10], [0, 0]]] } }] })) })))
test('geo loads land once and draws it under everything with the checker fill', async () => {
  mount(); useStore.setState({ geoAvailable: true }); useStore.getState().setLayoutMode('geo'); useStore.getState().applySnapshot({ ...snapWith(['obs-1']), nodes: [{ ...peers(1)[0], peer_id: 'obs-1', is_real: true, x: 10, y: -25 }] }); flush(); await Promise.resolve(); flush()
  expect(getStatic).toHaveBeenCalledTimes(1); expect(getStatic).toHaveBeenCalledWith('/geo/land-110m.json')
  expect(layerIds()[0]).toBe('world-land'); const land = FakeDeck.instances[0].lastLayer('world-land')
  expect(land.props.getPolygon(land.props.data[0])[1]).toEqual([10 * GEO_SCALE, 0]); expect(land.props.extensions.some((e: any) => e.constructor.extensionName === 'FillStyleExtension')).toBe(true); expect(land.props.fillPatternMask).toBe(true); expect(land.props.pickable).toBe(false)
  useStore.getState().setLayoutMode('force'); flush(); expect(layerIds()).not.toContain('world-land'); useStore.getState().setLayoutMode('geo'); flush(); expect(getStatic).toHaveBeenCalledTimes(1)
})
```

- [ ] **Step 2: Run to verify failure**

Run: `cd /home/yks/Projects/luminar/web && npx vitest run components/sim/ModeSwitcher.test.tsx components/map/renderer.test.ts lib/store.test.ts`
Expected: FAIL (component missing; `world-land` missing).

- [ ] **Step 3: Implement**

`world-land`: `ensureLand()` as today (`renderer.ts:133-144`), `getStatic('/geo/land-110m.json')`, rings scaled by `GEO_SCALE`, `landLoading` guard; `PolygonLayer({ id: 'world-land', data, getPolygon, filled: true, stroked: true, getFillColor: PAL.paper0, getLineColor: withAlpha(PAL.paper0, 0.16 × 255), lineWidthMinPixels: 1, pickable: false, extensions: [new FillStyleExtension({ pattern: true })], fillPatternAtlas: checkerCanvas /* 2×2: paper at (0,0),(1,1), transparent elsewhere */, fillPatternMapping: { checker: { x: 0, y: 0, width: 2, height: 2 } }, getFillPattern: () => 'checker', fillPatternMask: true, getFillPatternScale: scaleForZoom, getFillPatternOffset: [0, 0] })` where `scaleForZoom` keeps one pattern pixel ≈ 1 CSS px: `2 / 2 ** zoom` common units (recomputed in `onViewStateChange` → `markDirty()`); if deck 9.4's `FillStyleExtension` offers pixel size units, use them instead and drop the recompute. Only in `layoutMode === 'geo'`, first in the layer list. `ModeSwitcher.tsx`: `'use client'`; `const mode = useStore(s => s.layoutMode); const canGeo = useStore(selectCanGeo)`; `<div role="group" aria-label="Layout" className={styles.switch}>` with three `<button type="button" aria-pressed={mode === m} disabled={m === 'geo' && !canGeo} title={m === 'geo' && !canGeo ? GEO_DISABLED : undefined} onClick={() => m !== mode && useStore.getState().setLayoutMode(m)}>` labelled `FORCE | RADIAL | GEO` (Manrope 600 `--t-label` uppercase .12em, hairline separators, no box; `:focus-visible` 2 px `--focus`). One effect: `useEffect(() => { if (!canGeo && mode === 'geo') useStore.getState().setLayoutMode(useStore.getState().layoutBeforeGeo ?? 'force') }, [canGeo, mode])` (previous layout restored when real nodes vanish). Auto-Geo is **not** a component effect (A.0): add `initAutoGeo()` to `lib/actions.ts` — `useStore.subscribe(s => [s.mainnet?.enabled ?? false, s.geoAvailable] as const, ([on, geo]) => { if (on && geo) maybeAutoGeo() }, { equalityFn: shallow })`, returning the unsubscribe — and mount it in `SimApp`'s effect next to `ws.connect()`; Task 4.6 pins its frame-order test. If `store.applyTelemetryStatus` does not already reset `geoAutoDone` when `enabled` goes false, add that one line with the store test above. Mount in `SimApp.tsx` absolutely positioned top-centre over the canvas (`top: 12px; left: 50%; transform: translateX(-50%)`), hidden under `data-hero="1"`? No — the switcher stays in hero (the talk switches to Geo live); only rails/legend/tooltip/kbd hide (spec §6.3).

- [ ] **Step 4: Run to verify pass**

Run: `cd /home/yks/Projects/luminar/web && npx vitest run components lib && npx tsc --noEmit && npm run lint`
Expected: PASS, clean.

- [ ] **Step 5: Browser walk — Geo is for observers only**

1. Backend + web; `/sim/`. Top-centre: `FORCE | RADIAL | GEO`, Geo greyed; hover → title `Geo needs real observers · turn MAINNET on`.
2. `click` RADIAL → rings by degree, highest degree at centre, discs half size, edges at .4 alpha; `f` refits. `click` FORCE → the frozen force positions come back unchanged (no re-tick).
3. `curl -s -X POST localhost:8000/api/live/mainnet -H 'Content-Type: application/json' -d '{"enabled":true}'` (the toolbar badge is phase 3). Within one slot (≤ 12 s): Geo tab enabled and **auto-selected once**; the land masses draw as a 50 % paper checker with a 1 px .16 outline; **only observer double rings** draw (no sim discs, no topology edges); `evaluate_script`: `__luminar.layerIds()[0] === 'world-land'` and `__luminar.store.getState().layoutBeforeGeo === 'force'`.
4. Observer rings breathe .2 → .75 over 5.6 s; `emulate` reduced motion + reload → static at .5.
5. On a `BlockSeen first` the observers flash origin/decoded (phase-1 store) and the Geo fit holds (`WORLD_BOUNDS`, Antarctica cropped); `press_key` `f` → same framing.
6. `click` FORCE while mainnet is on → sim mesh returns; `click` GEO again → observers; `evaluate_script` `__luminar.store.getState().layoutBeforeGeo` is `null` after a manual pick.
7. `curl -s -X POST localhost:8000/api/sim/reconfigure -H 'Content-Type: application/json' -d '{"n_nodes":50}'` while in Geo → the next snapshot still shows observers only (sim actions through the UI leave Geo with a toast in phase 3; a raw curl does not and must not break Geo).
8. `curl ... /api/live/mainnet -d '{"enabled":false}'` → observers vanish within a slot, the switcher **restores `force`** and Geo greys out again; turning mainnet back on auto-picks Geo once more (feed-on resets `geoAutoDone`).
9. `list_console_messages` → no errors through the whole walk.

- [ ] **Step 6: Commit**

```bash
git add web/components/sim/ModeSwitcher.tsx web/components/sim/ModeSwitcher.module.css web/components/sim/ModeSwitcher.test.tsx web/components/map/renderer.ts web/components/map/renderer.test.ts web/components/sim/SimApp.tsx web/lib/actions.ts web/public/geo/land-110m.json web/lib/store.ts web/lib/store.test.ts
git commit -m "feat(web): dithered Geo land fill, layout mode switcher and auto-Geo"
```

### Task 2.8: Tooltip

**Files:**
- Create: `web/components/sim/Tooltip.tsx`, `web/components/sim/Tooltip.module.css`
- Modify: `web/components/map/renderer.ts` (tooltip placement in `onHover`), `web/components/map/DeckCanvas.tsx` (render the real `<Tooltip/>`)
- Test: `web/components/sim/Tooltip.test.tsx`

**Interfaces:**
- Consumes: `selectHoveredNode`, `mesh`, `nodeById` (A.11), `shortName`, `signed`, `isAttackerId`, `isPruned` (A.3), `fmtCount`.
- Produces: `Tooltip`, `tooltipRows`.

- [ ] **Step 1: Write the failing tests**

```tsx
const honest: PeerNode = { peer_id: 'peer-7', index: 7, state: 'decoded', connected_peers: ['peer-1', 'peer-2', 'sybil-0'], x: 0, y: 0, messages_sent: 1284, messages_received: 61900, gossip_score: 3.5 }
const grafted: PeerNode = { ...honest, peer_id: 'sybil-0', index: 50, state: 'attacker', connected_peers: ['peer-7', 'peer-9'], gossip_score: -0.25 }
const byId = new Map([[honest.peer_id, honest], [grafted.peer_id, grafted], ['peer-9', { ...honest, peer_id: 'peer-9', index: 9 }]])
test('honest rows: peers, score, sent · recv, mesh sybil grafts in alarm tone', () => {
  const r = tooltipRows(honest, { 'peer-7': ['peer-1', 'sybil-0'] }, byId)
  expect(r.head).toEqual({ name: 'n7', badge: 'DECODED', id: 'peer-7', alarm: false })
  expect(r.rows).toEqual([['peers', '3', false], ['score', '+3.50', false], ['sent · recv', '↑1,284 · ↓61.9K', false], ['mesh', '1 sybil graft', true]])
})
test('attacker rows: grafted into N meshes, score alarm, victims by short name; pruned badge', () => {
  const r = tooltipRows(grafted, {}, byId)
  expect(r.head.badge).toBe('ATTACKER'); expect(r.head.alarm).toBe(true); expect(r.rows[0]).toEqual(['grafted into', '2 meshes', false]); expect(r.rows[1]).toEqual(['score', '-0.25', true]); expect(r.peers).toEqual(['n7', 'n9'])
  expect(tooltipRows({ ...grafted, connected_peers: [] }, {}, byId).head.badge).toBe('PRUNED')
})
test('negative honest score is alarm; long ids are shortened in the id line', () => {
  expect(tooltipRows({ ...honest, gossip_score: -1 }, {}, byId).rows[1]).toEqual(['score', '-1.00', true])
  expect(tooltipRows({ ...honest, peer_id: '16Uiu2HAmAbCdEfGhIjKlMnOpQrStUvWxYz' }, {}, byId).head.id).toBe('16Uiu2HAm…WxYz')
})
test('Tooltip renders nothing without a hovered node, and nothing when the hovered id vanished', () => {
  expect(renderToStaticMarkup(<Tooltip />)).toBe('')
  useStore.setState({ hoveredPeer: 'ghost' }); expect(renderToStaticMarkup(<Tooltip />)).toBe('')
  useStore.getState().applySnapshot({ ...snapWith(['peer-7']), nodes: [honest] }); useStore.getState().hoverPeer('peer-7')
  const html = renderToStaticMarkup(<Tooltip />); expect(html).toContain('n7'); expect(html).toContain('DECODED'); expect(html).toContain('+3.50'); expect(html).not.toMatch(/style="[^"]*#/)   // tones via class, never inline colour
})
```

- [ ] **Step 2: Run to verify failure**

Run: `cd /home/yks/Projects/luminar/web && npx vitest run components/sim/Tooltip.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`tooltipRows` ports `renderer.ts:518-561` (`updateTooltipContent`) to data: head `{ name: shortName, badge: pruned ? 'PRUNED' : state.toUpperCase(), id: id.length > 16 ? \`${id.slice(0, 9)}…${id.slice(-4)}\` : id, alarm: attacker && !pruned }`; traffic `↑${fmtCount(sent)} · ↓${fmtCount(recv)}`; honest rows `peers · score (alarm when < 0) · sent · recv · mesh "N sybil graft(s)" (alarm) when > 0` where sybils = `(mesh[id] ?? connected_peers).filter(isAttackerId).length`; attacker rows `grafted into N meshes · score (alarm) · sent · recv` and `peers` = victims as `shortName` via `nodeById` (raw id when unknown). `Tooltip`: `const node = useStore(selectHoveredNode); const mesh = useStore(s => s.mesh); const byId = useStore(s => s.nodeById)`; `null` when `!node`; renders a 200 px card: head row (name in `--t-ui`, badge `--t-label` with `data-state`, class `alarm` → `--flame`, pruned → `--paper-3`), id line `--t-micro --fg-3`, rows as a `<dl>` (`dt` label `--paper-2`, `dd` value tabular), victims line. Surface `--pitch-2`, 1 px `--hair-strong`, square corners, `--stamp-shadow`, no dither (spec §7 forbidden list). In `renderer.ts` `onHover`: `hoverPeer(id)`; when `tooltipEl` and `info.object`: `tooltipEl.dataset.show = '1'; tooltipEl.style.transform = \`translate(${clamp(x + 16, 0, W − 216)}px, ${clamp(y − 10, 0, H − tooltipEl.offsetHeight − 8)}px)\``; else `dataset.show = '0'`. `DeckCanvas.module.css` already hides `.tip` under `data-hero="1"`.

- [ ] **Step 4: Run to verify pass**

Run: `cd /home/yks/Projects/luminar/web && npx vitest run components && npx tsc --noEmit && npm run lint`
Expected: PASS, clean.

- [ ] **Step 5: Browser walk — the tooltip tells the truth about grafts**

1. Backend + web; `/sim/`; launch `demo_sybil_eclipse`.
2. Hover an honest disc: card at cursor +16/−10 with `nN`, state badge, id, `peers`, `score` (signed), `sent · recv`; moving to the right edge clamps the card inside the field.
3. After T+10 hover a victim: `mesh · 1 sybil graft` in flame; hover a `sybil-N` diamond: `ATTACKER` badge in flame, `grafted into 2 meshes`, `score −0.xx` in flame, victims listed as `n12 n40`.
4. After the prune: the same diamond shows `PRUNED` in paper-3, `grafted into 0 meshes`.
5. Hover a disc while `curl ... /api/sim/reconfigure -d '{"n_nodes":20}'` lands: the card disappears, no console error (hovered id vanished).
6. `press_key` `h` (hero): the card never shows; `h` again: shows.
7. `evaluate_script` with React DevTools' `__REACT_DEVTOOLS_GLOBAL_HOOK__` or a `console.count` in `Tooltip`: it renders only when `hoveredPeer` changes, not per snapshot while hovering the same node (the selector returns the same `PeerNode` reference only if the store rebuilt it — if it re-renders at 2 Hz while parked, memoise on `peer_id + gossip_score + messages_sent + messages_received + connected_peers.length` with `useStore(..., shallow)`).

- [ ] **Step 6: Commit**

```bash
git add web/components/sim/Tooltip.tsx web/components/sim/Tooltip.module.css web/components/sim/Tooltip.test.tsx web/components/map/renderer.ts web/components/map/DeckCanvas.tsx
git commit -m "feat(web): hover tooltip card fed by the store, placed by the renderer"
```

### Task 2.9: 200-node timing and the phase gate

**Files:**
- Modify: `web/components/map/renderer.ts` only if the measurements below fail (e.g. `updateTriggers` too broad, atlas rebuilt per frame, `topologyKey` recomputed when nothing changed — guard it behind a cheap `nodes !== lastNodes || edges !== lastEdges || mode !== lastMode` reference check)
- Create: `docs/superpowers/plans/parts/phase-2-walk.md` (the recorded numbers from this task; absolute date, commit SHA, laptop DPR)

**Interfaces:**
- Consumes: everything above; `simReconfigure` (A.7) via curl.
- Produces: nothing new.

- [ ] **Step 1: Cold layout + first paint at 200 nodes**

1. Backend + web; `navigate_page` → `/sim/`; wait `LIVE`.
2. `evaluate_script`: `performance.clearMeasures('layout'); performance.mark('t0')`, then `curl -s -X POST localhost:8000/api/sim/reconfigure -H 'Content-Type: application/json' -d '{"n_nodes":200}'`.
3. `evaluate_script` after the mesh appears: `({ layout: performance.getEntriesByName('layout').at(-1).duration, nodes: __luminar.store.getState().nodes.length, layers: __luminar.layerIds() })`.
   Expected: `nodes === 200`, `layout ≤ 400` ms (150 ticks at n > 200 is not triggered at exactly 200; 300 ticks on the venue laptop), and the first painted frame with 200 discs within **≤ 1 s** of the reconfigure response (`take_screenshot` timestamps or `performance.now()` deltas logged from `renderLayers`' first non-empty `setProps`). The mesh overlay is absent (`layerIds()` has no `'mesh-edges'`; the backend sends `{}`).
4. Record the numbers in `phase-2-walk.md`.

- [ ] **Step 2: Frame rate during a Sybil burst and idle**

1. At 200 nodes: `performance_start_trace` (reload: false, autoStop: false); `curl -s -X POST localhost:8000/api/fault/sybil -H 'Content-Type: application/json' -d '{"n_attackers":10,"target_topic":"lumina/blocks/1.0"}'`; after 6 s `performance_stop_trace`.
   Expected: **≥ 30 fps** sustained during the burst (`performance_analyze_insight` on the frame timeline, no long task > 50 ms from `renderLayers`); the React commit track shows no commits during the burst except `Tooltip` when hovering.
2. `curl -s -X POST localhost:8000/api/fault/clear-all`; wait 3 s; trace 3 s of idle.
   Expected: **60 fps** idle (the rAF loop skips `renderLayers` when nothing animates), GPU and main thread near idle.
3. Repeat Step 1.2–1.3 of this task on `?theme=stage`: atlas rebuilds once (`buildAtlas` count via a `console.count` in dev or `performance.mark('atlas')`), not per frame.
4. If any number fails: profile; the usual culprits and fixes, in order — `updateTriggers` arrays rebuilt with a new identity each frame (use primitive keys), the `nodes` `data` array rebuilt when only `hoveredPeer` changed (split hover into its own layers, which the plan already does), `topologyKey` string-built per frame (guard behind reference checks), `haloCells` recomputed per frame (it runs only in `buildAtlas`). Fix in `renderer.ts`, re-run, record.

- [ ] **Step 3: Phase acceptance walk (spec §11, verbatim list) and the parity rows**

Run the whole sequence on the live backend at 1440×900, DPR as on the venue laptop, and tick each line in `phase-2-walk.md` with the evidence (screenshot name or `evaluate_script` result):

1. `demo_sybil_eclipse` from curl → five diamonds at T+10 with dashed attack links (2.5 §5.4).
2. Halos go flame, then the diamonds go hollow at the first score prune (2.5 §5.5).
3. `eclipse-*` diamonds show no spam particles (2.6 §5.4).
4. `f` refits (2.4 §6.5).
5. Geo tab disabled until mainnet on, then the dithered world shows and only observers draw (2.7 §5.1–5.3).
6. 200-node timing: cold layout + first paint ≤ 1 s, ≥ 30 fps in a Sybil burst, 60 fps idle, no React re-render per frame (this task).
7. Inventory §5 rows, each observed once: deck canvas (pan/zoom/cursor/empty-click deselect) · palette from tokens (flip `data-stage`, colours re-read) · layer order · topology edges (toggle) · attack links · mesh overlay (present at 50, absent at 200) · hover · pulses · particles · particle triggers (message/spam/graft/prune/dht/fault burst) · node discs (radius by n, ×1.5 selected, ×1.15 attacker) · halo · observer ring · selection reticle · event-click highlight (set `selectPeer('peer-1', ['peer-2'])` from the console until the log rail exists) · labels (incl. all-labels ≤ 50) · world map · tooltip · fitView · rAF loop idle · force / radial / geo layouts · visibility rule · relayout trigger (state-only snapshots never move nodes) · mode switcher (disabled reason, auto-Geo once, restore on vanish, manual pick clears memory, selection dropped when not drawn in the new mode) · BlockSeen flash on observers.
8. `list_console_messages` → no errors across the walk; `cd web && npx tsc --noEmit && npm run lint && npx vitest run && npm run build` green; `make check` green at the root.

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/plans/parts/phase-2-walk.md web/components/map/renderer.ts
git commit -m "perf(web): 200-node canvas timing recorded; phase 2 acceptance walk"
```

---

### Phase gate (spec §11 Phase 2, verbatim)

Checklist: `renderer.ts`, `layout.ts` (force/radial/geo, frozen), `atlas.ts`, `palette.ts`
(tokens → RGBA via culori, re-read on `data-stage`), `DeckCanvas` with `ResizeObserver`,
StrictMode double-mount safe; full render table of §6.2 incl. score-band halos, attacker
diamonds, pruned diamonds, reticle, hover, particles, pulses, labels, Geo land via
`FillStyleExtension`, mode switcher, fitView, tooltip.
Acceptance (browser walk on the live backend): launch `demo_sybil_eclipse` from curl; five
diamonds appear at T+10 with dashed attack links, halos go flame then the diamonds go hollow at
the first score prune; eclipse-* diamonds show no spam particles; `f` refits; Geo tab disabled
until mainnet on, then the dithered world shows and only observers draw. **200-node timing**:
`POST /api/sim/reconfigure {n_nodes: 200}` → cold layout + first paint ≤ 1 s on the venue
laptop (log `performance.measure('layout')`), then ≥ 30 fps during a Sybil burst and 60 fps
idle in a Chrome performance trace; no React re-render per frame.

Every phase ends with `cd web && npx tsc --noEmit && npm run lint && npm run build` green and
`make check` still green for `frontend/` and `backend/`.

**Cut rule**: if phase 2 is not rendering the live mesh by the
evening of Mon 27 Oct, stop the port, present from `master`, and spend the remaining days on
phases 5–6 only (the landing and video do not depend on the port).

---

## Phase 3 — simulator shell and panels (27–29 Oct, 2 days)

**Goal:** Build every simulator surface of spec §6.2 except the canvas (phase 2), the ticker/stage/hero/reels (phase 4) and the dither plates (phase 5): toolbar, command strip with a reel-only scrubber, popover menus, truthful toasts, both rails, the inspector, legend + settings, narrator caption, keyboard with `r` and `?`, and the ≤1023 px drawers and overlay.

**Review focus pinned in this phase** (each line names the task whose test covers it):

1. **Live-mode scrubber**: dragging or arrow-keying the range while `reel === null` must never call `POST /api/sim/seek` and must never move `simTime` — Task 3.2 walk step 6 watches the network panel; `Scrubber` renders `aria-disabled="true"` and ignores `input` when live.
2. **Log row whose peer is hidden in the current layout** (an observer row while in Force, a sim peer while in Geo): click is a no-op, nothing selects, the inspector stays closed — Task 3.6 test `rowClick returns null for a hidden or unknown peer`.
3. **Fault menu with nothing selected**: Eclipse and Drop are `aria-disabled` with the reason visible, and `Enter` on them performs no POST — Task 3.3 test `eclipse and drop are disabled with a reason when no sim peer is selected` plus walk step 5.
4. **Mesh key missing for the selected peer** (above 100 nodes the backend sends `mesh: {}`): MESH PEERS shows the `MESH_HIDDEN` sentence, never `0 peers` — Task 3.7 test `meshPeers is null when the key is absent`.
5. **Keys while a menu or dialog has focus**: `Space` must activate the focused menu item, not toggle play; `?` typed into the admin-token field must not open the help — Task 3.10 wires `actionForKey` after a `closest('[role="menu"],[role="dialog"]')` guard (Escape excepted) and walk step 5 proves both.

### Browser walk harness (used by every UI task)

Terminals, from `/home/yks/Projects/luminar`:

1. `make backend` (variant for the token test: `LUMINAR_ADMIN_TOKEN=secret make backend`).
2. `make web` → `http://localhost:3000` (dev rewrites proxy `/api` to `:8000`; the socket goes to `ws://localhost:8000/ws/events`).
3. chrome-devtools MCP: `navigate_page` to `http://localhost:3000/sim/`, `resize_page` 1440×900 (desktop) or 390×844 (phone), `take_snapshot` for the a11y tree, `click` / `press_key` / `fill`, `evaluate_script` for DOM assertions, `list_network_requests` for API calls, `emulate` for `prefers-reduced-motion: reduce`. Manual fallback: the same steps in Chrome DevTools (device toolbar, Rendering → emulate reduced motion, Network panel).
4. Scenario launch from a shell: `curl -s -X POST localhost:8000/api/scenarios/demo_sybil_eclipse/launch -H 'Content-Type: application/json' -d '{"speed":1}'` (phases: `inject_sybil` T+10, `inject_eclipse` peer-10 T+16, `clear_faults` T+24, duration 60).
5. Reels in dev need `web/public/reels/manifest.json` (copied in Task 3.3) and, to actually play one, `web/public/reels/sybil-eclipse.jsonl` (copied in Task 3.3 as well; the other three land in Task 4.1).

A walk step reads "observe: …"; the task is accepted only when every observation matches.

### Task 3.0: Event type codes and row detail builders

**Files:**
- Create: `web/lib/event-codes.ts`
- Test: `web/lib/event-codes.test.ts`

**Accepted by:** vitest.

**Interfaces:**
- Consumes: `AppEvent`, `EventCategory` (A.2), `shortId` (A.3).
- Produces: A.6 (`Tone`, `TYPE_CODES`, `DEFAULT_TYPE`, `FILTER_GROUPS`, `DEFAULT_OFF`, `formatNode`, `buildDetail`, `inspectorDetail`). Consumed by `LogRail` (3.6) and `Inspector` (3.7).

- [ ] **Step 1: Write the failing test**

```ts
import { TYPE_CODES, DEFAULT_TYPE, FILTER_GROUPS, DEFAULT_OFF, formatNode, buildDetail, inspectorDetail } from '@/lib/event-codes'
test('type codes and filter groups', () => {
  expect(TYPE_CODES.GossipPrune).toEqual({ code: 'gp', tone: 'alarm' }); expect(TYPE_CODES.GossipGraft.tone).toBe('ok'); expect(Object.keys(TYPE_CODES)).toHaveLength(23); expect(DEFAULT_TYPE.code).toBe('??')
  expect(FILTER_GROUPS.map(g => g[0])).toEqual(['Gossip', 'Conn', 'Stream', 'DHT', 'Fault', 'Health', 'Clock', 'Sim', 'Live']); expect([...DEFAULT_OFF]).toEqual(['clock'])
  for (const { tone } of Object.values(TYPE_CODES)) expect(['fg', 'fg2', 'fg3', 'ok', 'alarm']).toContain(tone)   // never a colour string
})
test('details', () => {
  expect(buildDetail({ at: 0, event_type: 'GossipPrune', category: 'gossip', to_peer: 'sybil-3', reason: 'score' })).toBe('sybil-3 · score')
  expect(buildDetail({ at: 0, event_type: 'FaultInjected', category: 'fault', fault_type: 'sybil', count: 5 })).toBe('sybil × 5')
  expect(buildDetail({ at: 0, event_type: 'BlockSeen', category: 'live', seen_ms: 3247, client: 'lighthouse', first: true })).toBe('3247 ms · lighthouse · first')
  expect(buildDetail({ at: 0, event_type: 'GossipMessage', category: 'gossip', from_peer: 'peer-4', to_peer: 'peer-9', msg_id: 'msg-1', hops: 2 })).toContain('n9')
  expect(formatNode({ at: 0, event_type: 'FaultCleared', category: 'fault' })).toBe('net')
  expect(formatNode({ at: 0, event_type: 'ScenarioPhaseFired', category: 'simulation' })).toBe('sim')
  expect(formatNode({ at: 0, event_type: 'GossipMessage', category: 'gossip', from_peer: 'peer-4' })).toBe('n4')
  expect(inspectorDetail({ at: 0, event_type: 'GossipMessage', category: 'gossip', msg_id: 'spam-1' })).toBe('spam')
  expect(inspectorDetail({ at: 0, event_type: 'GossipIHave', category: 'gossip', msg_ids: ['a', 'b', 'c'] })).toBe('3 ids')
})
```

- [ ] **Step 2: Run to verify failure** — `cd /home/yks/Projects/luminar/web && npx vitest run lib/event-codes.test.ts` → FAIL.

- [ ] **Step 3: Implement `web/lib/event-codes.ts` per A.6** — port `TYPE_CODES` (23 entries, tones per A.6), `buildDetail`, `formatNode` from `frontend/src/ui/events-panel.ts` and `inspectorDetail` from `frontend/src/ui/peer-inspector.ts` `rowDetail`; every colour becomes a `Tone`.

- [ ] **Step 4: Run to verify pass** — same command → PASS.

- [ ] **Step 5: Commit**

```bash
git add web/lib/event-codes.ts web/lib/event-codes.test.ts
git commit -m "feat(web): event type codes, filter groups and row detail builders"
```

### Task 3.1: Shell grid, toolbar, provenance card and toast queue

**Files:**
- Modify: `web/components/sim/SimApp.tsx` (phase 1/2 version: connects the socket, mounts `DeckCanvas`), `web/components/sim/Toolbar.tsx`, `web/components/sim/Toolbar.module.css` (the phase-1 subset grows)
- Create: `web/components/sim/SimApp.module.css`, `web/components/sim/Toasts.tsx`, `web/components/sim/Toasts.module.css`, `web/components/sim/Provenance.tsx`, `web/components/sim/Provenance.module.css`
- Test: browser walk only (no pure logic; the toast queue and `toastFor` are already tested in `lib/store.test.ts` and `lib/api/client.test.ts`)

**Interfaces:**
- Consumes: `useStore`, `selectPill`, `selectTimelineTotal`, `AppState.{simTime,maxDuration,nodeCount,reel,mainnet,telemetry,toasts}`, `dismissToast` (A.11); `toggleMainnet`, `setNodePreset`, `setDurationPreset` (A.12); `formatTime` (A.3); `ARRIVAL`, `REPO_URL` (A.4); `DeckCanvas` (A.18); `ModeSwitcher`, `Tooltip` (phase 2); `PROVENANCE` (A.4); `AppState.{mainnet,layoutMode}`.
- Produces: `Toolbar({ onMenu })`, `Toasts()`, `TOAST_MS = 2000`, `Provenance()` (A.28); `SimApp` grid areas `toolbar · rail-l · canvas · rail-r` with CSS vars `--toolbar-h --rail-l --rail-r`; `SimApp` local state `drawer: 'stats' | 'log' | null`, `overlayOpen: boolean`, `manifest: ReelManifest` (filled in Task 3.3).

- [ ] **Step 1: Write `SimApp.tsx` as the grid shell**

`'use client'`. Grid: `grid-template: "toolbar toolbar toolbar" var(--toolbar-h) "rail-l canvas rail-r" 1fr / var(--rail-l) 1fr var(--rail-r)`; `height: 100dvh; overflow: hidden; background: var(--bg)`. Children in order: `<Toolbar onMenu={…}/>`, `<aside data-rail="l">` (empty until Task 3.4), `<main>` holding `<DeckCanvas/>` plus the phase-2 overlays (`ModeSwitcher` top-centre, `Provenance` top-left, `Tooltip`) and `<Toasts/>`, `<aside data-rail="r">` (empty until Task 3.6). Keep the phase-1 connect/disconnect effect. `data-reel` attribute on the root when `reel !== null` (the `.reel` dimming hook, inventory §1).

- [ ] **Step 2: Implement `Toolbar.tsx`**

Left to right (spec §6.2 Toolbar): brand `LUMINAR` (Manrope 600, letter-spacing .14em) + `gossipsub v1.1` (mono, `--fg-3`); connection pill from `selectPill` — `OFFLINE` (text `--flame-dim`, no fill, 1 px `--hair` rule), `LIVE` (6 px `--signal` dot + text), `REEL · ${reel.title}` (6 px `--paper-0` square + text); `MAINNET` badge (`<button aria-pressed={mainnet?.enabled ?? false} title={ARRIVAL}>` → `toggleMainnet()`); `TELEMETRY` badge (`<span>` not a button — badge only, spec §13.2 — rendered only when `telemetry.active`, text `TELEMETRY ${telemetry.peerCount}`, title `peers reporting · drawer after Devcon`); spacer; duration presets `1m 2m 5m 10m` (`aria-pressed` = `maxDuration === sec` for 60/120/300/600 → `setDurationPreset`); node presets `20 50 100 200` (`aria-pressed` = `nodeCount === n` → `setNodePreset`); clock `T+ ${formatTime(simTime)}` with `font-variant-numeric: tabular-nums`; GitHub link `https://${REPO_URL}` (`rel="noopener" target="_blank"`, text `GitHub`, no icon set). `[data-reel] .presets { opacity: .5 }`. The `Menu +` button and the collapse rules come in Task 3.11; render the button now with `className={s.menuBtn}` hidden above 1023 px.

- [ ] **Step 3: Implement `Toasts.tsx`**

`const toasts = useStore(s => s.toasts)`; render `<div role="status" aria-live="polite">` holding one `<div data-kind={t.kind}>` per toast, positioned `top: calc(var(--toolbar-h) + var(--s-3)); left: var(--s-3)` inside `<main>`, 260 px, `--raised` surface, 1 px `--hair-strong` rule, no dither. Each toast schedules `setTimeout(() => dismissToast(t.id), TOAST_MS)` in a `useEffect` keyed by `t.id`. `data-kind="fail"` text `--flame-text`; `ok` text `--fg`; `info` text `--fg-2`.

- [ ] **Step 4: Implement `Provenance.tsx`**

`const m = useStore(s => s.mainnet); const mode = useStore(s => s.layoutMode)`; `null` unless `m?.enabled`; `<aside aria-label="Data provenance">` top-left inside `<main>` (`top: var(--s-3); left: var(--s-3)`, `--panel` surface, 1 px `--hair`, `--t-micro` mono, max-width 320 px): kicker `LIVE MAINNET` (Manrope 600 `--t-label` with a 6 px `--signal` dot), then `slot ${m.slot ?? '—'} · T−${m.lag_s ?? 156}s · ${m.with_geo ?? m.observers} observers · ${PROVENANCE}` and, when `mode !== 'geo'`, the suffix ` · shown on the Geo layout`. No dither, no flame; the sentence is `copy.PROVENANCE` verbatim (spec §2). Task 4.6 adds the recorded variant.

- [ ] **Step 5: Verify types, lint, tests**

Run: `cd /home/yks/Projects/luminar/web && npx tsc --noEmit && npm run lint && npx vitest run`
Expected: all green (no new tests in this task).

- [ ] **Step 6: Browser walk (desktop 1440×900)**

1. Open `/sim/` with the backend up. Observe: 44 px toolbar; left rail 264 px and right rail 312 px empty but present (`evaluate_script`: `getComputedStyle(document.querySelector('[data-rail=l]')).width === '264px'`); canvas fills the centre; no horizontal scrollbar (`document.documentElement.scrollWidth === innerWidth`).
2. Pill reads `LIVE` with a cyan dot; clock advances as `T+ 12.3s` then `1:02` past 60 s.
3. Click `MAINNET`. Observe: toast (none on success), badge `aria-pressed="true"`, the provenance card appears top-left: `LIVE MAINNET · slot N · T−156s · N observers · arrival at observer nodes, not mesh paths · data: ethPandaOps (CC BY 4.0) · shown on the Geo layout` (the suffix disappears once Geo is active). Click again to turn it off.
4. Click node preset `50`. Observe: after reconfigure the `50` button is `aria-pressed="true"`, the canvas relaid out. Click `20` to restore. Click duration `2m`. Observe: `2m` lit; `cur / total` (Task 3.2) will read `/ 2:00`.
5. Stop the backend (Ctrl-C). Observe: pill `OFFLINE` in dim flame with no fill. Click `MAINNET`. Observe: toast `backend offline` in flame text, gone after 2 s. Restart the backend; pill returns to `LIVE`.
6. `TELEMETRY` badge is absent (`document.body.textContent.includes('TELEMETRY') === false`) until a telemetry peer reports.

- [ ] **Step 7: Commit**

```bash
git add web/components/sim/SimApp.tsx web/components/sim/SimApp.module.css web/components/sim/Toolbar.tsx web/components/sim/Toolbar.module.css web/components/sim/Toasts.tsx web/components/sim/Toasts.module.css web/components/sim/Provenance.tsx web/components/sim/Provenance.module.css
git commit -m "feat(web): simulator shell grid, toolbar with pill, badges and presets, provenance card, toast queue"
```

### Task 3.2: Command strip with a recordings-only scrubber

**Files:**
- Create: `web/lib/timeline-marks.ts`, `web/components/sim/CommandStrip.tsx`, `web/components/sim/CommandStrip.module.css`, `web/components/sim/Scrubber.tsx`
- Modify: `web/components/sim/SimApp.tsx` (mount `<CommandStrip/>` and the kbd hint row inside `<main>`; subscribe `simTime` → `autoPauseIfDue`)
- Test: `web/lib/timeline-marks.test.ts` (vitest); browser walk

**Interfaces:**
- Consumes: `togglePlay`, `reset`, `setSpeed`, `seekTo`, `autoPauseIfDue` (A.12); `selectTimelineTotal`, `AppState.{simTime,playing,simSpeed,reel,beats,activeScenario}`; `formatTime`; `SCRUB_LIVE`; `KBD_HINT` (A.5); `Beat`, `ScenarioPhase`, `BeatKind` (A.2).
- Produces: `bandsFor`, `ticksFor`, `washVar` (A.28); `CommandStrip({ manifest, onDrawer })`, `Scrubber()`. The menus slot in `CommandStrip` is filled in Task 3.3; the `Stats` / `Log` drawer buttons in Task 3.11.

- [ ] **Step 1: Write the failing test**

```ts
// web/lib/timeline-marks.test.ts
import { bandsFor, ticksFor, washVar } from '@/lib/timeline-marks'
const phases = [
  { at: 10, label: 'Sybil attack: 5 attackers graft in', action: 'inject_sybil' },
  { at: 16, label: 'Eclipse on peer-10', action: 'inject_eclipse' },
  { at: 24, label: 'Faults cleared — mesh healing', action: 'clear_faults' },
]
test('bandsFor: one band per inject_* phase until the next clear_faults, fractions of total', () => {
  expect(bandsFor(phases, 60)).toEqual([
    { left: 10 / 60, width: 14 / 60, action: 'inject_sybil', label: 'Sybil attack: 5 attackers graft in', at: 10 },
    { left: 16 / 60, width: 8 / 60, action: 'inject_eclipse', label: 'Eclipse on peer-10', at: 16 },
  ])
  expect(bandsFor([{ at: 5, label: 'p', action: 'inject_partition' }], 20)).toEqual([{ left: 0.25, width: 0.75, action: 'inject_partition', label: 'p', at: 5 }])
  expect(bandsFor(phases, 0)).toEqual([])
})
test('ticksFor: phases + beats, deduped within 0.05 s (beat wins), sorted, clipped to total', () => {
  const beats = [{ label: 'First Sybil pruned', time: 11.9, kind: 'prune' as const }, { label: 'Sybil attack: 5 attackers graft in', time: 10.02, kind: 'phase' as const }, { label: 'late', time: 99, kind: 'healed' as const }]
  const t = ticksFor(beats, phases, 60)
  expect(t.map(x => [x.time, x.kind])).toEqual([[10.02, 'phase'], [11.9, 'prune'], [16, 'phase'], [24, 'phase']])
  expect(t[1].pos).toBeCloseTo(11.9 / 60)
})
test('washVar maps inject_<x> to --wash-<x>', () => {
  expect(['inject_sybil', 'inject_eclipse', 'inject_partition', 'inject_latency', 'inject_drop'].map(washVar)).toEqual(['--wash-sybil', '--wash-eclipse', '--wash-partition', '--wash-latency', '--wash-partition'])
})
```

- [ ] **Step 2: Run to verify failure**

Run: `cd /home/yks/Projects/luminar/web && npx vitest run lib/timeline-marks.test.ts`
Expected: FAIL — `Cannot find module '@/lib/timeline-marks'`.

- [ ] **Step 3: Implement `lib/timeline-marks.ts` with the three signatures in A.28**

- [ ] **Step 4: Run to verify pass**

Run: `cd /home/yks/Projects/luminar/web && npx vitest run lib/timeline-marks.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Implement `Scrubber.tsx`**

`<div className={s.track}>` containing, in order: wash bands (`bandsFor(activeScenario?.scenario?.phases ?? [], total)` → `<span style={{ left: %, width: %, background: var(${washVar(action)}) }} title={`${label} (T+${at}s)`}>`), ticks (`ticksFor(beats, phases, total)` → `<span className={s.tick} data-kind={kind} style={{ left: % }} title={`${label} · T+${time.toFixed(1)}s`}>`; the spec's `.lm-tl-tick`), the fill `<span style={{ width: pct }}>` (`--fg`, solid), the head (solid 2 px `--paper-0`, never dithered), and the range input `<input type="range" min={0} max={1000} value={Math.round(simTime / total * 1000)} aria-label="timeline" aria-valuetext={formatTime(simTime)} aria-disabled={!reel} title={reel ? undefined : SCRUB_LIVE}>`; `onInput` → `if (reel) seekTo(Number(value) / 1000 * total)` — never a live call; `onPointerEnter/Focus` show the bubble `<output>` with `formatTime` of the hovered fraction. Bands are flat `--wash-*` fills (spec §7 allows dithering them but the 6 px track sits under the 12 px floor, so nothing on the track is dithered).

- [ ] **Step 6: Implement `CommandStrip.tsx`**

Floating `position: absolute; bottom: 36px; left: 50%; translate: -50%; width: clamp(360px, 76%, 820px); height: var(--strip-h)`; surface `--raised`, 1 px `--hair-strong` rule, no shadow (the stamp shadow is not for this). Row: Reset `<button aria-label="Reset (R)" title="Reset · R">⟲</button>` → `reset()`; Play/Pause `<button aria-label={playing ? 'Pause (Space)' : 'Play (Space)'} aria-pressed={playing}>` → `togglePlay()` (glyphs `▶` / `❚❚` as text, mono); `<Scrubber/>`; `<span className={s.time}>{formatTime(simTime)} / {formatTime(total)}</span>` tabular; speed group `.5× 1× 2× 3× 5× 10×` (`aria-pressed` = `simSpeed === v` → `setSpeed(v)`); a `<div className={s.menus}>` slot (Task 3.3 fills it with `ScenariosMenu`, `ReelsMenu`, `FaultMenu`); the kbd hint row `<div className={s.kbd}>{KBD_HINT}</div>` positioned under the strip (`top: 100%`, `--t-micro`, `--fg-3`), class hook `kbdHint` for phase 4's hero rule.

- [ ] **Step 7: Wire pause-at-limit in `SimApp.tsx`**

`useEffect(() => useStore.subscribe(s => s.simTime, () => autoPauseIfDue()), [])` (zustand `subscribeWithSelector` is not required: compare `prev.simTime !== next.simTime` inside a plain `subscribe`).

- [ ] **Step 8: Verify**

Run: `cd /home/yks/Projects/luminar/web && npx tsc --noEmit && npm run lint && npx vitest run`
Expected: green.

- [ ] **Step 9: Browser walk (desktop)**

1. Observe: strip floats 36 px above the bottom edge, centred, `clamp(360px, 76%, 820px)` wide (`getBoundingClientRect().width` = 820 at 1440); hint row under it reads exactly `SPACE play · F fit · T stage · H hero · ? keys`.
2. Press `Space` on the page. Observe: Play button `aria-pressed="true"`, clock runs; `list_network_requests` shows `POST /api/sim/play`. Press `Space` again → `POST /api/sim/pause`.
3. Click `2×`. Observe: `POST /api/sim/speed` body `{"speed":2}`; `2×` lit; after the next snapshot it stays lit (live sync).
4. Click duration `1m`, play, wait past T+60. Observe: the sim pauses by itself (`POST /api/sim/pause` from the client), `cur / total` reads `1:00 / 1:00`. Press `Space`. Observe: total grows to `2:00` before `POST /api/sim/play` (Play-at-limit rule).
5. Click Reset. Observe: `POST /api/sim/reset`, clock `T+ 0.0s`, log and selection cleared (verified again in 3.6/3.7).
6. Live scrubber: hover shows the bubble and the title `scrubbing rewinds recordings only; the live clock cannot rewind`; drag the head to 50 %. Observe: **no** `/api/sim/seek` in the network list, `simTime` unchanged, the input has `aria-disabled="true"`. Focus it with Tab and press `ArrowRight` three times: same.
7. Launch `demo_sybil_eclipse` from curl. Observe: total becomes `1:00`; two wash bands appear (flame .35 from T+10 to T+24, flame .20 from T+16 to T+24) with tooltips `Sybil attack: 5 attackers graft in (T+10s)` and `Eclipse on peer-10 (T+16s)`; three phase ticks at 10/16/24; after T+11.9 a fourth tick (`data-kind="prune"`) appears at ≈ 20 % of the track.
8. Reel mode (re-run once Task 3.3 lands the Reels menu): enter reel `1` and repeat step 6. Observe: the input has no `aria-disabled`, dragging to 50 % seeks (`simTime` jumps, the mesh repaints), the bubble follows, no network request is made.

- [ ] **Step 10: Commit**

```bash
git add web/lib/timeline-marks.ts web/lib/timeline-marks.test.ts web/components/sim/CommandStrip.tsx web/components/sim/CommandStrip.module.css web/components/sim/Scrubber.tsx web/components/sim/SimApp.tsx
git commit -m "feat(web): floating command strip with reel-only scrubber, beat ticks and wash bands"
```

### Task 3.3: Popover menus — scenarios, reels, inject fault

**Files:**
- Create: `web/lib/menu-keys.ts`, `web/lib/fault-items.ts`, `web/components/sim/Menus.tsx`, `web/components/sim/Menus.module.css`
- Create (copy): `web/public/reels/manifest.json` and `web/public/reels/sybil-eclipse.jsonl` ← `frontend/public/reels/` (`cp -n`; 1 KB + 3.6 MB, identical blobs to Task 4.1's copy so the repository does not grow; add `!web/public/reels/*.jsonl` under the `*.jsonl` rule in the root `.gitignore`; the other three `.jsonl` files may 404 in dev until Task 4.1)
- Modify: `web/components/sim/CommandStrip.tsx` (fill the menus slot), `web/components/sim/SimApp.tsx` (fetch the manifest once with `getStatic<ReelManifest>('/reels/manifest.json')`, `fetchScenarios()` on mount)
- Test: `web/lib/menu-keys.test.ts`, `web/lib/fault-items.test.ts` (vitest); browser walk

**Interfaces:**
- Consumes: `launchScenario`, `injectFault`, `enterReel`, `exitReel`, `fetchScenarios`, `FaultKind` (A.12); `getStatic` (A.7); `AppState.{scenarios,activeScenario,reel,selectedPeer,nodeById,events}`; `shortName`, `isAttackerId` (A.3); `isSimPeer` (A.14); `ReelManifest`, `ReelMeta` (A.2).
- Produces: `nextMenuIndex`; `FaultItem`, `faultItems`, `activeFaultCount`; `Menu`, `MenuItem`, `MenuRow`, `scenarioRows`, `reelRows`, `faultRows`, `ScenariosMenu`, `ReelsMenu`, `FaultMenu` (A.28). Task 3.11's overlay renders the same `MenuRow[]` as staggered rows.

- [ ] **Step 1: Write the failing tests**

```ts
// web/lib/menu-keys.test.ts
import { nextMenuIndex } from '@/lib/menu-keys'
test('arrow keys wrap, Home/End jump, other keys return null', () => {
  expect(nextMenuIndex(0, 'ArrowDown', 3)).toBe(1); expect(nextMenuIndex(2, 'ArrowDown', 3)).toBe(0)
  expect(nextMenuIndex(0, 'ArrowUp', 3)).toBe(2); expect(nextMenuIndex(1, 'Home', 3)).toBe(0); expect(nextMenuIndex(1, 'End', 3)).toBe(2)
  expect(nextMenuIndex(1, 'Enter', 3)).toBeNull(); expect(nextMenuIndex(0, 'ArrowDown', 0)).toBeNull()
})
// web/lib/fault-items.test.ts
import { faultItems, activeFaultCount } from '@/lib/fault-items'
const node = (id: string, extra = {}) => ({ peer_id: id, index: 0, state: 'idle' as const, connected_peers: [], x: 0, y: 0, messages_sent: 0, messages_received: 0, gossip_score: 0, ...extra })
const ev = (event_type: string) => ({ at: 1, event_type, category: 'fault' as const })
test('eclipse and drop are disabled with a reason when no sim peer is selected', () => {
  const items = faultItems({ selectedPeer: null, nodeById: new Map(), events: [] }, 5)
  expect(items.map(i => i.kind)).toEqual(['partition', 'sybil', 'eclipse', 'drop', 'clear-all'])
  expect(items[2]).toMatchObject({ disabled: true, reason: 'select a peer first' }); expect(items[3]).toMatchObject({ disabled: true, reason: 'select a peer first' })
  expect(items[1].aside).toBe('5 peers'); expect(items[0].aside).toBe('split by layout side')
})
test('a selected sim peer enables eclipse/drop with its short name; an observer does not', () => {
  const ok = faultItems({ selectedPeer: 'peer-7', nodeById: new Map([['peer-7', node('peer-7', { index: 7 })]]), events: [] }, 3)
  expect(ok[2]).toMatchObject({ disabled: false, aside: 'n7' }); expect(ok[1].aside).toBe('3 peers')
  const obs = faultItems({ selectedPeer: 'obs-1', nodeById: new Map([['obs-1', node('obs-1', { is_real: true })]]), events: [] }, 5)
  expect(obs[3].disabled).toBe(true)
})
test('clear all shows the active count and is disabled at zero', () => {
  const events = [ev('FaultInjected'), ev('FaultInjected'), ev('FaultCleared'), ev('FaultInjected')]
  expect(activeFaultCount(events)).toBe(1)
  expect(faultItems({ selectedPeer: null, nodeById: new Map(), events }, 5)[4]).toMatchObject({ aside: '1 active', disabled: false })
  expect(faultItems({ selectedPeer: null, nodeById: new Map(), events: [] }, 5)[4]).toMatchObject({ aside: '0 active', disabled: true })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `cd /home/yks/Projects/luminar/web && npx vitest run lib/menu-keys.test.ts lib/fault-items.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement `lib/menu-keys.ts` and `lib/fault-items.ts` per A.28**

Labels: `Partition` · `Sybil attack` · `Eclipse attack` · `Drop peer` · `Clear all faults`.

- [ ] **Step 4: Run to verify pass**

Run: `cd /home/yks/Projects/luminar/web && npx vitest run lib/menu-keys.test.ts lib/fault-items.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Implement the `Menu` / `MenuItem` primitives in `Menus.tsx`**

`Menu`: trigger `<button type="button" aria-haspopup="menu" aria-expanded={open} popoverTarget={id}>{label} ▾</button>` and `<div id={id} popover="auto" role="menu" aria-label={label}>`; `popover="auto"` gives outside-click light dismiss and one-open-at-a-time natively. On `toggle` event (`newState === 'open'`): position with `getBoundingClientRect()` of the trigger (`position: fixed; top: rect.bottom + 4; left: clamp(8, rect.left, innerWidth − menuWidth − 8)`; opens upward when `rect.bottom + menuHeight > innerHeight − 8`, which is the strip's case), focus the first `[role=menuitem]`, set its `tabIndex=0`. `onKeyDown`: `nextMenuIndex(idx, e.key, items.length)` → move focus and roving tabindex; `Escape` → `hidePopover()` + focus the trigger; `Enter`/`Space` → click the focused item; letters ignored. `MenuItem`: `<button role="menuitem" tabIndex={-1} aria-disabled={disabled} aria-current={active ? 'true' : undefined} onClick={() => { if (disabled) return; closest('[popover]').hidePopover(); onSelect() }}>` rendering `kbd` as `<kbd>`, children as the name, `aside` right-aligned `--fg-3`, `meta` as a second line `--t-body --fg-3`, `tag` as `REAL` in `--signal-text` with a 1 px rule, `reason` as the meta line when disabled. Surface `--raised`, 1 px `--hair-strong`, rows ≥ 32 px (44 at ≤1023), hover wash `--wash`, nothing dithered, no `--flame` except the attacker-named items' aside.

- [ ] **Step 6: Implement the row builders and the three menus**

`scenarioRows`, `reelRows`, `faultRows` per A.28 (pure functions returning `MenuRow[]`; `reelRows` ends with the `kbd '0'` `Back to live` row; phase 4 may replace `enterReel` with navigation to `/reels/<n>/`, so this is the one call site).
`ScenariosMenu`: `scenarioRows(useStore(s => s.scenarios), activeScenario?.scenario?.id ?? null)` rendered as `MenuItem`s; an empty list renders one disabled item `backend offline`.
`ReelsMenu({ manifest })`: `reelRows(manifest, reel?.name ?? null)` with an `<hr role="separator">` before the last row.
`FaultMenu`: local `const [n, setN] = useState(5)`; `faultRows(faultItems({ selectedPeer, nodeById, events }, n), n)` (store fields via `useShallow`); the Sybil row additionally carries the stepper: `<button aria-label="fewer attackers">−</button>` / `<button aria-label="more attackers">+</button>` clamped 1–10 around `<span aria-live="polite">{n}</span>` (the buttons stop propagation so the row does not fire); an `<hr>` before `Clear all faults`. In reel mode every row stays enabled: `injectFault` runs `reelGuard` and toasts `REEL_GUARD` (parity with today).

- [ ] **Step 7: Mount and fetch**

`CommandStrip` menus slot: `<ScenariosMenu/> <ReelsMenu manifest={manifest}/> <FaultMenu/>`. `SimApp`: `useEffect(() => { fetchScenarios(); getStatic<ReelManifest>('/reels/manifest.json').then(m => setManifest(m ?? [])) }, [])`.

- [ ] **Step 8: Verify**

Run: `cd /home/yks/Projects/luminar/web && npx tsc --noEmit && npm run lint && npx vitest run`
Expected: green.

- [ ] **Step 9: Browser walk (desktop)**

1. Click `Scenarios ▾`. Observe: a `role="menu"` opens **above** the strip (it is at the bottom), focus is on the first `role="menuitem"`, five rows (`free_play` … `Demo: Sybil → Eclipse (60s)`) each with `Ns` aside and the description line. `ArrowDown` ×2 then `ArrowUp` moves focus; `End` lands on the demo; `Escape` closes and focus returns to the trigger (`document.activeElement.textContent` starts with `Scenarios`).
2. Open `Scenarios ▾`, `Enter` on the demo. Observe: menu closes, `POST /api/scenarios/demo_sybil_eclipse/launch`, then `GET /api/sim/snapshot` + `GET /api/topology/edges`; reopening shows that row `aria-current="true"`.
3. Open `Reels ▾`. Observe: four rows with `<kbd>1</kbd>`–`<kbd>4</kbd>`, titles, blurbs inline, `REAL` tag on the fourth only, a separator, `0 Back to live`. Click outside → closes. Open `Reels ▾` then click `Scenarios ▾`. Observe: only one menu is open.
4. Open `Inject fault ▾`. Observe: rows `Partition · split by layout side`, `Sybil attack · 5 peers` with `− 5 +`, `Eclipse attack` and `Drop peer` both `aria-disabled="true"` with `select a peer first` under them, separator, `Clear all faults · 0 active` disabled. Click `+` twice → `7 peers`; click `−` eight times → stops at `1`.
5. With focus on `Eclipse attack`, press `Enter`. Observe: no `/api/fault/eclipse` request. Click a peer on the canvas, reopen: `Eclipse attack · n12` enabled.
6. Click `Sybil attack` (n = 5). Observe: `POST /api/fault/sybil` body `{"n_attackers":5,"target_topic":"lumina/blocks/1.0"}`, toast `Sybil ×5 injected` (paper text). Five diamonds appear (phase 2). Reopen: `Clear all faults · 1 active` enabled. Click it. Observe: toast `Clear all injected`.
7. Click `Partition`. Observe: `POST /api/fault/partition` with two non-empty groups; `evaluate_script` reading the request body shows every id in `group_a` has a smaller canvas x than every id in `group_b` (compare against `window.__luminar` positions if phase 2 exposed them; otherwise accept on the visual split: the left half of the drawn mesh loses its cross links).
8. Select a peer, `Eclipse attack`. Observe: `POST /api/fault/eclipse` `{"target_peer_id":"peer-N","n_attackers":4}`, toast `Eclipse on nN injected`. `Drop peer` → toast `Drop nN injected`.
9. Restart the backend as `LUMINAR_ADMIN_TOKEN=secret make backend`; in Task 3.8's settings (or `localStorage.setItem('luminar.token','wrong')` + reload for now) set a wrong token; `Sybil attack`. Observe: toast `Sybil ×5 failed · 403` in flame text; nothing injected. Stop the backend; `Sybil attack`. Observe: toast `backend offline`.
10. Enter reel `1` from the menu (pill `REEL · Sybil → Eclipse`, presets at .5 opacity), open `Inject fault ▾` → `Partition`. Observe: toast `Press 0 to leave the reel first`, no request. `0 Back to live` restores `LIVE`.

- [ ] **Step 10: Commit**

```bash
git add .gitignore web/lib/menu-keys.ts web/lib/menu-keys.test.ts web/lib/fault-items.ts web/lib/fault-items.test.ts web/components/sim/Menus.tsx web/components/sim/Menus.module.css web/components/sim/CommandStrip.tsx web/components/sim/SimApp.tsx web/public/reels/manifest.json web/public/reels/sybil-eclipse.jsonl
git commit -m "feat(web): popover menus for scenarios, reels and faults with keyboard nav, stepper and truthful toasts"
```

### Task 3.4: Stats rail — KPIs with sparklines, nodes, messages

**Files:**
- Create: `web/lib/spark.ts`, `web/components/sim/Sparkline.tsx`, `web/components/sim/Glyph.tsx`, `web/components/sim/Glyph.module.css`, `web/components/sim/StatsRail.tsx`, `web/components/sim/StatsRail.module.css`
- Create: `web/components/dither/HaloRing.tsx`, `web/components/dither/Diamond.tsx` (A.20 props; needed by `Glyph`)
- Modify: `web/components/sim/SimApp.tsx` (mount `<StatsRail onBeat={…}/>` in `[data-rail="l"]`)
- Test: `web/lib/spark.test.ts`, `web/components/dither/glyphs.test.ts` (vitest); browser walk

**Interfaces:**
- Consumes: `selectKpis`, `selectHasMessages`, `selectStateCounts`, `selectAttackers`, `AppState.{analyticsHistory,nodes,nodeCount,totalMessagesSent,totalMessagesReceived,invalidCount,eventCount}` (A.11); `fmtCount` (A.3); `bayer` (A.19); `scoreBand`, `BAND_DENSITY` (A.15); `isPruned`; `useShallow` from `zustand/react/shallow`.
- Produces: `scoreDomain`, `sparkPoints`; `Sparkline`, `Glyph`, `GlyphRole`; `HaloRing` (A.20 + `cell?`), `Diamond` (A.20) as the SVG constructions of A.0 — plain React, imported later by the landing (phase 5) and the video (phase 6); `StatsRail({ onBeat })` with the first three sections (KPI, NODES, MESSAGES); Task 3.5 adds the rest.

- [ ] **Step 1: Write the failing test**

```ts
// web/lib/spark.test.ts
import { scoreDomain, sparkPoints } from '@/lib/spark'
test('scoreDomain always contains [-0.5, 0.5]', () => { expect(scoreDomain([0.1, 0.2])).toEqual([-0.5, 0.5]); expect(scoreDomain([-20, 1])).toEqual([-20, 1]) })
test('sparkPoints spaces x evenly, insets y by 1 px and reports the zero line', () => {
  const { pts, zeroY } = sparkPoints([-1, 0, 1], 100, 22, [-1, 1])
  expect(pts.map(p => p[0])).toEqual([0, 50, 100]); expect(pts[0][1]).toBe(21); expect(pts[2][1]).toBe(1); expect(zeroY).toBe(11)
  expect(sparkPoints([3, 3], 10, 10).zeroY).toBeNull()        // domain [2.5, 3.5] excludes 0
  expect(sparkPoints([], 10, 10)).toEqual({ pts: [], zeroY: null })
})
// web/components/dither/glyphs.test.ts  (import { createElement as h } from 'react'; import { renderToStaticMarkup as r } from 'react-dom/server')
test('HaloRing lights exactly the Bayer cells under the band density', () => {
  for (const [band, n] of [[0, 8], [1, 22], [2, 42], [3, 64]] as const) { const m = r(h(HaloRing, { size: 64, band })); expect((m.match(/<rect /g) ?? []).length).toBe(n) }
  expect(r(h(HaloRing, { size: 64 }))).toContain('var(--paper-0)'); expect(r(h(HaloRing, { size: 64, band: 0, flame: true }))).toContain('var(--flame)')
  expect(r(h(HaloRing, { size: 64, depth: 0.35 }))).toContain('data-depth="0.35"'); expect(r(h(HaloRing, { size: 64, cell: 2 }))).toContain('width="16"'); expect(r(h(HaloRing, { size: 64 }))).not.toContain('<canvas')
})
test('Diamond: grafted is a flame rhombus with a 45° hatch; pruned is hollow and dashed; never a canvas', () => {
  const g = r(h(Diamond, { size: 28, label: 'attacker' })); expect(g).toContain('points="50,0 100,50 50,100 0,50"'); expect(g).toContain('fill="var(--flame)"'); expect(g).toContain('patternTransform="rotate(45)"'); expect(g).toContain('<title>attacker</title>')
  const p = r(h(Diamond, { size: 28, pruned: true })); expect(p).toContain('fill="none"'); expect(p).toContain('stroke="var(--paper-3)"'); expect(p).toContain('stroke-dasharray="3 2"'); expect(g + p).not.toContain('<canvas')
})
```

- [ ] **Step 2: Run to verify failure**

Run: `cd /home/yks/Projects/luminar/web && npx vitest run lib/spark.test.ts components/dither/glyphs.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement `lib/spark.ts` per A.28**

- [ ] **Step 4: Run to verify pass**

Run: `cd /home/yks/Projects/luminar/web && npx vitest run lib/spark.test.ts components/dither/glyphs.test.ts`
Expected: PASS (4 tests; the glyph tests pass only after Step 6).

- [ ] **Step 5: Implement `Sparkline.tsx`**

`'use client'`; a `<canvas role="img" aria-label>` sized to its container width × `height` (default 36, never under 12) at `min(devicePixelRatio, 2)`; `ResizeObserver` on the parent; draws (a) the area under the line filled with a `CanvasPattern` built from a `--cell-ui`-sized 2×2 checker of `--fg` (flame when `alarm`) — the only dither here, (b) the line 1.5 px `--fg` (`--flame` when `alarm`), (c) `zeroLine` dashed `[2,2]` `--hair-strong` at `zeroY`. Colours via `getComputedStyle(document.documentElement).getPropertyValue(...)` read once per draw (the stage theme swaps tokens). Draw inside `useEffect([values, domain, alarm])`; fewer than 2 values draws nothing.

- [ ] **Step 6: Implement `HaloRing.tsx`, `Diamond.tsx` and `Glyph.tsx`**

`HaloRing({ size, band = 2, flame = false, depth, className, cell = 4 })` and `Diamond({ size, pruned = false, depth, className, label })` are the SVG constructions pinned in A.0 (A.20 row). HaloRing: `<svg width={size} height={size} viewBox="0 0 {size} {size}" data-depth aria-hidden="true" shape-rendering="crispEdges">` with `<defs><pattern id={\`halo-${band}-${cell}-${flame ? 'f' : 'p'}\`} patternUnits="userSpaceOnUse" width={8*cell} height={8*cell}>` holding one `<rect x={cx*cell} y={cy*cell} width={cell} height={cell}>` per `(cx, cy)` with `bayer(cx, cy) < BAND_DENSITY[band]` (fill `var(--flame)` when `flame`, else `var(--paper-0)`), an annulus path (outer `R = size/2`, inner `0.6 R`, `fill-rule="evenodd"`) filled with `url(#id)`, and a 1 px `var(--paper-0)` rim circle; the id is deterministic so identical instances share one definition and SSR output is stable; the thresholds are the atlas halos' by construction. Diamond: `<svg viewBox="0 0 100 100" role="img" data-depth>` with `<title>{label}</title>` when given; grafted `<polygon points="50,0 100,50 50,100 0,50" fill="var(--flame)"/>` plus the same polygon filled with `url(#hatch-<useId>)` (`<pattern patternUnits="userSpaceOnUse" width=3 height=3 patternTransform="rotate(45)">` of a 1×3 rect in `rgb(11 11 13 / .55)` — the `--hatch` recipe); pruned a single polygon `fill="none" stroke="var(--paper-3)" stroke-width="1" stroke-dasharray="3 2" vector-effect="non-scaling-stroke"`. Both plain React (no `next/*`, no hooks beyond `useId`), never a `<canvas>`, never dithered beyond the halo's own cells. `Glyph({ role, size = 12, band, title })`: SVG per the render table — `honest`/`receiving` disc `--paper-0` (with `<HaloRing size={size*1.7} band={band ?? 3}>` behind it when `band` is given), `idle` disc `--pitch-4` + 1 px `--paper-3` rim, `origin` disc + pitch centre dot, `decoded` disc + solid `--signal` ring at 1.6 r, `observer` double `--signal` ring, `joining` hollow 1 px `--paper-1`, `failed` disc with X `--paper-3`, `error` X in `--flame-dim`, `attacker` → `<Diamond>`, `pruned` → `<Diamond pruned>`.

- [ ] **Step 7: Implement `StatsRail.tsx` sections 1–3**

Rail scrolls (`overflow-y: auto`, 6 px scrollbar), hairline-separated `<section>`s, uppercase `--t-label` headings `.12em`, no boxes.
1. **KPI 2×2**: `const k = useStore(selectKpis)`; tiles Delivery (`k.delivery` → `(ratio*100).toFixed(1)` + unit `%`), Propagation (`toFixed(0)` + `ms`), Avg hops (`toFixed(1)`), Mesh degree (`avg.toFixed(1)` + unit `${min}–${max}`); each number at `--t-kpi` tabular, `—` and hidden unit when null; under each a `<Sparkline height={24}>` of `analyticsHistory.map(s => s.delivery | propagationMs | hops | degree)` (`useShallow`), `aria-label="delivery, last 60 analytics frames"` etc.
2. **NODES**: heading meta `${nodeCount}${attackers.length ? ` +${attackers.length}` : ''}`; **state strip** `<canvas height=6>` one cell per node in order (`nodes` via `useShallow`), cell colour by state token (`--node-<state>`, attackers `--flame`, pruned `--paper-3`), solid, drawn in `useEffect` (builder's call: canvas at every size, one code path, cheap at 200); below it the 2-column grid of nine rows from `selectStateCounts` in the order `idle, origin, receiving, decoded, joining, failed, error, attacker, pruned`, each `<Glyph role>` + label + count (tabular).
3. **MESSAGES**: rows Sent `fmtCount(totalMessagesSent)`, Received, Invalid `fmtCount(invalidCount)` (`--flame-text` when > 0), Total events `fmtCount(eventCount)`.

Leave `<section data-section="cdf|beats|cats|infra">` placeholders for Task 3.5. Mount in `SimApp` as `<StatsRail onBeat={() => {}}/>`; Task 3.5 supplies the real handler.

- [ ] **Step 8: Verify**

Run: `cd /home/yks/Projects/luminar/web && npx tsc --noEmit && npm run lint && npx vitest run`
Expected: green.

- [ ] **Step 9: Browser walk (desktop)**

1. Fresh backend, no messages yet. Observe: four KPI numbers read `—`, no units, empty sparklines; NODES meta `20`; state strip 20 cells all `--pitch-4`; counts `idle 20`, others `0`; MESSAGES all `0`.
2. Launch the demo scenario. By T+8 observe: Delivery `100.0 %`-ish, Propagation `N ms`, Avg hops `N.N`, Mesh degree `N.N` with `min–max`; sparklines show a dithered area under a paper line and grow one sample per 2 s. Sent/Received climb.
3. At T+10 observe: NODES meta `50 +5` (after preset 50) or `20 +5`; `attacker 5` with a flame diamond glyph; state strip shows five flame cells at the end. By T+13: `attacker` falls and `pruned` rises, pruned glyph hollow dashed. Invalid > 0 in flame.
4. Reduced motion emulation changes nothing here (no animation); stage toggle `t` (phase 4) is not required, but `document.documentElement.dataset.stage='1'` set by hand must enlarge the KPI numbers to 40 px (token-driven) — optional check.

- [ ] **Step 10: Commit**

```bash
git add web/lib/spark.ts web/lib/spark.test.ts web/components/dither/glyphs.test.ts web/components/sim/Sparkline.tsx web/components/sim/Glyph.tsx web/components/sim/Glyph.module.css web/components/sim/StatsRail.tsx web/components/sim/StatsRail.module.css web/components/dither/HaloRing.tsx web/components/dither/Diamond.tsx web/components/sim/SimApp.tsx
git commit -m "feat(web): stats rail KPIs with dithered sparklines, state strip, counts and messages; glyph atoms"
```

### Task 3.5: Stats rail — CDF, beats, event categories, infrastructure

**Files:**
- Modify: `web/components/sim/StatsRail.tsx`, `web/components/sim/StatsRail.module.css`, `web/components/sim/SimApp.tsx` (the `onBeat` handler)
- Test: browser walk (geometry reuses `cdfStats` from `lib/format.test.ts` and `Sparkline`)

**Interfaces:**
- Consumes: `cdfStats`, `fmtLatency`, `fmtCount`, `formatNumber` (A.3); `AppState.{gossipAnalytics,beats,eventCounts,eventCount,streamManager,dhtCoordinator,reel}`; `seekTo`, `setCaption` (A.12/A.11); `Beat`.
- Produces: the completed `StatsRail`; `SimApp.onBeat(b)` = `reel ? seekTo(b.time) : setCaption({ text: b.label, kind: b.kind === 'phase' ? 'phase' : 'narrator', at: b.time })` (builder's call for "click → highlight live": the caption re-announces the beat).

- [ ] **Step 1: DELIVERY CDF**

`<section>` heading `Delivery CDF` with meta `p50 ${fmtLatency(p50)}`; its own `<canvas role="img" aria-label="delivery latency CDF" height=56>` drawn by a local `drawCdf` (not `Sparkline`: x is latency, not sample index): x = latency linear min→max, y = percentile; area under the curve filled with the same `--cell-ui` checker pattern as `Sparkline`; dashed `[2,2]` vertical at `x(p50)` in `--hair-strong`; 1.5 px `--fg` line. Axis row `fmtLatency(min) · p50 · fmtLatency(max)` in `--t-micro --fg-3`. The section renders `—` until `selectHasMessages`.

- [ ] **Step 2: BEATS**

`const beats = useStore(useShallow(s => s.beats))`; rows are `<button>`s: a 6 px square marker (`--flame` for `fault`/`prune`, `--signal` for `healed`, `--fg` for `phase`), label (`--t-body`), time `T+${time.toFixed(1)}s` tabular right-aligned; `onClick={() => onBeat(b)}`; `title={reel ? 'seek' : 'show caption'}`. Empty state text `no beats yet` in `--fg-3`. No counters (`N messages`, `N nodes decoded`) anywhere.

- [ ] **Step 3: EVENT CATEGORIES**

Six rows `gossip connection stream dht fault health`: label, a 12 px-tall bar whose fill width is `max(n / eventCount, 0.02) * 100 %` (0 when n = 0) and whose fill is `background: var(--dither-50)` (12 px tall is the dither floor; fault row uses `var(--dither-flame)`), count `formatNumber(n)` from `eventCounts[cat]`.

- [ ] **Step 4: INFRASTRUCTURE**

Streams row: `${open}/${max}` with a 12 px dithered bar `open / max`; DHT row: `${active}/${available}` with `available` 10 px-wide solid segments (`--fg` when `i < active`, `--pitch-3` otherwise) — segments are under 12 px, so solid; never a literal `8`.

- [ ] **Step 5: Verify**

Run: `cd /home/yks/Projects/luminar/web && npx tsc --noEmit && npm run lint && npx vitest run`
Expected: green.

- [ ] **Step 6: Browser walk (desktop)**

1. Demo scenario at T+8. Observe: CDF section shows a rising curve with a dithered area, dashed p50 line, meta `p50 Nms`, axis `Nms · p50 · Nms` with min < max.
2. BEATS at T+13 observe, in order: `Sybil attack: 5 attackers graft in · T+10.0s` (phase, paper marker), `First Sybil pruned · T+11.9s`-ish (prune, flame marker). At T+25: `Faults cleared — mesh healing` and shortly after `Mesh healed` (signal marker). No `N messages` rows ever.
3. Click a beat row live. Observe: the narrator caption (Task 3.9; until then check `useStore.getState().caption` via the React DevTools or accept after 3.9) re-shows that label with kicker `T+10.0s · PHASE`.
4. Enter reel `1`, pause, click the `First Sybil pruned` beat. Observe: `simTime` jumps to 11.9-ish, mesh repaints, scrubber head moves.
5. EVENT CATEGORIES: six bars, `fault` bar in flame dither, others paper dither; counts match the log header totals order of magnitude; bars are exactly 12 px tall (`getBoundingClientRect().height === 12`).
6. INFRASTRUCTURE: Streams `N/64` bar; DHT `N/8` with 8 segments (reads `dhtCoordinator.available`, verify by `evaluate_script` that the segment count equals the store's `available`).

- [ ] **Step 7: Commit**

```bash
git add web/components/sim/StatsRail.tsx web/components/sim/StatsRail.module.css web/components/sim/SimApp.tsx
git commit -m "feat(web): stats rail CDF, clickable beats, dithered category and infrastructure bars"
```

### Task 3.6: Event log rail

**Files:**
- Create: `web/lib/log-filter.ts`, `web/components/sim/LogRail.tsx`, `web/components/sim/LogRail.module.css`
- Modify: `web/components/sim/SimApp.tsx` (mount `<LogRail/>` in `[data-rail="r"]`)
- Test: `web/lib/log-filter.test.ts` (vitest); browser walk

**Interfaces:**
- Consumes: `TYPE_CODES`, `DEFAULT_TYPE`, `FILTER_GROUPS`, `DEFAULT_OFF`, `formatNode`, `buildDetail`, `Tone` (A.6); `isNodeVisible` (A.14); `isAttackerId` (A.3); `AppState.{events,eventCount,droppedEvents,nodeById,layoutMode,selectedPeer}`; `selectPeer(id, highlight)` (A.11).
- Produces: `initialFilters`, `toggleFilter`, `visibleRows`, `rowClick` (A.28); `LogRail()`; the Inspector (Task 3.7) slides over this rail, so `LogRail` keeps `position: relative; height: 100%`.

- [ ] **Step 1: Write the failing test**

```ts
// web/lib/log-filter.test.ts
import { initialFilters, toggleFilter, visibleRows, rowClick } from '@/lib/log-filter'
const e = (over: object) => ({ at: 1, event_type: 'GossipMessage', category: 'gossip' as const, ...over })
const node = (id: string, over = {}) => ({ peer_id: id, index: 0, state: 'idle' as const, connected_peers: ['peer-1', 'peer-2', 'peer-3', 'peer-4', 'peer-5', 'peer-6', 'peer-7', 'peer-8', 'peer-9'], x: 0, y: 0, messages_sent: 0, messages_received: 0, gossip_score: 0, ...over })
test('initial filters are every group except clock; toggle flips; alt-click isolates', () => {
  const f = initialFilters(); expect(f.has('clock')).toBe(false); expect(f.size).toBe(8)
  expect(toggleFilter(f, 'clock', false).has('clock')).toBe(true); expect(toggleFilter(f, 'gossip', false).has('gossip')).toBe(false)
  expect([...toggleFilter(f, 'fault', true)]).toEqual(['fault'])
})
test('visibleRows keeps the last 500 matching rows, oldest first', () => {
  const rows = Array.from({ length: 1200 }, (_, i) => e({ at: i, category: i % 2 ? 'gossip' : 'clock' }))
  const v = visibleRows(rows, new Set(['gossip']))
  expect(v).toHaveLength(500); expect(v[0].at).toBe(201); expect(v.at(-1)!.at).toBe(1199)
})
test('rowClick returns null for a hidden or unknown peer', () => {
  const obs = node('obs-1', { is_real: true })
  expect(rowClick(e({ peer_id: 'obs-1' }), { nodeById: new Map([['obs-1', obs]]), layoutMode: 'force', selectedPeer: null })).toBeNull()
  expect(rowClick(e({ peer_id: 'peer-9' }), { nodeById: new Map(), layoutMode: 'force', selectedPeer: null })).toBeNull()
})
test('rowClick selects with to_peer + first 8 connected for gm, and toggles off', () => {
  const s = { nodeById: new Map([['peer-0', node('peer-0')]]), layoutMode: 'force' as const, selectedPeer: null }
  expect(rowClick(e({ from_peer: 'peer-0', to_peer: 'peer-3' }), s)).toEqual({ select: 'peer-0', highlight: ['peer-3', 'peer-1', 'peer-2', 'peer-4', 'peer-5', 'peer-6', 'peer-7', 'peer-8'] })
  expect(rowClick(e({ event_type: 'GossipPrune', from_peer: 'peer-0', to_peer: 'sybil-1' }), s)).toEqual({ select: 'peer-0', highlight: ['sybil-1'] })
  expect(rowClick(e({ peer_id: 'peer-0' }), { ...s, selectedPeer: 'peer-0' })).toEqual({ select: null, highlight: [] })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `cd /home/yks/Projects/luminar/web && npx vitest run lib/log-filter.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `lib/log-filter.ts` per A.28**

- [ ] **Step 4: Run to verify pass**

Run: `cd /home/yks/Projects/luminar/web && npx vitest run lib/log-filter.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Implement `LogRail.tsx`**

Header: `EVENT LOG` label, meta `${eventCount.toLocaleString('en-US')} · ${following ? 'following' : 'paused'}`, and when `droppedEvents > 0` a `<span data-gap>` `${droppedEvents} dropped (gap)` in `--flame-text` with `title="the backend dropped events above 200 per tick"`. Chips row: `All`, `None` (set to all / empty), then one `<button aria-pressed={active.has(cat)} onClick={e => setActive(toggleFilter(active, cat, e.altKey || e.metaKey))}>` per `FILTER_GROUPS`; hint `⌥-click isolates` in `--t-micro --fg-3`. Filters are local `useState(initialFilters)`. List: `<div ref onScroll>` with `following = scrollHeight − scrollTop − clientHeight < 30`; rows = `visibleRows(events, active)` (`events` via `useStore(s => s.events)`, rendered with `useMemo`); each row a 22 px `<div role="button" tabIndex={0}>` grid `at.toFixed(2)` (`--fg-3`) · `formatNode(evt)` (`--flame-text` when `isAttackerId`) · `<span data-tone={tone}>{code}</span>` (`ok` → `--signal-text`, `alarm` → `--flame-text`, `fg/fg2/fg3` → `--fg/--fg-2/--fg-3`; never a colour literal) · `buildDetail(evt)` ellipsised; `aria-current` when the row's peer is `selectedPeer`. Click/Enter → `const r = rowClick(evt, state); if (r) selectPeer(r.select, r.highlight)` — selecting opens the inspector (Task 3.7 renders whenever `selectedPeer` is set). After each render, if `following` scroll to the bottom in a `requestAnimationFrame`. Row keys: `${evt.at}-${i}`.

- [ ] **Step 6: Verify**

Run: `cd /home/yks/Projects/luminar/web && npx tsc --noEmit && npm run lint && npx vitest run`
Expected: green.

- [ ] **Step 7: Browser walk (desktop)**

1. Observe: header `EVENT LOG` with `N · following`; chips `All None Gossip Conn Stream DHT Fault Health Clock Sim Live`; `Clock` is `aria-pressed="false"`, the others `true`; rows are 22 px (`getBoundingClientRect().height === 22`), at most 500 (`querySelectorAll('[role=button]').length <= 500` after a minute of running).
2. Click `Clock`. Observe: `ck` rows appear at 10 Hz. Alt-click `Fault`. Observe: only `Fault` is pressed; the list shows only `fi`/`fc` rows (empty until a fault). Click `All`.
3. Scroll the list up 100 px. Observe: meta flips to `paused`, new rows no longer move the view. Scroll to the bottom: `following`.
4. Inject Sybil. Observe: `fi` row in flame (`net · fi · sybil × 5`), `gp` rows `nN · gp · sybil-K · score` with `sybil-K` detail and flame code, `gf` rows in signal.
5. Click a `gm` row `n4 → …`. Observe: the row gets `aria-current`, the canvas draws the reticle on n4 and highlight lines to up to nine peers (phase 2), the inspector (3.7) opens. Click the same row again. Observe: deselects, inspector closes.
6. Switch the canvas to Geo with mainnet on (phase 2 walk), click any `gm` row. Observe: nothing selects (hidden peer), no inspector.
7. Press `Space` to play at `10×` for a while on 200 nodes. Observe: `N dropped (gap)` appears in flame in the header once the backend emits `gap` frames; the count only grows; Reset clears it.

- [ ] **Step 8: Commit**

```bash
git add web/lib/log-filter.ts web/lib/log-filter.test.ts web/components/sim/LogRail.tsx web/components/sim/LogRail.module.css web/components/sim/SimApp.tsx
git commit -m "feat(web): event log rail with chips, 22px rows, gap indicator and row-click selection"
```

### Task 3.7: Peer inspector with mesh vs topology peers

**Files:**
- Create: `web/lib/inspector-peers.ts`, `web/components/sim/Inspector.tsx`, `web/components/sim/Inspector.module.css`
- Modify: `web/components/sim/SimApp.tsx` (mount `<Inspector/>` inside `[data-rail="r"]` after `<LogRail/>`)
- Test: `web/lib/inspector-peers.test.ts` (vitest); browser walk

**Interfaces:**
- Consumes: `selectSelectedNode`, `AppState.{mesh,events,scoreHistory,nodeById,layoutMode}`, `selectPeer` (A.11); `shortName`, `shortId`, `isAttackerId`, `isPruned`, `signed` (A.3); `TYPE_CODES`, `DEFAULT_TYPE`, `inspectorDetail` (A.6); `ECLIPSE_WHY`, `MESH_HIDDEN` (A.4); `Reticle` (phase 2, A.20); `Glyph`, `Sparkline` (3.4); `scoreDomain` (3.4); `isNodeVisible` (A.14).
- Produces: `meshPeers`, `prunedBy`, `peerEvents`, `direction` (A.28); `Inspector()` — open iff `selectSelectedNode` is defined; closes through `selectPeer(null)`.

- [ ] **Step 1: Write the failing test**

```ts
// web/lib/inspector-peers.test.ts
import { meshPeers, prunedBy, peerEvents, direction } from '@/lib/inspector-peers'
const e = (over: object) => ({ at: 1, event_type: 'GossipMessage', category: 'gossip' as const, ...over })
test('meshPeers is null when the key is absent', () => {
  expect(meshPeers({}, 'peer-10')).toBeNull()
  expect(meshPeers({ 'peer-10': ['eclipse-0', 'eclipse-1', 'eclipse-2', 'eclipse-3'] }, 'peer-10')).toEqual(['eclipse-0', 'eclipse-1', 'eclipse-2', 'eclipse-3'])
})
test('prunedBy lists unique honest pruners of an attacker', () => {
  const ev = [e({ event_type: 'GossipPrune', from_peer: 'peer-1', to_peer: 'sybil-0', reason: 'score' }), e({ event_type: 'GossipPrune', from_peer: 'peer-1', to_peer: 'sybil-0' }), e({ event_type: 'GossipPrune', from_peer: 'peer-4', to_peer: 'sybil-0' }), e({ event_type: 'GossipPrune', from_peer: 'peer-9', to_peer: 'sybil-1' })]
  expect(prunedBy(ev, 'sybil-0')).toEqual(['peer-1', 'peer-4'])
})
test('peerEvents keeps the last 200 touching the peer; direction reads from/to', () => {
  const ev = Array.from({ length: 300 }, (_, i) => e({ at: i, from_peer: i % 3 ? 'peer-2' : 'peer-0', to_peer: 'peer-1' }))
  const mine = peerEvents(ev, 'peer-0'); expect(mine).toHaveLength(100); expect(peerEvents(ev, 'peer-1')).toHaveLength(200)
  expect(direction(e({ from_peer: 'peer-0', to_peer: 'peer-1' }), 'peer-0')).toBe('↑'); expect(direction(e({ from_peer: 'peer-0', to_peer: 'peer-1' }), 'peer-1')).toBe('↓'); expect(direction(e({ peer_id: 'peer-1' }), 'peer-1')).toBe('·')
})
```

- [ ] **Step 2: Run to verify failure**

Run: `cd /home/yks/Projects/luminar/web && npx vitest run lib/inspector-peers.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `lib/inspector-peers.ts` per A.28**

- [ ] **Step 4: Run to verify pass**

Run: `cd /home/yks/Projects/luminar/web && npx vitest run lib/inspector-peers.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Implement `Inspector.tsx`**

`const node = useStore(selectSelectedNode)`; render `null` when undefined. Panel `position: absolute; inset: 0` over the log rail, `--panel` surface, slides in with `translateX` over `--d-rail` (`transform` only). Sections:
- **Header**: `<Reticle size={14}>` (the selected-peer glyph, spec §7.4.3) + `<Glyph role={pruned ? 'pruned' : node.state}>`; short name in Instrument Serif italic (`--font-display`, 20 px); badges `<span>{pruned ? 'pruned' : node.state}</span>`, `attacker` when `state === 'attacker'`, `eclipse target` when `meshPeers(mesh, id)` is non-null and every entry `isAttackerId`; full `peer_id` in `--t-micro --fg-3`; `<button aria-label="Close (Escape)">ESC</button>` → `selectPeer(null)`.
- **Metrics**: Sent · Recv · Score (`signed(gossip_score)`, `--flame-text` when `< 0`) · Mesh `${meshPeers(...)?.length ?? '—'}/6`.
- **Score history**: `<Sparkline values={scoreHistory.map(p => p.v)} height={44} domain={scoreDomain(values)} zeroLine alarm={last < 0} aria-label="gossip score, last 50 ticks">`; axis `T+${first.t.toFixed(1)}` … `T+${last.t.toFixed(1)}`; meta `last 50 ticks`.
- **MESH PEERS**: chips from `meshPeers(mesh, id)`; `null` → the `MESH_HIDDEN` sentence in `--fg-3`; attacker chips in `--flame-text`; a pruned attacker shows instead `prunedBy(events, id)` chips with `text-decoration: line-through` and the note `pruned from every honest mesh`.
- **TOPOLOGY PEERS**: chips from `connected_peers`. Chip click → `isNodeVisible(layoutMode, nodeById.get(id)) && selectPeer(id)`; chips are `<button>`s with `title={id}` and text `shortId(id)`.
- **WHY** (attackers only): `<p>` in Instrument Serif italic `--t-fig`: `ECLIPSE_WHY`.
- **Events**: `peerEvents(events, id)` rows: `at.toFixed(2)` · code with tone · `direction` · `other peer · inspectorDetail(evt)`; auto-scroll to the bottom; cap 200 is in the helper.
Score history clears when the id changes (the store does this in `selectPeer`).

- [ ] **Step 6: Verify**

Run: `cd /home/yks/Projects/luminar/web && npx tsc --noEmit && npm run lint && npx vitest run`
Expected: green.

- [ ] **Step 7: Browser walk (desktop)**

1. Click an honest peer on the canvas. Observe: the inspector slides over the log; header shows the reticle, the glyph, `n12` in serif italic, badge `receiving` (or current state), full id `peer-12`, `ESC`; metrics Sent/Recv numbers, Score `+N.NN`, Mesh `n/6` with 0 < n ≤ 6; after a few seconds the score sparkline has ≥ 2 points, dashed zero line, `last 50 ticks`; MESH PEERS chips ⊆ TOPOLOGY PEERS chips (different lists, both labelled).
2. Click a MESH PEERS chip. Observe: the inspector switches to that peer; the score history restarts (one point).
3. Launch the demo; at T+17 select `peer-10` (`n10`). Observe: badge `eclipse target`; MESH PEERS shows exactly four chips `eclipse-0 … eclipse-3` in flame while TOPOLOGY PEERS still lists `nN` honest ids. The spec's phase-3 gate in one screen.
4. Select `sybil-0` at T+11 (click the diamond). Observe: badges `attacker` and state `attacker`, Score in flame once negative, WHY paragraph reads the `ECLIPSE_WHY` sentence verbatim, MESH PEERS lists victims in paper; at T+13 (pruned) the badge reads `pruned`, the glyph is a hollow dashed diamond, MESH PEERS shows struck-through chips `n4 n17 …` with `pruned from every honest mesh`.
5. Node preset `200`, select any peer. Observe: MESH PEERS shows `gossip mesh · hidden above 100 peers (backend sends none)`; Mesh metric `—/6`. Back to `20`.
6. Press `Escape`. Observe: inspector closes, reticle leaves the canvas, log row loses `aria-current`. Click the `ESC` button after re-selecting: same. Reset (`r` after 3.10, button now): closes.
7. Events list shows rows touching the peer with `↑` for sent, `↓` for received, `spam` detail on `spam-*` messages when the peer is a Sybil victim.

- [ ] **Step 8: Commit**

```bash
git add web/lib/inspector-peers.ts web/lib/inspector-peers.test.ts web/components/sim/Inspector.tsx web/components/sim/Inspector.module.css web/components/sim/SimApp.tsx
git commit -m "feat(web): peer inspector with mesh vs topology peers, score history and the eclipse WHY line"
```

### Task 3.8: Legend and settings

**Files:**
- Create: `web/components/sim/Legend.tsx`, `web/components/sim/Legend.module.css`
- Modify: `web/components/sim/SimApp.tsx` (mount `<Legend/>` top-right inside `<main>`)
- Test: browser walk (the token setter is covered by `lib/api/client.test.ts`; `setDisplay`/`setPref` by `lib/store.test.ts`)

**Interfaces:**
- Consumes: `Glyph`, `HaloRing`, `Diamond` (3.4); `AppState.{particlesEnabled,showLabels,showEdges,allLabels,stageTheme,hero,nodeCount}`, `setDisplay`, `setPref` (A.11); `adminToken`, `setAdminToken` (A.7); `reducedMotion` (A.13); `MESH_HIDDEN` (A.4).
- Produces: `Legend()`; the legend is a `<dl>`; settings toggles are `<input type="checkbox" role="switch">`.

- [ ] **Step 1: Implement the legend body**

`<aside aria-label="Legend">` top-right (`top: var(--s-3); right: var(--s-3)`, 176 px, `--panel` solid, 1 px `--hair`), header row `LEGEND` + `<button aria-expanded aria-label="Collapse legend">` + gear `<button aria-label="Settings" aria-pressed={settings}>`. Body `<dl>`: fills — `<dt><Glyph role="honest" band={3}/></dt><dd>honest · halo = score</dd>` (the HaloRing twin, spec §7.4.2), `idle`, `origin`, `receiving`, `decoded`, `observer`, `joining`, `failed`, `error`, `<dt><Diamond size={12}/></dt><dd>attacker</dd>` (the Diamond twin), `pruned attacker`; lines — topology (1 px dotted), gossip mesh (1 px solid `--link-mesh`), attack link (dashed flame), message (2-cell square `--paper-0`); last `<dd>` in `--fg-3 --t-micro`: `MESH_HIDDEN`. Collapsed state keeps the header only (local `useState`, remembered in `localStorage['luminar.legend']` with try/catch).

- [ ] **Step 2: Implement the settings body**

Gear toggles the body between the `<dl>` and a `<form>` of switches: `Gossip transfers` (`particlesEnabled`; disabled with hint `off under reduced motion` when `reducedMotion()`), `Node labels` (`showLabels`), `Edge lines` (`showEdges`), `All labels (≤ 50 nodes)` (`allLabels`; disabled with hint `up to 50 nodes` when `nodeCount > 50`), `Stage theme` with `<kbd>T</kbd>` (`setPref('stageTheme', v)`), `Hero layout` `<kbd>H</kbd>` (`setPref('hero', v)`); then `Admin token` `<input type="password" autoComplete="off" defaultValue={adminToken() ?? ''} onChange={e => setAdminToken(e.target.value || null)}>` with the hint `sent as X-Luminar-Token on every POST`. Switch visuals: 28×16 track `--pitch-3`, thumb `--paper-0`, checked track `--paper-1`; square corners. Switches read the store so `t`/`h` keys (3.10) keep them in sync.

- [ ] **Step 3: Verify**

Run: `cd /home/yks/Projects/luminar/web && npx tsc --noEmit && npm run lint && npx vitest run`
Expected: green.

- [ ] **Step 4: Browser walk (desktop)**

1. Observe: legend top-right is a `<dl>` with 11 fills and 4 lines; the honest row shows a dithered halo ring around a paper disc, the attacker row a flame hatched diamond — the same two glyphs the canvas draws; the last line reads `gossip mesh · hidden above 100 peers (backend sends none)`.
2. Click collapse. Observe: only the header remains; reload: still collapsed. Expand.
3. Gear → settings. Toggle `Edge lines` off. Observe: topology edges vanish on the canvas. Toggle `Node labels` off: labels vanish. Toggle `All labels` on at 20 nodes: every node labelled (phase 2 reads `allLabels`). Preset `100`: the switch is disabled with `up to 50 nodes`.
4. Type `wrong` in Admin token. Observe: `localStorage.getItem('luminar.token') === 'wrong'`; with `LUMINAR_ADMIN_TOKEN=secret` the next fault toasts `failed · 403`; type `secret` → `injected`. Clear the field → key removed.
5. `emulate` reduced motion, reload. Observe: `Gossip transfers` switch off and disabled with `off under reduced motion`.
6. Toggle `Stage theme`. Observe: `document.documentElement.dataset.stage === '1'` and the switch stays checked after pressing `t` twice (store-driven).

- [ ] **Step 5: Commit**

```bash
git add web/components/sim/Legend.tsx web/components/sim/Legend.module.css web/components/sim/SimApp.tsx
git commit -m "feat(web): legend as a dl with the halo and diamond twins; settings with all-labels and admin token"
```

### Task 3.9: Narrator caption

**Files:**
- Create: `web/components/sim/Narrator.tsx`, `web/components/sim/Narrator.module.css`
- Modify: `web/components/sim/SimApp.tsx` (mount `<Narrator/>` bottom-left above the strip inside `<main>`)
- Test: browser walk (latches and beats are tested in `lib/store.test.ts` `narrator beats: phase, first score prune to a sybil, healed`)

**Interfaces:**
- Consumes: `AppState.caption` (`Caption { text, kind, at, seq }`), `setCaption` (A.11).
- Produces: `Narrator()`; `CAPTION_MS = 4000` (equals `--d-caption`).

- [ ] **Step 1: Implement `Narrator.tsx`**

`const c = useStore(s => s.caption)`; a `<div aria-live="polite" aria-atomic="true">` that is always in the DOM (so announcements work) and shows content while `c` is set and `Date.now() - shownAt < CAPTION_MS`: kicker `T+${c.at.toFixed(1)}s · ${c.kind === 'phase' ? 'PHASE' : 'NARRATOR'}` in Manrope 600 `--t-label` (`--signal-text` for `healed`, `--fg-2` otherwise); sentence in Instrument Serif italic at `--t-narr`; a 2 px drain bar whose `animation: drain var(--d-caption) linear forwards` restarts via `key={c.seq}`. A `useEffect([c?.seq])` sets a `CAPTION_MS` timeout that hides the card (`setCaption(null)` is **not** called — the store keeps the last caption for the ticker; local `visible` state hides it). Position `left: var(--s-4); bottom: calc(36px + var(--strip-h) + var(--s-6))`, max-width 420 px, `--panel` surface, 1 px `--hair`, no dither (text). Reduced motion (spec §10 "caption drain bar static"): `@media (prefers-reduced-motion: reduce) { .drain { animation: none; width: 100% } }`; the 4 s hide timer still runs.

- [ ] **Step 2: Verify**

Run: `cd /home/yks/Projects/luminar/web && npx tsc --noEmit && npm run lint && npx vitest run`
Expected: green.

- [ ] **Step 3: Browser walk (desktop)**

1. Launch the demo. At T+10 observe: card bottom-left above the strip, kicker `T+10.0s · PHASE`, sentence `Sybil attack: 5 attackers graft in` in serif italic, drain bar empties over 4 s, card hides.
2. At T+11.9-ish observe: `T+11.9s · NARRATOR` / `First Sybil pruned by score`. At T+16: `T+16.0s · PHASE` / `Eclipse on peer-10`. After T+24 and recovery: kicker in signal `… · NARRATOR`, `Mesh healed in N.Ns`.
3. Re-trigger while visible (click two beats in quick succession): the drain bar restarts from full each time (`seq` changes).
4. `take_snapshot`: the region is `aria-live="polite"`.
5. Reduced-motion emulation: the drain bar is a static full-width rule; the card still hides after 4 s.

- [ ] **Step 4: Commit**

```bash
git add web/components/sim/Narrator.tsx web/components/sim/Narrator.module.css web/components/sim/SimApp.tsx
git commit -m "feat(web): narrator caption with kicker, serif sentence and drain bar"
```

### Task 3.10: Keyboard wiring, `?` overlay and the Overlay primitive

**Files:**
- Create: `web/components/sim/Overlay.tsx`, `web/components/sim/Overlay.module.css`, `web/components/sim/KeyHelp.tsx`, `web/components/sim/KeyHelp.module.css`
- Modify: `web/components/sim/SimApp.tsx` (the `keydown` effect; mount `<KeyHelp/>`)
- Test: browser walk (`actionForKey` is tested in `lib/keys.test.ts`; `runKey` in `lib/actions.test.ts`)

**Interfaces:**
- Consumes: `actionForKey`, `KEY_BINDINGS`, `KeyBinding` (A.5); `runKey` (A.12); `AppState.keyHelpOpen`, `setKeyHelp` (A.11); `manifest` (SimApp state).
- Produces: `Overlay({ open, onClose, title, children, className })` (A.28); `KeyHelp()`.

- [ ] **Step 1: Implement `Overlay.tsx`**

`'use client'`; renders `null` when `!open`; otherwise a fixed full-screen `<div role="dialog" aria-modal="true" aria-label={title}>` on `--bg` at .96 alpha (no dither on the surface), close `<button aria-label="Close">×</button>` top-right (the `+`→`×` of spec §6.1 is the trigger's job; the overlay always shows `×`). On open: remember `document.activeElement`, focus the first focusable descendant; `keydown`: `Escape` → `onClose()`; `Tab`/`Shift+Tab` wrap inside the dialog. On close: restore focus. Backdrop click (target === the dialog) → `onClose()`. Children marked `data-row` receive `style.animationDelay = calc(var(--stagger) * i)` with the `rise` animation (`--d-row`, `--ease`); nothing animates under reduced motion (tokens zero `--d-row` and `--stagger`).

- [ ] **Step 2: Implement `KeyHelp.tsx`**

`const open = useStore(s => s.keyHelpOpen)`; `<Overlay open={open} onClose={() => setKeyHelp(false)} title="Keyboard shortcuts">` with an `<h2>` in Instrument Serif and a `<dl>` of rows built from `KEY_BINDINGS`: the nine `reel` rows collapse into one `<kbd>1</kbd>–<kbd>9</kbd> open recording N`; every other binding one row `<kbd>{key display}</kbd> label` (display: `' '` → `Space`, `'Escape'` → `Esc`, `'?'` → `?`, letters uppercase); last two rows `<kbd>↑</kbd><kbd>↓</kbd> move in menus · <kbd>Enter</kbd> choose · <kbd>Esc</kbd> close` as static text; footer `press ? or Esc to close`.

- [ ] **Step 3: Wire the keyboard in `SimApp.tsx`**

```ts
useEffect(() => {
  const onKey = (e: KeyboardEvent) => {
    const el = e.target as Element | null
    const inMenu = !!el?.closest?.('[role="menu"],[role="dialog"]')
    if (inMenu && e.key !== 'Escape') return                         // Review Focus 5
    if (e.key === 'Escape' && (drawer || overlayOpen)) { setDrawer(null); setOverlayOpen(false); return }
    const a = actionForKey(e); if (!a) return
    if (a.action === 'togglePlay') e.preventDefault()
    runKey(a.action, a.arg, manifest)
  }
  document.addEventListener('keydown', onKey); return () => document.removeEventListener('keydown', onKey)
}, [manifest, drawer, overlayOpen])
```
`runKey` (A.12) already maps `escape` → `selectPeer(null)` + `setKeyHelp(false)`, `reset` → `reset()`, `toggleKeyHelp` → `setKeyHelp(!open)`, `fitView` → renderer `fitView()`, `reel` → `enterReel(manifest[arg])`, `backToLive` → `exitReel()`, `share` → `shareMoment()`, `toggleStage`/`toggleHero` → `setPref`. If phase 1 left any of those cases out of `runKey`, add them there (not in SimApp).

- [ ] **Step 4: Verify**

Run: `cd /home/yks/Projects/luminar/web && npx tsc --noEmit && npm run lint && npx vitest run`
Expected: green.

- [ ] **Step 5: Browser walk (desktop)**

1. Press `?`. Observe: a `role="dialog"` overlay with focus on `×`; rows rise in with 40 ms stagger; the list contains, in order: `Space play / pause`, `F fit view`, `Esc deselect / close`, `1–9 open recording N`, `0 back to live`, `S copy link to this moment`, `T stage theme`, `H hero layout`, `R reset`, `? this list` — every spec §6.2 shortcut. `Tab` cycles inside the dialog only. `Escape` closes and focus returns to the body/previous element. `?` again opens; `?` a third time closes (toggle).
2. Each key works from the page: `Space` → play/pause POSTs; `f` → canvas refits (viewport change); `Escape` with a selected peer → deselect + inspector closes; `1` → reel enters (pill `REEL · Sybil → Eclipse`); `0` → `LIVE`; `s` → toast `Link copied` and the clipboard holds the URL (`navigator.clipboard.readText()` under `evaluate_script` may need a permission; accept the toast); `t` → `data-stage="1"` on `<html>`; `h` → `data-hero="1"`; `r` → `POST /api/sim/reset` and the clock resets.
3. Focus the Admin token field (3.8) and type `?` then `f` then `Space`. Observe: no overlay, no fit, no play — the input swallows them.
4. Click the timeline range (reel mode), press `Space`. Observe: play toggles (range inputs are not typing targets).
5. Open `Inject fault ▾`, focus `Sybil attack`, press `Space`. Observe: the item activates (one `POST /api/fault/sybil`) and **no** `POST /api/sim/play`; press `Escape` inside a menu: the menu closes and focus returns to its trigger, nothing else happens. `Ctrl+1`/`Cmd+H` do nothing in the app.
6. Reduced-motion emulation: `?` rows appear without rise.

- [ ] **Step 6: Commit**

```bash
git add web/components/sim/Overlay.tsx web/components/sim/Overlay.module.css web/components/sim/KeyHelp.tsx web/components/sim/KeyHelp.module.css web/components/sim/SimApp.tsx
git commit -m "feat(web): keyboard wiring with r and ?, shortcut overlay, focus-trapped overlay primitive"
```

### Task 3.11: Responsive shell ≤ 1023 px — drawers, bottom sheet, `Menu +` overlay

**Files:**
- Modify: `web/components/sim/SimApp.tsx`, `web/components/sim/SimApp.module.css`, `web/components/sim/Toolbar.tsx`, `web/components/sim/Toolbar.module.css`, `web/components/sim/CommandStrip.tsx`, `web/components/sim/CommandStrip.module.css`, `web/components/sim/Inspector.module.css`, `web/components/sim/Menus.module.css`
- Test: browser walk at 390×844 and 820×1180

**Interfaces:**
- Consumes: `Overlay` (3.10); `MenuRow`, `scenarioRows`, `reelRows`, `faultRows`, `faultItems` (3.3) — the overlay renders the same `MenuRow[]` the popovers use, as plain staggered rows.
- Produces: `SIM_BREAKPOINT = 1023`; `SimApp` state `drawer: 'stats' | 'log' | null` and `overlayOpen`; `CommandStrip` props `onDrawer`; `Toolbar` prop `onMenu`.

- [ ] **Step 1: Shell CSS at `@media (max-width: 1023px)`**

Grid becomes `"toolbar" var(--toolbar-h) "canvas" 1fr / 1fr`; both rails `position: fixed; top: var(--toolbar-h); bottom: 0; width: min(var(--rail-l), 86vw)` (right rail `--rail-r`), `transform: translateX(-100%)` / `translateX(100%)`, `transition: transform var(--d-rail) var(--ease)`; `[data-open="true"]` → `translateX(0)`; a scrim `<button aria-label="Close panel">` over the canvas while a drawer is open (click → `setDrawer(null)`). Canvas full-bleed. Rails get `role="dialog" aria-modal` only while open (so `Overlay`'s focus rules are not needed: focus the rail's first control on open).

- [ ] **Step 2: Inspector as a bottom sheet**

In `Inspector.module.css` at ≤1023: `position: fixed; left: 0; right: 0; bottom: 0; top: auto; max-height: 70dvh; transform: translateY(100%)`; open → `translateY(0)`; a 44 px grab row at the top holding the `ESC` button (44 px hit target). The log drawer stays closed when the inspector opens from a canvas tap.

- [ ] **Step 3: Toolbar collapse**

≤1023: keep brand, pill and a `Menu +` button (`aria-expanded={overlayOpen}`, text toggles to `Menu ×`); hide badges, presets, clock and GitHub (`display: none`). The clock moves to the command strip's second row.

- [ ] **Step 4: Command strip two rows and drawer buttons**

≤1023: `width: calc(100% - 2 * var(--s-3)); bottom: var(--s-3); height: auto; grid-template-rows: auto auto`: row 1 Reset · Play · Scrubber · time; row 2 speed group · `Stats` and `Log` buttons (`onDrawer('stats' | 'log')`, `aria-expanded`) · the three menu triggers (popovers still work at this width; the overlay is the second route). Every control ≥ 44×44 px (`min-height: 44px; min-width: 44px`). The kbd hint row is hidden (`display: none`) below 1024 (no keyboard).

- [ ] **Step 5: `Menu +` overlay**

`<Overlay open={overlayOpen} onClose={() => setOverlayOpen(false)} title="Menu">` with four `<section>`s — `Scenarios`, `Reels`, `Faults`, `Presets` — each a serif `<h2>` and `data-row` rows (`<button>` 56 px tall, Instrument Serif at `--t-narr` for the name, mono aside) built from `scenarioRows(scenarios, activeId)`, `reelRows(manifest, reel?.name ?? null)`, `faultRows(faultItems(state, 5), 5)` and the preset arrays (`1m 2m 5m 10m` / `20 50 100 200`, `aria-pressed` as in the toolbar); selecting a row closes the overlay then runs the row's `onSelect`. Disabled fault rows render `aria-disabled` with their reason.

- [ ] **Step 6: Verify**

Run: `cd /home/yks/Projects/luminar/web && npx tsc --noEmit && npm run lint && npx vitest run`
Expected: green.

- [ ] **Step 7: Browser walk (phone 390×844, then tablet 820×1180)**

1. `resize_page` 390×844, reload `/sim/`. Observe: `document.documentElement.scrollWidth === 390` (no horizontal scroll); toolbar shows `LUMINAR`, the pill and `Menu +` only; canvas full-bleed; strip spans the width in two rows; every strip control's `getBoundingClientRect()` height ≥ 44 and width ≥ 44; no kbd hint row.
2. Tap `Stats`. Observe: left rail slides in over `--d-rail` (220 ms), scrim covers the canvas, the KPI grid is readable at 264 px; tap the scrim → closes. Tap `Log` → right rail slides from the right; `Escape` (hardware keyboard) closes it.
3. Tap a peer on the canvas. Observe: the inspector rises as a bottom sheet ≤ 70 % tall with a 44 px grab row and `ESC`; MESH/TOPOLOGY rows wrap; tap `ESC` → sheet drops.
4. Tap `Menu +`. Observe: full-screen overlay, button now reads `Menu ×`, four serif sections with staggered rows; `Reels` rows show `<kbd>` numbers and blurbs; `Faults` rows `Eclipse attack` / `Drop peer` disabled with reason; tap `Presets › 50` → overlay closes, `POST /api/sim/reconfigure`; reopen → `50` pressed. Tap `Reels › Sybil → Eclipse` → reel enters, pill `REEL · …`.
5. `Scenarios ▾` popover at 390: opens within the viewport (clamped 8 px from the edges), rows 44 px.
6. `resize_page` 820×1180. Observe: same drawer layout (≤1023); `resize_page` 1024×768: the three-column grid returns, rails inline, `Menu +` hidden, toolbar presets back.
7. Reduced-motion emulation at 390: drawers appear without the slide.

- [ ] **Step 8: Commit**

```bash
git add web/components/sim/SimApp.tsx web/components/sim/SimApp.module.css web/components/sim/Toolbar.tsx web/components/sim/Toolbar.module.css web/components/sim/CommandStrip.tsx web/components/sim/CommandStrip.module.css web/components/sim/Inspector.module.css web/components/sim/Menus.tsx web/components/sim/Menus.module.css
git commit -m "feat(web): responsive simulator shell with rail drawers, inspector bottom sheet and Menu + overlay"
```

### Task 3.12: Phase 3 gate — full parity walk and green builds

**Files:**
- Modify: none expected; fixes found by the walk are committed under their own task's scope.
- Test: the complete browser walk below plus the build commands.

**Interfaces:**
- Consumes: everything in 3.1–3.11, phases 0–2.

- [ ] **Step 1: Static checks**

Run: `cd /home/yks/Projects/luminar/web && npx tsc --noEmit && npm run lint && npx vitest run && npm run build`
Expected: all green; `web/out/sim/index.html` written; `npx vitest run` shows the six new test files (`timeline-marks`, `menu-keys`, `fault-items`, `spark`, `log-filter`, `inspector-peers`) passing alongside the phase-1 suite, including `lib/copy.test.ts` (no forbidden phrase crept into a component).

Run: `cd /home/yks/Projects/luminar && make check`
Expected: green for `frontend/` and `backend/`.

- [ ] **Step 2: Inventory walk at 1440×900 against `make backend`**

Walk inventory §1 (every toolbar row: brand, pill in all three states, TELEMETRY absent/present, MAINNET toggle, three menus, dropdown mechanics, both preset groups, clock, GitHub, reel dimming, toasts, kbd hint, focus rings visible on every control via Tab, reduced motion), §2 (every key), §3's token field, §6 (bar, Reset, Play/Pause with pause-at-limit, scrubber live-disabled / reel-enabled, wash bands, ticks, `cur / total`, speeds), §7 (each fault, scenario launch, presets), §8.1–§8.3, §8.5, §8.6 caption — each row's "Behaviour" column observed as described in Tasks 3.1–3.10's walks. Record any mismatch as a fix commit under the owning task's scope.

- [ ] **Step 3: The three toast states for every fault**

With the backend up (no token): Partition, Sybil, Eclipse (peer selected), Drop (peer selected), Clear all → five toasts ending `injected`. Restart as `LUMINAR_ADMIN_TOKEN=secret make backend`, set token `wrong` in settings → the same five toast `… failed · 403`. Stop the backend → the same five toast `backend offline`. No toast ever claims success on a failed POST.

- [ ] **Step 4: Eclipse in the inspector**

Launch `demo_sybil_eclipse`; at T+17 select `peer-10`; read four `eclipse-0 … eclipse-3` chips under MESH PEERS and honest `nN` chips under TOPOLOGY PEERS; badge `eclipse target`.

- [ ] **Step 5: Shortcut overlay**

Press `?`; confirm every §6.2 shortcut is listed and press each one from the page with the expected effect (Task 3.10 step 2).

- [ ] **Step 6: Phone walk at 390×844**

Repeat Task 3.11 step 1–4; confirm `scrollWidth === 390` on `/sim/` in live mode, with a drawer open, with the inspector sheet open and with the overlay open.

- [ ] **Step 7: Commit (only if fixes were needed)**

```bash
git add -A web/components/sim web/lib
git commit -m "fix(web): phase 3 parity walk findings"
```

---

### Phase 3 acceptance gate (spec §11, verbatim)

> ### Phase 3 — simulator shell and panels (27–29 Oct, 2 days)
>
> Checklist, in the order a demo uses them: toolbar, command strip (live scrubber disabled, reel
> ticks/bands), menus (popover, fault menu with N stepper, partition by layout side, disabled
> items with reasons), toast queue reflecting `{ok}`, presets, stats rail (KPIs + sparklines,
> state strip, counts, messages, CDF, beats click→seek/highlight, categories, infra), log rail
> (gap indicator, chips, rows, click opens inspector), inspector (mesh vs topology peers, WHY
> line), legend + settings (all-labels, admin token), narrator caption, keyboard incl. `r` and
> `?`, drawers and bottom sheet ≤1023 px, nav overlay at phone width.
> Acceptance: full browser walk of inventory §1–§3, §6–§8 against the live backend at 1440×900
> and 390×844 (no horizontal scroll at 390); inject each fault with the backend up (toast
> `injected`) and with the admin token wrong (toast `failed · 401/403`) and with the backend down
> (toast `backend offline`); select an eclipsed peer and read four `eclipse-*` chips under MESH
> PEERS while TOPOLOGY PEERS still lists honest ids; the `?` overlay lists every shortcut in
> §6.2 and each one works.

> Every phase ends with `cd web && npx tsc --noEmit && npm run lint && npm run build` green and
> `make check` still green for `frontend/` and `backend/`.

---

## Phase 4 — reels, stage, hero (29–30 Oct, 1 day; parity freeze at the end)

**Goal:** Pre-rendered `/reels/<name>/` routes that play the four recordings with no backend and no socket, `?t=`/`?peer=` moments and the share key, `data-stage` scaling by tokens (no `zoom`) with the renderer scale override, and the `data-hero` broadcast view with the 56 px lower-third ticker — ending in the spec's offline acceptance gate and the parity freeze.

**Review focus pinned in this phase** (each line names the task whose test covers it):

1. **Priming snapshot before `setReel`**: `loadReel` dispatches the first snapshot while `store.reel` is still null, so the recording's `state: 'running'` would set `playing = true` with nothing playing and the pill would read `OFFLINE` for the whole 7 MB load — `enterReel` sets a provisional reel first; test in Task 4.2.
2. **Unmount or `0` during the load**: the pending fetch must be aborted and the aborted `loadReel` must not trigger `exitReel()` (which would navigate away from a page the user already left or, worse, from the live page) — test in Task 4.2.
3. **`?peer=` names a node that exists only after the `?t=` seek** (`sybil-0` is absent from the first snapshot): `applyUrlMoment` applies `t` before `peer`, so `?t=12.4&peer=sybil-0` selects — test in Task 4.5.
4. **Prefs mirror vs moment params**: `persistPrefs` must not drop `?t`/`?peer`, and `syncUrlMoment` must not drop `theme`/`hero` — test in Task 4.5.
5. **Real reel: `telemetry_status` with `mainnet.enabled` lands before the snapshot that carries observers** (seek dispatch order edges → scenario → telemetry_status → snapshot): auto-Geo must wait for `geoAvailable`, and fire once — test in Task 4.6.

### Task 4.1: Reel assets and the manifest module

**Files:**
- Create: `web/public/reels/*.jsonl` + `manifest.json`, `web/public/geo/land-110m.json` (copied), `web/lib/reels.ts`
- Test: `web/lib/reels.test.ts`

**Interfaces:**
- Consumes: `ReelManifest`, `ReelMeta` (`@/lib/types`).
- Produces: `REEL_MANIFEST`, `CARRY_KEYS`, `carryParams`, `reelHref`, `liveHref`, `redirectTarget`, `loadLabel` (A.29).

- [ ] **Step 1: Copy the assets**

Run: `cp -rn /home/yks/Projects/luminar/frontend/public/reels /home/yks/Projects/luminar/frontend/public/geo /home/yks/Projects/luminar/web/public/ && du -sh /home/yks/Projects/luminar/web/public/reels /home/yks/Projects/luminar/web/public/geo`
Expected: `17M reels`, `88K geo`; `git status` shows three new `.jsonl` (`sybil-eclipse.jsonl` and `manifest.json` exist since Task 3.3) and `land-110m.json` (git stores the identical blobs once; no repository growth).

- [ ] **Step 2: Write the failing tests**

```ts
// web/lib/reels.test.ts
import { existsSync } from 'node:fs'; import { join } from 'node:path'
import { REEL_MANIFEST, carryParams, reelHref, liveHref, redirectTarget, loadLabel } from '@/lib/reels'
test('manifest has the four reels and every file is in public/', () => {
  expect(REEL_MANIFEST.map(r => r.name)).toEqual(['sybil-eclipse', 'partition-heal', 'healthy-publish', 'mainnet-block-wave'])
  expect(REEL_MANIFEST[3].real).toBe(true); expect(REEL_MANIFEST[0].title).toBe('Sybil → Eclipse')
  for (const r of REEL_MANIFEST) expect(existsSync(join(__dirname, '../public', r.file))).toBe(true)
  expect(existsSync(join(__dirname, '../public/geo/land-110m.json'))).toBe(true)
})
test('hrefs and carried params keep the spec order theme, hero, t, peer', () => {
  expect(reelHref('mainnet-block-wave')).toBe('/reels/mainnet-block-wave/')
  expect(carryParams('?peer=sybil-0&foo=1&theme=stage&t=12.4').toString()).toBe('theme=stage&t=12.4&peer=sybil-0')
  expect(reelHref('sybil-eclipse', carryParams('?theme=stage&hero=1'))).toBe('/reels/sybil-eclipse/?theme=stage&hero=1')
  expect(liveHref(carryParams('?hero=1&t=3', ['theme', 'hero']))).toBe('/sim/?hero=1')
})
test('redirectTarget', () => {
  expect(redirectTarget('?reel=sybil-eclipse&theme=stage&hero=1')).toBe('/reels/sybil-eclipse/?theme=stage&hero=1')
  expect(redirectTarget('?reel=sybil-eclipse&t=12.4&peer=sybil-0&foo=1')).toBe('/reels/sybil-eclipse/?t=12.4&peer=sybil-0')
  expect(redirectTarget('?theme=stage')).toBeNull(); expect(redirectTarget('?reel=nope')).toBeNull(); expect(redirectTarget('')).toBeNull()
})
test('loadLabel', () => {
  expect(loadLabel({ loaded: 2_100_000, total: 3_500_000 })).toBe('2.1 / 3.5 MB · 60%')
  expect(loadLabel({ loaded: 2_100_000, total: 0 })).toBe('2.1 MB'); expect(loadLabel(null)).toBe('')
})
```

- [ ] **Step 3: Run to verify failure**

Run: `cd /home/yks/Projects/luminar/web && npx vitest run lib/reels.test.ts`
Expected: FAIL — `Cannot find module '@/lib/reels'`.

- [ ] **Step 4: Implement `web/lib/reels.ts`** with the signatures in the table. `import manifest from '@/public/reels/manifest.json'` cast to `ReelManifest` (tsconfig already has `resolveJsonModule`; if the `@/public/*` alias is not resolved by vitest, add `public` to the `@` alias root in `vitest.config.ts` — the alias is `__dirname`, so `@/public/...` already resolves).

- [ ] **Step 5: Run to verify pass**

Run: `cd /home/yks/Projects/luminar/web && npx vitest run lib/reels.test.ts && npx tsc --noEmit`
Expected: 4 passed; tsc clean.

- [ ] **Step 6: Commit**

```bash
git add web/public/reels web/public/geo web/lib/reels.ts web/lib/reels.test.ts
git commit -m "feat(web): copy reels and geo into public/, manifest module with reel hrefs and redirect target"
```

### Task 4.2: Boot in reel or live mode — `bootSim`, `teardownSim`, provisional reel

**Files:**
- Modify: `web/lib/actions.ts` (`enterReel`, `exitReel`, new `bootSim`, `teardownSim`, `openReel`, `runKey` reel/backToLive branches)
- Modify: `web/components/sim/SimApp.tsx` (accept `SimAppProps`; mount effect calls `bootSim`, cleanup `teardownSim`)
- Test: `web/lib/actions.test.ts` (append)

**Interfaces:**
- Consumes: `loadReel(meta, { signal })`, `unloadReel`, `seekReelToSimTime` (A.10); `ws.connect/disconnect` (A.9); `fetchTopology`, `fetchScenarios`, `applyUrlMoment`, `exitReel` (A.12); `useStore.setReel`, `selectPill` (A.11); `reelHref`, `liveHref`, `carryParams`, `REEL_MANIFEST` (4.1).
- Produces: `bootSim`, `teardownSim`, `openReel`, amended `enterReel`/`exitReel`/`runKey` (A.29); `SimAppProps`.

- [ ] **Step 1: Write the failing tests** (`vi.mock('@/lib/api/websocket')`, `vi.mock('@/lib/api/replay')`, `vi.mock('@/lib/api/client')`, `vi.mock('@/components/map/renderer')`; `const meta = REEL_MANIFEST[0]`)

```ts
test('enterReel sets a provisional reel before the file loads, so the pill reads REEL and the guards hold', async () => {
  let during: ReturnType<typeof selectPill> | null = null; let seenSignal: AbortSignal | undefined
  vi.mocked(loadReel).mockImplementation(async (_m, opts) => { seenSignal = opts?.signal; during = selectPill(useStore.getState()); return true })
  await enterReel(meta)
  expect(during).toBe('reel'); expect(seenSignal).toBeInstanceOf(AbortSignal); expect(ws.disconnect).toHaveBeenCalled()
  expect(useStore.getState().reel).toMatchObject({ name: 'sybil-eclipse', title: 'Sybil → Eclipse' })
})
test('teardownSim aborts a pending load and the aborted load does not exitReel', async () => {
  vi.mocked(loadReel).mockImplementation(async (_m, opts) => new Promise(res => opts!.signal!.addEventListener('abort', () => res(false))))
  const p = bootSim({ reel: meta, search: '' }); teardownSim(); await p
  expect(unloadReel).toHaveBeenCalled(); expect(ws.connect).not.toHaveBeenCalled(); expect(location.pathname).not.toBe('/sim/')
})
test('bootSim in reel mode never opens the socket or calls the API, and applies the moment after load', async () => {
  vi.mocked(loadReel).mockImplementation(async () => { useStore.getState().applySnapshot(snapWith(['peer-0', 'sybil-0'])); return true })
  await bootSim({ reel: meta, search: '?t=12.4&peer=sybil-0' })
  expect(ws.connect).not.toHaveBeenCalled(); expect(client.scenariosList).not.toHaveBeenCalled(); expect(client.simSnapshot).not.toHaveBeenCalled()
  expect(seekReelToSimTime).toHaveBeenCalledWith(12.4); expect(useStore.getState().selectedPeer).toBe('sybil-0')
})
test('bootSim live connects, fetches topology and scenarios, applies ?peer', async () => {
  client.simSnapshot.mockResolvedValue({ ok: true, status: 200, data: snapWith(['peer-0']) }); client.topologyEdges.mockResolvedValue({ ok: true, status: 200, data: { edges: [] } }); client.scenariosList.mockResolvedValue({ ok: true, status: 200, data: { scenarios: [] } })
  await bootSim({ reel: null, search: '?peer=peer-0' })
  expect(ws.connect).toHaveBeenCalledTimes(1); expect(client.scenariosList).toHaveBeenCalled(); expect(useStore.getState().selectedPeer).toBe('peer-0'); expect(loadReel).not.toHaveBeenCalled()
})
test('bootSim live with the backend down: no throw, defaults kept, pill OFFLINE, no toast, socket still asked to connect (global review focus 1)', async () => {
  const down = { ok: false, status: 0, data: null }; client.simSnapshot.mockResolvedValue(down); client.topologyEdges.mockResolvedValue(down); client.scenariosList.mockResolvedValue(down)
  await expect(bootSim({ reel: null, search: '' })).resolves.toBeUndefined()
  expect(ws.connect).toHaveBeenCalledTimes(1); expect(useStore.getState().nodes).toEqual([]); expect(useStore.getState().scenarios).toEqual([]); expect(useStore.getState().toasts).toEqual([]); expect(selectPill(useStore.getState())).toBe('offline')
})
test('runKey reel N navigates to the reel route carrying theme/hero; past the last reel is a no-op; 0 leaves a reel page for /sim/', () => {
  const assign = vi.fn(); vi.stubGlobal('location', { ...location, pathname: '/reels/sybil-eclipse/', search: '?theme=stage&t=3', assign })
  runKey('reel', 3); expect(assign).toHaveBeenCalledWith('/reels/mainnet-block-wave/?theme=stage')
  runKey('reel', 4); expect(assign).toHaveBeenCalledTimes(1)
  runKey('backToLive'); expect(assign).toHaveBeenLastCalledWith('/sim/?theme=stage')
})
```

- [ ] **Step 2: Run to verify failure**

Run: `cd /home/yks/Projects/luminar/web && npx vitest run lib/actions.test.ts`
Expected: FAIL — `bootSim is not a function` (and the provisional-reel assertion fails on the existing `enterReel`).

- [ ] **Step 3: Implement in `web/lib/actions.ts`**

- `enterReel(meta)`: `ws.disconnect()`; mainnet null; `renderer.resetTopology()`; `useStore.getState().setReel({ name: meta.name, title: meta.title, durationMs: 0, durationSim: 0 })`; module-level `loadAbort = new AbortController()`; `const ok = await loadReel(meta, { signal })`; `if (!ok && !signal.aborted) exitReel()`; return `ok`.
- `exitReel()`: `loadAbort?.abort()`; `unloadReel()`; `setReel(null)`; mainnet null; `resetTopology()`; then `if (location.pathname.startsWith('/reels/')) location.assign(liveHref(carryParams(location.search, ['theme', 'hero']))) else ws.connect()`.
- `bootSim({ reel, search })`: reel → `if (await enterReel(reel)) applyUrlMoment(new URLSearchParams(search))`; live → `ws.connect(); await fetchTopology(); applyUrlMoment(new URLSearchParams(search)); void fetchScenarios()` — both fetches swallow `{ok:false}` (no toast, no throw; the pill reports the outage).
- `teardownSim()`: `loadAbort?.abort(); ws.disconnect(); unloadReel()`.
- `openReel(name)` and the `runKey` branches per A.0.
- `SimApp.tsx`: `export default function SimApp({ reel = null }: SimAppProps)`; `useEffect(() => { void bootSim({ reel, search: location.search }); return teardownSim }, [reel?.name])` (replaces phase 1's connect/disconnect effect).

- [ ] **Step 4: Run to verify pass**

Run: `cd /home/yks/Projects/luminar/web && npx vitest run lib/actions.test.ts && npx tsc --noEmit && npm run lint`
Expected: all passed; tsc and lint clean.

- [ ] **Step 5: Commit**

```bash
git add web/lib/actions.ts web/lib/actions.test.ts web/components/sim/SimApp.tsx
git commit -m "feat(web): bootSim/teardownSim choose reel or live, provisional reel state, abortable reel load"
```

### Task 4.3: The `/reels/[name]/` route and the dithered progress bar

**Files:**
- Create: `web/app/reels/[name]/page.tsx`, `web/components/sim/ReelProgress.tsx`, `web/components/sim/ReelProgress.module.css`
- Modify: `web/components/sim/SimApp.tsx` (render `<ReelProgress title={reel.title} />` over the canvas when `reel` prop set)
- Test: browser walk (below) + build output check

**Interfaces:**
- Consumes: `REEL_MANIFEST`, `loadLabel` (4.1); `SimAppProps` (4.2); `useStore(s => s.reelLoad)` (A.11).
- Produces: `ReelProgress` (A.29); static pages `web/out/reels/<name>/index.html` ×4.

- [ ] **Step 1: Write `web/app/reels/[name]/page.tsx`**

```ts
export const dynamicParams = false
export function generateStaticParams() { return REEL_MANIFEST.map(r => ({ name: r.name })) }
export async function generateMetadata({ params }: { params: Promise<{ name: string }> }): Promise<Metadata>   // title `${meta.title} · Luminar`, description meta.blurb
export default async function ReelPage({ params }: { params: Promise<{ name: string }> })   // notFound() when unknown; <SimApp reel={meta} /> (SimApp is 'use client'; ReelMeta is serialisable — no SimShell, A.0)
```

- [ ] **Step 2: Write `ReelProgress.tsx` (+ module css)** per A.29. Progress bar: container 320 px wide centred over the canvas, label row `--t-label` uppercase paper-2 above, track 12 px with `border: 1px solid var(--hair)`, fill `background: var(--dither-50); width: ${pct}%` (pct = `total ? loaded / total * 100 : 100`), `transition: width var(--d-fast)`. `web/app/sim/page.tsx` keeps rendering `<SimApp />` (the pill stays server-rendered).

- [ ] **Step 3: Build and check the export**

Run: `cd /home/yks/Projects/luminar/web && npx tsc --noEmit && npm run lint && npm run build && ls out/reels && grep -o '<title>[^<]*</title>' out/reels/sybil-eclipse/index.html out/reels/mainnet-block-wave/index.html`
Expected: `healthy-publish  mainnet-block-wave  partition-heal  sybil-eclipse`; titles `Sybil → Eclipse · Luminar` and `Mainnet block wave (real) · Luminar`; no `useSearchParams` export error.

- [ ] **Step 4: Browser walk (dev server, no backend)**

Run: `cd /home/yks/Projects/luminar/web && npm run dev` (make sure nothing listens on :8000; see memory note: kill the listener only).
1. Open `http://localhost:3000/reels/sybil-eclipse/`. Expect: within the first second a centred 12 px bar whose dithered fill widens left→right under the label `REEL · SYBIL → ECLIPSE · 1.2 / 3.5 MB · 34%` (numbers vary); the mesh appears (priming) before the bar completes.
2. When the bar disappears: pill reads `REEL · Sybil → Eclipse` with a paper square, no `LIVE`; presets, Scenarios and Inject fault are dimmed to .5; the scrubber total reads `40.5s` (±0.5); clock `T+ 0.0s`; nothing plays.
3. DevTools Network: no request to `/ws/events`, none to `/api/*`; exactly one `sybil-eclipse.jsonl`.
4. Press `Space`: plays; at ~T+10 five flame diamonds appear; at the end (≈T+40) the clock stops and the Play glyph returns.
5. Press `Space` again: restarts from 0 (play from the end seeks to 0).
6. Open `http://localhost:3000/reels/mainnet-block-wave/`: bar reaches 100 % on the 6.8 MB file; observers appear while the bar is still visible.
7. Open `http://localhost:3000/reels/does-not-exist/`: the 404 page.

- [ ] **Step 5: Commit**

```bash
git add web/app/reels web/components/sim/ReelProgress.tsx web/components/sim/ReelProgress.module.css web/components/sim/SimApp.tsx
git commit -m "feat(web): pre-rendered /reels/[name]/ route with dithered load progress"
```

### Task 4.4: Redirects for old links, reel keys and menu rows

**Files:**
- Create: `web/components/sim/ReelRedirect.tsx`
- Modify: `web/app/page.tsx`, `web/app/sim/page.tsx` (render `<ReelRedirect />` first), `web/components/sim/Menus.tsx` (Reels rows → `openReel(r.name)`; `0 Back to live` → `exitReel()`), `web/components/sim/Toolbar.tsx` only if its MAINNET click lacks `reelGuard`
- Test: `web/lib/reels.test.ts` (already covers `redirectTarget`); browser walk

**Interfaces:**
- Consumes: `redirectTarget` (4.1), `openReel`, `exitReel`, `runKey` (4.2), `toggleMainnet` (A.12).
- Produces: `ReelRedirect`.

- [ ] **Step 1: Write `ReelRedirect.tsx`** per A.29 (`'use client'`, effect with `location.replace`, returns `null`). Mount it as the first child of `/` and `/sim/` pages. Change the two Menus handlers.

- [ ] **Step 2: Typecheck and lint**

Run: `cd /home/yks/Projects/luminar/web && npx tsc --noEmit && npm run lint && npx vitest run`
Expected: clean; all tests pass.

- [ ] **Step 3: Browser walk (dev server; backend down for 1–4, up for 5–6)**

1. Open `http://localhost:3000/?reel=sybil-eclipse&theme=stage&hero=1`. Expect: URL becomes `/reels/sybil-eclipse/?theme=stage&hero=1`; reel loads.
2. Open `http://localhost:3000/sim/?reel=mainnet-block-wave&t=20&peer=obs-x`. Expect: `/reels/mainnet-block-wave/?t=20&peer=obs-x`.
3. On `/reels/sybil-eclipse/` press `2`, then `3`, then `4`: URL walks to `/reels/partition-heal/`, `/reels/healthy-publish/`, `/reels/mainnet-block-wave/`; `5` does nothing. Press `0`: `/sim/`, pill `OFFLINE` (backend down), no uncaught exception in the console (only the browser's own `WebSocket connection … failed` lines and `/api/*` 404s).
4. Open `Reels ▾` on `/sim/`: four rows with `<kbd>N</kbd>`, title, blurb inline, `REAL` tag on the fourth; click the first → `/reels/sybil-eclipse/`. In the reel, `Reels ▾` → `0 Back to live` → `/sim/`.
5. `make backend`, reload `/sim/`: pill `LIVE`. Press `1`: `/reels/sybil-eclipse/`; DevTools shows the `/ws/events` socket closed and not reopened. In the reel click `MAINNET`, a scenario, `Inject fault ▾ › Sybil`, preset `100`: each shows the toast `Press 0 to leave the reel first`, no `/api/*` request.
6. Press `0`: `/sim/` reconnects (`LIVE`) and the node count is the backend's.

- [ ] **Step 4: Commit**

```bash
git add web/components/sim/ReelRedirect.tsx web/app/page.tsx web/app/sim/page.tsx web/components/sim/Menus.tsx
git commit -m "feat(web): ?reel= redirects to /reels/<name>/, reel keys and menu rows navigate by route"
```

### Task 4.5: Moments — `?t=`, `?peer=`, share, and the prefs mirror

**Files:**
- Modify: `web/lib/actions.ts` (`initUrlMoment`; confirm `applyUrlMoment` order t → peer and `shareMoment` toast text), `web/components/sim/SimApp.tsx` (mount `initUrlMoment()` beside `bootSim`)
- Test: `web/lib/actions.test.ts` (append), `web/lib/prefs.test.ts` (append)

**Interfaces:**
- Consumes: `syncUrlMoment`, `applyUrlMoment`, `shareMoment` (A.12); `persistPrefs` (A.13); `copy` has no share string — toast text is `Link copied` (inventory §10 Moments).
- Produces: `initUrlMoment`.

- [ ] **Step 1: Write the failing tests**

```ts
// actions.test.ts
test('applyUrlMoment seeks before selecting, so a peer that appears after the seek is selectable', () => {
  useStore.setState({ reel: { name: 'r', title: 'R', durationMs: 1, durationSim: 1 } })
  vi.mocked(seekReelToSimTime).mockImplementation(() => useStore.getState().applySnapshot(snapWith(['peer-0', 'sybil-0'])))
  applyUrlMoment(new URLSearchParams('t=12.4&peer=sybil-0'))
  expect(seekReelToSimTime).toHaveBeenCalledWith(12.4); expect(useStore.getState().selectedPeer).toBe('sybil-0')
})
test('syncUrlMoment writes ?t only while a reel is paused and keeps theme/hero', () => {
  history.replaceState(null, '', '/reels/sybil-eclipse/?theme=stage&hero=1')
  useStore.setState({ reel: { name: 'r', title: 'R', durationMs: 1, durationSim: 1 }, playing: false, simTime: 12.4 }); useStore.getState().applySnapshot(snapWith(['sybil-0'])); useStore.getState().selectPeer('sybil-0')
  syncUrlMoment(); expect(location.search).toBe('?theme=stage&hero=1&peer=sybil-0&t=12.4')
  useStore.setState({ playing: true }); syncUrlMoment(); expect(location.search).toBe('?theme=stage&hero=1&peer=sybil-0')
  useStore.setState({ reel: null, playing: false }); syncUrlMoment(); expect(location.search).not.toContain('t=')
})
test('initUrlMoment mirrors selection and pause changes to the URL', () => {
  history.replaceState(null, '', '/reels/sybil-eclipse/'); const off = initUrlMoment()
  useStore.getState().applySnapshot(snapWith(['peer-3'])); useStore.getState().selectPeer('peer-3'); expect(location.search).toBe('?peer=peer-3')
  useStore.getState().selectPeer(null); expect(location.search).toBe(''); off()
})
test('shareMoment copies the current href and toasts Link copied', async () => {
  const writeText = vi.fn(async () => {}); vi.stubGlobal('navigator', { clipboard: { writeText } })
  await shareMoment(); expect(writeText).toHaveBeenCalledWith(location.href); expect(useStore.getState().toasts.at(-1)?.text).toBe('Link copied')
})
test('without navigator.clipboard (http on the venue LAN) shareMoment prompts with the href and still toasts; an unknown ?peer= is ignored (global review focus 5)', async () => {
  vi.stubGlobal('navigator', {}); const prompt = vi.fn(); vi.stubGlobal('prompt', prompt)
  await shareMoment(); expect(prompt).toHaveBeenCalledWith('Copy this link', location.href); expect(useStore.getState().toasts.at(-1)?.text).toBe('Link copied')
  useStore.getState().applySnapshot(snapWith(['peer-0'])); expect(() => applyUrlMoment(new URLSearchParams('peer=ghost'))).not.toThrow(); expect(useStore.getState().selectedPeer).toBeNull()
})
// prefs.test.ts
test('persistPrefs keeps ?t and ?peer', () => {
  history.replaceState(null, '', '/reels/sybil-eclipse/?t=12.4&peer=sybil-0')
  persistPrefs({ stageTheme: true, hero: false }); expect(location.search).toBe('?t=12.4&peer=sybil-0&theme=stage')
  persistPrefs({ stageTheme: false, hero: true }); expect(location.search).toBe('?t=12.4&peer=sybil-0&hero=1')
})
```

- [ ] **Step 2: Run to verify failure**

Run: `cd /home/yks/Projects/luminar/web && npx vitest run lib/actions.test.ts lib/prefs.test.ts`
Expected: FAIL — `initUrlMoment is not a function`; any ordering/param-dropping failure in the others is a real defect in Task 1.9's code — fix it in `actions.ts`/`prefs.ts`.

- [ ] **Step 3: Implement** `initUrlMoment()` (`useStore.subscribe` with a selector on `[selectedPeer, playing]`, call `syncUrlMoment()` on change; return the unsubscribe) and mount it in `SimApp`'s effect; fix anything Step 2 exposed.

- [ ] **Step 4: Run to verify pass**

Run: `cd /home/yks/Projects/luminar/web && npx vitest run && npx tsc --noEmit && npm run lint`
Expected: all green.

- [ ] **Step 5: Browser walk (dev server, no backend)**

1. Open `http://localhost:3000/reels/sybil-eclipse/?t=12.4&peer=sybil-0`. Expect: paused at `T+ 12.4s`–`12.9s` (first snapshot ≥ 12.4), a hollow dashed diamond `sybil-0` carries the selection reticle, the inspector header shows `sybil-0` with badge `attacker` and Score `< 0` in flame; URL unchanged.
2. Press `s`: toast `Link copied`; paste into a new tab → same frame, same selection.
3. Press `Space`, then `Space`: URL gains `t=<paused time>`; while playing `t=` is absent.
4. Click an honest peer: `peer=` changes; press `Escape`: `peer=` removed; `t=` still present (paused).
5. Press `t`: URL gains `theme=stage` and keeps `t`/`peer`; press `t` again: `theme` removed, `t`/`peer` kept.

- [ ] **Step 6: Commit**

```bash
git add web/lib/actions.ts web/lib/actions.test.ts web/lib/prefs.ts web/lib/prefs.test.ts web/components/sim/SimApp.tsx
git commit -m "feat(web): URL moments mirrored from the store, share key, prefs mirror keeps t/peer"
```

### Task 4.6: The real reel — auto-Geo once and the `recorded` provenance

**Files:**
- Modify: `web/components/sim/Provenance.tsx` (kicker `RECORDED MAINNET` + `recorded` when `reel` is set), `web/lib/actions.ts` (only if the test below fails — `initAutoGeo` exists since Task 2.7)
- Test: `web/lib/actions.test.ts` (append); browser walk

**Interfaces:**
- Consumes: `dispatchFrame`, `flushEvents` (A.8); `maybeAutoGeo`, `setLayoutMode` (A.11/A.12); `copy.PROVENANCE`.
- Produces: the recorded provenance variant; the frame-order guarantee of `initAutoGeo` (A.29).

- [ ] **Step 1: Write the failing test**

```ts
test('initAutoGeo waits for observers, switches to geo once, and re-arms when the feed goes off', () => {
  const off = initAutoGeo()
  const obs = { peer_id: 'obs-1', index: 0, state: 'idle' as const, connected_peers: [], is_real: true, x: 10, y: -25, messages_sent: 0, messages_received: 0, gossip_score: 0 }
  dispatchFrame({ type: 'telemetry_status', active: false, peer_count: 0, peers: [], mainnet: { enabled: true, observers: 138, slot: 15466393 } })
  expect(useStore.getState().layoutMode).toBe('force')                        // no observers yet
  dispatchFrame({ ...snapWith([]), type: 'snapshot', nodes: [obs] }); expect(useStore.getState().layoutMode).toBe('geo'); expect(useStore.getState().layoutBeforeGeo).toBe('force')
  useStore.getState().setLayoutMode('radial'); dispatchFrame({ ...snapWith([]), type: 'snapshot', nodes: [obs] }); expect(useStore.getState().layoutMode).toBe('radial')   // once per feed-on
  dispatchFrame({ type: 'telemetry_status', active: false, peer_count: 0, peers: [], mainnet: { enabled: false, observers: 0 } })
  dispatchFrame({ type: 'telemetry_status', active: false, peer_count: 0, peers: [], mainnet: { enabled: true, observers: 138 } }); expect(useStore.getState().layoutMode).toBe('geo'); off()
})
```

- [ ] **Step 2: Run to verify failure**

Run: `cd /home/yks/Projects/luminar/web && npx vitest run lib/actions.test.ts -t initAutoGeo`
Expected: PASS if Task 2.7's subscription already handles `telemetry_status` landing before the observer snapshot; a FAIL is a defect in `initAutoGeo` — fix it in `actions.ts`, not in a component.

- [ ] **Step 3: Fix `initAutoGeo()` only if Step 2 failed** (A.29 pins the subscription; the store already re-arms `geoAutoDone` when the feed goes off, Task 1.5), then update `Provenance.tsx` so the kicker is `useStore(s => s.reel) ? 'RECORDED MAINNET' : 'LIVE MAINNET'` and the lag cell `recorded` vs `T−${lag_s ?? 156}s`; the trailing sentence is `copy.PROVENANCE` unchanged.

- [ ] **Step 4: Run to verify pass**

Run: `cd /home/yks/Projects/luminar/web && npx vitest run && npx tsc --noEmit && npm run lint`
Expected: all green.

- [ ] **Step 5: Browser walk (dev server, no backend)**

1. Open `http://localhost:3000/reels/mainnet-block-wave/`. Expect: after load the mode switcher reads `GEO` active, the dithered world land is drawn, only observer double rings are visible (no sim peers), and the provenance card top-left reads `RECORDED MAINNET` · `slot 15466393 · recorded · <n> observers · arrival at observer nodes, not mesh paths · data: ethPandaOps (CC BY 4.0)`.
2. Click `FORCE`: the card gains `· shown on the Geo layout`; press `Space` and play 10 s: no auto-switch back to Geo (once per feed-on).
3. Press `0` → `/sim/`: the provenance card is gone, `GEO` tab disabled with its reason tooltip.

- [ ] **Step 6: Commit**

```bash
git add web/lib/actions.ts web/lib/actions.test.ts web/components/sim/Provenance.tsx
git commit -m "feat(web): auto-Geo once per feed-on from a store subscription, recorded provenance in real reels"
```

### Task 4.7: Stage — `data-stage` by tokens, renderer scale override, persistence

**Files:**
- Modify: `web/components/sim/SimApp.tsx` (mount `initPrefs()` first in the effect), `web/app/globals.css` (confirm the `tokens.css` stage block is present verbatim; add nothing to it), `web/components/map/renderer.ts` only if the atlas/palette does not already rebuild on `data-stage`
- Test: `web/lib/prefs.test.ts` (append); browser walk

**Interfaces:**
- Consumes: `initPrefs`, `loadPrefs`, `applyDomPrefs`, `persistPrefs` (A.13); `setPref`, `STAGE_SCALE`, `BASE_SCALE` (A.11); `refreshPalette` (A.15); `buildAtlas` rebuild rule (A.16).
- Produces: nothing new; the stage contract becomes observable.

- [ ] **Step 1: Write the failing test**

```ts
test('initPrefs: URL wins, store scale follows, DOM and storage mirror, key t toggles', () => {
  localStorage.setItem('luminar.prefs', JSON.stringify({ stageTheme: false, hero: true })); history.replaceState(null, '', '/sim/?theme=stage')
  const off = initPrefs()
  expect(useStore.getState().stageTheme).toBe(true); expect(useStore.getState().hero).toBe(true); expect(useStore.getState().scale).toEqual({ node: 1.4, particle: 1.8, edgeAlpha: 1.6 })
  expect(document.documentElement.dataset.stage).toBe('1'); expect(document.documentElement.dataset.hero).toBe('1')
  expect(JSON.parse(localStorage.getItem('luminar.prefs')!)).toEqual({ stageTheme: true, hero: true })      // storage caught up with the URL
  runKey('toggleStage'); expect(document.documentElement.dataset.stage).toBeUndefined(); expect(location.search).toBe('?hero=1'); expect(useStore.getState().scale).toEqual({ node: 1, particle: 1, edgeAlpha: 1 }); off()
})
```

- [ ] **Step 2: Run to verify failure**

Run: `cd /home/yks/Projects/luminar/web && npx vitest run lib/prefs.test.ts`
Expected: FAIL on the storage line if `initPrefs` subscribes after the initial `setPref` without persisting once (A.13 as pinned); otherwise PASS already — then only the walk remains.

- [ ] **Step 3: Implement** — in `initPrefs()` call `persistPrefs(p); applyDomPrefs(p)` once after the two `setPref` calls, before subscribing. Mount `initPrefs()` as the first line of `SimApp`'s effect (before `bootSim`) so `data-stage` is on `<html>` before the renderer's first `refreshPalette()`.

- [ ] **Step 4: Run to verify pass**

Run: `cd /home/yks/Projects/luminar/web && npx vitest run && npx tsc --noEmit && npm run lint && grep -rn "zoom:" app components | grep -v "zoom: 1;" ; echo "grep exit $?"`
Expected: tests green; the grep prints nothing (`grep exit 1`) — no CSS `zoom` in the app.

- [ ] **Step 5: Browser walk (dev server, backend up, 1440×900)**

1. Open `http://localhost:3000/sim/`. In the console: `getComputedStyle(document.documentElement).getPropertyValue('--t-ui').trim()` → `clamp(13px, 0.95vw, 14.5px)`; a log row is 22 px tall (`getBoundingClientRect` of a `.row`/log row).
2. Press `t`. Expect: `document.documentElement.dataset.stage === '1'`; `--t-ui` → `16px`, `--row-h` → `26px`, `--cell-mesh` → `3px`; log rows 26 px; labels (`--fg-3`) visibly brighter; hairlines stronger; mesh links brighter; the toolbar `gossipsub v1.1` sub-label still present (it is not hidden by `zoom` any more and must stay legible). URL has `theme=stage`; `localStorage['luminar.prefs']` = `{"stageTheme":true,"hero":false}`.
3. Canvas: nodes are 1.4× (compare a disc's on-screen diameter before/after with a screenshot zoom — ≈ 14 px → ≈ 20 px at zoom 1), score halos are re-dithered at 3 px cells (no soft edges), node labels 12 px (`curl` the TextLayer size via `window.__luminar.getViewState()` is not needed; measure a label glyph height in a screenshot: ≈ 9 px cap height vs 7.5 px).
4. `curl -s -X POST localhost:8000/api/fault/sybil -H 'content-type: application/json' -d '{"n_attackers":5,"target_topic":"lumina/blocks/1.0"}'`: particles are 1.8× squares (4 px → 7 px), attack links brighter (`edgeAlpha` 1.6).
5. Reload: stage persists from storage. Open `/sim/?theme=off`: stage off, storage updated to `false`. Legend › gear › `Stage T` switch mirrors the state and toggles it.
6. 390×844 emulation with stage on: no horizontal scroll (`document.documentElement.scrollWidth === 390`).

- [ ] **Step 6: Commit**

```bash
git add web/lib/prefs.ts web/lib/prefs.test.ts web/components/sim/SimApp.tsx
git commit -m "feat(web): stage theme wired through prefs on mount; tokens scale type, rows, cells and the renderer"
```

### Task 4.8: Hero — broadcast layout and the lower-third ticker

**Files:**
- Create: `web/lib/ticker.ts`, `web/components/sim/Ticker.tsx`, `web/components/sim/Ticker.module.css`
- Modify: `web/app/globals.css` (base rules: `--strip-bottom`, hero hide rule, `--t-narr` under hero), `web/components/sim/CommandStrip.module.css` (`bottom: var(--strip-bottom)`), `web/components/sim/SimApp.tsx` (render `<Ticker />` when `hero`; `data-hero-hide` on StatsRail, LogRail/Inspector wrapper, Legend, kbd row)
- Test: `web/lib/ticker.test.ts`; browser walk

**Interfaces:**
- Consumes: `AppState`, `selectAttackers`, `selectPrunedCount`, `selectHasMessages` (A.11); `formatTime` (A.3).
- Produces: `TickerCell`, `tickerCells`, `Ticker`, `--strip-bottom`, `data-hero-hide`.

- [ ] **Step 1: Write the failing tests**

```ts
// web/lib/ticker.test.ts
const base = () => useStore.getInitialState()
const ga = (over: Partial<AnalyticsFrame> = {}): AnalyticsFrame => ({ type: 'analytics', total_messages: 9, avg_delivery_ratio: 0.91, avg_propagation_ms: 190.4, avg_hops: 4.04, recent_delivery_ratio: 0.97, delivery_ratios: [], latency_cdf: [], mesh_stability: { avg_degree: 5.8, min_degree: 4, max_degree: 6 }, ...over })
test('before the first message: free play and dashes, nothing in danger', () => {
  const cells = tickerCells({ ...base(), gossipAnalytics: { ...ga(), total_messages: 0 } })
  expect(cells.map(c => c.key)).toEqual(['phase', 'delivery', 'mesh d', 'hops', 'e2e', 'attackers', 'invalid', 'T+'])
  expect(cells.map(c => c.value)).toEqual(['free play', '—', '—', '—', '—', '0', '0', '0.0s']); expect(cells.some(c => c.danger)).toBe(false)
})
test('with analytics, attackers and spam: recent delivery preferred, flame on attackers and invalid', () => {
  const nodes = [...snapWith(['peer-0']).nodes, { ...snapWith(['sybil-0']).nodes[0], state: 'attacker' as const, connected_peers: ['peer-0'] }, { ...snapWith(['sybil-1']).nodes[0], state: 'attacker' as const, connected_peers: [] }]
  const cells = tickerCells({ ...base(), nodes, gossipAnalytics: ga(), invalidCount: 12, simTime: 12.34, phaseLabel: 'Sybil attack: 5 attackers graft in' })
  expect(cells.map(c => c.value)).toEqual(['Sybil attack: 5 attackers graft in', '97%', '5.8', '4.0', '190 ms', '2 · 1 pruned', '12', '12.3s'])
  expect(cells.filter(c => c.danger).map(c => c.key)).toEqual(['attackers', 'invalid'])
})
test('scenario name when no phase has fired; geo + mainnet swaps cells 2–5', () => {
  const s = { ...base(), activeScenario: { active: true, scenario: { id: 'x', name: 'Healthy mesh', description: '', icon: '', topology_type: '', phases: [], duration: 60 } } }
  expect(tickerCells(s)[0].value).toBe('Healthy mesh')
  const geo = tickerCells({ ...s, layoutMode: 'geo', mainnet: { enabled: true, observers: 150, with_geo: 138, slot: 15466393, first_ms: 3247, first_client: 'lighthouse', p50_ms: 1850 } })
  expect(geo.slice(1, 5).map(c => [c.key, c.value])).toEqual([['slot', '15466393'], ['first seen', '3247 ms · lighthouse'], ['p50', '1850 ms'], ['observers', '138']]); expect(geo).toHaveLength(8)
  expect(tickerCells({ ...s, layoutMode: 'force', mainnet: { enabled: true, observers: 1 } })[1].key).toBe('delivery')
})
```

- [ ] **Step 2: Run to verify failure**

Run: `cd /home/yks/Projects/luminar/web && npx vitest run lib/ticker.test.ts`
Expected: FAIL — `Cannot find module '@/lib/ticker'`.

- [ ] **Step 3: Implement `tickerCells(s: AppState): TickerCell[]`** in `web/lib/ticker.ts` (port of `frontend/src/ui/narrator.ts:117-147`: `has = total_messages > 0`; delivery `${round((recent ?? avg) × 100)}%`; degree `avg_degree.toFixed(1)` or `—`; hops `toFixed(1)`; e2e `${toFixed(0)} ms`; attackers `n ? `${n} · ${pruned} pruned` : '0'` with `danger: n > 0`; invalid `String(invalidCount)` with `danger: > 0`; `T+` = `formatTime(simTime)`; geo+mainnet splice of cells 1–4 with `slot ?? '—'`, `first_ms != null ? `${first_ms} ms · ${first_client || '?'}` : '—'`, `p50_ms != null ? `${p50_ms} ms` : '—'`, `String(with_geo ?? observers ?? 0)`).

- [ ] **Step 4: Write `Ticker.tsx` + CSS and the hero rules**

- `Ticker.tsx`: `'use client'`; `const cells = useStore(tickerCells)` (re-renders at the clock rate; eight spans, accepted); `<div role="region" aria-label="broadcast readout" aria-live="off">` fixed to the canvas bottom, `height: var(--ticker-h)`, `border-top: 1px solid var(--hair-strong)`, background `var(--pitch-1)`; each cell `<span>` with key at `--t-label` uppercase `.12em` paper-2 and value at `--t-hero-n` IBM Plex Mono 500 tabular paper-0, `data-danger` → value in `--flame`. Cells laid out in one row, `gap: var(--gutter)`, overflow hidden (the phase cell may truncate with an ellipsis; never wraps).
- `globals.css` base rules: `:root { --strip-bottom: 36px } :root[data-hero="1"] { --strip-bottom: 60px; --t-narr: 24px } :root[data-hero="1"] [data-hero-hide], :root[data-hero="1"] [role="tooltip"] { display: none }`.
- `CommandStrip.module.css`: `bottom: var(--strip-bottom)`.
- `SimApp.tsx`: `const hero = useStore(s => s.hero)`; `{hero && <Ticker />}`; `data-hero-hide` on the four wrappers; the canvas container spans full width in hero (rails are `display: none`, so the grid collapses — verify the grid template does not reserve the rail columns: use `grid-template-columns: var(--rail-l) 1fr var(--rail-r)` only under `:root:not([data-hero="1"])`, else `1fr`).

- [ ] **Step 5: Run to verify pass**

Run: `cd /home/yks/Projects/luminar/web && npx vitest run && npx tsc --noEmit && npm run lint`
Expected: all green.

- [ ] **Step 6: Browser walk (dev server, no backend, 1440×900)**

1. Open `http://localhost:3000/reels/sybil-eclipse/?theme=stage&hero=1`. Expect: no left rail, no right rail, no legend, no kbd hint row; the canvas spans the full width; the command strip's bottom edge is 60 px above the viewport bottom (`getBoundingClientRect().bottom === innerHeight - 60`); below it a 56 px ticker with eight cells `PHASE · DELIVERY · MESH D · HOPS · E2E · ATTACKERS · INVALID · T+`, values `free play · — · — · — · — · 0 · 0 · 0.0s`; `document.querySelector('[aria-live="off"]')` is the ticker; the narrator caption slot is `aria-live="polite"` and its font-size computes to `24px`.
2. Hover a node: no tooltip card appears.
3. Press `Space`. At T+5.8 the four dashes become numbers (`100%`, `5.x`, `~4`, `~190 ms`); at T+10.2 `ATTACKERS` reads `5 · 0 pruned` in flame and the caption `Sybil attack: 5 attackers graft in` grows to 24 px; after T+11.9 `5 · 1 pruned` … `5 · 5 pruned`; `INVALID` counts up in flame; the `T+` value ticks at `--t-hero-n` (≥ 44 px glyphs).
4. Press `h`: rails, legend and kbd row return, ticker gone, strip bottom back to 36 px, URL loses `hero=1`, storage `hero:false`. Press `h` again: back; Legend › gear › `Hero H` switch mirrors.
5. Open `http://localhost:3000/reels/mainnet-block-wave/?hero=1`, press `Space`: in Geo the ticker reads `PHASE · SLOT · FIRST SEEN · P50 · OBSERVERS · ATTACKERS · INVALID · T+` with `slot 1546639x`, `NNNN ms · <client>`, `NNNN ms`, `138`; click `FORCE` → the four cells revert to delivery/mesh d/hops/e2e.
6. Reduced-motion emulation (`prefers-reduced-motion: reduce`): ticker and layout unchanged; no particles.

- [ ] **Step 7: Commit**

```bash
git add web/lib/ticker.ts web/lib/ticker.test.ts web/components/sim/Ticker.tsx web/components/sim/Ticker.module.css web/app/globals.css web/components/sim/CommandStrip.module.css web/components/sim/SimApp.tsx
git commit -m "feat(web): hero broadcast view with the 56px lower-third ticker; strip and caption scale by tokens"
```

### Task 4.9: Offline gate and parity freeze

**Files:**
- Modify: none expected; any defect found is fixed in the file that owns it and committed as `fix(web): …`
- Test: the scripted offline walk below, twice (static server, then FastAPI)

**Interfaces:**
- Consumes: everything in 4.1–4.8.
- Produces: the parity freeze (spec §11 Phase 4).

- [ ] **Step 1: Build and run the static server**

Run:
```bash
cd /home/yks/Projects/luminar/web && npx tsc --noEmit && npm run lint && npx vitest run && npm run build
pkill -f "uvicorn" ; pkill -f "backend/main.py" ; ss -ltnp | grep -E ':8000|:3000' ; echo "nothing listening above is the goal"
python3 -m http.server -d /home/yks/Projects/luminar/web/out 9000
```
Expected: build green; no listener on 8000/3000; `Serving HTTP on 0.0.0.0 port 9000`.

- [ ] **Step 2: Offline walk A (static server)** — DevTools open with Network set to **Offline after first paint is not required**; the point is that no backend exists.

1. Open `http://localhost:9000/reels/sybil-eclipse/?theme=stage&hero=1`. Expect: dithered progress bar; mesh before the bar completes; pill `REEL · Sybil → Eclipse`; stage type (`--t-ui` 16px) and hero layout (no rails, ticker present). Network: one `.jsonl`, fonts from `/_next/static` or `/fonts`, no request to any other host, no `/ws/events`, no `/api/*`.
2. `Space`: plays; five diamonds at T+10; halos go flame then diamonds hollow after T+11.9; `ECLIPSE` phase caption at T+16; at the end the clock stops and `Space` restarts from 0 — pauses at the end exactly once per run.
3. `1`, `2`, `3`, `4`: each navigates to `/reels/<name>/?theme=stage&hero=1` and plays on `Space`; `partition-heal` shows the wash bands on the scrubber; the Console has no uncaught exception on any of the four.
4. `0`: `/sim/?theme=stage&hero=1`, pill `OFFLINE`, canvas empty, no uncaught exception (only the browser's `WebSocket connection to 'ws://localhost:9000/ws/events' failed` and `/api/*` 404 lines).
5. `http://localhost:9000/reels/mainnet-block-wave/`: provenance card `RECORDED MAINNET · slot … · recorded · … · arrival at observer nodes, not mesh paths · data: ethPandaOps (CC BY 4.0)`; `GEO` active; dithered world; observers only.
6. `http://localhost:9000/reels/sybil-eclipse/?t=12.4&peer=sybil-0`: paused at the first snapshot ≥ 12.4 s, `sybil-0` is a hollow dashed diamond wearing the selection reticle, inspector shows `attacker` with Score in flame and MESH PEERS struck; `s` copies that URL.
7. `http://localhost:9000/sim/?reel=healthy-publish&t=20`: redirects to `/reels/healthy-publish/?t=20` and lands paused at ≈ T+20.
8. `http://localhost:9000/sim` (no slash): `http.server` 301s to `/sim/` — fine; FastAPI's 307 is checked in walk B.

- [ ] **Step 3: Offline walk B (FastAPI mount)**

Run:
```bash
cd /home/yks/Projects/luminar && test -e frontend/dist && mv frontend/dist frontend/dist.pre-phase4 ; ln -s ../web/out frontend/dist && make backend
```
Repeat walk A items 1–7 at `http://localhost:8000/...` with these differences: item 4's `/sim/` must read `LIVE` (the backend is up) and `GEO` must be disabled until `MAINNET` is clicked; add `curl -sI http://localhost:8000/sim | head -1` → `HTTP/1.1 307 Temporary Redirect` and `curl -s -o /dev/null -w '%{http_code}\n' http://localhost:8000/reels/nope/` → `404` with the exported `404.html` body (`curl -s http://localhost:8000/reels/nope/ | grep -c 'not found' ≥ 1`). Stop the backend, then: `rm frontend/dist && { test -e frontend/dist.pre-phase4 && mv frontend/dist.pre-phase4 frontend/dist; true; }`.

- [ ] **Step 4: Repository gate**

Run: `cd /home/yks/Projects/luminar && make check && cd web && npx tsc --noEmit && npm run lint && npx vitest run && npm run build`
Expected: all green (`frontend/` and `backend/` untouched by this phase; `git status --short -- frontend backend` prints nothing).

- [ ] **Step 5: Commit any fixes, then tag the freeze**

```bash
git status --short            # empty, or only fix commits already made as fix(web): …
git tag -a parity-freeze-phase4 -m "UI overhaul: simulator parity freeze after phase 4 (reels, stage, hero)"
```

---

### Phase acceptance gate (spec §11 Phase 4, verbatim)

Checklist: `public/reels` + `geo` copied; `/reels/[name]/` pre-rendered for the four entries;
redirects for `/?reel=` and `/sim/?reel=`; `t`/`peer` moments, share key; `data-stage` and
`data-hero` with the ticker and `--t-hero-n`; prefs persistence; stage overrides for the
renderer scale.
Acceptance — **reel offline test**: `npm run build`, stop every backend, `python3 -m http.server
-d web/out 9000`, open `http://localhost:9000/reels/sybil-eclipse/?theme=stage&hero=1`; the
reel loads with a dithered progress bar, plays, pauses at the end, `1`–`4` switch reels, `0`
navigates to `/sim/` and shows `OFFLINE` without errors; the mainnet reel shows the provenance
card with `recorded` and the Geo map; `?t=12.4&peer=sybil-0` lands paused on the selected
pruned diamond. Then the same walk through FastAPI (`frontend/dist` symlink) to prove the mount.
**Parity freeze** at the end of this phase.

---

## Phase 5 — dither system, landing, colorfigure (30 Oct–1 Nov, 1½ days)

**Goal:** Ship spec §11 Phase 5: the seven dither components, the landing page `/` (nav + menu overlay, hero, the live dithered Fig. 1 plate, readouts, sections, the Fig. 2 sorter colorfigure with buttons 1–3, the Fig. 3 video plate with poster, footer, 390 px layout) and the `/figure/` route, passing the phase's acceptance gate.

**Review focus pinned in this phase** (each line names the task whose test covers it):

1. **A plate frame before the Sybils (T+8–10: `a: []`, `m: []`) or a card with degenerate bounds** (every node at the same x): `drawPlateFrame` must draw without throwing and `plateTransform` must return finite coordinates (scale 1, centred) rather than `Infinity`/`NaN` — test in Task 5.4.
2. **A stamp longer than 24 characters** (a future beat string): `Stamp` must stay on one line (`white-space: nowrap`) and warn once in development instead of wrapping across the plate — test in Task 5.1.
3. **Loupe and parallax on a coarse pointer, under reduced motion, or during SSR** (`window` undefined): no listeners attached, no crash, markup still renders the plate — tests in Tasks 5.2 and 5.3.
4. **Menu overlay opened then closed by Escape or an outside click**: `document.body.style.overflow` returns to `''` and focus returns to the `Menu` button; a route change while open must not leave the page unscrollable — test in Task 5.6.
5. **`?press=` with the spec's short name `Sybil`** (the engine matches button text by prefix, and the button reads `Bolt on a Sybil`): the alias must map it, and an unknown label must surface on `<html data-errors>` rather than silently doing nothing — test in Task 5.8.

### Task 5.0: Reel stats and plate frames script

**Files:**
- Create: `web/scripts/reel-stats.mjs`, `web/lib/reel-stats.json`, `web/lib/plate-frames.json`
- Modify: `web/package.json` (scripts `"reel-stats": "node scripts/reel-stats.mjs"`, `"prebuild": "npm run reel-stats"`), `Makefile` (`web-stats: cd web && npm run reel-stats`)
- Test: `web/scripts/reel-stats.test.ts`
- Requires: `web/public/reels/sybil-eclipse.jsonl` (Task 4.1).

**Accepted by:** vitest (the script runs against the real reel).

**Interfaces:**
- Produces: A.21 shapes (`lib/reel-stats.json`, `lib/plate-frames.json`); from the `.mjs` (ESM, importable by vitest): `export function computeStats(lines: string[]): { stats: ReelStats; plate: PlateFrames }`, `export const STAMP_MAX = 24`, `export const PLATE_MAX_BYTES = 80_000`. Task 5.4 adds `computeCard`.

- [ ] **Step 1: Write the failing test** (reads the real reel once)

```ts
const lines = readFileSync(join(__dirname, '../public/reels/sybil-eclipse.jsonl'), 'utf8').split('\n').filter(Boolean)
const { stats, plate } = computeStats(lines)
test('stats come from the reel, not typed in', () => {
  expect(stats.peers).toBe(50); expect(stats.sybils).toBe(5); expect(stats.sybilAt).toBeCloseTo(10.2, 1); expect(stats.firstScorePruneAt).toBeCloseTo(11.9, 1)
  expect(stats.heartbeatsToPrune).toBe(2); expect(stats.eclipseTarget).toBe('peer-10'); expect(stats.clearedAt).toBeCloseTo(24.1, 1); expect(stats.healedInS).toBeGreaterThan(0); expect(stats.healedInS).toBeLessThan(5)
  expect(stats.deliveryPct).toBeGreaterThanOrEqual(90); expect(stats.avgHops).toBeGreaterThan(0); expect(stats.firstPublishAt).toBeCloseTo(5.8, 1)
})
test('plate frames: T+8..T+24 at 0.5 s, compact, stamps ≤ 24 chars and derived', () => {
  expect(plate.from).toBe(8); expect(plate.to).toBe(24); expect(plate.frames.length).toBeGreaterThanOrEqual(31); expect(plate.frames.length).toBeLessThanOrEqual(34)
  expect(plate.nodes).toHaveLength(50); for (const f of plate.frames) { expect(f.s).toHaveLength(50); expect(f.b).toHaveLength(50); expect(f.m.length).toBeLessThanOrEqual(40); expect(f.stamp.length).toBeLessThanOrEqual(STAMP_MAX) }
  expect(plate.frames.find(f => f.t >= 10.5)!.stamp).toBe('SYBIL FLOOD · T+10S'); expect(plate.frames.at(-1)!.stamp).toBe('CLEARED · T+24S'); expect(plate.frames.some(f => f.stamp.startsWith('ECLIPSE · N10 ·'))).toBe(true)
  expect(plate.frames.find(f => f.t >= 8)!.a).toEqual([]); expect(plate.frames.find(f => f.t >= 10.5)!.a).toHaveLength(5)
  expect(JSON.stringify(plate).length).toBeLessThan(PLATE_MAX_BYTES)
})
test('the committed JSON files match a fresh run', () => {
  expect(JSON.parse(readFileSync(join(__dirname, '../lib/reel-stats.json'), 'utf8'))).toMatchObject({ reel: 'sybil-eclipse', peers: 50, sybils: 5 })
  expect(JSON.parse(readFileSync(join(__dirname, '../lib/plate-frames.json'), 'utf8')).frames.length).toBe(plate.frames.length)
})
```

- [ ] **Step 2: Run to verify failure** — `cd /home/yks/Projects/luminar/web && npx vitest run scripts/reel-stats.test.ts` → FAIL.

- [ ] **Step 3: Implement `web/scripts/reel-stats.mjs` per A.21** (`computeStats` exported; `main()` runs when `import.meta.url === pathToFileURL(process.argv[1]).href`, writes both JSON files with `generatedAt`, exits 1 on the size/stamp guards; no dependencies). Add the npm scripts and `make web-stats`; run `npm run reel-stats` and commit the outputs.

- [ ] **Step 4: Run to verify pass** — same command → PASS; `node scripts/reel-stats.mjs` prints both paths and sizes; `npm run build` still green (`prebuild` runs the script).

- [ ] **Step 5: Commit**

```bash
git add web/scripts/reel-stats.mjs web/scripts/reel-stats.test.ts web/lib/reel-stats.json web/lib/plate-frames.json web/package.json Makefile
git commit -m "feat(web): reel-stats script producing landing readouts and Fig. 1 plate frames"
```

### Task 5.1: Stamp glyph and the shared glyph stylesheet

**Files:**
- Create: `web/components/dither/Stamp.tsx`, `web/components/dither/glyphs.module.css`
- Modify: `web/components/dither/Reticle.tsx` (2.1), `web/components/dither/HaloRing.tsx`, `web/components/dither/Diamond.tsx` (3.4) — adopt the shared module's `.halo` / `.diamond` positioning classes only; markup and tests unchanged
- Test: `web/components/dither/glyphs.test.ts` (extend with the Stamp cases; the HaloRing/Diamond cases exist since Task 3.4)

**Accepted by:** vitest (static markup via `react-dom/server`).

**Interfaces:**
- Consumes: `Reticle`, `RETICLE_CURSOR` (2.1); `HaloRing`, `Diamond` (3.4).
- Produces: A.20 `StampProps` and `Stamp` (`default` export) — plain React (no `next/*`, no hooks) so Remotion (phase 6, `StampIn`) imports it; `glyphs.module.css` (A.30).

- [ ] **Step 1: Write the failing test** (`import { createElement as h } from 'react'`, `import { renderToStaticMarkup as r } from 'react-dom/server'`; append to `glyphs.test.ts`)

```ts
test('Stamp: Manrope uppercase label, tilt variable, flame variant, nowrap, warns over 24 chars', () => {
  const m = r(h(Stamp, { children: 'SYBIL FLOOD · T+10S', depth: 1.2 }))
  expect(m).toContain('SYBIL FLOOD · T+10S'); expect(m).toContain('data-depth="1.2"'); expect(m).toContain('--stamp-tilt:3deg')
  expect(r(h(Stamp, { children: 'X', flame: true }))).toContain('var(--flame)')
  expect(r(h(Stamp, { children: 'X', tilt: -2 }))).toContain('--stamp-tilt:-2deg')
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  r(h(Stamp, { children: 'THIS STAMP IS FAR TOO LONG FOR A PLATE' })); expect(warn).toHaveBeenCalledTimes(1); warn.mockRestore()   // phase review focus 2
})
```

- [ ] **Step 2: Run to verify failure**

Run: `cd /home/yks/Projects/luminar/web && npx vitest run components/dither/glyphs.test.ts`
Expected: FAIL (`Stamp` not found).

- [ ] **Step 3: Implement `Stamp.tsx` and `glyphs.module.css`**

- `Stamp.tsx`: `export default function Stamp({ children, tilt = 3, flame = false, depth, className }: StampProps)` → `<span className={styles.stamp} data-depth={depth} style={{ '--stamp-tilt': `${tilt}deg` }}><span className={styles.inner}>{children}</span></span>`; inner: `font: 600 var(--t-stamp) var(--font-ui)`, `letter-spacing: var(--track-stamp)`, `text-transform: uppercase`, `padding: .55em 1.1em`, `background: var(--paper-0); color: var(--pitch-0)` (flame variant: `var(--flame)` / `var(--on-flame)`), `transform: rotate(var(--stamp-tilt))`, `box-shadow: var(--stamp-shadow)`, `white-space: nowrap`; `if (process.env.NODE_ENV !== 'production' && children.length > 24) console.warn('Stamp over 24 characters:', children)`. Never dithered (spec §7 forbidden list).
- `glyphs.module.css`: the stamp rules above plus `.halo, .diamond { position: absolute; pointer-events: none }` helpers used by the plates; `Reticle`, `HaloRing`, `Diamond` pick up `.halo`/`.diamond` through their `className` prop when placed on a plate.

- [ ] **Step 4: Run to verify pass**

Run: `cd /home/yks/Projects/luminar/web && npx vitest run components/dither/glyphs.test.ts && npx tsc --noEmit && npm run lint`
Expected: PASS, clean.

- [ ] **Step 5: Commit**

```bash
git add web/components/dither/Stamp.tsx web/components/dither/glyphs.module.css web/components/dither/glyphs.test.ts web/components/dither/Reticle.tsx web/components/dither/HaloRing.tsx web/components/dither/Diamond.tsx
git commit -m "feat(web): stamp glyph and the shared glyph stylesheet"
```

### Task 5.2: Figure plate and the parallax hook

**Files:**
- Create: `web/components/dither/Figure.tsx`, `web/components/dither/Figure.module.css`, `web/components/dither/parallax.ts`
- Test: `web/components/dither/Figure.test.ts`

**Accepted by:** vitest (static markup + `attachParallax` in jsdom).

**Interfaces:**
- Consumes: `Stamp`, `RETICLE_CURSOR` (5.1); `reducedMotion()` from `@/lib/prefs` (A.13).
- Produces: A.20 `FigureProps`; `useParallax(ref)`; `.plate[data-narrow="1"]`.

- [ ] **Step 1: Write the failing tests**

```ts
test('Figure renders the plate, Fig. N label, italic caption, aspect and optional stamp', () => {
  const m = r(h(Figure, { n: 2, caption: 'Same mechanism, toy constants.', aspect: '16 / 9', stamp: 'SORTER No. 6' }, h('div', { id: 'kid' })))
  expect(m).toContain('<figure'); expect(m).toContain('class="plate'); expect(m).toContain('aspect-ratio:16 / 9')
  expect(m).toContain('Fig. 2'); expect(m).toContain('<em>Same mechanism, toy constants.</em>'); expect(m).toContain('SORTER No. 6'); expect(m).toContain('id="kid"')
  expect(m).toContain('--cursor-reticle:url(')
})
test('Figure defaults: aspect 16 / 6.4, narrowAspect 4 / 3, narrowAt 450; no stamp when omitted', () => {
  const m = r(h(Figure, { n: 1, caption: 'c' }, 'x')); expect(m).toContain('aspect-ratio:16 / 6.4'); expect(m).toContain('data-narrow-at="450"'); expect(m).not.toContain('class="stamp')
})
test('useParallax is inert without a window or under reduced motion', () => {
  // SSR: renderToStaticMarkup of a component calling useParallax must not throw (effects never run)
  expect(() => r(h(Figure, { n: 1, caption: 'c' }, 'x'))).not.toThrow()
  // reduced motion: matchMedia stub → attachParallax returns a no-op and adds no scroll listener
  vi.stubGlobal('matchMedia', () => ({ matches: true }))
  const add = vi.spyOn(window, 'addEventListener'); const off = attachParallax(document.createElement('div')); off()
  expect(add.mock.calls.some(c => c[0] === 'scroll')).toBe(false); vi.unstubAllGlobals()
})
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run components/dither/Figure.test.ts` → FAIL.

- [ ] **Step 3: Implement `parallax.ts` and `Figure.tsx`**

- `parallax.ts`: `export function attachParallax(root: HTMLElement): () => void` — teardown §9 verbatim with `travel = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--parallax-travel')) || 0`; returns a no-op when `reducedMotion()` or `travel === 0` or no `[data-depth]` children; early-out when the root is > 100 px off-screen. `export function useParallax(ref)` = `useEffect(() => ref.current ? attachParallax(ref.current) : undefined, [])`.
- `Figure.tsx` (`'use client'`): `<figure class={styles.figure}>` → `<div ref class="plate {styles.plate}" data-narrow-at={narrowAt} data-narrow={narrow ? '1' : undefined} style={{ aspectRatio: narrow ? narrowAspect : aspect, '--cursor-reticle': RETICLE_CURSOR }}>{children}{stamp && <Stamp className={styles.stamp}>{stamp}</Stamp>}</div>` → `<figcaption class={narrow ? styles.capLeft : ''}><span class={styles.fig}>Fig. {n}</span><em>{caption}</em></figcaption>`. `narrow` from a `ResizeObserver` on the plate (`width < narrowAt`), initial `false`. `useParallax(plateRef)`.
- `Figure.module.css`: `.plate { position: relative; overflow: hidden; background: var(--pitch-0); width: 100%; max-width: var(--col-wide); margin-inline: auto }`; `@media (hover: hover) and (pointer: fine) { .plate { cursor: var(--cursor-reticle) } }`; `figcaption { margin-top: .6rem; text-align: right; font: italic var(--t-fig)/1.4 var(--font-display); color: var(--fg-3) }`; `.capLeft { text-align: left }`; `.fig { font: 600 12px var(--font-ui); font-style: normal; letter-spacing: .04em; color: var(--fg); margin-right: .5em }`; `.stamp { position: absolute; left: 56%; top: 24% }` (default stamp slot; PlateReplay positions its own).

- [ ] **Step 4: Run to verify pass** — `npx vitest run components/dither && npx tsc --noEmit && npm run lint` → PASS.

- [ ] **Step 5: Commit**

```bash
git add web/components/dither/Figure.tsx web/components/dither/Figure.module.css web/components/dither/parallax.ts web/components/dither/Figure.test.ts
git commit -m "feat(web): Figure plate with caption, narrow aspect and parallax layers"
```

### Task 5.3: DitherCanvas, Loupe, DitherImage

**Files:**
- Create: `web/components/dither/DitherCanvas.tsx`, `web/components/dither/DitherCanvas.module.css`, `web/components/dither/Loupe.tsx`, `web/components/dither/DitherImage.tsx`
- Create: `web/public/stills/grafana.png`, `web/public/stills/jaeger.png` (`cp assets/readme/{grafana,jaeger}.png web/public/stills/`)
- Modify: `web/app/page.tsx` — keep the phase-4 `?reel=` redirect island as the first child; below it render `<Figure n={0} caption="dither check"><DitherImage src="/stills/grafana.png" alt="Grafana dashboard with the gossipsub_* series" depth={0.6} loupe/></Figure>` (a scaffold that Task 5.10 turns into the "Same names" plate)
- Test: `web/components/dither/DitherCanvas.test.ts`

**Accepted by:** vitest for markup and mount safety; **browser walk** for reveal, loupe, resize (canvas 2D does not exist in jsdom).

**Interfaces:**
- Consumes: `drawDither`, `drawLoupe`, `revealSteps`, `coverRect`, `REVEAL_STEP_MS`, `LOUPE_PX` from `@/components/dither/dither` (A.19); `reducedMotion()`.
- Produces: A.20 `DitherCanvasProps`, `LoupeProps`; `DitherImage`; the canvas carries `data-dither="1"` (Loupe finds it under `plateRef`).

- [ ] **Step 1: Write the failing tests**

```ts
test('DitherCanvas markup: pixelated canvas with label, depth and the dither marker', () => {
  const m = r(h(DitherCanvas, { source: () => {}, 'aria-label': 'fifty peers', depth: 0.6 }))
  expect(m).toContain('<canvas'); expect(m).toContain('data-dither="1"'); expect(m).toContain('aria-label="fifty peers"'); expect(m).toContain('role="img"'); expect(m).toContain('data-depth="0.6"')
})
test('mounting without IntersectionObserver or canvas 2D does not throw and schedules nothing', () => {
  // jsdom: no IntersectionObserver, getContext() → null, clientWidth 0 → drawDither returns null
  ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
  const host = document.body.appendChild(document.createElement('div')); const root = createRoot(host)
  expect(() => act(() => root.render(h(DitherCanvas, { source: () => {}, reveal: true })))).not.toThrow()
  expect(host.querySelector('canvas[data-dither]')).toBeTruthy(); expect(() => act(() => root.unmount())).not.toThrow()
})
test('Loupe renders nothing on the server and on coarse pointers', () => {
  expect(r(h(Loupe, { plateRef: { current: null }, final: null, source: null, cover: [0, 0, 1, 1] }))).toBe('')
})
test('DitherImage shows the --dither-25 skeleton until the image decodes', () => {
  const m = r(h(DitherImage, { src: '/stills/grafana.png', alt: 'g' })); expect(m).toContain('skeleton'); expect(m).not.toContain('<canvas')
})
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run components/dither/DitherCanvas.test.ts` → FAIL.

- [ ] **Step 3: Implement**

- `DitherCanvas.tsx` (`'use client'`): renders `<canvas data-dither="1" role="img" aria-label className data-depth style="image-rendering:pixelated">` sized by CSS (`position:absolute; inset:0; width:100%; height:100%`). Effect: `finalCell = props.cell ?? parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--cell-final')) || 3`; `sourceEl` = the image/canvas, or for a callback an offscreen `<canvas>` of the canvas's CSS size that the callback paints before every pass; `render(cell)` = paint callback (if any) then `drawDither(canvas, sourceEl, cell, { contrast: DITHER_CONTRAST, positive: true, focus })`, and when `cell === finalCell` keep the returned `ImageData` in state → `onFinal?.(img)`. Reveal: if `reveal !== false` and `IntersectionObserver` exists and `!reducedMotion()`, observe the canvas at `threshold: 0.3`, and on first ≥ 30 % run `revealSteps(finalCell)` one every `REVEAL_STEP_MS` (`setTimeout` chain; cleared on unmount); otherwise `render(finalCell)` at once (no `IntersectionObserver` ⇒ immediate final). Loop: when `loop` is set, after the reveal completes `setInterval(() => !loop.paused && render(finalCell), 1000 / loop.fps)`; reveal steps ignore loop ticks. Resize: `ResizeObserver` on `canvas.parentElement`, debounced 120 ms → `render(currentCell)`. `loupe` → renders `<Loupe plateRef={canvas.parentElement ref} final={final} source={sourceEl} cover={coverRect(...)} size={LOUPE_PX}/>`. Nothing runs when `drawDither` returns `null` (no size).
- `Loupe.tsx` (`'use client'`): returns `null` always (it only attaches listeners). Effect: bail unless `typeof window !== 'undefined' && matchMedia('(hover: hover) and (pointer: fine)').matches && final && source && plateRef.current`; `canvas = plateRef.current.querySelector('canvas[data-dither]')`; `pointermove` on `document` → inside the plate rect ⇒ `drawLoupe(ctx, final, source, cover, x, y, size)` (CSS px relative to the canvas), outside ⇒ `ctx.putImageData(final, 0, 0)` once; `pointerleave` on the plate and `window blur` ⇒ restore; re-run at the last pointer position whenever `final` changes (Fig. 1 redraws at 2 Hz).
- `DitherImage.tsx` (`'use client'`): `useEffect` → `const img = new Image(); img.decoding = 'async'; img.src = src; img.decode().then(() => setImg(img)).catch(() => setFailed(true))`; before load: `<div class="skeleton" style="background: var(--dither-25)" aria-hidden/>` filling the plate; after: `<DitherCanvas source={img} aria-label={alt} …/>`; on failure the skeleton stays.
- `DitherCanvas.module.css`: `.canvas { position:absolute; inset:0; width:100%; height:100%; image-rendering: pixelated }`, `.skeleton { position:absolute; inset:0; background: var(--dither-25) }`.

- [ ] **Step 4: Run to verify pass** — `npx vitest run components/dither && npx tsc --noEmit && npm run lint` → PASS.

- [ ] **Step 5: Browser walk** (`cd web && npm run dev`, open `http://localhost:3000/` at 1440×900 with a mouse; chrome-devtools: `navigate_page`, `take_screenshot`, `emulate`)

1. Scroll the plate into view: it resolves from 28 px blocks to 3 px cells in eight steps over ≈ 1.05 s (screenshot at 0.3 s shows ≥ 20 px blocks; at 1.5 s fine cells). Expected: 1-bit paper on pitch, no grey pixels (zoom a screenshot 4×).
2. Move the pointer over the plate: a 132 px square shows the greyscale Grafana screenshot with a 1 px paper border; leaving the plate restores the dither. Cursor over the plate is the reticle (ring + four ticks), not an arrow.
3. `emulate` `prefers-reduced-motion: reduce` and reload: the plate appears at 3 px immediately (no step visible in a 0.1 s screenshot); the loupe still works.
4. Resize the window to 1000 px wide: after ≈ 120 ms the plate redraws at 3 px without blur.
5. Console: no errors.

- [ ] **Step 6: Commit**

```bash
git add web/components/dither/DitherCanvas.tsx web/components/dither/DitherCanvas.module.css web/components/dither/Loupe.tsx web/components/dither/DitherImage.tsx web/components/dither/DitherCanvas.test.ts web/public/stills web/app/page.tsx
git commit -m "feat(web): DitherCanvas with progressive reveal, loupe and dithered image wrapper"
```

### Task 5.4: Plate drawing module and one-frame reel cards

**Files:**
- Create: `web/components/landing/plate-draw.ts`, `web/lib/reel-cards.json`
- Modify: `web/scripts/reel-stats.mjs` (add `computeCard`, `CARDS_MAX_BYTES`, write `lib/reel-cards.json` from every `public/reels/manifest.json` entry in `main()`)
- Test: `web/components/landing/plate-draw.test.ts`, `web/scripts/reel-cards.test.ts`

**Accepted by:** vitest (pure functions with a recording `ctx` proxy; the script against the real reels).

**Interfaces:**
- Consumes: `lib/plate-frames.json` shape (A.21); `BAND_DENSITY` (A.15); `PAPER`, `PITCH`, `FLAME` (A.19) for canvas fill strings.
- Produces: `PlateFrames`, `PlateFrame`, `PlateLayer`, `PLATE_FPS`, `STILL_T`, `plateTransform`, `frameIndexAt`, `drawPlateFrame`; `computeCard`, `CARDS_MAX_BYTES`, `lib/reel-cards.json`.

- [ ] **Step 1: Write the failing tests**

```ts
// plate-draw.test.ts
import plate from '@/lib/plate-frames.json'
test('frameIndexAt finds the first frame at or after t, else the last', () => {
  const p = plate as PlateFrames
  expect(p.frames[frameIndexAt(p, 8)].t).toBe(p.frames[0].t); expect(p.frames[frameIndexAt(p, STILL_T)].t).toBeGreaterThanOrEqual(11.9)
  expect(frameIndexAt(p, 999)).toBe(p.frames.length - 1); expect(PLATE_FPS).toBe(2)
})
test('plateTransform fits bounds into w×h with 8 % padding and survives degenerate bounds', () => {
  const to = plateTransform({ minX: -100, minY: -50, maxX: 100, maxY: 50 }, 620, 248)
  // 200×100 into 620×248 at 8 % pad: s = min(520.8/200, 208.32/100) = 2.0832; scaled 416.64×208.32, centred
  expect(to(-100, -50)[0]).toBeCloseTo(101.68, 2); expect(to(-100, -50)[1]).toBeCloseTo(19.84, 2); expect(to(0, 0)).toEqual([310, 124])
  const d = plateTransform({ minX: 3, minY: 3, maxX: 3, maxY: 3 }, 100, 100); expect(d(3, 3).every(Number.isFinite)).toBe(true); expect(d(3, 3)).toEqual([50, 50])
})
test('drawPlateFrame draws every layer of a pre-Sybil frame (a: [], m: []) and of a geo card without throwing', () => {
  const calls: string[] = []
  const ctx = new Proxy({}, { get: (_, k) => (k === 'canvas' ? { width: 620, height: 248 } : (...a: unknown[]) => { calls.push(String(k)); return k === 'measureText' ? { width: 10 } : undefined }), set: () => true }) as unknown as CanvasRenderingContext2D
  const p = plate as PlateFrames; const empty = { ...p, frames: [{ ...p.frames[0], a: [], m: [] }] }
  for (const layer of ['base', 'attackers'] as const) expect(() => drawPlateFrame(ctx, empty, 0, 620, 248, layer)).not.toThrow()
  expect(calls).toContain('arc'); expect(calls.filter(c => c === 'fillText')).toHaveLength(0)        // no text outside the loupe layer (spec §7: never dither text)
  calls.length = 0; drawPlateFrame(ctx, empty, 0, 620, 248, 'loupe'); expect(calls.filter(c => c === 'fillText').length).toBeGreaterThanOrEqual(50)   // one id per node
  const geo = { ...p, geo: true, bounds: { minX: -450, minY: -145, maxX: 450, maxY: 210 } }; expect(() => drawPlateFrame(ctx, geo, 0, 96, 60, 'base')).not.toThrow()
})
// reel-cards.test.ts
const manifest = JSON.parse(readFileSync(join(__dirname, '../public/reels/manifest.json'), 'utf8')) as ReelMeta[]
test('computeCard: one frame per reel, honest nodes sized to the frame, geo flag on real reels, under the byte cap', () => {
  const cards = Object.fromEntries(manifest.map(m => [m.name, computeCard(readFileSync(join(__dirname, '../public', m.file), 'utf8').split('\n').filter(Boolean), m)]))
  for (const m of manifest) { const c = cards[m.name]; expect(c.frames).toHaveLength(1); expect(c.frames[0].s).toHaveLength(c.nodes.length); expect(c.frames[0].b).toHaveLength(c.nodes.length); expect(c.frames[0].stamp).toBe('') }
  expect(cards['sybil-eclipse'].nodes).toHaveLength(50); expect(cards['mainnet-block-wave'].geo).toBe(true); expect(cards['mainnet-block-wave'].nodes.length).toBeGreaterThanOrEqual(100)
  expect(cards['sybil-eclipse'].frames[0].a.length).toBeGreaterThan(0)       // the chosen frame shows the Sybils
  expect(JSON.stringify(cards).length).toBeLessThan(CARDS_MAX_BYTES)
})
test('lib/reel-cards.json is committed and matches the manifest names', () => { expect(Object.keys(JSON.parse(readFileSync(join(__dirname, '../lib/reel-cards.json'), 'utf8'))).sort()).toEqual(manifest.map(m => m.name).sort()) })
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run components/landing/plate-draw.test.ts scripts/reel-cards.test.ts` → FAIL.

- [ ] **Step 3: Implement `plate-draw.ts`**

`drawPlateFrame(ctx, plate, i, w, h, layer)` with `to = plateTransform(plate.bounds, w, h)` and `y → plate.geo ? −y : y`; `r = clamp(w / 120, 3, 6)`; frame `f = plate.frames[i]`:
- `base` (dithered later, so greys are densities): fill `rgb(11,11,13)`; edges: 1 px `rgba(242,242,239,.16)` lines; per honest node `k` with state `f.s[k]` and band `f.b[k]`: halo disc at `1.7 r` filled grey `rgb(v,v,v)` with `v = round(255 × BAND_DENSITY[band])` for bands 1–3 (band 0 draws nothing here); glyph by state — `i` disc `#37383b` + 1 px `#696964` rim · `o` paper disc + pitch centre dot `0.35 r` · `r` paper disc · `d` paper disc + 1 px paper ring at `1.6 r` · `j` hollow 1 px paper-1 disc · `f`/`e` `#696964` disc with an X; hops `f.m`: 1 px paper line at alpha .45 from→to (negative first index `−1−k` = attacker `k`) and a `4 px` paper square at 65 % of the way.
- `attackers` (flat, never dithered): per `f.a`: diamond at `1.15 r` filled `#ff5a2c` when `!p`, hollow `#696964` dashed `[3,2]` when `p`; dashed `[4,3]` `rgba(255,90,44,.55)` links to each victim index in `v` when `!p`; band-0 honest nodes (negative score): a 1 px `#ff5a2c` ring at `1.7 r` (the flame halo, flat at this scale). Clear the canvas first (`clearRect`), transparent background.
- `loupe`: `base`, then ids: `9px 500 "IBM Plex Mono"` paper at `(x + r + 2, y + 3)` — `n${k}` for honest nodes, raw `id` for attackers (flame).

`plateTransform`: `sx = (w × (1 − 2 pad)) / max(1e-9, maxX − minX)`, same for y, `s = min(sx, sy)`; if `maxX === minX && maxY === minY` then `s = 1`; centre the scaled bounds in `w × h`.

- [ ] **Step 4: Extend `scripts/reel-stats.mjs` with `computeCard(lines, meta)`**

Pick the card snapshot: for `meta.real` the snapshot with the most nodes whose state ≠ `idle` (`geo: true`, positions `x, y` from the snapshot as-is — the drawer negates y); otherwise the first snapshot with `time ≥ 0.3 × durationSim` (sybil-eclipse → the pruning beat). Build one `PlateFrames` with `nodes` = non-attacker nodes of that snapshot (1-decimal), `edges` = the latest edges frame before it mapped to indexes (`[]` when none), `bounds`, `frames: [{ t, s, b, a, m: [], r, stamp: '' }]` using the same `s`/`b`/`a`/`r` derivations as the plate frames. `main()` reads `public/reels/manifest.json`, writes `lib/reel-cards.json` (`Record<name, PlateFrames>`), exits 1 over `CARDS_MAX_BYTES = 40_000`. Run `npm run reel-stats` and commit the JSON.

- [ ] **Step 5: Run to verify pass**

Run: `cd /home/yks/Projects/luminar/web && npm run reel-stats && npx vitest run components/landing scripts && npx tsc --noEmit && npm run lint`
Expected: PASS; the script prints the three output paths with sizes (`reel-cards.json` < 40 000 bytes).

- [ ] **Step 6: Commit**

```bash
git add web/components/landing/plate-draw.ts web/components/landing/plate-draw.test.ts web/scripts/reel-stats.mjs web/scripts/reel-cards.test.ts web/lib/reel-cards.json
git commit -m "feat(web): plate frame drawing and one-frame reel cards from the recordings"
```

### Task 5.5: Fig. 1 — the live dithered replay plate (`PlateReplay`)

**Files:**
- Create: `web/components/landing/PlateReplay.tsx`, `web/components/landing/PlateReplay.module.css`
- Modify: `web/app/page.tsx` (above the 5.3 scaffold plate: `<Figure n={1} caption={FIG1}><PlateReplay plate={plateFrames}/></Figure>` with `import plateFrames from '@/lib/plate-frames.json'`)
- Test: `web/components/landing/PlateReplay.test.ts`

**Accepted by:** vitest for the SSR markup; **browser walk** for the replay, pause, parallax, loupe, reduced motion.

**Interfaces:**
- Consumes: `DitherCanvas`, `Loupe`, `HaloRing`, `Diamond`, `Stamp`, `Figure` (5.1–5.3); `drawPlateFrame`, `frameIndexAt`, `PLATE_FPS`, `STILL_T` (5.4); `FIG1` (A.4); `reducedMotion()` (A.13).
- Produces: `PlateReplay({ plate, className })`.

- [ ] **Step 1: Write the failing test**

```ts
test('PlateReplay server markup: canvas, halo ring, diamond, readout box and the first beat stamp; no shard, no halftone', () => {
  const p = plate as PlateFrames; const m = r(h(PlateReplay, { plate: p }))
  expect(m).toContain('data-dither="1"'); expect(m).toContain('data-depth="0.6"'); expect(m).toContain('data-depth="0.35"'); expect(m).toContain('data-depth="0.2"'); expect(m).toContain('data-depth="0.8"'); expect(m).toContain('data-depth="1.2"')
  expect(m).toContain('>PEERS<'); expect(m).toContain('>SYBIL<'); expect(m).toContain('>PRUNED<'); expect(m).toContain('>T+<')
  expect(m).toContain(p.frames[frameIndexAt(p, STILL_T)].stamp)     // SSR renders the reduced-motion still frame; the client advances
  expect(m).not.toMatch(/clip-path|halftone|polygon\(/)
  expect(m).toContain('tabindex="0"'); expect(m).toContain('aria-label="Fifty peers')
})
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run components/landing/PlateReplay.test.ts` → FAIL.

- [ ] **Step 3: Implement `PlateReplay.tsx` (`'use client'`)**

Layout (all children `position:absolute`, `pointer-events:none` except the root):
```
<div ref={root} className={styles.replay} tabIndex={0} aria-label={FIG1} onPointerEnter/Leave onFocus/Blur>
  <HaloRing size={120} band={2} depth={0.35} className={styles.halo}/>            right 6%  top 8%   ([data-narrow] → size 72 via CSS width/height)
  <div className={styles.canvasWrap} data-depth={0.6}>                           inset: -14% 0  (overscan)
    <DitherCanvas source={drawBase} loop={still ? undefined : { fps: PLATE_FPS, paused }} reveal onFinal={setFinal} aria-label={FIG1}/>
    <canvas ref={overlay} className={styles.overlay} aria-hidden/>               attackers layer, same box, DPR-scaled
  </div>
  <Diamond size={28} depth={0.2} className={styles.diamond} label="attacker"/>   left 4%  top 58%
  <dl className={styles.readout} data-depth={0.8}>                               right 3%  bottom 10%; pitch bg, 1 px --hair, mono --t-body tnum, labels --t-label paper-2
    <dt>PEERS</dt><dd>{r.peers}</dd> <dt>SYBIL</dt><dd>{r.sybil}</dd> <dt>PRUNED</dt><dd>{r.pruned}</dd> <dt>T+</dt><dd>{t.toFixed(1)}s</dd>
  </dl>
  <Stamp depth={1.2} className={styles.stamp}>{frame.stamp}</Stamp>              left 56% top 24%
  <Loupe plateRef={root} final={final} source={loupeCanvas} cover={[0, 0, w, h]} size={LOUPE_PX}/>
</div>
```
State: `still = reducedMotion()` (computed in an effect; SSR and first paint use the still index `frameIndexAt(plate, STILL_T)` so server markup is deterministic); `idx` in a ref, advanced by `setInterval(500)` while `!still && !paused`, looping `0 … frames.length − 1`; a React state mirror `{ t, r, stamp }` updated on each advance (2 Hz re-render of text only). `drawBase = (ctx, w, h) => { drawPlateFrame(ctx, plate, idx, w, h, 'base'); drawOverlay(w, h); drawLoupeSource(w, h) }` where `drawOverlay` clears and draws the `attackers` layer on `overlay` (sized `w×h × dpr`) and `drawLoupeSource` draws the `loupe` layer into a module-held offscreen canvas handed to `<Loupe source>`. `paused` ⇐ pointer inside or focus within. No orange shard, no halftone slab (spec §7.4.2).

- [ ] **Step 4: Run to verify pass** — `npx vitest run components/landing && npx tsc --noEmit && npm run lint` → PASS.

- [ ] **Step 5: Browser walk** (`npm run dev`, `http://localhost:3000/`, 1440×900, mouse)

1. Scroll Fig. 1 into view: reveal 28→3 px once; then the plate animates at 2 frames/s from `T+8.0s` to `T+24.0s` and loops; the readout `T+` counts, `SYBIL` goes 0→5 at T+10, `PRUNED` climbs to 5 by ≈ T+13; the stamp reads `SYBIL FLOOD · T+10S` → `3/5 PRUNED · T+13S` (or the data's count) → `ECLIPSE · N10 · T+16S` → `CLEARED · T+24S`.
2. Five flame diamonds with dashed links appear at T+10 crisp (not dithered); they turn hollow dashed as they are pruned.
3. Hover the plate: the loop pauses (readout stops counting); the loupe shows crisp grey discs with `n12`-style ids and `sybil-0` ids in flame; leave → loop resumes.
4. Tab to the plate (focus ring visible): loop pauses; Shift+Tab away → resumes.
5. Scroll slowly past the plate: the halo ring (.35), canvas (.6), diamond (.2), readout (.8) and stamp (1.2) move at different rates; the canvas overscan never exposes the pitch edge.
6. `emulate` reduced motion + reload: the plate is a still at the frame `t ≥ 11.9` (Sybils grafted), no reveal, no parallax (`transform` absent on `[data-depth]`), loupe still works.
7. Resize to 420 px wide: plate flips to 4/3, halo ring shrinks to 72 px, readout stays legible, no horizontal scroll.

- [ ] **Step 6: Commit**

```bash
git add web/components/landing/PlateReplay.tsx web/components/landing/PlateReplay.module.css web/components/landing/PlateReplay.test.ts web/app/page.tsx
git commit -m "feat(web): Fig. 1 live dithered replay plate with readouts, beat stamp and loupe"
```

### Task 5.6: Landing nav and the full-screen menu overlay

**Files:**
- Create: `web/components/landing/Nav.tsx`, `web/components/landing/Nav.module.css`
- Modify: `web/app/page.tsx` (import `REEL_MANIFEST` from `@/lib/reels` (A.29) and `@/lib/reel-cards.json`; render `<Nav reels={REEL_MANIFEST} cards={cards}/>` first)
- Test: `web/components/landing/Nav.test.ts`

**Accepted by:** vitest (`createRoot` + `act` in jsdom) for open/close/focus/scroll lock; **browser walk** for motion and layout.

**Interfaces:**
- Consumes: `ReelManifest`, `ReelMeta` (A.2); `REPO_URL` (A.4); `DitherCanvas`, `drawPlateFrame` (5.3, 5.4); `PlateFrames`.
- Produces: `Nav({ reels: ReelManifest; cards: Record<string, PlateFrames> })` (`'use client'`).

- [ ] **Step 1: Write the failing tests**

```ts
const reels: ReelManifest = JSON.parse(readFileSync(join(__dirname, '../../public/reels/manifest.json'), 'utf8'))
const cards = JSON.parse(readFileSync(join(__dirname, '../../lib/reel-cards.json'), 'utf8'))
test('nav markup: wordmark, sub-label, three links, Menu button closed', () => {
  const m = r(h(Nav, { reels, cards }))
  expect(m).toContain('LUMINAR'); expect(m).toContain('gossipsub v1.1'); expect(m).toContain('href="/sim/"'); expect(m).toContain('href="/reels/sybil-eclipse/"'); expect(m).toContain(`href="https://${REPO_URL}"`)
  expect(m).toContain('aria-expanded="false"'); expect(m).toContain('aria-controls="site-menu"'); expect(m).not.toContain('role="dialog"')
})
test('menu opens with four reel rows (kbd, blurb, REAL tag, card) and three routes; locks scroll; Escape closes and restores focus', () => {
  ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
  const host = document.body.appendChild(document.createElement('div')); const root = createRoot(host)
  act(() => root.render(h(Nav, { reels, cards })))
  const btn = host.querySelector<HTMLButtonElement>('button[aria-controls="site-menu"]')!; btn.focus(); act(() => btn.click())
  const dlg = host.querySelector('[role="dialog"]')!; expect(dlg.getAttribute('aria-modal')).toBe('true'); expect(document.body.style.overflow).toBe('hidden')
  expect(dlg.querySelectorAll('a[href^="/reels/"]')).toHaveLength(4); expect(dlg.querySelectorAll('kbd')).toHaveLength(4); expect(dlg.textContent).toContain('REAL'); expect(dlg.textContent).toContain(reels[0].blurb)
  expect(dlg.querySelectorAll('canvas[data-dither]')).toHaveLength(4)
  expect(dlg.querySelector('a[href="/sim/"]')).toBeTruthy(); expect(dlg.querySelector('a[href="/figure/"]')).toBeTruthy(); expect(dlg.querySelector(`a[href="https://${REPO_URL}"]`)).toBeTruthy()
  expect(document.activeElement).toBe(dlg.querySelector('a'))                           // first link focused on open
  act(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })) })
  expect(host.querySelector('[role="dialog"]')).toBeNull(); expect(document.body.style.overflow).toBe(''); expect(document.activeElement).toBe(btn)
  act(() => btn.click()); act(() => root.unmount()); expect(document.body.style.overflow).toBe('')   // unmount while open restores scroll
})
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run components/landing/Nav.test.ts` → FAIL.

- [ ] **Step 3: Implement `Nav.tsx`**

`<header class=nav>` (56 px, `position: sticky; top: 0; background: var(--bg); border-bottom: 1px solid var(--hair)`): `<a href="/" class=brand>` `LUMINAR` (`font: 600 var(--t-ui) var(--font-ui); letter-spacing: .14em`) + `<span class=sub>gossipsub v1.1</span>` (mono `--t-label`, paper-2); `<nav>` links `Simulator` `/sim/` · `Recordings` `/reels/sybil-eclipse/` · `GitHub` `https://${REPO_URL}` (`rel="noopener"`, `target="_blank"`); `<button aria-expanded aria-controls="site-menu">Menu <span class=plus/></button>` — the plus is two 1.4 px bars that rotate 45° (`transition: transform var(--d-menu) var(--ease)`) into `×` when open. ≤ 640 px: the three links hide, only brand + `Menu +`.
Overlay (rendered only while open): `<div id="site-menu" role="dialog" aria-modal="true" aria-label="Menu" class=overlay>` `position: fixed; inset: var(--nav-h) 0 0; z-index: 50; overflow-y: auto; background: var(--bg); animation: fade var(--d-menu) var(--ease)`; `.inner { width: min(var(--col-wide), 100% − 2·var(--gutter)); margin: 0 auto; display: grid; grid-template-columns: 1.25fr 1fr; gap: 1.6rem 4rem }` (≤ 860: one column). Column 1: `<h2 class=label>Recordings</h2>` + `<ul>` (`border-top: 1px solid var(--hair)`), one `<li style="--i: n">` per reel (`animation: rise var(--d-row) var(--ease) both; animation-delay: calc(var(--i) × var(--stagger))`): `<a href="/reels/{name}/">` grid `auto 96px 1fr auto` → `<kbd>{n+1}</kbd>` · card `<div class=card>` 96×60 with `<DitherCanvas source={(ctx,w,h) => { drawPlateFrame(ctx, card, 0, w, h, 'base'); }} reveal={false} cell={2} aria-label={title}/>` plus the `attackers` layer on a 2nd tiny canvas when `card.frames[0].a.length` (flame stays flat) · `<span class=name>{title}</span>` (`font: 400 clamp(26px, 3vw, 38px)/1.1 var(--font-display)`, italic on hover) + `<span class=line>{blurb}</span>` (mono `--t-body`, paper-2) · `<span class=tag>REAL</span>` when `real` (mono `--t-label`, 1 px hair box, `--signal` text) · arrow `›`. Column 2: `<h2 class=label>Routes</h2>` + rows `Simulator` `/sim/` · `Figure` `/figure/` · `Source` `https://${REPO_URL}`. Behaviour: open ⇒ `document.body.style.overflow = 'hidden'`, focus the first link; `keydown Escape` ⇒ close + focus the button; Tab/Shift+Tab wrap inside the dialog; `pointerdown` on the overlay backdrop outside `.inner` ⇒ close; cleanup on unmount restores overflow. Reduced motion: tokens already zero `--d-row`/`--stagger`/`--d-menu`.

- [ ] **Step 4: Run to verify pass** — `npx vitest run components/landing && npx tsc --noEmit && npm run lint` → PASS.

- [ ] **Step 5: Browser walk** (1440×900 and 390×844)

1. Click `Menu +`: overlay fades in over 400 ms, rows rise one after another 40 ms apart; four reel rows each show a tiny dithered mesh thumbnail (the mainnet one a world scatter), title, blurb, `1`–`4` kbd, `REAL` on the fourth; three route rows on the right. Page behind does not scroll (wheel over the overlay scrolls the overlay only).
2. Tab repeatedly: focus cycles inside the overlay; Escape closes and the `Menu` button has focus; `+` has rotated back.
3. Click a reel row → `/reels/sybil-eclipse/` loads (phase 4 page).
4. 390×844: nav shows brand + `Menu +` only; overlay is one column, titles 24 px, no horizontal scroll.
5. Reduced motion: overlay and rows appear instantly.

- [ ] **Step 6: Commit**

```bash
git add web/components/landing/Nav.tsx web/components/landing/Nav.module.css web/components/landing/Nav.test.ts web/app/page.tsx
git commit -m "feat(web): landing nav with full-screen menu overlay and reel cards"
```

### Task 5.7: Hero, readout strip and "What it does"

**Files:**
- Create: `web/components/landing/Hero.tsx`, `web/components/landing/Hero.module.css`, `web/components/landing/Readouts.tsx`, `web/components/landing/Readouts.module.css`, `web/components/landing/Sections.tsx`, `web/components/landing/Sections.module.css`
- Modify: `web/app/page.tsx` (order: redirect island · `<Nav/>` · `<Hero/>` (which owns Fig. 1) · `<Readouts/>` · `<WhatItDoes/>` · the 5.3 scaffold plate (still at the bottom until 5.10))
- Test: `web/components/landing/landing.test.ts`

**Accepted by:** vitest (static markup); **browser walk** for rhythm and the 390 px poster.

**Interfaces:**
- Consumes: `MECHANISM`, `RECORDING_NOT_RUN`, `FIG1`, `ECLIPSE_WHY` (A.4); `lib/reel-stats.json` (A.21 shape); `PlateReplay`, `Figure`.
- Produces: `Hero()`, `Readouts()`, `WhatItDoes()` (server components; `Sections.tsx` also exports `SameNames`, `LiveMainnet` in 5.10).

- [ ] **Step 1: Write the failing tests**

```ts
import stats from '@/lib/reel-stats.json'
test('hero: two-line poster with italic second line, lead ends with the mechanism sentence, two CTAs, Fig. 1', () => {
  const m = r(h(Hero)); expect(m).toMatch(/<h1[^>]*>Gossip,<br\/?><em>scored\.<\/em><\/h1>/)
  expect(m).toContain(`${MECHANISM}</p>`); expect(m).toContain('href="/sim/"'); expect(m).toContain('Open the simulator'); expect(m).toContain('href="/reels/sybil-eclipse/"'); expect(m).toContain('Watch a recording')
  expect(m).toContain('Fig. 1'); expect(m).toContain(`<em>${FIG1}</em>`); expect(m).not.toContain('var(--flame)" class="btn')   // flame never a CTA
})
test('readouts come from reel-stats.json and the last sub-caption is the honesty line', () => {
  const m = r(h(Readouts))
  expect(m).toContain(`>${stats.peers}<`); expect(m).toContain(`>${stats.sybils}<`); expect(m).toContain(`>${stats.heartbeatsToPrune}<`); expect(m).toContain(`>${stats.deliveryPct}%<`)
  expect(m).toContain(`T+${stats.sybilAt}s`); expect(m).toContain(RECORDING_NOT_RUN); expect((m.match(/<dd/g) ?? []).length).toBe(4)
})
test('What it does: h2, three paragraphs, chevron link; eclipse sentence from copy.ts', () => {
  const m = r(h(WhatItDoes)); expect(m).toContain('<h2'); expect((m.match(/<p/g) ?? []).length).toBe(3); expect(m).toContain(ECLIPSE_WHY); expect(m).toContain('href="/sim/"')
})
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run components/landing/landing.test.ts` → FAIL.

- [ ] **Step 3: Implement**

- `Hero.tsx`: `<section class=hero>` in the `--col-prose` column (plate at `--col-wide`): `<h1 class=poster>Gossip,<br/><em>scored.</em></h1>` (`font: 400 var(--t-poster)/var(--lh-tight) var(--font-display); letter-spacing: var(--track-poster)`; builder may change the words but keeps two lines ≤ 9 characters each, second italic); `<p class=lead>` (`--t-lead`, paper-1): `Fifty simulated peers run GossipSub v1.1: mesh, flood publish, IHAVE/IWANT and P1–P4 peer scoring. Inject Sybils, an eclipse or a partition and watch the score bite, live or from a recording. {MECHANISM}`; `<div class=row>` `<a class="btn btn-primary" href="/sim/">Open the simulator</a>` (paper on pitch, 42 px, square, `--t-ui` Manrope 500) + `<a class=chev href="/reels/sybil-eclipse/">Watch a recording <span aria-hidden>›</span></a>`; then `<Figure n={1} caption={FIG1}><PlateReplay plate={plateFrames}/></Figure>` (moved here from `page.tsx`). Rhythm: h1 → lead 22 px, lead → row 28 px, row → plate 48 px (teardown §3).
- `Readouts.tsx`: `<dl class=readouts>` four cells on a hairline grid (`grid-template-columns: repeat(4, 1fr)`; ≤ 640: `repeat(2, 1fr)`): `<div><dd>{peers}</dd><dt><em>peers in the recording</em></dt></div>` · `<dd>{sybils}</dd> <em>Sybils grafted at T+{sybilAt}s</em>` · `<dd>{heartbeatsToPrune}</dd> <em>heartbeats from graft to first prune</em>` · `<dd>{deliveryPct}%</dd> <em>{RECORDING_NOT_RUN}</em>`; numbers `font: 500 var(--t-kpi)/1 var(--font-mono); font-feature-settings: var(--tnum)`, sub-captions italic display `--t-fig` paper-2. 72 px above, 72 px below.
- `Sections.tsx` → `export function WhatItDoes()`: `<section>` `<h2>What it does</h2>` (`--t-h1` display) + three `<p>` (`--t-body`… no: body prose is display 20px/1.58 per teardown? Luminar's tokens have no prose size → use `--t-lead` at `--lh-prose`, paper-1): (1) the mechanism — mesh degree 6, heartbeat once a second, flood publish then mesh relay, IHAVE/IWANT; (2) the attacks — Sybil flood pruned by P4 within two heartbeats, eclipse, partition; (3) `Scoring cannot see a silent eclipse: {ECLIPSE_WHY}. Only clearing the fault heals it.` Chevron link `Open the simulator ›` → `/sim/`. 22 px between paragraphs, 42 px heading → first paragraph, 72 px before the section.

- [ ] **Step 4: Run to verify pass** — `npx vitest run components/landing && npx tsc --noEmit && npm run lint` → PASS (also `npx vitest run lib/copy.test.ts` — no forbidden phrase crept into the prose).

- [ ] **Step 5: Browser walk** (1440×900 → 390×844)

1. `/` top to bottom: 56 px nav; poster `Gossip, / scored.` (second line italic) at ≈ 194 px on 1440, 56 px on 390, never wider than the viewport; lead; paper button + chevron link (hover nudges `›` 3 px); Fig. 1 plate at 1080 px; four readouts on hairlines (2×2 at 390); "What it does" with three paragraphs and the chevron.
2. Nothing fades in on scroll; text is present in the first paint (view-source shows the prose).
3. Keyboard: Tab order nav → CTAs → plate → links; focus ring 2 px paper on each.

- [ ] **Step 6: Commit**

```bash
git add web/components/landing/Hero.tsx web/components/landing/Hero.module.css web/components/landing/Readouts.tsx web/components/landing/Readouts.module.css web/components/landing/Sections.tsx web/components/landing/Sections.module.css web/components/landing/landing.test.ts web/app/page.tsx
git commit -m "feat(web): landing hero, readout strip and \"What it does\" section"
```

### Task 5.8: The pneumatic-tube sorter colorfigure (buttons 1–3)

**Files:**
- Create: `web/figures/sorter/figure.html`, `web/figures/sorter/core.js` (`cp ~/.claude/skills/colorfigures/assets/core.js web/figures/sorter/`), `web/public/figures/sorter.html` (built)
- Test: headless-Chrome walk (below) + `web/figures/sorter/sorter.test.ts` (reads the built file)

**Accepted by:** headless-Chrome walk (the skill's verify loop, `--dump-dom` for `data-errors`) + vitest on the built file.

**Interfaces:**
- Consumes: the `colorfigures` engine (`mountFigure`, `xrMount`, `ui.flash`, `ui.animate`, `stats`, `params`, `?press=`), `docs/design/figure-concept.md` Candidate A.
- Produces: `/figures/sorter.html` with buttons `Post`, `Heartbeat`, `Bolt on a Sybil`; `?press=` accepts `Sybil` as the third button's short name; stats `mesh 6/6 (toy)` · `score port-3` · `delivered` · `IWANT pulls` · `beat`; `window.__st` state with `{ beat, posted, sybil, ports[6]{ p1, p2, p3, p4, attached }, delivered, pulls, history[] }`.

- [ ] **Step 1: Write the failing test** (static checks on the built file)

```ts
const html = readFileSync(join(__dirname, '../../public/figures/sorter.html'), 'utf8')
test('built sorter is self-contained and names the Must buttons, stats and labels', () => {
  expect(html).not.toMatch(/<script\s+src=/); expect(html).not.toMatch(/fonts\.googleapis|fontshare|https?:\/\/cdn/)
  for (const s of ['Post', 'Heartbeat', 'Bolt on a Sybil', 'mesh 6/6 (toy)', 'score port-3', 'delivered', 'IWANT pulls', 'beat', 'SORTER No. 6',
                   'CAM SHAFT (1 s)', 'P1 WINDER', 'P2 TOKENS', 'P3 COUNTERWEIGHT', 'P4 SLUG', 'TRIP LEVER -10', 'LOCK ARM -5', 'TICKET PUNCH (IHAVE)', 'PULL VALVE (IWANT)', 'SPLITTER (FLOOD)',
                   'nothing in the history yet', "turn:'full'", 'Bolt on a Sybil@']) expect(html).toContain(s)
  expect(html).not.toMatch(/Lower the hood|Slide the bulkhead/)       // buttons 4–5 deferred (spec §13.4)
  expect(html).not.toMatch(/beacon node|identical run/i)
})
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run figures/sorter/sorter.test.ts` → FAIL (file missing).

- [ ] **Step 3: Write `figure.html` with the `colorfigures` skill** (read `~/.claude/skills/colorfigures/SKILL.md` and `assets/examples/claw.html` first; geometry beyond the parts list is the builder's, spec §12)

- Head: doctype, `<title>Sorting office: GossipSub as a pneumatic-tube desk</title>`, `<script src="core.js"></script>`; before `mountFigure` the **press alias**: `{ const q = new URLSearchParams(location.search); if (q.has('press')) { q.set('press', q.get('press').replace(/(^|,)Sybil@/g, '$1Bolt on a Sybil@')); history.replaceState(null, '', '?' + q); } }`.
- Notes + parts list comment: Candidate A's 42 parts (case 8, structure 9, mechanism 14, power 6, controls 5) from `figure-concept.md` "Parts list (42)", in the code before any geometry.
- `mountFigure({ fig: '2', title: 'Sorter No. 6', size: [W, D, H] (≈ 120 × 70 × 95 units, desk + rim stations on a board), palette: 'paper', turn: 'full', credit: false, state, scene, buttons, stats, params })`. Body swatches: desk `l #f2f2ef / m #d4d3cd / d #a7a69f`, brass `matOf('#cbb98a')`, glass `#cfe9f0` low alpha, flame `#ff5a2c` only for fresh capsule bands and the active cam lobe, sybil capsules `#e2483d`, status lamp `#43c25c`; serial plate text `SORTER No. 6`; every stat pill with a constant says `(toy)`.
- State (toy constants = engine's): `D = 6`, `beat = 0`, `posted = false`, `history = []` (last 10 msg ids), `sybil = { attached: false, port: 2 /* port 3 */, hanging: false }`, `ports[6] = { p1: 0, p2: 0, p3: 0, p4: 0, attached: true }`, `delivered = 0 / 6`, `pulls = 0`, `score(port) = p1 + p2 + p3 + p4`.
- Buttons, in order:
  1. `Post` → one capsule into the splitter cone; eight copies at once (six tubes + two stub tubes flare for this hop); each neighbour station lights and the capsule band goes grey on arrival; `p2 += 1.0` on every attached port; `delivered = attached count`; `history.push(id)`. With the Sybil attached: red capsules spill into the gate and are rejected to the bin (visible).
  2. `Heartbeat` → one cam turn (≈ 1.6 s eased), lobes in the engine's order, each part flashing flame while it acts: **sieve shake (decay)**: `p2 *= 0.9`, `p4 *= 0.5`, `p1 = min(5, p1 + 0.5)` on attached ports → **spam valve**: if the Sybil is attached and not hanging, a red capsule spits into port 3 → `p4 −= 10` → **trip levers**: any attached port with `score < −10` → collar springs, tube end drops, `attached = false` (the Sybil's port becomes `hanging`) → **lock arm**: a loose tube re-locks only if its score `> −5` (never for the Sybil's dead port) → **ticket punch (IHAVE)**: a punched ticket to the two stub neighbours when `history.length` → **pull valve (IWANT)**: a ticket back with holes torn → vacuum line sucks a capsule across, `pulls += 1` (only after a Post). `beat += 1`. With nothing posted: only the sieve shakes and `ui.flash('nothing in the history yet')`.
  3. `Bolt on a Sybil` → the red hopper clamps onto port 3 (`sybil.attached = true`); if already attached, `ui.flash('the hopper is already bolted on')`. Expected sequence from fresh: Heartbeat 1 → port-3 score `−10.0` (p4) (+p1/p2 from earlier beats), nothing trips; Heartbeat 2 → decay to `−5.0`, spam → `−15.0`, trip → collar fires, tube drops, hopper hangs on a dead port; stat `score port-3 -15.0`.
- Stats: `[{label:'mesh', value:`${attached}/6 (toy)`}, {label:'score port-3', value: score(2).toFixed(1)}, {label:'delivered', value:`${delivered}/6`}, {label:'IWANT pulls', value: pulls}, {label:'beat', value: beat}]`.
- See-through (`xrMount`): cam shaft with six lobes + cam motor, pump + belt + flywheel, pressure line pump→manifold, six balance beams with all four weights (winder, token tray, counterweight, slug sieve), trip levers, lock arm, ticket punch + roll, vacuum line port to port along the back, P4 sieve and bin; labels exactly: `CAM SHAFT (1 s)`, `P1 WINDER`, `P2 TOKENS`, `P3 COUNTERWEIGHT`, `P4 SLUG`, `TRIP LEVER -10`, `LOCK ARM -5`, `TICKET PUNCH (IHAVE)`, `PULL VALVE (IWANT)`, `SPLITTER (FLOOD)` (plain ASCII hyphen: the engine renders symbols as blobs).
- `params(st, q)`: `?sybil=1` bolts the hopper, `?beat=N` pre-runs N heartbeats (screenshot states).

- [ ] **Step 4: Verify from every side with headless Chrome (≤ 3 rounds)**

```bash
cd /home/yks/Projects/luminar/web/figures/sorter && G=$(command -v google-chrome || command -v chromium)
for v in "yaw=45" "yaw=110" "yaw=170" "yaw=230" "yaw=300" "yaw=20&pitch=62" "yaw=200&pitch=70"; do
  "$G" --headless=new --hide-scrollbars --user-data-dir="$(mktemp -d)" --force-device-scale-factor=2 --window-size=900,800 --virtual-time-budget=3000 --screenshot="/tmp/claude-1000/-home-yks-Projects-luminar/344950f1-b57c-4874-90b3-764debeb2b83/scratchpad/sorter-${v//[&=]/_}.png" "file://$PWD/figure.html?free=1&$v"; done
"$G" --headless=new --user-data-dir="$(mktemp -d)" --virtual-time-budget=7000 --dump-dom "file://$PWD/figure.html?press=Post@300,Heartbeat@1500,Sybil@2500,Heartbeat@4000,Heartbeat@5500" > /tmp/claude-1000/-home-yks-Projects-luminar/344950f1-b57c-4874-90b3-764debeb2b83/scratchpad/sorter-press.html
grep -o 'data-errors="[^"]*"' /tmp/claude-1000/-home-yks-Projects-luminar/344950f1-b57c-4874-90b3-764debeb2b83/scratchpad/sorter-press.html; grep -c NaN /tmp/claude-1000/-home-yks-Projects-luminar/344950f1-b57c-4874-90b3-764debeb2b83/scratchpad/sorter-press.html
```
Expected: seven shots with no part painted over a nearer one, every tube touching a port, the back making sense; the press run's DOM has **no** `data-errors` attribute (the alias resolved `Sybil`) and `0` NaN; also `--dump-dom` of `?press=Nope@100` **does** contain `data-errors="…no button "Nope"…"` (Review Focus 5). Screenshot the press URL at budgets 3000 / 4600 / 6100 ms: at 6100 the port-3 tube hangs loose and the stats read `mesh 5/6 (toy)` and `score port-3 -15.0`. Phone shot `--window-size=390,844` with `&xr=1&labels=1`: badges and the label list read. A 4× crop of the see-through: every beam has four weights, the cam shaft touches the motor, the vacuum line runs port to port.

- [ ] **Step 5: Build the single file and run the test**

Run: `python3 ~/.claude/skills/colorfigures/scripts/build.py /home/yks/Projects/luminar/web/figures/sorter/figure.html /home/yks/Projects/luminar/web/public/figures/sorter.html && cd /home/yks/Projects/luminar/web && npx vitest run figures/sorter/sorter.test.ts`
Expected: `wrote …/sorter.html`; PASS.

- [ ] **Step 6: Commit**

```bash
git add web/figures/sorter/figure.html web/figures/sorter/core.js web/public/figures/sorter.html web/figures/sorter/sorter.test.ts
git commit -m "feat(web): pneumatic-tube sorter colorfigure (Post, Heartbeat, Sybil)"
```

### Task 5.9: Fig. 2 sorter plate and the `/figure/` route

**Files:**
- Create: `web/components/landing/FigureFrame.tsx`, `web/components/landing/FigurePlate.tsx`, `web/components/landing/FigurePlate.module.css`, `web/app/figure/FigureRoute.tsx`
- Modify: `web/app/figure/page.tsx` (phase-0 shell → `<Suspense fallback={null}><FigureRoute/></Suspense>`, `export const metadata = { title: 'Luminar — Fig. 2' }`), `web/app/page.tsx` (insert `<FigurePlate/>` after `<WhatItDoes/>`)
- Test: `web/components/landing/FigurePlate.test.ts`

**Accepted by:** vitest (static markup); **browser walk** for the lazy iframe, the `?press=` run and 4/3 on phones.

**Interfaces:**
- Consumes: `Figure`, `HaloRing` (5.1–5.2); `FIG2` (A.4); `/figures/sorter.html` (5.8).
- Produces: `FigureFrame({ press?, fullBleed? })`, `FigurePlate()`, `FigureRoute()`.

- [ ] **Step 1: Write the failing tests**

```ts
test('FigureFrame: lazy iframe with the spec title; press passthrough only when given; full-bleed variant', () => {
  const a = r(h(FigureFrame, {})); expect(a).toContain('src="/figures/sorter.html"'); expect(a).toContain('loading="lazy"'); expect(a).toContain('title="Sorting office: GossipSub as a pneumatic-tube desk"')
  const b = r(h(FigureFrame, { press: 'Post@300,Heartbeat@1500,Sybil@2500,Heartbeat@4000,Heartbeat@5500', fullBleed: true }))
  expect(b).toContain(`src="/figures/sorter.html?press=${encodeURIComponent('Post@300,Heartbeat@1500,Sybil@2500,Heartbeat@4000,Heartbeat@5500')}"`); expect(b).not.toContain('loading="lazy"'); expect(b).toContain('position:fixed')
})
test('FigurePlate: Fig. 2 with stamp, paper rectangle, one halo ring, caption from copy.ts', () => {
  const m = r(h(FigurePlate)); expect(m).toContain('Fig. 2'); expect(m).toContain(`<em>${FIG2}</em>`); expect(m).toContain('SORTER No. 6'); expect(m).toContain('#f4f1e8'); expect((m.match(/<pattern /g) ?? []).length).toBe(1); expect(m).toContain('<iframe')
})
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run components/landing/FigurePlate.test.ts` → FAIL.

- [ ] **Step 3: Implement**

- `FigureFrame.tsx` (plain): `<iframe src={'/figures/sorter.html' + (press ? `?press=${encodeURIComponent(press)}` : '')} title="Sorting office: GossipSub as a pneumatic-tube desk" loading={fullBleed ? undefined : 'lazy'} style={fullBleed ? { position: 'fixed', inset: 0, width: '100vw', height: '100dvh', border: 0, background: '#f4f1e8' } : { position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0 }} />`.
- `FigurePlate.tsx` (server): `<Figure n={2} caption={FIG2} aspect="16 / 9" narrowAspect="4 / 3" stamp="SORTER No. 6" className={styles.plate}>` → `<div class=paper style="background:#f4f1e8">` (`position:absolute; inset: 12px; outline: 1px solid var(--paper-0); outline-offset: 6px`) containing `<FigureFrame/>`; `<HaloRing size={96} band={2} depth={0.35} className={styles.halo}/>` at `right: −24px; top: −24px` overlapping the paper's top-right corner (clipped by the plate). The stamp sits at the plate's bottom-left corner (`.stamp { left: 2%; top: auto; bottom: 6% }`).
- `FigureRoute.tsx` (`'use client'`): `const press = useSearchParams().get('press') ?? undefined; return <FigureFrame fullBleed press={press}/>`.
- `app/figure/page.tsx`: server component, `<Suspense>` around `<FigureRoute/>`; body background `#f4f1e8` via a wrapper div (the figure is the page).

- [ ] **Step 4: Run to verify pass** — `npx vitest run components/landing && npx tsc --noEmit && npm run lint && npm run build` → PASS; `web/out/figure/index.html` and `web/out/figures/sorter.html` exist.

- [ ] **Step 5: Browser walk**

1. `/`: Fig. 2 shows the sorter on its paper rectangle with the paper rule 6 px outside, the halo ring over the top-right corner, stamp `SORTER No. 6`, caption *Fig. 2 Same mechanism, toy constants.*; the iframe loads only when scrolled near (network panel: `sorter.html` requested after scrolling).
2. Inside the plate: press `Post`, `Heartbeat`, `Bolt on a Sybil`, `Heartbeat`, `Heartbeat` → the port-3 tube drops on the second heartbeat; stats read `mesh 5/6 (toy)`, `score port-3 -15.0`.
3. `http://localhost:3000/figure/?press=Post@300,Heartbeat@1500,Sybil@2500,Heartbeat@4000,Heartbeat@5500`: full-bleed figure, the same sequence plays unattended, tube drops at ≈ 5.5 s; `/figure/` alone shows the idle figure.
4. 390×844: Fig. 2 at 4/3; the figure's phone layout (badges, label list) inside the iframe; no horizontal scroll.

- [ ] **Step 6: Commit**

```bash
git add web/components/landing/FigureFrame.tsx web/components/landing/FigurePlate.tsx web/components/landing/FigurePlate.module.css web/components/landing/FigurePlate.test.ts web/app/figure web/app/page.tsx
git commit -m "feat(web): Fig. 2 sorter plate and /figure/ route with ?press= passthrough"
```

### Task 5.10: Fig. 3 video plate, "Same names", "Live mainnet", footer

**Files:**
- Create: `web/components/landing/VideoPlate.tsx`, `web/components/landing/VideoPlate.module.css`, `web/components/landing/Footer.tsx`, `web/components/landing/Footer.module.css`
- Modify: `web/components/landing/Sections.tsx` (+ `SameNames`, `LiveMainnet`), `web/components/landing/Sections.module.css`, `web/app/page.tsx` (final order: redirect island · Nav · Hero · Readouts · WhatItDoes · FigurePlate · VideoPlate · SameNames · LiveMainnet · Footer; the 5.3 scaffold plate is removed — its still moves into `SameNames`)
- Test: `web/components/landing/landing.test.ts` (extend)

**Accepted by:** vitest (static markup, copy grep); **browser walk** for the poster overlay, stills and footer.

**Interfaces:**
- Consumes: `Figure`, `DitherImage` (5.2–5.3); `FIG3`, `SAME_NAMES`, `ARRIVAL`, `PROVENANCE`, `EVENT_LINE`, `REPO_URL` (A.4).
- Produces: `VideoPlate()` (`'use client'`), `SameNames()`, `LiveMainnet()`, `Footer()`.

- [ ] **Step 1: Write the failing tests**

```ts
test('VideoPlate: native video, metadata preload, playsinline, controls, no autoplay/muted, dithered poster overlay, Fig. 3 caption', () => {
  const m = r(h(VideoPlate)); expect(m).toContain('<video'); expect(m).toContain('src="/video/launch-16x9.mp4"'); expect(m).toContain('preload="metadata"'); expect(m).toContain('playsinline'); expect(m).toContain('controls')
  expect(m).not.toMatch(/autoplay|muted/); expect(m).toContain('/video/poster.png'); expect(m).toContain('Fig. 3'); expect(m).toContain(`<em>${FIG3}</em>`); expect(m).not.toContain('youtube')
})
test('Same names: two dithered stills at depths .6/.9, the seven gossipsub_* series, Lighthouse wording', () => {
  const m = r(h(SameNames)); expect(m).toContain('/stills/grafana.png'); expect(m).toContain('/stills/jaeger.png'); expect(m).toContain('data-depth="0.6"'); expect(m).toContain('data-depth="0.9"'); expect(m).toContain(SAME_NAMES); expect(m).not.toContain('every client')
  for (const s of ['gossipsub_mesh_peer_counts', 'gossipsub_mesh_peer_churn_events', 'gossipsub_mesh_peer_inclusion_events', 'gossipsub_score_per_mesh', 'gossipsub_topic_iwant_msgs', 'gossipsub_topic_msg_published', 'gossipsub_topic_msg_recv_counts']) expect(m).toContain(s)
})
test('Live mainnet: arrival sentence, reel link, provenance credit verbatim', () => {
  const m = r(h(LiveMainnet)); expect(m).toContain(ARRIVAL); expect(m).toContain('href="/reels/mainnet-block-wave/"'); expect(m).toContain(PROVENANCE)
})
test('Footer: three columns, event line, routes, source, licence and credit', () => {
  const m = r(h(Footer)); expect(m).toContain('LUMINAR'); expect(m).toContain(`<em>${EVENT_LINE}</em>`); for (const href of ['/', '/sim/', '/reels/sybil-eclipse/', '/figure/', `https://${REPO_URL}`]) expect(m).toContain(`href="${href}"`)
  expect(m).toContain('MIT'); expect(m).toContain('ethPandaOps (CC BY 4.0)')
})
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run components/landing/landing.test.ts` → FAIL.

- [ ] **Step 3: Implement**

- `VideoPlate.tsx` (`'use client'`): `<Figure n={3} caption={FIG3} aspect="16 / 9">` → `<video src="/video/launch-16x9.mp4" preload="metadata" playsInline controls onPlay={() => setPlaying(true)} onError={() => setMissing(true)} style="position:absolute;inset:0;width:100%;height:100%;background:var(--pitch-0)"/>`; while `!playing`: `<DitherImage src="/video/poster.png" alt="Launch video poster: the mesh at the end card" depth={0.6} className={styles.poster}/>` over the video with `pointer-events: none` (controls stay clickable); when the poster 404s DitherImage keeps its `--dither-25` skeleton; when the mp4 is missing (phase 6 not landed) the skeleton stays and a mono `--t-label` line reads `video renders in the next phase` only in development (`process.env.NODE_ENV !== 'production'`). No `autoplay`, no `muted`, no `loop`.
- `SameNames()` in `Sections.tsx`: `<section>` `<h2>Same names</h2>`, one `.plate` (`aspect-ratio: 16 / 7`, `max-width: var(--col-wide)`) holding `<DitherImage src="/stills/grafana.png" alt="Grafana: gossipsub_* series from Luminar's /metrics" depth={0.6} focus={[0.5, 0.2]} className={styles.stillA} loupe/>` (left 62 % width, top) and `<DitherImage src="/stills/jaeger.png" alt="Jaeger: a publish trace" depth={0.9} focus={[0.5, 0.3]} className={styles.stillB}/>` (right 55 % width, offset down 22 %); then `<p>` with `SAME_NAMES` (`/metrics` emits {SAME_NAMES}, scraped by the bundled Prometheus and Grafana; the trace is OpenTelemetry over OTLP) and `<ul class=mono>` of the seven `gossipsub_*` names (mono `--t-body`, paper-1, two columns ≥ 640).
- `LiveMainnet()`: `<section>` `<h2>Live mainnet</h2>` + `<p>`: `The MAINNET badge polls ethPandaOps once per slot and lights observer nodes as each block reaches them: {ARRIVAL}. ` + chevron link `Watch the recorded block wave ›` → `/reels/mainnet-block-wave/`; `<p class=credit>` mono `--t-label` paper-2: `{PROVENANCE}`.
- `Footer.tsx`: `<footer>` `margin-top: 128px; border-top: 1px solid var(--hair); padding: 2.4rem 0 1.75rem; max-width: 1000px` grid `1.4fr 1fr 1fr` (≤ 640: `1fr 1fr`, brand spans both): col 1 `LUMINAR` wordmark + `<em>{EVENT_LINE}</em>` (italic display 17 px, paper-1); col 2 `<h3>Routes</h3>` list `Landing /` · `Simulator /sim/` · `Recordings /reels/sybil-eclipse/` · `Figure /figure/`; col 3 `<h3>Source</h3>` `GitHub https://${REPO_URL}` · `MIT licence` (link `https://${REPO_URL}/blob/master/LICENSE`) · `data: ethPandaOps (CC BY 4.0)`; `<p class=copy>` 3 rem below: `© 2026 Luminar Contributors`. Manrope 14 px/1.58, paper-2 headings, paper-1 links (hover paper-0).

- [ ] **Step 4: Run to verify pass** — `npx vitest run components/landing lib/copy.test.ts && npx tsc --noEmit && npm run lint && npm run build` → PASS.

- [ ] **Step 5: Browser walk**

1. Fig. 3: the plate shows the dithered skeleton (poster not yet rendered) with native controls visible; no console error other than the 404s for `/video/*`; once phase 6 drops the files the poster dithers in and play hides it (re-check then).
2. "Same names": two dithered screenshots overlapping at different parallax depths; loupe over the Grafana still shows the real panel text; the seven series names in mono.
3. "Live mainnet": the paragraph ends with the arrival sentence; the credit line is the provenance sentence verbatim; link opens the mainnet reel.
4. Footer: three columns at 1440, two at 390 with the brand spanning; every link works; `EVENT_LINE` italic.
5. `grep -rn "identical run\|beacon node's scoring\|mesh path" web/app web/components web/lib` → only `web/lib/copy.ts`.

- [ ] **Step 6: Commit**

```bash
git add web/components/landing/VideoPlate.tsx web/components/landing/VideoPlate.module.css web/components/landing/Footer.tsx web/components/landing/Footer.module.css web/components/landing/Sections.tsx web/components/landing/Sections.module.css web/components/landing/landing.test.ts web/app/page.tsx
git commit -m "feat(web): Fig. 3 video plate, \"Same names\" stills, mainnet section and footer"
```

### Task 5.11: Legend parity — the halo ring and diamond are the same glyphs on `/sim/`

**Files:**
- Modify: `web/components/sim/Legend.tsx` (phase 3), its CSS module
- Test: `web/components/sim/Legend.test.ts` (create if phase 3 did not)

**Accepted by:** vitest (static markup); **browser walk** on `/sim/` against `make backend`.

**Interfaces:**
- Consumes: `HaloRing` (with `cell={2}`), `Diamond`, `Reticle` (5.1).
- Produces: nothing new; spec §7.4.2 ("Both appear in the simulator legend with the same construction").

- [ ] **Step 1: Write the failing test**

```ts
test('legend rows use the shared glyph components: banded halo, grafted and pruned diamonds, reticle', () => {
  const m = r(h(Legend, {} as never))   // Legend reads the store via selectors; defaults suffice
  expect((m.match(/<pattern id="halo-/g) ?? []).length).toBeGreaterThanOrEqual(1)          // HaloRing
  expect(m).toContain('points="50,0 100,50 50,100 0,50"'); expect(m).toContain('stroke-dasharray="3 2"')   // Diamond grafted + pruned
  expect(m).toContain('viewBox="0 0 14 14"')                                                 // Reticle (selected)
  expect(m).toContain('gossip mesh · hidden above 100 peers (backend sends none)')
})
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run components/sim/Legend.test.ts` → FAIL (no reticle row yet; `Glyph` already wraps `HaloRing`/`Diamond` since Task 3.4).

- [ ] **Step 3: Add the `selected` row and confirm the twins** — `<dt><Reticle title="selected"/></dt><dd>selected peer</dd>`; the honest row renders `<HaloRing size={16} band={2} cell={2}/>` through `Glyph`, a `score < 0` row renders `<HaloRing size={16} band={0} flame cell={2}/>`, attacker rows `<Diamond size={12} label="attacker"/>` / `<Diamond size={12} pruned label="pruned attacker"/>` (all from Tasks 2.1 and 3.4; nothing hand-drawn). Keep the `<dl>` semantics and `MESH_HIDDEN` text.

- [ ] **Step 4: Run to verify pass** — `npx vitest run components/sim && npx tsc --noEmit && npm run lint` → PASS.

- [ ] **Step 5: Browser walk** (`make backend` + `npm run dev`, `/sim/`): the legend's halo ring and diamond are visibly the same construction as the Fig. 1 plate's floating ring and diamond (screenshot both side by side); the legend's pruned diamond is hollow dashed; under `?theme=stage` the glyphs scale with the row height.

- [ ] **Step 6: Commit**

```bash
git add web/components/sim/Legend.tsx web/components/sim/Legend.module.css web/components/sim/Legend.test.ts
git commit -m "feat(web): legend draws the halo ring and diamond with the plate glyphs"
```

### Task 5.12: Mesh canvas first-snapshot reveal (spec §7 loading states)

**Files:**
- Create: `web/components/sim/CanvasReveal.tsx`, `web/components/sim/CanvasReveal.module.css`
- Modify: `web/components/map/DeckCanvas.tsx` (render `<CanvasReveal/>` inside `.field`, above the canvas)
- Test: `web/components/sim/CanvasReveal.test.ts` (vitest, `createRoot` + `act`); browser walk

**Accepted by:** vitest for mount/unmount rules; **browser walk** for the visible reveal.

**Interfaces:**
- Consumes: `DitherCanvas` (5.3), `revealSteps`, `REVEAL_STEP_MS` (A.19), `visiblePositions`, `markDirty` (A.17/A.27), `useStore(s => s.nodes.length)`, `reducedMotion()` (A.13), `nodeRadiusPx` (A.27).
- Produces: `CanvasReveal()` (A.30).

- [ ] **Step 1: Write the failing test**

```ts
;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
test('mounts the overlay only on the 0 → n transition, removes it after the reveal, never under reduced motion', () => {
  vi.useFakeTimers(); const host = document.body.appendChild(document.createElement('div')); const root = createRoot(host)
  act(() => root.render(h(CanvasReveal))); expect(host.querySelector('[data-reveal]')).toBeNull()                // no nodes yet
  act(() => useStore.getState().applySnapshot(snapWith(['peer-0', 'peer-1']))); expect(host.querySelector('[data-reveal] canvas[data-dither]')).toBeTruthy()
  act(() => { vi.advanceTimersByTime(8 * REVEAL_STEP_MS + 50) }); expect(host.querySelector('[data-reveal]')).toBeNull()   // gone after the last step
  act(() => useStore.getState().applySnapshot(snapWith(['peer-0']))); expect(host.querySelector('[data-reveal]')).toBeNull() // a later snapshot does not re-trigger
  act(() => root.unmount())
  reducedMotionMock.mockReturnValue(true); useStore.setState(useStore.getInitialState(), true); const root2 = createRoot(host)
  act(() => root2.render(h(CanvasReveal))); act(() => useStore.getState().applySnapshot(snapWith(['peer-0']))); expect(host.querySelector('[data-reveal]')).toBeNull()
  act(() => root2.unmount()); vi.useRealTimers()
})
```

- [ ] **Step 2: Run to verify failure** — `cd /home/yks/Projects/luminar/web && npx vitest run components/sim/CanvasReveal.test.ts` → FAIL.

- [ ] **Step 3: Implement `CanvasReveal.tsx`** (`'use client'`): `const n = useStore(s => s.nodes.length)`; local `phase: 'idle' | 'revealing' | 'done'`; when `phase === 'idle' && n > 0 && !reducedMotion()` → `'revealing'` and render `<div data-reveal className={styles.reveal}><DitherCanvas source={draw} cell={cellMesh} reveal onFinal={() => setTimeout(() => setPhase('done'), REVEAL_STEP_MS)} aria-label="mesh loading"/></div>` where `draw(ctx, w, h)` paints pitch and one paper disc of `nodeRadiusPx(n, layoutMode, scale.node)` at each `visiblePositions()` entry projected through the renderer's current view (`getViewState()`: `target`, `zoom`); `cellMesh` = computed `--cell-mesh` (2; 3 in stage). The overlay is `position:absolute; inset:0; pointer-events:none` and unmounts when `phase === 'done'`; `n` dropping back to 0 (reel exit, reset) does not rearm it. In reel mode `n` first becomes > 0 at the priming snapshot, which is the intended moment.

- [ ] **Step 4: Run to verify pass** — `npx vitest run components/sim && npx tsc --noEmit && npm run lint` → PASS.

- [ ] **Step 5: Browser walk** (`make backend` + `make web`, `/sim/`, 1440×900): reload — observe: for ≈ 1 s the mesh appears as coarse paper blocks resolving 28 → 3 px over the real node positions, then the deck.gl frame shows through unchanged (no jump in positions); `emulate` reduced motion + reload — observe: no reveal, the mesh appears at once; `/reels/sybil-eclipse/` — observe: the reveal plays once over the priming snapshot while the dithered progress bar is still filling.

- [ ] **Step 6: Commit**

```bash
git add web/components/sim/CanvasReveal.tsx web/components/sim/CanvasReveal.module.css web/components/sim/CanvasReveal.test.ts web/components/map/DeckCanvas.tsx
git commit -m "feat(web): dither reveal over the mesh canvas on the first snapshot"
```

### Task 5.13: Phone layout, reduced motion, offline, Lighthouse — the gate

**Files:**
- Modify: whichever of `web/components/landing/*.module.css`, `web/components/dither/*.module.css`, `web/app/globals.css` the walk below fails on (CSS only; no new components)
- Test: the scripted browser walk below (chrome-devtools MCP: `navigate_page`, `resize_page`, `emulate`, `take_screenshot`, `evaluate_script`, `lighthouse_audit`; or `npx lighthouse` + Chrome DevTools by hand)

**Accepted by:** **scripted browser walk** only (Lighthouse, emulation, offline); CSS fixes are accepted by re-running it.

**Interfaces:** none new.

- [ ] **Step 1: Build and serve the export without a backend**

Run: `cd /home/yks/Projects/luminar/web && npm run build && python3 -m http.server -d out 9000`
Expected: `out/index.html`, `out/figure/index.html`, `out/figures/sorter.html`, `out/stills/*.png`, `out/fonts/*.woff2` present; `grep -r "fonts.googleapis\|fontshare\|cdn\." out/index.html` empty.

- [ ] **Step 2: 390 × 844 walk** (`http://localhost:9000/`)

1. `evaluate_script`: `document.documentElement.scrollWidth <= innerWidth` → `true` at every scroll position (no horizontal scroll).
2. Gutters 16 px (`getComputedStyle(document.documentElement).getPropertyValue('--gutter')` → `16px`); poster line ≈ 56 px (`getComputedStyle(h1).fontSize`); Fig. 1 and Fig. 2 plates at 4/3 (`[data-narrow="1"]` present); readouts 2 × 2; footer two columns with the brand spanning; menu overlay one column; every tap target on the nav ≥ 44 px.
3. Fix any failure in the CSS module that owns it, rebuild, repeat.

- [ ] **Step 3: Reduced-motion walk** (`emulate` `prefers-reduced-motion: reduce`, reload)

1. Fig. 1 is the still at `t ≥ 11.9` (readout `T+ 12.0s`, no counting); the plate appears at 3 px with no coarse step; `[data-depth]` elements have no `transform` after scrolling; the menu rows have `animation-duration: 0s` / appear at once; `--parallax-travel` computes to `0px`.
2. The loupe still works over Fig. 1 and the Grafana still.

- [ ] **Step 4: Offline walk**

1. Load `/` online; `emulate` network `offline`; scroll the whole page: fonts (serif/mono/sans visible, not fallbacks — `document.fonts.check('italic 16px "Instrument Serif"')` → `true`), Fig. 1 keeps looping, Fig. 2 iframe is interactive, stills remain; the network panel shows no failed request except `/video/*` when phase 6 has not landed.
2. Hard reload while offline is **not** required (no service worker in scope); re-enable the network.

- [ ] **Step 5: Lighthouse** (backend up via `make backend` for `/sim/` and `/reels/sybil-eclipse/` through the dev server or FastAPI mount; `/` from `:9000`)

Run: `lighthouse_audit` (category accessibility) on `http://localhost:9000/`, `http://localhost:3000/sim/`, `http://localhost:3000/reels/sybil-eclipse/` — or `npx lighthouse <url> --only-categories=accessibility --chrome-flags="--headless=new" --output=json --output-path=/tmp/claude-1000/-home-yks-Projects-luminar/344950f1-b57c-4874-90b3-764debeb2b83/scratchpad/lh-<page>.json` and read `categories.accessibility.score`.
Expected: score ≥ 0.90 on all three; the `color-contrast` audit passes (no items). Any failure → fix the owning component (contrast → never `paper-3` on text; missing name → `aria-label` on the canvas/iframe/button) and re-run.

- [ ] **Step 6: Plate and sorter checks (the gate's remaining lines)**

1. `/`: the Fig. 1 plate reveals 28→3 (screenshot at 0.3 s and 1.5 s after it enters view) and the loupe shows peer ids (`n12`-style, `sybil-0` in flame).
2. `/figure/?press=Post@300,Heartbeat@1500,Sybil@2500,Heartbeat@4000,Heartbeat@5500`: the tube drops at the second heartbeat after the Sybil (≈ 5.5 s); `document.documentElement.dataset.errors` is `undefined` inside the iframe.

- [ ] **Step 7: Full check and commit**

Run: `cd /home/yks/Projects/luminar/web && npx tsc --noEmit && npm run lint && npx vitest run && npm run build && cd .. && make check`
Expected: all green.

```bash
git add web/components web/app
git commit -m "fix(web): landing at 390px, reduced motion, offline and Lighthouse pass"
```

---

### Phase 5 acceptance gate (spec §11, verbatim)

#### Phase 5 — dither system, landing, colorfigure (30 Oct–1 Nov, 1½ days)

Checklist: `components/dither/*`, Fig. 1 procedural plate with parallax/reveal/loupe,
readouts from `reel-stats.json`, sections, Fig. 2 sorter (buttons 1–3) built and embedded,
Fig. 3 video plate (poster first; mp4 lands in phase 6), nav overlay, footer, 390 px layout,
`/figure/`.
Acceptance: Lighthouse accessibility **≥ 90** on `/`, `/sim/`, `/reels/sybil-eclipse/`
(chrome-devtools `lighthouse_audit` or `npx lighthouse`), and no contrast failures reported;
`/` loads with the network throttled to offline after first paint (fonts, plate, figure all
local); the plate reveals 28→3 and the loupe shows peer ids; the sorter's Post / Heartbeat /
Sybil sequence runs via `?press=` and the tube drops on the second heartbeat; reduced-motion
emulation shows no reveal, no parallax, no staggered rows.

Every phase ends with `cd web && npx tsc --noEmit && npm run lint && npm run build` green and
`make check` still green for `frontend/` and `backend/`.

---

## Phase 6 — Remotion video (31 Oct–1 Nov, 1 day, parallel with 5 where possible)

**Goal:** Render the 57 s / 48 s launch video (16:9 and 9:16) from `public/reels/sybil-eclipse.jsonl` with the site's own dither, glyphs, tokens and fonts, and land `public/video/launch-16x9.mp4` + `poster.png` for the landing's Fig. 3 plate.

**Review focus pinned in this phase** (each line names the task whose test covers it):

1. **Message particles are shorter than a frame.** Every `GossipMessage` in the reel has `latency_ms` 0–50 (spam and IWANT are 0.0); at 30 fps a particle interpolated strictly over `latency_ms` never appears. `activeParticles` uses `max(latency_ms, PARTICLE_MIN_MS = 400)` for its visible life while keeping `at` as the start — test in Task 6.5 (`particles.test.ts` asserts the 5.8 s publish wave is visible at T+6.0 and the T+16.9 IWANT pull at T+16.95).
2. **Sim time of a typed frame.** `analytics` frames carry no sim time; their time is the latest snapshot `time` at or before them (A.21). A parser that uses wall `t / 1000` puts the first non-zero analytics at ~9.1 s instead of 7.4 s and the ticker lies by two seconds — test in Task 6.3 (`parse.test.ts` asserts `analytics[k].time === 7.4` for the first frame with `total_messages > 0`).
3. **Attackers after `FaultCleared`.** Snapshots still contain 9 attackers at T+23.9 and none at T+24.4; a scene that keys on snapshot presence pops them out on a 0.5 s boundary, a scene that keys on `clearedAt` fades them over 10 frames from T+24.1 — test in Task 6.5 (`attackers.test.ts`: `attackersAt(d, 24.2)` still returns 9 with `fading: true`; `attackersAt(d, 24.6)` returns none).
4. **Scene 3's window contains the Sybil graft.** `healthy` runs T+4.0 → T+12.0 (wide) / T+11.0 (tall), so the five diamonds and the T+11.0 spam burst would appear inside the "healthy mesh" beat. Scene 3 passes `showAttackers={false}` to `Mesh`, which also drops `spam` particles — test in Task 6.5 (`activeParticles(d, 11.05, { attackers: false })` has no `spam` kind).
5. **The landing `<video>` through FastAPI.** Starlette's `StaticFiles` serves `/video/launch-16x9.mp4` with `content-type: video/mp4`; whether it honours `Range` decides if seeking works in Safari/iOS. Task 6.14's walk records `curl -r 0-99 -sI` → `206` or `200`; if `200`, the plate keeps `preload="metadata"` and the finding goes to the owner (backend is out of scope, spec §2).

### Task 6.1: Remotion scaffold inside `web/` — config, entry, compositions, fonts, scripts

**Files:**
- Create: `web/remotion.config.ts`, `web/remotion/index.ts`, `web/remotion/Root.tsx`, `web/remotion/props.ts`, `web/remotion/fonts.css`, `web/remotion/Launch.tsx` (skeleton), `web/.gitignore` (add `video-out/`)
- Modify: `web/package.json` (deps + scripts `studio`, `video`), `web/eslint.config.mjs` (ignore nothing; add `remotion/**` override turning off `@next/next/no-img-element`), `Makefile` (`web-video`)
- Test: none (vitest) — acceptance is `npx remotion compositions`

**Interfaces:**
- Consumes: A.4 `REPO_URL`, `EVENT_LINE`; `app/globals.css` (tokens + base rules, phase 0); `public/fonts/*.woff2` and the family names `layout.tsx` registers (phase 0).
- Produces: A.22 `launchSchema`, `LaunchProps`, `LAUNCH_DEFAULTS`, `Orientation`; compositions `LaunchWide` 1920×1080×1710 and `LaunchTall` 1080×1920×1440 at 30 fps; `remotion/fonts.css` defining `--font-display`, `--font-mono`, `--font-ui` on `:root` (same names as `layout.tsx`); `Launch(props: LaunchProps)` that renders `<AbsoluteFill style={{ background: 'var(--bg)' }}>` with one placeholder `<Sequence>` per scene (Task 6.2 fills `timeline`; until then a single full-length sequence showing the composition id in `Mono`).

- [ ] **Step 1: Install and pin**

Run: `cd /home/yks/Projects/luminar/web && npm view remotion@4.0.538 version && npm view zod@3 version` → prints `4.0.538` and the zod 3 version to pin.
Run: `npm i -E remotion@4.0.538 @remotion/player@4.0.538 zod@<that> && npm i -DE @remotion/cli@4.0.538` → lockfile updated, no peer warnings about React 19.

- [ ] **Step 2: Config and entry**

`web/remotion.config.ts`: `Config.setEntryPoint('./remotion/index.ts'); Config.setPublicDir('./public'); Config.setVideoImageFormat('jpeg'); Config.setOverwriteOutput(true);` (`Config.setChromiumOpenGlRenderer('angle')` is added in Task 6.14 only if a 1080p frame takes > 150 ms). `web/remotion/index.ts`: `import './fonts.css'; import '../app/globals.css'; registerRoot(Root)`.

- [ ] **Step 3: `props.ts`, `Root.tsx`, `fonts.css`, `Launch.tsx` per A.22**

`fonts.css`: six `@font-face` rules with `src: url('../public/fonts/<file>.woff2') format('woff2')` (relative paths, bundled by Remotion's webpack; `/fonts/...` absolute URLs do **not** resolve under Remotion's `/public/` prefix) and `:root { --font-display: 'Instrument Serif', serif; --font-mono: 'IBM Plex Mono', monospace; --font-ui: 'Manrope', sans-serif }`. `Launch.tsx`: `const h = delayRender('fonts'); document.fonts.ready.then(() => continueRender(h))` in a `useEffect` once.

- [ ] **Step 4: Scripts, ignore, lint, Makefile**

`package.json`: `"studio": "remotion studio"`, `"video": "remotion render LaunchWide video-out/luminar-16x9.mp4 --codec h264 --crf 18 && remotion render LaunchTall video-out/luminar-9x16.mp4 --codec h264 --crf 18 && remotion still LaunchWide video-out/cover.png --frame 1620 && remotion render LaunchWide public/video/launch-16x9.mp4 --codec h264 --crf 28 --scale 0.6667 && remotion still LaunchWide public/video/poster.png --frame 1620"` (crf 28 is the starting value; Task 6.14 tunes it under the 12 MB cap). `web/.gitignore` += `video-out/`. `Makefile` += `web-video: cd web && npm run video`.

- [ ] **Step 5: Verify**

Run: `cd web && npx remotion compositions` → two lines: `LaunchWide 1920x1080 30fps 1710 frames` and `LaunchTall 1080x1920 30fps 1440 frames` (format as the CLI prints it).
Run: `npx remotion still LaunchWide /tmp/claude-1000/-home-yks-Projects-luminar/344950f1-b57c-4874-90b3-764debeb2b83/scratchpad/f0.png --frame 0` → PNG exists; open it with Read: near-black `#0b0b0d` field, placeholder text in IBM Plex Mono (serifs absent, slab terminals present = the font loaded, not a fallback).
Run: `npx tsc --noEmit && npm run lint && npx vitest run && npm run build` → green; `grep -r "fonts.googleapis\|fontshare" web/remotion` → empty.

- [ ] **Step 6: Commit**

```bash
git add web/package.json web/package-lock.json web/remotion.config.ts web/remotion web/.gitignore web/eslint.config.mjs Makefile
git commit -m "feat(web): Remotion scaffold with LaunchWide/LaunchTall compositions and self-hosted fonts"
```

### Task 6.2: Timeline — scene spans and frame ↔ sim-time maths

**Files:**
- Create: `web/remotion/timeline.ts`
- Modify: `web/remotion/Launch.tsx` (one `<Sequence from durationInFrames name={span.id}>` per `timeline[orientation]` entry; placeholder content = scene id)
- Test: `web/remotion/timeline.test.ts`

**Interfaces:**
- Produces: A.22 `SceneId`, `SceneSpan`, `timeline`, `SAFE_TALL = { top: 220, bottom: 320 }`; plus `FPS`, `SIZE`, `sceneAt`, `simTimeAt`, `frameForSimTime` (signatures in A.31).

Values (storyboard tables; `simOffset` in sim seconds, `speed` default 1):

| id | wide from/dur | tall from/dur | simOffset | speed |
|---|---|---|---|---|
| cold-open | 0 / 75 | 0 / 75 | — | |
| title | 75 / 165 | 75 / 135 | — | |
| healthy | 240 / 240 | 210 / 210 | 4.0 | |
| sybils | 480 / 180 | 420 / 150 | 9.5 | |
| pruned | 660 / 180 | 570 / 180 | 11.4 | 0.6 |
| eclipse | 840 / 270 | 750 / 240 | 15.5 | |
| heal | 1110 / 120 | 990 / 120 | 23.6 | |
| same-names | 1230 / 180 | 1110 / 120 | — | |
| mainnet | 1410 / 90 | (absent) | — | |
| honesty | 1500 / 90 | 1230 / 90 | — | |
| end | 1590 / 120 | 1320 / 120 | — | |

- [ ] **Step 1: Write the failing tests**

```ts
test('spans tile the composition exactly, in order, with no gaps', () => {
  for (const o of ['wide', 'tall'] as const) {
    const spans = timeline[o]; let cursor = 0
    for (const s of spans) { expect(s.from).toBe(cursor); cursor += s.durationInFrames }
    expect(cursor).toBe(SIZE[o].durationInFrames)
  }
  expect(timeline.wide.map(s => s.id)).toEqual(['cold-open','title','healthy','sybils','pruned','eclipse','heal','same-names','mainnet','honesty','end'])
  expect(timeline.tall.find(s => s.id === 'mainnet')).toBeUndefined()
})
test('frame ↔ sim time at the reel\'s phase marks', () => {
  const w = (id: SceneId) => timeline.wide.find(s => s.id === id)!
  expect(simTimeAt(w('pruned'), 25)).toBeCloseTo(11.9, 5)              // 0.6× slow motion
  expect(frameForSimTime(w('pruned'), 11.9)).toBe(685)                   // the storyboard's "≈ frame 685"
  expect(frameForSimTime(w('healthy'), 5.8)).toBe(294)
  expect(frameForSimTime(w('sybils'), 10.2)).toBe(501)
  expect(frameForSimTime(w('eclipse'), 16.2)).toBe(861)
  expect(frameForSimTime(w('eclipse'), 16.9)).toBe(882)
  expect(frameForSimTime(w('heal'), 24.1)).toBe(1125)
  const t = (id: SceneId) => timeline.tall.find(s => s.id === id)!
  expect(frameForSimTime(t('pruned'), 11.9)).toBe(595)
  expect(sceneAt('wide', 685)?.id).toBe('pruned'); expect(sceneAt('wide', 1710)).toBeUndefined()
  expect(SAFE_TALL).toEqual({ top: 220, bottom: 320 }); expect(FPS).toBe(30)
})
```

- [ ] **Step 2: Run to verify failure**

Run: `cd web && npx vitest run remotion/timeline.test.ts` → FAIL (module not found).

- [ ] **Step 3: Implement `timeline.ts`** with the table above as data and the three functions; wire `Launch.tsx` to it.

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run remotion/timeline.test.ts` → PASS (2 tests). `npx remotion studio` → the timeline panel shows 11 named sequences for `LaunchWide`, 10 for `LaunchTall`.

- [ ] **Step 5: Commit**

```bash
git add web/remotion/timeline.ts web/remotion/timeline.test.ts web/remotion/Launch.tsx
git commit -m "feat(web): video timeline with per-orientation scene spans and sim-time mapping"
```

### Task 6.3: Reel parser and `useReel`

**Files:**
- Create: `web/remotion/reel/parse.ts`, `web/remotion/reel/useReel.ts`
- Test: `web/remotion/reel/parse.test.ts`
- Requires: `web/public/reels/sybil-eclipse.jsonl` (Tasks 3.3/4.1); `web/lib/reel-stats.json` (Task 5.0).

**Interfaces:**
- Consumes: A.2 `NodeState`, `AppEvent`, `SnapshotFrame`, `AnalyticsFrame`, `EdgesFrame`; A.3 `isAttackerId`.
- Produces:

```ts
export interface ReelNode { id: string; index: number; x: number; y: number; attacker: boolean; firstSeenT: number; lastSeenT: number }
  // x,y from the first snapshot containing the node (frozen layout); attackers from their first snapshot;
  // firstSeenT = min(first snapshot time containing it, `at` of the first event naming it as peer_id/from_peer/to_peer) — a Sybil is GRAFTed at 10.2 but first snapshotted at 10.4; lastSeenT = last snapshot time containing it
export interface ReelSnapshot { time: number; states: Record<string, NodeState>; scores: Record<string, number>; connected: Record<string, string[]>; mesh: Record<string, string[]> }
export interface ReelMessage { at: number; from: string; to: string; latencyMs: number; via: 'mesh' | 'iwant' | 'spam'; hops: number; spam: boolean }   // to !== '' only; spam = isAttackerId(from)
export interface ReelData {
  nodes: ReelNode[]; byId: Map<string, ReelNode>; edges: [string, string][]
  snapshots: ReelSnapshot[]; messages: ReelMessage[]
  grafts: { at: number; from: string; to: string }[]; prunes: { at: number; from: string; to: string; reason?: string }[]
  phases: { at: number; label: string }[]; faults: { at: number; type: string; target?: string; n?: number }[]; cleared: { at: number; type: string }[]
  analytics: { time: number; delivery: number; hops: number; propagationMs: number; total: number }[]   // time = latest snapshot.time ≤ the frame's t; delivery = recent_delivery_ratio
  durationSim: number
}
export function parseReel(text: string): ReelData              // malformed lines skipped; arrays sorted by at/time
export function snapshotAt(d: ReelData, simTime: number): ReelSnapshot      // last with time ≤ simTime, else snapshots[0]
export function analyticsAt(d: ReelData, simTime: number): ReelData['analytics'][number] | null   // last with time ≤ simTime and total > 0
// useReel.ts
export function useReel(reel: string): ReelData | null         // fetch(staticFile(reel)) → parseReel under delayRender/continueRender; module-level cache keyed by reel
```

- [ ] **Step 1: Write the failing tests** (reads the real reel and `lib/reel-stats.json` once)

```ts
const d = parseReel(readFileSync(join(__dirname, '../../public/reels/sybil-eclipse.jsonl'), 'utf8'))
const stats = JSON.parse(readFileSync(join(__dirname, '../../lib/reel-stats.json'), 'utf8'))
test('nodes, edges and attackers come from the snapshots', () => {
  expect(d.nodes.filter(n => !n.attacker)).toHaveLength(50); expect(d.nodes.filter(n => n.attacker).map(n => n.id).sort()).toEqual(['eclipse-0','eclipse-1','eclipse-2','eclipse-3','sybil-0','sybil-1','sybil-2','sybil-3','sybil-4'])
  expect(d.byId.get('sybil-0')!.firstSeenT).toBeCloseTo(10.2, 1); expect(d.byId.get('sybil-0')!.lastSeenT).toBeCloseTo(23.9, 1)
  expect(d.edges.length).toBeGreaterThan(50); expect(d.durationSim).toBeCloseTo(39.5, 1)
  const n0 = d.byId.get('peer-0')!; expect(n0.x).toBeCloseTo(-62.1, 1); expect(n0.y).toBeCloseTo(294.7, 1)
})
test('events agree with reel-stats.json (two derivations, same numbers)', () => {
  expect(d.prunes.filter(p => p.reason === 'score' && p.to.startsWith('sybil-'))).toHaveLength(20)
  expect(d.prunes.find(p => p.reason === 'score')!.at).toBeCloseTo(stats.firstScorePruneAt, 1)
  expect(d.faults.find(f => f.type === 'sybil')!.at).toBeCloseTo(stats.sybilAt, 1); expect(d.faults.find(f => f.type === 'sybil')!.n).toBe(5)
  expect(d.faults.find(f => f.type === 'eclipse')!.target).toBe('peer-10'); expect(d.cleared[0].at).toBeCloseTo(stats.clearedAt, 1)
  expect(d.phases.map(p => p.label)).toEqual(['Sybil attack: 5 attackers graft in', 'Eclipse on peer-10'])
  expect(d.messages.filter(m => m.spam)).toHaveLength(40); expect(d.messages.filter(m => m.via === 'iwant')).toHaveLength(158); expect(d.messages.every(m => m.to !== '')).toBe(true)
})
test('analytics carry snapshot sim time, not wall time', () => {
  const first = d.analytics.find(a => a.total > 0)!
  expect(first.time).toBeCloseTo(7.4, 1); expect(first.delivery).toBe(1); expect(first.hops).toBeCloseTo(4.2, 1); expect(first.propagationMs).toBe(100)
  expect(Math.round(first.delivery * 100)).toBe(stats.deliveryPct); expect(first.hops).toBeCloseTo(stats.avgHops, 1); expect(first.propagationMs).toBe(stats.avgPropagationMs)
  expect(analyticsAt(d, 7.3)).toBeNull(); expect(analyticsAt(d, 7.4)!.time).toBeCloseTo(7.4, 1)
  expect(snapshotAt(d, 12.5).scores['sybil-0']).toBe(-15); expect(snapshotAt(d, 11.5).scores['sybil-0']).toBeCloseTo(-9.4, 2)
  expect(snapshotAt(d, 16.9).mesh['peer-10']).toEqual(['eclipse-0','eclipse-1','eclipse-2','eclipse-3'])
  expect(snapshotAt(d, 18).scores['eclipse-0']).toBeCloseTo(0.85, 2)   // P1 creeps up; the eclipse score is never negative in this recording
})
```

- [ ] **Step 2: Run to verify failure** → FAIL.
- [ ] **Step 3: Implement `parse.ts` and `useReel.ts`** per the interfaces (one pass over the lines; `firstSeenT`/`lastSeenT` updated per snapshot; `useReel` keeps `{ [reel]: Promise<ReelData> }` at module scope so Studio re-renders do not refetch 3.6 MB).
- [ ] **Step 4: Run to verify pass** → `npx vitest run remotion/reel` PASS (3 tests, < 2 s).
- [ ] **Step 5: Commit**

```bash
git add web/remotion/reel
git commit -m "feat(web): reel JSONL parser for the video, cross-checked against reel-stats.json"
```

### Task 6.4: View maths and the per-frame `Dither` layer

**Files:**
- Create: `web/remotion/mesh/view.ts`, `web/remotion/layers/Dither.tsx`
- Test: `web/remotion/mesh/view.test.ts`

**Interfaces:**
- Consumes: A.19 `ditherImageData`, `PAPER`, `PITCH`, `DITHER_CONTRAST`, `RawImage`.
- Produces:

```ts
// mesh/view.ts
export interface Box { x: number; y: number; w: number; h: number }
export interface Camera { scale: number; focus?: string }         // scale 1 = whole mesh fits the box with pad; focus = peer id the scale is about (default: box centre)
export type Projector = (x: number, y: number) => [number, number]
export function makeProjector(d: ReelData, box: Box, cam: Camera, pad = 40): Projector
  // fit the honest nodes' bbox into box−pad preserving aspect (uniform k), centre it; then scale about the focus node's projected point (or box centre) by cam.scale
export function lerpCamera(a: Camera, b: Camera, t: number): Camera     // scale lerp; focus switches at t ≥ .5
// layers/Dither.tsx
export function Dither(props: { width: number; height: number; cell: number; draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void; style?: React.CSSProperties }): JSX.Element
  // useLayoutEffect on [frame, width, height, cell, draw]: offscreen canvas ceil(w/cell)×ceil(h/cell), ctx.scale(1/cell), props.draw; getImageData → ditherImageData(img, 1, {paper: PAPER, pitch: PITCH}, {contrast: DITHER_CONTRAST}) → paint cell squares (paper) over a pitch fill on the visible canvas (width×height, image-rendering: pixelated). Synchronous, deterministic per frame; no delayRender needed.
```

- [ ] **Step 1: Write the failing tests**

```ts
const d = parseReel(readFileSync(join(__dirname, '../../public/reels/sybil-eclipse.jsonl'), 'utf8'))
test('scale 1 fits every honest node inside the padded box', () => {
  const box = { x: 0, y: 0, w: 1920, h: 1080 }; const p = makeProjector(d, box, { scale: 1 })
  for (const n of d.nodes.filter(n => !n.attacker)) { const [x, y] = p(n.x, n.y); expect(x).toBeGreaterThanOrEqual(40); expect(x).toBeLessThanOrEqual(1880); expect(y).toBeGreaterThanOrEqual(40); expect(y).toBeLessThanOrEqual(1040) }
  const sq = makeProjector(d, { x: 40, y: 460, w: 1000, h: 1000 }, { scale: 1 })        // the tall cut's square
  const xs = d.nodes.filter(n => !n.attacker).map(n => sq(n.x, n.y)[0]); expect(Math.min(...xs)).toBeGreaterThanOrEqual(80); expect(Math.max(...xs)).toBeLessThanOrEqual(1000)
})
test('focus node is the fixed point of the camera scale', () => {
  const box = { x: 0, y: 0, w: 1920, h: 1080 }; const f = d.byId.get('peer-22')!
  const a = makeProjector(d, box, { scale: 1, focus: 'peer-22' })(f.x, f.y); const b = makeProjector(d, box, { scale: 1.15, focus: 'peer-22' })(f.x, f.y)
  expect(b[0]).toBeCloseTo(a[0], 6); expect(b[1]).toBeCloseTo(a[1], 6)
  expect(lerpCamera({ scale: 1 }, { scale: 1.08, focus: 'peer-22' }, 0.5).scale).toBeCloseTo(1.04)
})
```

- [ ] **Step 2: Run to verify failure** → FAIL.
- [ ] **Step 3: Implement `view.ts` and `Dither.tsx`** per the interfaces.
- [ ] **Step 4: Run to verify pass** → `npx vitest run remotion/mesh/view.test.ts` PASS. Visual: temporarily point scene `cold-open`'s placeholder at `<Dither cell={3} draw={(ctx,w,h) => { ctx.fillStyle = '#888'; ctx.fillRect(0,0,w,h) }}/>`; `npx remotion still LaunchWide <scratchpad>/grey.png --frame 10` → Read the PNG: a uniform ~50 % Bayer checker of 3 px paper cells on pitch, no blur (zoom shows square cells).
- [ ] **Step 5: Commit**

```bash
git add web/remotion/mesh/view.ts web/remotion/mesh/view.test.ts web/remotion/layers/Dither.tsx
git commit -m "feat(web): video projector maths and deterministic per-frame Bayer dither layer"
```

### Task 6.5: Mesh footage — paper layer, particles, attackers

**Files:**
- Create: `web/remotion/mesh/particles.ts`, `web/remotion/mesh/attackers.ts`, `web/remotion/mesh/drawMesh.ts`, `web/remotion/mesh/Mesh.tsx`, `web/remotion/mesh/Attackers.tsx`
- Test: `web/remotion/mesh/particles.test.ts`, `web/remotion/mesh/attackers.test.ts`

**Interfaces:**
- Consumes: Task 6.3 `ReelData`, `snapshotAt`; Task 6.4 `Projector`, `Dither`; A.20 `Diamond`, `Reticle`; A.15 `scoreBand`, `BAND_DENSITY`; A.19 `bayer`.
- Produces:

```ts
// mesh/particles.ts
export const PARTICLE_MIN_MS = 400
export interface Particle { from: string; to: string; progress: number /* 0..1 */; kind: 'message' | 'spam' | 'iwant' }
export function activeParticles(d: ReelData, simTime: number, opts?: { attackers?: boolean /* default true */ }): Particle[]
  // messages with at ≤ simTime < at + max(latencyMs, PARTICLE_MIN_MS)/1000; kind spam when m.spam, iwant when via === 'iwant'; attackers:false drops spam and any particle touching an attacker id
// mesh/attackers.ts
export interface AttackerView { id: string; x: number; y: number; pruned: boolean; fading: number /* 0..1 opacity, 1 until cleared, → 0 over FADE_S */; victims: string[] }
export const FADE_S = 10 / 30
export function attackersAt(d: ReelData, simTime: number): AttackerView[]
  // present when firstSeenT ≤ simTime < cleared.at + FADE_S (cleared = first `cleared` entry after firstSeenT); pruned when the attacker has a prune event (to === id) with at ≤ simTime; victims = connected from snapshotAt before the prune, else last_targets-like: the froms of its prune events
export interface AttackEdge { from: string /* honest */; to: string /* attacker */; since: number; prunedAt?: number }
export function attackEdgesAt(d: ReelData, simTime: number): AttackEdge[]
  // one per GRAFT event (honest→attacker or attacker→honest, normalised) with at ≤ simTime; prunedAt from the matching PRUNE; still returned for 6 frames (0.2 s) after prunedAt so the erase wipe can draw
// mesh/drawMesh.ts — the PAPER layer only (what gets dithered)
export interface MeshStyle { nodeR: number /* 7 */; edgeAlpha: number /* .4 */; meshAlpha: number /* .55 */; intensity: number /* 0..1, globalAlpha of the whole layer */; field?: number /* 0..1, flat paper wash under everything (cold open noise) */ }
export function drawMesh(ctx: CanvasRenderingContext2D, d: ReelData, p: Projector, simTime: number, s: MeshStyle, opts?: { attackers?: boolean; flashUntil?: Record<string, number> }): void
  // topology edges 1 px paper edgeAlpha; mesh edges (snapshotAt.mesh, honest pairs deduped) 1.5 px paper meshAlpha; honest nodes: disc nodeR, state ≠ idle → filled, idle → rim only; node that received in the last 6 frames → nodeR+3 filled (flash); score halo: annulus 1.7 r whose fill alpha = BAND_DENSITY[scoreBand(score)] (flame band 0 is NOT drawn here — it goes to Attackers.tsx); particles kind 'message'/'iwant' as 4 px squares (iwant dashed: 2 px on/off along the path)
// mesh/Mesh.tsx
export function Mesh(props: { data: ReelData; box: Box; camera: Camera; simTime: number; cell?: number /* 3 */; style?: Partial<MeshStyle>; showAttackers?: boolean /* true */; cursor?: { peer: string; click?: boolean } }): JSX.Element
  // <Dither width height cell draw={drawMesh…}/> then, as siblings above it (flat, never dithered): <Attackers/> and, when cursor is set, <Reticle size={14}/> positioned on that peer (one-frame invert when click)
// mesh/Attackers.tsx
export function Attackers(props: { data: ReelData; p: Projector; simTime: number; box: Box }): JSX.Element
  // SVG: attack edges flame .55 dashed 4/3 (prunedAt: flame 1.0 flash for 3 frames then a wipe to 0 length over 6 frames); grafted attacker = <Diamond size={16}/> flame with hatch; pruned = <Diamond pruned/> hollow dashed; spam particles 3 px flame squares with one trailing cell; negative-score honest halo (scoreBand 0) as a flame annulus at .12; opacity = fading
```

- [ ] **Step 1: Write the failing tests**

```ts
const d = parseReel(readFileSync(join(__dirname, '../../public/reels/sybil-eclipse.jsonl'), 'utf8'))
test('publish wave at T+5.8: nothing before it, 52 squares (14 from peer-22) at T+6.0', () => {
  expect(activeParticles(d, 5.79)).toHaveLength(0)
  const ps = activeParticles(d, 6.0); expect(ps).toHaveLength(52); expect(ps.filter(p => p.from === 'peer-22')).toHaveLength(14)
  expect(ps.every(p => p.kind === 'message' && p.progress >= 0 && p.progress <= 1)).toBe(true)
})
test('spam leaves the Sybils at T+11.0; scene 3 can hide it; the IWANT pull reaches peer-10 at T+16.9', () => {
  expect(activeParticles(d, 11.05).some(p => p.kind === 'spam')).toBe(true)
  expect(activeParticles(d, 11.05, { attackers: false }).some(p => p.kind === 'spam')).toBe(false)
  expect(activeParticles(d, 16.95).some(p => p.kind === 'iwant' && p.to === 'peer-10')).toBe(true)
  expect(PARTICLE_MIN_MS).toBe(400)
})
test('attackers: five grafted at T+10.2, all pruned at T+11.9, fading after T+24.1, gone after T+24.5', () => {
  expect(attackersAt(d, 10.0)).toHaveLength(0); expect(attackersAt(d, 10.25)).toHaveLength(5)
  const a = attackersAt(d, 11.0); expect(a).toHaveLength(5); expect(a.every(x => !x.pruned && x.fading === 1)).toBe(true); expect(a.find(x => x.id === 'sybil-0')!.victims.length).toBeGreaterThanOrEqual(3)
  expect(attackersAt(d, 11.85).every(x => !x.pruned)).toBe(true); expect(attackersAt(d, 11.95).every(x => x.pruned)).toBe(true)
  expect(attackersAt(d, 16.3)).toHaveLength(9); expect(attackersAt(d, 16.3).filter(x => x.id.startsWith('eclipse-')).every(x => !x.pruned)).toBe(true)
  const fading = attackersAt(d, 24.2); expect(fading).toHaveLength(9); expect(fading[0].fading).toBeGreaterThan(0); expect(fading[0].fading).toBeLessThan(1)
  expect(attackersAt(d, 24.6)).toHaveLength(0)
})
test('attack edges live from GRAFT to PRUNE and linger 0.2 s for the wipe', () => {
  expect(attackEdgesAt(d, 10.3).filter(e => e.to.startsWith('sybil-')).length).toBeGreaterThanOrEqual(5)
  const e = attackEdgesAt(d, 12.0).find(e => e.from === 'peer-42' && e.to === 'sybil-3')!; expect(e.prunedAt).toBeCloseTo(11.9, 1)
  expect(attackEdgesAt(d, 12.2).find(e => e.from === 'peer-42' && e.to === 'sybil-3')).toBeUndefined()
  expect(attackEdgesAt(d, 16.3).filter(e => e.from === 'peer-10' && e.to.startsWith('eclipse-'))).toHaveLength(4)
})
```

- [ ] **Step 2: Run to verify failure** → FAIL.
- [ ] **Step 3: Implement the five files** per the interfaces. `drawMesh` and `Attackers` take the same `Projector`, so the flame layer sits exactly on the dithered one.
- [ ] **Step 4: Run to verify pass** → `npx vitest run remotion/mesh` PASS. Visual: point the `healthy` placeholder at `<Mesh data box={{x:0,y:0,w:1920,h:1080}} camera={{scale:1}} simTime={simTimeAt(span, frame)}/>` and the `sybils` one likewise; run `npx remotion render LaunchWide <scratchpad>/mesh --frames=250,300,520,560 --image-format=png`; Read each: 250 = 50 paper discs + dotted edges, all 1-bit; 300 = squares leaving peer-22 and a few enlarged receivers; 520 = five flame diamonds (hatched, not dithered) with dashed flame edges to honest discs; 560 = flame 3 px squares travelling from the diamonds.
- [ ] **Step 5: Commit**

```bash
git add web/remotion/mesh
git commit -m "feat(web): video mesh footage from reel data: dithered paper layer, flat flame attackers and particles"
```

### Task 6.6: Readouts — ticker and score strip from `analytics` and `gossip_score`

**Files:**
- Create: `web/remotion/mesh/readouts.ts`, `web/remotion/mesh/Ticker.tsx`, `web/remotion/mesh/ScoreStrip.tsx`, `web/remotion/constants.ts`
- Test: `web/remotion/mesh/readouts.test.ts`, `web/remotion/constants.test.ts`

**Interfaces:**
- Consumes: Task 6.3 `analyticsAt`, `snapshotAt`; A.3 `fmtLatency`; Task 6.7 `Mono` (use a `<span style={{fontFamily:'var(--font-mono)'}}>` until 6.7 lands, then swap).
- Produces:

```ts
// constants.ts (values from backend/gossip/engine.py:33-37, scoring.py; Lighthouse column from docs/roadmap-devcon8.md:29)
export const TOY = { d: 6, pruneThreshold: -10, heartbeatS: 1.0, terms: 'P1–P4' } as const
export const LIGHTHOUSE = { d: 8, thresholds: '−4000 / −8000 / −16000', heartbeatS: 0.7, terms: 'P1–P7' } as const
export const SERIES = ['gossipsub_mesh_peer_churn_events','gossipsub_mesh_peer_counts','gossipsub_mesh_peer_inclusion_events','gossipsub_score_per_mesh','gossipsub_topic_iwant_msgs','gossipsub_topic_msg_published','gossipsub_topic_msg_recv_counts'] as const
// readouts.ts
export function tickerAt(d: ReelData, simTime: number): { delivery: number; hops: number; ms: number } | null   // from analyticsAt; null before the first message
export function invalidCountAt(d: ReelData, simTime: number): number        // messages with spam && at ≤ simTime
export function scoreAt(d: ReelData, peer: string, simTime: number): number | null   // snapshotAt(...).scores[peer] ?? null (step, like the inspector)
export function healedInS(d: ReelData): number | null                       // first analytics.time with delivery ≥ .95 after cleared[0].at, minus cleared[0].at, rounded .1
export function fmtTicker(t: ReturnType<typeof tickerAt>, extra?: { invalid?: number; healedIn?: number | null }): string[]
  // ['delivery 100 %', 'hops 4.2', '100 ms'] (+ 'invalid 40' when extra.invalid ≥ 1, + 'healed in 1.4 s' when extra.healedIn) ; '—' triple when null
// Ticker.tsx
export function Ticker(props: { data: ReelData; simTime: number; orientation: Orientation; invalid?: boolean; healed?: boolean; style?: CSSProperties }): JSX.Element
  // wide: one line bottom-left, IBM Plex Mono 500 28 px tabular, items joined by ' · '; tall: 3-line stack top-left under SAFE_TALL.top; the 'invalid' item in --flame
// ScoreStrip.tsx
export function ScoreStrip(props: { data: ReelData; peer: string; simTime: number; orientation: Orientation; width: number; flat?: boolean }): JSX.Element
  // mono label `${peer}  ${signed(score)}`; bar from 0 toward min(score, −20)/−20 of width; bar --flame when score < 0 else --paper-1; dotted line at TOY.pruneThreshold labelled `prune ${TOY.pruneThreshold}`; flat → second line = `ECLIPSE_WHY` from lib/copy.ts (the storyboard's `P4 0 · P3 −0.25 floor` is not what this recording shows: eclipse-0's score climbs +0.1 → +1.6 through P1 and never goes negative, so the strip shows that real climb and the sentence explains why P4 never fires). Height 60 (wide) / 140 (tall). Text never dithered.
```

- [ ] **Step 1: Write the failing tests**

```ts
const d = parseReel(readFileSync(join(__dirname, '../../public/reels/sybil-eclipse.jsonl'), 'utf8'))
test('ticker numbers are the reel\'s own', () => {
  expect(tickerAt(d, 7.3)).toBeNull(); expect(tickerAt(d, 7.4)).toEqual({ delivery: 1, hops: 4.2, ms: 100 })
  expect(fmtTicker(tickerAt(d, 7.4))).toEqual(['delivery 100 %', 'hops 4.2', '100 ms']); expect(fmtTicker(null)).toEqual(['delivery —', 'hops —', '— ms'])
  expect(invalidCountAt(d, 10.9)).toBe(0); expect(invalidCountAt(d, 11.1)).toBeGreaterThan(0); expect(invalidCountAt(d, 12.0)).toBe(40)
  expect(healedInS(d)).toBeCloseTo(1.4, 1); expect(fmtTicker(tickerAt(d, 25.5), { healedIn: healedInS(d) })).toContain('healed in 1.4 s')
})
test('score strip steps on snapshots: +0.1 → −9.4 → −15 for sybil-0; eclipse-0 climbs and never goes negative', () => {
  expect(scoreAt(d, 'sybil-0', 10.5)).toBeCloseTo(0.1); expect(scoreAt(d, 'sybil-0', 11.5)).toBeCloseTo(-9.4); expect(scoreAt(d, 'sybil-0', 12.5)).toBe(-15)
  expect(scoreAt(d, 'eclipse-0', 18)).toBeCloseTo(0.85, 2); expect(scoreAt(d, 'eclipse-0', 16.5)).toBeCloseTo(0.1, 2); expect(scoreAt(d, 'eclipse-0', 24)).toBeGreaterThan(0)
  for (let t = 16.4; t <= 24; t += 0.5) expect(scoreAt(d, 'eclipse-0', t)!).toBeGreaterThanOrEqual(0)
  expect(scoreAt(d, 'nobody', 18)).toBeNull()
})
// constants.test.ts — the honesty card cannot drift from the engine
test('toy constants match backend/gossip/engine.py and the seven series exist in the backend', () => {
  const eng = readFileSync(join(__dirname, '../../backend/gossip/engine.py'), 'utf8')
  expect(eng).toMatch(new RegExp(`^D = ${TOY.d}\\b`, 'm')); expect(eng).toMatch(new RegExp(`^SCORE_THRESHOLD_PRUNE = ${TOY.pruneThreshold}\\.0`, 'm')); expect(eng).toMatch(new RegExp(`^HEARTBEAT_INTERVAL = ${TOY.heartbeatS.toFixed(1)}`, 'm'))
  const backend = execSync('grep -rho "gossipsub_[a-z_]*" ../backend', { encoding: 'utf8' })
  for (const s of SERIES) expect(backend).toContain(s)
  expect(SERIES).toHaveLength(7)
})
```

- [ ] **Step 2: Run to verify failure** → FAIL.
- [ ] **Step 3: Implement** `constants.ts`, `readouts.ts`, `Ticker.tsx`, `ScoreStrip.tsx` per the interfaces.
- [ ] **Step 4: Run to verify pass** → `npx vitest run remotion/mesh/readouts.test.ts remotion/constants.test.ts` PASS.
- [ ] **Step 5: Commit**

```bash
git add web/remotion/mesh/readouts.ts web/remotion/mesh/readouts.test.ts web/remotion/mesh/Ticker.tsx web/remotion/mesh/ScoreStrip.tsx web/remotion/constants.ts web/remotion/constants.test.ts
git commit -m "feat(web): video ticker and score strip read analytics and gossip_score from the reel"
```

### Task 6.7: Type components, parallax, per-scene layout tables, all video copy

**Files:**
- Create: `web/remotion/type/Fig.tsx`, `web/remotion/type/Mono.tsx`, `web/remotion/type/StampIn.tsx`, `web/remotion/type/Headline.tsx`, `web/remotion/layers/Parallax.tsx`, `web/remotion/scenes/types.ts`, `web/remotion/scenes/layout.ts`, `web/remotion/scenes/copy.ts`
- Test: `web/remotion/scenes/layout.test.ts`, `web/remotion/scenes/copy.test.ts`

**Interfaces:**
- Consumes: A.20 `Stamp` (`components/dither/Stamp.tsx`), A.4 `MECHANISM`, `ARRIVAL`, `PROVENANCE`, `SAME_NAMES`, `EVENT_LINE`, `REPO_URL`, `FORBIDDEN`; Task 6.2 `SAFE_TALL`, `SIZE`.
- Produces:

```ts
// scenes/types.ts
export interface SceneProps { data: ReelData; orientation: Orientation; span: SceneSpan }   // every scene: export default function Scene(props: SceneProps)
// scenes/layout.ts
export type Anchor = 'tl' | 'tr' | 'bl' | 'br' | 'c'
export interface SceneLayout { mesh?: Box; stamp: { anchor: Anchor; inset: [number, number] }; caption?: Box; readout?: Box; strip?: Box; headlinePx?: number; monoPx?: number; cell: number }
export const LAYOUT: Record<SceneId, Record<Orientation, SceneLayout>>
  // wide: mesh {0,0,1920,1080} (scenes 1,3–7,11 ghost), caption bottom-right {1180,940,700,100}, readout bottom-left {64,980,900,60}, strip {…under focus node, 420×60}, headlinePx 96, monoPx 28, cell 3
  // tall: mesh {40,460,1000,1000} (the 1000 px square, vertically centred), caption {60,1500,960,100} (just above SAFE_TALL.bottom = 1600), readout {60,240,960,120} (under SAFE_TALL.top), strip {40,1470,1000,140} (below the square, full width), headlinePx 72, monoPx 44 (honesty) / 36 (ticker), cell 3; scene 8 one card {40,560,1000,600}; scene 11 wordmark 120, URL two lines
export function boxes(l: SceneLayout): Box[]                     // every Box in a layout (for the safe-zone test)
// scenes/copy.ts — every string the video shows, once
export const HEADLINE: Record<Orientation, string[]>   // wide ['libp2p GossipSub v1.1.', 'Run live. Broken on purpose.'] · tall ['libp2p GossipSub v1.1.', 'Run live.', 'Broken on purpose.']; line 2 (wide) / line 3 (tall) italic
export const STAMP: Record<SceneId, string>            // cold-open 'LUMINAR' · title '' · healthy 'FLOOD PUBLISH' · sybils 'FIVE SYBILS' · pruned 'PRUNED BY SCORE' · eclipse 'SCORING CANNOT SEE THIS' · heal 'HEALED' · same-names 'OPENTELEMETRY OUT' · mainnet '' · honesty 'TOY CONSTANTS' · end 'BREAK IT YOURSELF'
export const STAMP_TILT: Record<SceneId, number>       // 3, 0, −2, 3, −2, 3, −2, 3, 0, −2, 3
export const FIG: Partial<Record<SceneId, string>>     // title: 'Fifty peers, a mesh, and a scoring loop you can push past the prune threshold.' · healthy: `One publish, every peer, in four hops. ${MECHANISM}` · pruned: 'P4, the invalid-message penalty: −10 per heartbeat of spam. One heartbeat later every honest peer had pruned them; nobody coordinated it.' · eclipse: 'Four silent attackers. No invalid messages, so no P4. Only a P3 deficit, floored at −0.25. The mesh never reacts; peer-10 lives on gossip pulls, a heartbeat late.' · heal: 'Faults cleared; the mesh re-grafts and delivery is back within two heartbeats.' · same-names: `Seven of ${SAME_NAMES}, so the same dashboard queries work on both. Not the same numbers.` · mainnet: `Real mainnet: one slot's block, ${ARRIVAL}. ${PROVENANCE}`
export const FIG_N: Partial<Record<SceneId, number>>   // title 1 · healthy 2 · pruned 3 · eclipse 4 · heal 5 · same-names 6 · mainnet 7
export const HONESTY_ROWS: [label: string, luminar: string, lighthouse: string][]   // from TOY/LIGHTHOUSE: ['D', '6', '8'], ['prune threshold', '−10', '−4000 / −8000 / −16000'], ['heartbeat', '1 s', '0.7 s'], ['score', 'P1–P4', 'P1–P7']
// type/
export function Mono(props: { children: ReactNode; px?: number; dim?: boolean; flame?: boolean; style?: CSSProperties }): JSX.Element      // IBM Plex Mono 500, font-variant-numeric tabular-nums
export function Fig(props: { n: number; children: string; orientation: Orientation; box: Box; at: number /* local frame fade-in start */ }): JSX.Element   // 'Fig. N' Manrope 600 .12em + Instrument Serif italic 28 px (wide) / 30 px (tall, ≤ 2 lines); right-aligned wide, left tall; opacity interpolate [at, at+12]
export function StampIn(props: { children: string; tilt: number; anchor: Anchor; inset: [number, number]; at: number; flame?: boolean }): JSX.Element   // shared <Stamp tilt flame> scaled by spring({frame: frame−at, fps, config: {damping: 200}}) from 0 → 1 (no overshoot), hidden before at
export function Headline(props: { lines: string[]; px: number; italicLast?: boolean; at: number; stagger?: number /* 10 */ }): JSX.Element   // Instrument Serif, each line translateY 24→0 + opacity over 14 frames with stagger
// layers/Parallax.tsx
export function Parallax(props: { depth: number; pan: number; children: ReactNode; style?: CSSProperties }): JSX.Element   // translateY(depth × pan px)
```

- [ ] **Step 1: Write the failing tests**

```ts
test('every tall layout box stays outside the Reels/Shorts safe zones', () => {
  for (const id of Object.keys(LAYOUT) as SceneId[]) for (const b of boxes(LAYOUT[id].tall)) {
    expect(b.y, `${id} top`).toBeGreaterThanOrEqual(SAFE_TALL.top); expect(b.y + b.h, `${id} bottom`).toBeLessThanOrEqual(SIZE.tall.height - SAFE_TALL.bottom)
    expect(b.x).toBeGreaterThanOrEqual(0); expect(b.x + b.w).toBeLessThanOrEqual(SIZE.tall.width)
  }
  expect(LAYOUT.title.tall.headlinePx).toBe(72); expect(LAYOUT.title.wide.headlinePx).toBe(96); expect(LAYOUT.pruned.tall.strip!.h).toBe(140); expect(LAYOUT.honesty.tall.monoPx).toBe(44)
})
test('stamps ≤ 24 chars, copy clean, honesty rows from constants', () => {
  for (const s of Object.values(STAMP)) expect(s.length).toBeLessThanOrEqual(24)
  const all = [...Object.values(STAMP), ...Object.values(FIG), ...HEADLINE.wide, ...HEADLINE.tall, ...HONESTY_ROWS.flat()].join('\n')
  for (const f of FORBIDDEN) if (!PROVENANCE.includes(f)) expect(all).not.toContain(f)    // 'mesh path' reaches the video only inside the imported PROVENANCE
  expect(FIG.mainnet).not.toMatch(/propagation|identical/i); expect(FIG.mainnet).toContain(ARRIVAL); expect(FIG.mainnet).toContain(PROVENANCE)
  expect(HEADLINE.tall).toHaveLength(3); expect(HONESTY_ROWS).toEqual([['D', '6', '8'], ['prune threshold', '−10', '−4000 / −8000 / −16000'], ['heartbeat', '1 s', '0.7 s'], ['score', 'P1–P4', 'P1–P7']])
})
```

- [ ] **Step 2: Run to verify failure** → FAIL.
- [ ] **Step 3: Implement** the eight files per the interfaces. `Fig` and `StampIn` import `Stamp` from `@/components/dither/Stamp` unchanged (the shared component must render without `next/*`; if phase 5 gave it `"use client"`, that directive is harmless under Remotion's bundler).
- [ ] **Step 4: Run to verify pass** → `npx vitest run remotion/scenes` PASS; `npx vitest run lib/copy.test.ts` still PASS (the grep over `remotion/` finds forbidden phrases only via imports).
- [ ] **Step 5: Commit**

```bash
git add web/remotion/type web/remotion/layers/Parallax.tsx web/remotion/scenes
git commit -m "feat(web): video type components, parallax, safe-zone layout tables and all on-screen copy"
```

### Task 6.8: Scenes 1–2 — cold open and title

**Files:**
- Create: `web/remotion/scenes/01-ColdOpen.tsx`, `web/remotion/scenes/02-Title.tsx`
- Modify: `web/remotion/Launch.tsx` (`SCENES: Record<SceneId, React.FC<SceneProps>>`, `useReel(props.reel)`; renders nothing until data is non-null)
- Test: scripted stills (below)

**Interfaces:**
- Consumes: 6.4 `Dither`, 6.5 `Mesh`, `drawMesh`, 6.7 `StampIn`, `Headline`, `Fig`, `LAYOUT`, `STAMP`, `HEADLINE`, `FIG`, A.20 `HaloRing`.
- Produces: the two scene components (default exports taking `SceneProps`).

Behaviour pinned:
- **01**: `Mesh` at `simTime 0`, camera `{scale: 1}`, `style.intensity = interpolate(f, [0, 40], [0, 1], clamp)`, `style.field = interpolate(f, [0, 40], [0.02, 0], clamp)` (the 2 % Bayer noise field resolving into the mesh); one `HaloRing size={220} band={2}` lower-left at `Parallax depth .2`, drifting `pan = f × 0.05` (+2 px over the scene); `StampIn 'LUMINAR' tilt 3 at 30`. No orange shape (spec §7.4.2).
- **02**: `Mesh` held at `simTime 0` with `intensity .6` and `meshAlpha` breathing `.35 → .45` on a 90-frame sine; `Headline lines=HEADLINE[o] px=LAYOUT.title[o].headlinePx italicLast at 0 stagger 10`; a `HaloRing size={160}` behind the italic line instead of the halftone rectangle; `Fig n=1 at 75` (local; wide frame 150).

- [ ] **Step 1: Implement the two scenes and the `SCENES` map** per the pins above.
- [ ] **Step 2: Scripted stills**

Run: `cd web && npx remotion render LaunchWide <scratchpad>/s12 --frames=0,20,45,100,160,230 --image-format=png` and Read each PNG. Expected: f0 = pitch field with a sparse ~2 % paper-cell noise and no mesh; f20 = mesh half-resolved out of the noise; f45 = full 1-bit mesh, `LUMINAR` stamp fully popped (paper box, Manrope caps, tilted 3°), halo ring lower-left; f100 = headline line 1 in Instrument Serif at 96 px fully up, line 2 italic still rising; f160 = both lines, `Fig. 1` caption visible bottom-right; f230 = same, mesh edges slightly brighter than at f160 (breathing). Nothing orange anywhere in scenes 1–2.
Run: `npx remotion render LaunchTall <scratchpad>/t12 --frames=45,160 --image-format=png` → mesh inside the 1000 px square (y 460–1460), stamp in the top third below y 220, headline three lines at 72 px, caption above y 1600.

- [ ] **Step 3: Gate** → `npx tsc --noEmit && npm run lint && npx vitest run` green.
- [ ] **Step 4: Commit**

```bash
git add web/remotion/scenes/01-ColdOpen.tsx web/remotion/scenes/02-Title.tsx web/remotion/Launch.tsx
git commit -m "feat(web): video scenes 1-2, cold open resolving from Bayer noise and the serif title"
```

### Task 6.9: Scenes 3–4 — healthy mesh and the Sybil graft

**Files:**
- Create: `web/remotion/scenes/03-Healthy.tsx`, `web/remotion/scenes/04-Sybils.tsx`
- Test: scripted stills

**Interfaces:**
- Consumes: 6.2 `simTimeAt`, `frameForSimTime`; 6.5 `Mesh`; 6.6 `Ticker`; 6.7 `StampIn`, `Fig`, `Mono`, `LAYOUT`, `STAMP`, `FIG`; 6.4 `lerpCamera`.

Behaviour pinned:
- **03**: `simTime = simTimeAt(span, f)`; camera `lerpCamera({scale:1}, {scale: o==='wide' ? 1.08 : 1.12, focus:'peer-22'}, f/dur)`; `showAttackers={false}` (Review Focus 4); `Ticker` (no invalid) in `LAYOUT.healthy[o].readout`; `StampIn STAMP.healthy tilt −2 at 60` (wide frame 300); `Fig n=2`.
- **04**: camera `lerpCamera({scale: 1.08, focus:'peer-22'}, {scale: 1.15, focus: densest attacker = the sybil with most victims at T+11}, f/dur)`; `showAttackers` on; the phase label `data.phases[0].label` (`Sybil attack: 5 attackers graft in`) as a `Mono dim` bar top-left (wide) / full-width under the top safe zone (tall) — a hair-ruled paper-2 text, **no halftone slab**; `Ticker invalid` (adds `invalid N` in flame once ≥ 1); `StampIn STAMP.sybils tilt 3 at frameForSimTime(span, 10.2) − span.from`; no caption in this scene.

- [ ] **Step 1: Implement both scenes.**
- [ ] **Step 2: Scripted stills**

Run: `npx remotion render LaunchWide <scratchpad>/s34 --frames=290,300,330,470,500,505,540,600 --image-format=png`. Expected: f290 = mesh idle, ticker reads `delivery — · hops — · — ms`; f300 = squares leaving peer-22 (centre of the slight zoom), `FLOOD PUBLISH` stamp mid-pop; f330 = enlarged receivers spreading outward; f470 = ticker `delivery 100 % · hops 4.2 · 100 ms` (the reel's first analytics values; **if the ticker shows different digits, the parser or `analyticsAt` is wrong, not the storyboard**), no diamonds although sim time is 11.7; f500 = sybils scene, no diamonds yet (T+10.17); f505 = five flame diamonds scaling in with dashed flame edges, `FIVE SYBILS` stamp, phase label bar; f540 = ticker still `invalid` absent (spam starts T+11.0, frame 525 → check f540 shows `invalid` in flame with a count ≥ 1); f600 = flame 3 px squares streaming from the diamonds.

- [ ] **Step 3: Gate** → tsc/lint/vitest green.
- [ ] **Step 4: Commit**

```bash
git add web/remotion/scenes/03-Healthy.tsx web/remotion/scenes/04-Sybils.tsx
git commit -m "feat(web): video scenes 3-4, flood publish with reel ticker and the Sybil graft"
```

### Task 6.10: Scenes 5–7 — pruned by score, the eclipse, heal

**Files:**
- Create: `web/remotion/scenes/05-Pruned.tsx`, `web/remotion/scenes/06-Eclipse.tsx`, `web/remotion/scenes/07-Heal.tsx`
- Test: scripted stills (the spec's frame-685 verification lives here)

**Interfaces:**
- Consumes: 6.5 `Mesh` (`cursor` prop), `attackersAt`; 6.6 `ScoreStrip`, `Ticker`, `healedInS`; 6.7 type + layout + copy.

Behaviour pinned:
- **05** (0.6×): camera `{scale: 1.15, focus: 'sybil-0'}`; `ScoreStrip peer='sybil-0'` in `LAYOUT.pruned[o].strip` (wide: under the node; tall: full-width below the square and the node gets a 2 px flame ring instead); the first PRUNE (`frameForSimTime(span, 11.9)` = wide 685 / tall 595) triggers, via `attackEdgesAt`, the flame flash + 6-frame wipe on every honest→Sybil edge and flips the diamonds hollow; `cursor={{ peer: 'sybil-0', click: f === 40 }}` from local frame 20 (wide 680) — the `Reticle` glyph, not a crosshair sprite; `StampIn STAMP.pruned tilt −2 at frameForSimTime(span, 11.9) − span.from`; `Fig n=3`.
- **06**: camera eases `{scale: 1.15, focus:'sybil-0'} → {scale: 1.15, focus:'peer-10'}` over 60 frames; at T+16.2 peer-10's honest mesh edges disappear (they leave `snapshotAt().mesh` at the 16.4 snapshot — a step, no flash) and four hollow-style **eclipse** diamonds wire to it (grafted, flame; they never emit spam because the reel has none); `ScoreStrip peer='eclipse-0' flat` held from local frame 60 for ≥ 60 frames (the bar creeps right by +0.25 per snapshot and never turns flame — that stillness is the point); phase label `data.phases[1].label`; the T+16.9 IWANT pull renders as the dashed, slower particle to peer-10 (frame 882); `StampIn STAMP.eclipse tilt 3 at 120` (wide 960); `Fig n=4`.
- **07**: camera back to `{scale: 1}` over 30 frames; attackers fade through `fading` after T+24.1 (frame 1125); `Ticker healed` shows `healed in 1.4 s` once `simTime ≥ cleared.at + healedInS(d)` (T+25.5 is outside this scene's window T+23.6–27.6? — it is inside: 1110 + 1.9 × 30 = frame 1167); `StampIn STAMP.heal tilt −2 at 15`; `Fig n=5`.

- [ ] **Step 1: Implement the three scenes.**
- [ ] **Step 2: Scripted stills — the spec's verification**

Run: `npx remotion render LaunchWide <scratchpad>/s567 --frames=670,684,686,692,700,760,860,862,882,900,1120,1130,1170 --image-format=png`. Expected: f670 = score strip `sybil-0  −9.40` with flame bar short of the dotted `prune −10` line, five hatched diamonds with dashed edges, reticle not yet shown; f684 = reticle on sybil-0, edges intact (T+11.88); **f686 = every honest→Sybil edge flashing solid flame (T+11.92 > 11.9) — this is the "≈ frame 685" check**; f692 = edges mid-wipe, diamonds hollow/dashed, strip `−9.15` (snapshot 11.9) — the −15 step lands at T+12.4 = frame 710; f700 = one-frame inverted reticle (click), `PRUNED BY SCORE` stamp; f760 = strip `−17.50` (snapshot 13.4), no attack edges; f860 = eclipse scene, camera on peer-10, honest mesh edges still attached; f862 = four eclipse diamonds grafted, flame dashed edges to peer-10; f882 = a dashed paper particle arriving at peer-10 from peer-37, no flame particles anywhere; f900 = strip `eclipse-0  +0.60` (snapshot 17.4), bar paper-1 not flame, second line the `ECLIPSE_WHY` sentence; f1120 = heal scene, 9 diamonds still at full opacity (T+23.93); f1130 = diamonds fading (T+24.27); f1170 = diamonds gone, ticker `delivery 100 % · … · healed in 1.4 s`, `HEALED` stamp.
Then `npx remotion studio`, open `LaunchWide`, scrub 660–840 with the frame counter and confirm the erase starts on 685/686 and the strip never shows a value the reel does not contain (+0.10, +0.35, −9.40, −9.15, −15.00, −17.50, −18.75).

- [ ] **Step 3: Gate** → tsc/lint/vitest green.
- [ ] **Step 4: Commit**

```bash
git add web/remotion/scenes/05-Pruned.tsx web/remotion/scenes/06-Eclipse.tsx web/remotion/scenes/07-Heal.tsx
git commit -m "feat(web): video scenes 5-7, score prune at T+11.9, the silent eclipse and the heal"
```

### Task 6.11: Stills — capture, `DitheredStill`, scenes 8–9

**Files:**
- Create: `web/public/stills/grafana.png`, `web/public/stills/jaeger.png`, `web/public/stills/geo-wave-0.png`, `geo-wave-1.png`, `geo-wave-2.png`, `web/remotion/layers/useImage.ts`, `web/remotion/layers/DitheredStill.tsx`, `web/remotion/scenes/08-SameNames.tsx`, `web/remotion/scenes/09-Mainnet.tsx`
- Test: scripted stills

**Interfaces:**
- Consumes: 6.4 `Dither`; A.19 `coverRect`; 6.6 `SERIES`; 6.7 `Parallax`, `Fig`, `Mono`, `StampIn`, `FIG`, `STAMP`; A.20 `HaloRing`.
- Produces:

```ts
export function useImage(src: string): HTMLImageElement | null       // staticFile(src); new Image() under delayRender/continueRender; module cache
export function DitheredStill(props: { src: string; box: Box; cell?: number /* 3 */; focus?: [number, number]; border?: boolean /* 1 px paper */; style?: CSSProperties }): JSX.Element
  // <Dither draw={(ctx,w,h) => ctx.drawImage(img, ...coverRect(img.width, img.height, w, h, fx, fy), 0, 0, w, h)}/>; renders nothing until the image is loaded
```

- [ ] **Step 1: Capture**

`cp assets/readme/grafana.png assets/readme/jaeger.png web/public/stills/`. Geo frames: with a phase-4 build served (`python3 -m http.server -d web/out 9000`) open `http://localhost:9000/reels/mainnet-block-wave/?theme=stage&hero=1` at 1440×840 (chrome-devtools `resize_page` + `navigate_page`), press Space, pause ~1.5 s before a wave (the first observer dots lighting), then `take_screenshot` three times stepping `seekReelToSimTime` +1 s each (`window.__luminar` or the scrubber) → `geo-wave-0/1/2.png`. If phase 4 is not merged yet, capture the same three frames from `master`'s `frontend/` at `/?reel=mainnet-block-wave&theme=stage&hero=1` (the dither makes the two indistinguishable). PNGs ≤ 400 KB each (`magick -colors 255 PNG8:`).

- [ ] **Step 2: Implement `useImage`, `DitheredStill`, scenes 08 and 09**

**08**: wide — two `DitheredStill` cards (`grafana` depth .6 at x 120, `jaeger` depth .9 at x 1000, each 760×430, 1 px paper border) entering from ±120 px over 12 frames, `Parallax pan = f × 0.1`; under them `SERIES` typed on at 2 names/s (`Mono`, each name appears at local frame 30 + 15 i); `StampIn STAMP['same-names'] tilt 3 at 10`; `Fig n=6`. Tall — one card `LAYOUT['same-names'].tall.mesh` (the 1000×600 crop of grafana with `focus [.5, .35]`), four names (`SERIES.slice(0, 4)`).
**09** (wide only; `timeline.tall` has no span): three `DitheredStill geo-wave-k` full-frame with 30-frame cross-dissolves (opacity interpolate); one `HaloRing size={180}` over the ocean (depth .4) — not a parallelogram; `Fig n=7` = `FIG.mainnet` (two lines, the second is `PROVENANCE`).

- [ ] **Step 3: Scripted stills**

Run: `npx remotion render LaunchWide <scratchpad>/s89 --frames=1240,1300,1400,1420,1460,1495 --image-format=png`. Expected: f1240 = two cards sliding in, already 1-bit (Bayer, no grey), `OPENTELEMETRY OUT` stamp; f1300 = ~4 of 7 series names typed; f1400 = all seven names in mono; f1420 = first geo frame, world land in dither, a few observer dots, halo ring; f1460 = dissolve between frames 1→2; f1495 = third frame, caption reads `Real mainnet: one slot's block, arrival at observer nodes, ~2.5 min behind.` + the provenance line. `npx remotion render LaunchTall <scratchpad>/t8 --frames=1150,1220 --image-format=png` → one card inside y 560–1160, four names, nothing below y 1600.
Run: `grep -rn "propagation\|identical\|beacon node's scoring" web/remotion/scenes --include='*.tsx' --include='copy.ts'` → empty (the test file's regex is excluded).

- [ ] **Step 4: Gate** → tsc/lint/vitest green (`copy.test.ts` must still pass with the new scene files).
- [ ] **Step 5: Commit**

```bash
git add web/public/stills web/remotion/layers/useImage.ts web/remotion/layers/DitheredStill.tsx web/remotion/scenes/08-SameNames.tsx web/remotion/scenes/09-Mainnet.tsx
git commit -m "feat(web): video scenes 8-9, dithered Grafana/Jaeger and mainnet observer stills"
```

### Task 6.12: Scenes 10–11 — honesty card and end card

**Files:**
- Create: `web/remotion/scenes/10-Honesty.tsx`, `web/remotion/scenes/11-End.tsx`
- Test: scripted stills

**Interfaces:**
- Consumes: 6.7 `HONESTY_ROWS`, `Mono`, `StampIn`, `Headline`; 6.5 `Mesh`; 6.2 `SIZE`; A.4 `REPO_URL`, `EVENT_LINE`, `MECHANISM` (props `repoUrl`, `eventLine` from `LaunchProps` reach the scene through `Launch`; add them to `SceneProps` as `repoUrl: string; eventLine: string`).

Behaviour pinned:
- **10**: pitch field; `Headline [MECHANISM] px 56 (wide) / 44 (tall)` serif at the top of the card; two-column mono table from `HONESTY_ROWS` with header `luminar · lighthouse`, rows typing on 1 row / 8 frames at `monoPx` 28 (wide) / 44 (tall); a `HaloRing` behind the right column header instead of the halftone block; `StampIn STAMP.honesty ('TOY CONSTANTS') tilt −2 at 20` large, centred below the table.
- **11**: wordmark `LUMINAR` Manrope 600 .14em at 160 px (wide) / 120 px (tall) in paper (never flame); under it `Mono repoUrl` (tall: two lines `github.com/` / `yashksaini-coder/luminar`, ≥ 40 px); `Mono eventLine`; URL and date rise with 8-frame stagger; the T+0 mesh ghosted behind at `intensity .15`, resolving back into noise over the last 40 frames (`field` 0 → .02, `intensity` .15 → 0 on `[dur−40, dur]`); one `HaloRing` lower-left where the storyboard put the parallelogram; `StampIn STAMP.end tilt 3 anchor 'tr' at 30` (wide frame 1620).

- [ ] **Step 1: Implement both scenes and thread `repoUrl`/`eventLine` through `Launch`.**
- [ ] **Step 2: Scripted stills**

Run: `npx remotion render LaunchWide <scratchpad>/s1011 --frames=1505,1540,1589,1600,1625,1700,1709 --image-format=png`. Expected: f1505 = `Same mechanism, toy constants.` serif, header row only; f1540 = all four rows (`D 6 · 8`, `prune threshold −10 · −4000 / −8000 / −16000`, `heartbeat 1 s · 0.7 s`, `score P1–P4 · P1–P7`), `TOY CONSTANTS` stamp; f1589 = same (last frame of the scene); f1600 = `LUMINAR` wordmark, URL rising; f1625 = URL + `Devcon 8 · Mumbai · 3–6 Nov 2026`, ghost mesh behind, `BREAK IT YOURSELF` stamp top-right — **this is `cover.png`/`poster.png` territory (frame 1620): check it reads as a poster on its own**; f1700 = ghost dissolving to sparse noise; f1709 = near-pure pitch with the wordmark. Tall: `--frames=1300,1400` → table at 44 px centred, wordmark 120 px, URL on two lines, all within y 220–1600.

- [ ] **Step 3: Gate** → tsc/lint/vitest green; `cd web && npx vitest run lib/copy.test.ts remotion` PASS.
- [ ] **Step 4: Commit**

```bash
git add web/remotion/scenes/10-Honesty.tsx web/remotion/scenes/11-End.tsx web/remotion/Launch.tsx web/remotion/scenes/types.ts
git commit -m "feat(web): video scenes 10-11, honesty card from engine constants and the end card"
```

### Task 6.13: Tall cut pass — safe zones and layout deltas end to end

**Files:**
- Modify: any `web/remotion/scenes/*.tsx` or `scenes/layout.ts` value the walk below falls on (no new files)
- Test: `web/remotion/scenes/layout.test.ts` (already green) + scripted stills

**Interfaces:** none new.

- [ ] **Step 1: Full tall contact sheet**

Run: `npx remotion render LaunchTall <scratchpad>/tall --frames=40,120,260,445,595,600,771,882,1005,1150,1280,1380,1439 --image-format=png`; Read each. Expected, per the storyboard's 9:16 table: mesh always inside the 1000 px square (y 460–1460); stamps in the top third but below y 220; captions left-aligned, ≤ 2 lines, bottom edge above y 1600; ticker as a 3-line stack top-left under y 220 (f260); phase label a full-width bar under the safe zone (f445); score strip full-width 140 px below the square and the focused node ringed 2 px flame (f595–600); the `ECLIPSE_WHY` line under the strip (f882); single grafana card + four names (f1150); table at 44 px (f1280); wordmark 120 px with the URL on two lines ≥ 40 px (f1380); nothing readable in the top 220 or bottom 320 px on any frame.

- [ ] **Step 2: Fix what the sheet shows** by editing `LAYOUT[*].tall` values (the test keeps every box inside the safe area) or the scene's `L = LAYOUT[id][orientation]` reads; never a second component per orientation.

- [ ] **Step 3: Verify** → re-render the frames that changed; `npx vitest run remotion/scenes/layout.test.ts` PASS; tsc/lint green.

- [ ] **Step 4: Commit**

```bash
git add web/remotion/scenes
git commit -m "fix(web): tall-cut layout deltas verified against the Reels/Shorts safe zones"
```

### Task 6.14: Render, landing plate assets, FastAPI playback

**Files:**
- Create (committed): `web/public/video/launch-16x9.mp4`, `web/public/video/poster.png`
- Create (gitignored): `web/video-out/luminar-16x9.mp4`, `web/video-out/luminar-9x16.mp4`, `web/video-out/cover.png`
- Modify: `web/package.json` `video` script crf if 6.1's 28 misses the cap; `web/remotion.config.ts` (`setChromiumOpenGlRenderer('angle')` only if needed)
- Test: scripted walk below

**Interfaces:**
- Consumes: phase 5 `components/landing/VideoPlate.tsx` (native `<video src="/video/launch-16x9.mp4" poster="/video/poster.png" preload="metadata" playsinline controls>`, 1280×720, caption `FIG3`); A.24 `make web-video`.

- [ ] **Step 1: Time one frame**

Run: `cd web && time npx remotion still LaunchWide <scratchpad>/timing.png --frame 700` → if the still takes > 150 ms per frame of pure render in the log (`Rendered frame` timing with `--log=verbose`), add `Config.setChromiumOpenGlRenderer('angle')` and re-time; keep whichever is faster.

- [ ] **Step 2: Render everything**

Run: `make web-video` (≈ 1710 + 1440 frames; several minutes). Expected: five files written; the CLI prints each output path.
Run: `ls -l web/public/video/launch-16x9.mp4 && npx remotion ffmpeg -i web/public/video/launch-16x9.mp4 2>&1 | grep -E "Stream|Duration"` → size ≤ 12 582 912 bytes (12 MB), `1280x720`, `h264`, `Duration: 00:00:57`, **no audio stream**. If the size exceeds the cap raise crf by 2 and re-run the last two script steps; if Remotion rejects `--scale 0.6667` (odd dimension), replace that step with `npx remotion ffmpeg -i video-out/luminar-16x9.mp4 -vf scale=1280:720 -c:v libx264 -crf <same> -pix_fmt yuv420p -an public/video/launch-16x9.mp4` and commit the script change.
Run: `npx remotion ffmpeg -i web/video-out/luminar-9x16.mp4 2>&1 | grep Stream` → `1080x1920`, `Duration: 00:00:48`, no audio.

- [ ] **Step 3: Play both cuts**

Run: `vlc web/video-out/luminar-16x9.mp4` then `vlc web/video-out/luminar-9x16.mp4` (or `mpv`). Expected: both play start to end without a decoder warning; in the 9:16 cut, with the player's window at phone proportions, every stamp, caption, ticker line and the table sit clear of the top 220 / bottom 320 px bands (hold a ruler at 11.5 % / 16.7 % of the height); the prune erase in the wide cut lands at 0:22.8 (frame 685 / 30).

- [ ] **Step 4: Landing plate through FastAPI**

Run: `cd web && npm run build` → `web/out/video/launch-16x9.mp4` and `poster.png` exist. Then, on a scratch copy of the repo (or after moving the old `frontend/dist` aside): `ln -s ../web/out frontend/dist && make backend`. In Chrome (chrome-devtools `navigate_page http://localhost:8000/`): scroll to Fig. 3; the poster shows the dithered end card (frame 1620); press play → the video plays inline with controls, muted autoplay does **not** happen, `FIG3` caption reads *Fifty-seven seconds: one publish, five Sybils, one eclipse, one heal.*; `list_network_requests` shows `/video/launch-16x9.mp4` with status 200 or 206 and `content-type: video/mp4`.
Run: `curl -sI -r 0-99 http://localhost:8000/video/launch-16x9.mp4 | head -5` → record `206 Partial Content` (seeking works everywhere) or `200` (Review Focus 5: report to the owner; the plate keeps `preload="metadata"`). Restore `frontend/dist`.

- [ ] **Step 5: Gate and commit**

Run: `cd web && npx tsc --noEmit && npm run lint && npx vitest run && npm run build` → green; `make check` (repo root) → green; `git status` shows only the two `public/video/` files (+ any script/config change), never `video-out/`.

```bash
git add web/public/video/launch-16x9.mp4 web/public/video/poster.png web/package.json web/remotion.config.ts
git commit -m "feat(web): render the launch video; landing mp4 (1280x720, under 12 MB) and poster committed"
```

---

### Phase acceptance gate (spec §11, Phase 6, verbatim)

Checklist: `remotion/` tree, both compositions, scenes 1–11, data from the reel, stills
captured and dithered at render time, `npm run video`, landing mp4 + poster committed.
Acceptance: the storyboard's verification (frame ≈ 685 prune, ticker numbers from analytics,
copy grep clean); both mp4s play in VLC and the 9:16 cut keeps every readable element outside
the safe zones; `public/video/launch-16x9.mp4` ≤ 12 MB and plays from `/` through FastAPI.

---

## Phase 7 — swap and deploy (1 Nov, ½ day; must land — spec §13 item 1)

**Goal:** Make `web/` the only frontend: Docker, Makefile, CI, the recorder script and every doc point at it, the old `frontend/` is deleted, `master` is tagged `pre-overhaul`, and the swap PR merges so Render/DO and the public URL serve the new UI for the talk (spec §11 phase 7, §13 item 1).

**Review focus pinned in this phase** (each line names the task whose test covers it):

1. **Host build artefacts leaking into the image** (`web/out`, `web/.next`, `web/node_modules` present on the laptop when `docker compose up --build` runs): the image must contain only what the Node stage built, never a stale `out/` — Task 7.1 Step 6 plants a canary file and asserts it is absent in the container.
2. **Slash-less routes through the Starlette mount** (`/sim`, `/reels/sybil-eclipse`, `/figure` typed by hand or in old talk notes): must 307 to the trailing-slash page, never 404 — Task 7.1 Step 5 asserts the 307 and the `Location` header.
3. **Reels and geo missing from the image** (a `.dockerignore` rule that swallows `web/public/reels` would make `/reels/<n>/` load a page that fetches a 404 and sit on the dithered progress bar forever): Task 7.1 Step 5 asserts `/reels/sybil-eclipse.jsonl` serves 3631205 bytes and `/geo/land-110m.json` 200.
4. **A Make or CI target still saying `cd frontend` after the directory is gone** (fails only when someone runs it on stage): Task 7.2 Step 1 greps the dry-run of every target, Task 7.4 Step 4 greps the whole tree.
5. **`record_reel.py record` on a fresh clone copying into a path that no longer exists** (`shutil.copy` into `frontend/public/reels/` raises after a 40 s recording): Task 7.3's test asserts `REELS_DIR.is_dir()` on the committed tree.

### Prerequisites (verified before Task 7.1 starts)

- [ ] Phases 0–6 merged into `feat/ui-overhaul`; `cd web && npm run build` writes `web/out/sim/index.html`, `web/out/reels/sybil-eclipse/index.html`, `web/out/figure/index.html`, `web/out/404.html`.
- [ ] `git check-ignore -q web/out web/.next web/node_modules` exits 0 (phase 0 added them); `git ls-files web/public/reels | wc -l` prints `5` (phase 4 committed the four reels + manifest, with `!web/public/reels/*.jsonl` in `.gitignore`).
- [ ] Docker daemon running; `docker compose version` prints a v2 version.

### Task 7.0: Contract smoke — everything compiles together

**Files:**
- Create: `web/lib/contract.test.ts`
- Modify: none.

**Accepted by:** vitest + the full gate.

**Interfaces:**
- Consumes: every public name of A.2–A.15, A.19, A.21 and the module-level additions in A.26–A.30 (`lib/*`, `components/map/*`, `components/dither/dither.ts`, `scripts/reel-stats.mjs`).

- [ ] **Step 1: Write the test** — one `import * as X from '@/…'` per module above and, for every name the contract lists, `expect(typeof X.name).toBe('function' | 'object' | 'string' | 'number')`; a rename anywhere fails this file first. Also `expect(Object.keys(KEY_BINDINGS)).toHaveLength(18)`, `expect(LAYER_IDS).toHaveLength(15)`, `expect(BAND_DENSITY).toEqual([0.12, 0.35, 0.65, 1])`.

- [ ] **Step 2: Run** — `cd /home/yks/Projects/luminar/web && npx tsc --noEmit && npm run lint && npx vitest run && npm run build` → all green; `cd /home/yks/Projects/luminar && make check` → green.

- [ ] **Step 3: Commit**

```bash
git add web/lib/contract.test.ts
git commit -m "test(web): contract smoke test over the shared interface modules"
```

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

### Task 7.2: Makefile targets renamed; CI `web-build` replaces `frontend-build`

**Files:**
- Modify: `Makefile:1` (`.PHONY`), `:8-10` (`install`), `:17-25` (`frontend`, `dev`), `:40-46` (`typecheck`, `build`, `check`), `:70-73` (`clean`)
- Modify: `.github/workflows/ci.yml:29-41` (delete the `frontend-build` job; `web-build` from phase 0 stays)
- Test: `make -n` dry runs + `make check`

**Interfaces:**
- Consumes: `web-check`, `web-build`, `web` targets as pinned in A.24.
- Produces: the post-swap target set in A.0/A.32; `make check` = `lint test web-check build` (same four job shapes CI runs: ruff, pytest, tsc+eslint+vitest, next build).

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

### Phase acceptance gate (spec §11, Phase 7 — verbatim)

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

---

# Self-review (run by the assembler, 24 Oct 2026)

**1. Spec coverage — every section points at a task.** §1–§2 goals: parity (3.12 walk, 4.9 freeze), unambiguous canvas at 50/200 (2.5, 2.9), landing (5.5–5.10), offline reels + hero (4.9, 4.8), video (6.x), Lighthouse ≥ 90 (5.13). §2 anti-goals: copy grep (1.2 test, 7.7 checklist), no CDN (0.3, 5.13 offline walk, 7.1 grep), flame rule (every glyph task), dither forbidden list (3.4–3.5 bars ≥ 12 px, 2.3 atlas). §3 constraints: static export + mount (0.1 curl walk, 4.9 walk B, 7.1), WS/REST ported (1.4, 1.7), single container (7.1), reels by relative path (1.4 `getStatic`, 4.1), Node 22 (0.4, 7.1). §4.1 tree: 0.1 (`app/`), 1.x (`lib/`), 2.x (`components/map`), 3.x (`components/sim`), 2.1/3.4/5.x (`components/dither`), 5.x (`components/landing`), 6.x (`remotion/`), 5.8 (`figures/sorter`), 4.1 (`public/reels`, `geo`), 0.3 (`fonts`), 6.14 (`video`). §4.2: 0.1 (config, phase function), 1.7 (`wsUrl`), 4.3 (`generateStaticParams`), 5.9 (`useSearchParams` under `Suspense`), 4.4 (`ReelRedirect` without it). §4.3: 0.2. §4.4: 1.5 (store shape, one `setState` per batch, referential-stability test), 1.9 (CustomEvents → actions), 2.4 (per-frame data in renderer scope). §4.5: 2.4. §4.6: 0.3 + A.0 font-family rule (2.4, 2.5). §4.7: 0.1 pins, 6.1 remotion pins. §4.8: 4.1 (`redirectTarget`, `carryParams`), 4.4, 4.5 (share), 5.9 (`?press=`). §4.9: 1.4, 1.6 (`gap`), 1.8 (streaming). §4.10: 1.2. §5: 0.2 (tokens verbatim test), 2.0a (palette from tokens), 4.7 (stage by tokens, no `zoom` grep). §6.1 items 1–10: 5.6, 5.7, 5.5 (+5.4 frames, 5.0 script), 5.7 readouts, 5.7, 5.9, 5.10, 5.10, 5.10, 5.10; phone 390: 5.13. §6.2 toolbar 3.1 · strip/scrubber 3.2 · menus 3.3 · canvas overlays 2.7/3.1 (provenance)/3.8/3.9/3.2 (kbd row)/2.8 · render table 2.3/2.5/2.6/2.7 · left rail 3.4/3.5 · right rail 3.6/3.7 · telemetry badge 3.1 · keyboard 1.3/3.10 · drawers 3.11. §6.3: 4.7, 4.8. §6.4: 1.8, 4.2–4.6, 4.9. §7: 2.0b (Bayer core), 5.3 (`DitherCanvas`, `Loupe`), 3.4 (`HaloRing`, `Diamond`), 2.1 (`Reticle`), 5.1 (`Stamp`), 5.2 (`Figure`), 2.3 (atlas halos), 2.7 (`FillStyleExtension`), functional-dither table: plates 5.5/5.10, halos 2.5, sparkline/CDF/bars 3.4/3.5, wash bands 3.2, loading states 4.3 (reel progress) / 5.3 (skeleton) / **5.12 (canvas reveal — added)**, Geo land 2.7, video 6.4. §7.4: 5.5 (alive plates, reel cards 5.6, poster 5.10), legend twins 3.8/5.11, reticle cursor 2.1/2.4/5.2, loupe 5.3/5.5. §8: 5.8, 5.9. §9: 6.1–6.14. §10: contrast via tokens + Lighthouse 5.13; reduced motion 1.9 (boot), 2.5–2.7, 3.9, 5.2–5.6, 5.13; keyboard/semantics 3.2, 3.3, 3.6, 3.8, 3.9, 3.10, 5.6; `color-scheme: dark` **0.2 (added)**. §11: each phase ends with its gate task (0.4, 1.10 + phase gate, 2.9, 3.12, 4.9, 5.13, 6.14, 7.7); the cut rule is in the phase-2 heading. §12 builder's calls are taken in the task text and named as such. §13: all five decisions are constraints; 7.7 (merge + tag), 3.1 (badge only), 6.14 (no audio stream), 5.8 (no hood/bulkhead), 3.1 (`20 50 100 200`).

**Gaps found and closed:** (a) the §7 "canvas reveal on first snapshot (28→3 over the rendered frame)" had no task → Task 5.12 + `CanvasReveal` (A.30); (b) `Provenance.tsx` was consumed by 3.1 and modified by 4.6 but created nowhere → created in 3.1 (A.28); (c) `particlesEnabled` "forced false at boot under reduced motion" (§10) had no owner → `initPrefs()` in Task 1.9 with a test; (d) `html { color-scheme: dark }` (§10) was asserted in a walk but not written → 0.2 rule + test; (e) the `TextLayer` would have waited on a literal `"IBM Plex Mono"` that `next/font/local` never registers → `monoFamily()` from the computed `--font-mono` (2.4, 2.5, A.0); (f) duplicate definitions — `Reticle` (2.1 and 5.1), `HaloRing`/`Diamond` (3.4 canvas vs 5.1 SVG), auto-Geo (2.7 effect and 4.6 subscription), `SimShell` vs the server-rendered `SimApp`, and a vitest `include` that would have skipped every `.test.tsx` → settled in A.0 with one owner each; (g) the contract's Part B tasks 8–12 had no slot in the phase order → 1.9, 2.0a, 2.0b, 3.0, 5.0, 7.0; (h) `isSimPeer` was declared in two files → `lib/format.ts` with a re-export.

**2. Step scan.** Every step names a file, a signature or a command with its expected output; steps that read "per the header block" in the parts now read "per A.2x". Bodies appear only where the signature and tests do not determine them (layer props, menu positioning, the colorfigure geometry, the `keydown` guard of 3.10 that carries a review-focus decision) or where the spec fixes exact copy. The one algorithm transcribed in prose (the frozen-Force rules under A.14) is the PR #5 behaviour the spec declares unchanged, kept so the port can be checked against it.

**3. Type consistency.** Grepped across tasks: `snapWith`/`peerNode`/`peers`/`ring` (A.26) are the only fixtures; `ParticleKind` uses `'spam'` everywhere (never `'sybil'`); `LAYER_IDS` strings match A.17's order and the walks' `layerIds()` checks; `nodeRadiusPx` is the single radius function (2.2 → 2.4–2.8, 5.12); `reducedMotion()` from `@/lib/prefs` is the only motion query (no second `matchMedia` string); `REEL_MANIFEST` is the only manifest source in code (`Nav`, `ReelRedirect`, keys, `reels/[name]`), the manifest file is read by tests only; `Stamp`, `HaloRing`, `Diamond`, `Reticle` are default exports with the A.20 props and are imported by the legend, the plates and the video from the same paths; `tickerCells(s: AppState)` matches its `useStore(tickerCells)` call; `Ticker` in `components/sim/` and `Ticker` in `remotion/mesh/` are different modules and are never imported into the same file; `bootSim`/`teardownSim`/`openReel`/`initUrlMoment`/`initAutoGeo` have one signature each (A.29) across 2.7, 4.2, 4.5, 4.6.

**4. Review Focus.** The five global lines in the header are pinned: 1 → Task 4.2 (`bootSim live with the backend down`), 2 → Task 1.8 (`a file truncated mid-line at EOF`), 3 → Task 1.9 (`initPrefs forces particles off under reduced motion`), 4 → Task 2.4 (`a 0×0 field never produces a NaN view state`), 5 → Task 4.5 (`without navigator.clipboard … an unknown ?peer= is ignored`). The parts' own five-per-phase lists stay at the top of each phase section with their task references intact.

**5. Proportion.** The plan is long because it carries the parity checklist's acceptance walks (one observation per inventory row) and one test file per pure module; code blocks are test assertions and exact signatures, not implementations. Each task is still one sitting: a failing test or a walk, one implementation step with the decisions named, a gate command with its expected output, and a commit.

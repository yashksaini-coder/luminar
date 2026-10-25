# Next.js architecture for the UI overhaul

> Historical record of the `frontend/` tree at git tag `pre-overhaul` (eb26490, 2026-10-24);
> the shipped frontend is `web/`.

Decision record for porting `frontend/` (vanilla TS + Vite + deck.gl, ~3.7k lines) to
Next.js on `feat/ui-overhaul`. Every section ends with **Recommended** and the tradeoff.
Verified 2026-10-24 against npm (`npm view <pkg> version`), Node v26.8.2, npm 11.

## 0. Constraints that drive everything

- Production is **one FastAPI process** (`backend/main.py:1041-1045` mounts
  `frontend/dist` with `StaticFiles(html=True)` as the last route). `Dockerfile` builds the
  frontend in a `node:22-slim` stage and copies `/frontend/dist`. `render.yaml`, `.do/app.yaml`,
  `docker-compose.yml` all run that single container on `$PORT=8080`. `start.sh` only starts
  the backend. There is no Node process in production and we do not want one at the venue.
- `/ws/events` streams orjson snapshots at 20 Hz. The current renderer is imperative
  (`frontend/src/map/renderer.ts`: `new Deck(...)`, `deck.setProps({layers})` from a rAF loop,
  module-level mutable state). That design is correct and must survive the port.
- Reels are 2.2-6.8 MB `.jsonl` files in `frontend/public/reels/` fetched by path with
  `getStaticText` (frontend origin, never the API origin). `/geo/land-110m.json` likewise.
- `VITE_API_URL` is build-time and unset in the single container (same-origin relative URLs).
- Venue network is unreliable: no runtime font CDN, no runtime image optimizer, offline reels
  must work.

## 1. Static export vs Node server

**Recommended: `output: 'export'`** with `trailingSlash: true`, `images.unoptimized: true`.

Why:
- Zero change to the deployment story: FastAPI keeps serving a static directory. Render free
  tier and DO stay one container; Vercel also serves a static export natively.
- `StaticFiles(html=True)` already does what the export needs: `/sim/` -> `sim/index.html`,
  `/sim` -> 307 to `/sim/` (Starlette redirects directory hits when `html=True`), unknown
  paths -> `404.html` (Next writes one). `trailingSlash: true` makes Next emit
  `sim/index.html` rather than `sim.html`, which is the shape Starlette resolves.
- Nothing in this app needs a server: no auth, no SSR data, the API is FastAPI.
- A Node server would double the processes in the container, need a reverse proxy or a second
  port, and change `render.yaml`/`Dockerfile`/health checks for no feature gain.

Tradeoff: we give up Next rewrites/middleware/route handlers/`next/image` optimization in
prod (section 12). Dev still gets rewrites for the API proxy (section 13). If a server is
ever needed (e.g. OG-image route handlers), it is a one-line `output` change plus a Node
stage in the Dockerfile; nothing in the app code depends on export.

## 2. Where it lives

**Recommended: new top-level `web/` beside `frontend/` until parity, then swap.**

- `frontend/` stays shippable on `master` during the whole port; `feat/ui-overhaul` can be
  rebased without conflicts in `frontend/`.
- Swap = one PR: `git mv web frontend`, Dockerfile `COPY --from=frontend-build /frontend/out`,
  `backend/main.py:1043` `"dist"` -> `"out"`, Makefile targets. Until then `backend/main.py`
  is untouched.
- Reels and geo are copied once (`cp -r frontend/public/{reels,geo} web/public/`) and the
  recorder script's output path is pointed at `web/public/reels/` at swap time.

Tradeoff: two `node_modules` and two `package-lock.json` for a few weeks, and the CI matrix
builds both. In-place replacement would save that but breaks `make dev`/Docker on the branch
from commit one and makes partial PRs unreviewable.

## 3. App Router layout

```
web/
  app/
    layout.tsx            # fonts, tokens, <html data-theme>, no client state
    page.tsx              # / landing: hero (dither canvas), figures, Remotion Player
    sim/page.tsx          # /sim: the app shell (server component) -> <SimApp/> client
    reels/[name]/page.tsx # generateStaticParams from public/reels/manifest.json
    figure/page.tsx       # /figure: standalone dithered figure for screenshots/talk
    not-found.tsx
  components/
    sim/                  # SimApp.tsx (client root), panels, inspector, playback
    map/                  # DeckCanvas.tsx (canvas owner), renderer.ts (imperative, ported)
    dither/               # DitherCanvas.tsx, halftone masks, Stamp.tsx, Figure.tsx
    landing/              # hero, sections
  lib/
    api/                  # client.ts, websocket.ts, replay.ts (ported ~1:1)
    store.ts              # zustand
    palette.ts, format.ts, types.ts   # ported 1:1
  remotion/               # compositions (section 10)
  public/reels, public/geo, public/fonts
```

Server components by default; only `components/sim/**`, `components/map/**`,
`components/dither/**` and the Player wrapper are `"use client"`. The landing stays
server-rendered HTML with client islands, which is what makes it load instantly on venue Wi-Fi.

## 4. deck.gl + luma.gl in React

**Recommended: one client-only `<DeckCanvas>` that owns the `<canvas>`; the imperative
renderer is kept as a plain module, not React state. Do not use `@deck.gl/react`.**

- `const DeckCanvas = dynamic(() => import('@/components/map/DeckCanvas'), { ssr: false })`
  in `sim/page.tsx`. deck.gl touches `window`/WebGL at import time, so SSR must be off and
  the import must be deferred, not just the render.
- `DeckCanvas` is ~40 lines: a `useRef<HTMLCanvasElement>` and a `useEffect` that calls
  `initRenderer(canvas, tooltipEl)` on mount and `destroyRenderer()` on cleanup. StrictMode
  double-mount in dev is handled because `destroyRenderer` already exists
  (`renderer.ts:595`).
- `renderer.ts` ports as-is: module-level `deck`, `renderLayers()`, `startAnimationLoop()`,
  `spawnParticle()`, `fitView()`. It reads the store via `useStore.getState()` inside the rAF
  loop, never through hooks. No deck.gl object ever lives in `useState`.
- Resize: a `ResizeObserver` on the canvas's parent in the same `useEffect`, calling
  `resizeRenderer(w, h)` (`renderer.ts:109`). Not `window.resize`: the hero/stage layouts
  change the canvas box without a window resize.
- `@deck.gl/react`'s `<DeckGL>` is rejected: it re-creates layers from React props, which
  invites the 20 Hz re-render problem and fights the existing rAF/`setProps` loop.

Tradeoff: one `useEffect` with refs is "un-React", but it is the proven pattern for canvas
libraries and keeps the port of `renderer.ts` a copy, not a rewrite.

## 5. State: zustand vs the plain singleton

**Recommended: zustand 5 (`create` + selectors), with the hot path kept out of React.**

- The existing `store.ts` is already a flat object read by `renderer.ts` and mutated by the WS
  handler. zustand is the same object with subscriptions: `useStore.getState()` /
  `useStore.setState()` from non-React code (renderer, WS manager), `useStore(s => s.x)` from
  components. ~60 lines of `AppStore` interface port verbatim.
- The 20 Hz rule: the WS `snapshot` handler writes `nodes`, `mesh`, `stateDistribution`,
  `simTime` with one `setState`. Only components that select those keys re-render; the panel
  that shows `simTime` re-renders at 20 Hz (it is one text node), the tree does not. The
  renderer reads `getState()` in rAF, so the canvas never goes through React at all.
- Rules enforced in review: never `useStore()` without a selector; arrays of nodes are
  selected only by panels that list them, and those use `useShallow` or a derived count.
  Large per-frame data that no DOM reads (`nodePositions`, particle buffers) stays in
  `renderer.ts` module scope, not in the store.
- Why not keep the plain singleton plus a manual `subscribe`: that is zustand reimplemented
  in 30 lines without `useSyncExternalStore` tearing guarantees. Why not Context: Context
  re-renders every consumer on every change, which is exactly the 20 Hz failure.

Tradeoff: one dependency (zustand 5.0.16, 1 kB). Immer not needed; updates are shallow sets.

## 6. WebSocket lifecycle

**Recommended: port `WSManager` (`frontend/src/api/websocket.ts`) unchanged as a module
singleton; a `useEffect` in `SimApp` calls `ws.connect()` on mount and `ws.disconnect()` on
unmount.**

- The single-socket invariant and exponential reconnect (1 s -> MAX) already exist and were
  bug-fixed in #4; do not reimplement them as a hook.
- URL: `process.env.NEXT_PUBLIC_API_URL ?? ''` replaces `import.meta.env.VITE_API_URL`;
  the `ws(s)://${location.host}` fallback is unchanged. `NEXT_PUBLIC_*` is inlined at build
  time exactly like Vite's, so the single container still leaves it unset.
- Batched callbacks (`BATCH_MS` flush) call `useStore.setState` once per batch. The events
  ring stays capped at `maxEvents`.
- App Router client navigation between `/sim` and `/reels/[name]` unmounts `SimApp`, which
  disconnects; that is desired (reels are offline). `/` never connects.

Tradeoff: none; this is the lazy path and the existing code is the tested one.

## 7. Reels from `public/`

**Recommended: `web/public/reels/*.jsonl` + `manifest.json`, fetched with relative paths
exactly as today (`getStaticText('/reels/x.jsonl')`).** Static export copies `public/`
verbatim; FastAPI serves them from the same mount. `reels/[name]/page.tsx` reads
`manifest.json` at build time (`fs.readFile` in `generateStaticParams`) so each reel gets a
pre-rendered page with its title in the HTML; the client then loads the `.jsonl`.
`scripts/record_reel.py` output path moves at swap time only. Keep `--nodes 50 --duration 40`
recordings; 6.8 MB for mainnet-block-wave is fine on localhost, and gzip from FastAPI is not
configured today, so do not grow them.

## 8. Styling

**Recommended: Tailwind v4 (`@tailwindcss/postcss`) with the design tokens declared as CSS
variables in `app/globals.css` via `@theme`.** Tokens: `--color-ink: rgb(11 11 13)`,
`--color-paper: rgb(242 242 239)`, `--color-signal: rgb(255 90 44)`, plus the sim palette
from `palette.ts` (which stays TS because deck.gl needs RGBA arrays; export both from one
source file and generate the CSS block with a tiny script, or duplicate the three brand
colours and keep the peer-state colours TS-only).

- Tailwind v4 is CSS-first: `@theme { --color-signal: ... }` makes `bg-signal` and
  `var(--color-signal)` the same token, which is what a token-driven dither design wants.
  The halftone `mask-image`, `image-rendering: pixelated`, `clip-path` polygons and rotated
  stamps are one-off CSS; they live in `globals.css` as plain classes or in `@utility`.
- CSS Modules: fine, but every token becomes `var(--x)` typed by hand and layout utilities
  get rewritten per component. vanilla-extract: a build plugin and a second type system for a
  three-colour design; rejected as weight without benefit.
- The existing `style.css`, `styles/map.css`, `styles/panels.css` (~panels, legend, stage
  theme) port as plain CSS first, then get trimmed as components are rebuilt.

Tradeoff: Tailwind adds `tailwindcss` + `@tailwindcss/postcss` (4.3.3) to the build. No
runtime cost in the export.

## 9. Fonts

**Recommended: `next/font/local` with files from `@fontsource-variable/manrope`,
`@fontsource-variable/newsreader` (italic serif for "Fig. 1" captions) and
`@fontsource/geist-mono` (already used today), copied to `web/public/fonts/` once.**

- `next/font/google` self-hosts at build time, so it also never hits a CDN at runtime, but it
  downloads from Google at build time; a Docker build on Render or a laptop at the venue with
  no network would fail. `next/font/local` has no network step anywhere.
- Each font is declared once in `app/layout.tsx` with a `variable` (`--font-sans`,
  `--font-serif`, `--font-mono`) and referenced from the Tailwind `@theme`.
- Newsreader over Instrument Serif: it ships a real italic with optical sizes, which is what
  the caption style needs; Instrument Serif has one weight. Both exist on npm (5.3.0).

Tradeoff: ~300 kB of woff2 in the repo. Acceptable; it is the price of offline.

## 10. Routes

| Route | Type | Notes |
|---|---|---|
| `/` | static | landing: dither hero, figure sections, Remotion `<Player>` island, CTA to `/sim` |
| `/sim` | static shell, client app | `SimApp` with `DeckCanvas`; `?theme=stage&hero=1` and `?reel=` keep working via `useSearchParams` inside a `<Suspense>` (required for export) |
| `/reels/[name]` | `generateStaticParams` | one page per manifest entry; loads the reel and renders `SimApp` in reel mode; replaces `?reel=<name>` but the query form is kept as a redirect-in-client for old links in talk notes |
| `/figure` | static | single full-bleed dithered figure with caption; used for screenshots and the Remotion composition |

## 11. Remotion

**Recommended: `web/remotion/` inside the Next app (same `package.json`), not a separate
package.** Compositions import the same `DitherCanvas`, `Stamp`, tokens and fonts, so the
launch video is pixel-identical to the site. `remotion` + `@remotion/player` are runtime
deps (the Player is a client island on `/`, playing the composition inline at 0 bytes of
video); `@remotion/cli` is a dev dep for `npx remotion render` / `studio`. A separate package
would mean a workspace, duplicated tokens and a build step to share components, for one video.

Caveats: `Root.tsx` registers compositions; the Player wrapper is `"use client"` and
`dynamic(..., {ssr:false})` because Remotion reads `window`. Fonts in the render come from
the same `public/fonts` files via `@remotion/google-fonts`-free `@font-face` in the
composition's CSS. Rendering needs Chrome headless locally; it is not part of CI.

Tradeoff: `remotion` adds ~2 MB to `node_modules`, nothing to the export beyond the Player
chunk on `/`.

## 12. Static export caveats (and how each is handled)

- Dynamic routes need `generateStaticParams`: only `/reels/[name]`; it reads the manifest.
  Adding a reel = re-record + rebuild, which is already the workflow.
- No `next/image` optimization: `images.unoptimized: true`; dither figures are
  `<canvas>`-generated or pre-dithered PNGs (1-bit PNGs are tiny anyway).
- No rewrites/redirects/middleware/route handlers in the output: the API proxy exists only in
  dev (`next.config.ts` `rewrites()` to `:8000`, ignored by export); prod is same-origin.
- `useSearchParams` must be under `<Suspense>` or the export errors.
- `next/font/google` is allowed by export but rejected for the offline reason above.
- `trailingSlash: true` is required for the Starlette mount (section 1).
- `next dev` with Turbopack (default in 16) is fine; `next build` is run with `NODE_ENV`
  unset so `NEXT_PUBLIC_API_URL` is read from the Docker build arg only when passed.

## 13. Makefile, CI, Dockerfile, env

During the parallel phase (new targets, old ones untouched):

```make
web:        cd web && npm run dev            # :3000, rewrites /api and /ws to :8000
web-build:  cd web && npm run build          # writes web/out
web-check:  cd web && npx tsc --noEmit && npm run lint
```

At swap: `frontend` -> `web` rename in `install`, `frontend`, `dev`, `typecheck`, `build`,
`clean` (`rm -rf web/out web/.next`); `check` unchanged in shape.

CI: add a `web-build` job mirroring `frontend-build` with
`cache-dependency-path: web/package-lock.json`, `npm ci`, `npx tsc --noEmit`,
`npm run lint`, `npm run build`. Keep `node-version: 22` (Next 16 needs >= 20.9; the
Dockerfile stage is `node:22-slim` and should stay in step with CI rather than v26).

Dockerfile stage 1 at swap:

```dockerfile
FROM node:22-slim AS frontend-build
WORKDIR /web
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ ./
ARG NEXT_PUBLIC_API_URL=
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
RUN npm run build
# stage 2: COPY --from=frontend-build /web/out frontend/dist   (path main.py expects)
```

Keeping the destination as `frontend/dist` means `backend/main.py:1043` does not change at
all; `docs/deployment.md` gets one paragraph. `WebSocket` dev proxy: `next.config.ts`
`rewrites()` handles `/api/:path*`; WS upgrade through Next dev rewrites is unreliable, so
in dev `websocket.ts` falls back to `NEXT_PUBLIC_WS_URL ?? 'ws://localhost:8000'` when
`location.port === '3000'`. Prod stays `location.host`.

Env rename: `VITE_API_URL` -> `NEXT_PUBLIC_API_URL`, same semantics (build-time, unset for
the single container). `docs/deployment.md` table row updated at swap.

## 14. Dependencies (all versions verified on npm 2026-10-24)

```json
{
  "dependencies": {
    "next": "16.4.3",
    "react": "19.3.1",
    "react-dom": "19.3.1",
    "zustand": "5.0.16",
    "@deck.gl/core": "9.4.0",
    "@deck.gl/layers": "9.4.0",
    "@luma.gl/core": "9.4.2",
    "@luma.gl/webgl": "9.4.2",
    "d3-force": "3.0.0",
    "culori": "4.0.2",
    "remotion": "4.0.538",
    "@remotion/player": "4.0.538"
  },
  "devDependencies": {
    "typescript": "5.9.3",
    "@types/react": "19.3.0",
    "@types/react-dom": "19.3.0",
    "@types/node": "26.6.5",
    "@types/d3-force": "3.0.10",
    "tailwindcss": "4.3.3",
    "@tailwindcss/postcss": "4.3.3",
    "eslint": "10.13.0",
    "eslint-config-next": "16.4.3",
    "@remotion/cli": "4.0.538",
    "@fontsource-variable/manrope": "5.3.0",
    "@fontsource-variable/newsreader": "5.3.0",
    "@fontsource/geist-mono": "5.3.0"
  }
}
```

Notes: deck.gl 9.4 (up from 9.2 in `frontend/`) requires luma 9.4; both bumped together.
`typescript` pinned to 5.9.3, not 7.0.2: TS 7 is the Go port and `eslint-config-next`/Next 16
tooling targets 5.x. The fontsource packages are dev deps because the woff2 files are copied
to `public/fonts` once and loaded via `next/font/local`; they are not imported at runtime.
`@deck.gl/react` and `@deck.gl/widgets` deliberately absent (section 4).
`@fontsource/geist` (sans used today) is dropped for Manrope. Pin exact, no carets; the
lockfile is committed.

## 15. Ordered build sequence

1. Scaffold `web/`: `next.config.ts` (`output: 'export'`, `trailingSlash`, `images.unoptimized`,
   dev `rewrites`), `app/layout.tsx` with fonts + tokens, `globals.css` with `@theme`, empty
   `/`, `/sim`, `/figure`. `make web` and `make web-build` work; `out/` serves from FastAPI
   by symlinking `frontend/dist -> ../web/out` locally to prove the mount.
2. Port `lib/`: `types.ts`, `palette.ts`, `format.ts`, `api/client.ts` (env rename),
   `api/websocket.ts`, `api/replay.ts`. Pure TS, `tsc` green, no components yet.
3. `lib/store.ts` as zustand; `SimApp` client root that connects the socket and shows a
   connection badge and `simTime` from a selector (proves the 20 Hz path re-renders one node).
4. `components/map/renderer.ts` ported with `layout.ts` and `overlay.ts`; `DeckCanvas` with
   dynamic import, mount/unmount and `ResizeObserver`. The graph renders live. This is parity
   on the thing that matters; everything after is panels.
5. Panels in the order a demo uses them: playback, stats, legend + mode switcher, events,
   peer inspector, telemetry, narrator, keyboard. Each is a selector-driven component; old
   `ui/*.ts` DOM code is the reference, not the base.
6. Reels: `public/reels`, `/reels/[name]` with `generateStaticParams`, old `?reel=` link
   redirect. Stage theme and hero via `useSearchParams`.
7. Dither system: `DitherCanvas` (ordered Bayer / Floyd-Steinberg on an offscreen canvas,
   `image-rendering: pixelated`), halftone mask utility, `Stamp`, `Figure` with the italic
   caption. `/figure` route.
8. Landing `/`: hero with parallax depth layers (pointer-driven `translate3d`, `data-depth`),
   sections, CTA. Copy honours the honesty lines ("same mechanism, toy constants";
   "reproducible recordings"; live data is arrival at observer nodes, ~2.5 min behind).
9. Remotion: `remotion/Root.tsx`, launch composition reusing step 7 components, `<Player>`
   island on `/`, `npm run video` script for local render.
10. Swap: `git mv`, Dockerfile, Makefile, CI, `docs/deployment.md`, `scripts/record_reel.py`
    output path, delete `frontend/`. `make check` green, `docker compose up --build` serves
    `/`, `/sim/`, `/reels/<name>/` from FastAPI.

Steps 1-4 are the risk; if deck.gl 9.4 under React 19 + Turbopack misbehaves it shows up by
step 4, before any panel work is sunk.

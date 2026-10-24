# Luminar UI overhaul — design document

Date 2026-10-24 · branch `feat/ui-overhaul` · base commit `eb26490` · owner Yash Saini.
Status: **approved by the owner on 24 Oct** (direction, removals, the twist in §7.4 and every item in §13).
A builder plans and executes from this document without asking the owner.

Inputs this document settles (all under `docs/design/`, verified today): `backboard-teardown.md`,
`ui-inventory.md`, `nextjs-architecture.md`, `figure-concept.md`, `launch-video-storyboard.md`,
`direction-verdict.md`, `tokens.css`, and the winning direction mockup `instrument-panel`
(scratchpad `overhaul/directions/instrument-panel/`). Where two inputs disagree, the decision is
stated here and the reason given in one line. Where this document is silent, see §12.

---

## 1. Intent and why

Luminar is presented at **Devcon 8, Mumbai, 3–6 Nov 2026**. The talk runs from a recorded reel on
a laptop, with the live engine as the encore, and the audience opens the same reel on their
phones. The current frontend (vanilla TS + Vite + deck.gl, `frontend/`) works and **stays on
`master` as the fallback demo**; nothing in this plan may break it.

The overhaul rebuilds the whole frontend in Next.js with one visual system: a dark near-black
field, off-white ink, one hot accent, and 1-bit ordered dither used as an instrument (density
means something) rather than as decoration. It fixes the seventeen pain points the inventory
lists (imperative DOM, lying toasts, the live-seek trap, `zoom: 1.3` stage mode, a desktop-only
shell, milestones-as-noise, the inspector that hides an eclipse) and adds three things the talk
needs that today's UI cannot give: a landing page that explains the project in thirty seconds,
a physical "how GossipSub works" figure, and a launch video for social.

The visual language is **taken from backboard.io as technique only** (plate, dither, stamp,
halftone, parallax, serif-for-thinking / sans-for-doing). None of their copy, wordmark, logo,
photograph or product names appears anywhere.

Ten calendar days remain. §11 is cut so that the simulator reaches parity first, the landing and
video second, and so that at every day's end `master` is still the working demo.

## 2. Goals, non-goals, anti-goals

**Goals**

1. Feature parity with `frontend/` for everything the inventory marks **Keep** or **Improve**
   (Improve items ship with the named fix). **Drop** items are not ported.
2. A mesh canvas that is unambiguous at 50 and at 200 nodes, on a phone and at 10 m from a
   projector, in greyscale and under deuteranopia (every role = colour **and** shape).
3. A landing page (`/`) with hero plate, the colorfigure plate, the launch video, honest copy.
4. A stage/hero broadcast view and offline reels that survive with no backend and no network.
5. The Remotion launch video, 16:9 and 9:16, rendered from reel data, in the same tokens.
6. WCAG AA for every text pair; Lighthouse accessibility ≥ 90 on `/`, `/sim/`, `/reels/<name>/`.

**Non-goals**

- No backend changes, no new API, no new WebSocket, no gzip for reels, no sampled mesh above 100
  nodes (the backend sends `{}`; the UI says so).
- No light-mode toggle. The light tokens stay in `tokens.css` (the plate override is already
  written) but no UI exposes them before Devcon.
- No auth, SSR data, OG-image route handlers, analytics, or CMS.
- No telemetry-drawer redesign beyond what §13 decides.
- No Playwright suite in this branch (the acceptance tests in §11 are manual browser walks plus
  `tsc`/`lint`/`build`).

**Anti-goals** (a build that does any of these is rejected)

- Never misrepresent protocol fidelity. Copy says **"same mechanism, toy constants"**; never
  "the scoring your beacon node runs". Reels are **"reproducible recordings"**, never
  "identical runs".
- Never claim the mesh path for live data. Mainnet copy is **"arrival at observer nodes,
  ~2.5 min behind"**, and the provenance card keeps its sentence verbatim
  (`arrival at observer nodes, not mesh paths · data: ethPandaOps (CC BY 4.0)`).
- No runtime dependency on Google Fonts, Fontshare, any CDN, `next/image` optimisation or a
  YouTube embed. Venue Wi-Fi is assumed down.
- Offline reels must keep working with **no backend**: `/reels/<name>/` from a static file
  server, socket never opened, every panel populated from the recording.
- `--flame` is never a brand accent, hover, link or primary button. It means attacker / fault /
  alarm and nothing else.
- No dither on text, numbers, attackers, particles, focus rings, or any chart under 12 px tall.

## 3. Constraints

| Constraint | Consequence |
|---|---|
| Backend untouched (`backend/main.py:1043` mounts `frontend/dist` with `StaticFiles(html=True)`) | Next **static export**; Docker copies `web/out` to the path main.py already expects |
| Same WebSocket contract (`/ws/events`, orjson binary frames + text event batches at 20 Hz) | `api/websocket.ts` is ported unchanged as a module singleton |
| Same REST contract (inventory §4.1) | `api/client.ts` ported; `post()` now returns `{ok, status, data}` so toasts can tell the truth |
| Single-container deploy (`Dockerfile`, `render.yaml`, `.do/app.yaml`, `docker-compose.yml`, `start.sh`, `$PORT=8080`) | No Node process in production; no rewrites/middleware in the output; dev proxy only |
| `master` must stay shippable | New app lives in `web/` beside `frontend/` until the swap PR (§11 phase 7) |
| 17 MB of reels in `public/` | Fetched by relative path from the frontend origin, exactly as today; no growth |
| Venue laptop: Node 22 (`node:22-slim` in Docker, `node-version: 22` in CI) | Pin Node 22-compatible versions; Next 16 needs ≥ 20.9 |
| Devcon in 10 days | Phase order and the cut rule in §11 are binding |

## 4. Architecture (decided)

Follows `docs/design/nextjs-architecture.md` except where marked **changed**.

### 4.1 Location and directory

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

`frontend/` is not touched until phase 7. Makefile gains `web`, `web-build`, `web-check`
targets; the old targets stay.

### 4.2 Next.js and export

- `next` **16.4.3**, `react`/`react-dom` **19.3.1**, `typescript` **5.9.3** (not 7.x),
  `eslint-config-next` 16.4.3. Versions were checked against npm on 2026-10-24 by the
  architecture doc; the builder re-runs `npm view <pkg> version` before pinning and pins exact.
- `output: 'export'`, `trailingSlash: true` (Starlette resolves `sim/index.html`),
  `images.unoptimized: true`. Dev `rewrites()` proxies `/api/:path*` to `:8000`; the WebSocket
  in dev connects to `NEXT_PUBLIC_WS_URL ?? 'ws://localhost:8000'` when `location.port === '3000'`;
  in prod it stays `location.host`.
- `useSearchParams` only under `<Suspense>`. Only `/reels/[name]` is dynamic
  (`generateStaticParams` reads the manifest with `fs`).
- `VITE_API_URL` → `NEXT_PUBLIC_API_URL`, same semantics (build-time, unset in the container).

### 4.3 Styling — **changed**: plain CSS, no Tailwind

`tokens.css` is already hand-authored with `@supports (color: oklch())` overrides,
`[data-theme="light"] .plate`, `[data-stage="1"]` and reduced-motion blocks that Tailwind's
`@theme` cannot host, and the UI has about a dozen distinct components. So:
`app/globals.css` = `tokens.css` verbatim (it is the single source; edit it only there) +
≈300 lines of base rules (reset, type classes, `.hair`, `.plate`, buttons, menu, kbd); every
component ships a CSS Module. No utility framework, no CSS-in-JS. Tailwind is permitted later
only if tokens remain the one source.

### 4.4 State

`zustand` 5 (`create` + selectors). `AppStore` ports from `frontend/src/store.ts` with these
changes: `selectedPeer: string | null` and `hoveredPeer` by id (not index); `toasts: Toast[]`
queue; `droppedEvents` is displayed; `beats` replaces `milestones` (counters dropped).
Rules: never `useStore()` without a selector; node arrays only via `useShallow` in the panels
that list them; per-frame data that no DOM reads (`nodePositions`, particles, atlas) lives in
`renderer.ts` module scope. The WS batch handler calls `setState` once per batch. The nine
`luminar:*` CustomEvents become store actions (`selectPeer`, `fitView` via a renderer
subscription, `setPref`, `enterReel`, `share`, `simAction`, `setDuration`).

### 4.5 Renderer in React

One client-only `<DeckCanvas>` (`dynamic(..., {ssr:false})`), a `useRef<HTMLCanvasElement>`,
one `useEffect` → `initRenderer(canvas, tooltipEl)` / `destroyRenderer()`, a `ResizeObserver` on
the canvas parent → `resizeRenderer`. `renderer.ts`, `layout.ts` (PR #5 frozen force layout)
port as plain modules reading `useStore.getState()` in rAF. `@deck.gl/react` is not used.
deck.gl **9.4.0** (`core`, `layers`, `extensions`), luma.gl 9.4.2.

### 4.6 Fonts — **changed**: Instrument Serif, IBM Plex Mono, Manrope

The verdict (later than the architecture doc) chose one serif, Instrument Serif, and IBM Plex
Mono for everything that counts; the tokens are written for them. All three via
`next/font/local` from woff2 files copied once into `public/fonts/` from
`@fontsource/instrument-serif` 5.3.0 (400 roman + italic), `@fontsource/ibm-plex-mono` 5.3.0
(400/500/600), `@fontsource-variable/manrope` 5.3.0 (all OFL; npm versions checked today).
No network at build or run time. `layout.tsx` exposes `--font-display`, `--font-mono`,
`--font-ui` and `tokens.css` already references those names. The deck.gl `TextLayer` uses
IBM Plex Mono 500 and waits on `document.fonts.load` before baking the atlas (as today).
Remotion loads the same files through `@font-face` (§9).

### 4.7 Dependencies (exact pins, lockfile committed)

Runtime: `next`, `react`, `react-dom`, `zustand` 5.0.16, `@deck.gl/core|layers|extensions` 9.4.0,
`@luma.gl/core|webgl` 9.4.2, `d3-force` 3.0.0, `culori` 4.0.2, `remotion` + `@remotion/player`
4.0.538 (Player used in Remotion Studio only; it is **not** shipped on the landing, §6.1).
Dev: `typescript`, `@types/react|react-dom|node|d3-force`, `eslint` + `eslint-config-next`,
`@remotion/cli`, the three fontsource packages. Absent on purpose: `@deck.gl/react`, Tailwind,
immer, any UI kit, any icon set.

### 4.8 Routes and URL parameters

| Route | Content | Params |
|---|---|---|
| `/` | landing | `?reel=<n>` → client redirect to `/reels/<n>/` carrying `theme`,`hero`,`t`,`peer` (old talk notes keep working) |
| `/sim/` | live simulator | `theme=stage`, `hero=1`, `peer=<id>`; `?reel=` redirects as above |
| `/reels/<name>/` | reel player (SimApp in reel mode, socket never opened) | `theme`, `hero`, `t` (sim seconds), `peer` |
| `/figure/` | the sorter figure full-bleed | `?press=` passthrough to the iframe for screenshots |

Prefs `{stageTheme, hero}` persist in `localStorage['luminar.prefs']`; URL wins on load, as
today. Share (`s`) copies `/reels/<n>/?t=…&peer=…`.

### 4.9 Data layer

Ported 1:1 from inventory §4 with these edits: `post()` returns `{ok, status, data}` (never
throws); the unused wrappers (`topologyMetrics`, `metricsSnapshot`, `eventsRecent`,
`gossipMesh/Scores/Analytics`, `faultActive`, `scenarioActive`) are dropped; `gap` frames update
`droppedEvents`; reel JSONL is parsed from a streaming `response.body` reader so the first
snapshot renders before the file finishes (7 MB mainnet reel). The reel scheduler (`setInterval`
50 ms, survives background tabs), seek semantics and the single-socket invariant are unchanged.

### 4.10 Copy module

`lib/copy.ts` exports the three guard-rail sentences and the provenance string; every stamp,
caption, tooltip, manifest blurb and video overlay imports from it. `grep -rn "identical run\|beacon node's scoring\|mesh path" web/` must return only `copy.ts` negations.

## 5. Tokens

The token set is `docs/design/tokens.css` (final; copied verbatim into `globals.css`). Summary:

| Role | Dark value | Job | Rule |
|---|---|---|---|
| `--pitch-0..4` | `#0b0b0d #101013 #19191c #262629 #37383b` | page/canvas/plate · rail · menu · hover/track · idle node | never text |
| `--paper-0` | `#f2f2ef` (17.5:1) | text, numbers, honest peers, lit dither cells | |
| `--paper-1` | `#bebeba` (10.6:1) | secondary text, mesh links | |
| `--paper-2` | `#93928d` (6.3:1) | labels, captions, log timestamps | smallest text colour allowed |
| `--paper-3` | `#696964` (3.6:1) | hairlines, disabled, pruned outline | **never text** |
| `--flame` | `#ff5a2c` (6.3:1) | attacker, fault, alarm | never brand/hover/CTA; never on `--signal` |
| `--flame-dim` | `#a73a1b` | outlines; light-mode flame text | |
| `--signal` | `#4ddcdc` (11.8:1) | live, observer, decoded, delivered, healed | always paired with a ring shape |
| `--hair` / `--hair-strong` | paper at .14 / .28 | every rule; there are no boxes | |
| `--stamp-shadow` | `0 1px 0 rgb(0 0 0/.25)` | the one shadow | |
| type | `--t-poster` 56→208px display · `--t-h1` · `--t-hero-n` 44→88 · `--t-kpi` 28→40 · `--t-narr` · `--t-fig` 14→16 italic · `--t-ui` · `--t-body` 12→13 · `--t-label` 10→11 upper .12em · `--t-micro` 9→10 · `--t-stamp` | | square corners everywhere (`--r-0`); only nodes are round |
| dither | `--cell-final 3px` · `--cell-mesh 2px` · `--cell-ui 4px` · reveal `28,20,14,10,7,5,4,3` · `--dither-25/50/flame` SVG tiles · `--halftone` 8px dot mask · `--hatch` 45° · `--loupe 132px` · `--band-0..3` = .12/.35/.65/1 | | |
| motion | one easing `cubic-bezier(.16,1,.3,1)`; `--d-press 150 · fast 200 · menu 400 · row 550 (+40 stagger) · reveal 150/step · rail 220 · pulse 800 · particle 800 · caption 4000`; `--parallax-travel −170px` | | all zeroed under `prefers-reduced-motion` |
| layout | `--nav-h 56 · --toolbar-h 44 · --strip-h 52 · --ticker-h 56 · --row-h 22 · --rail-l 264 · --rail-r 312 · --col-prose 620 · --col-wide 1080 · --gutter clamp(16px,2.5vw,36px)` | | |

Node and link roles (`--node-*`, `--link-*`, `--particle*`) are listed in `tokens.css` with their
shape glyphs; §6.2 turns them into the render table. `[data-stage="1"]` scales type, row height,
cells, lifts `fg-3` to `paper-1`, `hair` to `hair-strong`, brightens links. Light mode and the
`.plate` override exist and are not wired to a control.

## 6. The four surfaces

### 6.1 Landing `/`

Dark page (`--bg`), 56 px nav, 620 px prose column, plates at 1080 px. Rhythm 22 / 42 / 72 /
128 px. Server-rendered HTML; the only client islands are the hero plate, the figure iframe
and the nav menu. Nothing fades in on scroll.

1. **Nav**: `LUMINAR` wordmark (Manrope 600, .14em) + `gossipsub v1.1` mono sub-label; links
   Simulator · Recordings · GitHub · `Menu +`. Menu is the full-screen overlay (staggered serif
   rows, `+`→`×`, Escape closes, focus trapped) listing the four reels and the three routes.
2. **Hero**: poster headline in Instrument Serif at `--t-poster`, two lines, second line
   italic (copy is the builder's, constraints in §12); lead paragraph ending with the mechanism
   sentence from `copy.ts`; row of one primary paper button `Open the simulator` (→ `/sim/`) and
   one chevron link `Watch a recording ›` (→ `/reels/sybil-eclipse/`).
3. **Fig. 1 plate** (`aspect-ratio 16/6.4`, `4/3` under 450 px of plate width, the reticle
   cursor of §7.4 on fine pointers): a **live dithered replay**, not a still (§7.4 twist 1). The
   plate draws the `sybil-eclipse` reel's snapshots from T+8 to T+24 offscreen (50 paper discs,
   flame diamonds, edges, message pulses) at 2 snapshots/s, loops, and `DitherCanvas` dithers
   each frame at `--cell-final`; the source is the baked `lib/plate-frames.json` (builder-check
   call: ~32 snapshots × node x,y,state + edges, ≈ 60 KB, written by `scripts/reel-stats.mjs`),
   never a runtime fetch of the 3.6 MB reel. Hover or focus pauses the loop; under
   `prefers-reduced-motion` the plate is the T+11.9 still (Sybils grafted, owner's reference
   image). Parallax layers by `data-depth`: a hollow Bayer **halo ring** `.35` (§7.4 twist 2),
   canvas `.6` (overscan `inset:-14% 0`), one flame **attacker diamond** `.2`, the mono
   **readout box** `.8` (PEERS / SYBIL / PRUNED / T+, counting with the replay), and the stamp
   `1.2` whose text is the **current beat** (`SYBIL FLOOD · T+10S` → `3/5 PRUNED · T+13S` →
   `ECLIPSE · N7 · T+16S` → `CLEARED · T+24S`). No orange shard, no halftone slab (owner, 24 Oct).
   Progressive reveal 28→3 px when ≥30 % in view, once. Loupe (132 px) shows the un-dithered
   frame with peer ids. Caption right-aligned: `Fig. 1` + italic
   *Fifty peers, five Sybils grafted at once. P4 scoring prunes them in two heartbeats.*
   The dithered image is generated from reel data, not a photograph; no external asset.
4. **Readout strip**: four `--t-kpi` mono numbers on hairlines — peers, Sybils, heartbeats to
   prune, delivery — read **from the reel's `analytics`/event frames by a 30-line build script**
   (`scripts/reel-stats.mjs` → `lib/reel-stats.json`), each with an italic sub-caption; the last
   one reads *reproducible recording, not an identical run*.
5. **Section "What it does"**: `--t-h1` serif heading, three body paragraphs (the mechanism;
   the attacks; "scoring cannot see a silent eclipse"), chevron link to `/sim/`.
6. **Fig. 2 plate: the colorfigure** (§8), stamp `SORTER No. 6`, caption *Fig. 2 Same mechanism,
   toy constants.*
7. **Fig. 3 plate: the launch video** — native `<video>` of `public/video/launch-16x9.mp4`
   (1280×720, h264, `preload="metadata"`, `playsinline`, controls, muted autoplay off), poster is a
   dithered PNG of frame 1620. **Changed** from the architecture doc's `@remotion/player`
   island: in-browser 30 fps Bayer passes over a 3.6 MB reel are not a phone-safe landing
   element, and a file plays offline. Cap 12 MB; crf is the builder's.
   Caption *Fig. 3 Fifty-seven seconds: one publish, five Sybils, one eclipse, one heal.*
8. **Section "Same names"**: two dithered stills (`assets/readme/grafana.png`, `jaeger.png`,
   dithered at runtime by `DitherCanvas`, `data-depth` .6/.9) and the seven `gossipsub_*` series
   names in mono. Copy: *the metric names Lighthouse emits*, never "every client".
9. **Section "Live mainnet"**: one paragraph with the arrival sentence from `copy.ts`, link to
   `/reels/mainnet-block-wave/`, data credit.
10. **Footer**: hair rule, 3 columns (wordmark + italic `Devcon 8 · Mumbai · 3–6 Nov 2026` /
    Routes / Source), licence and ethPandaOps credit.

Phone (390): gutters 16 px, poster at 56 px, plate 4/3, readouts 2×2, footer 2 columns, no
horizontal scroll.

### 6.2 Simulator `/sim/`

Every row of the inventory marked Keep or Improve is **Must**. The layout is the
instrument-panel mockup with the verdict's grafts (typographic rails without boxes, floating
command strip, poster-free). Desktop ≥1024: toolbar 44 · left rail 264 · canvas · right rail
312 · command strip floating over the canvas bottom. Tablet/phone ≤1023: rails become drawers
(`Stats`, `Log` buttons on the strip; inspector is a bottom sheet), toolbar collapses to brand +
pill + `Menu +` (the overlay holds Scenarios, Reels, Faults, Presets as staggered serif rows),
strip wraps to two rows, canvas full-bleed. Nothing below 390 px overflows.

**Toolbar (44 px)**: brand; connection pill `OFFLINE` (flame-dim text, no fill) / `LIVE`
(signal dot) / `REEL · <title>` (paper square); `MAINNET` badge (click → `POST /api/live/mainnet`,
refused with toast in reel mode); `TELEMETRY` badge (hidden until active, shows `peer_count`);
duration presets `1m 2m 5m 10m` and node presets `20 50 100 200` (owner: capped at 200 for the talk build; active follows
`maxDuration` / `node_count`; refused in reel mode, leave Geo); clock `T+ 12.3s` → `m:ss`;
GitHub link. `.reel` dims presets/pickers to .5.

**Command strip (52 px, floating, 76 % wide 360–820 px, `bottom: 36px`, 60 px in hero)**:
Reset `⟲` (bound to `r`), Play/Pause (`Space`), scrubber, `cur / total`, speed
`.5× 1× 2× 3× 5× 10×`, menus `Scenarios ▾ · Reels ▾ · Inject fault ▾`.
- **Scrubber is for recordings.** In live mode the track is non-interactive (`aria-disabled`,
  tooltip *scrubbing rewinds recordings only; the live clock cannot rewind*) and
  `POST /api/sim/seek` is never called. In reels: `input` → `seekReelToSimTime`, bubble shows
  time, keyboard-focusable; **beats and phases are drawn as ticks** on the track (`.lm-tl-tick`
  finally gets a producer); wash bands per injected fault (`--wash-*`) with tooltip.
- Pause-at-limit rule unchanged; Play at the limit extends `maxDuration` by `durationStep`.
- Menus use the native `popover` attribute, `role="menu"`, arrow keys, Escape, outside click,
  one open at a time. Fault menu: Partition (**split by layout side**: visible sim peers with
  `x <` median vs the rest), Sybil (N stepper 1–10, default 5, topic `lumina/blocks/1.0`),
  Eclipse (selected peer; 4 attackers; disabled with reason when nothing selected), Drop peer
  (disabled when nothing selected), divider, Clear all (shows active count). Every fault click
  → `reelGuard` → `leaveGeoForSim` → `post()` → **toast reflects `{ok}`** (`injected` / `failed
  · <status>` / `backend offline`). Toasts are a queue, top-left under the toolbar, 2 s each.
- Scenarios menu from `GET /api/scenarios` (name, `${duration}s`, description, active row).
  Reels menu from `/reels/manifest.json` with `<kbd>N</kbd>`, title, **blurb inline**, `REAL`
  tag for `real: true`, divider, `0 Back to live`.

**Canvas** (`DeckCanvas`, `OrthographicView`, drag pan / wheel zoom, cursor `crosshair` on the
field, `pointer` over nodes; tap on empty canvas deselects). Overlays: mode switcher `FORCE |
RADIAL | GEO` top-centre (Geo disabled with reason until real nodes exist; auto-Geo once per
feed-on; sim actions leave Geo with a toast); legend top-right (collapsible; gear → settings:
Gossip transfers, Node labels, Edge lines, **All labels ≤ 50 nodes**, Stage `T`, Hero `H`,
**Admin token** field → `localStorage['luminar.token']`); provenance card top-left while
`mainnet.enabled` (sentence verbatim); narrator caption bottom-left above the strip
(`aria-live="polite"`, kicker `T+N.Ns · PHASE` or `· NARRATOR` in Manrope 600, sentence in
Instrument Serif italic at `--t-narr`, 2 px drain bar over 4 s); keyboard hint row under the
strip (`SPACE play · F fit · T stage · H hero · ? keys`); tooltip card at cursor (hidden in
hero). Legend states the mesh rule: *gossip mesh · hidden above 100 peers (backend sends none)*.

**Render table** (replaces today's colour-only palette; implemented as one procedurally drawn
icon atlas, see §7; sizes are CSS px at `scale.node` 1, stage ×1.4):

| Role | Shape | Colour | Notes |
|---|---|---|---|
| honest / receiving | ● disc, 1 px rim | `paper-0` | Bayer halo at 1.7 r whose density is the **score band**: `<0` .12 flame cells · `0–2` .35 · `2–6` .65 · `>6` 1.0 paper cells. Score comes from `gossip_score` in the 500 ms snapshot, step-changed like the inspector sparkline |
| idle | ● disc | `pitch-4` fill + 1 px `paper-3` rim | |
| origin | ◉ disc + pitch centre dot | `paper-0` | |
| decoded | ◎ disc + solid ring at 1.6 r | `signal` | |
| observer (real / telemetry) | ◎◎ double ring, breathing .2→.75 on 5.6 s sine | `signal` | static under reduced motion |
| joining | ○ hollow disc 1 px | `paper-1` | |
| failed / error | ⊗ disc with X | `paper-3` / `flame-dim` | |
| attacker (grafted) | ◆ diamond, 45° hatch, 1.15 r, **never dithered** | `flame` | attack links dashed 4/3 flame .55 to each `connected_peers` victim; raw id label always shown |
| attacker (pruned) | ◇ hollow dashed diamond | `paper-3` | weak tether to ≤2 `last_targets` (PR #5) |
| selected | ⌖ reticle: ring at 2 r + four ticks, 2 px | `paper-0` | |
| hover | topology edges 2 px + rings r+4 on peers | `paper-1` | tooltip |
| event-row highlight | lines + rings to `highlightPeers` | `paper-1` | |
| topology link | 1 px dotted (dash 1/3) | paper .16 | hidden by Edge lines toggle |
| mesh link | 1 px solid | `paper-1` .55 | honest pairs, deduped; absent > 100 nodes |
| particles | ▪ 2-cell hard square, no blur | message `paper-0` · spam `flame` + trailing cell · graft `signal` · prune `flame` · dht `paper-1` · fault burst `flame` | Bézier bowed left, 800 ms, fizzle at 60 % when `dropped`; cap 600; off under reduced motion |
| pulses | 2.5 r disc, alpha 56→0 over 800 ms | state colour | cap 200; off under reduced motion |
| world land (Geo) | polygons filled with the 50 % checker via `FillStyleExtension`, 1 px outline paper .16 | | loaded once from `/geo/land-110m.json` |

Layer order, visibility rule (Geo draws only real/telemetry nodes; Force/Radial only sim
peers), fitView (`WORLD_BOUNDS` in Geo, pad 80, zoom ≤ 4, 500 ms), relayout key, radial and
force layouts: unchanged from inventory §5.

**Left rail (264 px, hairline sections, no boxes)**: KPI 2×2 — Delivery `%` (prefers
`recent_delivery_ratio`), Propagation `ms`, Avg hops, Mesh degree with `min–max`, each with a
dithered sparkline of the last 60 `analytics` frames; `—` before the first message ·
NODES — `node_count +attackers`, **state strip one cell per node** (canvas-drawn above 100
nodes), 2-column state counts (idle, origin, receiving, decoded, joining, failed, error,
attacker, pruned) · MESSAGES — Sent, Received, Invalid (`spam-*` count), Total events ·
DELIVERY CDF — dithered area, dashed p50, `p50 Nms` · BEATS — narrator beats and phases only
(no counters), **click → seek** in reels, **click → highlight** live · EVENT CATEGORIES — six
dithered bars + counts (fault bar flame) · INFRASTRUCTURE — Streams `open/max` bar, DHT
`active/available` segments (no hard-coded 8).

**Right rail (312 px)**: EVENT LOG — header count + `following/paused` (auto-scroll lock at
30 px), **`N dropped (gap)`** indicator from `droppedEvents`, filter chips (All, None, Gossip,
Conn, Stream, DHT, Fault, Health, Clock off by default, Sim, Live; Alt/Meta-click isolates),
22 px rows (`at`, node, 2-letter code coloured by consequence, detail), cap 500 DOM rows; row
click selects the referenced visible node, sets `highlightPeers`, **and opens the inspector**.
PEER INSPECTOR slides over the log: header (state glyph, short name in Instrument Serif
italic, badges `state` / `attacker` / `eclipse target`, full id, `ESC`), metrics Sent · Recv ·
Score (flame when `< 0`) · Mesh `n/6`, score history sparkline (last 50 ticks, dashed zero,
flame when latest `< 0`), **MESH PEERS** (from `store.mesh[peer]`, attackers in flame) **and
TOPOLOGY PEERS** (from `connected_peers`) as two labelled chip rows (pruned attacker shows the
honest peers that pruned it, struck), a **WHY** line for attackers (*silent attackers send
nothing invalid, so P4 never fires; only the P3 deficit, floored at −0.25*), live events
touching the peer (cap 200).

**Telemetry drawer**: see §13 item 2; the badge and the breathing observer ring are Must either way.

**Keyboard** (`lib/keys.ts`; ignored in `TEXTAREA`/`SELECT`/non-range `INPUT`, with modifiers):
`Space` play/pause · `f` fit · `Escape` deselect/close · `1`–`9` reel N · `0` back to live ·
`s` share · `t` stage · `h` hero · **`r` reset** · **`?` shortcut overlay** (new, listing all of
these; Escape closes). Menus: arrow keys, `Enter`, `Escape`.

### 6.3 Stage / hero broadcast view

`<html data-stage="1">` scales by tokens (no `zoom`): type, row height, cell sizes, `fg-3` →
`paper-1`, hairlines stronger, links brighter; renderer `scale {node 1.4, particle 1.8,
edgeAlpha 1.6}`, labels 12 px. `data-hero="1"` hides both rails, legend, tooltip, kbd row; the
command strip sits above a **56 px lower-third ticker**: `phase · delivery · mesh d · hops ·
e2e · attackers (N · P pruned, flame) · invalid (flame) · T+` at `--t-hero-n`; in Geo with
mainnet on, cells 2–5 become `slot · first seen (ms · client) · p50 · observers`. Narrator
caption grows to `--t-narr` 24 px. `aria-live="off"` on the ticker (2 Hz numbers must not be
announced); the caption keeps `polite`. Both toggles persist and mirror to the URL.

### 6.4 Reels

`/reels/<name>/` pre-rendered per manifest entry (title in the HTML). On mount: no socket,
`enterReel` semantics as today (clear mainnet, `topoKey=''`, load with streaming parse and a
**dithered progress bar**, seek to the first snapshot before play, pill `REEL · title`), then
`?t=` and `?peer=` applied. Scheduler, seek (replays last `edges, scenario, telemetry_status,
snapshot, metrics, analytics` before `t`; events skipped), speed min 0.1, auto-pause at end,
guards (recorded `SimulationStateChanged` and snapshot `state/speed` ignored; scenario/fault/
preset menus refused with toast) unchanged. `0` or the menu's *Back to live* navigates to
`/sim/`. Seek optionally replays the last 2 s of events so a landing frame has motion
(builder's call). Reel files are not grown, re-encoded or gzipped in this branch.

## 7. The dither system

One module, `components/dither/dither.ts`: **ordered Bayer 8×8** (thresholds `(v+.5)/64`),
Rec.601 luma, `contrast` from `--dither-contrast` (1.15), `positive` paper cells on pitch, cell
size in CSS px, DPR capped at 2, `image-rendering: pixelated`. Never error diffusion: Bayer is a
pure function of (x, y, luma), so still regions never shimmer, which matters on the canvas and
in the video. The components: `DitherCanvas` (image or offscreen-render source, progressive
reveal `28,20,14,10,7,5,4,3` at 150 ms/step gated by `IntersectionObserver` ≥ 30 % and
reduced-motion, re-render on resize debounced 120 ms), `Loupe` (fine pointers only; 132 px
square showing the source through `grayscale(1) contrast(1.15)` with a 1 px paper border),
`HaloRing` (a Bayer-dithered annulus, paper cells at `--band-2` density, 1 px paper rim; the
score-halo glyph of §6.2 at plate scale), `Diamond` (the flame attacker glyph, `clip-path`
rhombus, `--hatch` fill when `pruned`), `Reticle` (the cursor, §7.4), `Stamp`
(Manrope 600 uppercase .1em, paper on pitch, `rotate(var(--stamp-tilt))`, `--stamp-shadow`),
`Figure` (plate + `Fig. N` + italic caption, right-aligned, left under 450 px).

On the deck.gl canvas the same maths lives in **`map/atlas.ts`**: at mount (and when
`data-stage` or `scale.node` changes) it draws every glyph of the render table into one
canvas atlas at the actual pixel sizes — discs, rings, diamond with hatch, dashed diamond, X,
reticle, 2-cell squares, and the four **score-band halos pre-dithered at `--cell-mesh`**
(paper and flame variants). Nodes, halos and particles are `IconLayer`s with `sizeUnits:
'pixels'`, so cells stay crisp at every zoom. Dashed links use `PathStyleExtension`; the Geo
land fill uses `FillStyleExtension` with a 2×2 checker pattern. If the halo atlas looks soft at
DPR 1.5 on the venue laptop, the upgrade path is a 15-line `ScatterplotLayer` shader injection
(`DECKGL_FILTER_COLOR`: discard when `bayer(gl_FragCoord.xy) > density`); do not start there.

**Functional dither (allowed, and only here)**

| Where | Meaning carried |
|---|---|
| Landing plates (Fig. 1 mesh still, Fig. 3 video poster, Grafana/Jaeger stills, Geo B-roll) | the image itself |
| Score halos on the canvas | score band (density = P1–P4 sum, flame when negative) |
| Sparkline and CDF areas under the line, event-category bars, stream/DHT bars (all ≥ 12 px tall) | magnitude |
| Timeline wash bands under injected faults | fault span |
| Loading states: canvas reveal on first snapshot (28→3 over the rendered frame), reel load progress as a widening `--dither-50` fill, skeleton blocks in `--dither-25` | progress |
| Geo land mass | the map |
| Video footage (§9) | the image |

**Forbidden**: any text or numeral; attackers, pruned diamonds, particles, pulses, selection
reticle (hard shapes on a dithered field is how the eye separates signal from mesh without a
legend); focus rings; the scrubber head; the state strip cells; any chart or bar under 12 px
tall (3 px CPU bars, 6 px state bar are solid); stamps; menu and toast surfaces.

### 7.4 The twist: an instrument, not a poster (owner-requested, 24 Oct)

Backboard's plates are pictures with decorations floating over them. Luminar's plates are
instruments: everything on them is data or a tool, so the page cannot be mistaken for a copy.

1. **Plates are alive.** Fig. 1 replays real reel snapshots (§6.1 item 3); the stamp names the
   current beat and the readout counts. The same `DitherCanvas` + replay pair is reused for the
   reel cards in the Menu overlay (one dithered frame each, no loop) and the video poster.
2. **Decoration is the legend.** The only floating objects allowed on any plate are Luminar's
   own glyphs: the hollow Bayer halo ring (a peer's score halo at plate scale) and the flame
   diamond (an attacker). Both appear in the simulator legend with the same construction, so a
   first-time viewer has already learned the two most important symbols before opening `/sim/`.
   The orange trapezoid shard and the grey halftone slab are gone everywhere (owner).
3. **The cursor is the selection tool.** On plates and on the mesh canvas the pointer is the
   reticle (a 14 px ring with four 4 px ticks, paper, 1 px pitch outline, drawn as an SVG
   `cursor` with a system crosshair fallback) — the same glyph that marks the selected peer in
   the inspector header. Not on buttons, links, rails or text.
4. **Dither is the honest state.** Only generated or recorded data is dithered; UI text, charts
   under 12 px and photographs are never dithered (§7.2). The loupe reveals the un-dithered
   data under the pointer, which turns the texture into a claim the viewer can check.

Builder's rule: if a new decorative element cannot be named in the legend, it does not go on
the page.

## 8. The colorfigure (Fig. 2)

**Object**: Candidate A from `figure-concept.md`, the **pneumatic-tube sorting office**
(`SORTER No. 6`): a 1930s sorting desk, a port drum with six brass ports (+2 hinged overflow),
six glass tubes to six rim stations, a splitter cone, bayonet collars, a balance-beam scorer per
port (P1 winder, P2 tokens with a leak, P3 counterweight, P4 lead slug through a sieve), a cam
shaft (one turn = one heartbeat, lobes in the engine's order: decay → spam valve → trip levers
→ lock arm → ticket punch → pull valve), ticket slot (IHAVE) and vacuum line (IWANT), a red
sybil hopper, a hood (eclipse) and a bulkhead (partition). Protocol constants are those of
`backend/gossip/engine.py` and `scoring.py` as tabulated in the concept doc; every stat pill
says `(toy)`.

**Buttons for Devcon (Must)**: 1 **Post** (flood: eight copies at once, bands go grey at each
station, P2 tokens land) · 2 **Heartbeat** (one cam turn, each lobe's part flashes flame) ·
3 **Bolt on a Sybil** (hopper on port 3; two heartbeats later the beam tips past −10, the collar
fires, the tube drops). **Second pass if time** (not Must): 4 Lower/Lift the hood (eclipse: tubes
capped, tickets still pass, beams barely move) · 5 Slide the bulkhead (partition).
Out-of-order presses `ui.flash(...)` as the concept lists. Stats top-right: `mesh 6/6 (toy)`,
`score port-3`, `delivered`, `IWANT pulls`, `beat`. See-through shows cam shaft, pump, beams
with all four weights, ticket punch, vacuum line, sieve and bin with the labels from the
concept.

**Build**: with the owner's `colorfigures` skill (`~/.claude/skills/colorfigures`): source in
`web/figures/sorter/figure.html` next to a copy of `assets/core.js`; verify from every side
with headless Chrome (≤ 3 rounds); `python3 ~/.claude/skills/colorfigures/scripts/build.py
figure.html web/public/figures/sorter.html`. Body swatches nearly monochrome (off-white desk,
desaturated brass `#cbb98a`, glass `#cfe9f0` low alpha); flame `#ff5a2c` only for fresh
capsule bands and the active lobe; the skill's status red/green stay inside the figure; the
cast shadow stays the skill's flat blue (the one off-palette colour, on purpose: it reads as
a print).

**Embed**: on the landing as a `Figure` plate — a `#f4f1e8` paper rectangle on the pitch ground
with a 1 px paper rule 6 px outside it, one hollow `HaloRing` overlapping the top-right
corner, `<iframe loading="lazy" title="Sorting office: GossipSub as a pneumatic-tube desk">`
sized by the plate (16/9 desktop, 4/3 phone), stamp `SORTER No. 6` at the corner, caption
*Fig. 2 Same mechanism, toy constants.* `/figure/` serves the same iframe full-bleed and passes
`?press=Post@300,Heartbeat@1500,Sybil@2500,Heartbeat@4000,Heartbeat@5500` through for the OG
screenshot and the talk.

## 9. The Remotion video

**Location — changed** from the storyboard's root `video/` package: `web/remotion/` inside the
Next app's `package.json`. The storyboard chose a separate package to leave `frontend/`'s
lockfile alone; `web/` is new, so that reason is gone, and sharing `components/dither/*`,
`components/type/*` and `tokens.css` is what makes the video pixel-identical to the site.
Shared components must be plain React (no `next/*` imports, no `"use client"` dependence).
`remotion.config.ts` sets `Config.setPublicDir('./public')` so `staticFile('reels/sybil-eclipse.jsonl')`
reads the site's own reel (no sync step), `setVideoImageFormat('jpeg')`, and
`setChromiumOpenGlRenderer('angle')` if the canvas pass is slow. Fonts via `@font-face` from
`public/fonts` in `remotion/fonts.css`; no `@remotion/google-fonts`.

**Compositions** (`remotion/Root.tsx`): `LaunchWide` 1920×1080 · 30 fps · 1710 frames (57 s)
and `LaunchTall` 1080×1920 · 30 fps · 1440 frames (48 s), one `Launch` component with
`orientation` and a `timeline[orientation]` table; scenes 1–11 exactly as the storyboard's two
scene tables (cold open, title, healthy mesh, Sybils graft, pruned by score at 0.6×, the eclipse,
heal, same names, mainnet B-roll (wide only), honesty card, end card), with the tall cut's
safe zones (top 220 px, bottom 320 px) and its layout deltas. If a platform needs ≤ 45 s, drop
scenes 8–9 and shorten 2.

**Data source**: `public/reels/sybil-eclipse.jsonl`, parsed once per render under
`delayRender/continueRender`; node positions from the first snapshot (frozen layout); attacker
positions from the first snapshot containing them; particles interpolated over `latency_ms`
from `GossipMessage` frames; the ticker's `delivery / hops / ms` and `healed in N s` read from
`analytics` frames; score strips from `gossip_score`. Phase times verified today: first publish
T+5.8, Sybils T+10.2, first `GossipPrune reason=score` T+11.9, eclipse on peer-10 T+16.2,
`FaultCleared` T+24.1. Nothing on screen is typed in. Mesh footage is 1-bit through the shared
Bayer; orange elements (attackers, PRUNE edges, one accent shape per scene) render in a sibling
layer above the dither, flat. Stills for scenes 8–9 come from the capture list in the storyboard
(`assets/readme/grafana.png`, `jaeger.png` reused; three Geo frames captured from
`/reels/mainnet-block-wave/?theme=stage&hero=1`), dithered at render time.

**Outputs** (`npm run video`): `out/luminar-16x9.mp4` and `out/luminar-9x16.mp4` (h264 crf 18,
for social), `out/cover.png` (frame 1620), and `public/video/launch-16x9.mp4` (1280×720, ≤ 12 MB,
for the landing) + `public/video/poster.png`. Rendering needs local Chrome; it is not in CI.
Audio: **silent, both cuts** (decided §13 item 3); every beat is also a stamp or caption, so the
cut reads fully muted, which is how social feeds autoplay it. A generated, licence-free click
track is a post-Devcon option, never a dependency.

**Verify before publishing**: in `npx remotion studio` scrub to frames 660–840 and confirm the
first PRUNE erase lands on T+11.9 (≈ frame 685 at 0.6×); confirm the scene-3 ticker shows the
reel's own `avg_hops` / `avg_propagation_ms`; `grep` the scene files for "identical", "beacon
node's scoring", "mesh path", "propagation" in the mainnet caption.

## 10. Accessibility

**Contrast** (computed in `tokens.css`, WCAG 2.x relative luminance):

| Pair | Ratio | Use |
|---|---|---|
| paper-0 on pitch-0 / pitch-1 / pitch-2 | 17.5 / 16.9 / 15.6 | body, numbers, display |
| paper-1 on pitch-0 | 10.6 | secondary, mesh links |
| paper-2 on pitch-0 / pitch-1 / pitch-2 | 6.3 / 6.1 / 5.6 | labels, captions, log timestamps (AA) — the smallest text colour |
| paper-3 on pitch-0 | 3.6 | hairlines, disabled, outlines only — **never text** |
| flame on pitch-0 / pitch-1 / pitch-2 | 6.3 / 6.1 / 5.6 | attacker ids, alarm text (AA) |
| pitch-0 on flame | 6.3 | text in a flame stamp |
| signal on pitch-0 | 11.8 | live pill, healed |
| signal-dim on pitch-0 | 5.2 | muted signal text |
| flame on signal | 1.9 | **never** |

Colour-vision: flame vs signal is the only hue pair that must separate (deutan simulation
reported 0.21 OKLab apart by the direction authors; not re-run by the judge), and every role
also carries a shape, so the canvas reads in greyscale.

**Reduced motion** (`prefers-reduced-motion: reduce`): every `--d-*` and `--stagger` → 0,
`--parallax-travel` → 0, dither reveal jumps to the final cell, particles and pulses off (store
`particlesEnabled` forced false with a hint in settings), observer ring static at .5, caption
drain bar static, menu rows appear without rise. The loupe stays (pointer-driven, not timed).

**Keyboard and semantics**: all of §6.2's shortcuts plus a `?` overlay; menus are `popover`
elements with `role="menu"`, roving tabindex, arrow keys, `Escape` returns focus to the
trigger; the nav overlay traps focus; the scrubber is a real `<input type="range">` with
`aria-valuetext` = formatted time and `aria-disabled` live; filter chips are `aria-pressed`
buttons; the narrator caption is `aria-live="polite"`, the ticker `aria-live="off"`; toasts are
`role="status"`; the legend is a `<dl>`; icons have text alternatives; `:focus-visible` 2 px
`--focus` outline everywhere, never removed; `color-scheme: dark`; tabular numerals on every
readout; 44 px minimum hit targets on the strip at ≤1023 px.

## 11. Build sequence

Dates assume start Sat 25 Oct. **Cut rule**: if phase 2 is not rendering the live mesh by the
evening of Mon 27 Oct, stop the port, present from `master`, and spend the remaining days on
phases 5–6 only (the landing and video do not depend on the port). Parity freeze for the
simulator is Thu 30 Oct; Sun 2 Nov is rehearsal, no code.

Every phase ends with `cd web && npx tsc --noEmit && npm run lint && npm run build` green and
`make check` still green for `frontend/` and `backend/`.

### Phase 0 — scaffold, tokens, fonts (25 Oct, ½ day)

Parity checklist: `web/` created with §4.1's `next.config.ts`; `globals.css` = tokens.css +
base rules; three fonts self-hosted and visible on an empty `/`, `/sim/`, `/figure/`; `make web`,
`make web-build`, `make web-check`; `.github/workflows/ci.yml` gains a `web-build` job
(`node-version: 22`, `npm ci`, `tsc`, `lint`, `build`, `cache-dependency-path: web/package-lock.json`).
Acceptance: `npm run build` writes `web/out/sim/index.html`; `ln -s ../web/out frontend/dist`
on a scratch copy proves FastAPI serves `/sim/` with a 307 from `/sim` and `404.html` for junk;
`grep -r "fonts.googleapis\|fontshare" web/out` is empty.

### Phase 1 — data layer and store (25–26 Oct, 1 day)

Checklist: `lib/types.ts`, `format.ts`, `api/client.ts` (env rename, `{ok,status,data}`),
`api/websocket.ts`, `api/replay.ts` (streaming parse), `lib/store.ts` (zustand, peer ids, toast
queue, beats), `lib/copy.ts`, `lib/keys.ts`; `SimApp` connects on mount, disconnects on
unmount, shows the connection pill and `simTime` from a selector.
Acceptance: against `make backend`, React DevTools profiler shows only the clock text node
re-rendering at 20 Hz; kill the backend → pill goes `OFFLINE`, reconnect backs off 1 s ×2 → 10 s;
restart → `LIVE`.

### Phase 2 — canvas (26–27 Oct, 1½ days; the risk)

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

### Phase 3 — simulator shell and panels (27–29 Oct, 2 days)

Checklist, in the order a demo uses them: toolbar, command strip (live scrubber disabled, reel
ticks/bands), menus (popover, fault menu with N stepper, partition by layout side, disabled
items with reasons), toast queue reflecting `{ok}`, presets, stats rail (KPIs + sparklines,
state strip, counts, messages, CDF, beats click→seek/highlight, categories, infra), log rail
(gap indicator, chips, rows, click opens inspector), inspector (mesh vs topology peers, WHY
line), legend + settings (all-labels, admin token), narrator caption, keyboard incl. `r` and
`?`, drawers and bottom sheet ≤1023 px, nav overlay at phone width.
Acceptance: full browser walk of inventory §1–§3, §6–§8 against the live backend at 1440×900
and 390×844 (no horizontal scroll at 390); inject each fault with the backend up (toast
`injected`) and with the admin token wrong (toast `failed · 401/403`) and with the backend down
(toast `backend offline`); select an eclipsed peer and read four `eclipse-*` chips under MESH
PEERS while TOPOLOGY PEERS still lists honest ids; the `?` overlay lists every shortcut in
§6.2 and each one works.

### Phase 4 — reels, stage, hero (29–30 Oct, 1 day)

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

### Phase 5 — dither system, landing, colorfigure (30 Oct–1 Nov, 1½ days)

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

### Phase 6 — Remotion video (31 Oct–1 Nov, 1 day, parallel with 5 where possible)

Checklist: `remotion/` tree, both compositions, scenes 1–11, data from the reel, stills
captured and dithered at render time, `npm run video`, landing mp4 + poster committed.
Acceptance: the storyboard's verification (frame ≈ 685 prune, ticker numbers from analytics,
copy grep clean); both mp4s play in VLC and the 9:16 cut keeps every readable element outside
the safe zones; `public/video/launch-16x9.mp4` ≤ 12 MB and plays from `/` through FastAPI.

### Phase 7 — swap and deploy (1 Nov, ½ day; **must land**: the talk is served from `master`, §13 item 1)

Checklist: `git mv web frontend` (or keep `web/` and repoint — builder's call, but
`backend/main.py` is not edited: Docker copies `web/out` to `frontend/dist`), Dockerfile stage
1 per the architecture doc, Makefile targets renamed, CI job replaces `frontend-build`,
`scripts/record_reel.py` output path, `docs/deployment.md` env row (`NEXT_PUBLIC_API_URL`),
`docs/ui.md` rewritten against this document, `frontend/` (old) deleted.
Acceptance: `make check` green; `docker compose up --build` serves `/`, `/sim/`,
`/reels/sybil-eclipse/`, `/figure/`, `/metrics` on `:8080`; `start.sh` unchanged;
`render.yaml` and `.do/app.yaml` need no edit beyond the build stage.

## 12. Left to the builder

Settled as **builder's call** (decide, do not ask): landing headline and section copy within
§2's anti-goals and the honesty sentences (stamps ≤ 24 characters); exact crf/bitrate under the
12 MB cap; whether the state strip is DOM or canvas below 100 nodes; whether seek replays a 2 s
event tail; drawer vs bottom-sheet mechanics on phones as long as rails are reachable in one
tap; the `?` overlay layout; Popover positioning strategy (anchor positioning is not assumed);
sparkline sample count; the Sybil stepper's control; whether `web/` is renamed to `frontend/`
or the Dockerfile is repointed at swap; eslint config details; the reel-stats script's shape;
colorfigure geometry beyond the concept's parts list; audio-less timing tweaks in the video;
which three Geo frames are captured; commit granularity (conventional `type(scope):`, scopes
`web`, `video`, `deploy`).

Not the builder's to change: anything in §2 anti-goals, the token values, the render table's
shape assignments, the honesty copy, the phase order and cut rule, the no-backend-change rule.

## 13. Decisions (owner, 24 Oct 2026)

1. **Served from the merged branch.** `feat/ui-overhaul` merges to `master` before Devcon so
   Render/DO and the public URL show the new UI; phase 7 must finish by 1 Nov. The old
   `frontend/` stays in git history and in the `master` tag `pre-overhaul` the swap PR creates.
2. **Telemetry drawer: badge only** (owner default, not yet confirmed): the `TELEMETRY` badge
   with `peer_count` and the breathing observer ring ship; the drawer (live peer rows, CPU bars,
   check-in feed) is deferred to after Devcon. Reversible: say "build the drawer" and phase 3
   grows by ½ day.
3. **Video audio: silent**, both cuts (builder's choice, delegated by the owner). Reason: social
   feeds autoplay muted, every beat is already typographic, and no licensed sound is needed.
4. **Colorfigure buttons 4–5** (hood = eclipse, bulkhead = partition): second pass, after Devcon.
5. **Node presets capped at 200** for the talk build (`20 50 100 200`). The backend still accepts
   500; the UI simply does not offer it.

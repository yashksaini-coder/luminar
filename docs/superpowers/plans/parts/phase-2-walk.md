# Phase 2 walk: 200-node timing and acceptance (Task 2.9)

- **Date:** 2026-10-25 (13:00–13:55 IST)
- **Commit:** measured on `5c0843f` plus the Task 2.9 `renderer.ts` change, which is committed together with this file. The "before" rows were measured at `5c0843f`, unchanged.
- **Machine:** this laptop (13th Gen Intel i7-13620H), DPR **1**, Chrome emulated viewport **1440×900×1** (the window is tiled, so `resize_page` is refused).
- **Run conditions (they matter for every timing):** the laptop was **on battery**, the governor was `powersave`, `scaling_cur_freq` was 0.9 GHz against a 4.7 GHz max, and a background game process (`enlisted`) used about 230 % CPU. Load average was 7.6.
- **Stack:** `next dev` (unminified React dev build, not `next build`) and `make backend` (uvicorn `--reload`).
- **Baseline for this CPU state:** plain d3-force in Node with 200 random nodes, default `forceManyBody`, 300 ticks takes **590 ms**. That is several times slower than the same laptop at full clock.

## Step 1: cold layout and first paint at 200 nodes

Method: an in-page script calls `POST /api/sim/reconfigure {n_nodes: 50}`, waits 3 s, then calls `POST /api/sim/reconfigure {n_nodes: 200}` through the dev proxy. It reads `performance.getEntriesByName('layout')` and polls with rAF until `nodes.length === 200` and `layerIds()` contains `nodes`. Script: `cold200.js`.

| run | reconfigure response | layout measures (start after response → duration) | first frame with 200 discs after response | layers at 200 |
|---|---|---|---|---|
| before (`5c0843f`), 20→200 | 82 ms | 2 measures, last **768 ms** | 890 ms | `edges, particles, nodes, reticle, labels` |
| before (`5c0843f`), 50→200 | 109 ms | +18 ms → 194 ms; +264 ms → **1371 ms** | **1646 ms** | `edges, nodes, reticle, labels` |
| after, 50→200 | 104 ms | +16 ms → 186 ms; +247 ms → **1211 ms** | **1470 ms** | `edges, nodes` |
| after, `?theme=stage`, 50→200 | 102 ms | +7 ms → 206 ms; +301 ms → **1304 ms** | **1616 ms** | `edges, nodes` |

- `nodes === 200` ✔. `mesh-edges` is absent at 200 (the backend sends `mesh: {}`) ✔.
- The first measure is the 200-node snapshot laid out against the old 50-node edge set (most nodes are new, so it runs cold). The second is the cold 300-tick relayout when the 200-node edges frame lands (about 1 550–1 620 edges).
- **`layout ≤ 400 ms`: NOT MET on this run (1.2–1.4 s).**
- **First paint ≤ 1 s: NOT MET on this run (1.47–1.65 s).**
- The cost is d3-force itself. A Node replay of the same snapshot (200 nodes, 1 543 links, the renderer's forces, 300 ticks) takes 1 349–1 524 ms. Per force: charge 607 ms, collide 561 ms, link 52 ms, center 4 ms. The renderer adds nothing measurable.
- Re-measure on AC power at full clock with the game closed before Mon 27 Oct. If it still misses, the fix lives in `layout.ts` (tick count or collide iterations), which is outside this task's files. That is the owner's call.

## Step 2: frame rate during a Sybil burst and at idle (200 nodes)

The rAF rate comes from an in-page counter. Long tasks come from a `PerformanceObserver('longtask')`. React commits are counted by a `__REACT_DEVTOOLS_GLOBAL_HOOK__` stub installed with `initScript`, which records every `onCommitFiberRoot` and every function component that performed work. Scripts: `burst.js` and `idle.js`.

| measurement | before (`5c0843f`) | after |
|---|---|---|
| long task when the 10 Sybils arrive | **972 ms** `FireAnimationFrame`, 1 113 ms `RunTask` (a cold 300-tick relayout that moves every honest peer) | **253–351 ms** (a warm relayout with honest peers pinned; measure 234–248 ms) |
| frame rate during the burst, sim running (s1–s5 after arrival) | n/a | **53–70 fps** (rAF per second 53, 53, 53, 70, 56; p50 interval 18.0 ms, p95 21.2 ms). With the sim paused: 60 fps flat (p50 16.6 ms). |
| long tasks > 50 ms during the burst after arrival | — | none (one 51 ms task at +1.27 s, on the paused-sim run only) |
| React commits during a 6 s burst | — | 50, every one `Clock` (the toolbar clock at its own rate, not per frame). No other component rendered. No `Tooltip` because there was no hover. |
| idle (sim paused, faults cleared, 3 s) | — | **60.3 fps**, p50 16.7 ms, max 20.0 ms. 0 long tasks. **0 React commits.** `renderLayers` was on the stack in 128 of 24 569 samples (it runs only on store updates). |

- **≥ 30 fps during the burst ✔.** **60 fps at idle ✔.** **No React re-render per frame ✔.**
- The arrival relayout still blocks the main thread for one 250–350 ms task on this throttled CPU. That is one hitch when the attackers appear, not a sustained cost.
- Traces: `trace-sybil-before.json.gz`, `trace-sybil-after.json.gz` and `trace-idle.json.gz` in the session scratchpad (not committed). The insight list was empty, so the frame numbers come from parsing `FireAnimationFrame`/`RunTask` and the CPU profile.

**Fix applied in `renderer.ts`** (the brief's step 2.4 "profile and fix"):

1. **Layout memory keyed by edge set.** `renderLayers` passed `topologyKey` (visible ids + edges + mode) to `computeLayout` as the layout-memory key. Any node joining therefore counted as a new topology, `layoutForce` ran cold for 300 ticks, and every honest peer moved when the Sybils arrived. The memory key is now `${edgesKey(edges)}|${mode}`. An attacker joining the same edge set now settles warm (60 ticks) around pinned peers, which is what `layout.ts`'s warm path and its "warm relayout pins known nodes" test were written for. `topologyKey` still decides *whether* to relayout.
   - Regression test: `an attacker arriving on the same edge set relayouts warm: every honest peer keeps its position`. It was RED at `5c0843f`: peer positions changed, e.g. `[514.9, 5.1]` became `[502.6, -97.9]`.
2. **Reference guard on `topologyKey`.** The key string, which sorts about 1 600 edge strings at 200 nodes, is rebuilt only when `nodes`, `edges` or `layoutMode` change identity. It is no longer rebuilt on every animating frame. `resetTopology` and `destroyRenderer` clear the guard.

**Atlas on `?theme=stage`:** `document.createElement` was wrapped from `initScript`, and canvases created from `buildAtlas` were counted. There was **1 build** since load across 50→200. There were **0 builds** during 5 s of animation (particles, pulses, halos). ✔

## Step 3: phase acceptance walk (spec §11), live backend, 50 nodes

Screenshots are in the session scratchpad, named below. The scenario steps pause the sim on the observed condition (`scen2/3/4.js`), so each screenshot shows that state.

1. ✔ `demo_sybil_eclipse` launched with curl-equivalent `POST /api/scenarios/demo_sybil_eclipse/launch {speed:1}`. At **T+10.5** all five `sybil-0..4` are grafted (4 victims each). Layers: `edges, attack-links, mesh-edges, pulses, particles, halos, nodes, labels`. Screenshot `walk-01-sybil-graft-T10.png` shows five flame diamonds, dashed flame links to every victim, and flame `sybil-N` labels.
2. ◐ The diamonds go hollow at the first score prune, **T+12.3–12.9**. All five are pruned (`connected_peers` empty, `gossip_score −15`), and `attack-links` leaves the layer list. Screenshot `walk-02-sybil-pruned-T12.png` shows hollow dashed diamonds with paper-2 labels (R6). **Halos going flame did not happen live:** no honest peer's score went below 0 in this scenario (`firstNeg: null`). This matches Task 2.5's finding: P4 penalises the attackers, and attackers carry no halo. Band-0 flame rendering was proven in 2.5 with an injected snapshot (`band0.png`). Making it happen live needs a backend or scenario change.
3. ✔ At **T+16.3**, `eclipse-0..3` are grafted to peer-10 with dashed attack links (`walk-03-eclipse-T16.png`). Across the whole run there were **0** `GossipMessage` events from `eclipse-*` and 40 from `sybil-*`. `particlesFor` makes `spam` only for `sybil-` senders, so eclipse diamonds emit no spam particles.
4. ✔ Fit: after a synthetic pan the target moved from [9.8, 31.2] to [−112.7, −60.7]. A wheel zoom took the zoom from 0.555 to 1.485. `fitView()` returned the view to [9.8, 31.2] at zoom 0.555. **Note:** the `f` key is not wired yet. `actionForKey`/`runKey` exist, but no keydown listener is installed until Task 3.10, so this step drove `fitView()`, which is what `f` calls.
5. ✔ Geo starts disabled with title `Geo needs real observers · turn MAINNET on`. After `POST /api/live/mainnet {enabled:true}`, `geoAvailable` was true within 1.7 s and auto-Geo switched the mode. Layers: `world-land, pulses, nodes, observer-rings`, with 141 observers drawn and 50 sim peers hidden. Screenshot `walk-06-geo.png` shows the dithered world with Antarctica cropped and only observer rings drawn.
6. ◐ 200-node timing (Step 1 and Step 2 above): **≥ 30 fps burst ✔, 60 fps idle ✔, no per-frame React render ✔. Cold layout plus first paint ≤ 1 s ✗ on this battery/powersave run (1.47 s).**
7. Inventory §5 rows:
   - ✔ Deck canvas: pan, wheel zoom, reticle cursor (`cursor: url(data:image/svg+xml…)`), and an empty click deselects (`selectedPeer` goes from `peer-1` to `null`).
   - ✔ Palette from tokens: with `data-stage="1"`, `--link-topology` goes from `#f2f2ef29` to `#f2f2ef42` and `--cell-mesh` from 2px to 3px. The canvas picked up 3 px cells and larger particles (`walk-05-stage.png` vs `walk-05-default.png`).
   - ✔ Layer order: every `layerIds()` read above is a subsequence of `LAYER_IDS`.
   - ✔ Topology edges toggle: `showEdges:false` gives `pulses, particles, halos, nodes`, and `true` restores `edges, mesh-edges`.
   - ✔ Attack links: seen in items 1 and 3.
   - ✔ Mesh overlay: present at 50 (`mesh-edges`) and absent at 200.
   - ✔ Hover: a real pointer hover found `peer-21`. Layers gained `hover-edges` and `hover-peer-rings`. The tooltip showed `data-show="1"` with text `n21 RECEIVING peer-21 peers 15 score +6.25 sent · recv ↑17 · ↓871` (`walk-04-hover-tooltip.png`).
   - ✔ Pulses and particles: `pulses` and `particles` are in the layer list while the sim runs. Trigger kinds (message, spam, graft, prune, dht, fault burst) are covered by `particles.test.ts` and the renderer tests.
   - ✔ Node discs: radius by n, ×1.5 when selected, ×1.15 for attackers. Covered by `renderer.test.ts` (`selection draws the reticle at 2 r and ×1.5 size…`) and visible in the screenshots.
   - ✔ Halo (dithered cells on the discs, screenshots). ✔ Observer ring (`observer-rings` in Geo).
   - ✔ Selection reticle (`reticle` layer when selected).
   - ✔ Event-click highlight: `selectPeer('peer-1', ['peer-2'])` adds `reticle, event-highlight-edges, event-highlight-rings`.
   - ✔ Labels: `allLabels` at 50 nodes gives a `labels` layer. `showLabels:false` gives no `labels`.
   - ✔ World map (item 5). ✔ Tooltip (hover row above). ✔ fitView (item 4). ✔ rAF loop idle (Step 2).
   - ✔ Force / radial / geo layouts: `RADIAL` click → mode `radial`, 1 relayout. `FORCE` → back. Geo as in item 5.
   - ✔ Visibility rule: Geo draws 141 observers only. Force and Radial draw sim peers only.
   - ✔ Relayout trigger: 0 `layout` measures over 5 s of a running sim (states changed: 46 receiving, 2 origin, 2 idle).
   - ✔ Mode switcher:
     - Disabled reason as in item 5.
     - Auto-Geo once: from Radial, feed on → `geo` with `layoutBeforeGeo: 'radial'`. Feed off → restored to `radial`. Feed on again → stays `radial`, with `geoAutoDone: true`.
     - Manual pick clears memory: in Geo, clicking `FORCE` gives `layoutBeforeGeo: null`.
     - Selection dropped: observer `obs-39a12e6a` was selected in Geo and became `null` after switching to Force.
     - With manual Geo and memory cleared, feed off → `force`, and GEO is disabled again.
   - ✔ BlockSeen flash on observers: `pulses` appeared in Geo while observer states moved through `idle → origin/decoded`.
8. ✔ `list_console_messages` (errors and warnings across the walk) shows only `WebSocket connection to 'ws://localhost:8000/ws/events' failed: WebSocket is closed before the connection is established` ×3. That is the known dev-only StrictMode double-mount from Task 1.7/1.10. There were no errors.
   - `cd web && npx tsc --noEmit` ✔
   - `npm run lint` ✔
   - `npx vitest run` ✔ (26 files, 126 tests)
   - `npm run build` ✔
   - `make check` at the root ✔ (exit 0; ruff "All checks passed!", pytest 128 passed, frontend tsc and vite build)

## Gate verdict

Everything in the phase-2 checklist renders on the live backend. Two acceptance lines are short:

- **200-node cold layout and first paint ≤ 1 s** was not met on this run: 1.47 s while throttled on battery, where d3-force alone takes 1.2–1.4 s.
- **Victim halos going flame** cannot happen with the current backend data, as found in Task 2.5.

Both need an owner decision. The first needs a re-measure at full clock, and possibly a `layout.ts` tick change. The second needs a scenario or backend change, or a different line in the talk.

## Review round 1 re-measure (2026-10-25 14:00–14:02 IST, at `ac8eb55`)

**The walk scripts are now committed** in `phase-2-walk/`, so every browser number can be re-run:

- `cold200.js`: Step 1.
- `burst.js`: Step 2.1.
- `idle.js`: Step 2.2.
- `hook.js`: the React-commit counter. Pass it as the `initScript` of a `navigate_page` reload before running `burst.js` or `idle.js`.
- `bench.mjs` with `snap-200.json`: d3-force alone in Node. Run it as `node bench.mjs snap-200.json [ticks] [collideIterations]`.

To run a browser script, call `evaluate_script` with `sourcePath` set to the file. The page must have `window.__luminar`, which the renderer installs.

The traces and screenshots from the first walk stay out of git (about 40 MB). Item for item, the scripts above reproduce what they show.

**Conditions:** these are still not valid gate conditions. The laptop was **on battery** (`ADP1/online = 0`) with the `powersave` governor. The `enlisted` game was still running at about 440 % CPU, and load average was 9.3. The difference from the first walk is the clock: cores ran at **3.8 GHz** this time, against 0.9 GHz then. DPR was emulated at 1440×900×**1**. The built-in panel `eDP-1` is 1920×1080 at Hyprland scale 1, so its physical DPR is 1. **Whether this laptop is the venue laptop is not recorded here. The owner must confirm it.**

| check | runs | result |
|---|---|---|
| Cold layout at 200 (the final `layout` measure) | 5 × `cold200.js` | **269, 885, 305, 308, 297 ms** |
| First frame with 200 discs after the reconfigure response | same 5 runs | **661, 920, 467, 364, 741 ms** |
| Idle: sim paused, faults cleared, 3 s | `idle.js` (with `hook.js`) | **59.3 fps**, p50 16.7 ms, max 24.3 ms, 0 long tasks, **0 React commits** |
| Sybil burst, sim running, 6 s | `burst.js` (with `hook.js`) | **51–56 fps**, p50 18.1 ms, p95 19.8 ms. One 131 ms arrival task (warm relayout, 118 ms). 59 commits, every one `Clock`. |
| `mesh-edges` at 200 | `cold200.js` | absent ✔ |
| Console errors and warnings | `list_console_messages` | only the known dev StrictMode WebSocket warning ×1 |

d3-force alone, `node bench.mjs snap-200.json` (200 nodes, 1 543 links, same run conditions as the table):

| ticks | collide iterations | ms (2 of 3 reps) |
|---|---|---|
| 300 (pinned) | 2 (pinned) | 1 246, 1 155 |
| 300 | 1 | 898, 942 |
| 150 | 2 | 653, 606 |
| 150 | 1 | 522, 474 |

The bench runs slower than the in-page measure because it sits in a separate process that competes with the game.

**Reading.** With the clock at 3.8 GHz, the pinned 300 ticks and 2 collide iterations meet `layout ≤ 400 ms` in 4 of 5 runs. All 5 runs meet first paint ≤ 1 s, even with the game running. The one 885 ms outlier fits the scheduler contention from the game. The first walk's 1.2–1.4 s numbers came from the 0.9 GHz clock, not from the renderer. **No change to `layout.ts` is proposed.**

**Gate status: still OPEN.** It does not close on this run, because the run is still on battery and under background load. To close it, the owner re-runs `cold200.js` ×5 and `idle.js` on AC at full clock with the game closed, on the venue laptop (or confirms this laptop is the venue laptop), before the cut-rule deadline (evening of Mon 27 Oct). If the cold layout still misses 400 ms there, the owner rules on `layout.ts:118` (ticks) or `layout.ts:115` (collide iterations). The bench table above is the cost data for that ruling.

**Halos go flame (spec §11, Step 3 item 2): still unmet, needs a controller or owner ruling.** No honest score drops below 0 in `demo_sybil_eclipse`, and the renderer cannot change that. Band-0 flame rendering is proven only by Task 2.5's injected snapshot. The options:

- change the scenario or backend in a later phase so that a victim's score goes negative;
- or drop "halos go flame" from the acceptance line and the talk copy.

## Review round 2 re-measure (2026-10-25 14:04–14:15 IST, at `97c58d5`)

**Conditions, recorded with commands:**

- **Power:** on AC. `ADP*/online` read `1` and the battery read `Charging`.
- **CPU:** governor `powersave`, cores at 2.3–3.7 GHz.
- **Background load:** the owner's `enlisted` game still ran at about 425–440 % CPU, with load average 6.5–8.3. I cannot close it.
- **GPU contention:** Chrome renders on the Intel iGPU (`--render-node-override=/dev/dri/renderD129`, which is `card2`). The game runs on the RTX 5050 at 99 % (`nvidia-smi`). It also holds `card2`, because the built-in panel is wired to the iGPU.

So this run is still **not a clean gate run**. It is the best these conditions allow, and it changes three things from round 1:

1. **Production build, not `next dev`.**
   - Built with `NEXT_PUBLIC_API_URL=http://localhost:8000 npm run build` and served with `uv run python -m http.server 3000 -d web/out`.
   - On :3000 the socket goes to `ws://localhost:8000` (`wsUrl`). REST goes to `API_BASE`.
   - The walk scripts now call `http://localhost:8000/api/...` directly (CORS is `*`), so the same scripts run against `next dev` or the static export.
2. **Real drawing-buffer DPR, not emulated.**
   - CDP's `deviceScaleFactor` emulation does **not** change deck's WebGL buffer. At emulated ×1.5 the canvas stayed at `1440×856`, with `devicePixelContentBoxSize` 1440 and `gl.drawingBufferWidth` 1440, because luma sizes the buffer from the physical `devicePixelContentBoxSize`. **So every "emulated DPR" number before this section was really DPR 1.**
   - To measure a real ×1.5 and ×2 buffer, I set `useDevicePixels: 1.5` or `2` on the `Deck` in a local, **uncommitted** build, together with the matching emulated DPR so the atlas is built at the same ratio. I checked the buffers at `2160×1284` and `2880×1712`, then reverted the patch (`git status` clean for `renderer.ts`).
3. **Venue DPR from the spec.** Spec §7 (line 458) names "DPR 1.5 on the venue laptop". This laptop's panel is 1920×1080 at Hyprland scale 1, so it runs at **DPR 1** and is not the venue configuration as it stands. ×1.5 is therefore the gate row and ×2 (the renderer's cap) is the bound.

| check (prod build, 200 nodes) | DPR 1 (buffer 1440×856) | DPR 1.5 (2160×1284) | DPR 2 (2880×1712) |
|---|---|---|---|
| cold layout, final `layout` measure, `cold200.js` | 290, 293, 285, 308, 273 ms ✔ | n/a (layout is CPU-only, unaffected by DPR) | 222, 227, 230, 222, 241 ms ✔ |
| first frame with 200 discs after the reconfigure response | 674, 550, 456, 387, 744 ms ✔ | n/a | 308, 708, 631, 523, 444 ms ✔ |
| Sybil burst fps per second, `burst.js` | 55, 57, 58, 57, 58, 58 ✔ | 36, 39, 35, 38, 42, 37 and 31, 30, 40, 38, 33, 30 (≥ 30, marginal) | 34, 32, 40, 38, 33, 34 and 30, 30, 32, **28**, 35, **24** ✘ |
| burst frame gap p50 / p95 | 17.5 / 18.3 ms | 17.8 / 166.6 and 17.5 / 183.3 ms | 17.7 / 166.7 and 17.4 / 216.7 ms |
| running with no fault, 6 s | (not separately measured) | 37.8 fps | 29.5 fps, p95 250 ms |
| idle (paused, faults cleared), `idle.js` | 59.7 fps, 0 long tasks, 0 commits ✔ | n/a | 59.3 fps, 0 long tasks, 0 commits ✔ |
| React commits during the burst | 57, all one component (minified `g`, 10 Hz, the `Clock`) | 53 and 57, same component | 56 and 59, same component |

Notes on the table:

- The second DPR 2 burst ran with 20 attackers, because I did not clear the first 10.
- The first frame waits for the backend's next 500 ms snapshot, so its spread (300–750 ms) is mostly snapshot cadence, not render time.

**Where the DPR ≥ 1.5 drops come from.** The only main-thread long task is the one Sybil-arrival relayout, 125–197 ms. The 160–300 ms frame gaps carry **no** long task. A 4.4 s trace at ×1.5 (scratchpad `run-dpr15.json`, not committed) shows:

- `CrGpuMain` busy for **3 371 ms of 4 460 ms**, with fourteen `RunTask` slices of 150–303 ms;
- `CrRendererMain` busy for 1 826 ms, of which `FireAnimationFrame` took 1 122 ms, about 7 ms per frame.

So the drop sits in the GPU process, on the iGPU that also scans out the game's frames. With the game running, I cannot tell how much of it the canvas causes and how much comes from contention. DPR 1 at the same moment holds 55–58 fps. **I made no `renderer.ts` change.** Every per-frame cost the brief lists (`updateTriggers`, `topologyKey`, atlas rebuilds, `haloCells`) is already off the frame path. A speculative GPU-side change without a clean measurement would be guesswork.

**Gate status: still OPEN, but narrowed.**

- **Met, even under load:** cold layout ≤ 400 ms (10 of 10 runs), first paint ≤ 1 s (10 of 10), 60 fps idle, and no React re-render per frame. These hold at DPR 1 and DPR 2.
- **Unproven at the venue DPR:** ≥ 30 fps in a Sybil burst. It is marginal at ×1.5 (30–42 fps) and fails at ×2 (24–40 fps), both with the game on the shared iGPU.
- **The run that closes the gate:** on the venue laptop, or this one with Hyprland `monitor=eDP-1,preferred,auto,1.5` so the physical DPR is 1.5, on AC with the game closed, run `cold200.js` ×5, `burst.js` ×2 and `idle.js` against the production export.
- **If the burst still drops below 30 fps there:** that is a renderer GPU-cost finding for a follow-up task. The likely levers are the 1.5× atlas size and per-frame particle buffer uploads. The other option is the spec's fallback (a Bayer shader in place of the pre-dithered atlas).

**Halos go flame: re-checked live, still impossible with the current backend.**

- **Check:** `demo_sybil_eclipse` at speed 1, with every honest `peer-*` `gossip_score` polled from `/api/sim/snapshot` every 0.5 s for 45 s.
- **Result:**
  - n=20: minimum honest score **0.45** (`peer-0` at T+1.4), first negative `None`;
  - n=50: minimum **0.45**, first negative `None`;
  - n=200: minimum **0.45**, first negative `None`.
- **Why the renderer cannot help:**
  - Spec §6.2 gives halos only to honest discs. Attackers are "never dithered".
  - The only honest-score terms that can go negative are P3 (mesh delivery deficit) and P4, and the scenario drives neither below zero for an honest peer.
  - The backend is out of bounds before phase 7.
- **Ruling needed (owner or controller):** either change the scenario or scoring constants in phase 7 so that a victim goes negative, or drop "halos go flame" from the spec §11 acceptance line and the talk copy. Band-0 flame rendering itself is covered by Task 2.5's injected-snapshot evidence (`band0.png`) and the atlas tests.

**Console:** one error across the prod-build walk, `GET /favicon.ico 404` from the static server. The app ships no favicon yet, and that is outside this task. No warnings.

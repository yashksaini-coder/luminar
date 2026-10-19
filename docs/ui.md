# Luminar UI reference

Screenshots of the live main UI (50 nodes, `demo_sybil_eclipse`), from `assets/`:

| Moment | Image |
|---|---|
| T+11.9s: five Sybils grafted (red), `sybil-0` selected in the inspector | ![Sybils grafted](../assets/ui-main-sybil-grafted.jpeg) |
| T+20.7s: Sybils pruned by score (grey, drifting out), peer-10 eclipsed | ![Eclipse active](../assets/ui-main-eclipse-active.jpeg) |
| Radial layout at the same moment | ![Radial](../assets/ui-main-radial.jpeg) |

Verified against branch `fix/verify-findings` on 2026-10-19 (the review-fix series on top of master `bbc9f5a`). Paths are relative to the repo root; frontend paths are under `frontend/src/` unless stated. This is a reference for the person presenting Luminar on stage and for contributors touching the frontend. Trust code over this file.

## 1. Screen map

One page, no routing. A 44px toolbar spans the top. Below it are three columns: a statistics panel on the left (20%, 180–280px), the deck.gl map in the centre, and the event log on the right (20%, 200–320px). The timeline bar floats over the bottom of the map (70% wide, max 800px). The peer inspector (210px) slides in from the right over the event-log column; the telemetry panel (240px) slides in from the left. The legend/settings gear sits top-right of the map. The Force/Grid/Radial switcher is top-centre of the map (`left: 50%; translateX(-50%)`, `style.css:473-478`) and the narrator caption card sits directly below it, also centred (`top: 56px`, `style.css:1396-1399`); nothing is anchored top-left of the map. A red fault flash appears under the toolbar. In hero layout the side columns and inspector are hidden and a ticker strip appears along the bottom (`frontend/index.html:87-226`, `style.css:347-353`).

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ LUMINAR  ●LIVE  [TELEMETRY n]  Scenarios▾  Reels▾  Inject Fault▾            │
│          1m 2m [5m] 10m   [20] 50 100 200 500   12.3s   (gh)                 │
├────────────┬──────────────────────────────────────────────┬──────────────────┤
│ Statistics │            Force|Grid|Radial          Legend ⚙ │ Event log        │
│  Nodes     │            ┌─── caption ───┐                   │ All None Gossip… │
│  Messages  │ ┌telemetry┐└───────────────┘          ┌peer──┐ │  120ms #3 gm …   │
│  Gossip    │ │ drawer  │        deck.gl canvas     │inspec│ │  125ms #7 gf …   │
│  CDF       │ │ (left)  │        + ring canvas      │tor   │ │  …               │
│  Milestones│ └─────────┘                           │(right│ │                  │
│  Categories│                                       │ over │ │                  │
│  Infra     │      ┌──────────────────────────────┐ │ log) │ │                  │
│            │      │ ⟲ ▶ ═══════●═══════ 12.3s/5:00│ └──────┘ │                  │
│            │      │   0.5x [1x] 2x 3x 5x 10x      │          │                  │
│            │      └──────────────────────────────┘          │                  │
│            │ [hero only] phase · delivery · mesh degree · hops …  │                  │
└────────────┴──────────────────────────────────────────────┴──────────────────┘
```

Font is JetBrains Mono everywhere, falling back to `'Ubuntu Sans Mono', monospace` (`style.css:21`). Base tokens: `--bg #0a0e14`, `--panel #0f1319`, `--text #d4dce8`, `--accent oklch(0.72 0.14 210)`, `--green oklch(0.78 0.16 155)`, `--red oklch(0.65 0.22 25)`. `color-scheme: dark` is declared (`style.css:1368`); `:focus-visible` gets a 2px accent outline (`style.css:1369`); `prefers-reduced-motion` also removes the caption transition (`style.css:1424-1426`).

## 2. How the network is rendered

Two stacked canvases live inside `#map-container`: `#deck-canvas` (WebGL, deck.gl 9.2 with an `OrthographicView`, `controller: true` for pan/scroll-zoom) and `#ring-canvas` (2D, pointer-events none). `renderLayers()` in `map/renderer.ts` is the single frame builder; it runs on every WebSocket snapshot, every d3-force tick, hover/click, pref change, and from a rAF loop only while pulses or particles exist. An idle sim draws nothing new (`initRenderer` `map/renderer.ts:66-91`, `startAnimationLoop` `:439-447`). The cursor is `pointer` over a node and `grab` elsewhere (`map/renderer.ts:88`).

### 2.1 Two kinds of edge

| Term | Source | Store field | Meaning |
|---|---|---|---|
| Topology edge | `GET /api/topology/edges` + WS `edges` frame | `store.edges` | Physical libp2p connection. Fixed by the topology generator; changes only on reconfigure or scenario launch. |
| Mesh edge | `snapshot.gossip.mesh` | `store.mesh` | GossipSub mesh membership for the single topic (`peer_id → GRAFTed peers`). Subset of topology edges; changes every heartbeat via GRAFT/PRUNE. Backend sends `{}` above 100 nodes, so the overlay vanishes on the 200/500 presets. |

Attackers (`sybil-N`, `eclipse-N`) are never in `store.edges`. `recomputeLayout` synthesises links from their `connected_peers` for layout only; they are never drawn as topology edges.

### 2.2 Layers in draw order (later = on top)

| # | Layer id | Type | Shown when | Colour / size |
|---|---|---|---|---|
| 1 | `edges` | LineLayer | Edge lines toggle on, topology edges exist | `#1e2a3a` slate, alpha 200 (force) / 80 (grid, radial), width 1 |
| 1b | `mesh-edges` | LineLayer | toggle on, mesh non-empty | accent cyan-blue, alpha 110 / 60, width 1.5, deduped undirected |
| 2 | `hover-edges` | LineLayer | a node is hovered | teal `oklch(0.75 0.14 190)` alpha 120, width 2 |
| 2b | `hover-peer-rings` | Scatterplot (stroked) | same | teal rings at radius+4 around the hovered node's peers |
| 3 | `pulses` | Scatterplot (filled) | a node changed state in the last 800 ms | 2.5× node radius disc in the new state's colour, alpha 80 → 0 linear |
| 3.5 | `particles` | Scatterplot (filled) | particles alive | see 2.5 |
| 4 | `nodes` | Scatterplot (filled) | always | fill by state; 1.5× radius when selected. Only pickable data layer |
| 4b | `telem-rings` | Scatterplot (stroked) | node has `is_telemetry` | green breathing ring, alpha 20–200 on a ~5.6 s sine |
| 5 | `selection-ring` | Scatterplot (stroked) | a node is selected | white, 2× radius, 2px |
| 6 | `event-highlight-edges` | LineLayer | selected node + `highlightPeers` (set by an event-log click) | sky-blue alpha 160, width 2.5 |
| 6b | `event-highlight-rings` | Scatterplot (stroked) | same | sky-blue rings at 1.8× radius |

Node radius: `clamp(200/√n, 3, 8) × scale.node`, then ×0.7 in grid/radial. At 50 nodes that is 8 world units in force mode, 5.6 otherwise. `scale.node` is 1.4 under the stage theme (`map/renderer.ts:103-104`).

### 2.3 Node states and colours

`STATE_COLORS` in `palette.ts:58-67`.

| State | Colour | Meaning |
|---|---|---|
| idle | `#3a4860` slate | no activity |
| origin | `oklch(0.72 0.16 290)` purple | published the current message |
| receiving | `oklch(0.70 0.14 220)` sky blue | message in flight to it |
| decoded | `oklch(0.78 0.16 155)` green | delivered |
| joining | `oklch(0.75 0.14 85)` amber | churn join |
| failed | `oklch(0.65 0.22 25)` red | node down (Drop Peer) |
| error | same red | fault-injected error |
| attacker | `oklch(0.62 0.24 15)` hot red | sybil / eclipse node |

Pruned-attacker rule: an `attacker` with zero `connected_peers` (every honest mesh has PRUNEd it) is drawn idle-grey. This is the on-screen signal that P4 scoring worked. Unknown states fall back to idle.

Ring semantics at a glance: white thick = selected; teal thin = peers of the hovered node; green breathing = real telemetry peer; sky-blue = targets of a clicked event-log row; coloured fading disc = just changed state.

### 2.4 Layouts (`map/layout.ts`)

| Mode | How it is built | Notes |
|---|---|---|
| Force (default) | Live d3-force: link strength 0.4 at `max(40, 400/√n)`, charge −800, weak centre, collide. Nodes seen before keep their positions; new ones seed on a circle. If fewer than 80% of nodes are reused, 80 synchronous warm-up ticks run first. | Attackers get synthetic links to their mesh targets so they sit next to their victims. `fitView` 200 ms after start. |
| Grid | Static hex-staggered grid, sorted by state (origin, receiving, decoded, joining, idle, failed, error). | Attackers sort with idle. Spacing `clamp(600/√n, 14, 28)`. |
| Radial | Highest-degree node at centre, rings outward by degree, at least 6 per ring. | Degree counts attacker links. |

Layout is recomputed only when the sorted node-id set, the edge set, or the mode changes (`topoKey`); state changes alone never relayout.

### 2.5 Particles

`spawnParticle(from, to, color, fizzle)` in `map/renderer.ts:38-54`. No-op when particles are disabled (legend toggle, or `prefers-reduced-motion`), when 600 are alive, or when either peer is unknown.

| Event | Particle |
|---|---|
| `GossipMessage` (from and to set) | one per hop; default sky blue; hot red if the sender id starts with `sybil-`; `dropped: true` → fizzle |
| `GossipGraft` | green |
| `GossipPrune` | red |
| `DHTQueryStarted` | indigo `oklch(0.60 0.12 270)` to one random connected peer |
| `FaultInjected` | up to 4 red particles from the target to its first 4 peers, **only when `target` is a node id** (Drop Peer, Eclipse). Partition's target is `"network"`, Sybil's is the topic `lumina/blocks/1.0`, Latency's is `a<->b`; none resolves in `store.nodeIndex`, so those faults draw no burst (`app.ts:207-219`; `backend/fault/injector.py:123-126, 150-153, 183-186, 231-234, 289-292`) |

Motion: 800 ms travel with ease-out along a quadratic Bézier bowed to the left of travel (so A→B and B→A do not overlap), lifetime 1200 ms, so a delivered particle rests on its target at half alpha for 400 ms. A fizzling (dropped) particle stalls at 60% of the arc and fades out red. Under the stage theme particles are 1.8× larger.

### 2.6 Pulses, tooltip, fitView, labels

- Pulse: any node whose state changes to a non-idle value gets a 2.5× disc in the new colour for 800 ms.
- Tooltip (hover): short name (`n<index>` for `peer-*`, raw id for attackers), full peer id, `[State]` in state colour, `N peers · score`, `↑sent · ↓received`; for receiving/decoded a recv ratio and msg/peer; `Published N` row for origin; `Status FAILED/ERROR` row for failed/error; a rating word for |score| > 0.01. The rating word and the metrics block appear only for non-idle nodes. First 6 connected peers, then `+N` overflow. Placed at cursor +12/−8 px (`map/renderer.ts:330-333, 539-583`).
- `fitView`: bounding box of all positions, zoom capped at 4, 500 ms transition. Fired after layout, on key `f`, and exposed as `window.__luminar.fitView`. `window.__luminar` also exposes `store` and `viewState()` (`app.ts:96`).
- Node labels: the "Node labels" toggle is inert. `drawOverlay` in `map/overlay.ts:21` is never called, so `#ring-canvas` stays blank.

## 3. Toolbar

`frontend/index.html:14-84`. Left to right.

| Control | What it does |
|---|---|
| `LUMINAR` | static brand text |
| Connection dot + label | `OFFLINE` red (socket closed), `LIVE` green (socket open), `REEL · <title>` amber (a reel is loaded; wins over the socket state). Reconnect backoff 1 s → ×2 → 10 s cap. Single-socket invariant: `connect()` while a socket is connecting/open is a no-op and callbacks of a superseded socket are dropped (`api/websocket.ts:67-71, 74, 81, 94`), so key `0` / `Back to live` pressed twice cannot open two sockets |
| `TELEMETRY n` badge | hidden until an external peer POSTs to `/api/telemetry/submit`; click opens the telemetry drawer |
| `Scenarios ▾` | list from `GET /api/scenarios`; click launches (see 3.1). Items carry the scenario description as a hover tooltip (`app.ts:157`) |
| `Reels ▾` | list from `/reels/manifest.json`; numbered 1–3 plus `0 Back to live` (see 3.2). Items carry the manifest blurb as a hover tooltip (`app.ts:317`) |
| `Inject Fault ▾` | five items (see 3.3) |
| Duration `1m 2m 5m 10m` | sets `store.maxDuration` (60/120/300/600, default 5m). No backend call. Sets the scrubber denominator and the auto-pause point; the client POSTs `/api/sim/pause` when sim time reaches it. The auto-pause on the event path (`app.ts:231-237`) has no reel guard; moot only because every shipped reel is < 60 s |
| Nodes `20 50 100 200 500` | `POST /api/sim/reconfigure {n_nodes}`; backend clamps `n` to 2–500 (`backend/main.py:316`), tears down the trio thread and rebuilds everything (random topology, `p = clamp(6/n, 0.08, 0.4)`), paused at t=0. Clears faults and the active scenario. The active button follows `node_count` from every snapshot, so it is right whatever the backend booted with (Render 20, DigitalOcean 50). In reel mode the presets are no-ops with a toast (`Press 0 to leave the reel first`) |
| `0.00s` | sim time; `12.3s` under a minute, `m:ss` after |
| GitHub icon | link to the repo |

Dropdown behaviour: opening one dropdown closes the other two (`app.ts:359-362`); any click outside a `.dd-wrap` closes all three, including Reels (`app.ts:411-413`; at HEAD the Reels menu was not closed by outside clicks).

### 3.1 Scenarios

Launch = `POST /api/scenarios/{id}/launch {speed}`. Backend clears faults, resets clock, event bus, gossip state and run id, regenerates the scenario's topology with the current node count, arms the phase runner, clamps speed to 0.1–100 and starts playing. A launch always auto-plays (`backend/main.py:804-857`). The phase runner polls every 200 ms and fires a phase only while the clock is running (`not clock.paused`) and `clock.time >= phase.at`, at most one phase per poll (`backend/scenarios/runner.py:68-95`): a seek while paused fires nothing until Play, and a seek past several phases fires them one per poll, ~200 ms apart. Each fires a `ScenarioPhaseFired` event whose label becomes the caption. `duration` is informational only.

| id | Menu label | Topology | Phases (sim seconds) |
|---|---|---|---|
| `free_play` | 🎮 Free Play | random p=0.15 | none |
| `gossip_benchmark` | 📡 Gossip Benchmark | scale-free m=2 | none |
| `partition_test` | ⚡ Partition Recovery | clustered, 2 clusters, intra 0.4 / inter 0.05 | T+15 partition (split half) "Partitioning network — mesh splits"; T+35 clear "Clearing partition — mesh healing" |
| `sybil_eclipse` | 🕵️ Sybil + Eclipse Attack | random p=0.2 | T+10 sybil n=5 "Injecting 5 Sybil attackers into mesh"; T+25 eclipse peer-10 n=4 "Launching Eclipse attack on peer-10"; T+40 clear "Clearing all attacks — recovery phase" |
| `demo_sybil_eclipse` | 🎬 Demo: Sybil → Eclipse (60s) | random p=0.2 | T+10 sybil n=5 "Sybil attack: 5 attackers graft in"; T+16 eclipse peer-10 n=4 "Eclipse on peer-10"; T+24 clear "Faults cleared — mesh healing" |

Free Play's description mentions a "Fault tab" and "latency"; neither exists in the UI (`/api/fault/latency` has no control).

### 3.2 Reels

Static files under `frontend/public/reels/` fetched from the frontend origin (not `VITE_API_URL`). Selecting one closes the WebSocket (no reconnect), loads the JSONL, seeks to the first snapshot so the graph is visible before play, and writes `?reel=<name>` to the URL. `0 Back to live` (or key `0`) stops the reel and reconnects. If the `.jsonl` fails to load from the menu, `exitReel()` restores live (`app.ts:333`). Keys `1`/`2`/`3` are no-ops when `manifest.json` failed to load (`app.ts:367-370`).

| # | name | Title | Nodes | What happens |
|---|---|---|---|---|
| 1 | `sybil-eclipse` | Sybil → Eclipse | 50 | T+10 five Sybils graft in and flood; P4 scoring prunes them in two heartbeats. T+16 peer-10 is eclipsed by silent attackers scoring cannot see. T+24 faults clear. ~40 sim-s |
| 2 | `partition-heal` | Partition → Heal | 50 | T+15 mesh split in two, delivery halves; T+35 partition clears and the mesh heals. ~50 sim-s |
| 3 | `healthy-publish` | Healthy mesh | 50 | Scale-free, no faults: flood publish, mesh relays, IHAVE/IWANT pulls. ~30 sim-s |

### 3.3 Inject Fault

All calls are fire-and-forget. The red flash under the toolbar (2 s) shows whether or not the call succeeded: `api.post()` swallows network errors and non-2xx and resolves to `null` (`api/client.ts:15-25`), and every menu handler chains `.then(() => showFaultFlash(...))` unconditionally (`app.ts:380-406`), so an offline backend or reel mode still flashes "Sybil Attack injected". Every fault emits `FaultInjected`; the red particle burst (2.5) is drawn only for Drop Peer and Eclipse, whose `target` is a node id (`app.ts:207-219`).

| Item | Call | Target | Backend effect |
|---|---|---|---|
| Network Partition | `POST /api/fault/partition` | `store.nodes` split by array index: first half vs second half (may cut through clusters; includes attacker ids and telemetry peers, `app.ts:381-383`) | any message between the groups is blocked |
| Sybil Attack | `POST /api/fault/sybil` | fixed 5 attackers on `lumina/blocks/1.0` | `sybil-N` nodes force-grafted into 4 random honest meshes each; empty own mesh so they never relay |
| Eclipse Attack | `POST /api/fault/eclipse` | selected node, else `nodes[0]` | target removed from its honest neighbours' meshes; its mesh replaced by 4 `eclipse-N` attackers that connect only to it. Only `GossipEngine._mesh` is rewritten; `NodeInfo.connected_peers` (topology adjacency) is untouched (`backend/fault/injector.py:256-279`) |
| Drop Peer | `POST /api/fault/drop` | selected node; silently does nothing without one | state → `failed`, score 0, removed from all meshes |
| Clear All Faults | `POST /api/fault/clear-all` | — | dropped peer → idle, score 1.0, `PeerRecovered`; attackers removed from meshes/subscriptions; `FaultCleared` |

`#active-faults` / `#faults-list` in the HTML are never populated.

Backend controls with no UI besides `/api/fault/latency`: `/api/fault/clear` (single fault), `/api/fault/active`, `/api/topology/apply|preview|metrics|list`, `/api/export/events|snapshot`, `/api/trace/recent|{msg_id}`, `/api/gossip/mesh|scores|analytics`, `/api/metrics/snapshot`, `/api/events/recent`, `/api/nodes` (route list `backend/main.py:282-908`). `api/client.ts:56-67, 80-81, 87-88` has wrappers for several of these that nothing calls.

## 4. Timeline bar and playback

`ui/playback.ts`. Floating at `bottom: 24px` (56px in hero).

| Control | Live | Reel |
|---|---|---|
| Reset ⟲ | `POST /api/sim/reset`: clock to 0 and paused, event bus cleared. Client clears events, selection, log, and calls `narratorOnScenario()` (`ui/playback.ts:36`), which clears the narrator latches (first-Sybil-pruned, heal timer, invalid-msg count, phase label), `store.beats`, and redraws the wash bands/ticker (`ui/narrator.ts:33-42`). Milestone rows disappear on the next metrics/analytics frame (≤ 2 s). Does not clear faults, scenario or mesh | pause + seek to sim time 0 |
| Play/Pause (Space) | `POST /api/sim/play` / `pause`. `store.playing` is overwritten by every snapshot's `state === 'running'` | local play/pause of the frame scheduler |
| Scrubber | `POST /api/sim/seek {time: pct × maxDuration}`. The backend only relabels `clock.time`; nothing rewinds. Phases with `at <= time` fire one per 200 ms poll, and only while playing (3.1) | jumps to the first snapshot with `time >= target`, replaying the last `edges/scenario/snapshot/metrics/analytics` frames. Events are skipped: no particles, no log rows, no captions on seek |
| `cur / total` | `simTime / maxDuration` | `simTime / durationSim` (time of the last recorded snapshot) |
| Speed `0.5x 1x 2x 3x 5x 10x` | `POST /api/sim/speed` (unclamped here, clock clamps 0.1–100). Re-synced from each snapshot (live only, `app.ts:418-421`), so a scenario launch's speed shows | local multiplier on the scheduler (min 0.1); recorded snapshot `state`/`speed` are ignored |
| Wash bands | one translucent band per `inject_*` phase of the active scenario, from `at` to the next `clear_faults`: sybil red, eclipse purple, partition amber, drop red, latency yellow. Tooltip `label (T+Ns)`. Redrawn on a `scenario` frame, Reset, or a t/h toggle, not on a duration click | same, over `durationSim` |

The Reset tooltip says `(R)` but no `R` key is bound. `store.milestones` are computed every 2 s but never drawn on the scrubber.

Reel scheduler: `setInterval` at 50 ms (survives alt-tab), `elapsed += dt × speed`, dispatches every recorded frame with `t <= elapsed` through the same `ws.dispatch` path as live, then flushes the batch. Auto-pauses at the last frame. No backend call happens in reel mode from playback controls, but the scenario launch (`app.ts:158-163`), fault menu (`app.ts:380-406`) and node presets (`app.ts:523-533`) have no reel guard. Worse: if a backend is reachable while a reel plays, a scenario launch or node preset then awaits `fetchSnapshot()`/`fetchEdges()`, which overwrite `store.nodes`/`store.edges` with live data mid-reel (`app.ts:161-162, 531-532`). Recorded `SimulationStateChanged` events and snapshot `state`/`speed` are ignored in reel mode (`app.ts:221, 418-421`), so they cannot flip the local player's play/pause or speed buttons.

## 5. Panels

### 5.1 Statistics (`ui/stats-panel.ts`)

Refreshed on every `metrics` (2 s) and `analytics` (2 s) frame.

| Group | Rows | Source |
|---|---|---|
| Network Nodes | Total; Idle, Origin, Receiving, Decoded, Failed, Error with colour dots. `attacker` and `joining` are not listed. Total is `snapshot.node_count`, which includes attackers and telemetry peers, so the rows never sum to Total during an attack (`stats-panel.ts:79-80`; `backend/main.py:236-239`; `engine.py:148`) | `node_count`, `state_distribution` |
| Messages | Sent, Received, Total Events (`1.2K` / `1.2M` formatting) | `total_messages_sent/received`, client event counter |
| Gossip Analytics | Delivery Ratio (prefers `recent_delivery_ratio`, last 20 messages, honest-subscriber denominator; green > 80%, amber > 50%, else red); Propagation `ms`; Avg Hops; Mesh Size = rounded mean mesh degree over honest subscribers. `—` until data | `analytics` frame |
| Delivery CDF | 90px canvas, 11 points p0…p100 of propagation latency, green line + gradient fill, x labels at p0/p50/p100 | `latency_cdf` |
| Milestones | rows from `store.milestones` with `time.toFixed(3)s`: First gossip message, First fault injected, `N messages`, `N nodes decoded`, `N nodes receiving`, plus narrator beats First Sybil pruned / Mesh healed. Recomputed every 2 s; the rows are rebuilt unconditionally (`stats-panel.ts:136`), so after Reset they disappear on the next frame. Rows have `cursor: pointer` but no click handler (`stats-panel.ts:142`) | events, analytics, narrator |
| Event Categories | gossip, connection, stream, dht, fault, health | `event_counts` |
| Infrastructure | Streams Open `open/max` (64); DHT Active `active/8` (8 hard-coded in the frontend) | `stream_manager`, `dht_coordinator` |

### 5.2 Event log (`ui/events-panel.ts`)

Rows: timestamp in ms, `#N` node (peer-prefix stripped), two-letter type code, detail. Capped at 500 rows; auto-scrolls unless the user scrolled more than 30px up. Clicking a row selects the referenced node and highlights `to_peer` (plus the first 8 connected peers for a `GossipMessage`) with sky-blue lines; it does not open the inspector. Clicking a row for the already-selected node toggles it off (`events-panel.ts:208-210`). The header's hidden `Clear filter` × button (`index.html:221`) is never shown (`events-panel.ts:65-66`).

Filter chips: `All`, `None`, then Gossip, Conn, Stream, DHT, Fault, Health, Clock (off by default, fires every 100 ms), Sim. Plain click toggles; Alt/Meta-click isolates one category.

| event_type | code | colour | detail |
|---|---|---|---|
| GossipMessage | `gm` | green | `msg_id` |
| GossipGraft | `gf` | blue | `peer=N` |
| GossipPrune | `gp` | amber | `peer=N <reason>` (`overflow` or `score`) |
| GossipIHave / GossipIWant | `ih` / `iw` | blue | `peer=N` |
| PeerConnected | `cn` | slate-blue | `peer=` (always blank: field is `remote_peer_id`) |
| PeerDisconnected | `dc` | red | reason (never emitted today) |
| StreamOpened / StreamClosed | `so` / `sc` | blue / grey | `→#N` |
| StreamTimeout | `st` | red | `→#N` |
| SemaphoreBlocked | `sb` | amber | — |
| DHTQueryStarted / Completed / Failed | `ds` / `dd` / `df` | indigo / indigo / red | `target=` / `N hops` / reason |
| DHTRoutingTableUpdate | `dr` | indigo | never emitted |
| FaultInjected / FaultCleared | `fi` / `fc` | red / green | `fault_type` |
| PeerRecovered | `pr` | green | — |
| NodeHealthSnapshot | `hs` | amber | `score=` (telemetry peers only) |
| ClockTick | `ck` | grey | — |
| SimulationStateChanged | `ss` | grey | state (not emitted by the REST controls) |
| ScenarioPhaseFired | `sp` | yellow-amber | label |
| unknown | `??` | grey | — |

### 5.3 Peer inspector (`ui/peer-inspector.ts`)

Opens on a canvas node click (`luminar:nodeselect`) or a connected-peer chip; closes with the × button, which also clears highlights. Clicking the already-selected node again deselects it and closes the inspector (`map/renderer.ts:316-323` toggles `selectedNode` to −1 and dispatches `luminar:nodeselect`; `peer-inspector.ts:52` closes on idx < 0). Clicking empty canvas and pressing Escape also close the drawer: the deck root `onClick` dispatches `luminar:nodeselect` (`map/renderer.ts:77-84`), and a `luminar:render` listener closes the drawer whenever `selectedNode < 0` (`peer-inspector.ts:70-73`), which also covers Reset and an event-row toggle-off.

| Section | Content |
|---|---|
| Header | short name (`n12`, or raw `sybil-3`), state badge in state colour, full peer id |
| Metrics line | `↑sent · ↓received · score (green > 0, red < 0) · N peers` |
| Score history | sparkline of `gossip_score`, one sample per snapshot (500 ms), last 50, y range at least [−0.5, 0.5], zero line |
| Connected peers | one chip per `node.connected_peers` (`peer-inspector.ts:103-106`) = topology adjacency, not mesh; click selects it (no camera pan) |
| Live events | last 100 buffered + live events touching this peer: time, code, `↑`/`↓`/`·` direction, other peer. Capped 200. Has its own smaller code table (`peer-inspector.ts:6-23, :179`): SemaphoreBlocked, PeerRecovered, DHTRoutingTableUpdate, ClockTick, SimulationStateChanged and ScenarioPhaseFired render as `??` here even though the event log names them |

### 5.4 Telemetry (`ui/telemetry-panel.ts`)

Left drawer opened from the toolbar badge; has its own × close button (`index.html:107`, `telemetry-panel.ts:20`); updates only while open, from the `telemetry_status` frame every 2 s. Shows `N live peer(s) reporting` or a waiting message, the curl hint `curl -X POST /api/telemetry/submit -d '{"peer_id":"…"}'`, a LIVE PEERS list (name or shortened id, network badge, CPU bar green < 50 / amber < 80 / red, block height, age turning red after 30 s), and a CHECK-IN FEED with one row per peer per tick. Peers silent for more than 60 s are evicted by the backend. On the map a telemetry peer is a `receiving`-coloured node with a breathing green ring.

### 5.5 Legend and settings (`ui/legend.ts`)

Top-right "Legend" lists the eight fill colours of 2.3. The ⚙ gear opens the settings panel (no outside-click close):

| Toggle | Default | Effect |
|---|---|---|
| Gossip transfers | on (off under `prefers-reduced-motion`) | enables particles |
| Node labels | on | inert (see 2.6) |
| Edge lines | on | hides topology edges and the mesh overlay |
| Stage theme (t) | off | same as key `t` |
| Hero layout (h) | off | same as key `h` |

The first three toggles only write to `store` and never call `renderLayers` (`legend.ts:60-66`): the change appears on the next render, i.e. the next snapshot (≤ 500 ms live) or the next hover/click in a paused reel.

`initLegend()` runs after `loadPrefs()` (`app.ts:600-601`), so the pills are built from the restored prefs, and a `luminar:prefs-applied` listener (`app.ts:278`; `legend.ts:72-76`) re-syncs both Stage pills after every `t`/`h` toggle. This also makes the Gossip transfers pill reflect the `prefers-reduced-motion` default.

## 6. Narrator, stage theme, hero layout

### 6.1 Narrator (`ui/narrator.ts`)

Same code path live and in reels. Three outputs: the caption card (top-centre, 4 s, accent left border, `aria-live="polite"`), the timeline wash bands (section 4), and the hero ticker.

| Trigger | Caption | Beat added to milestones |
|---|---|---|
| `ScenarioPhaseFired` | the phase label | — |
| first `GossipPrune` with `reason === 'score'` and `to_peer` starting `sybil-` | `First Sybil pruned by score at T+N.Ns` | `First Sybil pruned` (attacker red) |
| analytics `recent_delivery_ratio >= 0.95` after a `FaultCleared` | `Mesh healed in N.Ns` (once per run) | `Mesh healed` (green) |

It also counts `GossipMessage`s whose `msg_id` starts with `spam-` as invalid messages for the ticker. A `scenario` frame or Reset ⟲ resets all of this (`resetNarrator`, `ui/narrator.ts:33-42`).

### 6.2 Stage theme (key `t`, `?theme=stage`)

`<html data-theme="stage">`: brighter secondary text (`--text2 #9fb0c8`, `--text3 #7f90a8`, ≥ 4.5:1 on the background), lighter borders, and `#app { zoom: 1.3 }` instead of resizing every font. Renderer scale becomes node ×1.4, particle ×1.8, edge alpha ×1.6 (`applyPrefs` `app.ts:262-278`, scale table `:266-268`).

### 6.3 Hero layout (key `h`, `?hero=1`)

`#app.hero` hides the statistics panel, event log and peer inspector; the timeline moves up to `bottom: 56px`; a 32px `#ticker` strip appears along the bottom of the map:

| key | value |
|---|---|
| phase | current phase label, else scenario name, else `free play` |
| delivery | recent delivery ratio as a percentage |
| mesh degree | mean mesh degree, 1 dp |
| hops | avg hops |
| end-to-end | avg propagation ms |
| attackers | `N · P pruned` (P = attackers with no connected peers) |
| invalid msgs | spam count |
| T | sim time |

All numeric cells show `—` until the first message. Both prefs persist in `localStorage['luminar.prefs']` and are mirrored to the URL; URL params override saved prefs on load. Nothing else (layout mode, speed, duration, node preset, legend toggles) persists across reloads.

## 7. Keyboard shortcuts and URL parameters

Keys are ignored while focus is in a `TEXTAREA`, `SELECT` or a non-range `INPUT`; the timeline range slider is exempt, so after a scrub the timeline keeps focus and Space/`f`/`0`–`3`/`t`/`h` still work. Keydowns with Ctrl/Meta/Alt held are ignored (browser chords). Keys are case-sensitive (`ui/keyboard.ts:6-9`).

| Key | Action |
|---|---|
| `Space` | play / pause |
| `f` | fit view |
| `Escape` | deselect node, clear `highlightPeers`, close the inspector |
| `1` `2` `3` | load reel 1/2/3 from the manifest (no-op if the manifest failed to load) |
| `0` | back to live |
| `t` | toggle stage theme |
| `h` | toggle hero layout |

Mouse: click a node toggles selection and opens the inspector (clicking the selected node again closes it); click empty canvas deselects and closes the inspector; hover shows the tooltip and teal peer rings; drag pans; scroll zooms. Event-log row click selects the referenced node (toggles off if already selected).

| URL param | Values | Effect |
|---|---|---|
| `reel` | `sybil-eclipse`, `partition-heal`, `healthy-publish` | boot straight into the reel without opening the WebSocket or fetching snapshot/edges. Unknown name, or a known name whose `.jsonl` fails to load → normal live start (WebSocket + snapshot + edges). Kept in sync by enter/exit reel |
| `theme` | `stage` | stage theme on (anything else = off) |
| `hero` | `1` | hero layout on |

`?reel=sybil-eclipse&theme=stage&hero=1` is the offline demo URL.

## 8. Data flow

### 8.1 WebSocket `/ws/events` (`backend/main.py:160-276`)

One socket. Events are text frames with no `type` field; everything else is a binary orjson frame with a `type`. The server loops at 20 Hz. URL is `VITE_API_URL` with `ws(s)://`, else same origin; Vite dev proxies `/api` and `/ws` to `:8000`. The client batches events for 50 ms and hands them to `handleWsEvents`; typed frames are dispatched synchronously.

| Frame | Cadence | Contents |
|---|---|---|
| event (no `type`) | every tick with new events, max 200 per tick (1,000,000 while recording) | `at`, `event_type`, `category` + the event's fields |
| `gap` | when more than 200 events arrived in a tick | `dropped`. Stored in `store.droppedEvents`, never displayed |
| `edges` | on connect and when the topology object changes | `edges: [[a,b],…]` |
| `scenario` | on connect and on every launch / reconfigure | `active`, `scenario`, `phase_idx`, `total_phases`, `next_phase_at`, `next_phase_label`, `completed_phases`, `all_phases_done` |
| `snapshot` | 500 ms | `state`, `time`, `speed`, `node_count`, `event_count`, `nodes[]` (peer_id, index, state, connected_peers, x, y, messages_sent/received, gossip_score; attackers appended with `state: "attacker"` and index ≥ 20000, their `connected_peers` = the honest meshes containing them, `backend/simulation/engine.py:123-130`; telemetry peers with `is_telemetry: true` and index ≥ 10001), `gossip{mesh_size, mesh}` |
| `metrics` | 2 s | `state_distribution`, `total_messages_sent/received`, `event_counts`, `stream_manager`, `dht_coordinator` |
| `analytics` | 2 s | `total_messages`, `avg_delivery_ratio`, `recent_delivery_ratio` (last 20), `avg_propagation_ms`, `avg_hops`, `avg_duplicates`, `delivery_ratios[]`, `latency_cdf[]` (11 points), `mesh_stability{avg,min,max_degree}` (honest subscribers only) |
| `telemetry_status` | 2 s | `active`, `peer_count`, `peers[]`, `otel{}` (otel is not read by the UI) |

### 8.2 Events → UI reactions

| Event | Store / map | Panels |
|---|---|---|
| `ClockTick` (every 0.1 sim-s) | `store.simTime` | log `ck` (filtered off by default) |
| `GossipMessage` | particle per hop (red from sybils, fizzle when dropped) | log `gm`; milestone "First gossip message"; narrator spam counter |
| `GossipGraft` / `GossipPrune` | green / red particle | log; first score-prune of a sybil → caption + beat |
| `GossipIHave` / `GossipIWant` | — | log |
| `DHTQueryStarted` | indigo particle | log |
| `FaultInjected` | red burst from target, only for Drop Peer and Eclipse (node-id target); none for Partition, Sybil, Latency | log `fi`; milestone "First fault injected" |
| `FaultCleared` | — | log `fc`; narrator starts the heal timer |
| `PeerRecovered`, `Stream*`, `SemaphoreBlocked`, `DHTQuery*`, `NodeHealthSnapshot` | — | log only |
| `SimulationStateChanged` | `simState`, `simSpeed`, `playing` (live only; ignored in reel mode, `app.ts:221`) | log |
| `ScenarioPhaseFired` | — | caption with the label; log `sp` |
| `snapshot` | nodes, mesh, time; `playing`/`simState`/`simSpeed` live only (`app.ts:418-421`); relayout if the node set changed; auto-pause at `maxDuration` | inspector score sample; sim-time readouts |
| `metrics` / `analytics` | `gossipAnalytics` | statistics panel; narrator heal check |
| `edges` / `scenario` | topology; `activeScenario` | wash bands; narrator reset |
| `telemetry_status` | — | toolbar badge; telemetry drawer |

### 8.3 REST calls the UI makes (`api/client.ts`)

`get`/`post` prepend `VITE_API_URL` and return `null` on any failure (network error or non-2xx; they never reject). If `localStorage['luminar.token']` is set, `post` sends it as `X-Luminar-Token` and the WebSocket appends `?token=`; the backend only enforces it when `LUMINAR_ADMIN_TOKEN` is set (public deploys), in which case every mutating call without it gets 403. Static assets (`getStatic*`) are fetched from the frontend origin, never the API.

| Call | When |
|---|---|
| `GET /api/sim/snapshot`, `GET /api/topology/edges` | boot (live only), after a scenario launch, after a node preset |
| `GET /api/scenarios` | boot (also in reel mode; fails silently offline) |
| `POST /api/sim/play` / `pause` / `reset` / `speed` / `seek` | playback controls, auto-pause |
| `POST /api/sim/reconfigure {n_nodes}` | node presets |
| `POST /api/scenarios/{id}/launch {speed}` | scenario menu |
| `POST /api/fault/partition` / `sybil` / `eclipse` / `drop` / `clear-all` | Inject Fault menu |
| `GET /reels/manifest.json`, `GET /reels/<name>.jsonl` | boot, reel select (static, frontend origin) |

### 8.4 Reel format

JSONL, one `{"t": <ms since WS connect>, "frame": <exact WS frame>}` per line, written by `backend/events/recorder.py` when a client connects with `?record=<name>` and the backend runs with `LUMINAR_ALLOW_RECORD=1`. Produced by `uv run python scripts/record_reel.py record <name> <scenario> --nodes 50 --duration 40`, which reconfigures, pauses, opens the recording socket, launches at speed 1, drains, and copies `recordings/<name>.jsonl` into `frontend/public/reels/`. `check` fails on any `gap` frame; the `GossipPrune(reason="score")` count check is opt-in, `--min-score-prunes` defaults to 0 for both `record` and `check` (`scripts/record_reel.py:102-103, 119, 122`). Shipped sizes: sybil-eclipse 9,660 frames / 3.5 MB (3,542,158 B), partition-heal 16,645 / 5.1 MB (5,147,512 B), healthy-publish 7,009 / 2.4 MB (2,355,431 B). Sim lengths (last snapshot `time`): 39.3 / 49.4 / 29.6 s.

## 9. Demo script: Sybil → Eclipse

Talk copy guard rails: "same mechanism, toy constants"; "reproducible recordings", never "identical runs".

### 9.1 From the reel (offline, safest on stage)

1. Open `/?reel=sybil-eclipse&theme=stage&hero=1`. Status shows `REEL · Sybil → Eclipse`; the graph is already drawn at the first snapshot, paused.
2. Press `f` to fit, then `Space` to play. Point out: slate idle nodes, cyan mesh overlay over grey topology edges, sky-blue particles on the first publish, the ticker's delivery % climbing.
3. T+10: caption "Sybil attack: 5 attackers graft in". Five hot-red `sybil-N` nodes appear next to their victims; red particles flood out of them; `invalid msgs` in the ticker starts counting; the red wash band on the scrubber begins. (No red fault burst: the Sybil target is a topic, not a node.)
4. Within a couple of heartbeats: red PRUNE particles, caption "First Sybil pruned by score at T+N.Ns", the sybil nodes turn grey as every honest mesh prunes them, ticker `attackers 5 · 5 pruned`. Say: "P4 scoring, same mechanism, toy constants."
5. T+16: caption "Eclipse on peer-10". Four `eclipse-N` nodes attach only to peer-10; its honest neighbours drop it from their meshes; purple wash band; a red burst from peer-10. The eclipse is visible through the cyan mesh overlay (peer-10's mesh lines now go only to the `eclipse-N` nodes) and through the four `eclipse-N` nodes, whose own connected peers are `[peer-10]`. Do not rely on the inspector to show it: `connected_peers` on honest nodes is the static topology adjacency (`backend/simulation/node_pool.py:46, 58, 112-121`) and `inject_eclipse` only rewrites the mesh, so peer-10's inspector chips, the tooltip's `N peers` and the hover rings still show its topology neighbours. Click an `eclipse-N` node instead if you want chips that tell the story. Say: "they stay red; silent attackers never trip the score."
6. T+24: caption "Faults cleared — mesh healing"; green GRAFT particles; delivery climbs back; caption "Mesh healed in N.Ns" when the recent ratio passes 95%.
7. Scrub back to any point to replay a phase (state only; particles and captions are not replayed on seek). Press `0` to return to live if a backend is reachable. Do not touch Scenarios, Inject Fault or the node presets while the reel plays: they hit the backend with no reel guard, and a reachable backend then overwrites the reel's nodes/edges (section 4).

### 9.2 Live

1. Load the page with the backend up; status `LIVE`. Click node preset `50`, wait for the layout to settle, press `f`.
2. `Scenarios ▾` → `🎬 Demo: Sybil → Eclipse (60s)`. It auto-plays at the current speed; phases fire at T+10 / T+16 / T+24 exactly as in 9.1. Keep speed at `1x` or `2x`; wash bands show where the phases will land.
3. Press `h` for hero and `t` for stage theme if not already set (they persist in localStorage and the URL).
4. To do it by hand instead: `Inject Fault ▾ → Sybil Attack` (5 attackers, no target needed); click the node you want eclipsed, then `Inject Fault ▾ → Eclipse Attack` (falls back to `nodes[0]` if nothing is selected); `Clear All Faults` to recover. Drop Peer needs a selected node or it does nothing. The red flash appears even if the backend is unreachable, so confirm by watching the map, not the flash.
5. Do not use the scrubber live: a seek only relabels the clock and does not rewind state; phases skipped over fire one per 200 ms once playing. Use Reset ⟲ and relaunch the scenario instead.

### 9.3 Known gaps to avoid on stage

Reset's `(R)` tooltip has no key; node labels never render (the toggle is dead); `#active-faults` and `#legend-rings` are empty; the fault flash does not mean the call succeeded; the inspector's *Connected peers* chips are topology neighbours, not the mesh, so an eclipse shows only in the live-events column and on the canvas (see 9.1 step 5); a duration preset click does not redraw the wash bands until the next scenario frame; the mesh overlay is absent above 100 nodes. Pan while a node is selected keeps the selection; a node preset, scenario or fault click in reel mode is refused with a toast until you press `0`.

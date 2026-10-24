# Luminar frontend — feature inventory for the Next.js port

Acceptance checklist for the `feat/ui-overhaul` rewrite. Verified against `eb26490` (2026-10-24) by reading every file under `frontend/src/`, `frontend/index.html`, `frontend/public/reels/manifest.json` and `docs/ui.md` (ui.md is partly stale: it lists 3 reels and a "grid" mode; the code has 4 reels and `force | radial | geo`). Trust the "Where in code" column over ui.md.

Verdict key: **Keep** = must survive the port unchanged in behaviour · **Improve** = keep, but fix the noted flaw · **Drop** = may be removed (dead or redundant).

Stack today: vanilla TS, Vite 6, deck.gl 9.2 (`OrthographicView`), d3-force 3, culori 4, `@fontsource/geist` + `geist-mono`. No framework, no router, one page. `window.__luminar = { store, fitView, viewState }` is the e2e/debug hook.

---

## 1. Shell, toolbar and global chrome

| Feature | Where in code | Behaviour | Verdict |
|---|---|---|---|
| Three-column shell | `index.html` `#app > #toolbar + #main`; `style.css:187-223` | 44px toolbar; `#stats-panel` 256px left, `#map-container` flex centre, `#event-log` 300px right. `html,body overflow:hidden`, no routing. | Improve: make the side columns collapsible/responsive; today nothing below ~1100px works |
| Brand | `index.html:12-15` | `LUMINAR` (600, 0.14em tracking) + `gossipsub v1.1` sub-label; sub-label hidden under stage theme | Keep (restyle) |
| Connection pill | `app.ts updateConnectionStatus`; `style.css:261-286` | `OFFLINE` (red-tinted pill, `.dot-offline`), `LIVE` (green dot, the one permitted glow), `REEL · <title>` (square white dot, wins over socket state). Driven by `ws.bind(onStatus)` and reel enter/exit | Keep |
| TELEMETRY badge | `index.html:20-22`; `app.ts handleWsTelemetryStatus` | Hidden until `telemetry_status.active`; shows `peer_count`; click toggles telemetry drawer | Keep |
| MAINNET badge | `index.html:23`; `app.ts toggleMainnet/applyMainnetStatus`; `styles/map.css` | Always visible; `.active` when `store.mainnet.enabled`. Click → `POST /api/live/mainnet {enabled: !cur}`; refused with toast in reel mode; "Backend offline" toast on null. Turning on triggers auto-Geo once | Keep |
| Scenarios dropdown | `app.ts buildScenarioDropdown/fetchScenarios` | Built from `GET /api/scenarios`; each row = name, `${duration}s` aside, description. Marks `active` row from `store.activeScenario`. Click → `reelGuard` → `leaveGeoForSim` → `POST /api/scenarios/{id}/launch {speed: store.simSpeed}` → refetch snapshot+edges | Keep |
| Reels dropdown | `app.ts fetchReels` | Built from `/reels/manifest.json` (frontend origin). Row = `<kbd>N</kbd>` + title, blurb as `title` tooltip; divider; `0 Back to live`. Active row = playing reel (`syncReelChrome`) | Keep; Improve: show blurb inline, show `real` badge |
| Inject Fault dropdown | `index.html:40-50`; `app.ts initDropdowns` | Partition (`split in half`), Sybil (`5 peers`), Eclipse (`on selected`), Drop Peer (`select a node`), divider, Clear all faults. See §7 | Keep |
| Dropdown mechanics | `app.ts setDropdown/initDropdowns`; `style.css:310-378` | Opening one closes the other two; click outside `.dd-wrap` closes all; `.dd-wrap.open` flips caret ▼→▲ | Keep (use a proper popover/menu primitive) |
| Duration presets | `index.html:56-64`; `app.ts initPresets/syncDurationPreset` | `1m 2m [5m] 10m` → `store.maxDuration` + `store.durationStep` (60/120/300/600). No backend call. Active follows `maxDuration` exactly, so none is lit after a scenario sets it or Play extends it. Refused in reel mode | Keep |
| Node presets | `index.html:66-76`; `app.ts initPresets/syncNodePreset` | `[20] 50 100 200 500` → `POST /api/sim/reconfigure {n_nodes}` then refetch topology; `topoKey=''` forces relayout. Active follows `snapshot.node_count` (deploys boot 20 or 50). Refused in reel mode; leaves Geo | Keep |
| Sim clock | `index.html:79`; `formatTime` | `T+ 12.3s` under 60s, `m:ss` after; updated on every event batch and snapshot | Keep |
| GitHub link | `index.html:80-84` | icon link to repo | Keep |
| `#app.reel` dimming | `app.ts syncReelChrome`; `style.css:442` | presets, scenario and fault pickers at `opacity .5` while a reel plays | Keep |
| Fault toast | `app.ts showFaultFlash`; `style.css:380-415` | Single `#fault-flash` top-left under toolbar, 260px, 2s fade. Used for faults, reel guard, Geo switch, link copied, backend offline. `.lm-injected`/`.lm-failed` variants exist in CSS but are never applied; toast fires even when the POST failed (`post()` resolves null) | Improve: toast must reflect success/failure; use a toast queue |
| Keyboard hint row | `index.html:159-164`; `style.css:479-491` | `SPACE play · F fit · T stage · H hero` bottom-left of map; hidden in hero | Keep (consider a `?` overlay with the full list) |
| Focus/scrollbar/base | `style.css:138-156` | `color-scheme: dark`, 12px/1.4 Geist Mono, tabular nums, 2px accent `:focus-visible`, 6px scrollbars | Keep |
| Reduced motion | `style.css:113-115, 1079-1084`; `app.ts loadPrefs`; `renderer.ts reducedMotion` | zeroes hover/drawer/pulse durations, kills caption transition and drain, fault-fade, bubble; disables particles and pulses | Keep |

## 2. Keyboard shortcuts (`ui/keyboard.ts`)

Ignored when focus is in `TEXTAREA`, `SELECT`, or a non-range `INPUT`; the timeline range slider is exempt. Ignored with Ctrl/Meta/Alt held. Case-sensitive lowercase.

| Key | Behaviour | Where | Verdict |
|---|---|---|---|
| `Space` | `togglePlay()` (live POST or reel scheduler) | `keyboard.ts:12-15` | Keep |
| `f` | `luminar:fitview` → `fitView()` | `keyboard.ts:16-19` | Keep |
| `Escape` | deselect node, clear `highlightPeers`, `luminar:render` (closes inspector) | `keyboard.ts:20-24` | Keep |
| `1`–`9` | `luminar:reel {detail: N-1}` → `enterReel(manifest[N-1])`; no-op past last reel | `keyboard.ts:25-27`; `app.ts:374-378` | Keep |
| `0` | `luminar:reel {-1}` → `exitReel()` (back to live) | `keyboard.ts:28-30` | Keep |
| `s` | `luminar:share` → `shareMoment()` (copy URL) | `keyboard.ts:31-33` | Keep |
| `t` | `luminar:pref 'stageTheme'` toggle | `keyboard.ts:34-36` | Keep |
| `h` | `luminar:pref 'hero'` toggle | `keyboard.ts:37-39` | Keep |
| `R` (Reset tooltip says `(R)`) | **not bound** | `index.html:169` | Improve: bind it or fix the tooltip |

## 3. URL parameters

| Param | Values | Read | Written | Verdict |
|---|---|---|---|---|
| `reel` | manifest `name` (`sybil-eclipse`, `partition-heal`, `healthy-publish`, `mainnet-block-wave`) | `app.ts main()`: boot straight into the reel, no WS; unknown/failed → live | `enterReel`/`exitReel` via `history.replaceState` | Keep |
| `theme` | `stage` (anything else = off) | `loadPrefs` (overrides localStorage) | `applyPrefs` | Keep |
| `hero` | `1` | `loadPrefs` | `applyPrefs` | Keep |
| `t` | sim seconds, reels only | `applyUrlMoment` → `seekReelToSimTime(t)` | `syncUrlMoment` only while a reel is paused; deleted otherwise | Keep |
| `peer` | peer id | `applyUrlMoment` → select + `luminar:nodeselect` | `syncUrlMoment` on every nodeselect and on a 1s interval | Keep |
| (prefs) | `localStorage['luminar.prefs']` `{stageTheme, hero}` | `loadPrefs` | `applyPrefs` | Keep |
| (token) | `localStorage['luminar.token']` | `api/client.ts adminToken()` → `X-Luminar-Token` header on every POST | never written by the UI | Improve: give the presenter a way to set it (settings field) |

Offline demo URL: `/?reel=sybil-eclipse&theme=stage&hero=1`. Share moment copies `?reel=…&t=…&peer=…`.

## 4. Data layer

### 4.1 REST (`api/client.ts`)

`get`/`post` prepend `VITE_API_URL` (empty in dev; Vite proxies `/api` and `/ws` → `:8000`), never throw, return `null` on network error or non-2xx. `getStatic`/`getStaticText` hit the frontend origin (reels, manifest, geo).

| Call | Payload → response | Used by | Verdict |
|---|---|---|---|
| `GET /api/sim/snapshot` | → `SimSnapshot` | boot, after launch/reconfigure (`fetchTopology`) | Keep |
| `GET /api/topology/edges` | → `{edges: [a,b][]}` | same | Keep |
| `POST /api/sim/play` / `pause` / `reset` | → `{state}` | playback, auto-pause | Keep |
| `POST /api/sim/speed` | `{speed}` | speed presets | Keep |
| `POST /api/sim/seek` | `{time}` | scrubber (live) — backend only relabels the clock | Improve: hide or warn; live seek does not rewind state |
| `POST /api/sim/reconfigure` | `{n_nodes}` → `{n_nodes, edge_count}` | node presets | Keep |
| `GET /api/scenarios` | → `{scenarios: ScenarioDefinition[]}` | boot | Keep |
| `POST /api/scenarios/{id}/launch` | `{speed}` → `{status}` | scenario menu | Keep |
| `POST /api/fault/partition` | `{group_a, group_b}` → `{ok, fault_id}` | fault menu | Keep |
| `POST /api/fault/sybil` | `{n_attackers: 5, target_topic: 'lumina/blocks/1.0'}` | fault menu | Keep |
| `POST /api/fault/eclipse` | `{target_peer_id, n_attackers: 4}` | fault menu | Keep |
| `POST /api/fault/drop` | `{peer_id}` | fault menu | Keep |
| `POST /api/fault/clear-all` | → `{ok, cleared}` | fault menu | Keep |
| `POST /api/live/mainnet` | `{enabled}` → mainnet status (see 4.2) | MAINNET badge | Keep |
| `GET /reels/manifest.json`, `GET /reels/<name>.jsonl`, `GET /geo/land-110m.json` | static | reels, Geo | Keep |
| Unused wrappers: `topologyMetrics`, `metricsSnapshot`, `eventsRecent`, `gossipMesh/Scores/Analytics`, `faultActive`, `scenarioActive` | — | nothing | Drop (or keep behind a typed client if cheap) |

### 4.2 WebSocket `/ws/events` (`api/websocket.ts`)

One socket (`VITE_API_URL` → `ws(s)://…/ws/events`, else same origin). Single-socket invariant (connect while open is a no-op; superseded socket callbacks dropped). Reconnect 1s ×2 → 10s cap. Text frames = events (no `type`), batched 50ms → `onBatch`. Binary (Blob/ArrayBuffer orjson) = typed frames, dispatched synchronously. `ws.dispatch(frame)` is public so the reel player reuses the same path.

| Frame `type` | Cadence | Shape used by the UI | Handler | Verdict |
|---|---|---|---|---|
| (none) event | per tick, ≤200/tick | `{at, event_type, category, peer_id?, from_peer?, to_peer?, msg_id?, msg_ids?, topic?, hops?, fault_type?, fault_id?, count?, target?, reason?, dropped?, speed?, state?, label?, initiator?, score?, slot?, block_root?, seen_ms?, client?, country?, first?}` | `handleWsEvents` | Keep |
| `gap` | when >200 events/tick | `{dropped}` → `store.droppedEvents` (never displayed) | `handleWsGap` | Improve: surface it |
| `edges` | connect + topology change | `{edges: [string,string][]}` | `handleWsEdges` → relayout if `topoKey` changed | Keep |
| `scenario` | connect + launch/reconfigure | `{active, scenario: {id,name,description,icon,topology_type,phases[{at,label,action}],duration} \| null, phase_idx, total_phases, next_phase_at, next_phase_label, completed_phases[], all_phases_done}` | `handleWsScenario` → `activeScenario`, `maxDuration = duration`, rebuild menu, `narratorOnScenario` | Keep |
| `snapshot` | 500ms | `{state, time, speed, node_count, event_count, nodes: PeerNode[], gossip?: {mesh_size, mesh: Record<id, id[]>}}`; `mesh` is `{}` above 100 nodes; attackers appended with `state:'attacker'`, `last_targets`; observers with `is_real, client, country, city, seen_ms, x, y`; telemetry peers `is_telemetry` | `handleWsSnapshot` | Keep |
| `metrics` | 2s | `{state_distribution, total_messages_sent, total_messages_received, event_counts, stream_manager{open,max,available}, dht_coordinator{active,available}}` | `handleWsMetrics` | Keep |
| `analytics` | 2s | `{total_messages, avg_delivery_ratio, recent_delivery_ratio?, avg_propagation_ms, avg_hops, avg_duplicates?, delivery_ratios[{msg_id,ratio}], latency_cdf[{percentile,latency_ms}] (11 pts), mesh_stability{avg_degree,min_degree,max_degree}}` | `handleWsAnalytics` | Keep |
| `telemetry_status` | 2s | `{active, peer_count, peers[{peer_id,node_name,network,last_seen,age_seconds,cpu,best_block}], otel{} (unused), mainnet: {enabled, observers, slot, block_root, rows, with_geo, first_ms, p50_ms, max_ms, first_client, first_country, lag_s (156), fetched_at}}` | `handleWsTelemetryStatus` → badge, drawer, `applyMainnetStatus` | Keep |

### 4.3 Store (`store.ts`) — fields the port must model

| Group | Fields | Notes |
|---|---|---|
| Connection | `connected` | |
| Sim | `simState 'running'\|'paused'\|'stopped'`, `simTime`, `simSpeed`, `nodeCount`, `eventCount` | in reel mode snapshot `state/speed` are ignored |
| Graph | `nodes: PeerNode[]`, `edges`, `nodePositions: [x,y][]` (index-aligned, frozen), `nodeIndex: Map<id, idx>`, `mesh: Record<id, id[]>` | |
| Layout | `layoutMode 'force'\|'radial'\|'geo'` | |
| Playback | `playing` | |
| Selection | `selectedNode` (idx, -1), `hoveredNode`, `highlightPeers: string[]` | selection is re-resolved by peer id on every snapshot |
| Events | `events: AppEvent[]` (ring, `maxEvents` 2000) | |
| Scenarios | `scenarios`, `activeScenario {active, scenario, phase_idx?}` | |
| Reel | `reel {name,title,durationMs,durationSim}` or null | |
| Live | `mainnet` (status above) or null, `droppedEvents` | |
| Metrics | `stateDistribution`, `totalMessagesSent/Received`, `eventCounts`, `streamManager {open,max,available}`, `dhtCoordinator {active,available}` | |
| Duration | `maxDuration` (300), `durationStep` (300) | see §6 pause-at-limit |
| Display | `particlesEnabled`, `showLabels`, `showEdges`, `stageTheme`, `hero`, `scale {node, particle, edgeAlpha}` | stage: `{1.4, 1.8, 1.6}` |
| Analytics | `gossipAnalytics` (shape above) or null, `milestones[]`, `beats[]` | |
| Helper | `timelineTotal()` = `reel.durationSim` else `maxDuration` | single source for scrubber span |

`PeerNode`: `peer_id, index, state (idle\|origin\|receiving\|decoded\|error\|joining\|failed\|attacker), connected_peers[], last_targets?, is_real?, is_telemetry?, client?, country?, city?, seen_ms?, x, y, messages_sent, messages_received, gossip_score`.

Cross-module DOM events (replace with store subscriptions in the port): `luminar:render`, `luminar:nodeselect`, `luminar:fitview`, `luminar:pref`, `luminar:prefs-applied`, `luminar:reel`, `luminar:share`, `luminar:sim-action`, `luminar:duration`.

## 5. Map renderer (`map/renderer.ts`, `map/layout.ts`, `palette.ts`, `map/overlay.ts`)

| Feature | Where | Behaviour | Verdict |
|---|---|---|---|
| deck.gl canvas | `initRenderer` | `OrthographicView({flipY:false})`, `controller: true` (drag pan, wheel zoom), cursor `pointer` over node / `grab` elsewhere. Root `onClick` on empty canvas deselects (tap recogniser, so a pan never deselects) | Keep (swap in crosshair cursor per new aesthetic if desired) |
| Palette from CSS tokens | `palette.ts refreshPalette` | Every deck colour is read from `--lm-node-*` / `--lm-map-*` via culori at render time; re-read when `data-theme` flips. `nodeFillColor/LineColor/LineWidth` encode failed (danger stroke 1.25px) and pruned attacker (hollow: fill = bg, 1.5px grey stroke) | Keep the single-source-of-truth principle |
| `#ring-canvas` overlay | `map/overlay.ts` | sized only; draws nothing | Drop |
| Layer order | `renderLayers` | 0 `world-land` (Geo only) · 1 `edges` · 1a `attack-links` · 1b `mesh-edges` · 2 `hover-edges` + `hover-peer-rings` · 3 `pulses` · 3.5 `particles` · 4a `attacker-halos` · 4 `nodes` (only pickable) · 4b `telem-rings` · 5 `selection-ring` · 6 `event-highlight-edges/rings` · 7 `labels` | Keep |
| Topology edges | layer 1 | `--lm-map-topology`, alpha .9×`ea` (force) / .36 (radial), width 1; hidden by Edge lines toggle | Keep |
| Attack links | layer 1a | grafted attacker → each `connected_peers` victim, `--lm-map-attack-link` | Keep |
| Mesh overlay | layer 1b | `store.mesh` honest pairs only, deduped undirected, tangerine 1.5px; absent above 100 nodes | Keep; Improve: tell the user why it vanished at 200/500 |
| Hover | layer 2 | hovered node's topology edges at 2px + rings (r+4) around its peers; tooltip | Keep |
| Pulses | layer 3 | state change to non-idle (attacker graft↔prune flip counts) → 2.5× disc, alpha 56→0 over 800ms; cap 200; off under reduced motion | Keep |
| Particles | `spawnParticle`, layer 3.5 | kinds `message\|sybil\|graft\|prune\|dht\|fault` → tokens; quadratic Bézier bowed left (so A→B / B→A separate), 800ms travel ease-out, 1200ms life (rests at target at half alpha), r = 0.3×node×scale clamped 1.9–3.4px; `fizzle` (dropped hop) stalls at 60% and fades; cap 600; no-op when disabled / unknown peer | Keep |
| Particle triggers | `app.ts handleWsEvents` | `GossipMessage` from→to (sybil red if sender `sybil-*`, fizzle if `dropped`); `GossipGraft/Prune`; `DHTQueryStarted` to one random peer; `FaultInjected` burst to first 4 peers only when `target` is a node id (Drop, Eclipse) | Keep |
| Node discs | layer 4 | r = `clamp(200/√n, 3, 8)×scale.node`, ×0.5 in radial; ×1.5 selected, ×1.15 attacker; click toggles selection → `luminar:nodeselect`; hover sets `hoveredNode` + tooltip | Keep |
| Attacker halo | layer 4a | grafted attackers only, 1.7× r, alpha 140 | Keep |
| Real/telemetry ring | layer 4b | `is_real \|\| is_telemetry` → green ring 1.6× r breathing alpha .2→.75 on 5.6s sine | Keep |
| Selection ring | layer 5 | white 2px at 2× r | Keep |
| Event-click highlight | layer 6 | lines + rings from selected node to `highlightPeers` in pale tangerine | Keep |
| Labels | layer 7 | TextLayer: attackers always (raw id), plus selected + hovered (`nN`); 10px Geist Mono 500 (12 in stage); waits for `document.fonts.load` so the atlas bakes with the right face; off via Node labels toggle | Keep; Improve: an "all labels" mode for ≤50 nodes |
| World map | `ensureLand`, layer 0 | Natural Earth 110m from `/geo/land-110m.json`, lon/lat × `GEO_SCALE 2.5`, fill alpha 12 / line 40, loaded once on first Geo render | Keep (dither it) |
| Tooltip | `showTooltip/updateTooltipContent`; `#tooltip` | 200px raised card at cursor +16/−10 clamped in map. Header: short name + state badge (`PRUNED` grey for pruned attacker), shortened id. Honest: `peers`, `score` (signed, red if <0), `sent · recv`, `mesh N sybil grafts` (red). Attacker: `grafted into N meshes`, score, traffic, victim names. Hidden in hero | Keep |
| fitView | `fitView` | bbox of visible nodes (Geo: fixed `WORLD_BOUNDS` −180..180 × −58..84 deg), pad 80, zoom ≤ 4, 500ms transition. Called after every relayout (rAF), on `f`, exposed on `window.__luminar` | Keep |
| rAF loop | `startAnimationLoop` | re-renders only while pulses/particles exist | Keep |
| Force layout | `layout.ts layoutForce` | d3-force run synchronously once and frozen: link 0.4 at `max(40, 400/√n)`, charge −800 (distanceMax 6×), centre .03, collide .25×; 300 ticks cold (150 >200 nodes), 60 warm. Cold when edge-set key changed or >½ nodes new; warm pins known nodes and settles only newcomers (attacker starts beside first victim). Pruned attacker gets a weak tether (0.2, 1.6× dist) to ≤2 `last_targets`. Isolated nodes parked on the rim. Positions remembered per peer id only for nodes still present | Keep (this was PR #5; it is the stage-stability guarantee) |
| Radial layout | `layoutRadial` | highest degree at centre, concentric rings by degree, ≥6 per ring, degree counts attacker links | Keep |
| Geo layout | `computeLayout 'geo'` | `[x, -y]` from producer-projected lon/lat; sim peers hidden | Keep |
| Visibility rule | `isSimPeer/isNodeVisible` | Geo draws only `is_real \|\| is_telemetry`; Force/Radial draw only sim peers. Hidden nodes take no part in physics, fit, selection, particles, pulses, event-row clicks, chips | Keep |
| Relayout trigger | `app.ts currentTopoKey/recomputeLayout` | key = visible `idx:peer_id` list + sorted edge list + mode; state changes alone never relayout; attackers get synthetic layout edges from `connected_peers`/`last_targets` | Keep |
| Mode switcher | `ui/mode-switcher.ts`; `app.ts setLayoutMode/updateGeoAvailability/maybeAutoGeo/leaveGeoForSim` | Top-centre `FORCE \| RADIAL \| GEO`. Geo tab disabled (title explains) unless real nodes exist; auto-picked once per feed-on / real reel; previous layout restored when real nodes vanish; any sim action (scenario, fault, preset, reset) leaves Geo with a toast; a manual pick clears the remembered layout; selecting a node not drawn in the new mode is dropped | Keep |
| Provenance card | `app.ts applyMainnetStatus`; `styles/map.css #provenance` | Top-left while `mainnet.enabled`: `LIVE MAINNET` / `RECORDED MAINNET` + `slot N · T−156s (or 'recorded') · N observers [· shown on the Geo layout] · arrival at observer nodes, not mesh paths · data: ethPandaOps (CC BY 4.0)` | Keep verbatim (honesty line) |
| BlockSeen handling | `app.ts handleWsEvents` | on `first`: all real nodes → idle, caption in Geo only (`slot · block root · first seen ms (client, country)`); observer → `origin` (first) / `decoded`, `seen_ms` set, immediately (not waiting for snapshot) | Keep |

## 6. Timeline / playback (`ui/playback.ts`, `index.html:167-209`)

| Feature | Behaviour | Verdict |
|---|---|---|
| Bar | floats `bottom:36px` (60px in hero), 76% wide 360–820px: Reset, Play/Pause, scrubber, `cur / total`, speed presets | Keep |
| Reset ⟲ | live: `POST /api/sim/reset`, clears events/log/selection/milestones, `narratorOnScenario()`, leaves Geo, re-renders. Reel: pause + seek to sim 0 | Keep |
| Play/Pause | live: POST play/pause; `playing` re-synced from every snapshot. Reel: local scheduler. **Pause-at-limit rule**: sim pauses when `simTime >= maxDuration` (`autoPauseIfDue`, client POSTs pause); Play at the limit first adds `durationStep` to `maxDuration` so the shown total grows and the sim never fights the guard | Keep |
| Scrubber | invisible `<input type=range max=1e6>` hit layer; fill/head/bubble follow `--tl-pct`; `input` → `pct × timelineTotal()`; live `POST /api/sim/seek` (relabels clock only); reel `seekReelToSimTime` (replays last state frames, skips events). Bubble shows time on hover/active; keyboard-focusable | Keep; Improve: live seek should be disabled or clearly "clock only" |
| Wash bands | `narrator.ts renderBands`: one band per `inject_*` phase until next `clear_faults`, coloured by `data-action` (`--lm-band-*`), tooltip `label (T+Ns)` | Keep |
| Tick marks / labels | `.lm-tl-tick`, `.lm-tl-lbl` CSS exists; nothing creates them; `store.milestones` computed every 2s but never drawn on the track | Improve: draw beats/milestones on the scrubber |
| `cur / total` | `formatTime(simTime) / formatTime(timelineTotal())` | Keep |
| Speed presets | `.5× [1×] 2× 3× 5× 10×` → `store.simSpeed`; live POST speed; reel `setReelSpeed` (min 0.1); active re-synced from snapshot (live) | Keep |

## 7. Faults, scenarios, presets

| Item | Call / target | Verdict |
|---|---|---|
| Network Partition | sim peers (`isSimPeer`) split by array index into halves → `faultPartition` | Keep; Improve: split by cluster/layout side, not index |
| Sybil Attack | fixed 5 on `lumina/blocks/1.0` | Keep (expose N) |
| Eclipse Attack | selected sim node, else first sim node; 4 attackers | Keep |
| Drop Peer | selected sim node; silently no-ops without one | Improve: disable item when nothing selected |
| Clear all faults | `faultClearAll` | Keep |
| All fault clicks | `reelGuard` → `leaveGeoForSim` → fire-and-forget → toast regardless of result | Improve (see toast) |
| Scenario launch | sets `maxDuration` from `scenario.duration` on the `scenario` frame; auto-plays at current speed; phases fire via `ScenarioPhaseFired` | Keep |
| Node presets / Duration presets | see §1 | Keep |

## 8. Panels

### 8.1 Statistics (`ui/stats-panel.ts`)

| Section | Content | Verdict |
|---|---|---|
| KPI tiles 2×2 | Delivery `%` + dot (ok ≥95, bad <50; prefers `recent_delivery_ratio`), Propagation `ms`, Avg hops, Mesh degree with `min–max` unit; `—` until `total_messages > 0` | Keep |
| Nodes | header `node_count`, 6px stacked state bar, 2-col grid of 9 states (idle, origin, receiving, decoded, joining, failed, error, attacker, pruned); `pruned` derived = attackers with 0 peers, subtracted from `attacker` | Keep |
| Messages | Sent, Received, Total events (`1,284` <10k else `61.9K`) | Keep |
| Delivery CDF | 224×56 canvas `drawCDF` (x latency, y percentile, dashed p50, `p50 Nms` title, min/p50/max axis) via `charts/sparkline.ts` | Keep |
| Milestones | rows from `store.milestones` (First gossip message, First fault injected, `N messages`, `N nodes decoded/receiving`) + narrator beats (brighter); `time.toFixed(3)s`; `cursor:pointer` but no handler | Improve: click → seek (reels) / highlight; dedupe the ever-changing count rows |
| Event categories | gossip, connection, stream, dht, fault, health: bar (share of total, min 2%, fault bar red) + count | Keep |
| Infrastructure | Streams `open/max` bar; DHT `active/8` as 8 segments (8 hard-coded) | Keep (read `available` instead of hard-coding) |

### 8.2 Event log (`ui/events-panel.ts`)

| Feature | Behaviour | Verdict |
|---|---|---|
| Header | `Event log` + `N · following/paused` (auto-scroll lock flips when scrolled >30px up); hidden `clear-filter-btn` | Keep; Drop the dead button |
| Filter chips | `All`, `None`, Gossip, Conn, Stream, DHT, Fault, Health, Clock (off by default), Sim, Live; click toggles, Alt/Meta-click isolates; `⌥-click isolates` hint | Keep |
| Rows | 22px grid: `at.toFixed(2)`, node (`nN`, attackers red, `net`/`sim`), 2-letter code coloured by consequence (`TYPE_CODES`, 23 types + `??`), detail (`buildDetail` per type). Cap 500 DOM rows; rebuild from last 500 on filter change | Keep |
| Row click | selects referenced node if visible in current layout; `highlightPeers = to_peer (+ first 8 connected peers for gm)`; toggles off if already selected; selected row gets accent left border; does not open inspector | Keep; Improve: open inspector too, or make the distinction visible |
| `shortId`, `isAttackerId`, `TYPE_CODES` | shared with inspector | Keep as one module |

### 8.3 Peer inspector (`ui/peer-inspector.ts`)

| Feature | Behaviour | Verdict |
|---|---|---|
| Open/close | opens on `luminar:nodeselect` (canvas click, chip, `?peer=`), closes on × / Esc / empty-canvas click / Reset / toggle-off (any `luminar:render` with `selectedNode<0`); slides over the event log (300px) | Keep |
| Header | state dot (hollow if pruned), short name 16px, badges `state` (`pruned`) + `attacker`, full peer id, `ESC` kbd | Keep |
| Metrics | Sent · Recv · Score (red <0, dim =0, `−` sign) · Peers | Keep |
| Score history | `last 50 ticks` sparkline (one sample per snapshot), y ⊇ [−0.5, 0.5], dashed zero, red when latest <0, `T+a … T+b` axis | Keep |
| Connected peers · N | chips of `connected_peers` (topology adjacency, **not mesh**); click selects (visible only); pruned attacker shows instead the honest peers that PRUNEd it (dashed, struck) + note | Keep; Improve: add a mesh-peers row so an eclipse is visible in the inspector |
| Live events | last 100 buffered + live events touching the peer: ts, code, `↑/↓/·`, other peer `· detail`; cap 200 | Keep |

### 8.4 Telemetry drawer (`ui/telemetry-panel.ts`)

Left 272px drawer, opened from the badge, own ×; updates only while open from `telemetry_status`. Summary (`N live peers reporting · ring on map breathes per check-in`), curl hint, LIVE PEERS rows (name/short id, network badge, 3px CPU bar + %, `#best_block`, age with stale >30s red), CHECK-IN FEED (one row per peer per tick, `hh:mm:ss`, `cpu N%`, cap 200, auto-scroll). **Keep** (low priority for Devcon; could become a tab in a unified right rail).

### 8.5 Legend + settings (`ui/legend.ts`)

Top-right 176px card. Fills: idle, origin, receiving, decoded, joining, failed, attacker, pruned attacker (`error` omitted). Lines: topology, gossip mesh, message dot. Gear swaps body for settings (title → `Settings`, gear → ✕; no outside-click close): toggles Gossip transfers (particles; off + hint under reduced motion), Node labels, Edge lines, Stage theme `T`, Hero layout `H`; switches re-sync on `luminar:prefs-applied`. **Keep**; Improve: add `error` fill, Geo/world-map toggle, admin token field.

### 8.6 Narrator (`ui/narrator.ts`)

| Output | Behaviour | Verdict |
|---|---|---|
| Caption card | top-centre under the switcher, `aria-live=polite`, kicker `T+N.Ns · PHASE/NARRATOR` (accent-bright; green for `healed`), 17px Geist sans sentence, 2px drain bar over 4s, restarts on re-trigger | Keep (this is the "Fig." caption slot in the new aesthetic) |
| Triggers | `ScenarioPhaseFired` → label; first `GossipPrune reason=score to sybil-*` → "First Sybil pruned by score" + beat; `FaultCleared` then `recent_delivery_ratio ≥ .95` → "Mesh healed in N.Ns" + beat; counts `spam-*` messages as invalid; `BlockSeen.first` in Geo (from app.ts) | Keep |
| Reset | `scenario` frame or Reset clears latches, beats, bands, ticker | Keep |
| Hero ticker | 44px strip, cells `phase · delivery · mesh d · hops · e2e · attackers (N · P pruned, red) · invalid (red) · T`; in Geo with mainnet on, cells 2–5 become `slot · first seen (ms · client) · p50 · observers`; `—` before first message; only rendered while `store.hero` | Keep |

## 9. Themes: stage, hero

| Feature | Where | Behaviour | Verdict |
|---|---|---|---|
| Stage theme | `app.ts applyPrefs`; `style.css:106-111, 1069-1076` | `<html data-theme=stage>`: brighter fg2/fg3, stronger border, mesh alpha .6, `#app { zoom: 1.3 }` with compensated width/height, brand sub + preset labels hidden; renderer scale node 1.4 / particle 1.8 / edgeAlpha 1.6, labels 12px | Keep the intent (projector legibility); Improve: replace `zoom` with real type/spacing scale tokens |
| Hero layout | `style.css:596-633` | `#app.hero`: hides stats, log, inspector, kbd hints, tooltip; timeline up to 60px; ticker visible | Keep |
| Persistence | `loadPrefs/applyPrefs` | localStorage + URL mirror; URL wins on load; `luminar:prefs-applied` re-syncs toggles | Keep |

## 10. Reels (`api/replay.ts`, `public/reels/`)

| Feature | Behaviour | Verdict |
|---|---|---|
| Manifest | `manifest.json` `[{name, title, file, nodes, blurb, real?}]`; 4 reels: `sybil-eclipse` (50), `partition-heal` (50), `healthy-publish` (50), `mainnet-block-wave` (138, `real: true`, 193 snapshots + 8 telemetry_status with `mainnet` status + BlockSeen events) | Keep |
| JSONL format | one `{"t": ms, "frame": <exact WS frame>}` per line; sizes today 3.6 / 4.3 / 2.3 / 7.0 MB | Keep; Improve: gzip or lazy-load, 17 MB total ships with the bundle |
| Load | `loadReel`: fetch text, parse lines (skip malformed), `stopReel`, `store.reel = {name,title,durationMs,durationSim (last snapshot time)}`, clear events, seek to first snapshot so the graph shows before play | Keep |
| Enter | `enterReel`: `ws.disconnect()`, clear mainnet status, `topoKey=''`, load, `#app.reel`, status pill `REEL · title`, `?reel=` | Keep |
| Exit | `exitReel` / key `0`: `stopReel`, clear mainnet status, drop `?reel`, `ws.connect()` | Keep |
| Play | `setInterval` 50ms (survives background tabs), `elapsed += dt × speed`, dispatch all frames `t ≤ elapsed` through `ws.dispatch`, flush, `onTick`; auto-pause at the end; replay from 0 if at end | Keep |
| Seek | `seekReel(ms)`: replay last `edges, scenario, telemetry_status, snapshot, metrics, analytics` before `t`, skip events (no particles/log/captions on seek); `seekReelToSimTime(sec)` finds first snapshot with `time ≥ sec` | Keep; Improve: optionally replay the last N seconds of events so a seek lands with motion |
| Speed | `setReelSpeed` min 0.1 | Keep |
| Guards | recorded `SimulationStateChanged` and snapshot `state/speed` ignored in reel mode; `reelGuard` refuses scenario/fault/preset menus with toast | Keep |
| Moments | `?t=` + `?peer=` written while paused; `s` copies the link ("Link copied" toast, `prompt` fallback) | Keep |

## 11. Design tokens and fonts (`style.css:18-133`)

Fonts: `--lm-font: "Geist Mono", "JetBrains Mono", ui-monospace, monospace` (400/500/600 self-hosted via `@fontsource/geist-mono`), `--lm-font-say: "Geist", ui-sans-serif, system-ui` (400/500) used only for the caption sentence. Base `400 12px/1.4`, `font-variant-numeric: tabular-nums`. deck TextLayer uses `"Geist Mono", "JetBrains Mono", monospace` 500.

| Group | Tokens (value) |
|---|---|
| Chrome | `--lm-bg #111113` · `--lm-panel #171719` · `--lm-raised #232326` · `--lm-hover #29292c` · `--lm-border #2d2d30` · `--lm-border-strong #3b3b3e` · `--lm-fg #f2f2ef` · `--lm-fg2 #9a9994` · `--lm-fg3 #74736f` |
| Accent (tangerine, h60) | `--lm-accent oklch(72% .166 60)` (live mesh only) · `--lm-accent-bright oklch(80% .117 60)` · `--lm-accent-pale oklch(88% .076 60)` · `--lm-accent-soft oklch(24% .063 60 / .5)` · `--lm-focus = accent` · engine vars `--accent-h 60`, `--accent-c .18` |
| Semantic | `--lm-danger oklch(64% .245 25)` (attackers + failures only) · `--lm-danger-text oklch(78% .15 22)` · `--lm-danger-soft oklch(28% .08 22 / .5)` · `--lm-ok #34d399` · `--lm-online #22c55e` |
| Node fills | `--lm-node-idle #3b3b3e` · `-origin #a78bfa` · `-receiving #d5d3ce` · `-decoded #34d399` · `-joining oklch(72% .08 235)` · `-failed oklch(45% .13 25)` · `-error oklch(70.4% .191 22.2)` · `-attacker oklch(64% .245 25)` · `-pruned #9a9994` |
| Map layers | `--lm-map-topology #3b3b3e` · `-mesh oklch(72% .166 60 / .42)` · `-attack-link oklch(64% .245 25 / .35)` · `-particle oklch(95% .045 60)` · `-particle-sybil = node-attacker` · `-particle-graft = ok` · `-particle-prune = node-attacker` · `-particle-dht #a78bfa` · `-ring-select #f2f2ef` · `-ring-hover rgb(242 242 239 / .45)` · `-ring-telemetry #22c55e` · `-ring-highlight oklch(88% .076 60)` |
| Timeline bands | `--lm-band-sybil oklch(64% .245 25 / .45)` · `-eclipse rgb(167 139 250 / .45)` · `-partition rgb(213 211 206 / .3)` · `-latency oklch(72% .08 235 / .4)` |
| Type scale | `--lm-t-9/10/11/12/14/18/24/30` px · `--lm-label 500 10px/1` (uppercase, tracking) · `--lm-num 500 12px/1.4` · `--lm-kpi 500 24px/1` |
| Spacing | `--lm-s1 4 · s1-5 6 · s2 8 · s3 12 · s4 16 · s6 24 · s8 32` · `--lm-toolbar-h 44` · `--lm-ticker-h 40` (CSS actually uses 44) · `--lm-row-h 22` |
| Radii | `--lm-r-xs 2 · r-sm 4 · r-md 6` |
| Elevation | `--lm-e0..e3` = bg / panel / raised / raised (+hairline); **no box-shadows** except the LIVE dot glow |
| Motion | `--lm-dur-fast 150ms` · `-base 200ms` · `--lm-pulse 800ms` · `--lm-particle 800ms` · `--lm-caption 4000ms` · `--lm-ease cubic-bezier(0,0,.2,1)` · `--lm-ease-expo cubic-bezier(.19,1,.22,1)` |
| Stage overrides | `--lm-fg2 #d5d3ce` · `--lm-fg3 #9a9994` · `--lm-border #3b3b3e` · `--lm-map-mesh … / .6` |
| Legacy aliases | `--bg --panel --border --border-subtle --text --text2 --text3 --accent --green --red --idle --font --toolbar-h --radius` → Drop in the port |

Mapping to the new palette: the new bg `rgb(11,11,13)` / off-white `rgb(242,242,239)` (already `--lm-fg`) / orange `rgb(255,90,44)` line up with `--lm-bg`, `--lm-fg`, `--lm-accent`. Keep the **rule** behind the tokens: accent = live mesh only, red = attackers/failures only, green = delivered/healed/online only.

---

## Pain points worth fixing in the rewrite

1. **Imperative DOM everywhere.** Nine `luminar:*` CustomEvents, `getElementById` in every module, `els` maps, manual `classList` syncing (`syncNodePreset`, `syncDurationPreset`, `syncReelChrome`, `updateFilterTags`). The store is a mutable singleton nothing subscribes to. Port to a real store (zustand/valtio) with derived selectors; the renderer becomes a subscriber.
2. **Toasts lie.** `post()` swallows failures and every fault handler toasts success. Return `{ok, error}` and toast accordingly; queue toasts instead of replacing one element.
3. **Live seek is a trap.** `POST /api/sim/seek` relabels the clock; phases skipped over fire one per 200ms once playing. Disable the scrubber live (or make it "jump clock" with a warning) and keep it for reels.
4. **Stage theme = CSS `zoom: 1.3`.** Works, but breaks measured layouts (tooltip clamp, fitView padding) and cannot be animated. Replace with scale tokens.
5. **Fixed-width desktop-only shell.** 256 + 300px side rails, `min-width: 360px` timeline, no breakpoints. Side rails should collapse to drawers; hero should be a layout, not a pile of `display:none !important`.
6. **Dead and duplicated code.** `#ring-canvas`/`overlay.ts`, `#clear-filter-btn`, `.lm-injected/.lm-failed`, `.lm-tl-tick/.lm-tl-lbl`, legacy `P`/`chrome` palette exports, `--bg/--panel…` aliases, unused API wrappers, `culori.d.ts` shim vs. inline `declare module`, milestones computed on a 2s timer but never drawn.
7. **Milestones are noise.** `N messages` / `N nodes decoded` rows change every tick and sit beside real beats. Keep beats (first prune, healed, phases) and draw them on the scrubber; drop the counters.
8. **Inspector hides the eclipse.** Chips show topology adjacency; the mesh (`store.mesh[peer]`) is what changes under attack. Show both, labelled.
9. **Mesh overlay vanishes above 100 nodes** with no explanation (backend sends `{}`); say so in the legend or request a sampled mesh.
10. **Reels are 17 MB of uncompressed JSONL in `public/`.** Gzip/brotli at build, stream-parse, show a load progress; seek should replay a short tail of events so landing mid-reel has motion.
11. **Selection/hover state is index-based** (`selectedNode: number`) and re-resolved by id on every snapshot. Store the peer id.
12. **Partition splits by array index**, not by the clusters the audience sees. Split by layout side or cluster membership.
13. **Admin token** can only be set by hand in devtools. One settings field.
14. **`gap` frames are counted and never shown.** A small "dropped N events" indicator near the log meta.
15. **Reset's `(R)` hint is unbound**; the keyboard map has no discoverable overlay. Bind `r`, add a `?` cheat-sheet.
16. **Accessibility gaps.** Dropdowns are divs toggled by `display`, no `role=menu`/arrow keys; the scrubber bubble and ticker are not announced; `--lm-fg3` at 3.9:1 is used for row timestamps. Keep `aria-live` on the caption.
17. **Honesty copy is scattered** across `index.html` titles, `applyMainnetStatus` strings, the manifest blurb and ui.md. Centralise the three guard-rail sentences ("same mechanism, toy constants"; "reproducible recordings"; "arrival at observer nodes, ~2.5 min behind") in one copy module and reuse them.

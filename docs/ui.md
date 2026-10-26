# Luminar UI reference

Verified against web/ at 52790f4 on 2026-10-25. Trust code over this file.

The reference for whoever presents Luminar and whoever touches `web/`. This file says what each screen does and which file does it. Every path in backticks exists at the commit above. The old screenshots under `assets/` show the retired Vite UI, so they are not shown here.

## 1. Routes and URL parameters

| Route | Content | Params |
|---|---|---|
| `/` | landing | `?reel=<n>` → client redirect to `/reels/<n>/` carrying `theme`,`hero`,`t`,`peer` (old talk notes keep working) |
| `/sim/` | live simulator | `theme=stage`, `hero=1`, `peer=<id>`; `?reel=` redirects as above |
| `/reels/<name>/` | reel player (SimApp in reel mode, socket never opened) | `theme`, `hero`, `t` (sim seconds), `peer` |
| `/figure/` | the relay globe figure full-bleed | `?press=` passthrough to the iframe for screenshots |

Prefs `{stageTheme, hero}` persist in `localStorage['luminar.prefs']` (`web/lib/prefs.ts`); the URL wins on load. Share (`s`) copies `/reels/<n>/?t=…&peer=…`. Pages: `web/app/page.tsx`, `web/app/sim/page.tsx`, `web/app/figure/page.tsx`, `web/app/reels/[name]/page.tsx`; the `?reel=` redirect is `web/components/sim/ReelRedirect.tsx` over `redirectTarget` in `web/lib/reels.ts`.

## 2. Screen map

`/sim/` and `/reels/<name>/` render the same shell, `web/components/sim/SimApp.tsx`.

**Desktop ≥ 1024 px**: toolbar 44 · left rail 264 · canvas · right rail 312 · command strip floating over the bottom of the canvas. Rails are typographic: hairline sections, no boxes.

**Tablet / phone ≤ 1023 px**: the rails become drawers opened by the `Stats` and `Log` buttons on the strip; the inspector is a bottom sheet; the toolbar collapses to brand + pill + `Menu +`, whose overlay (`web/components/sim/Overlay.tsx`, rows in `web/components/sim/Menus.tsx`) holds Scenarios, Reels, Faults and Presets as staggered serif rows; the strip wraps to two rows and the canvas goes full-bleed. Nothing below 390 px overflows.

## 3. Toolbar

`web/components/sim/Toolbar.tsx`, 44 px.

- Brand and `gossipsub v1.1`.
- Connection pill: `OFFLINE` (flame-dim text, no fill) · `LIVE` (signal dot) · `REEL · <title>` (paper square).
- `MAINNET` badge: click → `POST /api/live/mainnet`; refused with a toast in a reel.
- `TELEMETRY` badge: hidden until telemetry is active, shows `peer_count` (§10).
- Duration presets `1m 2m 5m 10m` and node presets `20 50 100 200` (capped at 200 for the talk build; the backend still accepts 500). The active one follows `maxDuration` / `node_count`. Refused in a reel; a node preset leaves Geo.
- Clock `T+ 12.3s`, `m:ss` past a minute; GitHub link.
- In a reel the shell carries `data-reel` and presets and pickers dim to .5.

## 4. Command strip

`web/components/sim/CommandStrip.tsx`, 52 px, floating, 76 % wide (360–820 px), `bottom: 36px` (60 px in hero, above the ticker). Left to right: Reset `⟲` (`r`), Play/Pause (`Space`), scrubber (`web/components/sim/Scrubber.tsx`), `cur / total`, speed `.5× 1× 2× 3× 5× 10×`, menus `Scenarios ▾ · Reels ▾ · Inject fault ▾`. Below it, the hint row `SPACE play · F fit · T stage · H hero · ? keys`.

- **The scrubber is for recordings.** Live, the track is `aria-disabled` with the tooltip *scrubbing rewinds recordings only; the live clock cannot rewind*, and `POST /api/sim/seek` is never called. In a reel, dragging seeks (`seekReelToSimTime`), a bubble shows the time, the track is keyboard-focusable, beats and phases are ticks on the track, and each injected fault is a wash band with a tooltip (`web/lib/timeline-marks.ts`).
- At the duration limit the sim pauses; Play there extends `maxDuration` by one step.
- Menus (`web/components/sim/Menus.tsx`, keys in `web/lib/menu-keys.ts`) use the native `popover` attribute and `role="menu"`: arrow keys, `Enter`, `Escape`, outside click, one open at a time.
  - **Scenarios**: from `GET /api/scenarios`; name, `${duration}s`, description, active row; a disabled `backend offline` row when the list is empty.
  - **Reels**: from the manifest; `<kbd>N</kbd>`, title, blurb inline, `REAL` tag on the real reel, divider, `0 Back to live`. A row navigates to `/reels/<name>/`.
  - **Inject fault** (rows in `web/lib/fault-items.ts`):

    | Item | Aside | Disabled when |
    |---|---|---|
    | Partition | `split by layout side` (visible sim peers with `x <` median vs the rest) | never |
    | Sybil attack | `N peers`, stepper 1–10, default 5, topic `lumina/blocks/1.0` | never |
    | Eclipse attack | selected peer, 4 attackers | nothing selected: *select a peer first* |
    | Drop peer | selected peer | nothing selected: *select a peer first* |
    | Clear all faults | `N active` | 0 active |

- Every fault click runs `reelGuard` → `leaveGeoForSim` → `post()` (`web/lib/actions.ts`), and the toast reflects `{ok}`: `<label> injected`, `<label> failed · <status>`, or `backend offline` (`toastFor` in `web/lib/api/client.ts`). Toasts (`web/components/sim/Toasts.tsx`) queue top-left under the toolbar, 2 s each. In a reel the toast is `Press 0 to leave the reel first`.

## 5. Canvas

`web/components/map/DeckCanvas.tsx` (deck.gl `OrthographicView`), frames built by `web/components/map/renderer.ts`, glyphs from the procedural atlas `web/components/map/atlas.ts`, colours from `web/components/map/palette.ts`, layouts in `web/components/map/layout.ts`. Drag pans, wheel zooms; cursor `crosshair` on the field, `pointer` over nodes; a tap on empty canvas deselects. Sizes are CSS px at `scale.node` 1, ×1.4 under stage.

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

Overlays on the canvas:

- Mode switcher `FORCE | RADIAL | GEO`, top-centre (`web/components/sim/ModeSwitcher.tsx`). Geo is disabled with *Geo needs real observers · turn MAINNET on* until real nodes exist, switches on by itself once per feed-on, and draws only real/telemetry nodes; Force and Radial draw only sim peers. A sim action taken in Geo switches back with the toast *Geo shows real observers only — switched to force* (or radial).
- Legend, top-right, collapsible (`web/components/sim/Legend.tsx`): the render table's twins and the mesh rule `gossip mesh · hidden above 100 peers (backend sends none)`. The gear opens settings: Gossip transfers, Node labels, Edge lines, All labels (≤ 50 nodes), Stage theme (`T`), Hero layout (`H`), and the Admin token field (`localStorage['luminar.token']`, sent as `X-Luminar-Token` on every POST).
- Provenance card, top-left while `mainnet.enabled` (`web/components/sim/Provenance.tsx`), §10.
- Narrator caption, bottom-left above the strip (`web/components/sim/Narrator.tsx`):
  `aria-live="polite"`, kicker `T+N.Ns · PHASE` or `· NARRATOR`, sentence in Instrument Serif italic, 2 px drain bar over 4 s.
- Tooltip card at the cursor (`web/components/sim/Tooltip.tsx`), hidden in hero.
- Shortcut overlay on `?` (`web/components/sim/KeyHelp.tsx`).

## 6. Rails

**Left rail** (`web/components/sim/StatsRail.tsx`, sparklines `web/components/sim/Sparkline.tsx`):

- KPI 2×2: Delivery `%` (prefers `recent_delivery_ratio`), Propagation `ms`, Avg hops, Mesh degree with `min–max`; each with a dithered sparkline of the last 60 `analytics` frames; `—` before the first message.
- NODES: `node_count +attackers`, a state strip with one cell per node (canvas-drawn above 100 nodes), two columns of counts: idle, origin, receiving, decoded, joining, failed, error, attacker, pruned.
- MESSAGES: Sent, Received, Invalid (the `spam-*` count), Total events.
- DELIVERY CDF: dithered area, dashed p50, `p50 Nms`.
- BEATS: narrator beats and phases only; click seeks in a reel, highlights live.
- EVENT CATEGORIES: six dithered bars with counts (the fault bar is flame).
- INFRASTRUCTURE: Streams `open/max` bar, DHT `active/available` segments.

**Right rail**: the event log, with the peer inspector sliding over it.

- EVENT LOG (`web/components/sim/LogRail.tsx`, filters `web/lib/log-filter.ts`, codes `web/lib/event-codes.ts`): header count + `following` / `paused` (auto-scroll locks 30 px from the bottom), `N dropped (gap)` when the backend dropped events, chips All, None, Gossip, Conn, Stream, DHT, Fault, Health, Clock (off by default), Sim, Live; Alt/Meta-click isolates a chip. 22 px rows: `at`, node, two-letter code coloured by consequence, detail; 500 rows max. A row click selects the referenced visible node, sets `highlightPeers` and opens the inspector.
- PEER INSPECTOR (`web/components/sim/Inspector.tsx`, peer lists `web/lib/inspector-peers.ts`):
  header (state glyph, short name in serif italic, badges `state` / `attacker` / `eclipse target`, full id, `ESC`); Sent · Recv · Score (flame when `< 0`) · Mesh `n/6`; score history sparkline (last 50 ticks, dashed zero, flame when the latest is `< 0`); then two labelled chip rows:
  - **MESH PEERS** from `store.mesh[peer]`, attackers in flame. Above 100 nodes the row reads the mesh rule instead. A pruned attacker shows the honest peers that pruned it, struck, and *pruned from every honest mesh*.
  - **TOPOLOGY PEERS** from `connected_peers`: the static libp2p adjacency, which an eclipse does not change. Read the eclipse in MESH PEERS.
  - **WHY**, attackers only: *silent attackers send nothing invalid, so P4 never fires; only the P3 deficit, floored at −0.25*.
  - Live events touching the peer, 200 max.

## 7. Keyboard

`web/lib/keys.ts` (`KEY_BINDINGS`). Ignored with Ctrl/Meta/Alt and while typing in a textarea, select, contenteditable or non-range input. The `?` overlay lists every row.

| Key | Action | Label |
|---|---|---|
| `Space` | `togglePlay` | play / pause |
| `f` | `fitView` | fit view |
| `Escape` | `escape` | deselect / close |
| `1`–`9` | `reel` | open recording N (navigates to `/reels/<name>/`; no-op past the fourth) |
| `0` | `backToLive` | back to live (navigates to `/sim/`, keeping `theme` and `hero`) |
| `s` | `share` | copy link to this moment (toast `Link copied`) |
| `t` | `toggleStage` | stage theme |
| `h` | `toggleHero` | hero layout |
| `r` | `reset` | reset |
| `?` | `toggleKeyHelp` | this list |

Menus: arrow keys, `Enter`, `Escape`. Hint row under the strip:
`SPACE play · F fit · T stage · H hero · ? keys`.

## 8. Stage and hero

**Stage** (`t`, `?theme=stage`, Legend › gear): `<html data-stage="1">` scales by tokens, never CSS `zoom`. Type, row height and cell sizes grow, `fg-3` becomes `paper-1`, hairlines get stronger and links brighter (the `:root[data-stage="1"]` block of `docs/design/tokens.css`, copied verbatim into `web/app/globals.css`). The renderer uses `scale {node 1.4, particle 1.8, edgeAlpha 1.6}` and 12 px labels.

**Hero** (`h`, `?hero=1`): `data-hero="1"` hides both rails, the legend, the tooltip and the hint row; the canvas spans the width and the strip sits 60 px up, above a 56 px lower-third ticker (`web/components/sim/Ticker.tsx`, cells from `web/lib/ticker.ts`). Ticker cells:
`phase · delivery · mesh d · hops · e2e · attackers (N · P pruned, flame) · invalid (flame) · T+` at `--t-hero-n`. Before the first message they read `free play · — · — · — · — · 0 · 0 · 0.0s`. In Geo with mainnet on, cells 2–5 become `slot · first seen (ms · client) · p50 · observers`. The narrator caption grows to 24 px.

Accessibility: the ticker is `aria-live="off"` (numbers changing at 2 Hz must not be announced); the caption keeps `aria-live="polite"`. Both toggles persist in `localStorage['luminar.prefs']` and mirror to the URL.

## 9. Reels

Luminar's reels are reproducible recordings: JSONL files of the exact WebSocket frames, one page each under `/reels/<name>/`. Manifest: `web/public/reels/manifest.json`, read at build time by `web/lib/reels.ts`.

| Key | Name | Title | Nodes | Blurb |
|---|---|---|---|---|
| `1` | `sybil-eclipse` | Sybil → Eclipse | 50 | T+10s five Sybils graft in and flood; P4 scoring prunes them in two heartbeats. T+16s peer-10 is eclipsed by silent attackers scoring cannot see. T+24s faults clear. |
| `2` | `partition-heal` | Partition → Heal | 50 | T+15s the mesh is split in two; delivery halves. T+35s the partition clears and the mesh heals. |
| `3` | `healthy-publish` | Healthy mesh | 50 | Scale-free topology, no faults. Watch flood publish, mesh relays and IHAVE/IWANT pulls. |
| `4` | `mainnet-block-wave` | Mainnet block wave (real) | 138 | Real mainnet block arrivals, slots 15466393–15466400: ~150 observer nodes light up in the order they saw each block. Arrival at observer nodes, not mesh paths. Data: ethPandaOps (CC BY 4.0). |

**Load** (`enterReel` in `web/lib/actions.ts`, parser and scheduler in `web/lib/api/replay.ts`):
no socket opens; mainnet state clears; the file streams in under a dithered progress bar (`web/components/sim/ReelProgress.tsx`, label `REEL · <title> · 2.1 / 3.5 MB · 60%`); the first snapshot draws before the file finishes; the reel seeks to its first snapshot, paused; the pill reads `REEL · <title>`; then `?t=` and `?peer=` apply, `t` first, so `?t=12.4&peer=sybil-0` selects a node that only exists after the seek.

**Seek** replays the last `edges, scenario, telemetry_status, snapshot, metrics, analytics` frames before `t`; events are skipped, so particles and captions do not replay. Speed goes down to 0.1×; playback auto-pauses at the end and `Space` there restarts from 0.

**Guards**: recorded `SimulationStateChanged` events and snapshot `state` / `speed` are ignored; preset and layout-picker buttons are disabled; scenario, fault and `MAINNET` clicks are refused with the toast `Press 0 to leave the reel first`. `0` or *Back to live* navigates to `/sim/`.

**Offline test** (no backend at all):

```bash
cd web && npm run build && python3 -m http.server -d out 9000
# open http://localhost:9000/reels/sybil-eclipse/?theme=stage&hero=1
```

The reel loads under the progress bar, plays, pauses at the end; while in the reel Network shows one `.jsonl`, no `/ws/events`, no `/api/*`. `1`–`4` switch reels. `0` opens `/sim/?theme=stage&hero=1` reading `OFFLINE` with an empty canvas and no uncaught exception; the console then shows only the browser's failed `ws://localhost:9000/ws/events` connection and `/api/*` 404 lines.

## 10. Telemetry and live mainnet

**Telemetry: badge only.** The `TELEMETRY` badge shows `peer_count` while telemetry is active (its tooltip: *peers reporting · drawer after Devcon*), and telemetry nodes draw as breathing observer rings. The drawer of peer rows, CPU bars and check-ins is deferred until after Devcon.

**Live mainnet** (`MAINNET` badge → `POST /api/live/mainnet`): the backend polls ethPandaOps' arrival API once per slot and replays each slot's observer arrivals as `BlockSeen` events. What the map shows is arrival at observer nodes, ~2.5 min behind, never the route a block took through the mesh. Observers are real nodes placed by geo `x, y`, drawn only in Geo. The provenance card reads, with the last sentence verbatim:

`LIVE MAINNET` · `slot <n> · T−<lag>s · <n> observers · arrival at observer nodes, not mesh paths · data: ethPandaOps (CC BY 4.0)`

with ` · shown on the Geo layout` appended outside Geo. In the real reel the kicker is `RECORDED MAINNET` and the lag reads `recorded`.

## 11. Demo script: Sybil → Eclipse

Talk copy guard rails: "same mechanism, toy constants"; a reel is a "reproducible recording, not an identical run"; mainnet is "arrival at observer nodes, ~2.5 min behind".

### 11.1 From the reel (offline, safest on stage)

1. Open `/reels/sybil-eclipse/?theme=stage&hero=1` (the old `/?reel=sybil-eclipse&theme=stage&hero=1` redirects there). The progress bar fills, the pill reads `REEL · Sybil → Eclipse`, the graph sits at the first snapshot, paused.
2. Press `f` to fit, then `Space`. Point out the idle discs, the solid mesh links over dotted topology links, paper particles on the first publish, the ticker's delivery climbing.
3. T+10: caption `T+10.0s · PHASE` / "Sybil attack: 5 attackers graft in". Five flame `sybil-N` diamonds appear beside their victims with dashed attack links and permanent labels; flame spam particles flood out; ticker `attackers 5 · 0 pruned`, `invalid` counts up in flame; a wash band starts on the scrubber.
4. Within two heartbeats: flame PRUNE particles, caption `NARRATOR` / "First Sybil pruned by score"; the diamonds turn hollow and dashed and park on a weak tether; ticker `attackers 5 · 5 pruned`. Say: "P4 scoring, same mechanism, toy constants." Honest halos stay in their positive bands; the flame band shows on pruned and attacker peers, not on the honest ones.
5. T+16: caption "Eclipse on peer-10". Four `eclipse-N` diamonds attach only to peer-10; its honest neighbours drop it from their meshes and peer-10 is left with no mesh links. Select peer-10: MESH PEERS shows the attackers in flame while TOPOLOGY PEERS still lists its libp2p neighbours. Select an `eclipse-N` node for the WHY line. Say: "they stay; silent attackers never trip the score."
6. T+24: caption "Faults cleared — mesh healing"; signal GRAFT particles; delivery climbs back.
7. Drag the scrubber to replay a phase (state only; particles and captions do not replay on seek). To jump straight to a moment, open `/reels/sybil-eclipse/?t=12.4&peer=sybil-0`; `s` copies the current moment as such a link. Press `0` for `/sim/` when a backend is reachable.

### 11.2 Live

1. Open `/sim/` with the backend up; pill `LIVE`. Click node preset `50`, let the layout settle, press `f`.
2. `Scenarios ▾` → *Demo: Sybil → Eclipse* (60s). It plays at the current speed; phases fire at T+10 / T+16 / T+24 as in 11.1. Keep speed at `1×` or `2×`.
3. Press `t` and `h` if not already set (they persist).
4. By hand instead: `Inject fault ▾ → Sybil attack` (stepper, default 5); select the peer to eclipse, then `Eclipse attack` (disabled until a peer is selected); `Clear all faults` to recover. The toast says whether the backend accepted the call.
5. Do not scrub live: the track is disabled because the live clock cannot rewind. Use `r` (reset) and relaunch the scenario.
6. Above 100 nodes the mesh links and MESH PEERS are absent; the legend says so.

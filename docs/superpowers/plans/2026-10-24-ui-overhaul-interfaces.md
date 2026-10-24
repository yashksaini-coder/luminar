# UI Overhaul — Shared Interface Contract Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pin every name, path, signature and type that the phase plans (0–7) of the UI overhaul share, and land the pure parts of that contract (`lib/`, `layout.ts`, `palette.ts`, `dither.ts`, `scripts/reel-stats.mjs`) as compiled, vitest-tested modules in `web/`.

**Architecture:** Part A is the contract: each item is tagged `from spec §x` (copied from the design doc) or `plan decision` (chosen here; later plans may add to it but never rename it). Part B lands the contract as code in bite-sized tasks: types and copy first, then the data layer (client, dispatch, websocket, replay), the store, the pure map modules, the dither core, and the reel-stats script. Renderer, components, Remotion and the colorfigure are pinned in Part A only; their code belongs to the phase 2/5/6 plans and is accepted by browser walks there.

**Tech Stack:** Next 16.4.3 static export, React 19.3.1, TypeScript 5.9.3, zustand 5.0.16, deck.gl 9.4.0 / luma.gl 9.4.2, d3-force 3.0.0, culori 4.0.2, remotion 4.0.538, vitest (jsdom) for unit tests.

**Spec:** `/home/yks/Projects/luminar/docs/superpowers/specs/2026-10-24-ui-overhaul-design.md` (approved 24 Oct). Supporting: `docs/design/ui-inventory.md` (parity checklist), `docs/design/nextjs-architecture.md`, `docs/design/tokens.css`, `docs/design/backboard-teardown.md` (§6, §9 dither recipe), `docs/design/figure-concept.md`, `docs/design/launch-video-storyboard.md`. Source being ported: `frontend/src/`. Backend payloads: `backend/main.py:209-335` (WS loop), `backend/simulation/engine.py:143`, `backend/metrics/collector.py:20`, `backend/gossip/engine.py:605`, `backend/scenarios/runner.py:50`, `backend/live/mainnet.py:165`, `backend/telemetry/manager.py:174`, `backend/events/types.py`.

## Global Constraints

- Backend untouched; same WS contract (`/ws/events`, orjson binary typed frames + text events at 20 Hz) and same REST contract (spec §3, inventory §4.1).
- Next `output: 'export'`, `trailingSlash: true`, `images.unoptimized: true`; no server, no middleware, no rewrites in the output (spec §4.2).
- `VITE_API_URL` → `NEXT_PUBLIC_API_URL`, build-time, unset in the container; dev WS falls back to `NEXT_PUBLIC_WS_URL ?? 'ws://localhost:8000'` when `location.port === '3000'` (spec §4.2).
- Exact pins, lockfile committed: `next` 16.4.3, `react`/`react-dom` 19.3.1, `typescript` 5.9.3, `zustand` 5.0.16, `@deck.gl/core|layers|extensions` 9.4.0, `@luma.gl/core|webgl` 9.4.2, `d3-force` 3.0.0, `culori` 4.0.2, `remotion` + `@remotion/player` + `@remotion/cli` 4.0.538, `eslint-config-next` 16.4.3; builder re-runs `npm view <pkg> version` before pinning (spec §4.7). Absent on purpose: `@deck.gl/react`, Tailwind, immer, any UI kit, icon set (spec §4.7).
- Plain CSS: `app/globals.css` = `docs/design/tokens.css` verbatim + base rules; CSS Modules per component; no CSS-in-JS (spec §4.3).
- Fonts self-hosted via `next/font/local` from `public/fonts/*.woff2` (Instrument Serif 400 roman+italic, IBM Plex Mono 400/500/600, Manrope variable); no Google Fonts, Fontshare or CDN at build or run time (spec §4.6, §2 anti-goals).
- Honesty copy, verbatim and only from `lib/copy.ts`: "same mechanism, toy constants"; "reproducible recordings" never "identical runs"; "arrival at observer nodes, ~2.5 min behind"; provenance `arrival at observer nodes, not mesh paths · data: ethPandaOps (CC BY 4.0)` (spec §2, §4.10).
- `--flame` is attacker/fault/alarm only; never brand, hover, link, CTA; never on `--signal` (spec §5, §10).
- No dither on text, numerals, attackers, pruned diamonds, particles, pulses, reticle, focus rings, scrubber head, state-strip cells, charts < 12 px, stamps, menus, toasts (spec §7).
- Node presets `20 50 100 200` (spec §13.5). Video silent, both cuts (spec §13.3). Telemetry: badge only, drawer deferred (spec §13.2). Colorfigure buttons 4–5 deferred (spec §13.4).
- Commit style `type(scope): message`, scopes `web`, `video`, `deploy` (spec §12).
- Every task ends with `cd web && npx tsc --noEmit && npm run lint && npx vitest run` green; `make check` stays green for `frontend/` and `backend/` (spec §11).

## Review Focus

1. **Snapshot before edges on reconnect** (`applySnapshot` with `edges: []`): layout must cold-start every node on the rim with finite coordinates, never NaN, and relayout once when the edges frame lands — test in Task 9.
2. **Reel JSONL line split across two stream chunks**: the streaming parser must carry the partial line to the next chunk and never drop or double-parse it — test in Task 7.
3. **`post()` with a wrong admin token (403) or a dead backend**: `{ok:false,status:403}` → toast `failed · 403`; network error → `{ok:false,status:0}` → `backend offline`; neither throws — test in Task 4.
4. **`disconnect()` during a pending reconnect, and `connect()` twice**: no reconnect fires after disconnect; a second connect while a socket is `CONNECTING`/`OPEN` is a no-op — test in Task 6.
5. **Keys with modifiers and the `?` key**: `Shift+/` (`e.key === '?'`) must fire `toggleKeyHelp`; any key with Ctrl/Meta/Alt is ignored; a focused range input does not swallow keys but a text input does — test in Task 3.

---

# Part A — The contract

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

Rules **[spec §4.4]**: never `useStore()` without a selector; node arrays only via `useShallow` in panels that list them; per-frame data no DOM reads (`nodePositions`, particles, atlas) lives in `renderer.ts`; the WS batch handler calls `setState` once per batch; 20 Hz frames write only the fields that changed (Task 8's test asserts referential stability of every untouched field).

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

---

# Part B — Tasks

Prerequisite: the phase-0 scaffold exists (`web/package.json`, `tsconfig.json` with the `@/*` alias, `app/globals.css`). Each task below is pure TypeScript under `web/` and is accepted by vitest (jsdom) unless noted. Run tests with `cd /home/yks/Projects/luminar/web && npx vitest run <file>`.

### Task 1: Test harness, types and format

**Files:**
- Create: `web/vitest.config.ts`, `web/lib/types.ts`, `web/lib/format.ts`
- Modify: `web/package.json` (devDeps `vitest`, `jsdom`; scripts `test`, `test:watch`), `Makefile` (`web-test`, `web-check` gains `npx vitest run`)
- Test: `web/lib/types.test.ts`, `web/lib/format.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: everything in A.2 and A.3.

- [ ] **Step 1: Write the failing tests**

```ts
// web/lib/types.test.ts
import { isTypedFrame } from '@/lib/types'
test('events have no type field; typed frames do', () => {
  expect(isTypedFrame({ at: 1, event_type: 'ClockTick', category: 'clock' })).toBe(false)
  expect(isTypedFrame({ type: 'gap', dropped: 3 })).toBe(true)
})
// web/lib/format.test.ts
test('formatTime rounds before splitting', () => { expect(formatTime(119.96)).toBe('2:00'); expect(formatTime(12.34)).toBe('12.3s'); expect(formatTime(-1)).toBe('0.0s') })
test('shortName / shortId / isAttackerId / isPruned', () => {
  expect(shortName({ peer_id: 'peer-12', index: 12 })).toBe('n12')
  expect(shortName({ peer_id: 'sybil-0', index: 50 })).toBe('sybil-0')
  expect(shortId('peer-7')).toBe('n7'); expect(isAttackerId('eclipse-3')).toBe(true)
  expect(isPruned({ state: 'attacker', connected_peers: [] })).toBe(true)
  expect(isPruned({ state: 'attacker', connected_peers: ['peer-1'] })).toBe(false)
})
test('fmtCount / fmtLatency / signed / cdfStats', () => {
  expect(fmtCount(1284)).toBe('1,284'); expect(fmtCount(61900)).toBe('61.9K'); expect(fmtLatency(1200)).toBe('1.2s'); expect(signed(-0.25)).toBe('-0.25')
  expect(cdfStats([{ percentile: 0, latency_ms: 10 }, { percentile: 50, latency_ms: 40 }, { percentile: 100, latency_ms: 90 }])).toEqual({ min: 10, max: 90, p50: 40 })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `cd web && npx vitest run lib/types.test.ts lib/format.test.ts`
Expected: FAIL (modules not found).

- [ ] **Step 3: Add vitest** — `npm view vitest version` / `npm view jsdom version`, pin exact in `devDependencies`, `"test": "vitest run"`, `vitest.config.ts` with `test: { environment: 'jsdom', include: ['**/*.test.ts'] }` and `resolve.alias['@'] = __dirname`. Makefile `web-test` and `web-check` per A.24.

- [ ] **Step 4: Implement `lib/types.ts` (A.2 verbatim, incl. `isTypedFrame`) and `lib/format.ts` (A.3 signatures)**

- [ ] **Step 5: Run to verify pass**

Run: `cd web && npx vitest run lib/types.test.ts lib/format.test.ts && npx tsc --noEmit`
Expected: PASS, tsc clean.

- [ ] **Step 6: Commit**

```bash
git add web/vitest.config.ts web/package.json web/package-lock.json web/lib/types.ts web/lib/format.ts web/lib/*.test.ts Makefile
git commit -m "feat(web): shared types, format helpers and vitest harness"
```

### Task 2: Copy module and the forbidden-phrase guard

**Files:**
- Create: `web/lib/copy.ts`
- Test: `web/lib/copy.test.ts`

**Interfaces:**
- Produces: A.4 names.

- [ ] **Step 1: Write the failing test**

```ts
import { readdirSync, readFileSync, statSync } from 'node:fs'; import { join } from 'node:path'
import { FORBIDDEN, PROVENANCE, MECHANISM, RECORDING_NOT_RUN, ARRIVAL } from '@/lib/copy'
test('honesty sentences are verbatim', () => {
  expect(MECHANISM).toBe('Same mechanism, toy constants.')
  expect(PROVENANCE).toBe('arrival at observer nodes, not mesh paths · data: ethPandaOps (CC BY 4.0)')
  expect(ARRIVAL).toBe('arrival at observer nodes, ~2.5 min behind')
  expect(RECORDING_NOT_RUN).toBe('reproducible recording, not an identical run')
})
test('forbidden phrases appear only in lib/copy.ts', () => {
  const hits: string[] = []
  const walk = (d: string) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) { if (!/node_modules|out|\.next/.test(f)) walk(p) } else if (/\.(tsx?|mjs|css|json)$/.test(f) && !p.endsWith('lib/copy.ts') && !p.endsWith('copy.test.ts')) { const s = readFileSync(p, 'utf8').toLowerCase(); for (const w of FORBIDDEN) if (s.includes(w.toLowerCase())) hits.push(`${p}: ${w}`) } } }
  for (const d of ['app', 'components', 'lib', 'remotion']) { try { walk(join(__dirname, '..', d)) } catch {} }
  expect(hits).toEqual([])
})
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run lib/copy.test.ts` → FAIL (module not found).
- [ ] **Step 3: Implement `lib/copy.ts` exactly as A.4.**
- [ ] **Step 4: Run to verify pass** — same command → PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(web): copy module with the honesty sentences and a forbidden-phrase test"`

### Task 3: Keyboard table and event codes

**Files:**
- Create: `web/lib/keys.ts`, `web/lib/event-codes.ts`
- Test: `web/lib/keys.test.ts`, `web/lib/event-codes.test.ts`

**Interfaces:**
- Consumes: `AppEvent`, `EventCategory` (Task 1).
- Produces: A.5, A.6.

- [ ] **Step 1: Write the failing tests**

```ts
// keys.test.ts
const ev = (key: string, extra: Partial<KeyboardEvent> = {}, tag = 'BODY', type = '') =>
  ({ key, ctrlKey: false, metaKey: false, altKey: false, target: Object.assign(document.createElement(tag === 'BODY' ? 'div' : tag), type ? { type } : {}), ...extra })
test('every spec shortcut maps to its action', () => {
  expect(actionForKey(ev(' '))).toEqual({ action: 'togglePlay' })
  expect(actionForKey(ev('f'))).toEqual({ action: 'fitView' })
  expect(actionForKey(ev('Escape'))).toEqual({ action: 'escape' })
  expect(actionForKey(ev('3'))).toEqual({ action: 'reel', arg: 2 })
  expect(actionForKey(ev('0'))).toEqual({ action: 'backToLive' })
  for (const [k, a] of [['s', 'share'], ['t', 'toggleStage'], ['h', 'toggleHero'], ['r', 'reset'], ['?', 'toggleKeyHelp']]) expect(actionForKey(ev(k))).toEqual({ action: a })
})
test('modifiers and typing targets are ignored; range input is not', () => {
  expect(actionForKey(ev('f', { ctrlKey: true }))).toBeNull(); expect(actionForKey(ev('h', { metaKey: true }))).toBeNull(); expect(actionForKey(ev('1', { altKey: true }))).toBeNull()
  expect(actionForKey(ev('f', {}, 'input', 'text'))).toBeNull(); expect(actionForKey(ev('f', {}, 'textarea'))).toBeNull(); expect(actionForKey(ev('f', {}, 'select'))).toBeNull()
  expect(actionForKey(ev(' ', {}, 'input', 'range'))).toEqual({ action: 'togglePlay' })
})
test('KEY_BINDINGS lists 18 rows and KBD_HINT is verbatim', () => { expect(KEY_BINDINGS).toHaveLength(18); expect(KBD_HINT).toBe('SPACE play · F fit · T stage · H hero · ? keys') })
// event-codes.test.ts
test('type codes', () => { expect(TYPE_CODES.GossipPrune).toEqual({ code: 'gp', tone: 'alarm' }); expect(Object.keys(TYPE_CODES)).toHaveLength(23); expect(DEFAULT_TYPE.code).toBe('??') })
test('details', () => {
  expect(buildDetail({ at: 0, event_type: 'GossipPrune', category: 'gossip', to_peer: 'sybil-3', reason: 'score' })).toBe('sybil-3 · score')
  expect(buildDetail({ at: 0, event_type: 'FaultInjected', category: 'fault', fault_type: 'sybil', count: 5 })).toBe('sybil × 5')
  expect(buildDetail({ at: 0, event_type: 'BlockSeen', category: 'live', seen_ms: 3247, client: 'lighthouse', first: true })).toBe('3247 ms · lighthouse · first')
  expect(formatNode({ at: 0, event_type: 'FaultCleared', category: 'fault' })).toBe('net')
  expect(formatNode({ at: 0, event_type: 'ScenarioPhaseFired', category: 'simulation' })).toBe('sim')
  expect(inspectorDetail({ at: 0, event_type: 'GossipMessage', category: 'gossip', msg_id: 'spam-1' })).toBe('spam')
})
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run lib/keys.test.ts lib/event-codes.test.ts` → FAIL.
- [ ] **Step 3: Implement `lib/keys.ts` (A.5) and `lib/event-codes.ts` (A.6; port `TYPE_CODES`, `buildDetail`, `formatNode` from `frontend/src/ui/events-panel.ts`, `inspectorDetail` from `peer-inspector.ts rowDetail`).**
- [ ] **Step 4: Run to verify pass** → PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(web): keyboard binding table and event type codes"`

### Task 4: REST client with `{ok, status, data}`

**Files:**
- Create: `web/lib/api/client.ts`
- Test: `web/lib/api/client.test.ts`

**Interfaces:**
- Consumes: types (Task 1), `Toast` kind.
- Produces: A.7.

- [ ] **Step 1: Write the failing tests** (mock `globalThis.fetch` with `vi.fn`)

```ts
test('post returns ok/status/data and sets headers', async () => {
  localStorage.setItem('luminar.token', 'secret')
  const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true, fault_id: 'f1' }), { status: 200 }))
  vi.stubGlobal('fetch', fetchMock)
  const r = await faultSybil(5)
  expect(r).toEqual({ ok: true, status: 200, data: { ok: true, fault_id: 'f1' } })
  const [url, init] = fetchMock.mock.calls[0]
  expect(url).toBe('/api/fault/sybil'); expect(init.headers['X-Luminar-Token']).toBe('secret'); expect(init.headers['Content-Type']).toBe('application/json')
  expect(JSON.parse(init.body)).toEqual({ n_attackers: 5, target_topic: 'lumina/blocks/1.0' })
})
test('post without body sends no Content-Type; without token sends no token header', async () => {
  localStorage.removeItem('luminar.token')
  const fetchMock = vi.fn(async () => new Response('{"state":"running"}', { status: 200 })); vi.stubGlobal('fetch', fetchMock)
  await simPlay(); const init = fetchMock.mock.calls[0][1]
  expect(init.headers['Content-Type']).toBeUndefined(); expect(init.headers['X-Luminar-Token']).toBeUndefined(); expect(init.body).toBeUndefined()
})
test('403 and network error never throw', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{"detail":"X-Luminar-Token required"}', { status: 403 })))
  expect(await faultClearAll()).toEqual({ ok: false, status: 403, data: { detail: 'X-Luminar-Token required' } })
  vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch') }))
  expect(await faultClearAll()).toEqual({ ok: false, status: 0, data: null })
})
test('toastFor', () => {
  expect(toastFor({ ok: true, status: 200, data: null }, 'Sybil ×5')).toEqual({ text: 'Sybil ×5 injected', kind: 'ok' })
  expect(toastFor({ ok: false, status: 403, data: null }, 'Sybil ×5')).toEqual({ text: 'Sybil ×5 failed · 403', kind: 'fail' })
  expect(toastFor({ ok: false, status: 0, data: null }, 'Sybil ×5')).toEqual({ text: 'backend offline', kind: 'fail' })
})
test('getStatic does not prepend API_BASE and get prepends it', async () => { /* set process.env.NEXT_PUBLIC_API_URL via vi.stubEnv before import; assert URLs */ })
```

- [ ] **Step 2: Run to verify failure** → FAIL.
- [ ] **Step 3: Implement `lib/api/client.ts` per A.7.** Non-JSON bodies → `data: null` (keep `status`).
- [ ] **Step 4: Run to verify pass** → PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(web): REST client returning {ok,status,data}"`

### Task 5: Frame dispatcher and the store (pure state)

**Files:**
- Create: `web/lib/store.ts`, `web/lib/api/dispatch.ts`
- Test: `web/lib/store.test.ts`, `web/lib/api/dispatch.test.ts`

**Interfaces:**
- Consumes: types, format, `reelPlaying` (Task 7; until then `dispatch.ts` imports a stub that returns false — replace in Task 7).
- Produces: A.8, A.11.

- [ ] **Step 1: Write the failing tests** (fixtures built from the reel samples in A.2; `beforeEach(() => useStore.setState(useStore.getInitialState()))`)

```ts
test('defaults', () => { const s = useStore.getState(); expect(s.maxDuration).toBe(300); expect(s.dhtCoordinator).toEqual({ active: 0, available: 8 }); expect(s.selectedPeer).toBeNull(); expect(s.scale).toEqual({ node: 1, particle: 1, edgeAlpha: 1 }) })
test('applyEvents touches only the fields that changed', () => {
  const before = useStore.getState()
  useStore.getState().applyEvents([{ at: 5.8, event_type: 'GossipMessage', category: 'gossip', from_peer: 'peer-22', to_peer: 'peer-3', msg_id: 'msg-1' }])
  const after = useStore.getState()
  const changed = Object.keys(after).filter(k => (after as any)[k] !== (before as any)[k] && typeof (after as any)[k] !== 'function')
  expect(changed.sort()).toEqual(['eventCount', 'events'])
})
test('ClockTick moves simTime; SimulationStateChanged ignored in reel mode', () => {
  useStore.getState().applyEvents([{ at: 3.2, event_type: 'ClockTick', category: 'clock' }]); expect(useStore.getState().simTime).toBe(3.2)
  useStore.setState({ reel: { name: 'x', title: 'x', durationMs: 1, durationSim: 1 } })
  useStore.getState().applyEvents([{ at: 4, event_type: 'SimulationStateChanged', category: 'simulation', state: 'running', speed: 2 }])
  expect(useStore.getState().playing).toBe(false); expect(useStore.getState().simSpeed).toBe(1)
})
test('applySnapshot rebuilds nodeById, drops a vanished selection, samples score history', () => {
  useStore.getState().selectPeer('peer-1')
  useStore.getState().applySnapshot(snapWith(['peer-0', 'peer-1'])); expect(useStore.getState().scoreHistory).toHaveLength(1)
  useStore.getState().applySnapshot(snapWith(['peer-0'])); expect(useStore.getState().selectedPeer).toBeNull(); expect(useStore.getState().nodeById.has('peer-1')).toBe(false)
})
test('events ring caps at MAX_EVENTS; gap counts dropped', () => { useStore.getState().applyEvents(Array.from({ length: 2500 }, (_, i) => ({ at: i, event_type: 'ClockTick', category: 'clock' as const }))); expect(useStore.getState().events).toHaveLength(2000); useStore.getState().applyGap({ type: 'gap', dropped: 7 }); expect(useStore.getState().droppedEvents).toBe(7) })
test('narrator beats: phase, first score prune to a sybil, healed', () => {
  useStore.getState().applyEvents([{ at: 10.2, event_type: 'ScenarioPhaseFired', category: 'simulation', label: 'Sybil attack: 5 attackers graft in' }])
  useStore.getState().applyEvents([{ at: 11.9, event_type: 'GossipPrune', category: 'gossip', from_peer: 'peer-42', to_peer: 'sybil-3', reason: 'score' }, { at: 12.0, event_type: 'GossipPrune', category: 'gossip', from_peer: 'peer-1', to_peer: 'sybil-0', reason: 'score' }])
  useStore.getState().applyEvents([{ at: 24.1, event_type: 'FaultCleared', category: 'fault', fault_type: 'sybil' }])
  useStore.setState({ simTime: 25.5 }); useStore.getState().applyAnalytics({ type: 'analytics', total_messages: 9, avg_delivery_ratio: 1, avg_propagation_ms: 190, avg_hops: 4, recent_delivery_ratio: 0.97, delivery_ratios: [], latency_cdf: [], mesh_stability: {} })
  expect(useStore.getState().beats.map(b => [b.kind, b.time])).toEqual([['phase', 10.2], ['prune', 11.9], ['fault', 24.1], ['healed', 25.5]])
  expect(useStore.getState().caption?.text).toBe('Mesh healed in 1.4s'); expect(useStore.getState().phaseLabel).toBe('Sybil attack: 5 attackers graft in')
})
test('applyScenario sets maxDuration and resets narrator; setLayoutMode guards geo; setPref flips scale; selectors', () => {
  useStore.getState().applyScenario({ type: 'scenario', active: true, scenario: { id: 'a', name: 'A', description: '', icon: '', topology_type: 'random', phases: [], duration: 90 } }); expect(useStore.getState().maxDuration).toBe(90)
  useStore.getState().setLayoutMode('geo'); expect(useStore.getState().layoutMode).toBe('force')
  useStore.getState().setPref('stageTheme'); expect(useStore.getState().scale).toEqual({ node: 1.4, particle: 1.8, edgeAlpha: 1.6 })
  expect(selectPill(useStore.getState())).toBe('offline'); expect(selectTimelineTotal(useStore.getState())).toBe(90)
})
// dispatch.test.ts
test('typed frames route to appliers; events batch until flush; subscribers see the batch once', () => {
  const seen: AppEvent[][] = []; const off = subscribeEvents(b => seen.push(b))
  dispatchFrame({ type: 'gap', dropped: 2 }); expect(useStore.getState().droppedEvents).toBe(2)
  dispatchFrame({ at: 1, event_type: 'ClockTick', category: 'clock' }); expect(pendingEventCount()).toBe(1); expect(useStore.getState().events).toHaveLength(0)
  flushEvents(); expect(useStore.getState().events).toHaveLength(1); expect(seen).toHaveLength(1); flushEvents(); expect(seen).toHaveLength(1); off()
})
```

- [ ] **Step 2: Run to verify failure** → FAIL.
- [ ] **Step 3: Implement `lib/store.ts` (A.11) and `lib/api/dispatch.ts` (A.8).** `applyEvents` builds a `patch` object and calls `set(patch)` once; it adds a key to `patch` only when its new value differs. Caption `seq` increments per `setCaption`.
- [ ] **Step 4: Run to verify pass** → PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(web): zustand store with frame appliers, narrator beats and selectors; frame dispatcher"`

### Task 6: WebSocket manager

**Files:**
- Create: `web/lib/api/websocket.ts`
- Test: `web/lib/api/websocket.test.ts`

**Interfaces:**
- Consumes: `dispatchFrame`, `flushEvents` (Task 5), `useStore.setConnected`, `API_BASE`.
- Produces: A.9.

- [ ] **Step 1: Write the failing tests** (a `FakeWebSocket` class on `globalThis` recording instances, with `readyState`, `close()`, and helpers `open()`, `message(data)`, `closeFromServer()`; `vi.useFakeTimers()`)

```ts
test('wsUrl', () => {
  expect(wsUrl({ protocol: 'http:', host: 'localhost:3000', port: '3000' })).toBe('ws://localhost:8000/ws/events')
  expect(wsUrl({ protocol: 'https:', host: 'luminar.onrender.com', port: '' })).toBe('wss://luminar.onrender.com/ws/events')
})
test('reconnect backs off 1s ×2 to 10s and resets on open', () => {
  ws.connect(); sockets[0].closeFromServer()
  for (const d of [1000, 2000, 4000, 8000, 10000, 10000]) { vi.advanceTimersByTime(d - 1); const n = sockets.length; vi.advanceTimersByTime(1); expect(sockets.length).toBe(n + 1); sockets.at(-1)!.closeFromServer() }
  vi.advanceTimersByTime(10000); sockets.at(-1)!.open(); sockets.at(-1)!.closeFromServer(); vi.advanceTimersByTime(1000); expect(sockets.length).toBe(9)
})
test('connect twice is a no-op; disconnect cancels a pending reconnect', () => {
  ws.connect(); ws.connect(); expect(sockets.length).toBe(1); sockets[0].closeFromServer(); ws.disconnect(); vi.advanceTimersByTime(60_000); expect(sockets.length).toBe(1)
  expect(useStore.getState().connected).toBe(false)
})
test('text frames batch for 50 ms; binary frames dispatch at once; superseded socket is ignored', async () => {
  ws.connect(); sockets[0].open(); expect(useStore.getState().connected).toBe(true)
  sockets[0].message(JSON.stringify({ at: 1, event_type: 'ClockTick', category: 'clock' })); expect(useStore.getState().events).toHaveLength(0)
  vi.advanceTimersByTime(50); expect(useStore.getState().events).toHaveLength(1)
  sockets[0].message(new TextEncoder().encode(JSON.stringify({ type: 'gap', dropped: 4 })).buffer); expect(useStore.getState().droppedEvents).toBe(4)
})
```

- [ ] **Step 2: Run to verify failure** → FAIL.
- [ ] **Step 3: Port `frontend/src/api/websocket.ts` to `lib/api/websocket.ts` per A.9** (replace `bind` callbacks with `dispatchFrame`/`flushEvents`/`useStore.getState().setConnected`).
- [ ] **Step 4: Run to verify pass** → PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(web): websocket manager ported with backoff and single-socket invariant"`

### Task 7: Reel player with streaming parse

**Files:**
- Create: `web/lib/api/replay.ts`
- Modify: `web/lib/api/dispatch.ts` (import the real `reelPlaying`)
- Test: `web/lib/api/replay.test.ts`

**Interfaces:**
- Consumes: `dispatchFrame`, `flushEvents`, store `setReel/setReelLoad/setPlaying/resetRun`.
- Produces: A.10.

- [ ] **Step 1: Write the failing tests** (`vi.useFakeTimers()`; `fetch` mocked to return a `Response` whose body is a `ReadableStream` that yields the fixture in chunks cut mid-line)

```ts
const lines = [
  { t: 0, frame: { type: 'edges', edges: [['peer-0', 'peer-1']] } },
  { t: 452, frame: { ...snapWith(['peer-0', 'peer-1']), time: 0, type: 'snapshot' } },
  { t: 1000, frame: { at: 0.5, event_type: 'ClockTick', category: 'clock' } },
  { t: 2000, frame: { ...snapWith(['peer-0', 'peer-1']), time: 1.5, type: 'snapshot' } },
  { t: 2100, frame: { at: 1.6, event_type: 'GossipMessage', category: 'gossip', from_peer: 'peer-0', to_peer: 'peer-1', msg_id: 'msg-1' } },
].map(l => JSON.stringify(l)).join('\n') + '\n'
test('parseReelChunk carries a partial line across chunks', () => {
  const a = parseReelChunk(lines.slice(0, 70), ''); const b = parseReelChunk(lines.slice(70), a.carry)
  expect(a.frames.length + b.frames.length).toBe(5); expect(b.carry).toBe('')
})
test('loadReel streams, primes on the first snapshot, seeks to it, reports progress', async () => {
  const ok = await loadReel({ name: 'r', title: 'R', file: '/reels/r.jsonl' })
  expect(ok).toBe(true); expect(useStore.getState().reel).toEqual({ name: 'r', title: 'R', durationMs: 2100, durationSim: 1.5 })
  expect(useStore.getState().nodes).toHaveLength(2); expect(useStore.getState().simTime).toBe(0); expect(useStore.getState().reelLoad).toBeNull()
})
test('play dispatches by wall clock × speed and auto-pauses at the end', async () => {
  await loadReel(meta); setReelSpeed(2); playReel(); expect(reelPlaying()).toBe(true)
  vi.advanceTimersByTime(1100); expect(useStore.getState().simTime).toBe(1.5); expect(reelPlaying()).toBe(false); expect(useStore.getState().playing).toBe(false)
})
test('seek replays state frames, skips events, clamps, optional tail', async () => {
  await loadReel(meta); seekReelToSimTime(1.0); expect(useStore.getState().simTime).toBe(1.5); expect(useStore.getState().events).toHaveLength(0)
  seekReel(99_999); expect(reelElapsedMs()).toBe(2100); seekReel(2100, { eventTailMs: 200 }); expect(useStore.getState().events.at(-1)?.msg_id).toBe('msg-1')
  expect(setReelSpeed(0.01)).toBeUndefined(); // then assert internal speed via a 50 ms step: elapsed grows by 5
})
```

- [ ] **Step 2: Run to verify failure** → FAIL.
- [ ] **Step 3: Port `frontend/src/api/replay.ts` to `lib/api/replay.ts` per A.10** with the streaming reader and `parseReelChunk`.
- [ ] **Step 4: Run to verify pass** → PASS; also `npx vitest run lib/api` (dispatch now imports the real `reelPlaying`).
- [ ] **Step 5: Commit** — `git commit -m "feat(web): reel player with streaming JSONL parse, seek tail and progress"`

### Task 8: Actions and prefs

**Files:**
- Create: `web/lib/actions.ts`, `web/lib/prefs.ts`
- Test: `web/lib/actions.test.ts`, `web/lib/prefs.test.ts`

**Interfaces:**
- Consumes: client (Task 4), store (Task 5), ws (Task 6), replay (Task 7), `visiblePositions`/`resetTopology` from `@/components/map/renderer` (mocked with `vi.mock` until Task 9/phase 2 exist).
- Produces: A.12, A.13.

- [ ] **Step 1: Write the failing tests** (`vi.mock('@/lib/api/client')`, `vi.mock('@/components/map/renderer', () => ({ visiblePositions: () => positions, resetTopology: vi.fn() }))`)

```ts
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
test('eclipse and drop need a selected sim peer', async () => { await injectFault('eclipse'); expect(client.faultEclipse).not.toHaveBeenCalled() })
test('togglePlay at the limit extends maxDuration by durationStep before POST play', async () => {
  useStore.setState({ simTime: 300, maxDuration: 300, durationStep: 120, playing: false }); client.simPlay.mockResolvedValue({ ok: true, status: 200, data: null })
  await togglePlay(); expect(useStore.getState().maxDuration).toBe(420); expect(client.simPlay).toHaveBeenCalled()
})
test('autoPauseIfDue pauses live at the limit, never in reels', () => { /* … */ })
test('syncUrlMoment writes ?peer always and ?t only while a reel is paused', () => { /* … */ })
// prefs.test.ts
test('URL wins over localStorage; persist mirrors URL and data attributes', () => {
  localStorage.setItem('luminar.prefs', JSON.stringify({ stageTheme: true, hero: true }))
  expect(loadPrefs(new URLSearchParams('theme=off'))).toEqual({ stageTheme: false, hero: true })
  persistPrefs({ stageTheme: true, hero: false }); expect(location.search).toContain('theme=stage'); expect(location.search).not.toContain('hero=')
  applyDomPrefs({ stageTheme: true, hero: true }); expect(document.documentElement.dataset.stage).toBe('1'); expect(document.documentElement.dataset.hero).toBe('1')
})
```

- [ ] **Step 2: Run to verify failure** → FAIL.
- [ ] **Step 3: Implement `lib/actions.ts` (A.12) and `lib/prefs.ts` (A.13).**
- [ ] **Step 4: Run to verify pass** → PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(web): store actions (faults, playback, reels, share) and prefs persistence"`

### Task 9: Layout module (frozen Force) and palette

**Files:**
- Create: `web/components/map/layout.ts`, `web/components/map/palette.ts`
- Test: `web/components/map/layout.test.ts`, `web/components/map/palette.test.ts`

**Interfaces:**
- Consumes: types.
- Produces: A.14, A.15.

- [ ] **Step 1: Write the failing tests**

```ts
const peers = (n: number) => Array.from({ length: n }, (_, i) => ({ peer_id: `peer-${i}`, index: i, state: 'idle' as const, connected_peers: [], x: 0, y: 0, messages_sent: 0, messages_received: 0, gossip_score: 1 }))
const ring = (n: number): Edge[] => Array.from({ length: n }, (_, i) => [`peer-${i}`, `peer-${(i + 1) % n}`])
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
  expect(computeLayout('geo', [real], []).positions[0]).toEqual([10, 25]); expect(isNodeVisible('geo', peers(1)[0])).toBe(false); expect(isNodeVisible('force', real)).toBe(false)
  const r = computeLayout('radial', peers(7), [['peer-3', 'peer-0'], ['peer-3', 'peer-1'], ['peer-3', 'peer-2']]); expect(r.positions[3]).toEqual([0, 0])
})
test('topologyKey ignores state changes and hidden nodes', () => { /* same key when only `state` differs; observers do not enter the force key */ })
// palette.test.ts
test('cssToRgba', () => { expect(cssToRgba('#ff5a2c')).toEqual([255, 90, 44, 255]); expect(cssToRgba('rgb(242 242 239 / 0.14)')).toEqual([242, 242, 239, 36]); expect(cssToRgba('oklch(68.3% 0.209 36)')[0]).toBeGreaterThan(240) })
test('scoreBand and densities', () => { expect([-0.1, 0, 1.9, 2, 5.9, 6, 12].map(scoreBand)).toEqual([0, 1, 1, 2, 2, 3, 3]); expect(BAND_DENSITY).toEqual([0.12, 0.35, 0.65, 1]) })
test('refreshPalette reads tokens and re-reads on data-stage', () => { document.documentElement.style.setProperty('--flame', '#ff5a2c'); /* … set all tokens, expect PAL.flame, flip data-stage, expect true */ })
```

- [ ] **Step 2: Run to verify failure** → FAIL.
- [ ] **Step 3: Port `frontend/src/map/layout.ts` → `components/map/layout.ts` (A.14, plus `attackerLayoutEdges`, `edgesKey`, `topologyKey`, `WORLD_BOUNDS`, `resetLayoutMemory`) and write `components/map/palette.ts` (A.15; token names from tokens.css, no `--lm-*`).**
- [ ] **Step 4: Run to verify pass** → PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(web): frozen force layout and token palette ported for the deck.gl renderer"`

### Task 10: Dither core

**Files:**
- Create: `web/components/dither/dither.ts`
- Test: `web/components/dither/dither.test.ts`

**Interfaces:**
- Produces: A.19 (pure part; `drawDither`/`drawLoupe` are browser-only and accepted by the phase-5 walk).

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
  const out = ditherImageData(grey(255, 8, 8), 4, { paper: PAPER, pitch: PITCH }); expect(out.data[0]).toBe(242); expect(out.data[(3 * 8 + 3) * 4]).toBe(242)
  const d = ditherImageData(grey(0, 8, 8), 1, { paper: PAPER, pitch: PITCH }, { density: 0.35 }); const n = Array.from({ length: 64 }, (_, i) => d.data[i * 4] === 242).filter(Boolean).length; expect(n).toBeGreaterThanOrEqual(21); expect(n).toBeLessThanOrEqual(23)
})
test('revealSteps and coverRect', () => { expect(revealSteps(3)).toEqual([28, 20, 14, 10, 7, 5, 4, 3]); expect(revealSteps(4)).toEqual([28, 20, 14, 10, 7, 5, 4]); expect(coverRect(200, 100, 100, 100, 0.5, 0.5)).toEqual([50, 0, 100, 100]) })
```

- [ ] **Step 2: Run to verify failure** → FAIL.
- [ ] **Step 3: Implement `components/dither/dither.ts` per A.19** (the 8×8 table from `backboard-teardown.md:286-288`; `drawDither` per teardown §9 with `OffscreenCanvas` fallback to a detached `<canvas>`).
- [ ] **Step 4: Run to verify pass** → PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(web): ordered Bayer 8x8 dither core"`

### Task 11: Reel stats and plate frames script

**Files:**
- Create: `web/scripts/reel-stats.mjs`, `web/lib/reel-stats.json`, `web/lib/plate-frames.json`
- Modify: `web/package.json` (`reel-stats`, `prebuild`), `Makefile` (`web-stats`)
- Test: `web/scripts/reel-stats.test.ts`
- Requires: `web/public/reels/sybil-eclipse.jsonl` (copy from `frontend/public/reels/` if phase 4 has not yet; the copy is part of this task when missing).

**Interfaces:**
- Produces: A.21 shapes; `export function computeStats(lines: string[]): { stats: ReelStats; plate: PlateFrames }` and `export const STAMP_MAX = 24`, `PLATE_MAX_BYTES = 80_000` from the `.mjs` (ESM, importable by vitest).

- [ ] **Step 1: Write the failing test** (reads the real reel once)

```ts
const lines = readFileSync(join(__dirname, '../public/reels/sybil-eclipse.jsonl'), 'utf8').split('\n').filter(Boolean)
const { stats, plate } = computeStats(lines)
test('stats come from the reel, not typed in', () => {
  expect(stats.peers).toBe(50); expect(stats.sybils).toBe(5); expect(stats.sybilAt).toBeCloseTo(10.2, 1); expect(stats.firstScorePruneAt).toBeCloseTo(11.9, 1)
  expect(stats.heartbeatsToPrune).toBe(2); expect(stats.eclipseTarget).toBe('peer-10'); expect(stats.clearedAt).toBeCloseTo(24.1, 1); expect(stats.healedInS).toBeGreaterThan(0); expect(stats.healedInS).toBeLessThan(5)
  expect(stats.deliveryPct).toBeGreaterThanOrEqual(90); expect(stats.avgHops).toBeGreaterThan(0)
})
test('plate frames: T+8..T+24 at 0.5 s, compact, stamps ≤ 24 chars and derived', () => {
  expect(plate.from).toBe(8); expect(plate.to).toBe(24); expect(plate.frames.length).toBeGreaterThanOrEqual(31); expect(plate.frames.length).toBeLessThanOrEqual(34)
  expect(plate.nodes).toHaveLength(50); for (const f of plate.frames) { expect(f.s).toHaveLength(50); expect(f.b).toHaveLength(50); expect(f.m.length).toBeLessThanOrEqual(40); expect(f.stamp.length).toBeLessThanOrEqual(STAMP_MAX) }
  expect(plate.frames.find(f => f.t >= 10.5)!.stamp).toBe('SYBIL FLOOD · T+10S'); expect(plate.frames.at(-1)!.stamp).toBe('CLEARED · T+24S'); expect(plate.frames.some(f => f.stamp.startsWith('ECLIPSE · N10 ·'))).toBe(true)
  expect(JSON.stringify(plate).length).toBeLessThan(PLATE_MAX_BYTES)
})
```

- [ ] **Step 2: Run to verify failure** → FAIL.
- [ ] **Step 3: Implement `scripts/reel-stats.mjs` per A.21** (`computeStats` exported; `main()` runs when `import.meta.url === pathToFileURL(process.argv[1]).href`, writes both JSON files, exits 1 on the size/stamp guards). Add the npm scripts and `make web-stats`; run `npm run reel-stats` and commit the outputs.
- [ ] **Step 4: Run to verify pass** → PASS; `node scripts/reel-stats.mjs` prints both paths and sizes.
- [ ] **Step 5: Commit** — `git commit -m "feat(web): reel-stats script producing landing readouts and Fig. 1 plate frames"`

### Task 12: Contract smoke — everything compiles together

**Files:**
- Create: `web/lib/contract.test.ts`
- Modify: none.

**Interfaces:**
- Consumes: every module from Tasks 1–11.

- [ ] **Step 1: Write the test** — imports every public name of A.2–A.15, A.19 and A.21 and asserts `typeof` for each function/const (a rename anywhere fails this file first).
- [ ] **Step 2: Run** — `cd web && npx tsc --noEmit && npm run lint && npx vitest run` → all green; `make check` (repo root) → green.
- [ ] **Step 3: Commit** — `git commit -m "test(web): contract smoke test over the shared interface modules"`

---

## Self-review notes

- Spec coverage: §4.1 tree (A.1), §4.2 env/URLs (A.9, A.24), §4.4 store rules (A.11), §4.5 renderer (A.17–A.18), §4.8 routes (A.24), §4.9 data layer edits (A.7, A.10), §4.10 copy (A.4, Task 2), §5/§6.2 render table names (A.15–A.17), §6.1 items 3–4 (A.21), §6.4 reels (A.10, A.12), §7 dither (A.19–A.20), §7.4 twist (A.20 removals, `RETICLE_CURSOR`, `HaloRing`/`Diamond` as the only decoration), §8 (A.23), §9 (A.22), §10 keyboard (A.5), §13 decisions (constraints). Components, renderer, Remotion and the figure are contract-only here by design; their build tasks live in the phase plans.
- Type consistency: `Edge`, `LayoutEdge`, `RGBA`, `ScoreBand`, `ParticleKind` are each defined once (A.2/A.15) and referenced by name elsewhere; `reelPlaying` is the only cross-import between `dispatch.ts` and `replay.ts` (Task 5 stub replaced in Task 7).
- Review Focus 1–5 are pinned to Tasks 9, 7, 4, 6 and 3 respectively.

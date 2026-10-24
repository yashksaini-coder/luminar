# UI Overhaul — Phase 3: Simulator Shell and Panels Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

## New interfaces introduced by this phase

All other names come from `/home/yks/Projects/luminar/docs/superpowers/plans/2026-10-24-ui-overhaul-interfaces.md` (Part A) and are used verbatim. The assembler merges the following into Part A.

| Path | Role |
|---|---|
| `web/lib/timeline-marks.ts` | pure: scrubber wash bands and tick marks from `ScenarioPhase[]` + `Beat[]` (spec §6.2 "beats and phases are drawn as ticks"; `.lm-tl-tick` finally gets a producer) |
| `web/lib/menu-keys.ts` | pure: roving-tabindex arithmetic for `role="menu"` (spec §10) |
| `web/lib/fault-items.ts` | pure: the fault menu's rows with `disabled` + `reason` derived from state; active fault count |
| `web/lib/log-filter.ts` | pure: chip toggling (Alt/Meta isolates), visible rows (cap 500), row-click resolution (visible node only, toggle off, highlight targets) |
| `web/lib/inspector-peers.ts` | pure: mesh vs topology peer lists, "pruned by", per-peer events (cap 200), direction glyph |
| `web/lib/spark.ts` | pure: polyline geometry for `Sparkline.tsx` (domain, zero line) |
| `web/components/sim/Glyph.tsx` | the render-table glyph as inline SVG for DOM surfaces (legend `<dl>`, inspector header, state rows); wraps `Diamond`/`HaloRing` for the two legend twins |
| `web/components/sim/Overlay.tsx` | full-screen overlay primitive: `role="dialog"`, focus trap, Escape, staggered rows; used by `KeyHelp` and the ≤1023 px `Menu +`; phase 5's landing `Nav` reuses it |
| `web/components/dither/HaloRing.tsx`, `web/components/dither/Diamond.tsx` | created **here** (A.20 props verbatim) because the simulator legend needs them (spec §7.4 twist 2); phase 5 consumes, it must not recreate them |

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

// components/sim/Menus.tsx
export function Menu(props: { id: string; label: string; children: React.ReactNode; disabledReason?: string }): JSX.Element
  // trigger <button aria-haspopup="menu" aria-expanded popovertarget={id}> + <div id popover="auto" role="menu">; positioned under the trigger from getBoundingClientRect on toggle
export function MenuItem(props: { onSelect: () => void; disabled?: boolean; reason?: string; active?: boolean; kbd?: string; aside?: string; meta?: string; tag?: string; children: React.ReactNode }): JSX.Element
  // <button role="menuitem" tabIndex={-1} aria-disabled aria-current={active}>; disabled items stay focusable so the reason is read
export interface MenuRow { key: string; name: string; onSelect: () => void; disabled?: boolean; reason?: string; active?: boolean; kbd?: string; aside?: string; meta?: string; tag?: string }
export function scenarioRows(scenarios: ScenarioDefinition[], activeId: string | null): MenuRow[]   // name, aside `${duration}s`, meta description → launchScenario(id)
export function reelRows(manifest: ReelManifest, activeName: string | null): MenuRow[]            // kbd 1..n, title, meta blurb, tag 'REAL' when real → enterReel; last row kbd '0' 'Back to live' → exitReel
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

---

**Goal:** Build every simulator surface of spec §6.2 except the canvas (phase 2), the ticker/stage/hero/reels (phase 4) and the dither plates (phase 5): toolbar, command strip with a reel-only scrubber, popover menus, truthful toasts, both rails, the inspector, legend + settings, narrator caption, keyboard with `r` and `?`, and the ≤1023 px drawers and overlay.

**Architecture:** Every panel is a client component under `web/components/sim/` that reads the zustand store through selectors (never `useStore()` bare; node arrays only via `useShallow`) and calls `lib/actions.ts` for anything that touches the API or the reel player. Logic that can be wrong in more than one way is lifted into six pure `lib/*.ts` modules with vitest tests; the components are accepted by a scripted browser walk against `make backend`. Styling is one CSS Module per component on top of `globals.css` tokens; no new colours, no boxes, hairlines only.

**Tech Stack:** Next 16.4.3 static export, React 19.3.1, zustand 5.0.16, native `popover`, vitest (jsdom) for `lib/`, chrome-devtools MCP for the browser walks.

**Spec:** `/home/yks/Projects/luminar/docs/superpowers/specs/2026-10-24-ui-overhaul-design.md` §6.2, §7 (forbidden list), §10, §11 phase 3, §12, §13 items 2 and 5. Parity checklist: `/home/yks/Projects/luminar/docs/design/ui-inventory.md` §1, §2, §3 (token field), §6, §7, §8.1–§8.3, §8.5, §8.6 (caption only). Source being ported: `/home/yks/Projects/luminar/frontend/src/ui/*.ts`, `charts/sparkline.ts`, `app.ts`. Interfaces: `/home/yks/Projects/luminar/docs/superpowers/plans/2026-10-24-ui-overhaul-interfaces.md`.

## Global Constraints

- Backend untouched; same WS and REST contracts (spec §3). Node presets `20 50 100 200`, never 500 (spec §13.5). Telemetry drawer deferred: badge only (spec §13.2).
- Plain CSS: tokens from `app/globals.css` only; one CSS Module per component; no CSS-in-JS, no Tailwind, no icon set, no UI kit (spec §4.3, §4.7). Square corners (`--r-0`); only nodes are round (spec §5).
- `--flame` means attacker / fault / alarm only: never a hover, brand, link or primary button; never on `--signal` (spec §2, §5). `--paper-3` is never text (spec §5, §10).
- No dither on text, numerals, attackers, pruned diamonds, particles, pulses, reticle, focus rings, the scrubber head, state-strip cells, any chart or bar under 12 px tall, stamps, menu and toast surfaces (spec §7). Dither is allowed here only on sparkline/CDF areas, event-category bars and stream/DHT bars, all ≥ 12 px tall, and the timeline wash bands.
- Copy only from `lib/copy.ts`: `SCRUB_LIVE`, `MESH_HIDDEN`, `ECLIPSE_WHY`, `REEL_GUARD`, `ARRIVAL`, `geoOnly()`; `web/lib/copy.test.ts` must stay green (spec §4.10).
- Store rules: never `useStore()` without a selector; node arrays only via `useShallow`; no per-frame data in React state; one `setState` per WS batch (spec §4.4).
- Accessibility (spec §10): menus are `popover` elements with `role="menu"`, roving tabindex, arrow keys, Escape returns focus to the trigger; scrubber is a real `<input type="range">` with `aria-valuetext` and live `aria-disabled`; filter chips are `aria-pressed` buttons; caption `aria-live="polite"`; toasts `role="status"`; legend is a `<dl>`; `:focus-visible` 2 px `--focus` outline never removed; tabular numerals on every readout; 44 px minimum hit targets on the strip at ≤1023 px; `prefers-reduced-motion` zeroes every `--d-*` (tokens already do) and the settings panel says transfers are off.
- Layout values (spec §5, §6.2): toolbar 44 · left rail 264 · right rail 312 · strip 52 floating, 76 % wide clamped 360–820 px, `bottom: 36px` · rows 22 px · toasts top-left under the toolbar, 2 s each · caption drain 4 s.
- Commit style `type(scope): message`, scope `web` (spec §12).
- Every task ends with `cd /home/yks/Projects/luminar/web && npx tsc --noEmit && npm run lint && npx vitest run` green; `make check` stays green for `frontend/` and `backend/` (spec §11).

## Review Focus

1. **Live-mode scrubber**: dragging or arrow-keying the range while `reel === null` must never call `POST /api/sim/seek` and must never move `simTime` — Task 3.2 walk step 6 watches the network panel; `Scrubber` renders `aria-disabled="true"` and ignores `input` when live.
2. **Log row whose peer is hidden in the current layout** (an observer row while in Force, a sim peer while in Geo): click is a no-op, nothing selects, the inspector stays closed — Task 3.6 test `rowClick returns null for a hidden or unknown peer`.
3. **Fault menu with nothing selected**: Eclipse and Drop are `aria-disabled` with the reason visible, and `Enter` on them performs no POST — Task 3.3 test `eclipse and drop are disabled with a reason when no sim peer is selected` plus walk step 5.
4. **Mesh key missing for the selected peer** (above 100 nodes the backend sends `mesh: {}`): MESH PEERS shows the `MESH_HIDDEN` sentence, never `0 peers` — Task 3.7 test `meshPeers is null when the key is absent`.
5. **Keys while a menu or dialog has focus**: `Space` must activate the focused menu item, not toggle play; `?` typed into the admin-token field must not open the help — Task 3.10 wires `actionForKey` after a `closest('[role="menu"],[role="dialog"]')` guard (Escape excepted) and walk step 5 proves both.

## Browser walk harness (used by every UI task)

Terminals, from `/home/yks/Projects/luminar`:

1. `make backend` (variant for the token test: `LUMINAR_ADMIN_TOKEN=secret make backend`).
2. `make web` → `http://localhost:3000` (dev rewrites proxy `/api` to `:8000`; the socket goes to `ws://localhost:8000/ws/events`).
3. chrome-devtools MCP: `navigate_page` to `http://localhost:3000/sim/`, `resize_page` 1440×900 (desktop) or 390×844 (phone), `take_snapshot` for the a11y tree, `click` / `press_key` / `fill`, `evaluate_script` for DOM assertions, `list_network_requests` for API calls, `emulate` for `prefers-reduced-motion: reduce`. Manual fallback: the same steps in Chrome DevTools (device toolbar, Rendering → emulate reduced motion, Network panel).
4. Scenario launch from a shell: `curl -s -X POST localhost:8000/api/scenarios/demo_sybil_eclipse/launch -H 'Content-Type: application/json' -d '{"speed":1}'` (phases: `inject_sybil` T+10, `inject_eclipse` peer-10 T+16, `clear_faults` T+24, duration 60).
5. Reels in dev need `web/public/reels/manifest.json` (copied in Task 3.3) and, to actually play one, `web/public/reels/sybil-eclipse.jsonl` (present since contract Task 11; the rest land in phase 4).

A walk step reads "observe: …"; the task is accepted only when every observation matches.

---

### Task 3.1: Shell grid, toolbar and toast queue

**Files:**
- Modify: `web/components/sim/SimApp.tsx` (phase 1/2 version: connects the socket, mounts `DeckCanvas`)
- Create: `web/components/sim/SimApp.module.css`, `web/components/sim/Toolbar.tsx`, `web/components/sim/Toolbar.module.css`, `web/components/sim/Toasts.tsx`, `web/components/sim/Toasts.module.css`
- Test: browser walk only (no pure logic; the toast queue and `toastFor` are already tested in `lib/store.test.ts` and `lib/api/client.test.ts`)

**Interfaces:**
- Consumes: `useStore`, `selectPill`, `selectTimelineTotal`, `AppState.{simTime,maxDuration,nodeCount,reel,mainnet,telemetry,toasts}`, `dismissToast` (A.11); `toggleMainnet`, `setNodePreset`, `setDurationPreset` (A.12); `formatTime` (A.3); `ARRIVAL`, `REPO_URL` (A.4); `DeckCanvas` (A.18); `ModeSwitcher`, `Provenance`, `Tooltip` (phase 2).
- Produces: `Toolbar({ onMenu })`, `Toasts()`, `TOAST_MS = 2000`; `SimApp` grid areas `toolbar · rail-l · canvas · rail-r` with CSS vars `--toolbar-h --rail-l --rail-r`; `SimApp` local state `drawer: 'stats' | 'log' | null`, `overlayOpen: boolean`, `manifest: ReelManifest` (filled in Task 3.3).

- [ ] **Step 1: Write `SimApp.tsx` as the grid shell**

`'use client'`. Grid: `grid-template: "toolbar toolbar toolbar" var(--toolbar-h) "rail-l canvas rail-r" 1fr / var(--rail-l) 1fr var(--rail-r)`; `height: 100dvh; overflow: hidden; background: var(--bg)`. Children in order: `<Toolbar onMenu={…}/>`, `<aside data-rail="l">` (empty until Task 3.4), `<main>` holding `<DeckCanvas/>` plus the phase-2 overlays (`ModeSwitcher` top-centre, `Provenance` top-left, `Tooltip`) and `<Toasts/>`, `<aside data-rail="r">` (empty until Task 3.6). Keep the phase-1 connect/disconnect effect. `data-reel` attribute on the root when `reel !== null` (the `.reel` dimming hook, inventory §1).

- [ ] **Step 2: Implement `Toolbar.tsx`**

Left to right (spec §6.2 Toolbar): brand `LUMINAR` (Manrope 600, letter-spacing .14em) + `gossipsub v1.1` (mono, `--fg-3`); connection pill from `selectPill` — `OFFLINE` (text `--flame-dim`, no fill, 1 px `--hair` rule), `LIVE` (6 px `--signal` dot + text), `REEL · ${reel.title}` (6 px `--paper-0` square + text); `MAINNET` badge (`<button aria-pressed={mainnet?.enabled ?? false} title={ARRIVAL}>` → `toggleMainnet()`); `TELEMETRY` badge (`<span>` not a button — badge only, spec §13.2 — rendered only when `telemetry.active`, text `TELEMETRY ${telemetry.peerCount}`, title `peers reporting · drawer after Devcon`); spacer; duration presets `1m 2m 5m 10m` (`aria-pressed` = `maxDuration === sec` for 60/120/300/600 → `setDurationPreset`); node presets `20 50 100 200` (`aria-pressed` = `nodeCount === n` → `setNodePreset`); clock `T+ ${formatTime(simTime)}` with `font-variant-numeric: tabular-nums`; GitHub link `https://${REPO_URL}` (`rel="noopener" target="_blank"`, text `GitHub`, no icon set). `[data-reel] .presets { opacity: .5 }`. The `Menu +` button and the collapse rules come in Task 3.11; render the button now with `className={s.menuBtn}` hidden above 1023 px.

- [ ] **Step 3: Implement `Toasts.tsx`**

`const toasts = useStore(s => s.toasts)`; render `<div role="status" aria-live="polite">` holding one `<div data-kind={t.kind}>` per toast, positioned `top: calc(var(--toolbar-h) + var(--s-3)); left: var(--s-3)` inside `<main>`, 260 px, `--raised` surface, 1 px `--hair-strong` rule, no dither. Each toast schedules `setTimeout(() => dismissToast(t.id), TOAST_MS)` in a `useEffect` keyed by `t.id`. `data-kind="fail"` text `--flame-text`; `ok` text `--fg`; `info` text `--fg-2`.

- [ ] **Step 4: Verify types, lint, tests**

Run: `cd /home/yks/Projects/luminar/web && npx tsc --noEmit && npm run lint && npx vitest run`
Expected: all green (no new tests in this task).

- [ ] **Step 5: Browser walk (desktop 1440×900)**

1. Open `/sim/` with the backend up. Observe: 44 px toolbar; left rail 264 px and right rail 312 px empty but present (`evaluate_script`: `getComputedStyle(document.querySelector('[data-rail=l]')).width === '264px'`); canvas fills the centre; no horizontal scrollbar (`document.documentElement.scrollWidth === innerWidth`).
2. Pill reads `LIVE` with a cyan dot; clock advances as `T+ 12.3s` then `1:02` past 60 s.
3. Click `MAINNET`. Observe: toast (none on success), badge `aria-pressed="true"`, the phase-2 provenance card appears top-left with the verbatim sentence. Click again to turn it off.
4. Click node preset `50`. Observe: after reconfigure the `50` button is `aria-pressed="true"`, the canvas relaid out. Click `20` to restore. Click duration `2m`. Observe: `2m` lit; `cur / total` (Task 3.2) will read `/ 2:00`.
5. Stop the backend (Ctrl-C). Observe: pill `OFFLINE` in dim flame with no fill. Click `MAINNET`. Observe: toast `backend offline` in flame text, gone after 2 s. Restart the backend; pill returns to `LIVE`.
6. `TELEMETRY` badge is absent (`document.body.textContent.includes('TELEMETRY') === false`) until a telemetry peer reports.

- [ ] **Step 6: Commit**

```bash
git add web/components/sim/SimApp.tsx web/components/sim/SimApp.module.css web/components/sim/Toolbar.tsx web/components/sim/Toolbar.module.css web/components/sim/Toasts.tsx web/components/sim/Toasts.module.css
git commit -m "feat(web): simulator shell grid, toolbar with pill, badges and presets, toast queue"
```

### Task 3.2: Command strip with a recordings-only scrubber

**Files:**
- Create: `web/lib/timeline-marks.ts`, `web/components/sim/CommandStrip.tsx`, `web/components/sim/CommandStrip.module.css`, `web/components/sim/Scrubber.tsx`
- Modify: `web/components/sim/SimApp.tsx` (mount `<CommandStrip/>` and the kbd hint row inside `<main>`; subscribe `simTime` → `autoPauseIfDue`)
- Test: `web/lib/timeline-marks.test.ts` (vitest); browser walk

**Interfaces:**
- Consumes: `togglePlay`, `reset`, `setSpeed`, `seekTo`, `autoPauseIfDue` (A.12); `selectTimelineTotal`, `AppState.{simTime,playing,simSpeed,reel,beats,activeScenario}`; `formatTime`; `SCRUB_LIVE`; `KBD_HINT` (A.5); `Beat`, `ScenarioPhase`, `BeatKind` (A.2).
- Produces: `bandsFor`, `ticksFor`, `washVar` (header block); `CommandStrip({ manifest, onDrawer })`, `Scrubber()`. The menus slot in `CommandStrip` is filled in Task 3.3; the `Stats` / `Log` drawer buttons in Task 3.11.

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

- [ ] **Step 3: Implement `lib/timeline-marks.ts` with the three signatures in the header block**

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
- Create (copy): `web/public/reels/manifest.json` ← `frontend/public/reels/manifest.json` (if phase 4 has not already; 1 KB; the `.jsonl` files other than `sybil-eclipse` may 404 in dev until phase 4)
- Modify: `web/components/sim/CommandStrip.tsx` (fill the menus slot), `web/components/sim/SimApp.tsx` (fetch the manifest once with `getStatic<ReelManifest>('/reels/manifest.json')`, `fetchScenarios()` on mount)
- Test: `web/lib/menu-keys.test.ts`, `web/lib/fault-items.test.ts` (vitest); browser walk

**Interfaces:**
- Consumes: `launchScenario`, `injectFault`, `enterReel`, `exitReel`, `fetchScenarios`, `FaultKind` (A.12); `getStatic` (A.7); `AppState.{scenarios,activeScenario,reel,selectedPeer,nodeById,events}`; `shortName`, `isAttackerId` (A.3); `isSimPeer` (A.14); `ReelManifest`, `ReelMeta` (A.2).
- Produces: `nextMenuIndex`; `FaultItem`, `faultItems`, `activeFaultCount`; `Menu`, `MenuItem`, `MenuRow`, `scenarioRows`, `reelRows`, `faultRows`, `ScenariosMenu`, `ReelsMenu`, `FaultMenu` (header block). Task 3.11's overlay renders the same `MenuRow[]` as staggered rows.

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

- [ ] **Step 3: Implement `lib/menu-keys.ts` and `lib/fault-items.ts` per the header block**

Labels: `Partition` · `Sybil attack` · `Eclipse attack` · `Drop peer` · `Clear all faults`.

- [ ] **Step 4: Run to verify pass**

Run: `cd /home/yks/Projects/luminar/web && npx vitest run lib/menu-keys.test.ts lib/fault-items.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Implement the `Menu` / `MenuItem` primitives in `Menus.tsx`**

`Menu`: trigger `<button type="button" aria-haspopup="menu" aria-expanded={open} popoverTarget={id}>{label} ▾</button>` and `<div id={id} popover="auto" role="menu" aria-label={label}>`; `popover="auto"` gives outside-click light dismiss and one-open-at-a-time natively. On `toggle` event (`newState === 'open'`): position with `getBoundingClientRect()` of the trigger (`position: fixed; top: rect.bottom + 4; left: clamp(8, rect.left, innerWidth − menuWidth − 8)`; opens upward when `rect.bottom + menuHeight > innerHeight − 8`, which is the strip's case), focus the first `[role=menuitem]`, set its `tabIndex=0`. `onKeyDown`: `nextMenuIndex(idx, e.key, items.length)` → move focus and roving tabindex; `Escape` → `hidePopover()` + focus the trigger; `Enter`/`Space` → click the focused item; letters ignored. `MenuItem`: `<button role="menuitem" tabIndex={-1} aria-disabled={disabled} aria-current={active ? 'true' : undefined} onClick={() => { if (disabled) return; closest('[popover]').hidePopover(); onSelect() }}>` rendering `kbd` as `<kbd>`, children as the name, `aside` right-aligned `--fg-3`, `meta` as a second line `--t-body --fg-3`, `tag` as `REAL` in `--signal-text` with a 1 px rule, `reason` as the meta line when disabled. Surface `--raised`, 1 px `--hair-strong`, rows ≥ 32 px (44 at ≤1023), hover wash `--wash`, nothing dithered, no `--flame` except the attacker-named items' aside.

- [ ] **Step 6: Implement the row builders and the three menus**

`scenarioRows`, `reelRows`, `faultRows` per the header block (pure functions returning `MenuRow[]`; `reelRows` ends with the `kbd '0'` `Back to live` row; phase 4 may replace `enterReel` with navigation to `/reels/<n>/`, so this is the one call site).
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
git add web/lib/menu-keys.ts web/lib/menu-keys.test.ts web/lib/fault-items.ts web/lib/fault-items.test.ts web/components/sim/Menus.tsx web/components/sim/Menus.module.css web/components/sim/CommandStrip.tsx web/components/sim/SimApp.tsx web/public/reels/manifest.json
git commit -m "feat(web): popover menus for scenarios, reels and faults with keyboard nav, stepper and truthful toasts"
```

### Task 3.4: Stats rail — KPIs with sparklines, nodes, messages

**Files:**
- Create: `web/lib/spark.ts`, `web/components/sim/Sparkline.tsx`, `web/components/sim/Glyph.tsx`, `web/components/sim/Glyph.module.css`, `web/components/sim/StatsRail.tsx`, `web/components/sim/StatsRail.module.css`
- Create: `web/components/dither/HaloRing.tsx`, `web/components/dither/Diamond.tsx` (A.20 props; needed by `Glyph`)
- Modify: `web/components/sim/SimApp.tsx` (mount `<StatsRail onBeat={…}/>` in `[data-rail="l"]`)
- Test: `web/lib/spark.test.ts` (vitest); browser walk

**Interfaces:**
- Consumes: `selectKpis`, `selectHasMessages`, `selectStateCounts`, `selectAttackers`, `AppState.{analyticsHistory,nodes,nodeCount,totalMessagesSent,totalMessagesReceived,invalidCount,eventCount}` (A.11); `fmtCount` (A.3); `bayer` (A.19); `scoreBand`, `BAND_DENSITY` (A.15); `isPruned`; `useShallow` from `zustand/react/shallow`.
- Produces: `scoreDomain`, `sparkPoints`; `Sparkline`, `Glyph`, `GlyphRole`; `HaloRing`, `Diamond` (A.20 verbatim); `StatsRail({ onBeat })` with the first three sections (KPI, NODES, MESSAGES); Task 3.5 adds the rest.

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
```

- [ ] **Step 2: Run to verify failure**

Run: `cd /home/yks/Projects/luminar/web && npx vitest run lib/spark.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `lib/spark.ts` per the header block**

- [ ] **Step 4: Run to verify pass**

Run: `cd /home/yks/Projects/luminar/web && npx vitest run lib/spark.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Implement `Sparkline.tsx`**

`'use client'`; a `<canvas role="img" aria-label>` sized to its container width × `height` (default 36, never under 12) at `min(devicePixelRatio, 2)`; `ResizeObserver` on the parent; draws (a) the area under the line filled with a `CanvasPattern` built from a `--cell-ui`-sized 2×2 checker of `--fg` (flame when `alarm`) — the only dither here, (b) the line 1.5 px `--fg` (`--flame` when `alarm`), (c) `zeroLine` dashed `[2,2]` `--hair-strong` at `zeroY`. Colours via `getComputedStyle(document.documentElement).getPropertyValue(...)` read once per draw (the stage theme swaps tokens). Draw inside `useEffect([values, domain, alarm])`; fewer than 2 values draws nothing.

- [ ] **Step 6: Implement `HaloRing.tsx`, `Diamond.tsx` and `Glyph.tsx`**

`HaloRing({ size, band = 2, flame, depth, className })`: a `<canvas width=height=size·dpr>` filled per pixel: inside the annulus `0.62·R ≤ r ≤ R` lit iff `bayer(x, y) < BAND_DENSITY[band]` in `--paper-0` (`--flame` when `flame`); a 1 px paper rim arc at `R`; `data-depth={depth}`; `aria-hidden`. `Diamond({ size, pruned, depth, className, label })`: inline SVG `viewBox 0 0 16 16` polygon `8,0 16,8 8,16 0,8`; grafted = fill `--flame` + a `<pattern>` of 45° 1 px `--pitch-0` lines at .55 (the `--hatch` recipe); pruned = `fill: none; stroke: var(--paper-3); stroke-dasharray: 3 2`; `<title>{label}</title>` when given; never dithered. `Glyph({ role, size = 12, band, title })`: SVG per the render table — `honest`/`receiving` disc `--paper-0` (with `<HaloRing size={size*1.7} band={band ?? 3}>` behind it when `band` is given), `idle` disc `--pitch-4` + 1 px `--paper-3` rim, `origin` disc + pitch centre dot, `decoded` disc + solid `--signal` ring at 1.6 r, `observer` double `--signal` ring, `joining` hollow 1 px `--paper-1`, `failed` disc with X `--paper-3`, `error` X in `--flame-dim`, `attacker` → `<Diamond>`, `pruned` → `<Diamond pruned>`.

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
git add web/lib/spark.ts web/lib/spark.test.ts web/components/sim/Sparkline.tsx web/components/sim/Glyph.tsx web/components/sim/Glyph.module.css web/components/sim/StatsRail.tsx web/components/sim/StatsRail.module.css web/components/dither/HaloRing.tsx web/components/dither/Diamond.tsx web/components/sim/SimApp.tsx
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
- Produces: `initialFilters`, `toggleFilter`, `visibleRows`, `rowClick` (header block); `LogRail()`; the Inspector (Task 3.7) slides over this rail, so `LogRail` keeps `position: relative; height: 100%`.

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

- [ ] **Step 3: Implement `lib/log-filter.ts` per the header block**

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
- Produces: `meshPeers`, `prunedBy`, `peerEvents`, `direction` (header block); `Inspector()` — open iff `selectSelectedNode` is defined; closes through `selectPeer(null)`.

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

- [ ] **Step 3: Implement `lib/inspector-peers.ts` per the header block**

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
- Produces: `Overlay({ open, onClose, title, children, className })` (header block); `KeyHelp()`.

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

## Phase 3 acceptance gate (spec §11, verbatim)

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

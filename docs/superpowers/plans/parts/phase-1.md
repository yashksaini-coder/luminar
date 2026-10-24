# UI Overhaul — Phase 1: Data Layer and Store Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land `web/lib/` (types, format, copy, keys, REST client, frame dispatcher, WebSocket manager, reel player, zustand store) as vitest-tested modules, and a `SimApp` that connects on mount, disconnects on unmount, and shows the connection pill and the clock from selectors.

**Architecture:** Every module is a 1:1 port of `frontend/src/` with the edits spec §4.9 names: `post()` returns `{ok,status,data}`, reels stream-parse, `gap` frames are counted into the store, the mutable singleton becomes a zustand 5 store whose appliers write only the fields that changed. One frame router (`lib/api/dispatch.ts`) serves the live socket and the reel player so both paths produce identical store writes. No component other than `SimApp`/`Toolbar` exists yet; the 20 Hz path is proven by a browser walk, the rest by vitest (jsdom).

**Tech Stack:** Next 16.4.3 static export, React 19.3.1, TypeScript 5.9.3, zustand 5.0.16, vitest + jsdom (exact versions pinned after `npm view`).

**Spec:** `/home/yks/Projects/luminar/docs/superpowers/specs/2026-10-24-ui-overhaul-design.md` §4.2, §4.4, §4.9, §4.10, §6.2 (Keyboard, toolbar pill), §6.4, §11 Phase 1. Contract: `/home/yks/Projects/luminar/docs/superpowers/plans/2026-10-24-ui-overhaul-interfaces.md` Part A (A.2–A.5, A.7–A.11, A.24) — every name below is from there unless listed under "New interfaces". Parity rows: `docs/design/ui-inventory.md` §2 (keys), §3 (`luminar.token`), §4.1–§4.3 (REST, WS, store), §10 (reels: Load, Play, Seek, Speed, Guards). Source being ported: `frontend/src/{types,format,store}.ts`, `frontend/src/api/{client,websocket,replay}.ts`, `frontend/src/ui/{keyboard,narrator}.ts`, `frontend/src/app.ts:146-226,428-477`.

## Global Constraints

- Backend untouched; same WS contract (`/ws/events`, orjson binary typed frames + text events at 20 Hz, `gap` when > 200 events/tick) and same REST contract (inventory §4.1).
- `VITE_API_URL` → `NEXT_PUBLIC_API_URL` (build-time, `''` in the container); dev WS falls back to `NEXT_PUBLIC_WS_URL ?? 'ws://localhost:8000'` when `location.port === '3000'` (spec §4.2).
- Exact pins, lockfile committed; builder runs `npm view <pkg> version` before pinning `vitest` and `jsdom`. No `@deck.gl/react`, Tailwind, immer, UI kit, icon set, `@testing-library/*` (UI is accepted by browser walk, not DOM tests).
- `post()` never throws; `{ok:false,status:0}` means network error (spec §3, §4.9). Dropped wrappers: `topologyMetrics`, `metricsSnapshot`, `eventsRecent`, `gossipMesh/Scores/Analytics`, `faultActive`, `scenarioActive`, `simSeek` (spec §4.9, §6.2).
- Honesty copy lives only in `lib/copy.ts`, verbatim: `Same mechanism, toy constants.` · `reproducible recordings` · `arrival at observer nodes, ~2.5 min behind` · `arrival at observer nodes, not mesh paths · data: ethPandaOps (CC BY 4.0)` (spec §2, §4.10).
- Store rules (spec §4.4): never `useStore()` without a selector; one `setState` per WS batch; appliers write only fields whose value changed; per-frame render data stays out of the store.
- Reel guards (spec §6.4): recorded `SimulationStateChanged` and snapshot `state/speed` ignored in reel mode; scheduler `setInterval` 50 ms; speed min 0.1; seek replays the last `edges, scenario, telemetry_status, snapshot, metrics, analytics` before `t`, events skipped.
- Path alias `@/*` → `web/*`; tests sit next to their module as `*.test.ts`; commits `type(web): message`.
- Every task ends with `cd /home/yks/Projects/luminar/web && npx tsc --noEmit && npm run lint && npx vitest run` green.

## Review Focus

1. **Reel JSONL line split across two stream chunks** — the parser carries the partial tail; no frame dropped or parsed twice (Task 1.8 `parseReelChunk carries a partial line across chunks`).
2. **`post()` against a 403 or a dead backend** — `{ok:false,status:403}` / `{ok:false,status:0}`, never a throw, and `toastFor` says `failed · 403` / `backend offline` (Task 1.4).
3. **`disconnect()` during a pending reconnect; `connect()` twice; StrictMode mount→unmount→mount** — no reconnect after disconnect, one live socket, superseded handlers inert (Task 1.7 and the walk in Task 1.9).
4. **A stale `ClockTick` in the same reel step as a newer snapshot** — pending events flush before a typed frame applies, so the snapshot's `time` wins (Task 1.6 `a typed frame flushes pending events first`, Task 1.8 play test asserts `simTime` 1.5).
5. **Keys with modifiers, `?` (Shift+/), focus in a range input vs a text input** (Task 1.3).

## New interfaces introduced by this phase

| Name | Where | Decision |
|---|---|---|
| `isSimPeer(nd: { is_real?: boolean; is_telemetry?: boolean }): boolean` | `web/lib/format.ts` | `!nd.is_real && !nd.is_telemetry`. A.14 lists it on `components/map/layout.ts`; the store needs it before layout.ts exists, so it is defined here and **phase 2's `layout.ts` re-exports it** (`export { isSimPeer } from '@/lib/format'`). |
| `peerNode(id: string, index: number, extra?: Partial<PeerNode>): PeerNode` · `snapWith(ids: string[], extra?: Partial<SnapshotFrame>): SnapshotFrame` | `web/lib/fixtures.ts` | Test fixtures shared by every `*.test.ts` in phases 1–4. `peerNode`: `state 'idle'`, `connected_peers []`, `x 0 y 0`, `messages_* 0`, `gossip_score 1`. `snapWith`: `type 'snapshot'`, `state 'running'`, `time 0`, `speed 1`, `node_count ids.length`, `event_count 0`, `gossip { mesh: {} }`. |
| `applySnapshot` in reel mode leaves `playing` untouched | `web/lib/store.ts` | Equivalent to A.11's `playing = reel ? reelPlaying() : …` because `playReel`/`pauseReel`/`loadReel` call `setPlaying` themselves (below); removes the `dispatch ↔ replay` import cycle, so no stub is needed. |
| `playReel()` → `setPlaying(true)`; `pauseReel()`, end-of-reel and `loadReel()` → `setPlaying(false)` | `web/lib/api/replay.ts` | The reel player owns `playing` while `store.reel` is set. A.12's `togglePlay` may still call `setPlaying`; it is idempotent. |
| `dispatchFrame` flushes pending events **before** applying a typed frame | `web/lib/api/dispatch.ts` | Preserves wire order inside one reel step / one WS tick (Review Focus 4). Live cost: at most one extra `setState` per typed frame (≤ 2 Hz for snapshots). |
| Beat labels | `web/lib/store.ts` | `FaultInjected` → `{ label: \`${fault_type ?? 'fault'} injected\`, kind: 'fault' }`; `FaultCleared` → `{ label: \`${fault_type ?? 'faults'} cleared\`, kind: 'fault' }` (A.11's test expects a `fault` beat at `FaultCleared`); prune → `First Sybil pruned`; healed → `Mesh healed`; phase → the `ScenarioPhaseFired.label`. |
| `Toolbar` (phase-1 subset) | `web/components/sim/Toolbar.tsx` | `export default function Toolbar(): JSX.Element` renders brand + `<Pill/>` (`data-testid="pill"`, `data-state={ConnectionPill}`) + `<Clock/>` (`<time data-testid="clock">` whose only child is the text `T+${formatTime(simTime)}`). Phase 3 adds badges, presets and the GitHub link to this same file. |
| `SimApp` (phase-1 subset) | `web/components/sim/SimApp.tsx` | `'use client'`; `export default function SimApp(): JSX.Element`; `useEffect(() => { ws.connect(); return () => ws.disconnect() }, [])`; renders `<Toolbar/>` and `<main data-slot="canvas"/>` (phase 2 mounts `DeckCanvas` there). Plain client component, not `dynamic(ssr:false)`: `ssr:false` is only legal inside a client component, and A.18 applies it to `DeckCanvas`; a server-rendered toolbar also helps Lighthouse (spec §2 goal 6). |

**Out of this phase** (lands with its first consumer; the interfaces doc's Part B numbers in brackets): `lib/event-codes.ts` [Task 3, second half] → phase 3 with `LogRail`; `lib/actions.ts` [Task 8] → phase 3 (it imports `visiblePositions`/`resetTopology` from phase 2's renderer; `autoPauseIfDue` is subscribed to `simTime` there); `lib/prefs.ts` [Task 8] → phase 4; `components/map/layout.ts`, `palette.ts` [Task 9] → phase 2; `dither.ts` [Task 10], `reel-stats.mjs` [Task 11] → phase 5; the contract smoke test [Task 12] → the last phase that adds a contract module.

---

### Task 1.1: vitest harness, `lib/types.ts`, `lib/format.ts`

**Files:**
- Create: `web/vitest.config.ts`, `web/lib/types.ts`, `web/lib/format.ts`, `web/lib/fixtures.ts`
- Modify: `web/package.json` (devDependencies `vitest`, `jsdom`; scripts `"test": "vitest run"`, `"test:watch": "vitest"`), `web/tsconfig.json` (only if the phase-0 scaffold lacks `"paths": {"@/*": ["./*"]}`; tests import from `'vitest'` explicitly, no globals), `Makefile` (`web-test`, `web-check` gains `npx vitest run`), `.github/workflows/ci.yml` (job `web-build` gains `- run: npx vitest run` after lint)
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
Expected: FAIL — `vitest: command not found` or "Cannot find module '@/lib/types'".

- [ ] **Step 3: Add the harness** — `npm view vitest version` and `npm view jsdom version`, pin both exact in `devDependencies`, `npm install`; `web/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'
export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('.', import.meta.url)) } },
  test: { environment: 'jsdom', include: ['**/*.test.ts'], exclude: ['**/node_modules/**', 'out/**', '.next/**'] },
})
```

Makefile: `web-test: cd web && npx vitest run` and `web-check: cd web && npx tsc --noEmit && npm run lint && npx vitest run`. CI `web-build` job: add `npx vitest run` between lint and build.

- [ ] **Step 4: Implement `web/lib/types.ts` (A.2 verbatim; `isTypedFrame = (f) => 'type' in f && typeof f.type === 'string'`), `web/lib/format.ts` (A.3 signatures ported from `frontend/src/format.ts`, `ui/stats-panel.ts:24`, `charts/sparkline.ts:9-16`; `signed(v) = (v < 0 ? '-' : '+') + Math.abs(v).toFixed(2)`; `shortId(id) = id.startsWith('peer-') ? 'n' + id.slice(5) : id`; `isAttackerId = /^(sybil|eclipse)-/`; `isPruned = state === 'attacker' && connected_peers.length === 0`; `isSimPeer` per the table above), and `web/lib/fixtures.ts` (`peerNode`, `snapWith` per the table above).**

- [ ] **Step 5: Run to verify pass**

Run: `cd /home/yks/Projects/luminar/web && npx vitest run lib/types.test.ts lib/format.test.ts && npx tsc --noEmit && npm run lint`
Expected: `Tests 4 passed`, tsc and lint clean.

- [ ] **Step 6: Commit**

```bash
git add web/vitest.config.ts web/package.json web/package-lock.json web/lib/types.ts web/lib/format.ts web/lib/fixtures.ts web/lib/types.test.ts web/lib/format.test.ts Makefile .github/workflows/ci.yml
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
```

- [ ] **Step 2: Run to verify failure** — `cd /home/yks/Projects/luminar/web && npx vitest run lib/api/replay.test.ts` → FAIL.
- [ ] **Step 3: Port `frontend/src/api/replay.ts` → `web/lib/api/replay.ts` per A.10** with the streaming reader. `loadReel`: `stopReel()` first; `fetch(meta.file, { signal })`; `!res.ok || !res.body` → false; `getReader()` + `TextDecoder` with `{ stream: true }`; `parseReelChunk` per chunk; progress `setReelLoad({ loaded, total })` at most every 100 ms (`Date.now()`), always once on the first chunk; priming on the first parsed snapshot: dispatch the latest `edges` and `scenario` seen so far, then that snapshot, then `flushEvents()`; on end parse `carry + decoder.decode()`; zero frames → `setReelLoad(null)`, false; else `frames = parsed`, `setReel({ name, title, durationMs: last.t, durationSim: last snapshot .time })`, `resetRun()`, `seekReel(firstSnapshot.t)`, `setPlaying(false)`, `setReelLoad(null)`, true. `seekReel(ms, { eventTailMs = 0 })`: clamp; walk frames with `t ≤ target` keeping the last of each `SEEK_STATE_TYPES` and, when `eventTailMs > 0`, the events with `t > target − eventTailMs`; dispatch state frames in `SEEK_STATE_TYPES` order, then the tail events, then `flushEvents()`; `cursor`, `elapsed`, `lastTick = performance.now()`. `playReel`/`pauseReel`/end-of-reel call `setPlaying` per "New interfaces". `step(now)`: as today (`elapsed += (now − lastTick) × speed`, dispatch `t ≤ elapsed`, `flushEvents()`), plus at the end `elapsed = durationMs` (so the scrubber lands on the total) then `pauseReel()`.
- [ ] **Step 4: Run to verify pass** — `npx vitest run lib/api` → all `lib/api` suites pass (dispatch, websocket, replay, client).
- [ ] **Step 5: Commit**

```bash
git add web/lib/api/replay.ts web/lib/api/replay.test.ts
git commit -m "feat(web): reel player with streaming JSONL parse, priming, seek tail and progress"
```

### Task 1.9: `SimApp` — connect on mount, pill and clock from selectors

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

- [ ] `cd /home/yks/Projects/luminar/web && npx tsc --noEmit && npm run lint && npx vitest run && npm run build` → green; `npx vitest run` reports every suite from Tasks 1.1–1.8 (`types format copy keys client store dispatch websocket replay`).
- [ ] `cd /home/yks/Projects/luminar && make check` → green (old `frontend/` and `backend/` untouched; `git status -- frontend backend` is clean).
- [ ] `grep -rn "useStore()" web/components web/app` → no output.
- [ ] `grep -rn "VITE_\|import.meta.env" web/lib web/components web/app` → no output.
- [ ] The browser walk of Task 1.9 Step 5 passed on the day the phase closes (record the backend commit SHA and the timestamps from step 5 in the PR description).

## Acceptance gate (spec §11, Phase 1, verbatim)

Checklist: `lib/types.ts`, `format.ts`, `api/client.ts` (env rename, `{ok,status,data}`),
`api/websocket.ts`, `api/replay.ts` (streaming parse), `lib/store.ts` (zustand, peer ids, toast
queue, beats), `lib/copy.ts`, `lib/keys.ts`; `SimApp` connects on mount, disconnects on
unmount, shows the connection pill and `simTime` from a selector.
Acceptance: against `make backend`, React DevTools profiler shows only the clock text node
re-rendering at 20 Hz; kill the backend → pill goes `OFFLINE`, reconnect backs off 1 s ×2 → 10 s;
restart → `LIVE`.

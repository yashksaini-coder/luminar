# UI Overhaul — Phase 4: reels, stage, hero Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pre-rendered `/reels/<name>/` routes that play the four recordings with no backend and no socket, `?t=`/`?peer=` moments and the share key, `data-stage` scaling by tokens (no `zoom`) with the renderer scale override, and the `data-hero` broadcast view with the 56 px lower-third ticker — ending in the spec's offline acceptance gate and the parity freeze.

**Architecture:** The reel page is `SimApp` in reel mode: a server page per manifest entry mounts the client shell with a `reel` prop, and one boot function (`bootSim`) decides whether the socket opens or a reel loads. Every reel/stage/hero behaviour that can be pure lives in `lib/` (`reels.ts`, `ticker.ts`, additions to `actions.ts`) and is vitest-tested; routes, CSS and the ticker component are accepted by scripted browser walks. Entering a reel always navigates to its route, so `/sim/` never holds a reel and the URL is the canonical link.

**Tech Stack:** Next 16.4.3 static export (`generateStaticParams`, `dynamicParams = false`), React 19.3.1, zustand 5.0.16, vitest (jsdom); browser walks with chrome-devtools MCP (or the documented manual sequence) against `cd web && npm run dev`, `python3 -m http.server`, and `make backend`.

**Spec:** `/home/yks/Projects/luminar/docs/superpowers/specs/2026-10-24-ui-overhaul-design.md` §4.8, §6.2 (toolbar pill, `.reel` dimming), §6.3, §6.4, §7 (loading states), §10, §11 Phase 4, §13.5. Contract: `/home/yks/Projects/luminar/docs/superpowers/plans/2026-10-24-ui-overhaul-interfaces.md` (A.10 replay, A.11 store, A.12 actions, A.13 prefs, A.24 routes). Parity rows: `docs/design/ui-inventory.md` §1 (connection pill, reels dropdown, `#app.reel` dimming), §2 (`1`–`9`, `0`, `s`, `t`, `h`), §3 (all URL params + prefs), §8.6 (hero ticker), §9 (stage, hero, persistence), §10 (every row). Source ported: `frontend/src/app.ts:246-290, 332-355, 565-580, 678-706, 740-786`, `frontend/src/ui/narrator.ts:117-160`.

## New interfaces introduced by this phase

Names not in the contract file; the assembler merges them under A.12/A.13/A.24.

| Name | File | Signature / shape |
|---|---|---|
| `REEL_MANIFEST` | `web/lib/reels.ts` | `export const REEL_MANIFEST: ReelManifest` — `import manifest from '@/public/reels/manifest.json'` (build-time, bundled, no runtime fetch; same build-time read the spec's `generateStaticParams … with fs` intends, one source for the page, the redirect and keys `1`–`9`) |
| `reelHref` | `web/lib/reels.ts` | `export function reelHref(name: string, q?: URLSearchParams): string` → `/reels/${name}/` + `?${q}` when `q` non-empty |
| `liveHref` | `web/lib/reels.ts` | `export function liveHref(q?: URLSearchParams): string` → `/sim/` + query |
| `carryParams` | `web/lib/reels.ts` | `export function carryParams(search: string, keys: readonly string[] = CARRY_KEYS): URLSearchParams` — keeps `keys` in that order, drops the rest; `export const CARRY_KEYS = ['theme', 'hero', 't', 'peer'] as const` |
| `redirectTarget` | `web/lib/reels.ts` | `export function redirectTarget(search: string, names: readonly string[] = REEL_MANIFEST.map(r => r.name)): string \| null` — `?reel=<known>` → `reelHref(name, carryParams(search))`; no `reel` or unknown name → `null` |
| `loadLabel` | `web/lib/reels.ts` | `export function loadLabel(p: { loaded: number; total: number } \| null): string` — `'2.1 / 3.5 MB · 60%'`; `total` 0 → `'2.1 MB'`; `null` → `''` |
| `SimAppProps` / `SimShell` | `web/components/sim/SimApp.tsx`, `web/components/sim/SimShell.tsx` | `export interface SimAppProps { reel?: ReelMeta \| null }`; `SimShell` is `'use client'`, `dynamic(() => import('@/components/sim/SimApp'), { ssr: false })`, same props. If phase 3 already has the client wrapper for `/sim/page.tsx` under another name, rename it to `SimShell` and add the prop |
| `ReelRedirect` | `web/components/sim/ReelRedirect.tsx` | `'use client'`; `useEffect` → `const to = redirectTarget(location.search); if (to) location.replace(to)`; renders `null`. No `useSearchParams`, so no `<Suspense>` |
| `ReelProgress` | `web/components/sim/ReelProgress.tsx` | `export default function ReelProgress(props: { title: string }): JSX.Element \| null` — reads `reelLoad`; 12 px bar whose fill is `background: var(--dither-50)` and `width: pct%`; label `REEL · ${title} · ${loadLabel(p)}`; `role="progressbar"` with `aria-valuenow`; null when `reelLoad` is null |
| `Ticker` + `tickerCells` | `web/components/sim/Ticker.tsx`, `web/lib/ticker.ts` | `export interface TickerCell { key: string; value: string; danger?: boolean }`; `export function tickerCells(s: AppState): TickerCell[]` (pure; 8 cells) |
| `bootSim` / `teardownSim` | `web/lib/actions.ts` | `export interface BootOpts { reel: ReelMeta \| null; search: string }`; `export async function bootSim(o: BootOpts): Promise<void>`; `export function teardownSim(): void` |
| `openReel` | `web/lib/actions.ts` | `export function openReel(name: string): void` → `location.assign(reelHref(name, carryParams(location.search, ['theme', 'hero'])))` |
| `initUrlMoment` / `initAutoGeo` | `web/lib/actions.ts` | `export function initUrlMoment(): () => void` (store subscription on `selectedPeer`, `playing` → `syncUrlMoment()`); `export function initAutoGeo(): () => void` (subscription on `[mainnet?.enabled, geoAvailable]` → `maybeAutoGeo()`; `enabled` falling → `geoAutoDone = false`) |
| `--strip-bottom` | `web/app/globals.css` base rules | `:root { --strip-bottom: 36px } :root[data-hero="1"] { --strip-bottom: 60px; --t-narr: 24px }`; CommandStrip uses `bottom: var(--strip-bottom)` |
| `data-hero-hide` | attribute | `:root[data-hero="1"] [data-hero-hide], :root[data-hero="1"] [role="tooltip"] { display: none }`; set on StatsRail, LogRail/Inspector wrapper, Legend, kbd hint row |

Amendments to contract names (same signature, added behaviour): `enterReel(meta)` sets a provisional `setReel({ name, title, durationMs: 0, durationSim: 0 })` before `loadReel`, passes an `AbortSignal`, and returns `false` without calling `exitReel()` when that signal aborted; `exitReel()` on a `/reels/` path navigates to `liveHref(carryParams(location.search, ['theme','hero']))`; `runKey('reel', i)` → `openReel(REEL_MANIFEST[i].name)` (no-op past the last), `runKey('backToLive')` → `exitReel()`; the `manifest` parameter of `runKey` is kept and defaults to `REEL_MANIFEST`.

## Global Constraints

- Backend untouched; no new API, no new socket, reels not grown, re-encoded or gzipped (spec §2, §6.4).
- Offline reels: `/reels/<name>/` from a static file server, socket never opened, every panel populated from the recording (spec §2 anti-goals, §6.4).
- Routes and params exactly as spec §4.8: `/?reel=` and `/sim/?reel=` client-redirect to `/reels/<n>/` carrying `theme`, `hero`, `t`, `peer`; `/reels/<name>/` takes `theme`, `hero`, `t` (sim seconds), `peer`; share copies `/reels/<n>/?t=…&peer=…`.
- Prefs `{stageTheme, hero}` in `localStorage['luminar.prefs']`; URL wins on load (spec §4.8, inventory §3).
- Stage scales by tokens only (`:root[data-stage="1"]` in `tokens.css`): `--t-ui 16 · --t-label 13 · --t-body 13.5 · --t-narr 24 · --row-h 26 · --cell-final 4 · --cell-mesh 3 · --cell-ui 5`, `--fg-3` → `paper-1`, `--hair` → `hair-strong`, `--link-mesh` .75; no CSS `zoom` anywhere (spec §5, §6.3, inventory §9).
- Renderer stage scale `{ node: 1.4, particle: 1.8, edgeAlpha: 1.6 }`, labels 12 px (spec §6.3; `STAGE_SCALE` A.11).
- Hero: both rails, legend, tooltip, kbd row hidden; strip above a 56 px ticker (`--ticker-h`); ticker numbers at `--t-hero-n`; ticker `aria-live="off"`, caption stays `polite` (spec §6.3, §10).
- Reel guards: recorded `SimulationStateChanged` and snapshot `state/speed` ignored; scenario/fault/preset/MAINNET refused with toast `Press 0 to leave the reel first` (spec §6.4, `copy.REEL_GUARD`).
- Provenance sentence verbatim from `copy.PROVENANCE`; the real reel's kicker is `RECORDED MAINNET` and the lag cell reads `recorded` (spec §2, inventory §1 MAINNET badge, today's `app.ts:604-607`).
- Loading dither: reel progress is a widening `--dither-50` fill, and a dithered bar is ≥ 12 px tall (spec §7).
- Commits `type(web): message`; every task ends with `cd web && npx tsc --noEmit && npm run lint && npx vitest run` green; the phase ends with `npm run build` and `make check` green (spec §11, §12).

## Review Focus

1. **Priming snapshot before `setReel`**: `loadReel` dispatches the first snapshot while `store.reel` is still null, so the recording's `state: 'running'` would set `playing = true` with nothing playing and the pill would read `OFFLINE` for the whole 7 MB load — `enterReel` sets a provisional reel first; test in Task 4.2.
2. **Unmount or `0` during the load**: the pending fetch must be aborted and the aborted `loadReel` must not trigger `exitReel()` (which would navigate away from a page the user already left or, worse, from the live page) — test in Task 4.2.
3. **`?peer=` names a node that exists only after the `?t=` seek** (`sybil-0` is absent from the first snapshot): `applyUrlMoment` applies `t` before `peer`, so `?t=12.4&peer=sybil-0` selects — test in Task 4.5.
4. **Prefs mirror vs moment params**: `persistPrefs` must not drop `?t`/`?peer`, and `syncUrlMoment` must not drop `theme`/`hero` — test in Task 4.5.
5. **Real reel: `telemetry_status` with `mainnet.enabled` lands before the snapshot that carries observers** (seek dispatch order edges → scenario → telemetry_status → snapshot): auto-Geo must wait for `geoAvailable`, and fire once — test in Task 4.6.

---

### Task 4.1: Reel assets and the manifest module

**Files:**
- Create: `web/public/reels/*.jsonl` + `manifest.json`, `web/public/geo/land-110m.json` (copied), `web/lib/reels.ts`
- Test: `web/lib/reels.test.ts`

**Interfaces:**
- Consumes: `ReelManifest`, `ReelMeta` (`@/lib/types`).
- Produces: `REEL_MANIFEST`, `CARRY_KEYS`, `carryParams`, `reelHref`, `liveHref`, `redirectTarget`, `loadLabel` (table above).

- [ ] **Step 1: Copy the assets**

Run: `cp -rn /home/yks/Projects/luminar/frontend/public/reels /home/yks/Projects/luminar/frontend/public/geo /home/yks/Projects/luminar/web/public/ && du -sh /home/yks/Projects/luminar/web/public/reels /home/yks/Projects/luminar/web/public/geo`
Expected: `17M reels`, `88K geo`; `git status` shows four `.jsonl`, `manifest.json`, `land-110m.json` as new (git stores the identical blobs once; no repository growth).

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
- Produces: `bootSim`, `teardownSim`, `openReel`, amended `enterReel`/`exitReel`/`runKey` (table above); `SimAppProps`.

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
- `bootSim({ reel, search })`: reel → `if (await enterReel(reel)) applyUrlMoment(new URLSearchParams(search))`; live → `ws.connect(); await fetchTopology(); applyUrlMoment(new URLSearchParams(search)); void fetchScenarios()`.
- `teardownSim()`: `loadAbort?.abort(); ws.disconnect(); unloadReel()`.
- `openReel(name)` and the `runKey` branches per the amendments.
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
- Create: `web/app/reels/[name]/page.tsx`, `web/components/sim/SimShell.tsx`, `web/components/sim/ReelProgress.tsx`, `web/components/sim/ReelProgress.module.css`
- Modify: `web/app/sim/page.tsx` (render `<SimShell />`), `web/components/sim/SimApp.tsx` (render `<ReelProgress title={reel.title} />` over the canvas when `reel` prop set)
- Test: browser walk (below) + build output check

**Interfaces:**
- Consumes: `REEL_MANIFEST`, `loadLabel` (4.1); `SimAppProps` (4.2); `useStore(s => s.reelLoad)` (A.11).
- Produces: `SimShell`, `ReelProgress` (table above); static pages `web/out/reels/<name>/index.html` ×4.

- [ ] **Step 1: Write `web/app/reels/[name]/page.tsx`**

```ts
export const dynamicParams = false
export function generateStaticParams() { return REEL_MANIFEST.map(r => ({ name: r.name })) }
export async function generateMetadata({ params }: { params: Promise<{ name: string }> }): Promise<Metadata>   // title `${meta.title} · Luminar`, description meta.blurb
export default async function ReelPage({ params }: { params: Promise<{ name: string }> })   // notFound() when unknown; <SimShell reel={meta} />
```

- [ ] **Step 2: Write `SimShell.tsx`, `ReelProgress.tsx` (+ module css)** per the interface table. Progress bar: container 320 px wide centred over the canvas, label row `--t-label` uppercase paper-2 above, track 12 px with `border: 1px solid var(--hair)`, fill `background: var(--dither-50); width: ${pct}%` (pct = `total ? loaded / total * 100 : 100`), `transition: width var(--d-fast)`. Point `web/app/sim/page.tsx` at `<SimShell />`.

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
git add web/app/reels web/app/sim/page.tsx web/components/sim/SimShell.tsx web/components/sim/ReelProgress.tsx web/components/sim/ReelProgress.module.css web/components/sim/SimApp.tsx
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

- [ ] **Step 1: Write `ReelRedirect.tsx`** per the table (`'use client'`, effect with `location.replace`, returns `null`). Mount it as the first child of `/` and `/sim/` pages. Change the two Menus handlers.

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
// prefs.test.ts
test('persistPrefs keeps ?t and ?peer', () => {
  history.replaceState(null, '', '/reels/sybil-eclipse/?t=12.4&peer=sybil-0')
  persistPrefs({ stageTheme: true, hero: false }); expect(location.search).toBe('?t=12.4&peer=sybil-0&theme=stage')
  persistPrefs({ stageTheme: false, hero: true }); expect(location.search).toBe('?t=12.4&peer=sybil-0&hero=1')
})
```

- [ ] **Step 2: Run to verify failure**

Run: `cd /home/yks/Projects/luminar/web && npx vitest run lib/actions.test.ts lib/prefs.test.ts`
Expected: FAIL — `initUrlMoment is not a function`; any ordering/param-dropping failure in the others is a real defect in Task 8's code — fix it in `actions.ts`/`prefs.ts`.

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
- Modify: `web/lib/actions.ts` (`initAutoGeo`), `web/components/sim/SimApp.tsx` (mount it), `web/components/sim/Provenance.tsx` (kicker `RECORDED MAINNET` + `recorded` when `reel` is set, if phase 3 left it live-only)
- Test: `web/lib/actions.test.ts` (append); browser walk

**Interfaces:**
- Consumes: `dispatchFrame`, `flushEvents` (A.8); `maybeAutoGeo`, `setLayoutMode` (A.11/A.12); `copy.PROVENANCE`.
- Produces: `initAutoGeo`.

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
Expected: FAIL — `initAutoGeo is not a function`.

- [ ] **Step 3: Implement `initAutoGeo()`** in `actions.ts`: `useStore.subscribe(s => [s.mainnet?.enabled ?? false, s.geoAvailable] as const, ([on, geo], [wasOn]) => { if (!on && wasOn) useStore.setState({ geoAutoDone: false }); if (on && geo) maybeAutoGeo() }, { equalityFn: shallow })`. Mount in `SimApp`'s effect with the other `init*` unsubscribes. Update `Provenance.tsx` so the kicker is `useStore(s => s.reel) ? 'RECORDED MAINNET' : 'LIVE MAINNET'` and the lag cell `recorded` vs `T−${lag_s ?? 156}s`; the trailing sentence is `copy.PROVENANCE` unchanged.

- [ ] **Step 4: Run to verify pass**

Run: `cd /home/yks/Projects/luminar/web && npx vitest run && npx tsc --noEmit && npm run lint`
Expected: all green.

- [ ] **Step 5: Browser walk (dev server, no backend)**

1. Open `http://localhost:3000/reels/mainnet-block-wave/`. Expect: after load the mode switcher reads `GEO` active, the dithered world land is drawn, only observer double rings are visible (no sim peers), and the provenance card top-left reads `RECORDED MAINNET` · `slot 15466393 · recorded · <n> observers · arrival at observer nodes, not mesh paths · data: ethPandaOps (CC BY 4.0)`.
2. Click `FORCE`: the card gains `· shown on the Geo layout`; press `Space` and play 10 s: no auto-switch back to Geo (once per feed-on).
3. Press `0` → `/sim/`: the provenance card is gone, `GEO` tab disabled with its reason tooltip.

- [ ] **Step 6: Commit**

```bash
git add web/lib/actions.ts web/lib/actions.test.ts web/components/sim/SimApp.tsx web/components/sim/Provenance.tsx
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

## Phase acceptance gate (spec §11 Phase 4, verbatim)

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

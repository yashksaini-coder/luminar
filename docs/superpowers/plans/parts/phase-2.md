# UI Overhaul — Phase 2: Canvas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render the live mesh in the Next app: the deck.gl renderer, the icon atlas with pre-dithered score halos, the full render table of spec §6.2, particles and pulses, the Geo land fill, the mode switcher, fitView and the tooltip, all reading one zustand store with no React re-render per frame.

**Architecture:** `components/map/renderer.ts` is a plain module (no React) that owns a `Deck` with an `OrthographicView`, subscribes to the store, lays nodes out with the frozen force layout from `layout.ts`, and draws every node, halo and particle as an `IconLayer` glyph taken from one procedurally drawn atlas (`atlas.ts`), so cells stay crisp at any zoom. `DeckCanvas.tsx` owns the `<canvas>` and the tooltip element and does nothing else. Pure maths (radius, Bézier, particle frame, atlas layout, halo cells, glyph choice, particle triggers) lives in small modules with vitest tests; deck.gl itself is accepted by a scripted browser walk against `make backend`.

**Tech Stack:** Next 16.4.3 / React 19.3.1 / TypeScript 5.9.3, zustand 5.0.16, `@deck.gl/core|layers|extensions` 9.4.0, `@luma.gl/core|webgl` 9.4.2, d3-force 3.0.0 (via `layout.ts`), culori 4.0.2 (via `palette.ts`), vitest + jsdom for unit tests, chrome-devtools MCP for the browser walks.

**Spec:** `/home/yks/Projects/luminar/docs/superpowers/specs/2026-10-24-ui-overhaul-design.md` §4.5, §5, §6.2 (Canvas, Render table), §7 ("On the deck.gl canvas"), §7.4, §10, §11 Phase 2. **Contract:** `/home/yks/Projects/luminar/docs/superpowers/plans/2026-10-24-ui-overhaul-interfaces.md` A.2, A.11, A.12, A.14–A.18, A.19 (`bayer`), A.20 (`RETICLE_CURSOR`). **Parity rows:** `docs/design/ui-inventory.md` §5 (all rows except `#ring-canvas` overlay, which is Drop) and §1 "Reduced motion". **Source being ported:** `frontend/src/map/renderer.ts`, `frontend/src/ui/mode-switcher.ts`, `frontend/src/app.ts:616-680`.

## New interfaces introduced by this phase

All **[plan]**; the assembler merges these into the contract. Nothing in A.14–A.18 is renamed.

```ts
// components/map/geometry.ts — pure, no DOM
export function nodeRadiusPx(n: number, mode: LayoutMode, nodeScale: number): number   // clamp(200/√n, 3, 8) × nodeScale, × 0.5 when mode !== 'force'
export function glyphScale(d: { state: NodeState }, selected: boolean): number         // 1 · ×1.5 selected · ×1.15 attacker (multiplicative)
export function bezierPoint(src: [number, number], tgt: [number, number], t: number): [number, number]   // bow left, min(18, len × .12)
export const PARTICLE_TRAVEL_MS = 800, PARTICLE_LIFETIME_MS = 1200, PARTICLE_CAP = 600, PULSE_CAP = 200, PULSE_MS = 800, FIZZLE_AT = 0.6, FIZZLE_ALPHA = 89
export function particleFrame(age: number, fizzle: boolean): { t: number; alpha: number } | null   // null when age > lifetime; ease-out; fizzle stalls at .6 and fades over the last 400 ms; alpha 0–255
export function pulseAlpha(age: number): number           // 56 × (1 − age/800), 0 after 800
export function breathe(now: number): number              // .475 + .275 × sin(2π now / 5600)  (.2 → .75)
export const OBSERVER_STATIC_ALPHA = 0.5                  // reduced motion [spec §10]

// components/map/atlas.ts (additions to A.16)
export interface GlyphBox { x: number; y: number; width: number; height: number; mask: boolean }
export function atlasLayout(nodePx: number, cellPx: number, dpr: number): { width: number; height: number; mapping: Record<GlyphId, GlyphBox> }   // pure; one row, 2 px gutters
export function haloCells(outerPx: number, innerPx: number, cellPx: number, density: number): [number, number][]   // pure; cell origins (centred box) with bayer(cx, cy) < density inside the annulus
export const HALO_OUTER = 1.7, HALO_INNER = 1.2           // × node radius [spec §6.2 "halo at 1.7 r"]; inner is plan
export function glyphFor(d: Pick<PeerNode, 'state' | 'connected_peers' | 'is_real' | 'is_telemetry'>): GlyphId   // attacker → pruned|attacker · real/telemetry → 'observer' · else state → GlyphId ('receiving' → 'disc')
export function atlasKey(nodePx: number, cellPx: number, dpr: number, paletteVersion: string): string

// components/map/renderer.ts (additions to A.17)
export const LAYER_IDS = ['world-land', 'edges', 'attack-links', 'mesh-edges', 'hover-edges', 'hover-peer-rings', 'pulses', 'particles', 'halos', 'nodes', 'observer-rings', 'reticle', 'event-highlight-edges', 'event-highlight-rings', 'labels'] as const
export function layerIds(): string[]                      // ids of the layers currently set on the deck, in order (tests, window.__luminar)
export function particlesFor(evt: AppEvent, pick: (ids: string[]) => string | undefined): { from: string; to: string; kind: ParticleKind; fizzle: boolean }[]   // pure trigger table [A.17 "Particle triggers"]
export function markDirty(): void                         // next rAF re-renders (store subscription + tests)
// window.__luminar = { store: useStore, fitView, viewState: getViewState, layerIds }   // debug handle, set by initRenderer

// components/sim/ModeSwitcher.tsx
export default function ModeSwitcher(): JSX.Element       // 'use client'; FORCE | RADIAL | GEO; Geo disabled with title GEO_DISABLED until geoAvailable
export const GEO_DISABLED = 'Geo needs real observers · turn MAINNET on'   // tooltip reason [spec §6.2 "disabled with reason"]

// components/sim/Tooltip.tsx
export default function Tooltip(): JSX.Element | null     // 'use client'; content from selectHoveredNode; null when nothing hovered
export function tooltipRows(node: PeerNode, mesh: Record<string, string[]>, nodeById: ReadonlyMap<string, PeerNode>): { head: { name: string; badge: string; id: string; alarm: boolean }; rows: [string, string, boolean][]; peers?: string[] }   // pure; third tuple = alarm tone

// components/dither/Reticle.tsx — built here (phase 5 reuses it); props per A.20
export const RETICLE_SVG: string                          // the 14 px glyph markup used by both the component and RETICLE_CURSOR
```

## Global Constraints

- Backend untouched; same WS/REST contracts (spec §3). `/api/sim/reconfigure {n_nodes}` ≤ 500 on the backend, UI offers `20 50 100 200` (spec §13.5).
- deck.gl **9.4.0** `core`, `layers`, `extensions`; luma.gl **9.4.2**; `@deck.gl/react` is not used (spec §4.5, §4.7). Builder re-runs `npm view @deck.gl/core version` before pinning and pins exact.
- Every colour on the canvas comes from `PAL` (`palette.ts`, tokens via culori), re-read on `data-stage`/`data-theme`; no literal colours in `renderer.ts` or `atlas.ts` except `PAPER`/`PITCH`/`FLAME` from `dither.ts` as fallbacks before tokens apply (spec §5).
- Render-table shapes are not the builder's to change (spec §12): every role = colour **and** shape; attackers, pruned diamonds, particles, pulses and the reticle are **never dithered**; halos are the only dithered thing on the canvas (spec §7).
- `--flame` only for attacker / fault / alarm (spec §2).
- Per-frame data (`nodePositions`, `nodeIndex`, particles, pulses, atlas, `topoKey`, land polygons) lives in `renderer.ts` module scope; the renderer writes to the store only through `selectPeer` and `hoverPeer`; no React component re-renders per frame (spec §4.4, §4.5).
- Reduced motion: particles and pulses off, observer ring static at .5, no `fitView` transition (spec §10). The store's `particlesEnabled` is already false at boot under reduced motion (A.11); the renderer additionally reads `reducedMotion()` from `lib/prefs.ts` for pulses and the ring.
- Mesh links drawn only for honest pairs and only when the backend sends them (absent above 100 nodes); the UI says so in the legend (phase 3) (spec §2 non-goals, §6.2).
- Geo draws only `is_real || is_telemetry` nodes; Force/Radial only sim peers; hidden nodes take no part in fit, selection, particles, pulses (inventory §5 "Visibility rule").
- Commit style `type(scope): message`, scope `web`.
- Every task ends with `cd /home/yks/Projects/luminar/web && npx tsc --noEmit && npm run lint && npx vitest run` green; `make check` at the repo root stays green for `frontend/` and `backend/`.

## Review Focus

1. **Snapshot with zero visible nodes in the current mode** (Force on a mainnet-only reel, or Geo right after observers vanish): `renderLayers` sets `layers: []` and `fitView` returns without touching the view; no NaN zoom, no exception — test in Task 2.4.
2. **StrictMode double mount** (React 19 dev runs effect → cleanup → effect): the second `initRenderer` must not leak a `Deck`, a rAF or a store subscription; `destroyRenderer` is idempotent — test in Task 2.4.
3. **A particle whose endpoint leaves the visible set mid-flight** (node preset shrinks, Geo switch, attacker pruned and re-indexed): the particle is dropped, never drawn at `[0,0]` or thrown on — test in Task 2.6.
4. **Atlas rebuild on `data-stage` toggle and on node-count bucket change**: glyph sizes follow `scale.node` and `nodeRadiusPx(n)`; a stale atlas would draw 20-node discs at 200 nodes — test in Task 2.3 (key) and Task 2.4 (rebuild triggered).
5. **Hover on a node that the next snapshot removes**: `hoveredPeer` points at a vanished id; `Tooltip` renders `null`, the renderer clears `hover-*` layers, nothing throws — test in Task 2.8.

---

## Prerequisites

- Phase 0 scaffold (`web/`, `app/globals.css` = tokens, fonts) and phase 1 (`lib/types.ts`, `lib/format.ts`, `lib/store.ts`, `lib/api/dispatch.ts`, `lib/actions.ts`, `lib/prefs.ts`, `components/sim/SimApp.tsx`) are merged.
- Interfaces-plan Task 9 (`components/map/layout.ts`, `components/map/palette.ts`) and Task 10 (`components/dither/dither.ts`) are merged. Check: `cd web && npx vitest run components/map components/dither` → PASS. If any of these files is missing, execute that task from the interfaces plan first; this plan does not redefine them.
- `web/public/geo/land-110m.json` exists (copy from `frontend/public/geo/` if phase 4 has not yet; the copy is part of Task 2.7 when missing).
- `@deck.gl/core`, `@deck.gl/layers`, `@deck.gl/extensions` 9.4.0 and `@luma.gl/core`, `@luma.gl/webgl` 9.4.2 are in `web/package.json` (phase 0 pinned them; if not, pin in Task 2.4 after `npm view`).
- Backend: `make backend` on `:8000` with `LUMINAR_ADMIN_TOKEN` unset (POSTs are gated only when it is set; `backend/main.py:176-184`). Web dev server: `make web` on `:3000`.

Browser walks below use chrome-devtools MCP tool names (`navigate_page`, `evaluate_script`, `take_screenshot`, `click`, `press_key`, `performance_start_trace`/`performance_stop_trace`, `emulate`); the same steps work by hand in Chrome DevTools.

---

### Task 2.1: Reticle glyph and cursor

**Files:**
- Create: `web/components/dither/Reticle.tsx`
- Test: `web/components/dither/Reticle.test.tsx`

**Interfaces:**
- Consumes: nothing.
- Produces: `RETICLE_CURSOR: string` (A.20), `RETICLE_SVG: string`, `Reticle(props: ReticleProps)` (A.20: `size?: number /* 14 */; className?: string; title?: string`).

- [ ] **Step 1: Write the failing test**

```tsx
import { renderToStaticMarkup } from 'react-dom/server'
import { Reticle, RETICLE_CURSOR, RETICLE_SVG } from '@/components/dither/Reticle'
test('reticle is a 14 px ring with four 4 px ticks, paper on a 1 px pitch outline', () => {
  const html = renderToStaticMarkup(<Reticle title="selected" />)
  expect(html).toContain('width="14"'); expect(html).toContain('height="14"')
  expect(html.match(/<line /g)).toHaveLength(4); expect(html.match(/<circle /g)).toHaveLength(2)   // ring + outline ring
  expect(html).toContain('<title>selected</title>')
  expect(html).not.toMatch(/#ff5a2c|flame/i)                                                      // never flame [spec §7.4.3]
})
test('RETICLE_CURSOR is a data-URI SVG cursor with hotspot 7 7 and a crosshair fallback', () => {
  expect(RETICLE_CURSOR.startsWith('url("data:image/svg+xml,')).toBe(true)
  expect(RETICLE_CURSOR.endsWith('") 7 7, crosshair')).toBe(true)
  expect(RETICLE_CURSOR).not.toContain('#')                                                       // colours percent-encoded
  expect(decodeURIComponent(RETICLE_CURSOR)).toContain(RETICLE_SVG.slice(0, 40))
})
```

- [ ] **Step 2: Run to verify failure**

Run: `cd /home/yks/Projects/luminar/web && npx vitest run components/dither/Reticle.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `components/dither/Reticle.tsx`**

`RETICLE_SVG`: a 14×14 `viewBox` with an outer `circle r=5.5 stroke=#0b0b0d stroke-width=3` (the 1 px pitch outline), an inner `circle r=5.5 stroke=#f2f2ef stroke-width=1`, and four `line`s of length 4 at N/E/S/W from r=5 to r=9 clipped to the box (`stroke=#f2f2ef stroke-width=1`). `Reticle` renders it as an inline `<svg width={size} height={size} role="img">` with an optional `<title>`. `RETICLE_CURSOR = \`url("data:image/svg+xml,${encodeURIComponent(RETICLE_SVG)}") 7 7, crosshair\``. Plain React, no `next/*` import (Remotion reuses it, spec §9).

- [ ] **Step 4: Run to verify pass**

Run: `cd /home/yks/Projects/luminar/web && npx vitest run components/dither/Reticle.test.tsx && npx tsc --noEmit`
Expected: PASS, tsc clean.

- [ ] **Step 5: Commit**

```bash
git add web/components/dither/Reticle.tsx web/components/dither/Reticle.test.tsx
git commit -m "feat(web): reticle glyph and SVG cursor for plates and the mesh canvas"
```

### Task 2.2: Geometry helpers (radius, Bézier, particle and pulse curves)

**Files:**
- Create: `web/components/map/geometry.ts`
- Test: `web/components/map/geometry.test.ts`

**Interfaces:**
- Consumes: `LayoutMode`, `NodeState` (A.2).
- Produces: the `geometry.ts` block under "New interfaces".

- [ ] **Step 1: Write the failing test**

```ts
test('nodeRadiusPx follows clamp(200/√n, 3, 8) × scale, halved off Force', () => {
  expect(nodeRadiusPx(20, 'force', 1)).toBe(8); expect(nodeRadiusPx(50, 'force', 1)).toBeCloseTo(5.657, 2)
  expect(nodeRadiusPx(200, 'force', 1)).toBeCloseTo(3, 5); expect(nodeRadiusPx(5000, 'force', 1)).toBe(3)
  expect(nodeRadiusPx(50, 'force', 1.4)).toBeCloseTo(7.92, 2); expect(nodeRadiusPx(50, 'radial', 1)).toBeCloseTo(2.828, 2)
})
test('glyphScale: selected ×1.5, attacker ×1.15, both multiply', () => {
  expect(glyphScale({ state: 'idle' }, false)).toBe(1); expect(glyphScale({ state: 'idle' }, true)).toBe(1.5)
  expect(glyphScale({ state: 'attacker' }, false)).toBe(1.15); expect(glyphScale({ state: 'attacker' }, true)).toBeCloseTo(1.725)
})
test('bezierPoint hits the endpoints and bows left of travel', () => {
  expect(bezierPoint([0, 0], [100, 0], 0)).toEqual([0, 0]); expect(bezierPoint([0, 0], [100, 0], 1)).toEqual([100, 0])
  expect(bezierPoint([0, 0], [100, 0], 0.5)[1]).toBeCloseTo(6)                   // bow = min(18, 100 × .12) = 12; midpoint offset = bow/2
  expect(bezierPoint([100, 0], [0, 0], 0.5)[1]).toBeCloseTo(-6)                  // A→B and B→A separate
})
test('particleFrame: ease-out travel over 800 ms, fizzle stalls at .6, null after lifetime', () => {
  expect(particleFrame(0, false)).toEqual({ t: 0, alpha: 242 })
  expect(particleFrame(800, false)!.t).toBe(1); expect(particleFrame(800, false)!.alpha).toBeCloseTo(121)
  expect(particleFrame(400, false)!.t).toBeCloseTo(0.75)
  expect(particleFrame(800, true)!.t).toBe(0.6); expect(particleFrame(800, true)!.alpha).toBeCloseTo(89); expect(particleFrame(1000, true)!.alpha).toBeCloseTo(44.5)
  expect(particleFrame(1201, false)).toBeNull()
})
test('pulseAlpha and breathe', () => {
  expect(pulseAlpha(0)).toBe(56); expect(pulseAlpha(400)).toBe(28); expect(pulseAlpha(900)).toBe(0)
  expect(breathe(0)).toBeCloseTo(0.475); expect(breathe(1400)).toBeCloseTo(0.75); expect(breathe(4200)).toBeCloseTo(0.2)
})
```

- [ ] **Step 2: Run to verify failure**

Run: `cd /home/yks/Projects/luminar/web && npx vitest run components/map/geometry.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `components/map/geometry.ts`** with the signatures and constants above (values ported from `frontend/src/map/renderer.ts:36-80, 234-262`; the non-fizzle alpha is `242 × (1 − progress × .5)`).

- [ ] **Step 4: Run to verify pass**

Run: `cd /home/yks/Projects/luminar/web && npx vitest run components/map/geometry.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/components/map/geometry.ts web/components/map/geometry.test.ts
git commit -m "feat(web): canvas geometry helpers (radius, bezier, particle and pulse curves)"
```

### Task 2.3: Icon atlas with pre-dithered score halos

**Files:**
- Create: `web/components/map/atlas.ts`
- Test: `web/components/map/atlas.test.ts`

**Interfaces:**
- Consumes: `bayer` (A.19), `BAND_DENSITY`, `scoreBand`, `PaletteKey`, `RGBA` (A.15), `PeerNode` (A.2).
- Produces: A.16 (`GlyphId`, `IconAtlas`, `buildAtlas`, `haloFor`) plus `GlyphBox`, `atlasLayout`, `haloCells`, `HALO_OUTER`, `HALO_INNER`, `glyphFor`, `atlasKey`.

- [ ] **Step 1: Write the failing tests** (pure parts only; `buildAtlas` needs a 2D context and is accepted in Task 2.5's walk)

```ts
test('atlasLayout places every GlyphId once, in one row, at dpr-scaled sizes with 2 px gutters', () => {
  const L = atlasLayout(10, 2, 2)
  const ids: GlyphId[] = ['disc', 'idle', 'origin', 'decoded', 'observer', 'joining', 'failed', 'error', 'attacker', 'pruned', 'reticle', 'square', 'squareTrail', 'halo-0', 'halo-1', 'halo-2', 'halo-3']
  expect(Object.keys(L.mapping).sort()).toEqual([...ids].sort())
  expect(L.mapping.disc.width).toBe(Math.ceil((10 + 2) * 2)); expect(L.mapping.disc.mask).toBe(false)
  expect(L.mapping.attacker.width).toBe(Math.ceil(10 * 1.15 * 2) + 4); expect(L.mapping.reticle.width).toBeGreaterThanOrEqual(Math.ceil(10 * 2 * 2))
  expect(L.mapping['halo-3'].width).toBe(Math.ceil(10 * 1.7 * 2) + 4); expect(L.mapping.square.width).toBe(2 * 2 * 2)
  const boxes = Object.values(L.mapping).sort((a, b) => a.x - b.x)
  for (let i = 1; i < boxes.length; i++) expect(boxes[i].x).toBeGreaterThanOrEqual(boxes[i - 1].x + boxes[i - 1].width + 2)
  expect(L.width).toBe(boxes.at(-1)!.x + boxes.at(-1)!.width); expect(L.height).toBe(Math.max(...boxes.map(b => b.height)))
})
test('haloCells fills the annulus at the band density with Bayer, never inside the inner radius', () => {
  const all = haloCells(34, 24, 2, 1)                     // r_out 34, r_in 24 (nodePx 20 × 1.7 / 1.2), 2 px cells
  for (const [x, y] of all) { const d = Math.hypot(x + 1 - 34, y + 1 - 34); expect(d).toBeLessThanOrEqual(34 + 1.5); expect(d).toBeGreaterThanOrEqual(24 - 1.5) }
  const ratio = (dens: number) => haloCells(34, 24, 2, dens).length / all.length
  expect(ratio(0.12)).toBeGreaterThan(0.08); expect(ratio(0.12)).toBeLessThan(0.16)
  expect(ratio(0.35)).toBeGreaterThan(0.30); expect(ratio(0.35)).toBeLessThan(0.40)
  expect(ratio(0.65)).toBeGreaterThan(0.60); expect(ratio(0.65)).toBeLessThan(0.70)
  expect(haloCells(34, 24, 2, 0.35)).toEqual(haloCells(34, 24, 2, 0.35))        // pure: no shimmer between frames
})
test('haloFor and glyphFor follow the render table', () => {
  expect([-1, 0, 2, 6].map(haloFor)).toEqual(['halo-0', 'halo-1', 'halo-2', 'halo-3'])
  const g = (p: Partial<PeerNode>) => glyphFor({ state: 'receiving', connected_peers: [], ...p })
  expect(g({})).toBe('disc'); expect(g({ state: 'idle' })).toBe('idle'); expect(g({ state: 'origin' })).toBe('origin'); expect(g({ state: 'decoded' })).toBe('decoded')
  expect(g({ state: 'joining' })).toBe('joining'); expect(g({ state: 'failed' })).toBe('failed'); expect(g({ state: 'error' })).toBe('error')
  expect(g({ state: 'attacker', connected_peers: ['peer-1'] })).toBe('attacker'); expect(g({ state: 'attacker', connected_peers: [] })).toBe('pruned')
  expect(g({ is_real: true })).toBe('observer'); expect(g({ is_telemetry: true, state: 'decoded' })).toBe('observer')
})
test('atlasKey changes with any input', () => { expect(atlasKey(10, 2, 2, 'dark|')).not.toBe(atlasKey(10, 3, 2, 'dark|1')); expect(atlasKey(10, 2, 2, 'a')).toBe(atlasKey(10, 2, 2, 'a')) })
```

- [ ] **Step 2: Run to verify failure**

Run: `cd /home/yks/Projects/luminar/web && npx vitest run components/map/atlas.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `components/map/atlas.ts`**

Glyph boxes (CSS px before `× dpr`, +4 px padding on glyphs with strokes outside the disc): `disc idle origin decoded joining failed error` = `nodePx + 2`; `decoded` = `nodePx × 1.6 + 2` (ring at 1.6 r); `observer` = `nodePx × 2.0 + 2` (double ring at 1.6 r and 1.9 r); `attacker`/`pruned` = `nodePx × 1.15 + 4`; `reticle` = `nodePx × 2 + 8` (ring at 2 r, 2 px, four 4 px ticks); `square` = `2 × cellPx`, `squareTrail` = `3 × cellPx` wide (trailing cell at half alpha); `halo-*` = `nodePx × HALO_OUTER + 4`. `buildAtlas` draws each glyph with `CanvasRenderingContext2D` at `dpr` scale (`imageSmoothingEnabled = false` for cells): colours from `pal` (`paper0` disc + 1 px rim; `idle` = `pitch4` fill + 1 px `paper3` rim; `origin` = disc + `pitch4` centre dot r/3; `decoded` = disc + 1 px `signal` ring at 1.6 r; `observer` = two 1 px `signal` rings, no fill; `joining` = 1 px `paper1` hollow; `failed` = `paper3` disc with an X in `pitch0`; `error` = same in `flameDim`; `attacker` = `flame` rhombus with 45° hatch lines `pitch0` at .55 every 3 px; `pruned` = 1 px dashed `paper3` rhombus; `reticle` = `paper0`; `square`/`squareTrail` = `paper0` (the layer tints per kind via `getColor`, so `mask: true` for the squares only); `halo-0` = `haloCells(..., BAND_DENSITY[0])` in `flame`; `halo-1..3` in `paper0` at `BAND_DENSITY[1..3]`). `atlasKey` = `${nodePx}|${cellPx}|${dpr}|${paletteVersion}`. `haloFor(score) = \`halo-${scoreBand(score)}\``. Never dither anything but the halos.

- [ ] **Step 4: Run to verify pass**

Run: `cd /home/yks/Projects/luminar/web && npx vitest run components/map/atlas.test.ts && npx tsc --noEmit`
Expected: PASS, tsc clean.

- [ ] **Step 5: Commit**

```bash
git add web/components/map/atlas.ts web/components/map/atlas.test.ts
git commit -m "feat(web): procedural icon atlas with Bayer score halos for the mesh canvas"
```

### Task 2.4: Renderer core, DeckCanvas, layout wiring, fitView

**Files:**
- Create: `web/components/map/renderer.ts`, `web/components/map/DeckCanvas.tsx`, `web/components/map/DeckCanvas.module.css`
- Modify: `web/components/sim/SimApp.tsx` (mount `<DeckCanvas/>` in the canvas slot via `next/dynamic(..., { ssr: false })`), `web/lib/actions.ts` (`runKey('fitView')` → `renderer.fitView()`; `resetTopology`/`visiblePositions` now import the real module — remove any phase-1 stub)
- Test: `web/components/map/renderer.test.ts`, `web/components/map/DeckCanvas.test.tsx`

**Interfaces:**
- Consumes: `useStore`, selectors (A.11); `computeLayout`, `topologyKey`, `attackerLayoutEdges`, `isNodeVisible`, `WORLD_BOUNDS`, `resetLayoutMemory` (A.14); `PAL`, `refreshPalette`, `withAlpha` (A.15); `buildAtlas`, `glyphFor`, `atlasKey` (2.3); `nodeRadiusPx`, `glyphScale` (2.2); `RETICLE_CURSOR` (2.1); `reducedMotion` (A.13).
- Produces: A.17 `initRenderer`, `destroyRenderer`, `resizeRenderer`, `renderLayers`, `fitView`, `visiblePositions`, `resetTopology`, `getViewState`; `LAYER_IDS`, `layerIds`, `markDirty`; A.18 `DeckCanvas`. (`spawnParticle` lands in 2.6.)

- [ ] **Step 1: Write the failing tests** (`vi.mock('@deck.gl/core', ...)` with a `FakeDeck` class recording `props` from the constructor and every `setProps`, exposing `finalize = vi.fn()`; `vi.mock('@/components/map/atlas', ...)` returning `buildAtlas: () => ({ image: document.createElement('canvas'), mapping: {...every GlyphId: {x:0,y:0,width:8,height:8,mask:false}}, nodePx: 8, cellPx: 2 })` plus the real `glyphFor`/`haloFor`/`atlasKey`; fixtures `peers(n)` / `ring(n)` from the interfaces plan Task 9; `beforeEach`: reset store, `resetLayoutMemory()`, `destroyRenderer()`)

```ts
const mount = () => { const c = document.createElement('canvas'); const p = document.createElement('div'); p.appendChild(c); document.body.appendChild(p); initRenderer(c, null); return c }
const flush = () => { vi.advanceTimersByTime(20) }   // one rAF (fake timers drive requestAnimationFrame)
test('init is StrictMode-safe and destroy is idempotent', () => {
  mount(); mount(); expect(FakeDeck.instances).toHaveLength(2); expect(FakeDeck.instances[0].finalize).toHaveBeenCalledTimes(1)
  destroyRenderer(); destroyRenderer(); expect(FakeDeck.instances[1].finalize).toHaveBeenCalledTimes(1)
  useStore.getState().applySnapshot(snapWith(['peer-0'])); flush(); expect(FakeDeck.instances[1].setPropsCalls.filter(p => p.layers)).toHaveLength(0)   // no render after destroy
})
test('deck is created with an OrthographicView, controller, reticle cursor, and empty-click deselects', () => {
  mount(); const d = FakeDeck.instances[0]
  expect(d.props.controller).toBe(true); expect(d.props.getCursor({ isHovering: false })).toBe(RETICLE_CURSOR); expect(d.props.getCursor({ isHovering: true })).toBe('pointer')
  useStore.getState().selectPeer('peer-1'); d.props.onClick({ picked: false }); expect(useStore.getState().selectedPeer).toBeNull()
})
test('snapshot + edges lay out once and emit the pinned layer order with nodes pickable', () => {
  mount(); useStore.getState().applyEdges({ type: 'edges', edges: ring(10) }); useStore.getState().applySnapshot(snapWith(peers(10).map(p => p.peer_id))); flush()
  const ids = layerIds(); expect(ids).toEqual(['edges', 'mesh-edges', 'nodes'].filter(id => ids.includes(id)))   // subset of LAYER_IDS, in LAYER_IDS order
  expect(ids).toContain('nodes'); expect(ids).toContain('edges'); expect(ids.indexOf('edges')).toBeLessThan(ids.indexOf('nodes'))
  const nodes = FakeDeck.instances[0].lastLayer('nodes'); expect(nodes.props.pickable).toBe(true); expect(nodes.props.sizeUnits).toBe('pixels'); expect(nodes.props.data).toHaveLength(10)
  expect([...visiblePositions().keys()]).toHaveLength(10); expect([...visiblePositions().values()].every(([x, y]) => Number.isFinite(x) && Number.isFinite(y))).toBe(true)
  expect(performance.getEntriesByName('layout').length).toBeGreaterThanOrEqual(1)
})
test('state-only snapshots never relayout; a changed edge set relayouts once', () => {
  mount(); useStore.getState().applyEdges({ type: 'edges', edges: ring(10) }); useStore.getState().applySnapshot(snapWith(peers(10).map(p => p.peer_id))); flush()
  const before = performance.getEntriesByName('layout').length; const pos = [...visiblePositions().values()]
  useStore.getState().applySnapshot({ ...snapWith(peers(10).map(p => p.peer_id)), nodes: peers(10).map(p => ({ ...p, state: 'decoded' as const })) }); flush()
  expect(performance.getEntriesByName('layout').length).toBe(before); expect([...visiblePositions().values()]).toEqual(pos)
  useStore.getState().applyEdges({ type: 'edges', edges: ring(10).slice(1) }); flush(); expect(performance.getEntriesByName('layout').length).toBe(before + 1)
})
test('showEdges off removes edges; mesh pairs are deduped and honest-only', () => {
  mount(); useStore.getState().applyEdges({ type: 'edges', edges: ring(6) })
  useStore.getState().applySnapshot({ ...snapWith([...peers(6).map(p => p.peer_id), 'sybil-0']), gossip: { mesh: { 'peer-0': ['peer-1', 'sybil-0'], 'peer-1': ['peer-0'] } } }); flush()
  expect(FakeDeck.instances[0].lastLayer('mesh-edges').props.data).toHaveLength(1)
  useStore.getState().setDisplay({ showEdges: false }); flush(); expect(layerIds()).not.toContain('edges'); expect(layerIds()).not.toContain('mesh-edges')
})
test('geo draws only real nodes; empty visible set yields no layers and fitView is a no-op', () => {
  mount(); useStore.getState().applySnapshot(snapWith(peers(5).map(p => p.peer_id))); useStore.getState().setLayoutMode('geo'); flush()   // no real nodes → store keeps force
  useStore.setState({ geoAvailable: true }); useStore.getState().setLayoutMode('geo'); flush()
  expect(layerIds()).toEqual([]); const calls = FakeDeck.instances[0].setPropsCalls.length; fitView(); expect(FakeDeck.instances[0].setPropsCalls.length).toBe(calls)
  useStore.getState().applySnapshot({ ...snapWith(['obs-1']), nodes: [{ ...peers(1)[0], peer_id: 'obs-1', is_real: true, x: 10, y: -25 }] }); flush()
  expect(FakeDeck.instances[0].lastLayer('nodes').props.data).toHaveLength(1)
  fitView(); const vs = FakeDeck.instances[0].setPropsCalls.at(-1)!.initialViewState; expect(vs.target).toEqual([0, (WORLD_BOUNDS.minY + WORLD_BOUNDS.maxY) / 2, 0]); expect(vs.zoom).toBeLessThanOrEqual(4); expect(vs.transitionDuration).toBe(500)
})
test('fitView pads 80 px, caps zoom at 4 and is called on the rAF after a relayout', () => {
  const c = mount(); Object.defineProperty(c.parentElement!, 'clientWidth', { value: 800 }); Object.defineProperty(c.parentElement!, 'clientHeight', { value: 600 }); resizeRenderer(800, 600)
  useStore.getState().applyEdges({ type: 'edges', edges: ring(2) }); useStore.getState().applySnapshot(snapWith(['peer-0', 'peer-1'])); flush(); flush()
  const vs = FakeDeck.instances[0].setPropsCalls.filter(p => p.initialViewState).at(-1)!.initialViewState; expect(vs.zoom).toBe(4)   // two nodes → tiny bbox → capped
})
test('atlas is rebuilt when data-stage flips or the node-count bucket changes', () => {
  mount(); useStore.getState().applySnapshot(snapWith(peers(20).map(p => p.peer_id))); flush(); const n0 = buildAtlasMock.mock.calls.length
  useStore.getState().applySnapshot(snapWith(peers(20).map(p => p.peer_id))); flush(); expect(buildAtlasMock.mock.calls.length).toBe(n0)
  useStore.getState().setPref('stageTheme', true); document.documentElement.dataset.stage = '1'; flush(); expect(buildAtlasMock.mock.calls.length).toBe(n0 + 1)
  useStore.getState().applySnapshot(snapWith(peers(200).map(p => p.peer_id))); flush(); expect(buildAtlasMock.mock.calls.length).toBe(n0 + 2)
})
// DeckCanvas.test.tsx — renderToStaticMarkup only (effects do not run server-side)
test('DeckCanvas renders a canvas and a tooltip host', () => {
  const html = renderToStaticMarkup(<DeckCanvas className="x" />)
  expect(html).toContain('<canvas'); expect(html).toContain('role="tooltip"'); expect(html).toContain('class="x')
})
```

- [ ] **Step 2: Run to verify failure**

Run: `cd /home/yks/Projects/luminar/web && npx vitest run components/map/renderer.test.ts components/map/DeckCanvas.test.tsx`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement `components/map/renderer.ts` (core)**

Module scope: `deck`, `tooltipEl`, `nodePositions: [number, number][]`, `nodeIndex: Map<string, number>`, `topoKey = ''`, `atlas: IconAtlas | null`, `atlasK = ''`, `fontsReady`, `dirty`, `raf`, `unsubStore`, `fitPending`, `W/H`. `initRenderer(canvas, tooltipEl)`: if a deck exists, `destroyRenderer()` first (StrictMode); `refreshPalette()`; `new Deck({ canvas, views: new OrthographicView({ flipY: false }), initialViewState: { target: [0, 0, 0], zoom: 0 }, controller: true, layers: [], getCursor: ({ isHovering }) => isHovering ? 'pointer' : RETICLE_CURSOR, onClick: info => { if (!info.picked) useStore.getState().selectPeer(null) }, width, height })`; `document.fonts?.load('500 10px "IBM Plex Mono"')` then `fontsReady = true; markDirty()`; `unsubStore = useStore.subscribe(markDirty)`; start the rAF loop; `window.__luminar = { store: useStore, fitView, viewState: getViewState, layerIds }`. rAF loop: `if (dirty || animating()) renderLayers()`; `animating()` is false until 2.6 adds particles/pulses/observers. `renderLayers()`: read `useStore.getState()`; `refreshPalette()`; compute `key = topologyKey(layoutMode, nodes, edges)`; when `key !== topoKey`: `performance.mark('layout:start')`, `computeLayout(layoutMode, nodes, [...edges, ...attackerLayoutEdges(nodes)], key)`, `performance.measure('layout', 'layout:start')`, rebuild `nodeIndex`, `topoKey = key`, `fitPending = true`; ensure the atlas (`nodePx = 2 × nodeRadiusPx(visibleCount, layoutMode, scale.node)`, `cellPx` = computed `--cell-mesh` (2; 3 in stage), `dpr = min(devicePixelRatio, 2)`, `paletteVersion = \`${data-theme}|${data-stage}\``; rebuild when `atlasKey(...)` differs); build layers in `LAYER_IDS` order (this task: `edges` as a `PathLayer` + `PathStyleExtension({ dash: true, highPrecisionDash: true })`, `getDashArray: [1, 3]`, `widthUnits: 'pixels'`, width 1, colour `PAL.linkTopology` × `scale.edgeAlpha` (× .4 off Force); `mesh-edges` as a `LineLayer`, `PAL.linkMesh`, 1 px, honest pairs deduped undirected; `nodes` as an `IconLayer({ iconAtlas: atlas.image, iconMapping: atlas.mapping, sizeUnits: 'pixels', getIcon: d => glyphFor(d), getSize: d => atlas.mapping[glyphFor(d)].height / dpr × glyphScale(d, d.peer_id === selectedPeer), getPosition, pickable: true, onClick: info → selectPeer(toggle), onHover: info → hoverPeer(id | null) + tooltip placement (2.8), updateTriggers })`); when no node is visible: `deck.setProps({ layers: [] })` and return; if `fitPending`, call `fitView()` on the next rAF. `fitView({ durationMs = reducedMotion() ? 0 : 500 })`: bbox of visible positions (or `WORLD_BOUNDS` in geo), return when empty, `pad 80`, `zoom = min(4, log2(min((W − 160)/dx, (H − 160)/dy)))`, `setProps({ initialViewState: { target, zoom, transitionDuration } })`. `resizeRenderer(w, h)` stores `W/H` and `setProps({ width, height })`. `destroyRenderer()`: cancel rAF, unsubscribe, `deck?.finalize()`, null everything; safe to call twice. `resetTopology()`: `topoKey = ''; resetLayoutMemory(); markDirty()`. `visiblePositions()`: `Map` of visible ids → position. `layerIds()`: ids of the last `layers` array passed to `setProps`. `getViewState()`: as today (`renderer.ts:483-486`).

- [ ] **Step 4: Implement `components/map/DeckCanvas.tsx` and mount it**

`'use client'`; `useRef<HTMLCanvasElement>` and `useRef<HTMLDivElement>` for the tooltip host; `useEffect(() => { initRenderer(canvas, tip); const ro = new ResizeObserver(([e]) => resizeRenderer(e.contentRect.width, e.contentRect.height)); ro.observe(canvas.parentElement!); return () => { ro.disconnect(); destroyRenderer() } }, [])`; renders `<div className={styles.field}><canvas className={styles.canvas}/><div ref={tip} role="tooltip" className={styles.tip}><Tooltip/></div></div>` (`Tooltip` is a stub returning `null` until 2.8). `DeckCanvas.module.css`: `.field { position: relative; inset: 0; background: var(--bg); cursor: var(--reticle-cursor, crosshair) }`, `.canvas { position: absolute; inset: 0; width: 100%; height: 100% }`, `.tip { position: absolute; left: 0; top: 0; pointer-events: none; display: none } .tip[data-show="1"] { display: block } :root[data-hero="1"] .tip { display: none !important }`. In `SimApp.tsx` import with `const DeckCanvas = dynamic(() => import('@/components/map/DeckCanvas'), { ssr: false })` and place it in the canvas slot. In `lib/actions.ts`, `runKey('fitView')` calls `fitView()` from `@/components/map/renderer`.

- [ ] **Step 5: Run to verify pass**

Run: `cd /home/yks/Projects/luminar/web && npx vitest run components/map lib && npx tsc --noEmit && npm run lint`
Expected: PASS (phase-1 `actions.test.ts` still passes with its renderer mock), tsc and lint clean.

- [ ] **Step 6: Browser walk — the live mesh renders (the cut-rule milestone)**

1. `make backend` (terminal 1), `make web` (terminal 2). `navigate_page` → `http://localhost:3000/sim/`.
2. Expect: within 1 s of `LIVE` in the pill, paper discs on a near-black field joined by faint dotted edges; no console errors (`list_console_messages` → none at `error` level).
3. `evaluate_script`: `window.__luminar.layerIds()` → an array that is a subsequence of `LAYER_IDS` and contains `'edges'`, `'nodes'` (and `'mesh-edges'` once the first message has built a mesh).
4. Drag the canvas → pans; wheel → zooms; node discs stay the same pixel size (`sizeUnits: 'pixels'`) and edges scale. The pointer over the empty field is the reticle (14 px ring with ticks); over a disc it is the hand.
5. `press_key` `f` → the view animates back to the fitted mesh in ~500 ms. `evaluate_script`: `window.__luminar.viewState().zoom <= 4` → `true`.
6. `curl -s -X POST localhost:8000/api/sim/reconfigure -H 'Content-Type: application/json' -d '{"n_nodes":50}'` → the mesh relays out cold once and refits; `evaluate_script`: `performance.getEntriesByName('layout').length` increased by exactly 1 (a second snapshot with the same edges does not add another).
7. Toggle React StrictMode is on by default in dev: `evaluate_script` → `document.querySelectorAll('canvas').length === 1` and `window.__luminar.layerIds().length > 0` (the second mount owns the deck).
8. React DevTools profiler (or `evaluate_script` wrapping `console.count` in `DeckCanvas`'s render): `DeckCanvas` renders once; the 20 Hz snapshots cause no component render.

- [ ] **Step 7: Commit**

```bash
git add web/components/map/renderer.ts web/components/map/DeckCanvas.tsx web/components/map/DeckCanvas.module.css web/components/map/renderer.test.ts web/components/map/DeckCanvas.test.tsx web/components/sim/SimApp.tsx web/lib/actions.ts
git commit -m "feat(web): deck.gl renderer core with DeckCanvas, frozen layout wiring and fitView"
```

### Task 2.5: Full render table — states, halos, attackers, rings, reticle, hover, highlight, labels

**Files:**
- Modify: `web/components/map/renderer.ts` (layers `attack-links`, `hover-edges`, `hover-peer-rings`, `halos`, `observer-rings`, `reticle`, `event-highlight-edges`, `event-highlight-rings`, `labels`)
- Test: `web/components/map/renderer.test.ts` (append)

**Interfaces:**
- Consumes: `haloFor`, `glyphFor` (2.3), `breathe`, `OBSERVER_STATIC_ALPHA` (2.2), `shortName`, `isAttackerId`, `isPruned` (A.3), `PAL` keys `linkAttack linkHighlight paper1 paper0 flame paper3 flameDim nodeSelected ringTelemetry` (A.15), `reducedMotion` (A.13).
- Produces: every layer of `LAYER_IDS` except `world-land`, `pulses`, `particles`.

- [ ] **Step 1: Write the failing tests** (append to `renderer.test.ts`; fixtures: `grafted = { ...peers(1)[0], peer_id: 'sybil-0', index: 50, state: 'attacker', connected_peers: ['peer-1', 'peer-2'], gossip_score: -0.3 }`, `pruned = { ...grafted, peer_id: 'sybil-1', connected_peers: [], last_targets: ['peer-3'] }`)

```ts
test('glyphs per state; halos only on participating honest peers, band from gossip_score', () => {
  mount(); const nodes = [...peers(6).map((p, i) => ({ ...p, state: (['idle', 'origin', 'receiving', 'decoded', 'joining', 'failed'] as const)[i], gossip_score: [0, 1, 3, 7, 0, 0][i] })), grafted, pruned]
  useStore.getState().applyEdges({ type: 'edges', edges: ring(6) }); useStore.getState().applySnapshot({ ...snapWith(nodes.map(n => n.peer_id)), nodes }); flush()
  const nl = FakeDeck.instances[0].lastLayer('nodes'); expect(nl.props.data.map((d: PeerNode) => nl.props.getIcon(d))).toEqual(['idle', 'origin', 'disc', 'decoded', 'joining', 'failed', 'attacker', 'pruned'])
  const halos = FakeDeck.instances[0].lastLayer('halos'); expect(halos.props.data.map((d: PeerNode) => d.peer_id)).toEqual(['peer-1', 'peer-2', 'peer-3'])   // origin, receiving, decoded; never idle/joining/failed/attacker
  expect(halos.props.data.map((d: PeerNode) => halos.props.getIcon(d))).toEqual(['halo-1', 'halo-2', 'halo-3']); expect(halos.props.pickable).toBe(false)
  expect(layerIds().indexOf('halos')).toBeLessThan(layerIds().indexOf('nodes'))
})
test('negative score → flame halo-0; attack links dashed 4/3 from grafted attackers to each victim; pruned has none', () => {
  mount(); const nodes = [...peers(4).map(p => ({ ...p, state: 'receiving' as const, gossip_score: -0.25 })), grafted, pruned]
  useStore.getState().applyEdges({ type: 'edges', edges: ring(4) }); useStore.getState().applySnapshot({ ...snapWith(nodes.map(n => n.peer_id)), nodes }); flush()
  const halos = FakeDeck.instances[0].lastLayer('halos'); expect(halos.props.data.every((d: PeerNode) => halos.props.getIcon(d) === 'halo-0')).toBe(true)
  const al = FakeDeck.instances[0].lastLayer('attack-links'); expect(al.props.data).toHaveLength(2); expect(al.props.getDashArray).toEqual([4, 3]); expect(al.props.widthUnits).toBe('pixels')
  expect(layerIds().indexOf('attack-links')).toBeGreaterThan(layerIds().indexOf('edges')); expect(layerIds().indexOf('attack-links')).toBeLessThan(layerIds().indexOf('mesh-edges') === -1 ? 99 : layerIds().indexOf('mesh-edges'))
})
test('selection draws the reticle at 2 r and ×1.5 size; hover draws 2 px edges and r+4 rings; event highlight lines + rings', () => {
  mount(); useStore.getState().applyEdges({ type: 'edges', edges: ring(5) }); useStore.getState().applySnapshot(snapWith(peers(5).map(p => p.peer_id))); flush()
  useStore.getState().selectPeer('peer-0', ['peer-2', 'peer-3']); useStore.getState().hoverPeer('peer-1'); flush()
  const nl = FakeDeck.instances[0].lastLayer('nodes'); const d0 = nl.props.data.find((d: PeerNode) => d.peer_id === 'peer-0'); const d4 = nl.props.data.find((d: PeerNode) => d.peer_id === 'peer-4')
  expect(nl.props.getSize(d0) / nl.props.getSize(d4)).toBeCloseTo(1.5)
  const ret = FakeDeck.instances[0].lastLayer('reticle'); expect(ret.props.data).toHaveLength(1); expect(ret.props.getIcon(ret.props.data[0])).toBe('reticle')
  expect(FakeDeck.instances[0].lastLayer('hover-edges').props.data).toHaveLength(2); expect(FakeDeck.instances[0].lastLayer('hover-edges').props.getWidth).toBe(2)
  expect(FakeDeck.instances[0].lastLayer('hover-peer-rings').props.data).toHaveLength(2); expect(FakeDeck.instances[0].lastLayer('hover-peer-rings').props.getRadius).toBe(nodeRadiusPx(5, 'force', 1) + 4)
  expect(FakeDeck.instances[0].lastLayer('event-highlight-edges').props.data).toHaveLength(2); expect(FakeDeck.instances[0].lastLayer('event-highlight-rings').props.data).toHaveLength(2)
  useStore.getState().selectPeer(null); flush(); expect(layerIds()).not.toContain('reticle'); expect(layerIds()).not.toContain('event-highlight-edges')
})
test('observer rings breathe .2→.75 and are static at .5 under reduced motion', () => {
  mount(); const obs = { ...peers(1)[0], peer_id: 'obs-1', is_real: true, x: 1, y: 1 }; useStore.setState({ geoAvailable: true }); useStore.getState().setLayoutMode('geo')
  useStore.getState().applySnapshot({ ...snapWith(['obs-1']), nodes: [obs] }); flush()
  const r1 = FakeDeck.instances[0].lastLayer('observer-rings'); expect(r1.props.data).toHaveLength(1); const a1 = r1.props.getLineColor[3]
  vi.advanceTimersByTime(1400); flush(); expect(FakeDeck.instances[0].lastLayer('observer-rings').props.getLineColor[3]).not.toBe(a1)
  reducedMotionMock.mockReturnValue(true); destroyRenderer(); mount(); useStore.getState().applySnapshot({ ...snapWith(['obs-1']), nodes: [obs] }); flush()
  expect(FakeDeck.instances[1].lastLayer('observer-rings').props.getLineColor[3]).toBe(Math.round(0.5 * 255))
})
test('labels: attackers always (raw id, flame / paper-3 when pruned), selected + hovered as nN, all labels when ≤ 50 visible, none when showLabels off or fonts not ready', () => {
  mount(); fontsReadyForTest(true); const nodes = [...peers(3), grafted, pruned]; useStore.getState().applyEdges({ type: 'edges', edges: ring(3) }); useStore.getState().applySnapshot({ ...snapWith(nodes.map(n => n.peer_id)), nodes }); flush()
  let L = FakeDeck.instances[0].lastLayer('labels'); expect(L.props.data.map((d: PeerNode) => L.props.getText(d))).toEqual(['sybil-0', 'sybil-1']); expect(L.props.fontFamily).toContain('IBM Plex Mono'); expect(L.props.fontWeight).toBe(500); expect(L.props.getSize).toBe(10)
  expect(L.props.getColor(grafted)).toEqual(PAL.flame); expect(L.props.getColor(pruned)).toEqual(PAL.paper3)
  useStore.getState().selectPeer('peer-0'); useStore.getState().hoverPeer('peer-2'); flush(); L = FakeDeck.instances[0].lastLayer('labels'); expect(L.props.data.map((d: PeerNode) => L.props.getText(d)).sort()).toEqual(['n0', 'n2', 'sybil-0', 'sybil-1'])
  useStore.getState().setDisplay({ allLabels: true }); flush(); expect(FakeDeck.instances[0].lastLayer('labels').props.data).toHaveLength(5)
  useStore.getState().applySnapshot(snapWith(peers(60).map(p => p.peer_id))); flush(); expect(FakeDeck.instances[0].lastLayer('labels')?.props.data.length ?? 0).toBeLessThanOrEqual(2)   // > 50 visible: all-labels ignored
  useStore.getState().setPref('stageTheme', true); flush(); expect(FakeDeck.instances[0].lastLayer('labels')?.props.getSize ?? 12).toBe(12)
  useStore.getState().setDisplay({ showLabels: false }); flush(); expect(layerIds()).not.toContain('labels')
})
```

(`fontsReadyForTest` is a test-only export guarded by `process.env.NODE_ENV === 'test'`, or the test resolves a mocked `document.fonts.load` — builder's choice; `reducedMotionMock` is `vi.mock('@/lib/prefs')`.)

- [ ] **Step 2: Run to verify failure**

Run: `cd /home/yks/Projects/luminar/web && npx vitest run components/map/renderer.test.ts`
Expected: FAIL on the new tests (missing layers).

- [ ] **Step 3: Implement the remaining layers in `renderer.ts`**

In `LAYER_IDS` order. `attack-links`: `PathLayer` + `PathStyleExtension({ dash: true })`, `getDashArray: [4, 3]`, 1 px, `PAL.linkAttack` (alpha × `scale.edgeAlpha`), source = each grafted attacker, target = each `connected_peers` victim with a visible position. `hover-edges`: topology edges touching `hoveredPeer`, `LineLayer` width 2 `widthMinPixels 2`, `PAL.paper1`; `hover-peer-rings`: `ScatterplotLayer` stroked, `radiusUnits: 'pixels'`, `getRadius: nodeRadiusPx + 4`, `PAL.paper1`, over the hovered node's `connected_peers`. `halos`: `IconLayer`, `data` = visible sim peers whose `state ∈ {origin, receiving, decoded}` (idle has no history yet; joining/failed/error/attacker carry their own glyphs), `getIcon: d => haloFor(d.gossip_score)`, size = `mapping[halo].height / dpr`, not pickable, `updateTriggers.getIcon = [bandKey]` where `bandKey` is the joined `scoreBand` string. `observer-rings`: observers draw in `nodes` with the static `'observer'` double-ring glyph; the breathing is alpha only, so `observer-rings` is a stroked `ScatterplotLayer` ring at 1.6 r, 1.5 px, `radiusUnits: 'pixels'`, `withAlpha(PAL.ringTelemetry, (reducedMotion() ? OBSERVER_STATIC_ALPHA : breathe(now)) × 255)`; `animating()` returns true while any observer is visible and motion is allowed. `reticle`: `IconLayer` glyph `'reticle'` at the selected node (visible in the current mode), size `mapping.reticle.height / dpr`. `event-highlight-edges`: `LineLayer` from the selected node to each `highlightPeers` position, 2.5 px, `withAlpha(PAL.linkHighlight, 161)`; `event-highlight-rings`: stroked `ScatterplotLayer` at 1.8 r, 1.5 px, `withAlpha(PAL.linkHighlight, 230)`. `labels`: `TextLayer` gated by `showLabels && fontsReady`; data = attackers ∪ selected ∪ hovered ∪ (allLabels && visibleCount ≤ 50 ? all visible : ∅); `getText`: attacker → `peer_id`, else `shortName`; `getColor`: attacker → grafted `PAL.flame` / pruned `PAL.paper3`, else `PAL.paper0`; `getSize: stageTheme ? 12 : 10`, `sizeUnits: 'pixels'`, `fontFamily: '"IBM Plex Mono", monospace'`, `fontWeight: 500`, `getTextAnchor: 'start'`, `getAlignmentBaseline: 'center'`, `getPixelOffset: [nodeRadiusPx × glyphScale + 3, 0]` (pixels, so the label hugs the disc at any zoom), `characterSet: 'auto'`. Selected node: `glyphScale(d, true)` in `nodes`' `getSize`, `updateTriggers.getSize = [selectedPeer]`.

- [ ] **Step 4: Run to verify pass**

Run: `cd /home/yks/Projects/luminar/web && npx vitest run components/map/renderer.test.ts && npx tsc --noEmit && npm run lint`
Expected: PASS, clean.

- [ ] **Step 5: Browser walk — the Sybil/eclipse demo reads by shape**

1. Backend + web up; `navigate_page` → `http://localhost:3000/sim/`; wait for `LIVE`.
2. `curl -s -X POST localhost:8000/api/scenarios/demo_sybil_eclipse/launch -H 'Content-Type: application/json' -d '{"speed":1}'` → `{"status": ...}`.
3. T+0–10: paper discs; after the first publish (≈T+6) the origin disc shows a pitch centre dot, receiving/decoded peers show the 2 px-cell halo (band 1 → 2 as scores grow), decoded peers carry the signal ring. `take_screenshot` at 2× zoom: halo cells are square and crisp (no grey smear).
4. T+10: **five flame diamonds** appear beside their victims, each with 45° hatch, dashed (4/3) flame links to every victim, raw `sybil-N` label in flame. `evaluate_script`: `__luminar.layerIds()` contains `'attack-links'`, `'halos'`, `'labels'` in that relative order.
5. T+11–13: victims' halos flip to **sparse flame cells** (band 0) as their scores dip, then the first prune: a diamond goes **hollow dashed paper-3**, its attack links disappear, its label turns paper-3; by ≈T+14 all five are hollow. No diamond is ever dithered or blurred.
6. T+16: `eclipse-0..3` diamonds appear around one peer (peer-10 in the recorded reel). Hover that peer: its topology edges go 2 px paper-1 and its peers get r+4 rings; the tooltip (2.8) is not required yet.
7. Click a disc → reticle (ring at 2 r + four ticks, 2 px) and the disc grows ×1.5; click the empty field → deselect; drag → never deselects.
8. Legend settings are phase 3; toggle via console instead: `__luminar.store.getState().setDisplay({ allLabels: true })` → every disc labelled `nN` (50 nodes); `setDisplay({ showEdges: false })` → dotted edges and mesh lines vanish, attack links stay; `setDisplay({ showLabels: false })` → no labels at all.
9. `emulate` `prefers-reduced-motion: reduce` and reload: no observers yet, so only check later in 2.7; note for 2.6.
10. `press_key` `t` (stage, phase-1 prefs): discs ×1.4, labels 12 px, halo cells 3 px, edges brighter; `evaluate_script`: `__luminar.layerIds()` unchanged.

- [ ] **Step 6: Commit**

```bash
git add web/components/map/renderer.ts web/components/map/renderer.test.ts
git commit -m "feat(web): full render table on the canvas (halos, diamonds, rings, reticle, hover, highlight, labels)"
```

### Task 2.6: Particles and pulses

**Files:**
- Modify: `web/components/map/renderer.ts` (`spawnParticle`, `particlesFor`, layers `pulses`, `particles`, `subscribeEvents` registration, `animating()`)
- Test: `web/components/map/renderer.test.ts` (append), `web/components/map/particles.test.ts` (pure trigger table)

**Interfaces:**
- Consumes: `subscribeEvents` (A.8), `ParticleKind`, `PARTICLE_KEY` (A.15), `particleFrame`, `bezierPoint`, `pulseAlpha`, caps (2.2), `reducedMotion` (A.13), `STATE` colours via `PAL` (`nodeOrigin nodeReceiving nodeDecoded nodeJoining nodeFailed nodeError nodeAttacker nodePruned`).
- Produces: A.17 `spawnParticle(fromId, toId, kind = 'message', fizzle = false)`; `particlesFor`.

- [ ] **Step 1: Write the failing tests**

```ts
// particles.test.ts — pure
const pick = (ids: string[]) => ids[0]
const E = (p: Partial<AppEvent>): AppEvent => ({ at: 1, event_type: 'GossipMessage', category: 'gossip', ...p })
test('trigger table', () => {
  expect(particlesFor(E({ from_peer: 'peer-1', to_peer: 'peer-2' }), pick)).toEqual([{ from: 'peer-1', to: 'peer-2', kind: 'message', fizzle: false }])
  expect(particlesFor(E({ from_peer: 'sybil-3', to_peer: 'peer-2', msg_id: 'spam-9' }), pick)).toEqual([{ from: 'sybil-3', to: 'peer-2', kind: 'spam', fizzle: false }])
  expect(particlesFor(E({ from_peer: 'peer-1', to_peer: 'peer-2', dropped: true }), pick)[0].fizzle).toBe(true)
  expect(particlesFor(E({ event_type: 'GossipGraft', from_peer: 'a', to_peer: 'b' }), pick)[0].kind).toBe('graft')
  expect(particlesFor(E({ event_type: 'GossipPrune', from_peer: 'a', to_peer: 'b' }), pick)[0].kind).toBe('prune')
  expect(particlesFor(E({ event_type: 'DHTQueryStarted', category: 'dht', peer_id: 'peer-1' }), ids => ids[0])).toEqual([{ from: 'peer-1', to: expect.any(String), kind: 'dht', fizzle: false }])
  expect(particlesFor(E({ event_type: 'FaultInjected', category: 'fault', fault_type: 'eclipse', target: 'peer-5' }), pick).every(p => p.kind === 'fault' && p.from === 'peer-5')).toBe(true)
  expect(particlesFor(E({ event_type: 'FaultInjected', category: 'fault', fault_type: 'sybil', count: 5 }), pick)).toEqual([])   // target not a node id → no burst
  expect(particlesFor(E({ event_type: 'ClockTick', category: 'clock' }), pick)).toEqual([])
  expect(particlesFor(E({ event_type: 'FaultInjected', category: 'fault', fault_type: 'drop', target: 'peer-5' }), pick).length).toBeLessThanOrEqual(4)   // first 4 peers only
})
// renderer.test.ts — append
test('spawnParticle: cap 600, unknown/hidden peers no-op, disabled no-op; particles layer uses the square glyph and spam gets the trail', () => {
  mount(); useStore.getState().applyEdges({ type: 'edges', edges: ring(10) }); useStore.getState().applySnapshot(snapWith(peers(10).map(p => p.peer_id))); flush()
  spawnParticle('peer-0', 'nope'); flush(); expect(layerIds()).not.toContain('particles')
  for (let i = 0; i < 700; i++) spawnParticle('peer-0', 'peer-1'); spawnParticle('sybil-x', 'peer-1'); flush()
  const P = FakeDeck.instances[0].lastLayer('particles'); expect(P.props.data.length).toBeLessThanOrEqual(600); expect(P.props.getIcon(P.props.data[0])).toBe('square'); expect(P.props.sizeUnits).toBe('pixels'); expect(P.props.pickable).toBe(false)
  useStore.getState().applySnapshot({ ...snapWith([...peers(10).map(p => p.peer_id), 'sybil-0']), nodes: [...peers(10), grafted] }); flush(); spawnParticle('sybil-0', 'peer-1', 'spam'); flush()
  const P2 = FakeDeck.instances[0].lastLayer('particles'); const spam = P2.props.data.at(-1); expect(P2.props.getIcon(spam)).toBe('squareTrail'); expect(P2.props.getColor(spam).slice(0, 3)).toEqual(PAL.particleSpam.slice(0, 3))
  useStore.getState().setDisplay({ particlesEnabled: false }); spawnParticle('peer-0', 'peer-1'); // no throw, no push
  vi.advanceTimersByTime(1300); flush(); expect(layerIds()).not.toContain('particles')   // all expired
})
test('a particle whose endpoint leaves the visible set is dropped, not drawn at [0,0]', () => {
  mount(); useStore.getState().applyEdges({ type: 'edges', edges: ring(10) }); useStore.getState().applySnapshot(snapWith(peers(10).map(p => p.peer_id))); flush()
  spawnParticle('peer-0', 'peer-9'); useStore.getState().applySnapshot(snapWith(peers(5).map(p => p.peer_id))); flush()
  const P = FakeDeck.instances[0].lastLayer('particles'); expect(P?.props.data.length ?? 0).toBe(0)
})
test('event subscription spawns from the batch; pulses on state change to non-idle incl. graft↔prune flip; both off under reduced motion', () => {
  mount(); useStore.getState().applyEdges({ type: 'edges', edges: ring(4) }); useStore.getState().applySnapshot(snapWith(peers(4).map(p => p.peer_id))); flush()
  dispatchFrame({ at: 1, event_type: 'GossipMessage', category: 'gossip', from_peer: 'peer-0', to_peer: 'peer-1', msg_id: 'm' }); flushEvents(); flush(); expect(FakeDeck.instances[0].lastLayer('particles').props.data).toHaveLength(1)
  useStore.getState().applySnapshot({ ...snapWith(peers(4).map(p => p.peer_id)), nodes: peers(4).map((p, i) => ({ ...p, state: i === 0 ? 'decoded' : 'idle' })) }); flush()
  const pulses = FakeDeck.instances[0].lastLayer('pulses'); expect(pulses.props.data).toHaveLength(1); expect(pulses.props.getRadius).toBeCloseTo(nodeRadiusPx(4, 'force', 1) * 2.5); expect(pulses.props.data[0].color[3]).toBeLessThanOrEqual(56)
  useStore.getState().applySnapshot({ ...snapWith([...peers(4).map(p => p.peer_id), 'sybil-0']), nodes: [...peers(4), grafted] }); flush(); useStore.getState().applySnapshot({ ...snapWith([...peers(4).map(p => p.peer_id), 'sybil-0']), nodes: [...peers(4), { ...grafted, connected_peers: [] }] }); flush()
  expect(FakeDeck.instances[0].lastLayer('pulses').props.data.some((d: any) => d.id === 'sybil-0')).toBe(true)
  vi.advanceTimersByTime(900); flush(); expect(layerIds()).not.toContain('pulses')
  reducedMotionMock.mockReturnValue(true); destroyRenderer(); mount(); useStore.getState().applySnapshot(snapWith(peers(4).map(p => p.peer_id))); flush()
  useStore.getState().applySnapshot({ ...snapWith(peers(4).map(p => p.peer_id)), nodes: peers(4).map(p => ({ ...p, state: 'decoded' as const })) }); flush(); expect(layerIds()).not.toContain('pulses')
})
```

- [ ] **Step 2: Run to verify failure**

Run: `cd /home/yks/Projects/luminar/web && npx vitest run components/map/particles.test.ts components/map/renderer.test.ts`
Expected: FAIL (`particlesFor`/`spawnParticle` not exported; layers missing).

- [ ] **Step 3: Implement**

`particlesFor(evt, pick)`: `GossipMessage` → `[{from: from_peer, to: to_peer, kind: isAttackerId(from_peer) && from_peer.startsWith('sybil-') ? 'spam' : 'message', fizzle: !!dropped}]`; `GossipGraft`/`GossipPrune` → `graft`/`prune`; `DHTQueryStarted` with `peer_id` → one particle to `pick(nodeById.get(peer_id).connected_peers)` (renderer passes a random picker); `FaultInjected` with `target` that is a known node id → `fault` burst to the first 4 `connected_peers`; everything else `[]`. `initRenderer` registers `subscribeEvents(batch => { for (const e of batch) for (const p of particlesFor(e, rnd)) spawnParticle(p.from, p.to, p.kind, p.fizzle) })` and unsubscribes in `destroyRenderer`. `spawnParticle`: return when `!particlesEnabled`, `particles.length >= PARTICLE_CAP`, or either id is not in `nodeIndex`; push `{ fromId, toId, start: performance.now(), kind, fizzle }`. `particles` layer: `IconLayer`, `getIcon: p => p.kind === 'spam' ? 'squareTrail' : 'square'`, `sizeUnits: 'pixels'`, size `2 × cellPx × scale.particle` (`squareTrail` 3 cells wide), `getColor: p => withAlpha(fizzle ? PAL.nodeError : PAL[PARTICLE_KEY[kind]], frame.alpha)`, `getPosition: bezierPoint(posOf(from), posOf(to), frame.t)`, `getAngle` for the trail = direction of travel; a particle whose `particleFrame` is null or whose endpoint has no visible position is removed from the array in the same pass. `pulses`: `prevStateKeys` per id (`state` + `'+'|'-'` for attackers by `connected_peers.length`), state change to non-idle and `!reducedMotion()` → push `{ id, start, color: PAL[node<State>] }`, cap `PULSE_CAP`; `ScatterplotLayer`, `radiusUnits: 'pixels'`, `getRadius: nodeRadiusPx × 2.5`, `getFillColor: withAlpha(color, pulseAlpha(age))`, expired pulses spliced. `animating()` = `particles.length > 0 || pulses.length > 0 || (observersVisible && !reducedMotion())`. Positions are looked up by id each frame (not by index), so a reindexed snapshot cannot move a particle onto the wrong node.

- [ ] **Step 4: Run to verify pass**

Run: `cd /home/yks/Projects/luminar/web && npx vitest run components/map && npx tsc --noEmit && npm run lint`
Expected: PASS, clean.

- [ ] **Step 5: Browser walk — traffic reads as hard squares**

1. Backend + web; `/sim/`; launch `demo_sybil_eclipse` by curl as in 2.5.
2. T+6 onward: 2-cell paper squares ride bowed paths from the origin outward (A→B and B→A on separate bows), no blur, no glow; each delivered hop ends at the target and fades; `take_screenshot` zoomed: squares are square.
3. T+10–12: **flame squares with a trailing cell** stream from each `sybil-N` diamond into its victims (spam); once a diamond goes hollow its spam stops.
4. T+16–24: the four `eclipse-N` diamonds emit **no** spam particles (silent attackers); the eclipsed peer's halo stays band 1–2 (never flame) — the WHY line of the inspector in phase 3 depends on this being visibly true.
5. Pulses: when a disc changes state (idle → receiving, graft → prune) a 2.5 r disc flashes at alpha 56 and fades over 800 ms; never on idle.
6. `evaluate_script` during the burst: `__luminar.layerIds()` has `'pulses'` before `'particles'` before `'halos'`.
7. `emulate` `prefers-reduced-motion: reduce`, reload, relaunch the scenario: no particles, no pulses; the mesh and diamonds still appear.
8. Idle (no traffic for 2 s): `performance_start_trace` 3 s → `performance_stop_trace`; the main thread shows no per-frame `renderLayers` work (the rAF loop skips when nothing animates and the store is clean).

- [ ] **Step 6: Commit**

```bash
git add web/components/map/renderer.ts web/components/map/renderer.test.ts web/components/map/particles.test.ts
git commit -m "feat(web): gossip particles and state pulses as hard squares on the canvas"
```

### Task 2.7: Geo land, mode switcher, auto-Geo

**Files:**
- Create: `web/components/sim/ModeSwitcher.tsx`, `web/components/sim/ModeSwitcher.module.css`
- Modify: `web/components/map/renderer.ts` (`world-land` layer, land loading), `web/components/sim/SimApp.tsx` (mount `<ModeSwitcher/>` top-centre over the canvas), `web/lib/store.ts` only if `geoAutoDone` is not reset when `mainnet.enabled` flips false (add + test)
- Copy if missing: `web/public/geo/land-110m.json` ← `frontend/public/geo/land-110m.json`
- Test: `web/components/sim/ModeSwitcher.test.tsx`, `web/components/map/renderer.test.ts` (append)

**Interfaces:**
- Consumes: `getStatic` (A.7), `GEO_SCALE`, `WORLD_BOUNDS` (A.14), `setLayoutMode`, `selectCanGeo`, `layoutBeforeGeo`, `mainnet`, `geoAutoDone` (A.11), `maybeAutoGeo`, `leaveGeoForSim` (A.12), `FillStyleExtension` (`@deck.gl/extensions`).
- Produces: `ModeSwitcher`, `GEO_DISABLED`; `world-land` layer.

- [ ] **Step 1: Write the failing tests**

```tsx
// ModeSwitcher.test.tsx (renderToStaticMarkup reads the store at render time; interactions tested through the store)
test('three tabs, aria-pressed follows layoutMode, Geo disabled with reason until geoAvailable', () => {
  let html = renderToStaticMarkup(<ModeSwitcher />)
  expect(html.match(/<button/g)).toHaveLength(3); expect(html).toMatch(/FORCE[\s\S]*RADIAL[\s\S]*GEO/)
  expect(html).toContain('aria-pressed="true">FORCE'); expect(html).toMatch(/<button[^>]*disabled[^>]*title="Geo needs real observers · turn MAINNET on"[^>]*>GEO/)
  useStore.setState({ geoAvailable: true, layoutMode: 'radial' }); html = renderToStaticMarkup(<ModeSwitcher />)
  expect(html).not.toMatch(/disabled[^>]*>GEO/); expect(html).toContain('aria-pressed="true">RADIAL')
  expect(html).toContain('role="group"'); expect(html).toContain('aria-label="Layout"')
})
test('a manual pick writes layoutMode through setLayoutMode and clears the remembered layout', () => {
  useStore.setState({ geoAvailable: true, layoutMode: 'geo', layoutBeforeGeo: 'radial' }); useStore.getState().setLayoutMode('force'); expect(useStore.getState().layoutMode).toBe('force'); expect(useStore.getState().layoutBeforeGeo).toBeNull()
})
// store.test.ts (only if missing): geoAutoDone resets when mainnet turns off
test('auto-Geo happens once per feed-on', () => {
  useStore.setState({ geoAvailable: true }); useStore.getState().applyTelemetryStatus({ type: 'telemetry_status', active: false, peer_count: 0, peers: [], mainnet: { enabled: true, observers: 3 } }); maybeAutoGeo()
  expect(useStore.getState().layoutMode).toBe('geo'); expect(useStore.getState().geoAutoDone).toBe(true)
  useStore.getState().setLayoutMode('force'); maybeAutoGeo(); expect(useStore.getState().layoutMode).toBe('force')
  useStore.getState().applyTelemetryStatus({ type: 'telemetry_status', active: false, peer_count: 0, peers: [], mainnet: { enabled: false, observers: 0 } }); expect(useStore.getState().geoAutoDone).toBe(false)
})
// renderer.test.ts — append (vi.mock('@/lib/api/client', () => ({ getStatic: vi.fn(async () => ({ features: [{ geometry: { type: 'Polygon', coordinates: [[[0, 0], [10, 0], [10, 10], [0, 0]]] } }] })) })))
test('geo loads land once and draws it under everything with the checker fill', async () => {
  mount(); useStore.setState({ geoAvailable: true }); useStore.getState().setLayoutMode('geo'); useStore.getState().applySnapshot({ ...snapWith(['obs-1']), nodes: [{ ...peers(1)[0], peer_id: 'obs-1', is_real: true, x: 10, y: -25 }] }); flush(); await Promise.resolve(); flush()
  expect(getStatic).toHaveBeenCalledTimes(1); expect(getStatic).toHaveBeenCalledWith('/geo/land-110m.json')
  expect(layerIds()[0]).toBe('world-land'); const land = FakeDeck.instances[0].lastLayer('world-land')
  expect(land.props.getPolygon(land.props.data[0])[1]).toEqual([10 * GEO_SCALE, 0]); expect(land.props.extensions.some((e: any) => e.constructor.extensionName === 'FillStyleExtension')).toBe(true); expect(land.props.fillPatternMask).toBe(true); expect(land.props.pickable).toBe(false)
  useStore.getState().setLayoutMode('force'); flush(); expect(layerIds()).not.toContain('world-land'); useStore.getState().setLayoutMode('geo'); flush(); expect(getStatic).toHaveBeenCalledTimes(1)
})
```

- [ ] **Step 2: Run to verify failure**

Run: `cd /home/yks/Projects/luminar/web && npx vitest run components/sim/ModeSwitcher.test.tsx components/map/renderer.test.ts lib/store.test.ts`
Expected: FAIL (component missing; `world-land` missing).

- [ ] **Step 3: Implement**

`world-land`: `ensureLand()` as today (`renderer.ts:133-144`), `getStatic('/geo/land-110m.json')`, rings scaled by `GEO_SCALE`, `landLoading` guard; `PolygonLayer({ id: 'world-land', data, getPolygon, filled: true, stroked: true, getFillColor: PAL.paper0, getLineColor: withAlpha(PAL.paper0, 0.16 × 255), lineWidthMinPixels: 1, pickable: false, extensions: [new FillStyleExtension({ pattern: true })], fillPatternAtlas: checkerCanvas /* 2×2: paper at (0,0),(1,1), transparent elsewhere */, fillPatternMapping: { checker: { x: 0, y: 0, width: 2, height: 2 } }, getFillPattern: () => 'checker', fillPatternMask: true, getFillPatternScale: scaleForZoom, getFillPatternOffset: [0, 0] })` where `scaleForZoom` keeps one pattern pixel ≈ 1 CSS px: `2 / 2 ** zoom` common units (recomputed in `onViewStateChange` → `markDirty()`); if deck 9.4's `FillStyleExtension` offers pixel size units, use them instead and drop the recompute. Only in `layoutMode === 'geo'`, first in the layer list. `ModeSwitcher.tsx`: `'use client'`; `const mode = useStore(s => s.layoutMode); const canGeo = useStore(selectCanGeo)`; `<div role="group" aria-label="Layout" className={styles.switch}>` with three `<button type="button" aria-pressed={mode === m} disabled={m === 'geo' && !canGeo} title={m === 'geo' && !canGeo ? GEO_DISABLED : undefined} onClick={() => m !== mode && useStore.getState().setLayoutMode(m)}>` labelled `FORCE | RADIAL | GEO` (Manrope 600 `--t-label` uppercase .12em, hairline separators, no box; `:focus-visible` 2 px `--focus`). Two effects: `useEffect(() => { if (!canGeo && mode === 'geo') useStore.getState().setLayoutMode(useStore.getState().layoutBeforeGeo ?? 'force') }, [canGeo, mode])` (previous layout restored when real nodes vanish) and `useEffect(() => { maybeAutoGeo() }, [mainnetEnabled, canGeo])` (auto-Geo once per feed-on). If `store.applyTelemetryStatus` does not already reset `geoAutoDone` when `enabled` goes false, add that one line with the store test above. Mount in `SimApp.tsx` absolutely positioned top-centre over the canvas (`top: 12px; left: 50%; transform: translateX(-50%)`), hidden under `data-hero="1"`? No — the switcher stays in hero (the talk switches to Geo live); only rails/legend/tooltip/kbd hide (spec §6.3).

- [ ] **Step 4: Run to verify pass**

Run: `cd /home/yks/Projects/luminar/web && npx vitest run components lib && npx tsc --noEmit && npm run lint`
Expected: PASS, clean.

- [ ] **Step 5: Browser walk — Geo is for observers only**

1. Backend + web; `/sim/`. Top-centre: `FORCE | RADIAL | GEO`, Geo greyed; hover → title `Geo needs real observers · turn MAINNET on`.
2. `click` RADIAL → rings by degree, highest degree at centre, discs half size, edges at .4 alpha; `f` refits. `click` FORCE → the frozen force positions come back unchanged (no re-tick).
3. `curl -s -X POST localhost:8000/api/live/mainnet -H 'Content-Type: application/json' -d '{"enabled":true}'` (the toolbar badge is phase 3). Within one slot (≤ 12 s): Geo tab enabled and **auto-selected once**; the land masses draw as a 50 % paper checker with a 1 px .16 outline; **only observer double rings** draw (no sim discs, no topology edges); `evaluate_script`: `__luminar.layerIds()[0] === 'world-land'` and `__luminar.store.getState().layoutBeforeGeo === 'force'`.
4. Observer rings breathe .2 → .75 over 5.6 s; `emulate` reduced motion + reload → static at .5.
5. On a `BlockSeen first` the observers flash origin/decoded (phase-1 store) and the Geo fit holds (`WORLD_BOUNDS`, Antarctica cropped); `press_key` `f` → same framing.
6. `click` FORCE while mainnet is on → sim mesh returns; `click` GEO again → observers; `evaluate_script` `__luminar.store.getState().layoutBeforeGeo` is `null` after a manual pick.
7. `curl -s -X POST localhost:8000/api/sim/reconfigure -H 'Content-Type: application/json' -d '{"n_nodes":50}'` while in Geo → the next snapshot still shows observers only (sim actions through the UI leave Geo with a toast in phase 3; a raw curl does not and must not break Geo).
8. `curl ... /api/live/mainnet -d '{"enabled":false}'` → observers vanish within a slot, the switcher **restores `force`** and Geo greys out again; turning mainnet back on auto-picks Geo once more (feed-on resets `geoAutoDone`).
9. `list_console_messages` → no errors through the whole walk.

- [ ] **Step 6: Commit**

```bash
git add web/components/sim/ModeSwitcher.tsx web/components/sim/ModeSwitcher.module.css web/components/sim/ModeSwitcher.test.tsx web/components/map/renderer.ts web/components/map/renderer.test.ts web/components/sim/SimApp.tsx web/public/geo/land-110m.json web/lib/store.ts web/lib/store.test.ts
git commit -m "feat(web): dithered Geo land fill, layout mode switcher and auto-Geo"
```

### Task 2.8: Tooltip

**Files:**
- Create: `web/components/sim/Tooltip.tsx`, `web/components/sim/Tooltip.module.css`
- Modify: `web/components/map/renderer.ts` (tooltip placement in `onHover`), `web/components/map/DeckCanvas.tsx` (render the real `<Tooltip/>`)
- Test: `web/components/sim/Tooltip.test.tsx`

**Interfaces:**
- Consumes: `selectHoveredNode`, `mesh`, `nodeById` (A.11), `shortName`, `signed`, `isAttackerId`, `isPruned` (A.3), `fmtCount`.
- Produces: `Tooltip`, `tooltipRows`.

- [ ] **Step 1: Write the failing tests**

```tsx
const honest: PeerNode = { peer_id: 'peer-7', index: 7, state: 'decoded', connected_peers: ['peer-1', 'peer-2', 'sybil-0'], x: 0, y: 0, messages_sent: 1284, messages_received: 61900, gossip_score: 3.5 }
const grafted: PeerNode = { ...honest, peer_id: 'sybil-0', index: 50, state: 'attacker', connected_peers: ['peer-7', 'peer-9'], gossip_score: -0.25 }
const byId = new Map([[honest.peer_id, honest], [grafted.peer_id, grafted], ['peer-9', { ...honest, peer_id: 'peer-9', index: 9 }]])
test('honest rows: peers, score, sent · recv, mesh sybil grafts in alarm tone', () => {
  const r = tooltipRows(honest, { 'peer-7': ['peer-1', 'sybil-0'] }, byId)
  expect(r.head).toEqual({ name: 'n7', badge: 'DECODED', id: 'peer-7', alarm: false })
  expect(r.rows).toEqual([['peers', '3', false], ['score', '+3.50', false], ['sent · recv', '↑1,284 · ↓61.9K', false], ['mesh', '1 sybil graft', true]])
})
test('attacker rows: grafted into N meshes, score alarm, victims by short name; pruned badge', () => {
  const r = tooltipRows(grafted, {}, byId)
  expect(r.head.badge).toBe('ATTACKER'); expect(r.head.alarm).toBe(true); expect(r.rows[0]).toEqual(['grafted into', '2 meshes', false]); expect(r.rows[1]).toEqual(['score', '-0.25', true]); expect(r.peers).toEqual(['n7', 'n9'])
  expect(tooltipRows({ ...grafted, connected_peers: [] }, {}, byId).head.badge).toBe('PRUNED')
})
test('negative honest score is alarm; long ids are shortened in the id line', () => {
  expect(tooltipRows({ ...honest, gossip_score: -1 }, {}, byId).rows[1]).toEqual(['score', '-1.00', true])
  expect(tooltipRows({ ...honest, peer_id: '16Uiu2HAmAbCdEfGhIjKlMnOpQrStUvWxYz' }, {}, byId).head.id).toBe('16Uiu2HAm…WxYz')
})
test('Tooltip renders nothing without a hovered node, and nothing when the hovered id vanished', () => {
  expect(renderToStaticMarkup(<Tooltip />)).toBe('')
  useStore.setState({ hoveredPeer: 'ghost' }); expect(renderToStaticMarkup(<Tooltip />)).toBe('')
  useStore.getState().applySnapshot({ ...snapWith(['peer-7']), nodes: [honest] }); useStore.getState().hoverPeer('peer-7')
  const html = renderToStaticMarkup(<Tooltip />); expect(html).toContain('n7'); expect(html).toContain('DECODED'); expect(html).toContain('+3.50'); expect(html).not.toMatch(/style="[^"]*#/)   // tones via class, never inline colour
})
```

- [ ] **Step 2: Run to verify failure**

Run: `cd /home/yks/Projects/luminar/web && npx vitest run components/sim/Tooltip.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`tooltipRows` ports `renderer.ts:518-561` (`updateTooltipContent`) to data: head `{ name: shortName, badge: pruned ? 'PRUNED' : state.toUpperCase(), id: id.length > 16 ? \`${id.slice(0, 9)}…${id.slice(-4)}\` : id, alarm: attacker && !pruned }`; traffic `↑${fmtCount(sent)} · ↓${fmtCount(recv)}`; honest rows `peers · score (alarm when < 0) · sent · recv · mesh "N sybil graft(s)" (alarm) when > 0` where sybils = `(mesh[id] ?? connected_peers).filter(isAttackerId).length`; attacker rows `grafted into N meshes · score (alarm) · sent · recv` and `peers` = victims as `shortName` via `nodeById` (raw id when unknown). `Tooltip`: `const node = useStore(selectHoveredNode); const mesh = useStore(s => s.mesh); const byId = useStore(s => s.nodeById)`; `null` when `!node`; renders a 200 px card: head row (name in `--t-ui`, badge `--t-label` with `data-state`, class `alarm` → `--flame`, pruned → `--paper-3`), id line `--t-micro --fg-3`, rows as a `<dl>` (`dt` label `--paper-2`, `dd` value tabular), victims line. Surface `--pitch-2`, 1 px `--hair-strong`, square corners, `--stamp-shadow`, no dither (spec §7 forbidden list). In `renderer.ts` `onHover`: `hoverPeer(id)`; when `tooltipEl` and `info.object`: `tooltipEl.dataset.show = '1'; tooltipEl.style.transform = \`translate(${clamp(x + 16, 0, W − 216)}px, ${clamp(y − 10, 0, H − tooltipEl.offsetHeight − 8)}px)\``; else `dataset.show = '0'`. `DeckCanvas.module.css` already hides `.tip` under `data-hero="1"`.

- [ ] **Step 4: Run to verify pass**

Run: `cd /home/yks/Projects/luminar/web && npx vitest run components && npx tsc --noEmit && npm run lint`
Expected: PASS, clean.

- [ ] **Step 5: Browser walk — the tooltip tells the truth about grafts**

1. Backend + web; `/sim/`; launch `demo_sybil_eclipse`.
2. Hover an honest disc: card at cursor +16/−10 with `nN`, state badge, id, `peers`, `score` (signed), `sent · recv`; moving to the right edge clamps the card inside the field.
3. After T+10 hover a victim: `mesh · 1 sybil graft` in flame; hover a `sybil-N` diamond: `ATTACKER` badge in flame, `grafted into 2 meshes`, `score −0.xx` in flame, victims listed as `n12 n40`.
4. After the prune: the same diamond shows `PRUNED` in paper-3, `grafted into 0 meshes`.
5. Hover a disc while `curl ... /api/sim/reconfigure -d '{"n_nodes":20}'` lands: the card disappears, no console error (hovered id vanished).
6. `press_key` `h` (hero): the card never shows; `h` again: shows.
7. `evaluate_script` with React DevTools' `__REACT_DEVTOOLS_GLOBAL_HOOK__` or a `console.count` in `Tooltip`: it renders only when `hoveredPeer` changes, not per snapshot while hovering the same node (the selector returns the same `PeerNode` reference only if the store rebuilt it — if it re-renders at 2 Hz while parked, memoise on `peer_id + gossip_score + messages_sent + messages_received + connected_peers.length` with `useStore(..., shallow)`).

- [ ] **Step 6: Commit**

```bash
git add web/components/sim/Tooltip.tsx web/components/sim/Tooltip.module.css web/components/sim/Tooltip.test.tsx web/components/map/renderer.ts web/components/map/DeckCanvas.tsx
git commit -m "feat(web): hover tooltip card fed by the store, placed by the renderer"
```

### Task 2.9: 200-node timing and the phase gate

**Files:**
- Modify: `web/components/map/renderer.ts` only if the measurements below fail (e.g. `updateTriggers` too broad, atlas rebuilt per frame, `topologyKey` recomputed when nothing changed — guard it behind a cheap `nodes !== lastNodes || edges !== lastEdges || mode !== lastMode` reference check)
- Create: `docs/superpowers/plans/parts/phase-2-walk.md` (the recorded numbers from this task; absolute date, commit SHA, laptop DPR)

**Interfaces:**
- Consumes: everything above; `simReconfigure` (A.7) via curl.
- Produces: nothing new.

- [ ] **Step 1: Cold layout + first paint at 200 nodes**

1. Backend + web; `navigate_page` → `/sim/`; wait `LIVE`.
2. `evaluate_script`: `performance.clearMeasures('layout'); performance.mark('t0')`, then `curl -s -X POST localhost:8000/api/sim/reconfigure -H 'Content-Type: application/json' -d '{"n_nodes":200}'`.
3. `evaluate_script` after the mesh appears: `({ layout: performance.getEntriesByName('layout').at(-1).duration, nodes: __luminar.store.getState().nodes.length, layers: __luminar.layerIds() })`.
   Expected: `nodes === 200`, `layout ≤ 400` ms (150 ticks at n > 200 is not triggered at exactly 200; 300 ticks on the venue laptop), and the first painted frame with 200 discs within **≤ 1 s** of the reconfigure response (`take_screenshot` timestamps or `performance.now()` deltas logged from `renderLayers`' first non-empty `setProps`). The mesh overlay is absent (`layerIds()` has no `'mesh-edges'`; the backend sends `{}`).
4. Record the numbers in `phase-2-walk.md`.

- [ ] **Step 2: Frame rate during a Sybil burst and idle**

1. At 200 nodes: `performance_start_trace` (reload: false, autoStop: false); `curl -s -X POST localhost:8000/api/fault/sybil -H 'Content-Type: application/json' -d '{"n_attackers":10,"target_topic":"lumina/blocks/1.0"}'`; after 6 s `performance_stop_trace`.
   Expected: **≥ 30 fps** sustained during the burst (`performance_analyze_insight` on the frame timeline, no long task > 50 ms from `renderLayers`); the React commit track shows no commits during the burst except `Tooltip` when hovering.
2. `curl -s -X POST localhost:8000/api/fault/clear-all`; wait 3 s; trace 3 s of idle.
   Expected: **60 fps** idle (the rAF loop skips `renderLayers` when nothing animates), GPU and main thread near idle.
3. Repeat Step 1.2–1.3 of this task on `?theme=stage`: atlas rebuilds once (`buildAtlas` count via a `console.count` in dev or `performance.mark('atlas')`), not per frame.
4. If any number fails: profile; the usual culprits and fixes, in order — `updateTriggers` arrays rebuilt with a new identity each frame (use primitive keys), the `nodes` `data` array rebuilt when only `hoveredPeer` changed (split hover into its own layers, which the plan already does), `topologyKey` string-built per frame (guard behind reference checks), `haloCells` recomputed per frame (it runs only in `buildAtlas`). Fix in `renderer.ts`, re-run, record.

- [ ] **Step 3: Phase acceptance walk (spec §11, verbatim list) and the parity rows**

Run the whole sequence on the live backend at 1440×900, DPR as on the venue laptop, and tick each line in `phase-2-walk.md` with the evidence (screenshot name or `evaluate_script` result):

1. `demo_sybil_eclipse` from curl → five diamonds at T+10 with dashed attack links (2.5 §5.4).
2. Halos go flame, then the diamonds go hollow at the first score prune (2.5 §5.5).
3. `eclipse-*` diamonds show no spam particles (2.6 §5.4).
4. `f` refits (2.4 §6.5).
5. Geo tab disabled until mainnet on, then the dithered world shows and only observers draw (2.7 §5.1–5.3).
6. 200-node timing: cold layout + first paint ≤ 1 s, ≥ 30 fps in a Sybil burst, 60 fps idle, no React re-render per frame (this task).
7. Inventory §5 rows, each observed once: deck canvas (pan/zoom/cursor/empty-click deselect) · palette from tokens (flip `data-stage`, colours re-read) · layer order · topology edges (toggle) · attack links · mesh overlay (present at 50, absent at 200) · hover · pulses · particles · particle triggers (message/spam/graft/prune/dht/fault burst) · node discs (radius by n, ×1.5 selected, ×1.15 attacker) · halo · observer ring · selection reticle · event-click highlight (set `selectPeer('peer-1', ['peer-2'])` from the console until the log rail exists) · labels (incl. all-labels ≤ 50) · world map · tooltip · fitView · rAF loop idle · force / radial / geo layouts · visibility rule · relayout trigger (state-only snapshots never move nodes) · mode switcher (disabled reason, auto-Geo once, restore on vanish, manual pick clears memory, selection dropped when not drawn in the new mode) · BlockSeen flash on observers.
8. `list_console_messages` → no errors across the walk; `cd web && npx tsc --noEmit && npm run lint && npx vitest run && npm run build` green; `make check` green at the root.

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/plans/parts/phase-2-walk.md web/components/map/renderer.ts
git commit -m "perf(web): 200-node canvas timing recorded; phase 2 acceptance walk"
```

---

## Self-review notes

- Spec coverage: §4.5 (2.4 DeckCanvas/initRenderer/destroy/ResizeObserver, no `@deck.gl/react`), §6.2 Canvas paragraph (2.4 view/controller/cursor/deselect, 2.7 mode switcher, 2.8 tooltip; legend/provenance/narrator/kbd row are phase 3), §6.2 render table every row (2.3 glyphs, 2.5 layers, 2.6 particles/pulses, 2.7 land), §6.2 "Layer order, visibility rule, fitView, relayout key, radial and force layouts" (2.4, 2.7), §7 "On the deck.gl canvas" (2.3 atlas at `--cell-mesh`, `IconLayer sizeUnits pixels`, `PathStyleExtension`, `FillStyleExtension`; the shader upgrade path is noted in the spec, not started), §7.4.3 cursor (2.1, 2.4), §10 reduced motion on the canvas (2.5, 2.6, 2.7), §11 Phase 2 checklist and acceptance (2.9). Inventory §5: every Keep/Improve row appears in 2.9 §3.7; `#ring-canvas` is dropped as the inventory says.
- Type consistency: `GlyphId`, `IconAtlas`, `buildAtlas`, `haloFor` match A.16; `LAYER_IDS` string ids match A.17's order list (`halos` for "4a halos", `observer-rings` for "4b", `reticle` for "5"); `particlesFor` uses A.15 `ParticleKind` (`'spam'`, not `'sybil'`); `nodeRadiusPx` is the single radius function used by 2.4–2.8 tests.
- Review Focus 1–5 are pinned to Tasks 2.4 (empty visible set, StrictMode, atlas rebuild), 2.6 (endpoint leaves visible set), 2.8 (hovered id vanished), 2.3 (atlas key).
- Proportion: the only code in the plan is test code and signatures; layer bodies are described by their deck.gl props, which the signature and the tests do not determine.

---

## Phase gate (spec §11 Phase 2, verbatim)

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

Every phase ends with `cd web && npx tsc --noEmit && npm run lint && npm run build` green and
`make check` still green for `frontend/` and `backend/`.

**Cut rule**: if phase 2 is not rendering the live mesh by the
evening of Mon 27 Oct, stop the port, present from `master`, and spend the remaining days on
phases 5–6 only (the landing and video do not depend on the port).

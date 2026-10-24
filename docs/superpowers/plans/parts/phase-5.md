# UI Overhaul — Phase 5: dither system, landing page, colorfigure — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship spec §11 Phase 5: the seven dither components, the landing page `/` (nav + menu overlay, hero, the live dithered Fig. 1 plate, readouts, sections, the Fig. 2 sorter colorfigure with buttons 1–3, the Fig. 3 video plate with poster, footer, 390 px layout) and the `/figure/` route, passing the phase's acceptance gate.

**Architecture:** Pure glyphs first (SVG/span components that render on the server and are unit-tested as static markup), then the browser-only canvas pair (`DitherCanvas` + `Loupe`) and the plate-drawing module that turns the baked `plate-frames.json` into frames, then the landing is assembled top to bottom in page order, one task per band of the page, so every task leaves `/` renderable. The colorfigure is built with the owner's `colorfigures` skill as a standalone HTML and embedded last. Canvas and UI behaviour is accepted by a scripted browser walk (chrome-devtools MCP or the documented manual sequence); pure modules and static markup by vitest (jsdom, `react-dom/server`).

**Tech Stack:** Next 16.4.3 static export, React 19.3.1, TypeScript 5.9.3, zustand 5.0.16 (read-only here), vitest + jsdom, the `colorfigures` skill (`~/.claude/skills/colorfigures`, headless Chrome for verification), `scripts/reel-stats.mjs` (Node ESM).

**Spec:** `/home/yks/Projects/luminar/docs/superpowers/specs/2026-10-24-ui-overhaul-design.md` §4.1, §4.3, §5, §6.1, §7 (incl. §7.4), §8, §10, §11 Phase 5, §12, §13. Shared contract: `/home/yks/Projects/luminar/docs/superpowers/plans/2026-10-24-ui-overhaul-interfaces.md` (A.4 copy, A.13 prefs, A.19 dither core, A.20 dither component props, A.21 reel-stats/plate-frames, A.23 colorfigure, A.24 routes and component names). Supporting: `docs/design/backboard-teardown.md` §5–§9 (plate, menu, stamp, dither, parallax recipes), `docs/design/figure-concept.md` (Candidate A parts, buttons, stats, labels), `docs/design/tokens.css`, `docs/design/ui-inventory.md` §1 (Reduced motion, GitHub link), §3 (`?reel=` stays phase 4's), §10 (manifest shape).

## New interfaces introduced by this phase

(Names the assembler merges into the contract; nothing in A.1–A.24 is renamed.)

| Path / name | Signature or shape | Why |
|---|---|---|
| `web/components/dither/parallax.ts` | `export function attachParallax(root: HTMLElement): () => void` (the testable body) · `export function useParallax(ref: React.RefObject<HTMLElement \| null>): void` — on scroll/resize (rAF-throttled) sets `transform: translate3d(0, ((p − .5) × travel × depth)px, 0)` on every `[data-depth]` descendant, `p = clamp((innerHeight − rect.top) / (innerHeight + rect.height), 0, 1)`, `travel` = computed `--parallax-travel` (−170; 0 under reduced motion → no listeners) | teardown §9 `parallax()` as a hook; Figure calls it |
| `web/components/dither/DitherImage.tsx` | `'use client'`; `export default function DitherImage(props: { src: string; alt: string; cell?: number; depth?: number; focus?: [number, number]; loupe?: boolean; className?: string }): JSX.Element` — loads `src` into an `HTMLImageElement`, shows a `--dither-25` skeleton until `decode()` resolves, then renders `<DitherCanvas source={img} …/>` | a server component cannot construct an `HTMLImageElement`; used by "Same names" stills and the Fig. 3 poster |
| `web/components/dither/glyphs.module.css` | one CSS module shared by Reticle, HaloRing, Diamond, Stamp | four 10-line modules would be noise |
| `HaloRingProps.cell?: number` | default 4 (`--cell-ui`); the Legend passes 2 | A.20 addition (optional prop) |
| `web/components/landing/plate-draw.ts` | `export interface PlateFrames { reel: string; from: number; to: number; step: number; geo?: boolean; nodes: { id: string; x: number; y: number }[]; edges: [number, number][]; bounds: { minX: number; minY: number; maxX: number; maxY: number }; frames: PlateFrame[] }` · `export interface PlateFrame { t: number; s: string; b: string; a: { id: string; x: number; y: number; p: boolean; v: number[] }[]; m: [number, number][]; r: { peers: number; sybil: number; pruned: number }; stamp: string }` (A.21 typed; `geo` is new: y is negated when true) · `export type PlateLayer = 'base' \| 'attackers' \| 'loupe'` · `export const PLATE_FPS = 2` · `export const STILL_T = 11.9` · `export function plateTransform(bounds: PlateFrames['bounds'], w: number, h: number, pad = 0.08): (x: number, y: number) => [number, number]` (uniform fit + centre; degenerate bounds → scale 1) · `export function frameIndexAt(plate: PlateFrames, t: number): number` (first index with `frames[i].t ≥ t`, else last) · `export function drawPlateFrame(ctx: CanvasRenderingContext2D, plate: PlateFrames, i: number, w: number, h: number, layer: PlateLayer): void` | the Fig. 1 offscreen draw, split so attackers stay un-dithered and ids appear only under the loupe |
| `web/lib/reel-cards.json` | `Record<string /* manifest name */, PlateFrames>` with exactly one frame per reel (`stamp: ''`) | §7.4.1 reel cards in the menu overlay |
| `scripts/reel-stats.mjs` additions | `export function computeCard(lines: string[], meta: { name: string; real?: boolean }): PlateFrames` · `export const CARDS_MAX_BYTES = 40_000`; `main()` also writes `lib/reel-cards.json` from every manifest entry | same script, one more output |
| `web/components/landing/PlateReplay.tsx` | `'use client'`; `export default function PlateReplay(props: { plate: PlateFrames; className?: string }): JSX.Element` | named in A.24; props pinned here |
| `web/components/landing/FigureFrame.tsx` | `export default function FigureFrame(props: { press?: string; fullBleed?: boolean }): JSX.Element` — the `<iframe>` of `/figures/sorter.html`; `press` appended as `?press=<encodeURIComponent>`; `fullBleed` → `position:fixed; inset:0`, eager; otherwise `loading="lazy"`, fills the plate | shared by the Fig. 2 plate and `/figure/` |
| `web/app/figure/FigureRoute.tsx` | `'use client'`; reads `useSearchParams().get('press')` and renders `<FigureFrame fullBleed press={…}/>`; mounted under `<Suspense>` by `app/figure/page.tsx` | keeps `useSearchParams` off the landing |
| `web/public/stills/grafana.png`, `web/public/stills/jaeger.png` | copies of `assets/readme/grafana.png` / `jaeger.png` (1440×840) | static export serves only `public/` |
| `web/figures/sorter/figure.html` press alias | before `mountFigure`, `history.replaceState` rewrites `press=…Sybil@…` → `Bolt on a Sybil@` (the engine matches button text by prefix) | A.23's `Sybil` short name vs `core.js` `startsWith` matching |
| `Figure` sets `data-narrow="1"` on `.plate` while its width `< narrowAt` | children size themselves (`[data-narrow] .halo { … }`) | the 450 px rule is a ResizeObserver, not a media query |

## Global Constraints

- Backend untouched; `/` , `/figure/` are static export output (`output: 'export'`, `trailingSlash: true`) (spec §3, §4.2).
- Plain CSS: `app/globals.css` = `tokens.css` verbatim + base rules; one CSS Module per component (plus the shared `glyphs.module.css` above); no CSS-in-JS, no Tailwind (spec §4.3).
- Fonts self-hosted via `next/font/local`; no Google Fonts, Fontshare, CDN, `next/image`, YouTube embed at build or run time; `/` must load offline after first paint (spec §2 anti-goals, §4.6).
- Honesty copy only from `lib/copy.ts` (`MECHANISM`, `RECORDING_NOT_RUN`, `ARRIVAL`, `PROVENANCE`, `SAME_NAMES`, `FIG1`, `FIG2`, `FIG3`, `EVENT_LINE`, `REPO_URL`); `web/lib/copy.test.ts` must stay green (no `FORBIDDEN` phrase outside `copy.ts`) (spec §4.10, A.4).
- `--flame` only for attacker / fault / alarm; never hover, link, CTA, brand (spec §5). Flame on signal never (spec §10).
- Dither is allowed only on: Fig. 1 replay, Fig. 3 poster, Grafana/Jaeger stills, HaloRing (density), loading skeletons; never on text, numerals, the `Diamond`, particles, focus rings, stamps, menus, toasts (spec §7).
- The only floating objects on any plate are `HaloRing` and `Diamond`; no orange trapezoid shard, no grey halftone slab, anywhere (spec §7.4.2, owner 24 Oct).
- Stamps ≤ 24 characters (spec §12). Square corners everywhere (`--r-0`); the only curve is a node (spec §5).
- Reduced motion: every `--d-*`, `--stagger`, `--parallax-travel` already go to 0 in tokens; the reveal jumps to the final cell, Fig. 1 is the T+11.9 still, menu rows appear without rise; the loupe stays (spec §10). Use `reducedMotion()` from `@/lib/prefs` (A.13), never a second `matchMedia` string.
- Accessibility: WCAG AA pairs only (`paper-2` is the smallest text colour; `paper-3` never text); `:focus-visible` 2 px `--focus` outline everywhere; nav overlay is `role="dialog"` with focus trap and Escape; 44 px hit targets on the strip at ≤1023 px; tabular numerals on every readout; Lighthouse accessibility ≥ 90 on `/`, `/sim/`, `/reels/sybil-eclipse/` (spec §10, §11).
- Colorfigure: buttons 1–3 only (`Post`, `Heartbeat`, `Bolt on a Sybil`); 4–5 deferred (spec §13.4); every stat pill says `(toy)`; built with `python3 ~/.claude/skills/colorfigures/scripts/build.py` (spec §8).
- Video: silent, `public/video/launch-16x9.mp4` ≤ 12 MB lands in phase 6; phase 5 ships the plate with poster handling (spec §6.1 item 7, §13.3).
- Commits `type(web): message`. Every task ends with `cd /home/yks/Projects/luminar/web && npx tsc --noEmit && npm run lint && npx vitest run` green and `make check` (repo root) still green (spec §11).

## Review Focus

1. **A plate frame before the Sybils (T+8–10: `a: []`, `m: []`) or a card with degenerate bounds** (every node at the same x): `drawPlateFrame` must draw without throwing and `plateTransform` must return finite coordinates (scale 1, centred) rather than `Infinity`/`NaN` — test in Task 5.4.
2. **A stamp longer than 24 characters** (a future beat string): `Stamp` must stay on one line (`white-space: nowrap`) and warn once in development instead of wrapping across the plate — test in Task 5.1.
3. **Loupe and parallax on a coarse pointer, under reduced motion, or during SSR** (`window` undefined): no listeners attached, no crash, markup still renders the plate — tests in Tasks 5.2 and 5.3.
4. **Menu overlay opened then closed by Escape or an outside click**: `document.body.style.overflow` returns to `''` and focus returns to the `Menu` button; a route change while open must not leave the page unscrollable — test in Task 5.6.
5. **`?press=` with the spec's short name `Sybil`** (the engine matches button text by prefix, and the button reads `Bolt on a Sybil`): the alias must map it, and an unknown label must surface on `<html data-errors>` rather than silently doing nothing — test in Task 5.8.

---

### Task 5.1: Glyphs — Reticle (+ cursor), HaloRing, Diamond, Stamp

**Files:**
- Create: `web/components/dither/Reticle.tsx`, `web/components/dither/HaloRing.tsx`, `web/components/dither/Diamond.tsx`, `web/components/dither/Stamp.tsx`, `web/components/dither/glyphs.module.css`
- Modify: `web/vitest.config.ts` (add `esbuild: { jsx: 'automatic' }` so `.tsx` modules load under vitest; keep `include: ['**/*.test.ts']`)
- Test: `web/components/dither/glyphs.test.ts`

**Accepted by:** vitest (static markup via `react-dom/server`).

**Interfaces:**
- Consumes: `bayer`, `BAYER8` from `@/components/dither/dither` (A.19); `BAND_DENSITY`, `ScoreBand` from `@/components/map/palette` (A.15).
- Produces: A.20 `ReticleProps`, `RETICLE_CURSOR`, `HaloRingProps` (+ `cell?`), `DiamondProps`, `StampProps`; all four are plain React (no `next/*`, no hooks except `useId` in Diamond), so Remotion (phase 6) and the Legend (Task 5.11) can import them.

- [ ] **Step 1: Write the failing tests** (`import { createElement as h } from 'react'`, `import { renderToStaticMarkup as r } from 'react-dom/server'`)

```ts
test('RETICLE_CURSOR is an SVG data cursor with a 7,7 hotspot and crosshair fallback', () => {
  expect(RETICLE_CURSOR.startsWith('url("data:image/svg+xml,')).toBe(true)
  expect(RETICLE_CURSOR.endsWith('") 7 7, crosshair')).toBe(true)
  expect(decodeURIComponent(RETICLE_CURSOR)).toContain("width='14'")
})
test('Reticle renders a 14 px ring with four ticks in paper with a pitch outline', () => {
  const m = r(h(Reticle, { title: 'selected' }))
  expect(m).toContain('<title>selected</title>'); expect(m).toContain('width="14"')
  expect((m.match(/<line /g) ?? []).length).toBe(4); expect(m).toContain('var(--paper-0)'); expect(m).toContain('var(--pitch-0)')
})
test('HaloRing lights exactly the Bayer cells under the band density', () => {
  for (const [band, n] of [[0, 8], [1, 22], [2, 42], [3, 64]] as const) {
    const m = r(h(HaloRing, { size: 64, band })); expect((m.match(/<rect /g) ?? []).length).toBe(n)
  }
  expect(r(h(HaloRing, { size: 64 }))).toContain('var(--paper-0)')                       // default band 2, paper cells
  expect(r(h(HaloRing, { size: 64, band: 0, flame: true }))).toContain('var(--flame)')   // flame cells
  expect(r(h(HaloRing, { size: 64, depth: 0.35 }))).toContain('data-depth="0.35"')
  expect(r(h(HaloRing, { size: 64, cell: 2 }))).toContain('width="16"')                  // pattern tile = 8 × cell
})
test('Diamond: grafted is a flame rhombus with a 45° hatch; pruned is hollow and dashed; never a canvas', () => {
  const g = r(h(Diamond, { size: 28, label: 'attacker' }))
  expect(g).toContain('points="50,0 100,50 50,100 0,50"'); expect(g).toContain('fill="var(--flame)"'); expect(g).toContain('patternTransform="rotate(45)"'); expect(g).toContain('<title>attacker</title>')
  const p = r(h(Diamond, { size: 28, pruned: true }))
  expect(p).toContain('fill="none"'); expect(p).toContain('stroke="var(--paper-3)"'); expect(p).toContain('stroke-dasharray="3 2"')
  expect(g + p).not.toContain('<canvas')
})
test('Stamp: Manrope uppercase label, tilt variable, flame variant, nowrap, warns over 24 chars', () => {
  const m = r(h(Stamp, { children: 'SYBIL FLOOD · T+10S', depth: 1.2 }))
  expect(m).toContain('SYBIL FLOOD · T+10S'); expect(m).toContain('data-depth="1.2"'); expect(m).toContain('--stamp-tilt:3deg')
  expect(r(h(Stamp, { children: 'X', flame: true }))).toContain('var(--flame)')
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  r(h(Stamp, { children: 'THIS STAMP IS FAR TOO LONG FOR A PLATE' })); expect(warn).toHaveBeenCalledTimes(1); warn.mockRestore()
})
```

- [ ] **Step 2: Run to verify failure**

Run: `cd /home/yks/Projects/luminar/web && npx vitest run components/dither/glyphs.test.ts`
Expected: FAIL (modules not found / JSX not configured).

- [ ] **Step 3: Implement the four glyphs in `web/components/dither/`**

- `Reticle.tsx`: `export default function Reticle({ size = 14, className, title }: ReticleProps)` → inline `<svg width={size} height={size} viewBox="0 0 14 14" role="img">`: `<circle cx=7 cy=7 r=4.5>` stroke `var(--paper-0)` 1 px over a `var(--pitch-0)` 3 px outline circle, four `<line>` ticks of 4 px at N/E/S/W (from r 5 to r 9… clipped to the 14 box: ticks run 0→3 and 11→14 on each axis), `stroke-width="1"`. `export const RETICLE_CURSOR` = the same drawing serialised as `url("data:image/svg+xml,<encodeURIComponent svg with width='14' height='14'>") 7 7, crosshair`.
- `HaloRing.tsx`: `export default function HaloRing({ size, band = 2, flame = false, depth, className, cell = 4 }: HaloRingProps)` → `<svg width={size} height={size} viewBox="0 0 size size" data-depth={depth} aria-hidden="true" shape-rendering="crispEdges">` with `<defs><pattern id={`halo-${band}-${cell}-${flame ? 'f' : 'p'}`} patternUnits="userSpaceOnUse" width={8*cell} height={8*cell}>` containing one `<rect x={cx*cell} y={cy*cell} width={cell} height={cell} fill=paper|flame>` for every `(cx, cy)` with `bayer(cx, cy) < BAND_DENSITY[band]`; an annulus path (outer R = size/2, inner 0.6 R, `fill-rule="evenodd"`) filled with `url(#id)`; a 1 px `var(--paper-0)` outer rim circle. Cell colour `var(--flame)` when `flame`, else `var(--paper-0)`. Same thresholds as the atlas halos (A.16), by construction. The id is deterministic on purpose: identical instances share one definition, and SSR output never changes between renders.
- `Diamond.tsx`: `export default function Diamond({ size, pruned = false, depth, className, label }: DiamondProps)` → `<svg width={size} height={size} viewBox="0 0 100 100" role="img" data-depth>`; `label` → `<title>`; grafted: `<polygon points="50,0 100,50 50,100 0,50" fill="var(--flame)"/>` + the same polygon filled with `url(#hatch-<useId>)` where the pattern is `patternUnits="userSpaceOnUse" width=3 height=3 patternTransform="rotate(45)"` holding a 1×3 rect in `rgb(11 11 13 / .55)` (= `--hatch`); pruned: one polygon `fill="none" stroke="var(--paper-3)" stroke-width="1" stroke-dasharray="3 2"` with `vector-effect="non-scaling-stroke"`. (§6.2 render table decides the shapes: grafted hatched flame, pruned hollow dashed; §7's "hatch when pruned" is superseded by the table, which §12 makes non-negotiable.)
- `Stamp.tsx`: `export default function Stamp({ children, tilt = 3, flame = false, depth, className }: StampProps)` → `<span class=stamp data-depth style={{'--stamp-tilt': `${tilt}deg`}}><span class=inner>{children}</span></span>`; inner: `font: 600 var(--t-stamp) var(--font-ui)`, `letter-spacing: var(--track-stamp)`, `text-transform: uppercase`, `padding: .55em 1.1em`, `background: var(--paper-0); color: var(--pitch-0)` (flame: `var(--flame)` / `var(--on-flame)`), `transform: rotate(var(--stamp-tilt))`, `box-shadow: var(--stamp-shadow)`, `white-space: nowrap`; `if (process.env.NODE_ENV !== 'production' && children.length > 24) console.warn(...)`.
- `glyphs.module.css`: the stamp rules above plus `.halo, .diamond { position: absolute; pointer-events: none }` helpers.

- [ ] **Step 4: Run to verify pass**

Run: `cd /home/yks/Projects/luminar/web && npx vitest run components/dither/glyphs.test.ts && npx tsc --noEmit && npm run lint`
Expected: PASS, clean.

- [ ] **Step 5: Commit**

```bash
git add web/components/dither/Reticle.tsx web/components/dither/HaloRing.tsx web/components/dither/Diamond.tsx web/components/dither/Stamp.tsx web/components/dither/glyphs.module.css web/components/dither/glyphs.test.ts web/vitest.config.ts
git commit -m "feat(web): reticle cursor, Bayer halo ring, attacker diamond and stamp glyphs"
```

### Task 5.2: Figure plate and the parallax hook

**Files:**
- Create: `web/components/dither/Figure.tsx`, `web/components/dither/Figure.module.css`, `web/components/dither/parallax.ts`
- Test: `web/components/dither/Figure.test.ts`

**Accepted by:** vitest (static markup + `attachParallax` in jsdom).

**Interfaces:**
- Consumes: `Stamp`, `RETICLE_CURSOR` (5.1); `reducedMotion()` from `@/lib/prefs` (A.13).
- Produces: A.20 `FigureProps`; `useParallax(ref)`; `.plate[data-narrow="1"]`.

- [ ] **Step 1: Write the failing tests**

```ts
test('Figure renders the plate, Fig. N label, italic caption, aspect and optional stamp', () => {
  const m = r(h(Figure, { n: 2, caption: 'Same mechanism, toy constants.', aspect: '16 / 9', stamp: 'SORTER No. 6' }, h('div', { id: 'kid' })))
  expect(m).toContain('<figure'); expect(m).toContain('class="plate'); expect(m).toContain('aspect-ratio:16 / 9')
  expect(m).toContain('Fig. 2'); expect(m).toContain('<em>Same mechanism, toy constants.</em>'); expect(m).toContain('SORTER No. 6'); expect(m).toContain('id="kid"')
  expect(m).toContain('--cursor-reticle:url(')
})
test('Figure defaults: aspect 16 / 6.4, narrowAspect 4 / 3, narrowAt 450; no stamp when omitted', () => {
  const m = r(h(Figure, { n: 1, caption: 'c' }, 'x')); expect(m).toContain('aspect-ratio:16 / 6.4'); expect(m).toContain('data-narrow-at="450"'); expect(m).not.toContain('class="stamp')
})
test('useParallax is inert without a window or under reduced motion', () => {
  // SSR: renderToStaticMarkup of a component calling useParallax must not throw (effects never run)
  expect(() => r(h(Figure, { n: 1, caption: 'c' }, 'x'))).not.toThrow()
  // reduced motion: matchMedia stub → attachParallax returns a no-op and adds no scroll listener
  vi.stubGlobal('matchMedia', () => ({ matches: true }))
  const add = vi.spyOn(window, 'addEventListener'); const off = attachParallax(document.createElement('div')); off()
  expect(add.mock.calls.some(c => c[0] === 'scroll')).toBe(false); vi.unstubAllGlobals()
})
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run components/dither/Figure.test.ts` → FAIL.

- [ ] **Step 3: Implement `parallax.ts` and `Figure.tsx`**

- `parallax.ts`: `export function attachParallax(root: HTMLElement): () => void` — teardown §9 verbatim with `travel = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--parallax-travel')) || 0`; returns a no-op when `reducedMotion()` or `travel === 0` or no `[data-depth]` children; early-out when the root is > 100 px off-screen. `export function useParallax(ref)` = `useEffect(() => ref.current ? attachParallax(ref.current) : undefined, [])`.
- `Figure.tsx` (`'use client'`): `<figure class={styles.figure}>` → `<div ref class="plate {styles.plate}" data-narrow-at={narrowAt} data-narrow={narrow ? '1' : undefined} style={{ aspectRatio: narrow ? narrowAspect : aspect, '--cursor-reticle': RETICLE_CURSOR }}>{children}{stamp && <Stamp className={styles.stamp}>{stamp}</Stamp>}</div>` → `<figcaption class={narrow ? styles.capLeft : ''}><span class={styles.fig}>Fig. {n}</span><em>{caption}</em></figcaption>`. `narrow` from a `ResizeObserver` on the plate (`width < narrowAt`), initial `false`. `useParallax(plateRef)`.
- `Figure.module.css`: `.plate { position: relative; overflow: hidden; background: var(--pitch-0); width: 100%; max-width: var(--col-wide); margin-inline: auto }`; `@media (hover: hover) and (pointer: fine) { .plate { cursor: var(--cursor-reticle) } }`; `figcaption { margin-top: .6rem; text-align: right; font: italic var(--t-fig)/1.4 var(--font-display); color: var(--fg-3) }`; `.capLeft { text-align: left }`; `.fig { font: 600 12px var(--font-ui); font-style: normal; letter-spacing: .04em; color: var(--fg); margin-right: .5em }`; `.stamp { position: absolute; left: 56%; top: 24% }` (default stamp slot; PlateReplay positions its own).

- [ ] **Step 4: Run to verify pass** — `npx vitest run components/dither && npx tsc --noEmit && npm run lint` → PASS.

- [ ] **Step 5: Commit**

```bash
git add web/components/dither/Figure.tsx web/components/dither/Figure.module.css web/components/dither/parallax.ts web/components/dither/Figure.test.ts
git commit -m "feat(web): Figure plate with caption, narrow aspect and parallax layers"
```

### Task 5.3: DitherCanvas, Loupe, DitherImage

**Files:**
- Create: `web/components/dither/DitherCanvas.tsx`, `web/components/dither/DitherCanvas.module.css`, `web/components/dither/Loupe.tsx`, `web/components/dither/DitherImage.tsx`
- Create: `web/public/stills/grafana.png`, `web/public/stills/jaeger.png` (`cp assets/readme/{grafana,jaeger}.png web/public/stills/`)
- Modify: `web/app/page.tsx` — keep the phase-4 `?reel=` redirect island as the first child; below it render `<Figure n={0} caption="dither check"><DitherImage src="/stills/grafana.png" alt="Grafana dashboard with the gossipsub_* series" depth={0.6} loupe/></Figure>` (a scaffold that Task 5.10 turns into the "Same names" plate)
- Test: `web/components/dither/DitherCanvas.test.ts`

**Accepted by:** vitest for markup and mount safety; **browser walk** for reveal, loupe, resize (canvas 2D does not exist in jsdom).

**Interfaces:**
- Consumes: `drawDither`, `drawLoupe`, `revealSteps`, `coverRect`, `REVEAL_STEP_MS`, `LOUPE_PX` from `@/components/dither/dither` (A.19); `reducedMotion()`.
- Produces: A.20 `DitherCanvasProps`, `LoupeProps`; `DitherImage`; the canvas carries `data-dither="1"` (Loupe finds it under `plateRef`).

- [ ] **Step 1: Write the failing tests**

```ts
test('DitherCanvas markup: pixelated canvas with label, depth and the dither marker', () => {
  const m = r(h(DitherCanvas, { source: () => {}, 'aria-label': 'fifty peers', depth: 0.6 }))
  expect(m).toContain('<canvas'); expect(m).toContain('data-dither="1"'); expect(m).toContain('aria-label="fifty peers"'); expect(m).toContain('role="img"'); expect(m).toContain('data-depth="0.6"')
})
test('mounting without IntersectionObserver or canvas 2D does not throw and schedules nothing', () => {
  // jsdom: no IntersectionObserver, getContext() → null, clientWidth 0 → drawDither returns null
  ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
  const host = document.body.appendChild(document.createElement('div')); const root = createRoot(host)
  expect(() => act(() => root.render(h(DitherCanvas, { source: () => {}, reveal: true })))).not.toThrow()
  expect(host.querySelector('canvas[data-dither]')).toBeTruthy(); expect(() => act(() => root.unmount())).not.toThrow()
})
test('Loupe renders nothing on the server and on coarse pointers', () => {
  expect(r(h(Loupe, { plateRef: { current: null }, final: null, source: null, cover: [0, 0, 1, 1] }))).toBe('')
})
test('DitherImage shows the --dither-25 skeleton until the image decodes', () => {
  const m = r(h(DitherImage, { src: '/stills/grafana.png', alt: 'g' })); expect(m).toContain('skeleton'); expect(m).not.toContain('<canvas')
})
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run components/dither/DitherCanvas.test.ts` → FAIL.

- [ ] **Step 3: Implement**

- `DitherCanvas.tsx` (`'use client'`): renders `<canvas data-dither="1" role="img" aria-label className data-depth style="image-rendering:pixelated">` sized by CSS (`position:absolute; inset:0; width:100%; height:100%`). Effect: `finalCell = props.cell ?? parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--cell-final')) || 3`; `sourceEl` = the image/canvas, or for a callback an offscreen `<canvas>` of the canvas's CSS size that the callback paints before every pass; `render(cell)` = paint callback (if any) then `drawDither(canvas, sourceEl, cell, { contrast: DITHER_CONTRAST, positive: true, focus })`, and when `cell === finalCell` keep the returned `ImageData` in state → `onFinal?.(img)`. Reveal: if `reveal !== false` and `IntersectionObserver` exists and `!reducedMotion()`, observe the canvas at `threshold: 0.3`, and on first ≥ 30 % run `revealSteps(finalCell)` one every `REVEAL_STEP_MS` (`setTimeout` chain; cleared on unmount); otherwise `render(finalCell)` at once (no `IntersectionObserver` ⇒ immediate final). Loop: when `loop` is set, after the reveal completes `setInterval(() => !loop.paused && render(finalCell), 1000 / loop.fps)`; reveal steps ignore loop ticks. Resize: `ResizeObserver` on `canvas.parentElement`, debounced 120 ms → `render(currentCell)`. `loupe` → renders `<Loupe plateRef={canvas.parentElement ref} final={final} source={sourceEl} cover={coverRect(...)} size={LOUPE_PX}/>`. Nothing runs when `drawDither` returns `null` (no size).
- `Loupe.tsx` (`'use client'`): returns `null` always (it only attaches listeners). Effect: bail unless `typeof window !== 'undefined' && matchMedia('(hover: hover) and (pointer: fine)').matches && final && source && plateRef.current`; `canvas = plateRef.current.querySelector('canvas[data-dither]')`; `pointermove` on `document` → inside the plate rect ⇒ `drawLoupe(ctx, final, source, cover, x, y, size)` (CSS px relative to the canvas), outside ⇒ `ctx.putImageData(final, 0, 0)` once; `pointerleave` on the plate and `window blur` ⇒ restore; re-run at the last pointer position whenever `final` changes (Fig. 1 redraws at 2 Hz).
- `DitherImage.tsx` (`'use client'`): `useEffect` → `const img = new Image(); img.decoding = 'async'; img.src = src; img.decode().then(() => setImg(img)).catch(() => setFailed(true))`; before load: `<div class="skeleton" style="background: var(--dither-25)" aria-hidden/>` filling the plate; after: `<DitherCanvas source={img} aria-label={alt} …/>`; on failure the skeleton stays.
- `DitherCanvas.module.css`: `.canvas { position:absolute; inset:0; width:100%; height:100%; image-rendering: pixelated }`, `.skeleton { position:absolute; inset:0; background: var(--dither-25) }`.

- [ ] **Step 4: Run to verify pass** — `npx vitest run components/dither && npx tsc --noEmit && npm run lint` → PASS.

- [ ] **Step 5: Browser walk** (`cd web && npm run dev`, open `http://localhost:3000/` at 1440×900 with a mouse; chrome-devtools: `navigate_page`, `take_screenshot`, `emulate`)

1. Scroll the plate into view: it resolves from 28 px blocks to 3 px cells in eight steps over ≈ 1.05 s (screenshot at 0.3 s shows ≥ 20 px blocks; at 1.5 s fine cells). Expected: 1-bit paper on pitch, no grey pixels (zoom a screenshot 4×).
2. Move the pointer over the plate: a 132 px square shows the greyscale Grafana screenshot with a 1 px paper border; leaving the plate restores the dither. Cursor over the plate is the reticle (ring + four ticks), not an arrow.
3. `emulate` `prefers-reduced-motion: reduce` and reload: the plate appears at 3 px immediately (no step visible in a 0.1 s screenshot); the loupe still works.
4. Resize the window to 1000 px wide: after ≈ 120 ms the plate redraws at 3 px without blur.
5. Console: no errors.

- [ ] **Step 6: Commit**

```bash
git add web/components/dither/DitherCanvas.tsx web/components/dither/DitherCanvas.module.css web/components/dither/Loupe.tsx web/components/dither/DitherImage.tsx web/components/dither/DitherCanvas.test.ts web/public/stills web/app/page.tsx
git commit -m "feat(web): DitherCanvas with progressive reveal, loupe and dithered image wrapper"
```

### Task 5.4: Plate drawing module and one-frame reel cards

**Files:**
- Create: `web/components/landing/plate-draw.ts`, `web/lib/reel-cards.json`
- Modify: `web/scripts/reel-stats.mjs` (add `computeCard`, `CARDS_MAX_BYTES`, write `lib/reel-cards.json` from every `public/reels/manifest.json` entry in `main()`)
- Test: `web/components/landing/plate-draw.test.ts`, `web/scripts/reel-cards.test.ts`

**Accepted by:** vitest (pure functions with a recording `ctx` proxy; the script against the real reels).

**Interfaces:**
- Consumes: `lib/plate-frames.json` shape (A.21); `BAND_DENSITY` (A.15); `PAPER`, `PITCH`, `FLAME` (A.19) for canvas fill strings.
- Produces: `PlateFrames`, `PlateFrame`, `PlateLayer`, `PLATE_FPS`, `STILL_T`, `plateTransform`, `frameIndexAt`, `drawPlateFrame`; `computeCard`, `CARDS_MAX_BYTES`, `lib/reel-cards.json`.

- [ ] **Step 1: Write the failing tests**

```ts
// plate-draw.test.ts
import plate from '@/lib/plate-frames.json'
test('frameIndexAt finds the first frame at or after t, else the last', () => {
  const p = plate as PlateFrames
  expect(p.frames[frameIndexAt(p, 8)].t).toBe(p.frames[0].t); expect(p.frames[frameIndexAt(p, STILL_T)].t).toBeGreaterThanOrEqual(11.9)
  expect(frameIndexAt(p, 999)).toBe(p.frames.length - 1); expect(PLATE_FPS).toBe(2)
})
test('plateTransform fits bounds into w×h with 8 % padding and survives degenerate bounds', () => {
  const to = plateTransform({ minX: -100, minY: -50, maxX: 100, maxY: 50 }, 620, 248)
  // 200×100 into 620×248 at 8 % pad: s = min(520.8/200, 208.32/100) = 2.0832; scaled 416.64×208.32, centred
  expect(to(-100, -50)[0]).toBeCloseTo(101.68, 2); expect(to(-100, -50)[1]).toBeCloseTo(19.84, 2); expect(to(0, 0)).toEqual([310, 124])
  const d = plateTransform({ minX: 3, minY: 3, maxX: 3, maxY: 3 }, 100, 100); expect(d(3, 3).every(Number.isFinite)).toBe(true); expect(d(3, 3)).toEqual([50, 50])
})
test('drawPlateFrame draws every layer of a pre-Sybil frame (a: [], m: []) and of a geo card without throwing', () => {
  const calls: string[] = []
  const ctx = new Proxy({}, { get: (_, k) => (k === 'canvas' ? { width: 620, height: 248 } : (...a: unknown[]) => { calls.push(String(k)); return k === 'measureText' ? { width: 10 } : undefined }), set: () => true }) as unknown as CanvasRenderingContext2D
  const p = plate as PlateFrames; const empty = { ...p, frames: [{ ...p.frames[0], a: [], m: [] }] }
  for (const layer of ['base', 'attackers'] as const) expect(() => drawPlateFrame(ctx, empty, 0, 620, 248, layer)).not.toThrow()
  expect(calls).toContain('arc'); expect(calls.filter(c => c === 'fillText')).toHaveLength(0)        // no text outside the loupe layer (spec §7: never dither text)
  calls.length = 0; drawPlateFrame(ctx, empty, 0, 620, 248, 'loupe'); expect(calls.filter(c => c === 'fillText').length).toBeGreaterThanOrEqual(50)   // one id per node
  const geo = { ...p, geo: true, bounds: { minX: -450, minY: -145, maxX: 450, maxY: 210 } }; expect(() => drawPlateFrame(ctx, geo, 0, 96, 60, 'base')).not.toThrow()
})
// reel-cards.test.ts
const manifest = JSON.parse(readFileSync(join(__dirname, '../public/reels/manifest.json'), 'utf8')) as ReelMeta[]
test('computeCard: one frame per reel, honest nodes sized to the frame, geo flag on real reels, under the byte cap', () => {
  const cards = Object.fromEntries(manifest.map(m => [m.name, computeCard(readFileSync(join(__dirname, '../public', m.file), 'utf8').split('\n').filter(Boolean), m)]))
  for (const m of manifest) { const c = cards[m.name]; expect(c.frames).toHaveLength(1); expect(c.frames[0].s).toHaveLength(c.nodes.length); expect(c.frames[0].b).toHaveLength(c.nodes.length); expect(c.frames[0].stamp).toBe('') }
  expect(cards['sybil-eclipse'].nodes).toHaveLength(50); expect(cards['mainnet-block-wave'].geo).toBe(true); expect(cards['mainnet-block-wave'].nodes.length).toBeGreaterThanOrEqual(100)
  expect(cards['sybil-eclipse'].frames[0].a.length).toBeGreaterThan(0)       // the chosen frame shows the Sybils
  expect(JSON.stringify(cards).length).toBeLessThan(CARDS_MAX_BYTES)
})
test('lib/reel-cards.json is committed and matches the manifest names', () => { expect(Object.keys(JSON.parse(readFileSync(join(__dirname, '../lib/reel-cards.json'), 'utf8'))).sort()).toEqual(manifest.map(m => m.name).sort()) })
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run components/landing/plate-draw.test.ts scripts/reel-cards.test.ts` → FAIL.

- [ ] **Step 3: Implement `plate-draw.ts`**

`drawPlateFrame(ctx, plate, i, w, h, layer)` with `to = plateTransform(plate.bounds, w, h)` and `y → plate.geo ? −y : y`; `r = clamp(w / 120, 3, 6)`; frame `f = plate.frames[i]`:
- `base` (dithered later, so greys are densities): fill `rgb(11,11,13)`; edges: 1 px `rgba(242,242,239,.16)` lines; per honest node `k` with state `f.s[k]` and band `f.b[k]`: halo disc at `1.7 r` filled grey `rgb(v,v,v)` with `v = round(255 × BAND_DENSITY[band])` for bands 1–3 (band 0 draws nothing here); glyph by state — `i` disc `#37383b` + 1 px `#696964` rim · `o` paper disc + pitch centre dot `0.35 r` · `r` paper disc · `d` paper disc + 1 px paper ring at `1.6 r` · `j` hollow 1 px paper-1 disc · `f`/`e` `#696964` disc with an X; hops `f.m`: 1 px paper line at alpha .45 from→to (negative first index `−1−k` = attacker `k`) and a `4 px` paper square at 65 % of the way.
- `attackers` (flat, never dithered): per `f.a`: diamond at `1.15 r` filled `#ff5a2c` when `!p`, hollow `#696964` dashed `[3,2]` when `p`; dashed `[4,3]` `rgba(255,90,44,.55)` links to each victim index in `v` when `!p`; band-0 honest nodes (negative score): a 1 px `#ff5a2c` ring at `1.7 r` (the flame halo, flat at this scale). Clear the canvas first (`clearRect`), transparent background.
- `loupe`: `base`, then ids: `9px 500 "IBM Plex Mono"` paper at `(x + r + 2, y + 3)` — `n${k}` for honest nodes, raw `id` for attackers (flame).

`plateTransform`: `sx = (w × (1 − 2 pad)) / max(1e-9, maxX − minX)`, same for y, `s = min(sx, sy)`; if `maxX === minX && maxY === minY` then `s = 1`; centre the scaled bounds in `w × h`.

- [ ] **Step 4: Extend `scripts/reel-stats.mjs` with `computeCard(lines, meta)`**

Pick the card snapshot: for `meta.real` the snapshot with the most nodes whose state ≠ `idle` (`geo: true`, positions `x, y` from the snapshot as-is — the drawer negates y); otherwise the first snapshot with `time ≥ 0.3 × durationSim` (sybil-eclipse → the pruning beat). Build one `PlateFrames` with `nodes` = non-attacker nodes of that snapshot (1-decimal), `edges` = the latest edges frame before it mapped to indexes (`[]` when none), `bounds`, `frames: [{ t, s, b, a, m: [], r, stamp: '' }]` using the same `s`/`b`/`a`/`r` derivations as the plate frames. `main()` reads `public/reels/manifest.json`, writes `lib/reel-cards.json` (`Record<name, PlateFrames>`), exits 1 over `CARDS_MAX_BYTES = 40_000`. Run `npm run reel-stats` and commit the JSON.

- [ ] **Step 5: Run to verify pass**

Run: `cd /home/yks/Projects/luminar/web && npm run reel-stats && npx vitest run components/landing scripts && npx tsc --noEmit && npm run lint`
Expected: PASS; the script prints the three output paths with sizes (`reel-cards.json` < 40 000 bytes).

- [ ] **Step 6: Commit**

```bash
git add web/components/landing/plate-draw.ts web/components/landing/plate-draw.test.ts web/scripts/reel-stats.mjs web/scripts/reel-cards.test.ts web/lib/reel-cards.json
git commit -m "feat(web): plate frame drawing and one-frame reel cards from the recordings"
```

### Task 5.5: Fig. 1 — the live dithered replay plate (`PlateReplay`)

**Files:**
- Create: `web/components/landing/PlateReplay.tsx`, `web/components/landing/PlateReplay.module.css`
- Modify: `web/app/page.tsx` (above the 5.3 scaffold plate: `<Figure n={1} caption={FIG1}><PlateReplay plate={plateFrames}/></Figure>` with `import plateFrames from '@/lib/plate-frames.json'`)
- Test: `web/components/landing/PlateReplay.test.ts`

**Accepted by:** vitest for the SSR markup; **browser walk** for the replay, pause, parallax, loupe, reduced motion.

**Interfaces:**
- Consumes: `DitherCanvas`, `Loupe`, `HaloRing`, `Diamond`, `Stamp`, `Figure` (5.1–5.3); `drawPlateFrame`, `frameIndexAt`, `PLATE_FPS`, `STILL_T` (5.4); `FIG1` (A.4); `reducedMotion()` (A.13).
- Produces: `PlateReplay({ plate, className })`.

- [ ] **Step 1: Write the failing test**

```ts
test('PlateReplay server markup: canvas, halo ring, diamond, readout box and the first beat stamp; no shard, no halftone', () => {
  const p = plate as PlateFrames; const m = r(h(PlateReplay, { plate: p }))
  expect(m).toContain('data-dither="1"'); expect(m).toContain('data-depth="0.6"'); expect(m).toContain('data-depth="0.35"'); expect(m).toContain('data-depth="0.2"'); expect(m).toContain('data-depth="0.8"'); expect(m).toContain('data-depth="1.2"')
  expect(m).toContain('>PEERS<'); expect(m).toContain('>SYBIL<'); expect(m).toContain('>PRUNED<'); expect(m).toContain('>T+<')
  expect(m).toContain(p.frames[frameIndexAt(p, STILL_T)].stamp)     // SSR renders the reduced-motion still frame; the client advances
  expect(m).not.toMatch(/clip-path|halftone|polygon\(/)
  expect(m).toContain('tabindex="0"'); expect(m).toContain('aria-label="Fifty peers')
})
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run components/landing/PlateReplay.test.ts` → FAIL.

- [ ] **Step 3: Implement `PlateReplay.tsx` (`'use client'`)**

Layout (all children `position:absolute`, `pointer-events:none` except the root):
```
<div ref={root} className={styles.replay} tabIndex={0} aria-label={FIG1} onPointerEnter/Leave onFocus/Blur>
  <HaloRing size={120} band={2} depth={0.35} className={styles.halo}/>            right 6%  top 8%   ([data-narrow] → size 72 via CSS width/height)
  <div className={styles.canvasWrap} data-depth={0.6}>                           inset: -14% 0  (overscan)
    <DitherCanvas source={drawBase} loop={still ? undefined : { fps: PLATE_FPS, paused }} reveal onFinal={setFinal} aria-label={FIG1}/>
    <canvas ref={overlay} className={styles.overlay} aria-hidden/>               attackers layer, same box, DPR-scaled
  </div>
  <Diamond size={28} depth={0.2} className={styles.diamond} label="attacker"/>   left 4%  top 58%
  <dl className={styles.readout} data-depth={0.8}>                               right 3%  bottom 10%; pitch bg, 1 px --hair, mono --t-body tnum, labels --t-label paper-2
    <dt>PEERS</dt><dd>{r.peers}</dd> <dt>SYBIL</dt><dd>{r.sybil}</dd> <dt>PRUNED</dt><dd>{r.pruned}</dd> <dt>T+</dt><dd>{t.toFixed(1)}s</dd>
  </dl>
  <Stamp depth={1.2} className={styles.stamp}>{frame.stamp}</Stamp>              left 56% top 24%
  <Loupe plateRef={root} final={final} source={loupeCanvas} cover={[0, 0, w, h]} size={LOUPE_PX}/>
</div>
```
State: `still = reducedMotion()` (computed in an effect; SSR and first paint use the still index `frameIndexAt(plate, STILL_T)` so server markup is deterministic); `idx` in a ref, advanced by `setInterval(500)` while `!still && !paused`, looping `0 … frames.length − 1`; a React state mirror `{ t, r, stamp }` updated on each advance (2 Hz re-render of text only). `drawBase = (ctx, w, h) => { drawPlateFrame(ctx, plate, idx, w, h, 'base'); drawOverlay(w, h); drawLoupeSource(w, h) }` where `drawOverlay` clears and draws the `attackers` layer on `overlay` (sized `w×h × dpr`) and `drawLoupeSource` draws the `loupe` layer into a module-held offscreen canvas handed to `<Loupe source>`. `paused` ⇐ pointer inside or focus within. No orange shard, no halftone slab (spec §7.4.2).

- [ ] **Step 4: Run to verify pass** — `npx vitest run components/landing && npx tsc --noEmit && npm run lint` → PASS.

- [ ] **Step 5: Browser walk** (`npm run dev`, `http://localhost:3000/`, 1440×900, mouse)

1. Scroll Fig. 1 into view: reveal 28→3 px once; then the plate animates at 2 frames/s from `T+8.0s` to `T+24.0s` and loops; the readout `T+` counts, `SYBIL` goes 0→5 at T+10, `PRUNED` climbs to 5 by ≈ T+13; the stamp reads `SYBIL FLOOD · T+10S` → `3/5 PRUNED · T+13S` (or the data's count) → `ECLIPSE · N10 · T+16S` → `CLEARED · T+24S`.
2. Five flame diamonds with dashed links appear at T+10 crisp (not dithered); they turn hollow dashed as they are pruned.
3. Hover the plate: the loop pauses (readout stops counting); the loupe shows crisp grey discs with `n12`-style ids and `sybil-0` ids in flame; leave → loop resumes.
4. Tab to the plate (focus ring visible): loop pauses; Shift+Tab away → resumes.
5. Scroll slowly past the plate: the halo ring (.35), canvas (.6), diamond (.2), readout (.8) and stamp (1.2) move at different rates; the canvas overscan never exposes the pitch edge.
6. `emulate` reduced motion + reload: the plate is a still at the frame `t ≥ 11.9` (Sybils grafted), no reveal, no parallax (`transform` absent on `[data-depth]`), loupe still works.
7. Resize to 420 px wide: plate flips to 4/3, halo ring shrinks to 72 px, readout stays legible, no horizontal scroll.

- [ ] **Step 6: Commit**

```bash
git add web/components/landing/PlateReplay.tsx web/components/landing/PlateReplay.module.css web/components/landing/PlateReplay.test.ts web/app/page.tsx
git commit -m "feat(web): Fig. 1 live dithered replay plate with readouts, beat stamp and loupe"
```

### Task 5.6: Landing nav and the full-screen menu overlay

**Files:**
- Create: `web/components/landing/Nav.tsx`, `web/components/landing/Nav.module.css`
- Modify: `web/app/page.tsx` (read `public/reels/manifest.json` with `fs` in the server component — same pattern as `reels/[name]/page.tsx` — import `@/lib/reel-cards.json`, render `<Nav reels={manifest} cards={cards}/>` first)
- Test: `web/components/landing/Nav.test.ts`

**Accepted by:** vitest (`createRoot` + `act` in jsdom) for open/close/focus/scroll lock; **browser walk** for motion and layout.

**Interfaces:**
- Consumes: `ReelManifest`, `ReelMeta` (A.2); `REPO_URL` (A.4); `DitherCanvas`, `drawPlateFrame` (5.3, 5.4); `PlateFrames`.
- Produces: `Nav({ reels: ReelManifest; cards: Record<string, PlateFrames> })` (`'use client'`).

- [ ] **Step 1: Write the failing tests**

```ts
const reels: ReelManifest = JSON.parse(readFileSync(join(__dirname, '../../public/reels/manifest.json'), 'utf8'))
const cards = JSON.parse(readFileSync(join(__dirname, '../../lib/reel-cards.json'), 'utf8'))
test('nav markup: wordmark, sub-label, three links, Menu button closed', () => {
  const m = r(h(Nav, { reels, cards }))
  expect(m).toContain('LUMINAR'); expect(m).toContain('gossipsub v1.1'); expect(m).toContain('href="/sim/"'); expect(m).toContain('href="/reels/sybil-eclipse/"'); expect(m).toContain(`href="https://${REPO_URL}"`)
  expect(m).toContain('aria-expanded="false"'); expect(m).toContain('aria-controls="site-menu"'); expect(m).not.toContain('role="dialog"')
})
test('menu opens with four reel rows (kbd, blurb, REAL tag, card) and three routes; locks scroll; Escape closes and restores focus', () => {
  ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
  const host = document.body.appendChild(document.createElement('div')); const root = createRoot(host)
  act(() => root.render(h(Nav, { reels, cards })))
  const btn = host.querySelector<HTMLButtonElement>('button[aria-controls="site-menu"]')!; btn.focus(); act(() => btn.click())
  const dlg = host.querySelector('[role="dialog"]')!; expect(dlg.getAttribute('aria-modal')).toBe('true'); expect(document.body.style.overflow).toBe('hidden')
  expect(dlg.querySelectorAll('a[href^="/reels/"]')).toHaveLength(4); expect(dlg.querySelectorAll('kbd')).toHaveLength(4); expect(dlg.textContent).toContain('REAL'); expect(dlg.textContent).toContain(reels[0].blurb)
  expect(dlg.querySelectorAll('canvas[data-dither]')).toHaveLength(4)
  expect(dlg.querySelector('a[href="/sim/"]')).toBeTruthy(); expect(dlg.querySelector('a[href="/figure/"]')).toBeTruthy(); expect(dlg.querySelector(`a[href="https://${REPO_URL}"]`)).toBeTruthy()
  expect(document.activeElement).toBe(dlg.querySelector('a'))                           // first link focused on open
  act(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })) })
  expect(host.querySelector('[role="dialog"]')).toBeNull(); expect(document.body.style.overflow).toBe(''); expect(document.activeElement).toBe(btn)
  act(() => btn.click()); act(() => root.unmount()); expect(document.body.style.overflow).toBe('')   // unmount while open restores scroll
})
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run components/landing/Nav.test.ts` → FAIL.

- [ ] **Step 3: Implement `Nav.tsx`**

`<header class=nav>` (56 px, `position: sticky; top: 0; background: var(--bg); border-bottom: 1px solid var(--hair)`): `<a href="/" class=brand>` `LUMINAR` (`font: 600 var(--t-ui) var(--font-ui); letter-spacing: .14em`) + `<span class=sub>gossipsub v1.1</span>` (mono `--t-label`, paper-2); `<nav>` links `Simulator` `/sim/` · `Recordings` `/reels/sybil-eclipse/` · `GitHub` `https://${REPO_URL}` (`rel="noopener"`, `target="_blank"`); `<button aria-expanded aria-controls="site-menu">Menu <span class=plus/></button>` — the plus is two 1.4 px bars that rotate 45° (`transition: transform var(--d-menu) var(--ease)`) into `×` when open. ≤ 640 px: the three links hide, only brand + `Menu +`.
Overlay (rendered only while open): `<div id="site-menu" role="dialog" aria-modal="true" aria-label="Menu" class=overlay>` `position: fixed; inset: var(--nav-h) 0 0; z-index: 50; overflow-y: auto; background: var(--bg); animation: fade var(--d-menu) var(--ease)`; `.inner { width: min(var(--col-wide), 100% − 2·var(--gutter)); margin: 0 auto; display: grid; grid-template-columns: 1.25fr 1fr; gap: 1.6rem 4rem }` (≤ 860: one column). Column 1: `<h2 class=label>Recordings</h2>` + `<ul>` (`border-top: 1px solid var(--hair)`), one `<li style="--i: n">` per reel (`animation: rise var(--d-row) var(--ease) both; animation-delay: calc(var(--i) × var(--stagger))`): `<a href="/reels/{name}/">` grid `auto 96px 1fr auto` → `<kbd>{n+1}</kbd>` · card `<div class=card>` 96×60 with `<DitherCanvas source={(ctx,w,h) => { drawPlateFrame(ctx, card, 0, w, h, 'base'); }} reveal={false} cell={2} aria-label={title}/>` plus the `attackers` layer on a 2nd tiny canvas when `card.frames[0].a.length` (flame stays flat) · `<span class=name>{title}</span>` (`font: 400 clamp(26px, 3vw, 38px)/1.1 var(--font-display)`, italic on hover) + `<span class=line>{blurb}</span>` (mono `--t-body`, paper-2) · `<span class=tag>REAL</span>` when `real` (mono `--t-label`, 1 px hair box, `--signal` text) · arrow `›`. Column 2: `<h2 class=label>Routes</h2>` + rows `Simulator` `/sim/` · `Figure` `/figure/` · `Source` `https://${REPO_URL}`. Behaviour: open ⇒ `document.body.style.overflow = 'hidden'`, focus the first link; `keydown Escape` ⇒ close + focus the button; Tab/Shift+Tab wrap inside the dialog; `pointerdown` on the overlay backdrop outside `.inner` ⇒ close; cleanup on unmount restores overflow. Reduced motion: tokens already zero `--d-row`/`--stagger`/`--d-menu`.

- [ ] **Step 4: Run to verify pass** — `npx vitest run components/landing && npx tsc --noEmit && npm run lint` → PASS.

- [ ] **Step 5: Browser walk** (1440×900 and 390×844)

1. Click `Menu +`: overlay fades in over 400 ms, rows rise one after another 40 ms apart; four reel rows each show a tiny dithered mesh thumbnail (the mainnet one a world scatter), title, blurb, `1`–`4` kbd, `REAL` on the fourth; three route rows on the right. Page behind does not scroll (wheel over the overlay scrolls the overlay only).
2. Tab repeatedly: focus cycles inside the overlay; Escape closes and the `Menu` button has focus; `+` has rotated back.
3. Click a reel row → `/reels/sybil-eclipse/` loads (phase 4 page).
4. 390×844: nav shows brand + `Menu +` only; overlay is one column, titles 24 px, no horizontal scroll.
5. Reduced motion: overlay and rows appear instantly.

- [ ] **Step 6: Commit**

```bash
git add web/components/landing/Nav.tsx web/components/landing/Nav.module.css web/components/landing/Nav.test.ts web/app/page.tsx
git commit -m "feat(web): landing nav with full-screen menu overlay and reel cards"
```

### Task 5.7: Hero, readout strip and "What it does"

**Files:**
- Create: `web/components/landing/Hero.tsx`, `web/components/landing/Hero.module.css`, `web/components/landing/Readouts.tsx`, `web/components/landing/Readouts.module.css`, `web/components/landing/Sections.tsx`, `web/components/landing/Sections.module.css`
- Modify: `web/app/page.tsx` (order: redirect island · `<Nav/>` · `<Hero/>` (which owns Fig. 1) · `<Readouts/>` · `<WhatItDoes/>` · the 5.3 scaffold plate (still at the bottom until 5.10))
- Test: `web/components/landing/landing.test.ts`

**Accepted by:** vitest (static markup); **browser walk** for rhythm and the 390 px poster.

**Interfaces:**
- Consumes: `MECHANISM`, `RECORDING_NOT_RUN`, `FIG1`, `ECLIPSE_WHY` (A.4); `lib/reel-stats.json` (A.21 shape); `PlateReplay`, `Figure`.
- Produces: `Hero()`, `Readouts()`, `WhatItDoes()` (server components; `Sections.tsx` also exports `SameNames`, `LiveMainnet` in 5.10).

- [ ] **Step 1: Write the failing tests**

```ts
import stats from '@/lib/reel-stats.json'
test('hero: two-line poster with italic second line, lead ends with the mechanism sentence, two CTAs, Fig. 1', () => {
  const m = r(h(Hero)); expect(m).toMatch(/<h1[^>]*>Gossip,<br\/?><em>scored\.<\/em><\/h1>/)
  expect(m).toContain(`${MECHANISM}</p>`); expect(m).toContain('href="/sim/"'); expect(m).toContain('Open the simulator'); expect(m).toContain('href="/reels/sybil-eclipse/"'); expect(m).toContain('Watch a recording')
  expect(m).toContain('Fig. 1'); expect(m).toContain(`<em>${FIG1}</em>`); expect(m).not.toContain('var(--flame)" class="btn')   // flame never a CTA
})
test('readouts come from reel-stats.json and the last sub-caption is the honesty line', () => {
  const m = r(h(Readouts))
  expect(m).toContain(`>${stats.peers}<`); expect(m).toContain(`>${stats.sybils}<`); expect(m).toContain(`>${stats.heartbeatsToPrune}<`); expect(m).toContain(`>${stats.deliveryPct}%<`)
  expect(m).toContain(`T+${stats.sybilAt}s`); expect(m).toContain(RECORDING_NOT_RUN); expect((m.match(/<dd/g) ?? []).length).toBe(4)
})
test('What it does: h2, three paragraphs, chevron link; eclipse sentence from copy.ts', () => {
  const m = r(h(WhatItDoes)); expect(m).toContain('<h2'); expect((m.match(/<p/g) ?? []).length).toBe(3); expect(m).toContain(ECLIPSE_WHY); expect(m).toContain('href="/sim/"')
})
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run components/landing/landing.test.ts` → FAIL.

- [ ] **Step 3: Implement**

- `Hero.tsx`: `<section class=hero>` in the `--col-prose` column (plate at `--col-wide`): `<h1 class=poster>Gossip,<br/><em>scored.</em></h1>` (`font: 400 var(--t-poster)/var(--lh-tight) var(--font-display); letter-spacing: var(--track-poster)`; builder may change the words but keeps two lines ≤ 9 characters each, second italic); `<p class=lead>` (`--t-lead`, paper-1): `Fifty simulated peers run GossipSub v1.1: mesh, flood publish, IHAVE/IWANT and P1–P4 peer scoring. Inject Sybils, an eclipse or a partition and watch the score bite, live or from a recording. {MECHANISM}`; `<div class=row>` `<a class="btn btn-primary" href="/sim/">Open the simulator</a>` (paper on pitch, 42 px, square, `--t-ui` Manrope 500) + `<a class=chev href="/reels/sybil-eclipse/">Watch a recording <span aria-hidden>›</span></a>`; then `<Figure n={1} caption={FIG1}><PlateReplay plate={plateFrames}/></Figure>` (moved here from `page.tsx`). Rhythm: h1 → lead 22 px, lead → row 28 px, row → plate 48 px (teardown §3).
- `Readouts.tsx`: `<dl class=readouts>` four cells on a hairline grid (`grid-template-columns: repeat(4, 1fr)`; ≤ 640: `repeat(2, 1fr)`): `<div><dd>{peers}</dd><dt><em>peers in the recording</em></dt></div>` · `<dd>{sybils}</dd> <em>Sybils grafted at T+{sybilAt}s</em>` · `<dd>{heartbeatsToPrune}</dd> <em>heartbeats from graft to first prune</em>` · `<dd>{deliveryPct}%</dd> <em>{RECORDING_NOT_RUN}</em>`; numbers `font: 500 var(--t-kpi)/1 var(--font-mono); font-feature-settings: var(--tnum)`, sub-captions italic display `--t-fig` paper-2. 72 px above, 72 px below.
- `Sections.tsx` → `export function WhatItDoes()`: `<section>` `<h2>What it does</h2>` (`--t-h1` display) + three `<p>` (`--t-body`… no: body prose is display 20px/1.58 per teardown? Luminar's tokens have no prose size → use `--t-lead` at `--lh-prose`, paper-1): (1) the mechanism — mesh degree 6, heartbeat once a second, flood publish then mesh relay, IHAVE/IWANT; (2) the attacks — Sybil flood pruned by P4 within two heartbeats, eclipse, partition; (3) `Scoring cannot see a silent eclipse: {ECLIPSE_WHY}. Only clearing the fault heals it.` Chevron link `Open the simulator ›` → `/sim/`. 22 px between paragraphs, 42 px heading → first paragraph, 72 px before the section.

- [ ] **Step 4: Run to verify pass** — `npx vitest run components/landing && npx tsc --noEmit && npm run lint` → PASS (also `npx vitest run lib/copy.test.ts` — no forbidden phrase crept into the prose).

- [ ] **Step 5: Browser walk** (1440×900 → 390×844)

1. `/` top to bottom: 56 px nav; poster `Gossip, / scored.` (second line italic) at ≈ 194 px on 1440, 56 px on 390, never wider than the viewport; lead; paper button + chevron link (hover nudges `›` 3 px); Fig. 1 plate at 1080 px; four readouts on hairlines (2×2 at 390); "What it does" with three paragraphs and the chevron.
2. Nothing fades in on scroll; text is present in the first paint (view-source shows the prose).
3. Keyboard: Tab order nav → CTAs → plate → links; focus ring 2 px paper on each.

- [ ] **Step 6: Commit**

```bash
git add web/components/landing/Hero.tsx web/components/landing/Hero.module.css web/components/landing/Readouts.tsx web/components/landing/Readouts.module.css web/components/landing/Sections.tsx web/components/landing/Sections.module.css web/components/landing/landing.test.ts web/app/page.tsx
git commit -m "feat(web): landing hero, readout strip and \"What it does\" section"
```

### Task 5.8: The pneumatic-tube sorter colorfigure (buttons 1–3)

**Files:**
- Create: `web/figures/sorter/figure.html`, `web/figures/sorter/core.js` (`cp ~/.claude/skills/colorfigures/assets/core.js web/figures/sorter/`), `web/public/figures/sorter.html` (built)
- Test: headless-Chrome walk (below) + `web/figures/sorter/sorter.test.ts` (reads the built file)

**Accepted by:** headless-Chrome walk (the skill's verify loop, `--dump-dom` for `data-errors`) + vitest on the built file.

**Interfaces:**
- Consumes: the `colorfigures` engine (`mountFigure`, `xrMount`, `ui.flash`, `ui.animate`, `stats`, `params`, `?press=`), `docs/design/figure-concept.md` Candidate A.
- Produces: `/figures/sorter.html` with buttons `Post`, `Heartbeat`, `Bolt on a Sybil`; `?press=` accepts `Sybil` as the third button's short name; stats `mesh 6/6 (toy)` · `score port-3` · `delivered` · `IWANT pulls` · `beat`; `window.__st` state with `{ beat, posted, sybil, ports[6]{ p1, p2, p3, p4, attached }, delivered, pulls, history[] }`.

- [ ] **Step 1: Write the failing test** (static checks on the built file)

```ts
const html = readFileSync(join(__dirname, '../../public/figures/sorter.html'), 'utf8')
test('built sorter is self-contained and names the Must buttons, stats and labels', () => {
  expect(html).not.toMatch(/<script\s+src=/); expect(html).not.toMatch(/fonts\.googleapis|fontshare|https?:\/\/cdn/)
  for (const s of ['Post', 'Heartbeat', 'Bolt on a Sybil', 'mesh 6/6 (toy)', 'score port-3', 'delivered', 'IWANT pulls', 'beat', 'SORTER No. 6',
                   'CAM SHAFT (1 s)', 'P1 WINDER', 'P2 TOKENS', 'P3 COUNTERWEIGHT', 'P4 SLUG', 'TRIP LEVER -10', 'LOCK ARM -5', 'TICKET PUNCH (IHAVE)', 'PULL VALVE (IWANT)', 'SPLITTER (FLOOD)',
                   'nothing in the history yet', "turn:'full'", 'Bolt on a Sybil@']) expect(html).toContain(s)
  expect(html).not.toMatch(/Lower the hood|Slide the bulkhead/)       // buttons 4–5 deferred (spec §13.4)
  expect(html).not.toMatch(/beacon node|identical run/i)
})
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run figures/sorter/sorter.test.ts` → FAIL (file missing).

- [ ] **Step 3: Write `figure.html` with the `colorfigures` skill** (read `~/.claude/skills/colorfigures/SKILL.md` and `assets/examples/claw.html` first; geometry beyond the parts list is the builder's, spec §12)

- Head: doctype, `<title>Sorting office: GossipSub as a pneumatic-tube desk</title>`, `<script src="core.js"></script>`; before `mountFigure` the **press alias**: `{ const q = new URLSearchParams(location.search); if (q.has('press')) { q.set('press', q.get('press').replace(/(^|,)Sybil@/g, '$1Bolt on a Sybil@')); history.replaceState(null, '', '?' + q); } }`.
- Notes + parts list comment: Candidate A's 42 parts (case 8, structure 9, mechanism 14, power 6, controls 5) from `figure-concept.md` "Parts list (42)", in the code before any geometry.
- `mountFigure({ fig: '2', title: 'Sorter No. 6', size: [W, D, H] (≈ 120 × 70 × 95 units, desk + rim stations on a board), palette: 'paper', turn: 'full', credit: false, state, scene, buttons, stats, params })`. Body swatches: desk `l #f2f2ef / m #d4d3cd / d #a7a69f`, brass `matOf('#cbb98a')`, glass `#cfe9f0` low alpha, flame `#ff5a2c` only for fresh capsule bands and the active cam lobe, sybil capsules `#e2483d`, status lamp `#43c25c`; serial plate text `SORTER No. 6`; every stat pill with a constant says `(toy)`.
- State (toy constants = engine's): `D = 6`, `beat = 0`, `posted = false`, `history = []` (last 10 msg ids), `sybil = { attached: false, port: 2 /* port 3 */, hanging: false }`, `ports[6] = { p1: 0, p2: 0, p3: 0, p4: 0, attached: true }`, `delivered = 0 / 6`, `pulls = 0`, `score(port) = p1 + p2 + p3 + p4`.
- Buttons, in order:
  1. `Post` → one capsule into the splitter cone; eight copies at once (six tubes + two stub tubes flare for this hop); each neighbour station lights and the capsule band goes grey on arrival; `p2 += 1.0` on every attached port; `delivered = attached count`; `history.push(id)`. With the Sybil attached: red capsules spill into the gate and are rejected to the bin (visible).
  2. `Heartbeat` → one cam turn (≈ 1.6 s eased), lobes in the engine's order, each part flashing flame while it acts: **sieve shake (decay)**: `p2 *= 0.9`, `p4 *= 0.5`, `p1 = min(5, p1 + 0.5)` on attached ports → **spam valve**: if the Sybil is attached and not hanging, a red capsule spits into port 3 → `p4 −= 10` → **trip levers**: any attached port with `score < −10` → collar springs, tube end drops, `attached = false` (the Sybil's port becomes `hanging`) → **lock arm**: a loose tube re-locks only if its score `> −5` (never for the Sybil's dead port) → **ticket punch (IHAVE)**: a punched ticket to the two stub neighbours when `history.length` → **pull valve (IWANT)**: a ticket back with holes torn → vacuum line sucks a capsule across, `pulls += 1` (only after a Post). `beat += 1`. With nothing posted: only the sieve shakes and `ui.flash('nothing in the history yet')`.
  3. `Bolt on a Sybil` → the red hopper clamps onto port 3 (`sybil.attached = true`); if already attached, `ui.flash('the hopper is already bolted on')`. Expected sequence from fresh: Heartbeat 1 → port-3 score `−10.0` (p4) (+p1/p2 from earlier beats), nothing trips; Heartbeat 2 → decay to `−5.0`, spam → `−15.0`, trip → collar fires, tube drops, hopper hangs on a dead port; stat `score port-3 -15.0`.
- Stats: `[{label:'mesh', value:`${attached}/6 (toy)`}, {label:'score port-3', value: score(2).toFixed(1)}, {label:'delivered', value:`${delivered}/6`}, {label:'IWANT pulls', value: pulls}, {label:'beat', value: beat}]`.
- See-through (`xrMount`): cam shaft with six lobes + cam motor, pump + belt + flywheel, pressure line pump→manifold, six balance beams with all four weights (winder, token tray, counterweight, slug sieve), trip levers, lock arm, ticket punch + roll, vacuum line port to port along the back, P4 sieve and bin; labels exactly: `CAM SHAFT (1 s)`, `P1 WINDER`, `P2 TOKENS`, `P3 COUNTERWEIGHT`, `P4 SLUG`, `TRIP LEVER -10`, `LOCK ARM -5`, `TICKET PUNCH (IHAVE)`, `PULL VALVE (IWANT)`, `SPLITTER (FLOOD)` (plain ASCII hyphen: the engine renders symbols as blobs).
- `params(st, q)`: `?sybil=1` bolts the hopper, `?beat=N` pre-runs N heartbeats (screenshot states).

- [ ] **Step 4: Verify from every side with headless Chrome (≤ 3 rounds)**

```bash
cd /home/yks/Projects/luminar/web/figures/sorter && G=$(command -v google-chrome || command -v chromium)
for v in "yaw=45" "yaw=110" "yaw=170" "yaw=230" "yaw=300" "yaw=20&pitch=62" "yaw=200&pitch=70"; do
  "$G" --headless=new --hide-scrollbars --user-data-dir="$(mktemp -d)" --force-device-scale-factor=2 --window-size=900,800 --virtual-time-budget=3000 --screenshot="/tmp/claude-1000/-home-yks-Projects-luminar/344950f1-b57c-4874-90b3-764debeb2b83/scratchpad/sorter-${v//[&=]/_}.png" "file://$PWD/figure.html?free=1&$v"; done
"$G" --headless=new --user-data-dir="$(mktemp -d)" --virtual-time-budget=7000 --dump-dom "file://$PWD/figure.html?press=Post@300,Heartbeat@1500,Sybil@2500,Heartbeat@4000,Heartbeat@5500" > /tmp/claude-1000/-home-yks-Projects-luminar/344950f1-b57c-4874-90b3-764debeb2b83/scratchpad/sorter-press.html
grep -o 'data-errors="[^"]*"' /tmp/claude-1000/-home-yks-Projects-luminar/344950f1-b57c-4874-90b3-764debeb2b83/scratchpad/sorter-press.html; grep -c NaN /tmp/claude-1000/-home-yks-Projects-luminar/344950f1-b57c-4874-90b3-764debeb2b83/scratchpad/sorter-press.html
```
Expected: seven shots with no part painted over a nearer one, every tube touching a port, the back making sense; the press run's DOM has **no** `data-errors` attribute (the alias resolved `Sybil`) and `0` NaN; also `--dump-dom` of `?press=Nope@100` **does** contain `data-errors="…no button "Nope"…"` (Review Focus 5). Screenshot the press URL at budgets 3000 / 4600 / 6100 ms: at 6100 the port-3 tube hangs loose and the stats read `mesh 5/6 (toy)` and `score port-3 -15.0`. Phone shot `--window-size=390,844` with `&xr=1&labels=1`: badges and the label list read. A 4× crop of the see-through: every beam has four weights, the cam shaft touches the motor, the vacuum line runs port to port.

- [ ] **Step 5: Build the single file and run the test**

Run: `python3 ~/.claude/skills/colorfigures/scripts/build.py /home/yks/Projects/luminar/web/figures/sorter/figure.html /home/yks/Projects/luminar/web/public/figures/sorter.html && cd /home/yks/Projects/luminar/web && npx vitest run figures/sorter/sorter.test.ts`
Expected: `wrote …/sorter.html`; PASS.

- [ ] **Step 6: Commit**

```bash
git add web/figures/sorter/figure.html web/figures/sorter/core.js web/public/figures/sorter.html web/figures/sorter/sorter.test.ts
git commit -m "feat(web): pneumatic-tube sorter colorfigure (Post, Heartbeat, Sybil)"
```

### Task 5.9: Fig. 2 sorter plate and the `/figure/` route

**Files:**
- Create: `web/components/landing/FigureFrame.tsx`, `web/components/landing/FigurePlate.tsx`, `web/components/landing/FigurePlate.module.css`, `web/app/figure/FigureRoute.tsx`
- Modify: `web/app/figure/page.tsx` (phase-0 shell → `<Suspense fallback={null}><FigureRoute/></Suspense>`, `export const metadata = { title: 'Luminar — Fig. 2' }`), `web/app/page.tsx` (insert `<FigurePlate/>` after `<WhatItDoes/>`)
- Test: `web/components/landing/FigurePlate.test.ts`

**Accepted by:** vitest (static markup); **browser walk** for the lazy iframe, the `?press=` run and 4/3 on phones.

**Interfaces:**
- Consumes: `Figure`, `HaloRing` (5.1–5.2); `FIG2` (A.4); `/figures/sorter.html` (5.8).
- Produces: `FigureFrame({ press?, fullBleed? })`, `FigurePlate()`, `FigureRoute()`.

- [ ] **Step 1: Write the failing tests**

```ts
test('FigureFrame: lazy iframe with the spec title; press passthrough only when given; full-bleed variant', () => {
  const a = r(h(FigureFrame, {})); expect(a).toContain('src="/figures/sorter.html"'); expect(a).toContain('loading="lazy"'); expect(a).toContain('title="Sorting office: GossipSub as a pneumatic-tube desk"')
  const b = r(h(FigureFrame, { press: 'Post@300,Heartbeat@1500,Sybil@2500,Heartbeat@4000,Heartbeat@5500', fullBleed: true }))
  expect(b).toContain(`src="/figures/sorter.html?press=${encodeURIComponent('Post@300,Heartbeat@1500,Sybil@2500,Heartbeat@4000,Heartbeat@5500')}"`); expect(b).not.toContain('loading="lazy"'); expect(b).toContain('position:fixed')
})
test('FigurePlate: Fig. 2 with stamp, paper rectangle, one halo ring, caption from copy.ts', () => {
  const m = r(h(FigurePlate)); expect(m).toContain('Fig. 2'); expect(m).toContain(`<em>${FIG2}</em>`); expect(m).toContain('SORTER No. 6'); expect(m).toContain('#f4f1e8'); expect((m.match(/<pattern /g) ?? []).length).toBe(1); expect(m).toContain('<iframe')
})
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run components/landing/FigurePlate.test.ts` → FAIL.

- [ ] **Step 3: Implement**

- `FigureFrame.tsx` (plain): `<iframe src={'/figures/sorter.html' + (press ? `?press=${encodeURIComponent(press)}` : '')} title="Sorting office: GossipSub as a pneumatic-tube desk" loading={fullBleed ? undefined : 'lazy'} style={fullBleed ? { position: 'fixed', inset: 0, width: '100vw', height: '100dvh', border: 0, background: '#f4f1e8' } : { position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0 }} />`.
- `FigurePlate.tsx` (server): `<Figure n={2} caption={FIG2} aspect="16 / 9" narrowAspect="4 / 3" stamp="SORTER No. 6" className={styles.plate}>` → `<div class=paper style="background:#f4f1e8">` (`position:absolute; inset: 12px; outline: 1px solid var(--paper-0); outline-offset: 6px`) containing `<FigureFrame/>`; `<HaloRing size={96} band={2} depth={0.35} className={styles.halo}/>` at `right: −24px; top: −24px` overlapping the paper's top-right corner (clipped by the plate). The stamp sits at the plate's bottom-left corner (`.stamp { left: 2%; top: auto; bottom: 6% }`).
- `FigureRoute.tsx` (`'use client'`): `const press = useSearchParams().get('press') ?? undefined; return <FigureFrame fullBleed press={press}/>`.
- `app/figure/page.tsx`: server component, `<Suspense>` around `<FigureRoute/>`; body background `#f4f1e8` via a wrapper div (the figure is the page).

- [ ] **Step 4: Run to verify pass** — `npx vitest run components/landing && npx tsc --noEmit && npm run lint && npm run build` → PASS; `web/out/figure/index.html` and `web/out/figures/sorter.html` exist.

- [ ] **Step 5: Browser walk**

1. `/`: Fig. 2 shows the sorter on its paper rectangle with the paper rule 6 px outside, the halo ring over the top-right corner, stamp `SORTER No. 6`, caption *Fig. 2 Same mechanism, toy constants.*; the iframe loads only when scrolled near (network panel: `sorter.html` requested after scrolling).
2. Inside the plate: press `Post`, `Heartbeat`, `Bolt on a Sybil`, `Heartbeat`, `Heartbeat` → the port-3 tube drops on the second heartbeat; stats read `mesh 5/6 (toy)`, `score port-3 -15.0`.
3. `http://localhost:3000/figure/?press=Post@300,Heartbeat@1500,Sybil@2500,Heartbeat@4000,Heartbeat@5500`: full-bleed figure, the same sequence plays unattended, tube drops at ≈ 5.5 s; `/figure/` alone shows the idle figure.
4. 390×844: Fig. 2 at 4/3; the figure's phone layout (badges, label list) inside the iframe; no horizontal scroll.

- [ ] **Step 6: Commit**

```bash
git add web/components/landing/FigureFrame.tsx web/components/landing/FigurePlate.tsx web/components/landing/FigurePlate.module.css web/components/landing/FigurePlate.test.ts web/app/figure web/app/page.tsx
git commit -m "feat(web): Fig. 2 sorter plate and /figure/ route with ?press= passthrough"
```

### Task 5.10: Fig. 3 video plate, "Same names", "Live mainnet", footer

**Files:**
- Create: `web/components/landing/VideoPlate.tsx`, `web/components/landing/VideoPlate.module.css`, `web/components/landing/Footer.tsx`, `web/components/landing/Footer.module.css`
- Modify: `web/components/landing/Sections.tsx` (+ `SameNames`, `LiveMainnet`), `web/components/landing/Sections.module.css`, `web/app/page.tsx` (final order: redirect island · Nav · Hero · Readouts · WhatItDoes · FigurePlate · VideoPlate · SameNames · LiveMainnet · Footer; the 5.3 scaffold plate is removed — its still moves into `SameNames`)
- Test: `web/components/landing/landing.test.ts` (extend)

**Accepted by:** vitest (static markup, copy grep); **browser walk** for the poster overlay, stills and footer.

**Interfaces:**
- Consumes: `Figure`, `DitherImage` (5.2–5.3); `FIG3`, `SAME_NAMES`, `ARRIVAL`, `PROVENANCE`, `EVENT_LINE`, `REPO_URL` (A.4).
- Produces: `VideoPlate()` (`'use client'`), `SameNames()`, `LiveMainnet()`, `Footer()`.

- [ ] **Step 1: Write the failing tests**

```ts
test('VideoPlate: native video, metadata preload, playsinline, controls, no autoplay/muted, dithered poster overlay, Fig. 3 caption', () => {
  const m = r(h(VideoPlate)); expect(m).toContain('<video'); expect(m).toContain('src="/video/launch-16x9.mp4"'); expect(m).toContain('preload="metadata"'); expect(m).toContain('playsinline'); expect(m).toContain('controls')
  expect(m).not.toMatch(/autoplay|muted/); expect(m).toContain('/video/poster.png'); expect(m).toContain('Fig. 3'); expect(m).toContain(`<em>${FIG3}</em>`); expect(m).not.toContain('youtube')
})
test('Same names: two dithered stills at depths .6/.9, the seven gossipsub_* series, Lighthouse wording', () => {
  const m = r(h(SameNames)); expect(m).toContain('/stills/grafana.png'); expect(m).toContain('/stills/jaeger.png'); expect(m).toContain('data-depth="0.6"'); expect(m).toContain('data-depth="0.9"'); expect(m).toContain(SAME_NAMES); expect(m).not.toContain('every client')
  for (const s of ['gossipsub_mesh_peer_counts', 'gossipsub_mesh_peer_churn_events', 'gossipsub_mesh_peer_inclusion_events', 'gossipsub_score_per_mesh', 'gossipsub_topic_iwant_msgs', 'gossipsub_topic_msg_published', 'gossipsub_topic_msg_recv_counts']) expect(m).toContain(s)
})
test('Live mainnet: arrival sentence, reel link, provenance credit verbatim', () => {
  const m = r(h(LiveMainnet)); expect(m).toContain(ARRIVAL); expect(m).toContain('href="/reels/mainnet-block-wave/"'); expect(m).toContain(PROVENANCE)
})
test('Footer: three columns, event line, routes, source, licence and credit', () => {
  const m = r(h(Footer)); expect(m).toContain('LUMINAR'); expect(m).toContain(`<em>${EVENT_LINE}</em>`); for (const href of ['/', '/sim/', '/reels/sybil-eclipse/', '/figure/', `https://${REPO_URL}`]) expect(m).toContain(`href="${href}"`)
  expect(m).toContain('MIT'); expect(m).toContain('ethPandaOps (CC BY 4.0)')
})
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run components/landing/landing.test.ts` → FAIL.

- [ ] **Step 3: Implement**

- `VideoPlate.tsx` (`'use client'`): `<Figure n={3} caption={FIG3} aspect="16 / 9">` → `<video src="/video/launch-16x9.mp4" preload="metadata" playsInline controls onPlay={() => setPlaying(true)} onError={() => setMissing(true)} style="position:absolute;inset:0;width:100%;height:100%;background:var(--pitch-0)"/>`; while `!playing`: `<DitherImage src="/video/poster.png" alt="Launch video poster: the mesh at the end card" depth={0.6} className={styles.poster}/>` over the video with `pointer-events: none` (controls stay clickable); when the poster 404s DitherImage keeps its `--dither-25` skeleton; when the mp4 is missing (phase 6 not landed) the skeleton stays and a mono `--t-label` line reads `video renders in the next phase` only in development (`process.env.NODE_ENV !== 'production'`). No `autoplay`, no `muted`, no `loop`.
- `SameNames()` in `Sections.tsx`: `<section>` `<h2>Same names</h2>`, one `.plate` (`aspect-ratio: 16 / 7`, `max-width: var(--col-wide)`) holding `<DitherImage src="/stills/grafana.png" alt="Grafana: gossipsub_* series from Luminar's /metrics" depth={0.6} focus={[0.5, 0.2]} className={styles.stillA} loupe/>` (left 62 % width, top) and `<DitherImage src="/stills/jaeger.png" alt="Jaeger: a publish trace" depth={0.9} focus={[0.5, 0.3]} className={styles.stillB}/>` (right 55 % width, offset down 22 %); then `<p>` with `SAME_NAMES` (`/metrics` emits {SAME_NAMES}, scraped by the bundled Prometheus and Grafana; the trace is OpenTelemetry over OTLP) and `<ul class=mono>` of the seven `gossipsub_*` names (mono `--t-body`, paper-1, two columns ≥ 640).
- `LiveMainnet()`: `<section>` `<h2>Live mainnet</h2>` + `<p>`: `The MAINNET badge polls ethPandaOps once per slot and lights observer nodes as each block reaches them: {ARRIVAL}. ` + chevron link `Watch the recorded block wave ›` → `/reels/mainnet-block-wave/`; `<p class=credit>` mono `--t-label` paper-2: `{PROVENANCE}`.
- `Footer.tsx`: `<footer>` `margin-top: 128px; border-top: 1px solid var(--hair); padding: 2.4rem 0 1.75rem; max-width: 1000px` grid `1.4fr 1fr 1fr` (≤ 640: `1fr 1fr`, brand spans both): col 1 `LUMINAR` wordmark + `<em>{EVENT_LINE}</em>` (italic display 17 px, paper-1); col 2 `<h3>Routes</h3>` list `Landing /` · `Simulator /sim/` · `Recordings /reels/sybil-eclipse/` · `Figure /figure/`; col 3 `<h3>Source</h3>` `GitHub https://${REPO_URL}` · `MIT licence` (link `https://${REPO_URL}/blob/master/LICENSE`) · `data: ethPandaOps (CC BY 4.0)`; `<p class=copy>` 3 rem below: `© 2026 Luminar Contributors`. Manrope 14 px/1.58, paper-2 headings, paper-1 links (hover paper-0).

- [ ] **Step 4: Run to verify pass** — `npx vitest run components/landing lib/copy.test.ts && npx tsc --noEmit && npm run lint && npm run build` → PASS.

- [ ] **Step 5: Browser walk**

1. Fig. 3: the plate shows the dithered skeleton (poster not yet rendered) with native controls visible; no console error other than the 404s for `/video/*`; once phase 6 drops the files the poster dithers in and play hides it (re-check then).
2. "Same names": two dithered screenshots overlapping at different parallax depths; loupe over the Grafana still shows the real panel text; the seven series names in mono.
3. "Live mainnet": the paragraph ends with the arrival sentence; the credit line is the provenance sentence verbatim; link opens the mainnet reel.
4. Footer: three columns at 1440, two at 390 with the brand spanning; every link works; `EVENT_LINE` italic.
5. `grep -rn "identical run\|beacon node's scoring\|mesh path" web/app web/components web/lib` → only `web/lib/copy.ts`.

- [ ] **Step 6: Commit**

```bash
git add web/components/landing/VideoPlate.tsx web/components/landing/VideoPlate.module.css web/components/landing/Footer.tsx web/components/landing/Footer.module.css web/components/landing/Sections.tsx web/components/landing/Sections.module.css web/components/landing/landing.test.ts web/app/page.tsx
git commit -m "feat(web): Fig. 3 video plate, \"Same names\" stills, mainnet section and footer"
```

### Task 5.11: Legend parity — the halo ring and diamond are the same glyphs on `/sim/`

**Files:**
- Modify: `web/components/sim/Legend.tsx` (phase 3), its CSS module
- Test: `web/components/sim/Legend.test.ts` (create if phase 3 did not)

**Accepted by:** vitest (static markup); **browser walk** on `/sim/` against `make backend`.

**Interfaces:**
- Consumes: `HaloRing` (with `cell={2}`), `Diamond`, `Reticle` (5.1).
- Produces: nothing new; spec §7.4.2 ("Both appear in the simulator legend with the same construction").

- [ ] **Step 1: Write the failing test**

```ts
test('legend rows use the shared glyph components: banded halo, grafted and pruned diamonds, reticle', () => {
  const m = r(h(Legend, {} as never))   // Legend reads the store via selectors; defaults suffice
  expect((m.match(/<pattern id="halo-/g) ?? []).length).toBeGreaterThanOrEqual(1)          // HaloRing
  expect(m).toContain('points="50,0 100,50 50,100 0,50"'); expect(m).toContain('stroke-dasharray="3 2"')   // Diamond grafted + pruned
  expect(m).toContain('viewBox="0 0 14 14"')                                                 // Reticle (selected)
  expect(m).toContain('gossip mesh · hidden above 100 peers (backend sends none)')
})
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run components/sim/Legend.test.ts` → FAIL (hand-drawn spans / missing glyphs).

- [ ] **Step 3: Replace the legend's hand-drawn honest-score, attacker, pruned and selected swatches** with `<HaloRing size={16} band={2} cell={2}/>` (and a `band 0 flame` ring on the "score < 0" row if the legend lists it), `<Diamond size={12} label="attacker"/>`, `<Diamond size={12} pruned label="pruned attacker"/>`, `<Reticle title="selected"/>`. Keep the `<dl>` semantics and `MESH_HIDDEN` text.

- [ ] **Step 4: Run to verify pass** — `npx vitest run components/sim && npx tsc --noEmit && npm run lint` → PASS.

- [ ] **Step 5: Browser walk** (`make backend` + `npm run dev`, `/sim/`): the legend's halo ring and diamond are visibly the same construction as the Fig. 1 plate's floating ring and diamond (screenshot both side by side); the legend's pruned diamond is hollow dashed; under `?theme=stage` the glyphs scale with the row height.

- [ ] **Step 6: Commit**

```bash
git add web/components/sim/Legend.tsx web/components/sim/Legend.module.css web/components/sim/Legend.test.ts
git commit -m "feat(web): legend draws the halo ring and diamond with the plate glyphs"
```

### Task 5.12: Phone layout, reduced motion, offline, Lighthouse — the gate

**Files:**
- Modify: whichever of `web/components/landing/*.module.css`, `web/components/dither/*.module.css`, `web/app/globals.css` the walk below fails on (CSS only; no new components)
- Test: the scripted browser walk below (chrome-devtools MCP: `navigate_page`, `resize_page`, `emulate`, `take_screenshot`, `evaluate_script`, `lighthouse_audit`; or `npx lighthouse` + Chrome DevTools by hand)

**Accepted by:** **scripted browser walk** only (Lighthouse, emulation, offline); CSS fixes are accepted by re-running it.

**Interfaces:** none new.

- [ ] **Step 1: Build and serve the export without a backend**

Run: `cd /home/yks/Projects/luminar/web && npm run build && python3 -m http.server -d out 9000`
Expected: `out/index.html`, `out/figure/index.html`, `out/figures/sorter.html`, `out/stills/*.png`, `out/fonts/*.woff2` present; `grep -r "fonts.googleapis\|fontshare\|cdn\." out/index.html` empty.

- [ ] **Step 2: 390 × 844 walk** (`http://localhost:9000/`)

1. `evaluate_script`: `document.documentElement.scrollWidth <= innerWidth` → `true` at every scroll position (no horizontal scroll).
2. Gutters 16 px (`getComputedStyle(document.documentElement).getPropertyValue('--gutter')` → `16px`); poster line ≈ 56 px (`getComputedStyle(h1).fontSize`); Fig. 1 and Fig. 2 plates at 4/3 (`[data-narrow="1"]` present); readouts 2 × 2; footer two columns with the brand spanning; menu overlay one column; every tap target on the nav ≥ 44 px.
3. Fix any failure in the CSS module that owns it, rebuild, repeat.

- [ ] **Step 3: Reduced-motion walk** (`emulate` `prefers-reduced-motion: reduce`, reload)

1. Fig. 1 is the still at `t ≥ 11.9` (readout `T+ 12.0s`, no counting); the plate appears at 3 px with no coarse step; `[data-depth]` elements have no `transform` after scrolling; the menu rows have `animation-duration: 0s` / appear at once; `--parallax-travel` computes to `0px`.
2. The loupe still works over Fig. 1 and the Grafana still.

- [ ] **Step 4: Offline walk**

1. Load `/` online; `emulate` network `offline`; scroll the whole page: fonts (serif/mono/sans visible, not fallbacks — `document.fonts.check('italic 16px "Instrument Serif"')` → `true`), Fig. 1 keeps looping, Fig. 2 iframe is interactive, stills remain; the network panel shows no failed request except `/video/*` when phase 6 has not landed.
2. Hard reload while offline is **not** required (no service worker in scope); re-enable the network.

- [ ] **Step 5: Lighthouse** (backend up via `make backend` for `/sim/` and `/reels/sybil-eclipse/` through the dev server or FastAPI mount; `/` from `:9000`)

Run: `lighthouse_audit` (category accessibility) on `http://localhost:9000/`, `http://localhost:3000/sim/`, `http://localhost:3000/reels/sybil-eclipse/` — or `npx lighthouse <url> --only-categories=accessibility --chrome-flags="--headless=new" --output=json --output-path=/tmp/claude-1000/-home-yks-Projects-luminar/344950f1-b57c-4874-90b3-764debeb2b83/scratchpad/lh-<page>.json` and read `categories.accessibility.score`.
Expected: score ≥ 0.90 on all three; the `color-contrast` audit passes (no items). Any failure → fix the owning component (contrast → never `paper-3` on text; missing name → `aria-label` on the canvas/iframe/button) and re-run.

- [ ] **Step 6: Plate and sorter checks (the gate's remaining lines)**

1. `/`: the Fig. 1 plate reveals 28→3 (screenshot at 0.3 s and 1.5 s after it enters view) and the loupe shows peer ids (`n12`-style, `sybil-0` in flame).
2. `/figure/?press=Post@300,Heartbeat@1500,Sybil@2500,Heartbeat@4000,Heartbeat@5500`: the tube drops at the second heartbeat after the Sybil (≈ 5.5 s); `document.documentElement.dataset.errors` is `undefined` inside the iframe.

- [ ] **Step 7: Full check and commit**

Run: `cd /home/yks/Projects/luminar/web && npx tsc --noEmit && npm run lint && npx vitest run && npm run build && cd .. && make check`
Expected: all green.

```bash
git add web/components web/app
git commit -m "fix(web): landing at 390px, reduced motion, offline and Lighthouse pass"
```

---

## Phase 5 acceptance gate (spec §11, verbatim)

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

Every phase ends with `cd web && npx tsc --noEmit && npm run lint && npm run build` green and
`make check` still green for `frontend/` and `backend/`.

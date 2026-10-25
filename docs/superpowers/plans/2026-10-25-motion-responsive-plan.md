# Luminar motion/responsive pass — implementation task list

Verified at `9023d96` (branch `feat/ui-overhaul`). Addendum: `docs/superpowers/specs/2026-10-25-motion-responsive-addendum.md`. 88 findings → 10 tasks, disjoint file sets, run in order T1…T10. Each task ends with `make lint && make typecheck && cd web && npx vitest run` green before the next starts.

## Plan-wide decisions (every task follows these; do not re-decide per task)

| # | Decision | Why |
|---|---|---|
| D1 | **Touch band = `@media (max-width: 1024px)`** everywhere in `web/` (was 1023). `SIM_BREAKPOINT = 1024`. Each task flips the `1023px` → `1024px` lines only in the files it owns (T1 globals, T7 SimApp/CommandStrip/Toolbar/Menus/Narrator, T8 Legend/Inspector). | resp-06: iPad landscape (1024×768, touch) must get the drawer layout. One number, no per-component exceptions. |
| D2 | **One reveal mechanism**: `web/lib/reveal.ts` (`attachReveal()`, one IntersectionObserver, threshold .3, once, sets `data-in`) mounted from a 6-line client island `web/components/Reveal.tsx` rendered in `app/layout.tsx`. Attributes: `data-reveal` on the section, `data-k="up|pop|card"` + `style={{'--i': n}}` on children. CSS lives only under `@media (prefers-reduced-motion: no-preference)` and behind `:root[data-js]`. | motion-03 wins over land-15's per-page `<Reveal/>`; mounting in layout (not Nav) keeps T1 and T2 disjoint. No-JS and reduced-motion get the final state with nothing to undo. |
| D3 | **Phone type floor**: in T1 add `@media (max-width: 1024px) { :root { --t-label: 12px; --t-micro: 12px; --t-body: 13px; } }`. No per-component font edits except where a fixed px exists (Footer 14 px → 16 px, `p.credit`, `.series`). | Collapses resp-08 / prod-13 / land-13 / motion-19 into one rule; stage block already proves the layouts tolerate 13/12. |
| D4 | **Skip link = visible-on-focus `.skip`** (land-04), not `.sr-only` (motion-13). | `.sr-only` never shows for sighted keyboard users. |
| D5 | **Play-chip ring per motion-09** (inset −3px, square, scale 1→1.6, opacity .55→0, 2 s, `--io` scale / linear opacity, starts 600 ms after `data-in`, stops when `playing`). land-18's `inset:-6px` variant is the same accent; merged. | Square outline is the system's ring; both findings agree. |
| D6 | **Live mainnet: observer glyph pulse, no LIVE dot** (motion-11). Keep land-17's measured sentence using the manifest's `nodes` field: "The recording covers slots 15466393–15466400 with 138 observer nodes." | Precedence §1 honesty: the landing never polls; a pulsing LIVE dot is a liveness claim. Note: manifest blurb says "~150 observer nodes" while `nodes` is 138; the sentence uses 138 (the counted field). |
| D7 | **Tagline = separate `components/landing/Tagline.tsx`** (land-01), words animate **opacity .3→1** (motion-06), delay `calc(var(--i) * 60ms)`; one shared IO (D2). | Opacity is cheaper than color-mix and reads identically on pitch. |
| D8 | **Strip wrap uses a container query** (prod-02: `.canvas { container-type: inline-size }`, `@container (max-width: 760px)`) and the touch-band media query both trigger the two-row strip. | Covers 1025–1439 desktop where the canvas column is narrower than the strip content; resp-01's `1279px` media rule alone would not cover a 1440 window with both rails open. |
| D9 | **Counter easing**: JS rAF, 900 ms, `t<.5 ? 4t³ : 1-(-2t+2)³/2` (ease-in-out cubic ≈ `--io`). | Ponytail: no bezier solver for four numbers. |
| D10 | **Breakpoint flag for inert**: fix resp-02/prod-01 by closing the drawer when a peer is selected at ≤1024 (`setDrawer(null)` in the existing store subscribe), not by widening `inertExcept`. | One line; the sheet and drawer never coexist, so z-order and scrim stay simple. |

## Dropped or demoted findings

| id | Action | Reason |
|---|---|---|
| resp-14 | **Hand-off to G.1**, not in this pass | `web/public/figures/sorter.html` is a plate/iframe file; addendum §3 says G.1 owns them. Note added to T10's hand-off list. |
| land-17 (LIVE dot part) | **Dropped**; sentence kept (D6) | Contradicts precedence §1 honesty on a page that never polls. |
| motion-13 (`.sr-only` skip) | **Superseded** by land-04 (D4) | Invisible skip link fails sighted keyboard users. |
| land-15 (`<Reveal/>` in page.tsx, `data-on`) | **Superseded** by motion-03 (D2) | Duplicate mechanism; attribute names unified to `data-in`. |
| resp-01 (media-query-only fix) | **Superseded** by prod-02 (D8) | Same defect; container query is the complete fix. |
| motion-01, motion-15 | **Informational**; closed by this plan | No file changes; section map and inventory are encoded in T1–T6. |
| land-07 / motion-14 "pill nav" | Applied as link-collapse only | Precedence §2: radii snap to `--r-0`, spec §6.1 fixes the 56 px bar. Already how both findings read it. |
| land-05 `metadataBase` | Kept, **needs controller input**: the deploy origin | T1 reads `process.env.NEXT_PUBLIC_SITE_URL` with a fallback; without it OG images are relative and previews will not render. |

---

## T1 — Shared infrastructure: tokens, reveal, reduced motion, global fixes

**Owns:** `web/app/globals.css`, `web/app/globals.test.ts`, `docs/design/tokens.css`, `web/app/layout.tsx`, `web/lib/reveal.ts` (new), `web/lib/reveal.test.ts` (new), `web/components/Reveal.tsx` (new)
**Closes:** motion-02, motion-03, motion-16, motion-19, motion-21, resp-08, prod-13, land-13, land-14, land-10, land-11 (`.chev` part), motion-20 (`.chev` part), resp-13 (`.chev` part), prod-14, resp-16 (viewport part), land-05, land-04 (CSS part), prod-09 (`.skeleton` class only)

**Work**
1. `globals.css` motion block after line 225 and the same block in `docs/design/tokens.css`: `--e: var(--ease); --e2: cubic-bezier(.33,1,.68,1); --io: cubic-bezier(.65,0,.35,1); --d-rise: 1050ms; --d-fade: 750ms; --d-wipe: 700ms; --d-count: 900ms; --stagger-sec: 85ms;`. Append the five new durations as `0ms` to the reduced-motion block (lines 303–307).
2. `--t-poster: clamp(3.5rem, min(13.5vw, 24dvh), 13rem)` (both files).
3. After line 302: the D3 type-floor rule (both files; tokens.css is the declared source).
4. Reveal CSS (after `.chev`), only under `@media (prefers-reduced-motion: no-preference)` and `:root[data-js]`: kinds `up` (translateY 10px + blur 4px), `pop` (scale .85), `card` (translateY 24px scale .985, **no filter**), `line`; transitions `transform var(--d-rise) var(--e), opacity var(--d-fade) var(--e2), filter var(--d-fade) var(--e2)`, delay `calc(var(--i,0) * var(--stagger-sec))`. Plus `[data-k=card] .plate { filter: none }`.
5. `lib/reveal.ts`: `attachReveal()` observes `[data-reveal]`, adds `data-in` at ≥.3 once, disconnects when all seen; returns a disposer. `components/Reveal.tsx`: `'use client'`, `useEffect(attachReveal, [])`, renders null. Render it in `layout.tsx` body.
6. `layout.tsx`: inline `<script>document.documentElement.dataset.js='1'</script>` in `<head>`; `export const viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover' }`; extend `metadata` with `metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000')`, `openGraph { title, description: 'GossipSub v1.1 peer scoring you can watch bite: fifty peers, five Sybils, pruned in two heartbeats.', images: ['/video/poster.png'] }`, `twitter { card: 'summary_large_image' }`.
7. globals: `h1, h2, h3, dt, figcaption { text-wrap: balance } p, li { text-wrap: pretty }`; `.btn-primary:hover { background: var(--paper-1) }`; `.chev { min-height: 44px }` and `.chev:active > span { transform: translateX(3px) translateY(1px) }`; `.skip { position:absolute; left:var(--gutter); top:-100%; z-index:70; padding:var(--s-2) var(--s-3); background:var(--fg); color:var(--bg) } .skip:focus { top: var(--s-2) }`; `.skeleton { background: var(--dither-25) }`; shared press rule `[data-slot=canvas] button:active:not(:disabled), header button:active, aside button:active { transform: translateY(1px) }`.

**Acceptance**
- `globals.test.ts`: add cases asserting the reduced-motion block contains `--d-rise: 0ms`, `--d-count: 0ms`, `--stagger-sec: 0ms`; the reveal CSS appears only inside a `no-preference` block; `--t-label: 12px` appears under `max-width: 1024px`; tokens.css and globals.css `:root` token blocks are byte-identical (extend the existing verbatim check if present).
- `reveal.test.ts` (jsdom, mocked IO): two `[data-reveal]` nodes, intersect one at .4 → only it gets `data-in`; re-intersect → no change; disposer disconnects.
- `curl` of built `/` contains `og:image`, `twitter:card`, `viewport-fit=cover`, `data-js` script.
- Screenshot landing 844×390: CTA above the fold (y < 390).
- Computed `--t-label` at 390×844 = 12px, at 1440 unchanged.

**Estimate:** 75 min

---

## T2 — Nav: island collapse at ≤1024, current page, hover, overlay blur

**Owns:** `web/components/landing/Nav.tsx`, `Nav.module.css`, `Nav.test.ts`
**Closes:** land-06, land-07, land-08, land-09, motion-14, resp-13 (nav links part), motion-20 (nav links part)

**Work**
- Line 46 breakpoint `640px` → `1024px` (`.links { display:none } .menuBtn { margin-left:auto }`).
- `.links a { display:inline-flex; align-items:center; min-height:44px; transition: color var(--d-fast) var(--ease) } .links a:hover { text-decoration:underline; text-underline-offset:.35em } .links a:active { transform: translateY(1px) }`.
- `usePathname()`; `aria-current="page"` on brand when `/`, on the matching link/overlay row otherwise; style `[aria-current] { text-decoration: underline; text-underline-offset:.35em; text-decoration-thickness:1px }`.
- Overlay: `@supports (backdrop-filter: blur(1px)) { .overlay { background: rgb(11 11 13 / .86); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px) } }`, solid `--bg` fallback kept. Row stagger `calc(var(--i) * 60ms)`.
- `+`→`×` morph, focus trap, Escape unchanged.

**Acceptance**
- `Nav.test.ts`: `aria-current="page"` present on exactly one element for pathnames `/`, `/sim/`, `/reels/sybil-eclipse/`; existing 18-binding/focus-trap tests still pass.
- Screenshots `landing-768x1024.png`, `landing-1024x768.png`: no inline links, Menu button visible; `landing-1440x900.png` hover state captured via CDP `:hover` force.
- Measure at 1440: each `.links a` height ≥ 44.
- Overlay computed `backdrop-filter` ≠ none at 390×844.

**Estimate:** 40 min

---

## T3 — Hero, readouts, Fig. 1: text choreography, counters, container-query figure, off-screen pause

**Owns:** `web/components/landing/Hero.tsx`, `Hero.module.css`, `Readouts.tsx`, `Readouts.module.css`, `PlateReplay.tsx`, `PlateReplay.module.css`, `PlateReplay.test.ts`, `web/components/dither/Figure.tsx`, `Figure.module.css`, `Figure.test.ts`
**Closes:** motion-04, motion-05, land-16, land-20, land-11 (Hero part), motion-20 (Hero part), motion-17, motion-18

**Work**
- Hero: `data-reveal` on the section; h1 lines wrapped in spans `up` --i 0/1, lead `up` 2, CTA `pop` 3, chevron `up` 4, Fig. 1 figcaption `up` 5. `.cta { height: 44px }`. Proof line under the CTA row from `lib/reel-stats.json`: `50 peers · 5 Sybils · first prune 1.7 s after the graft · 100% delivery` (11.9 − 10.2, computed in code, not typed). `.proof { margin-top: var(--s-4); font: 500 var(--t-body) var(--font-mono); color: var(--paper-2) }`.
- Readouts: cells `up` --i 0..3. `<Count to={n}/>` client child for each `<dd>`: SSR renders the final number; on the section's `data-in` (MutationObserver on the closest `[data-reveal]`, or `onReveal` export from `lib/reveal.ts` — T1 ships `attachReveal` only; use the MutationObserver, 5 lines) run a 900 ms rAF count with D9 easing writing `textContent`; `%` suffix static. Reduced motion or no `data-in` within 3 s: final value.
- Figure: delete ResizeObserver/`useState`/`data-narrow`; `.figure { container-type: inline-size }`, `@container (max-width: 449px) { .plate { aspect-ratio: var(--narrow-aspect) } figcaption { text-align: left } }`; `--narrow-aspect` inline; PlateReplay halo rule becomes `@container (max-width: 449px) { .halo { width:72px; height:72px } }`. Add optional `kind?: 'card'` prop → `data-k="card"` on the plate div and `data-reveal` passthrough on `<figure>` (used by T4; Fig. 1 does **not** pass it).
- PlateReplay: IO on `root` (threshold 0) → `offscreen`; `paused = hover || focus || offscreen`.

**Acceptance**
- `Figure.test.ts`: no `ResizeObserver` reference; SSR markup contains `--narrow-aspect`; `data-k="card"` only when `kind="card"`.
- `PlateReplay.test.ts`: with mocked IO reporting not intersecting, the frame timer does not advance; intersecting resumes.
- Readouts test (new, in `Readouts.test.tsx`): SSR output text equals `50 5 2 100%`; after `data-in` + fake timers 1 s, text equals the same; under `matchMedia reduce` no intermediate value is ever written.
- Screenshots `landing-390x844.png` headless (pre-hydration) and after 1.5 s: identical plate height (257 px), halo 72×72, overlap with readout box 0 px; CLS measured via CDP `LayoutShift` < 0.01 on `/`.
- `landing-1440x900.png` at t=0 ms and t=1600 ms: hero text hidden then landed.

**Estimate:** 90 min

---

## T4 — Plates: Fig. 2 card frame, Fig. 3 poster + play pulse + real error state, dither reveal delay

**Owns:** `web/components/landing/FigurePlate.tsx`, `FigurePlate.module.css`, `FigurePlate.test.ts`, `VideoPlate.tsx`, `VideoPlate.module.css`, `web/components/dither/DitherCanvas.tsx`, `DitherCanvas.test.ts`, `DitherImage.tsx`
**Closes:** motion-08, motion-09, land-18, land-19, motion-10 (prop side)
**Not touched:** `FigureFrame.tsx`, `public/figures/*` (G.1).

**Work**
- FigurePlate: `<Figure kind="card" data-reveal>`; figcaption `up` --i 1. No blur (T1's card kind has none).
- VideoPlate: `.wrap` gets `data-reveal`; figure `kind="card"`. `.play::after` ring per D5 under `no-preference`, `[data-in] .play::after { animation-delay: 600ms }`, unmounted with the overlay when `playing`. Drop the `NODE_ENV` guard; `missing` renders `The video could not load. Watch the recording instead ›` → `reelHref('sybil-eclipse')`; poster button `aria-disabled` while `missing`.
- DitherCanvas: `delay?: number` prop; step timers `i * REVEAL_STEP_MS + (delay ?? 0)`. DitherImage already forwards rest.

**Acceptance**
- `DitherCanvas.test.ts`: with `delay={90}` the first step fires at 90 ms, not 0 (fake timers).
- VideoPlate test (new `VideoPlate.test.tsx`): simulate `error` on the video in a production-env render → note text present, link href = `/reels/sybil-eclipse/`, button `aria-disabled="true"`.
- Screenshot `landing-1440x900.png` crop of Fig. 3 at 0.8 s and 1.8 s after scroll-in: ring visible, square; `motion-landing-1440x900-reduced.png`: no ring animation (computed `animation-name: none`).
- No `filter` computed on `[data-k=card]` inside Fig. 2 (CDP computed style).

**Estimate:** 50 min

---

## T5 — Sections: What it does, Same names, Live mainnet; copy fixes

**Owns:** `web/components/landing/Sections.tsx`, `Sections.module.css`, `landing.test.ts`, `web/lib/copy.ts`, `copy.test.ts`
**Closes:** motion-07, motion-10 (usage side), motion-11, motion-23, land-12 (credit + series parts), land-22
**Depends on:** T4 (`delay` prop).

**Work**
- `data-reveal` on each section; `up` kinds with `--i` by reading order (What it does: h2 0, p 1–3, chev 4; Same names: stills first, then prose and series; Live mainnet: h2 0, p 1, credit 2).
- Jaeger `DitherImage delay={90}`.
- `@media (max-width: 640px) { .stills { aspect-ratio:auto; height:auto } .stillA, .stillB { position:static; width:100%; aspect-ratio:16/9; margin-top:12px } }`.
- Live mainnet: inline observer glyph (legend's signal double ring) before "MAINNET badge", `aria-hidden`, pulse ring 2 s scale 1→2.6 opacity .55→0 under `no-preference`; add the D6 sentence. No LIVE pill.
- `.section p.credit { font-size: var(--t-body) }`, `.series { font-size: var(--t-ui) }`.
- Copy: `'flood published'`; `FIG3 = '57 seconds: one publish, five Sybils, one eclipse, one heal.'`; update `copy.test.ts`.

**Acceptance**
- `copy.test.ts` pins the new FIG3; honesty grep (R46) still empty: `grep -rn "identical run\|mesh path" web/components web/app web/lib | grep -v copy.ts | grep -v "not an identical\|not mesh paths"` → no output.
- `landing.test.ts`: every landing `<section>` has `data-reveal`; Live mainnet section contains the glyph with `aria-hidden` and the slot sentence; no element with text `LIVE` in that section.
- Screenshot `landing-390x844-full.png`: stills stacked full width, each ≥ 358×201; measured `p.credit` font-size ≥ 13 px at 390.

**Estimate:** 55 min

---

## T6 — Page assembly: skip link, Tagline, FAQ, Final CTA, Footer

**Owns:** `web/app/page.tsx`, `page.test.ts`, `web/components/landing/Tagline.tsx` + `Tagline.module.css` (new), `Faq.tsx` + `Faq.module.css` (new), `FinalCta.tsx` (new, imports `Hero.module.css` read-only), `Footer.tsx`, `Footer.module.css`
**Closes:** land-01, motion-06, land-02, motion-12, land-03, motion-13 (CTA part), land-04 (link part), land-12 (footer part), land-21, land-09 (footer part), motion-20 (footer part)

**Work**
- page.tsx order: `<a href="#main" className="skip">Skip to content</a>`, `<Nav/>`, `<main id="main">` Hero → Readouts → **Tagline** → WhatItDoes → Fig. 2 → Fig. 3 → SameNames → LiveMainnet → **Faq** → **FinalCta** `</main>` → `<Footer/>`.
- Tagline: `<section data-reveal aria-label="Tagline">`, `MECHANISM` then `<br/>` then `RECORDING_NOT_RUN` with `::first-letter { text-transform: uppercase }`, each word `<span data-w style={{'--i': i}}>` continuing the index across both lines; `[data-w] { opacity: .3; transition: opacity var(--d-fade) var(--e); transition-delay: calc(var(--i) * 60ms) } [data-in] [data-w] { opacity: 1 }` under `no-preference`; reduced motion / no-JS: opacity 1. Type `400 var(--t-h1)/var(--lh-tight) var(--font-display)`, width `min(var(--col-prose), 100% - 2*var(--gutter))`.
- Faq: `<section data-reveal><h2>Questions</h2><dl>` with the eight pairs from land-02, `up` --i per dt/dd pair. Numbers are from `backend/gossip/engine.py` (D = 6, HEARTBEAT_INTERVAL = 1.0), `docs/protocols.md:448`, `docs/research-live-network.md:117` (−10 vs −4000/−8000/−16000), `reel-stats.json`, `manifest.json`. Q1's mainnet comparison must read "D 8, 0.7 s and prune thresholds in the thousands" — verified against the research note's table; leave the rest verbatim.
- FinalCta: `<section data-reveal>` with one line `Fifty peers, five Sybils, two heartbeats.` (`up`), `.btn.btn-primary` → `/sim/` (`pop`), `.chev` → `reelHref('sybil-eclipse')` (`up`), reusing `Hero.module.css` `.row`/`.cta`.
- Footer: `.footer li a { display:inline-flex; align-items:center; min-height:44px } .footer li + li { margin-top: 8px }`; `@media (max-width: 640px) { .footer { font-size: 16px } }`; `.footer a { transition: color var(--d-fast) var(--ease) } .footer a:hover { text-decoration: underline; text-underline-offset: .35em }`; add line `No account, no analytics, no cookies. Recordings run offline.` beside the licence. Footer gets no `data-reveal`.

**Acceptance**
- `page.test.ts`: section order as above; first focusable element is the skip link; `main#main` exists; FAQ has 8 `dt`; Tagline text equals `Same mechanism, toy constants.` + `Reproducible recording, not an identical run` (rendered, with the first-letter rule the raw text stays lowercase so the honesty grep passes).
- Tab from page load: 1st Tab focuses skip link (visible, top ≥ 8 px), Enter moves focus/scroll to `#main`.
- Screenshots `landing-1440x900-full.png`, `landing-390x844-full.png`: Tagline, FAQ, Final CTA present; footer links measured ≥ 44 px tall with ≥ 8 px gaps; footer font 16 px at 390.
- Reduced-motion full-page screenshot: tagline words all at opacity 1.

**Estimate:** 80 min

---

## T7 — Sim shell: strip, toolbar, drawers, overlays, breakpoint, connecting state

**Owns:** `web/components/sim/SimApp.tsx`, `SimApp.module.css`, `SimApp.test.tsx`, `CommandStrip.tsx`, `CommandStrip.module.css`, `CommandStrip.test.tsx`, `Toolbar.tsx`, `Toolbar.module.css`, `Toolbar.test.tsx`, `Ticker.module.css`, `Provenance.module.css`, `Narrator.module.css`, `Toasts.tsx`, `Toasts.module.css`, `Toasts.test.tsx`, `Menus.module.css`, `web/lib/store.ts`, `store.test.ts`
**Closes:** resp-01, prod-02, resp-02, prod-01, resp-03, resp-04, resp-05 (strip part), resp-06 (breakpoint, D1), resp-07, prod-06, resp-15, prod-17, resp-16 (strip/toolbar part), resp-17 (speeds, stepper), prod-09 (store + pill; rail skeletons in T8), prod-10, prod-11, prod-21

**Work**
- D1: `SIM_BREAKPOINT = 1024`; `1023px` → `1024px` in SimApp, CommandStrip, Toolbar, Menus, Narrator module CSS.
- D10: in SimApp's existing store subscription, `if (selectedPeer && isNarrow) setDrawer(null)`.
- D8: `.canvas { container-type: inline-size }`; move the two-row strip rules into a shared block applied by both `@container (max-width: 760px)` and `@media (max-width: 1024px)` (duplicate the ~10 lines; CSS has no `or` across container/media).
- Landscape: `@media (max-width: 1024px) and (max-height: 500px) { .strip { display:flex; overflow-x:auto; scrollbar-width:none; bottom: var(--s-2) } .row { display: contents } }`.
- `.strip { padding-bottom: env(safe-area-inset-bottom) }` in the touch band; Toolbar `.bar { padding-inline: max(var(--s-4), env(safe-area-inset-left)) }`.
- Toolbar `.pill { min-width:0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis }`, `.menuBtn { white-space:nowrap; flex:none; min-height:44px; min-width:44px }`.
- Ticker touch band: `--t-hero-n: clamp(20px, 3.2vw, 44px); gap: var(--s-3); overflow-x:auto`; `.cell:first-child { min-width:0; overflow:hidden }`; drop the `min-width: 4ch` floor.
- Provenance touch band: `.card { top: calc(var(--s-3) + 44px + var(--s-2)); max-width: calc(100% - 176px - 3*var(--s-3)) }` (44 px because T8 raises the mode tabs to 44).
- Narrator touch band: `.card { z-index: 3; background: var(--panel); max-width: calc(100% - 200px); top: calc(var(--s-3) + 44px + var(--s-2)) }`.
- Toasts: `@keyframes toastIn { from { opacity:0; transform: translateY(-4px) } }`, `animation: toastIn var(--d-fast) var(--e2) both`; touch band `top: calc(var(--s-3) + 44px + var(--s-2)); width: calc(100% - 2*var(--s-3))`.
- Menus: popover transition with `@starting-style` and `display/overlay allow-discrete` (prod-11); touch band `.stepper { gap: var(--s-2) }`; CommandStrip touch band `.speeds { gap: var(--s-2) }` with hairline re-added per button.
- `aria-controls="rail-stats" / "rail-log"` on the strip buttons; `id`s on the asides.
- store: `connecting: boolean` true from `bootSim` until first open/close; `selectPill` returns `connecting` → Toolbar pill `CONNECTING…` in `--fg-3` (sibling of the `.pill[data-state]` rules).

**Acceptance**
- `SimApp.test.tsx`: at narrow, selecting a peer while the Log drawer is open closes the drawer; the inspector wrapper is not inert afterwards.
- `store.test.ts`: initial `connecting === true`, pill `connecting`; after `open` → `live`; after `close` without open → `offline`.
- `CommandStrip.test.tsx`: buttons have `aria-controls` matching aside ids.
- CDP measurements: at 1024×768 and 1280×720 strip `scrollWidth === clientWidth` and `Inject fault` right edge ≤ canvas right edge; at 844×390 strip height ≤ 56 px and mesh visible band ≥ 200 px; at 390×844 provenance ∩ mode switcher = 0 px, toast ∩ mode switcher = 0 px, pill single line, toolbar height = 44.
- Screenshots: `sim-1024x768.png`, `sim-1280x720.png`, `sim-844x390.png`, `sim-390x844.png`, `reels-mainnet-block-wave-390x844.png`, `sim-390x844-hero.png`, `sim-390x844-logrow.png` (sheet open, drawer closed). `curl /sim/` shows `data-state="connecting"`.

**Estimate:** 120 min

---

## T8 — Sim canvas chrome and rails: touch targets, legend motion, empty states, GEO toast

**Owns:** `web/components/sim/Legend.tsx`, `Legend.module.css`, `Legend.test.tsx`, `ModeSwitcher.tsx`, `ModeSwitcher.module.css`, `ModeSwitcher.test.tsx`, `LogRail.tsx`, `LogRail.module.css`, `LogRail.test.tsx`, `Inspector.tsx`, `Inspector.module.css`, `StatsRail.tsx`, `StatsRail.module.css`, `ReelProgress.module.css`
**Closes:** resp-05 (legend part), resp-06 (legend part), resp-09, prod-03, prod-04, resp-10, prod-05, resp-17 (legend head), resp-18, resp-16 (inspector part), prod-07, prod-08, prod-12, prod-15, motion-22, prod-09 (rail skeletons)
**Depends on:** T7 (breakpoint 1024, `connecting` in store).

**Work**
- D1 flip in Legend.module.css, Legend.tsx `matchMedia`, Inspector.module.css.
- Touch band: ModeSwitcher `.tab { min-height:44px; padding-inline: var(--s-4) }`; Legend `top: calc(var(--s-3) + 44px + var(--s-2))`, `.btn { width:44px; height:44px }`, `.head { gap: var(--s-2) }`, `.row { min-height:44px }`, `.switch { width:40px; height:24px }` knob 20, `.input { min-height:36px }`, `aside[aria-label=Legend] { max-height: calc(100dvh - 44px - 44px - 80px); overflow-y:auto }`; LogRail `.row { height:44px; line-height:44px }`, `.chip { min-height:36px; padding:0 var(--s-3) }`, `.chips { gap: var(--s-2) }`; Inspector same chip rules, `.panel { padding-bottom: env(safe-area-inset-bottom); max-height: min(70dvh, calc(100dvh - var(--toolbar-h) - 120px)) }`; StatsRail `.beat { min-height:44px }`. Desktop: log rows `--row-h` ≥ 24 px.
- Legend: keep the body mounted; grid wrapper `grid-template-rows: 0fr → 1fr` with `transition: grid-template-rows var(--d-fast) var(--e)`; `aria-label={collapsed ? 'Expand legend' : 'Collapse legend'}`; `transition: transform var(--d-fast) var(--e)` on line 65.
- ModeSwitcher GEO: `aria-disabled` + click → `addToast(GEO_DISABLED, 'info')`; keep greyed style on `[aria-disabled]`.
- LogRail empty state (`no categories selected · All restores them` / `waiting for the first event`), `.empty` style. Inspector: `Chips` → `none` when empty; sparkline gated on `values.length > 1` with `collecting…`; `no events for this peer yet`.
- ReelProgress: `transform: scaleX(var(--p)); transform-origin:left; transition: transform var(--d-fast) var(--io)`.
- While `connecting`: StatsRail KPI tiles, state strip and LogRail list render `.skeleton` blocks with `aria-busy` on the asides.

**Acceptance**
- `Legend.test.tsx`: label flips with state; body stays in the DOM when collapsed (`hidden`/`data-open`). `ModeSwitcher.test.tsx`: GEO click with MAINNET off pushes a toast and does not change layout. `LogRail.test.tsx`: empty text for `active.size === 0` and for no rows.
- CDP at 390×844 and 768×1024: every `button, [role=button], [role=switch]` inside legend/switcher/log/inspector ≥ 44×44 (chips ≥ 36 tall), gaps ≥ 8 px; at 1024×768 legend ∩ mode switcher = 0 px; at 844×390 legend expanded height ≤ viewport − 168 and inspector sheet ≤ 390 − 44 − 120.
- Lighthouse a11y on `/sim/` and `/reels/sybil-eclipse/` ≥ 0.95 with zero `target-size` failures.
- Screenshots: `sim-390x844-legend.png`, `sim-390x844-settings.png`, `sim-768x1024-logrow.png`, `sim-844x390-logrow.png`, `sim-390x844-connecting.png` (throttled socket).

**Estimate:** 110 min

---

## T9 — Routes and feedback: 404, /figure/ wrapper, action error toasts, scrubber ticks

**Owns:** `web/app/not-found.tsx`, `web/app/figure/page.tsx`, `web/lib/actions.ts`, `actions.test.ts`, `web/components/sim/Scrubber.tsx`, `web/lib/api/replay.ts` (+ its test), `web/lib/timeline-marks.ts` only if `ticksFor` lives there
**Closes:** resp-11, prod-19, prod-20, prod-16, prod-18
**Not touched:** `FigureFrame.tsx`, `public/figures/sorter.html` (G.1).

**Work**
- not-found: `<Nav/>`, `<main id="main" style={{ padding:'var(--s-16) var(--gutter)', minHeight:'60dvh' }}>` prose column, one `t-ui` sentence, `.btn.btn-primary` → `/`, `.chev` → `/sim/`, `<Footer/>`; `export const metadata = { title: 'Not found' }`.
- figure/page.tsx: fixed top-left `← Luminar` `.chev` link (44 px, z above iframe); `.skeleton` behind the iframe and `aria-busy` until `onLoad` (a 10-line client wrapper in the page file).
- actions: route `togglePlay`, `setSpeed`, `reset` through the existing `toast(r, label)` on `!r.ok`.
- Scrubber: seed `beats` from a one-time pre-scan of narrator/phase events at reel load (in `replay.ts` where the JSONL is parsed) so `ticksFor` draws the full track at T+0; reel guards untouched.

**Acceptance**
- `actions.test.ts`: with `post` rejecting, `setSpeed(2)` → one toast `backend offline`; success → none.
- replay test: loading the `sybil-eclipse` fixture yields the full beat list before any frame is played; Scrubber renders N ticks at T+0 equal to the count after a full play-through.
- Screenshots `404-390x844.png`, `404-1920x1080.png` (nav, gutter, 44 px links; document title `Not found`), `figure-390x844.png` with the back link visible; Lighthouse a11y on `/404.html` ≥ 0.95.

**Estimate:** 60 min

---

## T10 — Final walk: screenshots, Lighthouse, reduced-motion, `make check`, hand-offs

**Owns:** `docs/superpowers/plans/parts/motion-walk/` (screenshots + `README.md` index), `docs/roadmap-devcon8.md` status line, no `web/` files
**Closes:** addendum §5 "done means"; records the resp-14 hand-off.

**Work**
- Build the static export; run the 6 routes × 7 viewports at DPR 1 plus 390×844 and 1440×900 at DPR 2 with the audit's `cdp-audit.mjs` (copied in `audit/measurements/`) into `motion-walk/<route>-WxH[@2x].png` (addendum naming, replacing the audit prefix set).
- Horizontal-scroll check: `document.documentElement.scrollWidth <= innerWidth` on every route × viewport; overlap pass with the audit's measurement script (expect 0 for every pair it reported).
- Lighthouse: `/` a11y ≥ .95 and perf ≥ .85; `/sim/` and `/reels/sybil-eclipse/` a11y ≥ .95.
- Reduced-motion walk: `--force-prefers-reduced-motion` full-page screenshots of `/` at 1440×900 and 390×844; assert no element has a running animation/transition (`document.getAnimations().length === 0` after 2 s).
- `make check`; honesty grep (R46) empty.
- Write `motion-walk/README.md`: screenshot index, Lighthouse scores, hand-off to G.1 (resp-14 `sorter.html` landscape `.stats` rule, suggested `@media (max-height: 500px)`), and the `NEXT_PUBLIC_SITE_URL` deploy note from land-05.

**Acceptance:** the README lists every file with its measured result; `make check` output pasted; three Lighthouse JSONs saved beside the screenshots.

**Estimate:** 60 min

---

## Totals and order

| Task | Minutes | Blocks |
|---|---|---|
| T1 infra | 75 | all |
| T2 nav | 40 | — |
| T3 hero/readouts/Fig. 1 | 90 | T4 (Figure `kind` prop), T6 (Hero.module.css classes) |
| T4 plates | 50 | T5 (`delay` prop) |
| T5 sections | 55 | — |
| T6 page assembly + footer | 80 | — |
| T7 sim shell | 120 | T8 (breakpoint, `connecting`) |
| T8 sim chrome/rails | 110 | — |
| T9 routes/feedback | 60 | — |
| T10 final walk | 60 | — |
| **Total** | **740 min (~12.5 h)** | |

File-ownership check: no path appears in two tasks (`Hero.module.css` is edited only in T3 and imported read-only in T6; `Figure.tsx` only in T3; `globals.css`/`tokens.css`/`layout.tsx` only in T1; `store.ts` only in T7; `actions.ts` only in T9).
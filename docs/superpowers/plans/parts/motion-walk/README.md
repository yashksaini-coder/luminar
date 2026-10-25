# Motion/responsive final walk (T10)

Verified at `03a571a` on branch `feat/ui-overhaul`, 2026-10-25, after every lane (T1–T9) and polish
task P.1 merged. Plan: `docs/superpowers/plans/2026-10-25-motion-responsive-plan.md` (T10); done
criteria: `docs/superpowers/specs/2026-10-25-motion-responsive-addendum.md` §5.

## How it was measured

- Static export: `cd web && npm run build`, served with `python3 -m http.server 9010 --bind 127.0.0.1`
  from `web/out`. `/sim/` live through `NEXT_PUBLIC_API_URL=http://localhost:8000 npm run dev -- -p 3010`
  against the shared backend on :8000.
- `measurements/walk.mjs` is the audit's `audit/measurements/cdp-audit.mjs` trimmed to the default
  state: headless Chromium over CDP, `Emulation.setDeviceMetricsOverride` per viewport (touch + iPhone
  UA at ≤ 1024), settle 2.5 s (landing, 404) / 4 s (figure, sim) / 7 s (reels), then an in-page script
  records `document.documentElement.scrollWidth` vs `innerWidth`, elements whose box leaves the
  viewport (`overflowers`, excluding `position: fixed`, canvases and dither), and overlapping pairs of
  fixed/absolute/sticky elements (the audit's overlap pass), then `Page.captureScreenshot`. Results:
  `measurements/walk-full-all-all.json`.
- Reduced motion: the same script with `RM=1` adds `--force-prefers-reduced-motion`, scrolls through
  the whole page so every `[data-reveal]` section has met the IntersectionObserver, waits 2 s, then
  reads `document.getAnimations().length` and takes a full-page capture
  (`measurements/walk-rm-landing-all.json`). `CTRL=1` is the same run without the flag
  (`measurements/walk-ctrl-landing-all.json`): it proves the assertion can fail.
- Lighthouse 12.8.2 (`npx lighthouse@12.8.2 … --chrome-flags="--headless=new --no-sandbox --disable-gpu"`),
  default mobile preset (412×823, 4× CPU slowdown, simulated slow 4G); `/` was also run with
  `--preset=desktop`. JSONs sit beside the screenshots.

## Screenshot index: 6 routes × 9 viewports (DPR 1 set + 390×844@2x + 1440×900@2x)

`h-scroll` is `scrollWidth > innerWidth` (the addendum's horizontal-scroll check). "fixed/abs pairs"
counts every overlapping pair the audit script reports; "chrome-on-chrome" keeps only pairs where
neither side is the deck.gl canvas container (`div` / `div.fill`, which underlies every overlay by
design).

| route | viewport | file | scrollWidth / innerWidth | h-scroll | overflowers | fixed/abs pairs overlapping | chrome-on-chrome pairs |
|---|---|---|---|---|---|---|---|
| landing | 390x844 | `landing-390x844.png` | 390 / 390 | no | 3 | 0 | 0 |
| landing | 844x390 | `landing-844x390.png` | 844 / 844 | no | 0 | 1 | _5eMK_W_stillA × _5eMK_W_stillB 134×193 |
| landing | 768x1024 | `landing-768x1024.png` | 768 / 768 | no | 0 | 1 | _5eMK_W_stillA × _5eMK_W_stillB 122×176 |
| landing | 1024x768 | `landing-1024x768.png` | 1024 / 1024 | no | 0 | 1 | _5eMK_W_stillA × _5eMK_W_stillB 163×235 |
| landing | 1280x720 | `landing-1280x720.png` | 1280 / 1280 | no | 0 | 1 | _5eMK_W_stillA × _5eMK_W_stillB 181×261 |
| landing | 1440x900 | `landing-1440x900.png` | 1440 / 1440 | no | 0 | 1 | _5eMK_W_stillA × _5eMK_W_stillB 181×261 |
| landing | 1920x1080 | `landing-1920x1080.png` | 1920 / 1920 | no | 0 | 1 | _5eMK_W_stillA × _5eMK_W_stillB 181×261 |
| landing | 390x844@2x | `landing-390x844@2x.png` | 390 / 390 | no | 3 | 0 | 0 |
| landing | 1440x900@2x | `landing-1440x900@2x.png` | 1440 / 1440 | no | 0 | 1 | _5eMK_W_stillA × _5eMK_W_stillB 181×261 |
| sim | 390x844 | `sim-390x844.png` | 390 / 390 | no | 26 | 0 | 0 |
| sim | 844x390 | `sim-844x390.png` | 844 / 844 | no | 26 | 0 | 0 |
| sim | 768x1024 | `sim-768x1024.png` | 768 / 768 | no | 26 | 0 | 0 |
| sim | 1024x768 | `sim-1024x768.png` | 1024 / 1024 | no | 26 | 0 | 0 |
| sim | 1280x720 | `sim-1280x720.png` | 1280 / 1280 | no | 0 | 6 | 0 |
| sim | 1440x900 | `sim-1440x900.png` | 1440 / 1440 | no | 0 | 8 | 0 |
| sim | 1920x1080 | `sim-1920x1080.png` | 1920 / 1920 | no | 0 | 8 | 0 |
| sim | 390x844@2x | `sim-390x844@2x.png` | 390 / 390 | no | 26 | 0 | 0 |
| sim | 1440x900@2x | `sim-1440x900@2x.png` | 1440 / 1440 | no | 0 | 8 | 0 |
| reels-sybil-eclipse | 390x844 | `reels-sybil-eclipse-390x844.png` | 390 / 390 | no | 26 | 0 | 0 |
| reels-sybil-eclipse | 844x390 | `reels-sybil-eclipse-844x390.png` | 844 / 844 | no | 26 | 0 | 0 |
| reels-sybil-eclipse | 768x1024 | `reels-sybil-eclipse-768x1024.png` | 768 / 768 | no | 26 | 0 | 0 |
| reels-sybil-eclipse | 1024x768 | `reels-sybil-eclipse-1024x768.png` | 1024 / 1024 | no | 26 | 0 | 0 |
| reels-sybil-eclipse | 1280x720 | `reels-sybil-eclipse-1280x720.png` | 1280 / 1280 | no | 0 | 10 | 0 |
| reels-sybil-eclipse | 1440x900 | `reels-sybil-eclipse-1440x900.png` | 1440 / 1440 | no | 0 | 12 | 0 |
| reels-sybil-eclipse | 1920x1080 | `reels-sybil-eclipse-1920x1080.png` | 1920 / 1920 | no | 0 | 12 | 0 |
| reels-sybil-eclipse | 390x844@2x | `reels-sybil-eclipse-390x844@2x.png` | 390 / 390 | no | 26 | 0 | 0 |
| reels-sybil-eclipse | 1440x900@2x | `reels-sybil-eclipse-1440x900@2x.png` | 1440 / 1440 | no | 0 | 12 | 0 |
| reels-mainnet-block-wave | 390x844 | `reels-mainnet-block-wave-390x844.png` | 390 / 390 | no | 26 | 0 | 0 |
| reels-mainnet-block-wave | 844x390 | `reels-mainnet-block-wave-844x390.png` | 844 / 844 | no | 26 | 0 | 0 |
| reels-mainnet-block-wave | 768x1024 | `reels-mainnet-block-wave-768x1024.png` | 768 / 768 | no | 26 | 0 | 0 |
| reels-mainnet-block-wave | 1024x768 | `reels-mainnet-block-wave-1024x768.png` | 1024 / 1024 | no | 26 | 0 | 0 |
| reels-mainnet-block-wave | 1280x720 | `reels-mainnet-block-wave-1280x720.png` | 1280 / 1280 | no | 0 | 9 | k_Rz1G_switch × LaCa9a_card 69×18 |
| reels-mainnet-block-wave | 1440x900 | `reels-mainnet-block-wave-1440x900.png` | 1440 / 1440 | no | 0 | 10 | 0 |
| reels-mainnet-block-wave | 1920x1080 | `reels-mainnet-block-wave-1920x1080.png` | 1920 / 1920 | no | 0 | 10 | 0 |
| reels-mainnet-block-wave | 390x844@2x | `reels-mainnet-block-wave-390x844@2x.png` | 390 / 390 | no | 26 | 0 | 0 |
| reels-mainnet-block-wave | 1440x900@2x | `reels-mainnet-block-wave-1440x900@2x.png` | 1440 / 1440 | no | 0 | 10 | 0 |
| figure | 390x844 | `figure-390x844.png` | 390 / 390 | no | 0 | 0 | 0 |
| figure | 844x390 | `figure-844x390.png` | 844 / 844 | no | 0 | 0 | 0 |
| figure | 768x1024 | `figure-768x1024.png` | 768 / 768 | no | 0 | 0 | 0 |
| figure | 1024x768 | `figure-1024x768.png` | 1024 / 1024 | no | 0 | 0 | 0 |
| figure | 1280x720 | `figure-1280x720.png` | 1280 / 1280 | no | 0 | 0 | 0 |
| figure | 1440x900 | `figure-1440x900.png` | 1440 / 1440 | no | 0 | 0 | 0 |
| figure | 1920x1080 | `figure-1920x1080.png` | 1920 / 1920 | no | 0 | 0 | 0 |
| figure | 390x844@2x | `figure-390x844@2x.png` | 390 / 390 | no | 0 | 0 | 0 |
| figure | 1440x900@2x | `figure-1440x900@2x.png` | 1440 / 1440 | no | 0 | 0 | 0 |
| 404 | 390x844 | `404-390x844.png` | 390 / 390 | no | 0 | 0 | 0 |
| 404 | 844x390 | `404-844x390.png` | 844 / 844 | no | 0 | 0 | 0 |
| 404 | 768x1024 | `404-768x1024.png` | 768 / 768 | no | 0 | 0 | 0 |
| 404 | 1024x768 | `404-1024x768.png` | 1024 / 1024 | no | 0 | 0 | 0 |
| 404 | 1280x720 | `404-1280x720.png` | 1280 / 1280 | no | 0 | 0 | 0 |
| 404 | 1440x900 | `404-1440x900.png` | 1440 / 1440 | no | 0 | 0 | 0 |
| 404 | 1920x1080 | `404-1920x1080.png` | 1920 / 1920 | no | 0 | 0 | 0 |
| 404 | 390x844@2x | `404-390x844@2x.png` | 390 / 390 | no | 0 | 0 | 0 |
| 404 | 1440x900@2x | `404-1440x900@2x.png` | 1440 / 1440 | no | 0 | 0 | 0 |

Readings:

- **Horizontal scroll: none** on any of the 54 route × viewport cells (every `scrollWidth` equals
  `innerWidth`).
- `landing` 390×844 overflowers (3): the Fig. 1 halo `svg.halo` (`FigurePlate.module.css`
  `right: -24px`) sits at x 300–395 on a 390-wide viewport; its plate clips it and the document does
  not scroll. Decorative, unchanged from the audit (audit: 302–398).
- `sim` / `reels-*` overflowers (26) at ≤ 1024: the closed Stats drawer (`StatsRail` subtree at
  x −264…−1) parked off-canvas by its transform; the document does not scroll. Expected drawer state.
- Overlap pass against the audit's reported pairs (`audit/measurements/static-summary.txt`,
  `sim-summary.txt`):
  - landing 390×844 `stillA × stillB` 61×88 → **0** (the stills stack at phone width,
    `Sections.module.css:11`). At ≥ 844 the pair reads 122…181 × 176…261: that is the designed
    layered composition (`.stillA { left:0; width:62% } .stillB { right:0; top:22%; width:55% }`),
    not a collision.
  - sim 1024×768 `Layout switch × Legend` 53×18 → **0**.
  - reels-mainnet-block-wave 390×844 `Layout × Data provenance` 177×18 and `Data provenance × Legend`
    130×30 → **0**; 1024×768 `Layout × Data provenance` → **0**.
  - **Remaining:** reels-mainnet-block-wave 1280×720 only: `Layout switch × Data provenance card`
    boxes overlap 69×18 px (the 320 px card, both rails open, canvas column 692 px wide; the
    centred switch's box reaches the card's right edge). Gone at 1440 and at ≤ 1024. Hand-off, see
    below; T10 owns no `web/` file.
  - `span.band × div.fill` (reels-sybil-eclipse ≥ 1280): the scrubber's phase bands over the canvas
    container, by design.

## Reduced-motion walk

| file | viewport | page height | `getAnimations().length` after 2 s | control run (no flag) |
|---|---|---|---|---|
| `landing-1440x900-reduced-full.png` | 1440×900 | 7455 px | **0** | 4 (`ringScale`/`ringFade` on the Fig. 3 play chip, `obsScale`/`obsFade` on the live-mainnet observer glyph) |
| `landing-390x844-reduced-full.png` | 390×844 | 6228 px | **0** | 4 (same four) |

Every section is in its final state in both captures (hero copy, readout counters at their final values 50 · 5 · 2 · 100 %, tagline at full `--fg`, Fig. 2 globe, Fig. 3 poster, stills, FAQ
footer). Nothing runs under `prefers-reduced-motion: reduce`.

## Lighthouse

| route | JSON | preset | performance | accessibility | best-practices | SEO | target |
|---|---|---|---|---|---|---|---|
| `/` | `lighthouse-landing.json` | mobile (default) | **0.73** | **0.96** | 1.00 | 1.00 | a11y ≥ .95 ✓ · perf ≥ .85 **✗** |
| `/` | `lighthouse-landing-desktop.json` | desktop | 0.96 | 0.96 | — | — | (reference run) |
| `/sim/` (dev server) | `lighthouse-sim.json` | mobile | 0.50 | **1.00** | 0.96 | — | a11y ≥ .95 ✓ |
| `/reels/sybil-eclipse/` | `lighthouse-reels-sybil-eclipse.json` | mobile | 0.45 | **1.00** | 1.00 | — | a11y ≥ .95 ✓ |

Mobile `/` detail (two runs, identical): FCP 2.4 s, LCP **7.1 s** (score 0.06), TBT 30–50 ms,
CLS 0, Speed Index 2.4 s. LCP element `section.hero > div.prose > p.lead`; LCP breakdown TTFB 451 ms
(6 %), load delay 0, load time 0, **render delay 6.6 s (94 %)**. Cause: `app/layout.tsx` sets
`data-js` before paint and `globals.css:453` (`:root[data-js] [data-reveal]:not([data-in]) [data-k]
{ opacity: 0 }`) hides every reveal child, hero copy included, until the `Reveal` island hydrates
and `attachReveal()` sets `data-in`. Under the 4× CPU / slow-4G simulation hydration lands ~6.6 s
after first paint, so the largest text block is painted late. Desktop (no throttling) scores 0.96
with LCP 1.3 s on the `h1`. The fix is one line in a T1/T3 file, not T10's: mark the hero section
`data-in` from the same inline script (or leave the hero's `[data-k]` children ungated and let the
hero choreography run as a CSS animation from first paint). Perf on `/sim/` and `/reels/` is
not a target (WebGL + reel payload; TBT 1.3–1.6 s).

Landing a11y 0.96: the single failing audit is `color-contrast` on the Tagline words
(`section.tagline > p.line > span`, measured `#505051` on `#0b0b0d`, 2.44:1): Lighthouse reads the
pre-activation 30 % opacity state (D7) of the words that had not yet revealed when it audited. The
activated words are `--fg`. `/sim/` and `/reels/` have no failing a11y audit.

## `make check` (2026-10-25, at 03a571a)

```
uv run ruff check backend/ tests/
All checks passed!
uv run ruff format --check backend/ tests/
53 files already formatted
…
============================= 130 passed in 5.86s ==============================
cd web && npx tsc --noEmit && npm run lint && npx vitest run

> lint
> eslint .


 RUN  v5.0.5 /home/yks/Projects/luminar/web

Not implemented: HTMLCanvasElement's getContext() method: without installing the canvas npm package
grep: ../backend/otel/__pycache__/metrics.cpython-312.pyc: binary file matches

 Test Files  72 passed (72)
      Tests  319 passed (319)
   Start at  23:06:24
   Duration  6.55s (environment 76%, import 13%, tests 9%, transform 1%, worker 1%)
…
> next build

▲ Next.js 16.4.3 (Turbopack)
✓ Running next.config.ts took 22ms

  Creating an optimized production build ...
✓ Compiled successfully in 126ms
…
✓ Generating static pages using 8 workers (10/10) in 431ms
  Finalizing page optimization ...

Route (app)
┌ ○ /
├ ○ /_not-found
├ ○ /figure
├ ○ /icon.svg
├   /reels/[name]
│ ├ ● /reels/sybil-eclipse
│ ├ ● /reels/partition-heal
│ ├ ● /reels/healthy-publish
│ └ ● /reels/mainnet-block-wave
└ ○ /sim


○  (Static)  prerendered as static content
●  (SSG)     prerendered as static HTML (uses generateStaticParams)

exit 0
```

Honesty grep (R46): `grep -rn "identical run\|mesh path" web/components web/app web/lib | grep -v copy.ts |
grep -v "not an identical\|not mesh paths"` → no output (exit 1).

## Lane evidence already in this directory

Earlier captures from the audit and the lanes are kept as evidence, unchanged:

- `audit/` — the 2026-10-25 audit at `9023d96` (`cdp-audit.mjs`, `summarize.py`, `*-summary.txt`,
  the `audit/states/` scenario captures and the audit's own `<route>-WxH.png` set).
- T3/T4 (hero, plates): `landing-1440x900-t0.png`, `landing-1440x900-full.png`,
  `landing-1440x900-full-reduced.png`, `landing-1440x900-fig3-{0.8,1.8}s[-crop].png`,
  `motion-landing-1440x900-reduced[-crop].png`, `landing-390x844-prehydration.png`,
  `landing-390x844-full.png`, `landing-390x844-menu.png`.
- T7/T8 (sim shell, rails): `sim-390x844-{connecting,connecting-stats,hero,legend,logrow,settings}.png`,
  `sim-{768x1024,844x390}-logrow.png`, the `*-r2.png` second-round set
  (`sim-390x844-{connecting,geo-toast,legend,logrow,peer,settings}-r2.png`,
  `sim-{768x1024,844x390}-logrow-r2.png`, `sim-1280x720-r2.png`) and the `*-review.png` captures
  (`sim-390x844-{legend,settings}-review.png`, `sim-{768x1024,844x390}-logrow-review.png`,
  `sim-1280x720-review.png`, `reel-progress-1024x768-review.png`).
- T9 (routes): `lighthouse-404.json`, `404-{390x844,1920x1080}.png` (now re-taken above).

## Hand-offs

1. **`NEXT_PUBLIC_SITE_URL` must be set at deploy build time** (land-05, T1). `metadataBase` falls back
   to localhost, so `og:image` and the canonical resolve to `http://localhost:3000/...` in the static
   export until the deploy origin is baked in (`NEXT_PUBLIC_SITE_URL=https://<host> npm run build`,
   or the Dockerfile build arg).
2. **G.1 — `web/public/figures/sorter.html` landscape phone** (resp-14): the figure's `.stats` block
   does not fit at 844×390; the suggested rule is `@media (max-height: 500px) { .stats { … } }`
   (collapse to a single row or hide). Plate/iframe files belong to G.1 (addendum §3).
3. **Engine-level landscape-phone overflow of the relay-globe plate** (Fig. 2, G.1): 16 px, pre-existing
   (the plate's iframe content, not the page: the document never scrolls horizontally, see table).
4. **`reels/mainnet-block-wave` at 1280×720 with both rails open**: Data-provenance card and the
   Layout switch overlap 69×18 px (`Provenance.module.css` `max-width: 320px` against the centred
   `ModeSwitcher`). A `max-width: min(320px, calc(50% - 120px))` or a 1280 breakpoint on the card
   clears it; sim-chrome owner (T8 files).
5. **Landing mobile Lighthouse performance 0.73** (target ≥ .85): LCP render delay from the reveal gate,
   see the Lighthouse section; one-line fix in `app/layout.tsx` / `globals.css` (T1) or
   `Hero.tsx` (T3).
6. **README screen captures still show the Vite UI**: the project README's screenshots pre-date the
   `web/` swap (00bb473) and need re-taking from this set.

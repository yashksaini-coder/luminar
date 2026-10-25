# Motion and responsive addendum (2026-10-25)

Addendum to `2026-10-24-ui-overhaul-design.md`. Owner request: "use landing-page-design and
design-to-motion to improve all UI pages and components, checking responsive and all-device
compatibility, with motion that enriches the platform." Skills: `~/.claude/skills/landing-page-design`
and `~/.claude/skills/design-to-motion` (read both before any work in this addendum).

## 1. Precedence

1. The owner's approved design wins where a skill rule conflicts with it: Instrument Panel tokens
   (`web/app/globals.css`, `docs/design/tokens.css`), Bayer dither, Newsreader italic display +
   Geist Mono, flat pitch backgrounds, no Google fonts, `--flame` only for attacker/fault/alarm,
   `--paper-3` never for text, node presets cap 200, honesty lines ("same mechanism, toy
   constants"; "reproducible recordings", never "identical runs"; live data is arrival at
   observer nodes, ~2.5 min behind, never the mesh path).
2. Not applied from landing-page-design B1/B5: the font allow-list, the no-italic rule, Tailwind
   type-scale snapping (snap to the token scale `--t-*` instead), gradient hero headings
   (dither is flat). Spacing snaps to the `--s-*` tokens, radii to the token radii.
3. Everything else in both skills applies: one offer, one audience, one primary action; proof beside
   the claim; tagline reveal (B11); FAQ as objection handling; full state sets (B9); ship
   requirements (B10); motion choreography (B7) with the design-to-motion easing tokens (B6);
   website context rules (IntersectionObserver ~30% once, stories pause off screen, stagger by
   reading order inside a section, `prefers-reduced-motion` = final state, no stories).
4. Content realism and honesty: no invented numbers, names or brands. Counters land on the real
   values from `web/public/reel-stats.json` (or whatever `reel-stats.mjs` writes). Stories use only
   what the simulator actually does.

## 2. Routes and viewports

Routes: `/`, `/sim/` (live, needs the backend), `/reels/sybil-eclipse/`, `/reels/mainnet-block-wave/`,
`/figure/`, `/404.html`. Viewports (CSS px): 390×844 (phone), 844×390 (phone landscape), 768×1024
(tablet), 1024×768, 1280×720, 1440×900, 1920×1080 (stage). DPR 1 and 2. Touch targets ≥ 44 px with
≥ 8 px gaps on phone and tablet; no horizontal scroll at any width; `100dvh` not `100vh`; text ≥ 12 px
mono labels and ≥ 16 px body on phone; keyboard order matches visual order; visible focus rings.

Measuring: the laptop window is maximized and cannot be resized by DevTools, so measure with
`chromium --headless=new --window-size=W,H --screenshot=PATH URL` (static routes through a static
server on `web/out`; `/sim/` through `make web` on :3000 with the backend on :8000) or with a same-origin
`<iframe>` of the target size injected into a page from the same static server.

## 3. Landing (website context of design-to-motion)

Primary action: **Open the simulator**. Secondary "Watch a recording" stays a text link. Message
matches the talk: GossipSub v1.1 scoring you can watch bite.

Section map (confirm against `web/components/landing/*` and `web/app/page.tsx`):

| Section | Motion |
|---|---|
| Nav | Island nav per B7 at ≤1023: hamburger lines morph to an X, overlay `backdrop-filter` on pitch, links stagger in from `translateY(12px)` |
| Hero (headline, sub, CTA, Fig. 1 live plate + readouts) | Text `up` kinds staggered; Fig. 1 is live already (CanvasReveal); readout values count up to their real values once in view |
| Tagline reveal (new, B11) | "Same mechanism, toy constants." plus one more line from `lib/copy.ts`; words activate one at a time with `--e`, from 30% to full `--fg` |
| What it does / benefits | `up` reveal, stagger by reading order |
| Fig. 2 plate (relay globe, task G.1) | Do not edit the plate or iframe files in this pass (G.1 owns them); the plate's frame gets the shared section reveal only |
| Fig. 3 video plate | Poster `photo` kind; play button pulse ring accent (1.8–2.2 s); sheen off (dithered poster) |
| Same names (Grafana / Jaeger stills) | Skeleton then `photo` resolve; no fake cursor story |
| Live mainnet | Pulse ring on the LIVE dot; if the section shows observer arrivals, a real arrival story from the recorded reel, never fabricated |
| FAQ (new) | 6–8 real questions (is this the scoring my node runs? why do Sybils get pruned in two heartbeats? what is live vs recorded? can I run it offline? how big can the mesh go? where does the mainnet data come from?); plain Q/A markup; `up` reveal |
| Final CTA + footer | Same CTA as the top; privacy/terms or repo + licence links; skip link at the top of the page |

## 4. Product UI (/sim/, /reels/, /figure/, 404)

design-to-motion does not cover product interaction; landing-page-design B9 and B10 do: hover,
active (`scale(.98)` or `translateY(1px)`), focus ring, loading skeletons shaped like the rails,
composed empty states (log, inspector, stats before the first message), inline errors (never
`alert`), no dead links, current nav item marked, custom 404 (exists), skip link. Keep the keyboard map
(18 bindings) and the reel guards. Motion inside the product stays ≤ 300 ms with the `--e2` curve for
opacity and the `--e` curve for transforms; the strip, drawers, menus, toasts and legend animate with
them; reduced motion disables all.

## 5. Done means

- Every route renders without horizontal scroll or overlap at every viewport above, with screenshots in
  `docs/superpowers/plans/parts/motion-walk/` (one per route × viewport, named `route-WxH.png`).
- Lighthouse accessibility ≥ 0.95 on `/`, `/sim/`, `/reels/sybil-eclipse/`; performance ≥ 0.85 on `/`.
- `prefers-reduced-motion` walk: every section in its final state, nothing moving.
- tsc, lint (0 warnings), vitest, build, `make check` green; honesty greps net of negations (R46) empty.

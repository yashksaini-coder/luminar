# Landing redesign: a developer landing that shows what Luminar is (2026-10-26)

Owner request (10:46 IST): "fix this section [Same names] and many more sections, a proper modern dev
landing design for what Luminar exactly is, with more components and elements; think as a UI/UX
engineer" with `/landing-page-design`, `/design-to-motion`, `/ui-ux-pro-max`.

Read first: `docs/superpowers/specs/2026-10-25-motion-responsive-addendum.md` §1 (precedence: the owner's
Instrument Panel tokens, display serif + Geist Mono, flat pitch backgrounds, `--flame` only for
attacker/fault/alarm, `--paper-3` never text, honesty lines). Skills: `~/.claude/skills/landing-page-design/SKILL.md`
(Part A, B7–B11), `~/.claude/skills/design-to-motion/SKILL.md` (website context, Part B),
`~/.claude/skills/ui-ux-pro-max/SKILL.md` (accessibility, touch, responsive rules).

## What Luminar is (the one sentence every section serves)

A GossipSub v1.1 network simulator you run on a laptop: 20–200 simulated libp2p peers, P1–P4 peer
scoring, Sybil / eclipse / partition attacks you inject live, reproducible recordings that play
offline, real mainnet block arrivals on a Geo view, and Prometheus + OpenTelemetry output with the
metric names Lighthouse emits. Same mechanism, toy constants. Audience: Ethereum / libp2p protocol
engineers and the Devcon 8 room. Primary action: **Open the simulator** (`/sim/`). Secondary: watch a
recording (`/reels/sybil-eclipse/`), clone the repo.

## Problems today

After the hero the page is prose (What it does, Same names, Live mainnet). A developer cannot see the
product's parts at a glance. The Same names stills are 1-bit dithered screenshots: unreadable noise.

## Page outline (new order; ★ = new component)

1. Nav (keep) · 2. Hero (upgrade) · 3. Readouts (keep) · 4. Tagline (keep)
5. ★ **Features bento** (replaces WhatItDoes) · 6. ★ **How it works** pipeline
7. ★ **Attack explorer** (tabs) · 8. Fig. 2 relay globe (keep) · 9. Fig. 3 video (keep)
10. ★ **Observability** (replaces Same names) · 11. ★ **Live mainnet card** (replaces prose)
12. ★ **Faithfulness table** · 13. ★ **Quick start** · 14. FAQ (keep) · 15. Final CTA (keep) · 16. Footer (keep)

## Facts (use these numbers only; never invent)

- From `web/lib/reel-stats.json`: 50 peers, 5 Sybils, Sybil graft at T+10.2 s, first score prune T+11.9 s
  (2 heartbeats), eclipse on peer-10 at T+16.2 s, faults cleared T+24.1 s, healed in 1.4 s, delivery 100 %,
  avg hops 4.2, avg propagation 100 ms. Import the JSON, do not retype values.
- Engine (`backend/gossip/engine.py`, `scoring.py`): D 6, D_low 4, D_high 8, D_lazy 6, heartbeat 1 s,
  history 50 msg ids, GRAFT bar −5, PRUNE −10; P1 time in mesh ×0.5 cap +5; P2 first deliveries ×1.0 decay ×0.9;
  P3 delivery deficit floored at −0.25; P4 invalid ×−10 decay ×0.5. Node presets 20 · 50 · 100 · 200.
- Mainnet comparison (`docs/research-live-network.md` item 4): mainnet D 8 vs 6, heartbeat 0.7 s vs 1 s,
  thresholds −4000/−8000/−16000 vs −5/−10; P1–P4 only (no P5–P7); uniform 5–50 ms latency; no
  signatures; IWANT at heartbeat granularity; eclipse invisible to scoring.
- Reels (`web/public/reels/manifest.json` via `REEL_MANIFEST` in `web/lib/reels.ts`): sybil-eclipse,
  partition-heal, healthy-publish, mainnet-block-wave (138 observer nodes, slots 15466393–15466400).
- Copy constants in `web/lib/copy.ts` (MECHANISM, ARRIVAL, PROVENANCE, ECLIPSE_WHY, REPO_URL, EVENT_LINE).
  The copy test forbids 'identical run', 'mesh path', "beacon node's scoring" outside negations.
- Quick start (README): `git clone https://github.com/yashksaini-coder/luminar && cd luminar`,
  `make install`, `make dev` → http://localhost:3000. Docker: `docker compose up --build` → :8080.
  Offline: any `/reels/<name>/` plays with no backend.
- Stack: Python 3.12 · trio · FastAPI · orjson WebSocket at 20 Hz · Next.js 16 static export · React 19 ·
  zustand · deck.gl 9 (Canvas 2D fallback) · Remotion. Metric names: `web/remotion/constants.ts` SERIES
  (or Sections.tsx list).

## Section specs

**Hero (upgrade, `Hero.tsx`).** Keep the headline and Fig. 1 plate. Add above the headline a row of
spec chips (mono, hairline border): `GossipSub v1.1` · `P1–P4 scoring` · `20–200 peers` · `OpenTelemetry`.
Under the CTAs, a one-line terminal chip `$ make dev` with a copy button (copies
`git clone … && cd luminar && make install && make dev`), success state "copied" for 1.5 s, focus ring.

**Features bento (`Features.tsx`, ★).** 6 cards in a 3×2 grid at ≥1024 (two wide + four normal is fine),
2 columns at 640–1023, 1 column below. Each card: mono kicker, serif title, one or two sentences,
and a small live visual drawn with SVG or CSS (no screenshots, no dither, no WebGL). Stories per
design-to-motion B4 (run while on screen, pause off screen, reduced motion = still frame):
1. *Peer scoring that bites*: a score bar falling from 0 past the −5 GRAFT and −10 PRUNE ticks in two
   heartbeat steps, then a "pruned" stamp; resets every ~5 s.
2. *Attacks you inject live*: a 7-node mini mesh; a flame diamond grafts in, its links go dashed flame,
   then snap away.
3. *Reproducible recordings*: a scrubber with beat ticks at the real reel times (10.2, 11.9, 16.2, 24.1 of
   39.7 s) and a playhead sweeping; tick labels appear as the head passes.
4. *Live mainnet arrivals*: a strip of observer dots lighting in arrival order with ms labels, honest copy
   (ARRIVAL), "recorded slot 15466393" when shown on the static landing.
5. *Same metric names*: a code card listing 4 gossipsub_* names with a typed cursor (a counter ticking on
   one of them).
6. *Built for the stage*: a mini hero ticker (`delivery 100% · hops 4.2 · 100 ms`) with the values counting.
Links: card 1 and 2 → `/sim/`, card 3 → reel, card 4 → mainnet reel. Whole card is not a link; a
"›" text link inside is, 44 px target.

**How it works (`HowItWorks.tsx`, ★).** Three steps in a horizontal pipeline at ≥1024 (vertical below):
① Simulate (Python trio engine: GossipSub mesh, heartbeat, P1–P4) → ② Stream (one WebSocket, orjson frames
at 20 Hz; record to JSONL) → ③ Render (Next.js + deck.gl, Canvas 2D fallback; reels replay the same frames
offline). Connectors are SVG lines with pulses travelling left to right (design-to-motion "flow" story);
each step card shows its tech as mono chips.

**Attack explorer (`AttackExplorer.tsx`, ★).** Accessible tabs (role=tablist, arrow keys, aria-selected):
Sybil · Eclipse · Partition · Healthy. Each panel: what the attack does (2 sentences, honest: eclipse is
invisible to scoring, ECLIPSE_WHY), what you see on the map (bullets), the outcome numbers from
reel-stats (Sybil: pruned at T+11.9 s, 2 heartbeats; Eclipse: score floor −0.25, peer-10; Partition:
delivery halves, heals after clear; Healthy: delivery 100 %, 4.2 hops, 100 ms), a small static SVG diagram
of the topology state, and two actions: "Play the recording ›" (reel href via `reelHref`) and "Try it live
›" (`/sim/`). Panel switch animates opacity + 8 px rise with `--e2`.

**Observability (`Observability.tsx`, ★, replaces Same names).** Two browser-window frames (title bar
with three hairline dots and a mono title: "Grafana · luminar" and "Jaeger · gossipsub.publish")
holding the CLEAN screenshots `web/public/stills/grafana.png` and `jaeger.png` (`<img>` with width/height,
`loading="lazy"`, alt text) — NO dither. Beside or below them: a code card "`curl localhost:8000/metrics`"
showing the seven gossipsub_* names with a copy button, plus `make otel-up` and the honest line that the
names match Lighthouse's, not the numbers (SAME_NAMES).

**Live mainnet card (`MainnetCard.tsx`, ★, replaces LiveMainnet prose).** A wide card: left, the honest
explanation (ARRIVAL, PROVENANCE), the slot range and 138 observers, data source ethPandaOps (CC BY 4.0);
right, a small world outline (reuse `web/public/geo/land-110m.json` drawn as a simple SVG equirectangular
path, or a static dot map) with observer dots lighting in sequence. Link "Watch the recorded block wave ›".
Keep the existing observer glyph pulse idea; no LIVE claim on the static page.

**Faithfulness table (`Faithfulness.tsx`, ★).** Section title uses MECHANISM. A real `<table>` with caption:
rows D, heartbeat, prune/graft thresholds, score terms, latency, signatures, IWANT timing, eclipse
visibility; columns Luminar · Ethereum mainnet (Lighthouse defaults). Mono numbers, tabular-nums,
horizontal scroll inside the card on phones (never the page).

**Quick start (`QuickStart.tsx`, ★).** Tabs: Local · Docker · Offline. Each a terminal card (pitch-1
surface, hairline border, mono, prompt `$`), 2–4 lines, copy button per block with copied state, a note of
what opens where (:3000, :8080, `/reels/<name>/` offline).

## Shared rules

- Reuse the reveal system: `data-reveal` on the section, `data-k="up|pop|card"` + `style={{'--i': n}}` on
  children (wrappers, never on .btn/.chev). Card grids rise as `card`, staggered 80–90 ms.
- Live visuals: one small client component per visual, `IntersectionObserver` pause off screen,
  `prefers-reduced-motion` → final still state, transform/opacity only, no layout animation.
- Tokens only (`--s-*`, `--t-*`, colours above); radii `--r-0` (square, the system's look); hairline cards
  (`1px solid var(--hair)` all round, never one side), `--panel`/`--raised` surfaces, no gradients except none.
- Type: section kicker mono uppercase (`--t-label`, `--track-label`, `--fg-3`), section title display serif
  (`--t-h1` capped), body `--t-body`/`--t-lead`. No hyphens in new body copy. `text-wrap: balance` on titles.
- Accessibility: semantic sections with headings, tabs per WAI-ARIA, copy buttons with aria-live status,
  44 px targets on touch, visible focus, contrast AA (no `--paper-3` text, `--fg-3` only for labels ≥ 12 px).
- Responsive: 390, 768, 1024, 1440, 1920 with no horizontal page scroll; grids collapse as specified.
- Tests: one vitest per new component (renders headings, key numbers from reel-stats, tabs switch with
  arrow keys, copy button writes the clipboard mock), and the existing landing/page tests updated.
- No new dependencies. No changes under `web/components/sim`, `web/components/map`, `web/remotion`.

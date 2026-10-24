# Design direction verdict — feat/ui-overhaul

Judged 2026-10-24 against `docs/design/ui-inventory.md` (verified at `eb26490`) and the
backboard-style reference plate (dark rgb(11,11,13), off-white rgb(242,242,239), orange
rgb(255,90,44), 1-bit dither, halftone mask, rotated stamp, italic "Fig. N" caption).

Each direction's `mockup.html` was opened in Chrome at 1440×900 and 390×844 (viewport
emulation; both screens scrolled to), and every PNG in the direction folder was viewed.
Contrast claims were re-computed from the hex values with WCAG 2.x relative luminance.
No mockup overflows horizontally at 390 (`scrollWidth == 390` for all three).

## Scores (1–10)

| Criterion | editorial-dither | instrument-panel | poster-minimal |
|---|---|---|---|
| Fidelity to the backboard dither aesthetic | 8 | 7 | **9** |
| Legibility of a 50–500 node mesh with attackers (core job, ×2) | 4 | **9** | 6 |
| Colour-theory rigour (table present and correct) | **9** | 7 | 7 |
| Distinctiveness | 7 | 7 | **9** |
| Stage / hero at 10 m | 6 | **8** | **8** |
| Mobile viability | 6 | **8** | **8** |
| Buildability in Next.js in ~7 days | 6 | **8** | 7 |
| **Weighted total** (legibility counted twice) | 50 | **63** | 60 |

### Notes behind the numbers

**editorial-dither.** The landing is a faithful journal plate (serif h1, Fig. 1, orange
shard, halftone block, stamp) and ships a real light variant. The simulator is the weak
screen: honest peers are dithered blobs on dithered dotted edges and at 50 nodes the centre
already reads as static; the rationale itself names this failure. Eight "Fig. N" captions in
one view dilute the device. Serif KPI numerals in a 272px rail are lovely on a laptop and
invisible at 10 m. The toolbar scrolls horizontally at 390 (Scenarios cut at the edge).
Tokens are the most rigorous of the three: `@supports` OKLCH overrides (correctly noting that
double-declaring a custom property does not give a fallback), a light-mode plate override,
stage scale tokens instead of CSS zoom, "never text" roles, both themes tabulated.

**instrument-panel.** Only direction where the mesh is unambiguous: solid paper discs with
hairline edges, Bayer halos for score, flame diamonds with hatch for attackers, dashed hollow
diamonds for pruned, cyan rings for decoded/observer, reticle for selection. It also covers
more of the inventory than the others: one-cell-per-node state strip (scales to 500), mesh
peers vs topology peers in the inspector (pain point 8), "12 dropped (gap)" (14), beats
"click → seek" (7), a "WHY" line for silent eclipse attackers, Fig. 2 caption on the canvas,
56px lower-third ticker and `--t-hero-n` for stage. Mobile wraps the toolbar to three rows
and stacks rails as drawers; works. Weaknesses: mono h1 reads "terminal", not editorial;
boxed panels drift toward a generic dashboard; four hues (flame, cyan, violet, amber) erode
the 1-bit purity; `--pitch-0: #hex; --pitch-0: oklch()` is not a fallback (last value wins).

**poster-minimal.** The most striking landing: Instrument Serif poster line, plate bleeding
off the corner, hollow rings, shard, stamp, Fig. 1 bottom-left, one mono CTA. Mobile hero is
excellent. The simulator is cleaner than editorial-dither (bigger discs, more air) but honest
peers still render as dithered snowflakes and the lattice of dotted edges competes with them;
at 200+ nodes this is mush. Rails are hidden until hover or `.` — the rationale admits a
presenter may not find stats in ten seconds, which is disqualifying for a stage tool. Uses
the brief's exact three colours. Same double-declaration tokens bug as instrument-panel;
`pitch-0` is hue 286 while `pitch-1..3` are hue 70 (inconsistent ramp).

### Contrast spot-checks (computed, not estimated)

| Pair | Claimed | Computed |
|---|---|---|
| ED ink-2 `#95928b` on paper-1 `#110f0c` | 6.2 | 6.16 |
| ED flame `#ff5c28` on paper-0 `#0a0806` | 6.5 | 6.49 |
| ED flame-text light `#c83500` on `#fbfaf7` | 5.1 | 5.07 |
| IP paper-2 `#93928d` on pitch-0 `#08080b` | 6.4 | 6.42 |
| IP flame `#fe5828` on pitch-0 | 6.3 | 6.33 |
| IP signal `#4ddcdc` on pitch-0 | 12.0 | 11.99 |
| PM paper-3 `#7f7b77` on pitch-0 `#0b0b0d` | 4.7 | 4.68 |
| PM flame-ink `#cb3a00` on paper-0 `#f2f2ef` | 4.5 | 4.52 |
| Brief: `#ff5a2c` on `#0b0b0d` | — | 6.32 |
| Brief: `#f2f2ef` on `#0b0b0d` | — | 17.53 |

All three tables are honest. The rigour score separates them on *method* (ED's `@supports`
pattern and plate override) rather than on arithmetic.

## Winner: `instrument-panel`

The simulator is the product; the landing is a door. instrument-panel is the only direction
whose canvas still reads at 500 nodes and at 10 m, and it maps 1:1 onto the panels the
inventory says must survive, which is what makes seven days plausible. It loses on the
landing and on chrome weight, and both are fixable by grafting rather than by rebuilding.

## Grafts (apply on top of instrument-panel)

From **poster-minimal**:

1. **Landing hero = the poster.** Instrument Serif `--t-poster` (56→208px) two-line headline
   with the second line italic, the dithered plate bleeding off the top-right behind the
   type, hollow dithered rings and the orange shard as parallax layers, `Fig. 1` caption
   bottom-left, single mono CTA bottom-right. Replaces the mono h1 and the bordered KPI strip.
2. **One serif: Instrument Serif** (`--font-display`) for h1, Fig. captions, the narrator
   sentence and the inspector peer name (`n7` italic). Drop EB Garamond. Keep IBM Plex Mono
   for everything that counts and Manrope for nav/buttons/stamps.
3. **Typographic rails, no boxes.** Keep IP's content (node strip, dithered sparklines, beats,
   WHY line) but remove every panel border; separate sections with `--hair` rules only.
4. **Floating command strip** (`--strip-h` 52px: reset, play, scrubber, time, speed,
   Scenarios · Reels · Fault menus) instead of a second toolbar row; rails stay permanent on
   desktop (reject PM's hover-hidden rails) and become drawers at ≤1023px.
5. **Brief-exact base colours**: pitch-0 `#0b0b0d`, paper-0 `#f2f2ef`, flame `#ff5a2c`.
6. **`--hatch`** token (45° repeating gradient) for the attacker diamond fill; IP described it
   but had no token. **Origin = paper disc with pitch centre dot** (drops violet).

From **editorial-dither**:

7. **`@supports (color: oklch())` override pattern**: hex base, OKLCH inside `@supports`.
   Fixes the double-declaration bug in both runners-up.
8. **Light mode keeps the plate dark**: `:root[data-theme="light"] .plate { … ; color: … }`
   override block, plus `--flame-text` / `--on-flame` / `--signal-text` indirections so
   orange and cyan text are automatically re-pointed to their `-dim` steps on paper.
9. **Stage scale tokens** `:root[data-stage="1"]` (type, row height, cell sizes, fg-3→fg-2,
   hair→hair-strong, brighter links) — replaces the current `#app { zoom: 1.3 }`.
10. **Score bands as four densities** `--band-0..3` (0.12 / 0.35 / 0.65 / 1.0) for the Bayer
    halo instead of a continuous `score/10`; bands read at distance, a continuum does not.
11. **CSS dither patterns** `--dither-25`, `--dither-50`, `--dither-flame` (inline SVG) for
    bars, wash bands and meters without a canvas; `--dither-reveal-steps` 28→3 and
    `--dither-contrast`.
12. **Stamp tokens** `--stamp-tilt: 3deg` and `--stamp-shadow` as the one permitted shadow;
    `--loupe`, `--parallax-travel`.
13. **Rule, not token**: attackers and message particles are never dithered — hard shapes on
    a dithered field is how the eye separates signal from mesh without a legend.

Deliberately **not** grafted: ED's Fig. caption on every panel (two figure slots only: plate
and canvas), ED's serif KPI numerals, PM's hidden rails, IP's amber and violet hues.

## Final palette (two hues on a 1-bit field)

Full file with every token and the complete contrast table: `docs/design/tokens.css`.

| Role | Dark | Light | Job |
|---|---|---|---|
| `--pitch-0` | `#0b0b0d` oklch(15.1% .004 286) | canvas stays pitch | page, canvas, plate |
| `--pitch-1/2/3/4` | `#101013` `#19191c` `#262629` `#37383b` | — | rail, menu, hover, idle node |
| `--paper-0` | `#f2f2ef` oklch(96% .004 106) | `--fg #161514` | text, numbers, honest peers |
| `--paper-1` | `#bebeba` (10.6:1) | `--fg-2 #44423e` (8.9:1) | secondary, mesh links |
| `--paper-2` | `#93928d` (6.3:1 AA) | `--fg-3 #6c6864` (4.9:1 AA) | labels, captions, log ts |
| `--paper-3` | `#696964` (3.6:1) | `#a29e98` | hairlines, disabled — never text |
| `--flame` | `#ff5a2c` oklch(68.3% .209 36) (6.3:1) | graphic only (2.8:1) | attacker, fault, alarm |
| `--flame-dim` | `#a73a1b` outlines | text on paper (5.7:1) | pruned outline / light-mode text |
| `--signal` | `#4ddcdc` oklch(82% .12 195) (11.8:1) | rings only | live, observer, decoded, healed |
| `--signal-dim` | `#2b9191` (5.2:1) | text/rings (3.4:1) | muted signal |

Every node role carries a shape (disc, dotted disc, ring, double ring, hollow disc, X, diamond,
dashed diamond, reticle) so the canvas survives greyscale and deuteranopia. The light-mode
`fg-3` was lifted from instrument-panel's `#76736c` (4.22:1, fails AA small text on paper) to
poster-minimal's `#6c6864` (4.92:1).

## Build order implied by the verdict

1. Tokens + fonts + `.plate` / `[data-theme]` / `[data-stage]` plumbing (day 1).
2. Simulator shell from instrument-panel: canvas, rails, command strip, drawers (days 2–4).
3. Node/link rendering with the shape table and banded halos; attackers un-dithered (day 4–5).
4. Landing poster from poster-minimal with the parallax plate (day 6).
5. Stage/hero: ticker, hero numbers, narrator in the Fig. slot (day 7).

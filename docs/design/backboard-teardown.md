# backboard.io — visual-system teardown

Date: 2026-10-24. Source: `https://backboard.io/` (home page only), fetched HTML + the 13
Framer ES modules it preloads, plus computed styles read in headless Chrome at 1440×900 and
390×844 (DPR 2). Screenshots and the downloaded sources live in
`/tmp/claude-1000/-home-yks-Projects-luminar/344950f1-b57c-4874-90b3-764debeb2b83/scratchpad/overhaul/backboard/`
(`full-1440.png`, `full-390.png`, `menu-open-1440.png`, `src/*.mjs`, `src/index.html`).

The site is a Framer export, but every interesting piece is a hand-written React "code
component" whose un-obfuscated source ships to the browser: `HeroPlate.*.mjs` (the dither
plate), `ActionButton.*.mjs`, `ChevLink.*.mjs`, and `SiteNav` + `SiteFooter` inside
`shared-lib.*.mjs`. Everything below marked **(src)** is read from that code, not guessed.

**The one correction to the brief:** the page is *light*, not dark. `html body { background:
#ffffff }`, ink `#161514` on white. Only the hero *plate* (the figure) is `#0b0b0d`. The
"dark near-black + off-white + orange" trio is the plate's palette, set as a dark object on a
paper-white page. That contrast (one dark slab in a white editorial column) is most of the
effect.

---

## 1. Palette (every colour seen, with role)

Component defaults **(src)** give the names; they call them *pitch / paper / ink / ink2 /
ink3 / flame / hair*.

| Token | Value | Role |
|---|---|---|
| `page` | `#ffffff` | page + nav + menu overlay + footer background |
| `pitch` | `#0b0b0d` `rgb(11,11,13)` | hero plate background; stamp text colour |
| `paper` | `#f2f2ef` `rgb(242,242,239)` | dither "ink" (the lit cells), stamp background, halftone dot fill |
| `ink` | `#161514` `rgb(22,21,20)` | h1/h2/body text, primary button bg, skip-link bg, pull-quote rule, "Fig. 1" label |
| `ink-hover` | `#2b2a28` | primary button hover bg |
| `ink2` | `#44423e` `rgb(68,66,62)` | lead paragraph, footer links, footer location line |
| `ink3` | `#76736c` `rgb(118,115,108)` | captions, eyebrow labels (Research/Products/Trust), menu descriptions, footer headings, chevron glyph |
| `flame` | `#ff5a2c` `rgb(255,90,44)` | **one** element on the whole page: the orange shard in the plate |
| `hair` | `rgba(22,21,20,0.14)` | every divider: footer top rule, menu list rules, plain-button inset border |
| `hair-wash` | `rgba(22,21,20,0.04)` | plain-button hover bg |
| `stamp-shadow` | `rgba(0,0,0,0.25)` | `box-shadow: 0 1px 0` under the stamp |
| `arrow-dim` | `rgba(255,255,255,0.7)` | arrow glyph inside the dark Sign-in button, goes `#fff` on hover |
| `logo` | `#17171c` | wordmark SVG fill |
| `link-default` | `rgb(0,0,238)` | browser default — only in the visually-hidden a11y nav; never visible |

Not a palette, but present: `body{}` carries ~120 Framer `--token-*` variables (`#36bffa`,
`#04060e`, `#edf1ff`, Tailwind-ish slate/blue/green…). They are leftovers from an earlier
template; **none is referenced by any rendered element on the home page**. Ignore them.

Colour theory in one line: a 4-step warm-grey ramp (`#161514 → #44423e → #76736c → hair`)
on warm white, with the plate as a hard-contrast dark object and a single hot accent that
appears exactly once. The accent reads as loud because nothing else competes.

---

## 2. Type system

Three families, all loaded via Google Fonts / Fontshare **(src)**:

- **EB Garamond** 400/500/600/700 + italics (Google) — display + prose.
  OpenType features on prose presets: `'blwf','cv03','cv04','cv09','cv11'`.
- **Manrope** 400/500/600/700 (Fontshare via Framer) — UI: buttons, links, labels, nav, footer, stamp.
- **Fragment Mono** 400 (Google) — loaded on the page but unused on home; code on other pages. (unverified use)
- `Inter` is also declared (Framer default) but no visible element resolves to it.

Measured styles (desktop ≥1200 / 810–1199 / ≤809):

| Role | Family | Size | Weight | Line-height | Tracking | Colour |
|---|---|---|---|---|---|---|
| h1 (display) | EB Garamond | **80 / 52 / 42px** | 400 | 1em / 1em / 1.08em | -.025em / -.025em / -.02em | ink |
| Section heading (`p` preset) | EB Garamond | 40 / 40 / 30px | 400 | 1.15em | -.02em / -.02em / -.01em | ink |
| Sub-heading h3 | Manrope | 21px | 500 | 1.35 (28.35px) | -.02em | ink |
| Lead paragraph | EB Garamond | 21px | 400 | 1.45 | 0 | ink2 |
| Body paragraph | EB Garamond | 20px | 400 | 1.58 | 0 | ink |
| Pull quote | EB Garamond *italic* | 24px | 400 | 1.4 | 0 | ink |
| UI link / button | Manrope | 14.5px | 500 | 1 (button) / 1.2 (link) | -.01em | ink / #fff |
| Eyebrow label (Research, Trust…) | Manrope | 13–14px | 400 | normal | 0 / -.01em | ink3 |
| Menu item name | EB Garamond | `clamp(26px, 3vw, 38px)` (24px ≤860) | 400 | 1.1 | -.02em | ink; **italic on hover** |
| Menu item line | Manrope | 14.5px (13px ≤860) | 400 | 1.5 | 0 | ink3 |
| Figure caption | EB Garamond *italic* | 15px | 400 | 1.4 | 0 | ink3 |
| "Fig. 1" label | Manrope | 12px | 600 | — | .04em | ink |
| Stamp | Manrope, uppercase | `clamp(11px, 1.1vw, 15px)` | 600 | — | **.1em** | pitch on paper |
| Footer links/headings | Manrope | 14px | 400 | 1.58 | -.01em | ink2 / ink3 |
| Footer location | EB Garamond *italic* | 17px | 400 | — | 0 | ink2 |
| Skip link | Manrope | 14px | 500 | — | — | #fff on ink |

Only two `clamp()`s on the whole page (stamp font and footer column gap). Everything else
steps at the three Framer breakpoints. Headings never go bold: hierarchy comes from size
and serif-vs-sans, not weight. Serif = thinking, sans = doing (every clickable thing is
Manrope).

---

## 3. Spacing, rhythm, widths

- **Content column: 620px** (`max-width: 662px` wrapper with `padding: 80px 21px 0`;
  `42px 21px 0` on mobile). Centered. On 390 the column is 348px (21px gutters).
- **Nav: 56px** fixed. Content wrapper has `padding-top: 56px` to clear it.
- **Footer: max-width 1000px**, `margin-top: 128px`, `padding-top: 2.4rem`, `padding-bottom: 1.75rem`.
- **Menu overlay inner: `min(1080px, 100% - 42px)`**, grid `1.25fr 1fr`, gap `1.6rem 4rem`.
- Framer breakpoints: `≥1200`, `810–1199`, `≤809`. Component-level: nav compacts at
  `≤640`, menu goes single-column at `≤860`, plate goes 4:3 when *its own width* `<450`
  (ResizeObserver, not a media query).

Measured vertical rhythm at 1440 (top-of-box px, from `getBoundingClientRect`):

```
 56  nav bottom
136  h1 (80px top padding)
318  lead p           (22px after h1)
407  buttons row      (28px after p)   button 42px tall
449  figure wrapper   padding-top 48px
497  plate 620×248    (16/6.4)          caption +0.6rem below, right-aligned
848  section heading  (72px after figure)
916  body p           (22px)
1001 body p           (22px)
1117 chevron link     (21px)
1189 h3               (55px)
1259 pull quote       (42px)  border-left 1px ink, padding-left 19px
1368 body p           (42px)
1454 arrow link       (23px)
1519 section heading  (48px)
1607 body p           (42px)
1702 arrow link       (32px)
1848 footer           (128px)
```

Rule of thumb they use: **22px** between consecutive paragraphs, **42–48px** between a
heading and its block, **72px** between sections, **128px** before the footer. No cards,
no boxes, no border-radius anywhere (`0` on buttons, plate, stamp). The only "container"
is the plate.

---

## 4. Page structure, section by section

1. **Nav** (56px, white, fixed): wordmark SVG left (height 17, 15 on mobile), `Menu +`
   right. Nothing else. A visually-hidden `<nav>` lists all links for crawlers/AT.
2. **Hero**: h1 (2 lines, 80px) → lead paragraph (ink2) → row [`Request an evaluation`
   primary button, `Read the Manifesto ›` chevron link, gap 22px] → **Fig. 1 plate** with
   caption right-aligned under it.
3. **Section "Our research…"**: 40px serif heading, two body paragraphs, `Explore our research ›`.
4. **Sub-section "What we've measured."**: 21px Manrope h3, italic pull quote with 1px left
   rule, paragraph, `See the engine →`.
5. **Section "Bring us your workload."**: heading, paragraph, `Request an evaluation →`.
6. **Footer**: 1px hair rule, 4-col grid `1.4fr 1fr 1fr 1fr` (wordmark + italic location /
   Trust / Company / Connect), copyright line 3rem below. Mobile: 2 columns, brand spans
   both, row-gap 2rem.

That's the whole page: ~2160px tall at 1440. One image. No cards, no icons except arrows,
no gradients, no blur, no shadows except the 1px under the stamp.

---

## 5. Components (CSS as rendered)

### Nav + Menu button **(src)**
```css
/* wrapper */ [data-sitenav-root]{width:100%;height:56px;pointer-events:none}
header{position:absolute;inset:0 0 auto;z-index:10;height:56px;display:flex;
  align-items:center;justify-content:space-between;gap:1.6rem;padding:0 1.5rem;
  background:#fff;pointer-events:auto}          /* ≤640: gap 1rem; padding 0 1rem */
button{display:inline-flex;align-items:center;gap:.5rem;min-height:36px;padding:0;border:0;
  background:none;color:#161514;font:500 14.5px Manrope;letter-spacing:-.01em;cursor:pointer}
/* plus icon: 11×11 box, two 1.4px bars of currentColor; rotates 45deg → × when open */
.icon{transition:transform .35s cubic-bezier(.16,1,.3,1)}
```

### Menu overlay **(src)**
```css
[role=dialog]{position:fixed;inset:56px 0 0;z-index:2147483000;overflow-y:auto;
  background:#fff;animation:bmIn .4s cubic-bezier(.16,1,.3,1)}
.inner{width:min(1080px,calc(100% - 42px));margin:0 auto;
  padding:clamp(1.2rem,4vh,3rem) 0 1.6rem;display:grid;
  grid-template-columns:1.25fr 1fr;gap:1.6rem 4rem;align-items:start}
h2[data-label]{margin:0 0 .5rem;font:400 13px Manrope;color:#76736c}
ul{list-style:none;margin:0;padding:0;border-top:1px solid rgba(22,21,20,.14)}
li{border-bottom:1px solid rgba(22,21,20,.14);
   animation:mmIn .55s cubic-bezier(.16,1,.3,1) both;animation-delay:calc(var(--i)*40ms)}
li a{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:1rem;
   padding:.8rem 0;text-decoration:none}
.name{font:400 clamp(26px,3vw,38px)/1.1 "EB Garamond";letter-spacing:-.02em;color:#161514}
li a:hover .name{font-style:italic}
.line{margin-top:.25rem;font:400 14.5px/1.5 Manrope;color:#76736c}
.arrow{color:#76736c;transition:transform .25s cubic-bezier(.16,1,.3,1),color .2s ease}
li a:hover .arrow{color:#161514;transform:translateX(3px)}   /* external: translate(3px,-3px) */
@keyframes bmIn{from{opacity:0}to{opacity:1}}
@keyframes mmIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
@media(prefers-reduced-motion:reduce){[data-bm-anim]{animation:none!important}}
```
Behaviour: `body{overflow:hidden}` while open, Escape closes and refocuses the button,
Tab is trapped, click outside closes, first link gets focus on open. ≤860: one column,
names 24px, lines 13px, row padding .55rem.

### Buttons **(src: ActionButton)**
```css
.btn{position:relative;display:inline-flex;align-items:center;min-height:42px;padding:0 20px;
  width:max-content;font:500 14.5px/1 Manrope;text-decoration:none;white-space:nowrap;
  transition:background-color .2s ease,color .2s ease,transform .15s cubic-bezier(.16,1,.3,1)}
.btn-primary{background:#161514;color:#fff}         .btn-primary:hover{background:#2b2a28}
.btn-plain{background:transparent;color:#161514;box-shadow:inset 0 0 0 1px rgba(22,21,20,.14)}
.btn-plain:hover{background:rgba(22,21,20,.04)}
.btn:active{transform:scale(.97)}
```
Square corners. Anchor-links smooth-scroll (`auto` under reduced motion) and
`history.replaceState` the hash.

### Chevron link **(src: ChevLink)**
```css
.chev{display:inline-flex;align-items:center;gap:.3rem;min-height:42px;padding:0 12px;
  font:500 14.5px/1.2 Manrope;color:#161514;text-decoration:none}
.chev .glyph{color:#76736c;transition:transform .2s cubic-bezier(.16,1,.3,1)}  /* "›" */
.chev:hover .glyph{transform:translateX(3px)}
```
The `See the engine →` variants are plain Framer text (Manrope 14.5/500, `→` as a second
text node, gap 6px) — no hover motion observed in the markup.

### Figure caption **(src: HeroPlate)**
```css
figcaption{margin-top:.6rem;font:italic 15px/1.4 "EB Garamond",Georgia,serif;color:#76736c;
  text-align:right}                                   /* left when plate is narrow */
figcaption .fig{font:600 12px Manrope;font-style:normal;letter-spacing:.04em;color:#161514;
  margin-right:.5em}
```

### Stamp **(src)**
```css
.stamp{position:absolute;left:56%;top:24%;pointer-events:none}          /* data-depth=1.2 */
.stamp>span{display:block;padding:.55em 1.1em;background:#f2f2ef;color:#0b0b0d;
  font:600 clamp(11px,1.1vw,15px) Manrope;letter-spacing:.1em;text-transform:uppercase;
  transform:rotate(3deg);box-shadow:0 1px 0 rgba(0,0,0,.25)}
```

### Pull quote (Framer layer)
```css
.quote{border-left:1px solid #161514;padding:0 0 0 19px;
  font:italic 24px/1.4 "EB Garamond";color:#161514}
```

### Footer **(src: SiteFooter)**
```css
footer{margin-top:128px;padding-bottom:1.75rem;background:#fff;
  font:400 14px/1.58 Manrope;letter-spacing:-.01em;color:#76736c}
footer .grid{max-width:1000px;margin:0 auto;display:grid;grid-template-columns:1.4fr 1fr 1fr 1fr;
  column-gap:clamp(1rem,2.5vw,2rem);padding-top:2.4rem;border-top:1px solid rgba(22,21,20,.14)}
footer .location{margin:.9rem 0 0;font:italic 17px "EB Garamond";color:#44423e}
.ft a{color:#44423e;text-decoration:none;text-underline-offset:3px;transition:color .2s ease}
.ft a:hover{color:#161514}   .ft li a{display:inline-block;min-height:24px;padding:1px 0}
footer .copy{margin-top:3rem}
/* ≤~640: grid-template-columns:1fr 1fr; row-gap:2rem; brand cell grid-column:1/-1 */
```

---

## 6. The hero plate — how the pasted DOM works **(src: HeroPlate.C0uIKHyK.mjs)**

The element you pasted is the plate's inner `<div>`, rendered by one React component with
these defaults: `srcUrl: gameplan-research.jpg` (a 1400×875 B&W photo: marble bust +
radio dish on starfield), `posX:.5 posY:.22`, `contrast:1.5`, `level:.02`,
`positive:true`, `finalCell:3`, `aspect:'16 / 6.4'`, `narrowAspect:'4 / 3'`, `narrowAt:450`,
`loupe:true`, `tagLeft:56 tagTop:24`, `shardLeft:3 shardTop:58 shardWidth:6 shardHeight:26`,
`dotsLeft:44 dotsTop:8`, `pitch:#0b0b0d paper:#f2f2ef ink:#161514 ink3:#76736c flame:#ff5a2c`.

### Layer stack (bottom → top), all `position:absolute; pointer-events:none`
| # | Element | `data-depth` | What it is |
|---|---|---|---|
| 0 | plate `div` | — | `aspect-ratio:16/6.4; background:pitch; overflow:hidden; cursor:crosshair` (crosshair only set when `(hover:hover) and (pointer:fine)`) |
| 1 | shard `span` | `0.2` | solid `flame`, `left:3% top:58% width:6% height:26%`, `clip-path:polygon(38% 0,100% 22%,74% 100%,0 62%)` — an irregular quad. Option `shardOver` moves it above the canvas with `mix-blend-mode:multiply` and depth `1` |
| 2 | dots `span` | `0.35` | `paper` at `opacity:.55`, `44% 8% 6%×22%`, `clip-path:polygon(0 8%,100% 0,88% 100%,6% 90%)`, **`mask: url(svg 8×8 circle r=3.1) 0 0 / 8px 8px`** — the mask tiles an 8px SVG with a 6.2px dot, so the slab becomes a halftone dot grid. Pure CSS, no canvas |
| 3 | canvas wrapper `div` | `0.6` | `inset:-14% 0` — **overscan** so the parallax shift never exposes the plate background at top/bottom |
| 3a | `canvas` | — | `inset:0; width/height:100%; image-rendering:pixelated` (the backing store is 620×317 at DPR 1 = wrapper box incl. the 14% overscan; capped at DPR 2) |
| 4 | stamp `span` | `1.2` | wrapper at `left:56% top:24%`; inner rotated 3° paper label (CSS in §5) |

### Parallax
One scroll/resize listener, throttled with `requestAnimationFrame`, skipped entirely under
`prefers-reduced-motion`:
```js
progress = clamp((innerHeight - rect.top) / (innerHeight + rect.height), 0, 1)  // 0 enters bottom … 1 leaves top
el.style.transform = `translate3d(0, ${((progress - .5) * -170 * depth).toFixed(1)}px, 0)`
```
So each layer travels `±85px × depth` across its on-screen life: shard ±17, dots ±30,
canvas ±51, stamp ±102. Opposite sign to scroll → layers with bigger depth feel nearer.
Early-outs when the plate is >100px off-screen. Your pasted values (2.1 / 3.7 / 6.3 /
12.7px) are exactly `progress ≈ 0.438` × the depths 0.2/0.35/0.6/1.2.

### The dither (ordered / Bayer, not error diffusion)
```js
BAYER8 = [0,32,8,40,2,34,10,42, 48,16,56,24,50,18,58,26, 12,44,4,36,14,46,6,38,
          60,28,52,20,62,30,54,22, 3,35,11,43,1,33,9,41, 51,19,59,27,49,17,57,25,
          15,47,7,39,13,45,5,37, 63,31,55,23,61,29,53,21].map(v => (v + .5) / 64)
```
That is the canonical **8×8 Bayer matrix**, thresholds `(v+0.5)/64`. Per cell:
1. Cover-fit the source into a tiny offscreen canvas of `ceil(W/cell) × ceil(H/cell)` using
   focus point `(posX,posY)` (`object-fit:cover` math by hand), `getImageData`.
2. `luma = (.299R + .587G + .114B)/255` (Rec.601), then `luma = clamp((luma-.5)*contrast + .5 + level)`
   with contrast 1.5 and level .02 (pushes mids apart, lifts slightly).
3. `lit = positive ? luma >= BAYER8[(y&7)*8 + (x&7)] : luma < threshold`.
4. If lit, `fillRect(x*cell, y*cell, cell, cell)` in `paper` on the already-`pitch` plate.
   Only one colour is ever drawn; the background shows through for dark cells → true 1-bit.
5. Cell size on the final pass = **3 CSS px** (so at 620px wide, ~207×106 cells).

**Progressive reveal:** when the plate is ≥30% in view (`IntersectionObserver`), it renders
the sequence `[28, 20, 14, 10, 7, 5, 4, 3]` px cells, one every **150ms** — a chunky
mosaic resolving into fine dither over ~1.05s. Skipped (jumps straight to 3) under
reduced-motion or inside the Framer canvas. Re-renders at the current cell on resize
(120ms debounce).

**Loupe (pointer response):** on fine-pointer devices only. `pointermove` on `document`;
when the cursor is inside the plate: restore the saved final-pass `ImageData`, clip a
**132×132px** square centred on the cursor, draw the *un-dithered* source through
`ctx.filter = 'grayscale(1) contrast(1.15)'`, then stroke a 1px `paper` border. Leaving the
plate (or window blur) restores the snapshot. That's the "magnifier shows the real photo"
trick visible in the reference screenshot. DPR capped at 2 for the backing store.

Nothing in the plate responds to the pointer *except* the loupe; the parallax is
scroll-only.

---

## 7. Motion summary

| Thing | Duration | Easing |
|---|---|---|
| Button bg / colour | 200ms | `ease` |
| Button press | 150ms | `cubic-bezier(.16,1,.3,1)` → `scale(.97)` |
| Chevron nudge | 200ms | same curve, `translateX(3px)` |
| Menu arrow nudge | 250ms | same curve |
| Menu `+`→`×` | 350ms | same curve, `rotate(45deg)` |
| Overlay fade (`bmIn`) | 400ms | same curve |
| Menu rows (`mmIn`) | 550ms, stagger 40ms/row | same curve, 10px rise |
| Footer link colour | 200ms | `ease` |
| Dither reveal | 8 steps × 150ms | stepped |
| Parallax | per frame | linear in scroll progress, factor −170px × depth |

One easing family everywhere: `cubic-bezier(.16, 1, .3, 1)` ("ease-out-expo-ish": fast
start, long soft landing). Every animation is gated by `prefers-reduced-motion`. No
scroll-triggered fade-ins on content; text is just there.

---

## 8. What to borrow for Luminar, and what not

**Borrow (technique and language):**
- The token set and its *discipline*: 4-step warm-grey ink ramp, hairlines instead of
  boxes, a single hot accent used sparingly. For Luminar: `flame` = attacker / fault
  (`sybil-N`, `eclipse-N`, injected faults) and nothing else. Healthy mesh stays paper/ink.
- Serif-for-thinking / sans-for-doing split: EB Garamond (or any humanist serif) for
  headings, explanations and figure captions; Manrope (or Inter Tight / Geist) for every
  control, metric and label. Tabular numerals for the metrics panel.
- The **plate** as a first-class component: dark `pitch` slab in a paper page, with
  `Fig. N` + italic caption. Use it for the hero (dither a still frame of the mesh or the
  Geo world map), and reuse the caption pattern under every chart and the reel player.
- **Stamps** as scenario/state labels on the plate: `SYBIL FLOOD`, `ECLIPSE`, `LIVE ·
  MAINNET`, rotated 3°, paper on pitch. Perfect for the stage/reel overlay.
- The halftone dot mask (CSS-only) and the irregular `clip-path` shards as collage marks.
- Progressive dither reveal (28→3px over ~1s) as a page-load / scene-transition beat; the
  loupe as a "see the real data under the aesthetic" interaction (e.g. hover reveals real
  peer ids / scores under a dithered heatmap).
- 56px nav, 620px prose column, 1000–1080px wide for tables/menus, 22/42/72/128 rhythm.
- The full-screen menu with staggered serif rows for Luminar's scenario picker.
- Square corners, no shadows, no gradients. One easing curve. Reduced-motion gating.

**Do NOT copy:**
- Their copy ("Make room for delusional ideas", "Send more.", "The problems that can't be
  vibe-coded"), the wordmark, the lightning emblem, the colour-name labels as product
  names, or the `gameplan-research.jpg` photograph (bust + radio dish) — it is their asset.
- The `#36bffa` blue / Tailwind token junk in `body{}`: it isn't part of the design.
- The light page as-is for the *simulator*: Luminar's main view is a live deck.gl canvas and
  reads better in pitch mode. Suggested split: marketing/landing + docs in paper mode;
  the simulator shell inverts the same tokens (`page→pitch`, `ink→paper`, hairline →
  `rgba(242,242,239,.14)`), so plates on the landing page and the live canvas are the same
  object.
- Backboard's honesty posture is irrelevant here, but Luminar's own is binding on any copy
  placed in stamps/captions: "same mechanism, toy constants"; "reproducible recordings"
  never "identical runs"; live mainnet is "arrival at observer nodes, ~2.5 min behind",
  never the mesh path.

---

## 9. Dither recipe (drop-in TypeScript)

Bayer 4×4 ordered dither of an `ImageData` to 1-bit at a chosen cell size, drawn on a
pixelated canvas. Same maths as backboard's 8×8 version; 4×4 gives a coarser, more visibly
"patterned" texture that reads well at cell 3–4px. Swap `BAYER4` for the 8×8 table in §6
to match them exactly.

```ts
// dither.ts — ordered (Bayer) 1-bit dither onto a pixelated canvas.
const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);

export type DitherOpts = {
  cell?: number;        // CSS px per dither cell (backboard final = 3)
  contrast?: number;    // 1.5
  level?: number;       // +0.02 lifts, negative darkens
  positive?: boolean;   // true: light pixels get `paper` cells on `pitch`
  focus?: [number, number]; // object-fit:cover focal point, 0..1 (backboard .5,.22)
  pitch?: string; paper?: string;
};

/** Cover-fit source rect for drawing `img` into a w×h box with focal point (fx,fy). */
function coverRect(iw: number, ih: number, w: number, h: number, fx: number, fy: number) {
  const s = Math.max(w / iw, h / ih), sw = w / s, sh = h / s;
  return [(iw - sw) * fx, (ih - sh) * fy, sw, sh] as const;
}

/** Render one dither pass. `canvas` must be positioned by CSS; we size its backing store. */
export function drawDither(canvas: HTMLCanvasElement, img: CanvasImageSource & { width: number; height: number }, o: DitherOpts = {}) {
  const { cell = 3, contrast = 1.5, level = 0.02, positive = true, focus = [0.5, 0.5],
          pitch = '#0b0b0d', paper = '#f2f2ef' } = o;
  const dpr = Math.min(devicePixelRatio || 1, 2);
  const w = Math.round(canvas.clientWidth), h = Math.round(canvas.clientHeight);
  if (!w || !h) return;
  canvas.width = w * dpr; canvas.height = h * dpr;

  // 1. downsample source to one pixel per cell
  const cw = Math.ceil(w / cell), ch = Math.ceil(h / cell);
  const off = new OffscreenCanvas(cw, ch);
  const octx = off.getContext('2d', { willReadFrequently: true })!;
  const [sx, sy, sw, sh] = coverRect(img.width, img.height, cw, ch, focus[0], focus[1]);
  octx.drawImage(img, sx, sy, sw, sh, 0, 0, cw, ch);
  const px = octx.getImageData(0, 0, cw, ch).data;

  // 2. threshold against the tiled Bayer matrix, draw lit cells only
  const ctx = canvas.getContext('2d')!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = pitch; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = paper;
  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      const i = (y * cw + x) * 4;
      let l = (0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2]) / 255;
      l = Math.min(1, Math.max(0, (l - 0.5) * contrast + 0.5 + level));
      const lit = (l >= BAYER4[(y & 3) * 4 + (x & 3)]) === positive;
      if (lit) ctx.fillRect(x * cell, y * cell, cell, cell);
    }
  }
}

/** Backboard-style progressive reveal: coarse → fine, one step per 150ms. */
export function revealDither(canvas: HTMLCanvasElement, img: HTMLImageElement, o: DitherOpts = {}) {
  const final = o.cell ?? 3;
  const steps = [28, 20, 14, 10, 7, 5, 4].filter((c) => c > final).concat(final);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced) return drawDither(canvas, img, { ...o, cell: final });
  let i = 0;
  const tick = () => { drawDither(canvas, img, { ...o, cell: steps[i] }); if (++i < steps.length) setTimeout(tick, 150); };
  tick();
}
```
Required CSS on the canvas: `position:absolute; inset:0; width:100%; height:100%;
image-rendering:pixelated;` inside a wrapper with `inset:-14% 0` if you parallax it.
For the loupe, keep the final `ctx.getImageData(0,0,canvas.width,canvas.height)` and on
`pointermove` do `putImageData → clip(132² rect) → filter:'grayscale(1) contrast(1.15)' →
drawImage(source, cover rect at full size) → strokeRect`.

Parallax, verbatim behaviour:
```ts
export function parallax(root: HTMLElement) {
  const layers = Array.from(root.querySelectorAll<HTMLElement>('[data-depth]'));
  if (!layers.length || matchMedia('(prefers-reduced-motion: reduce)').matches) return () => {};
  let queued = false;
  const frame = () => {
    queued = false;
    const vh = innerHeight, r = root.getBoundingClientRect();
    if (r.bottom < -100 || r.top > vh + 100) return;
    const p = Math.min(1, Math.max(0, (vh - r.top) / (vh + r.height)));
    for (const el of layers) el.style.transform = `translate3d(0, ${((p - 0.5) * -170 * Number(el.dataset.depth)).toFixed(1)}px, 0)`;
  };
  const on = () => { if (!queued) { queued = true; requestAnimationFrame(frame); } };
  addEventListener('scroll', on, { passive: true }); addEventListener('resize', on); frame();
  return () => { removeEventListener('scroll', on); removeEventListener('resize', on); };
}
```

---

## 10. What I could not verify

- Only the **home page** was inspected. Research/blog/product pages (where Fragment Mono
  and the `data-framer-name="Previous/Next"` styles are used) were not opened.
- Hover/active states (button `#2b2a28`, `scale(.97)`, menu-name italic, chevron nudge,
  loupe) are read from component source; I did not screenshot them in the browser.
- Touch behaviour of the plate (no loupe, no crosshair) is inferred from the
  `(hover:hover) and (pointer:fine)` gate in the source, not tested on a device.
- Whether the parallax looks right at 390 — the depth transforms were read (6 / 10.6 /
  18.1 / 36.2px at the captured scroll position) but not scrolled through.
- `gameplan-research.jpg` is served from `backboard-v15.vercel.app` (a staging/asset host);
  unclear whether the Framer `image` prop overrides it in production — the live canvas
  matched this image, so it was in use at capture time.
- The Framer breakpoint CSS for the footer at 810–1199 was not measured (component uses its
  own ResizeObserver width, threshold not confirmed; the 2-column layout at 390 was).
- Fonts: EB Garamond came from Google Fonts, Manrope from Fontshare via Framer; both
  licences are permissive, but confirm before self-hosting.

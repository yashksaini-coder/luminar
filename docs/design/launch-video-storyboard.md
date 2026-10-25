# Luminar launch video — storyboard

> Historical record of the `frontend/` tree at git tag `pre-overhaul` (eb26490, 2026-10-24);
> the shipped frontend is `web/`.

Remotion (React video) launch/demo cut for social, in the dither aesthetic of the UI overhaul.
Two cuts from one component tree: **16:9 1920×1080** (X, LinkedIn, YouTube) and **9:16 1080×1920**
(Reels, Shorts). 30 fps. Wide cut 57 s (1710 frames), tall cut 48 s (1440 frames).

Timings below are verified against `frontend/public/reels/sybil-eclipse.jsonl` (9 746 frames,
40.5 s of simulation): first publish T+5.8 (peer-22), Sybil ×5 at T+10.2, first `GossipPrune
reason=score` at T+11.9 (peer-42 → sybil-3), eclipse on peer-10 at T+16.2, `FaultCleared` at T+24.1.
Attacker ids are `sybil-0..4`, `eclipse-0..3`, state `attacker`, so the script survives a re-record.

## Honesty line (applies to every text overlay)

- "Same mechanism, toy constants." Never "the scoring your beacon node runs".
- "Reproducible recordings." Never "identical runs". The reel is one recording; the video is a
  rendering of that recording, not a live run.
- Mainnet: "arrival at observer nodes, ~2.5 min behind". Never "mesh path", never "propagation".
- Numbers on screen are read from the reel's `analytics` frames at render time, not typed in.

## Visual language (no backboard copy, logo or text; technique only)

| token | value | use |
|---|---|---|
| ink | `rgb(11,11,13)` | background, always |
| paper | `rgb(242,242,239)` | dithered footage, stamp fill, body text |
| signal | `rgb(255,90,44)` | the only chroma: attackers, PRUNE edges, one accent shape per scene |
| grey halftone | paper at 0.55 with an 8 px circle mask | secondary shapes, score strip background |
| stamp | Manrope 600, uppercase, 0.1em tracking, paper box on ink text, `rotate(3deg)` (alternate −2°) | one short verb-phrase per scene |
| fig. caption | `Fig. N` in Manrope 600 + italic serif (Instrument Serif) sentence, bottom-right | the honest sentence under every footage scene |
| mono readouts | Geist Mono 500, tabular nums | ticker, score strip, timestamps |
| cursor | crosshair, drawn as a 1-bit 13×13 sprite | appears only when the "hand" clicks a node |

Everything photographic or rendered is 1-bit (ink/paper) through an **ordered Bayer 8×8 dither**,
never error diffusion: Bayer is a pure function of (x, y, luminance), so a still region renders the
same every frame and the video does not shimmer; Floyd–Steinberg would crawl. Orange is never
dithered: attackers, PRUNE edges and the accent shape are drawn on top in flat colour, which is
what makes them read as "the signal" against a 1-bit field.

## Footage: re-render from reel JSONL (recommended), not dithered screencasts

Recommendation: **draw the mesh in React from the reel's JSONL**, dither it in a canvas, and use
real screen recordings only as dithered stills for the panels the mesh scene cannot draw
(inspector, Grafana, Jaeger). Why:

| | re-render from JSONL | dither a screencast |
|---|---|---|
| frame accuracy | pure function of `frame` → sim time; scrub, re-time, slow-mo at will | video decode per frame through `<OffthreadVideo>` then a canvas pass; timing locked to the recording's rAF |
| 9:16 | same nodes refit to a square; nothing cropped | a 16:9 recording cropped to 9:16 loses half the mesh |
| legibility after 1-bit | node radius, edge weight, particle size chosen for dither | deck.gl's 1 px edges and anti-aliased glow vanish at 1-bit |
| honesty | the on-screen numbers come from `analytics` frames in the same file | numbers are pixels, cannot be checked |
| cost | ~400 lines (parser, layout, particles, dither) | ~60 lines, but every retake is a re-record |

Data in the reel is enough: `snapshot` frames (every 0.5 s) carry `x, y` for every node (d3-force laid
out once and frozen, so positions are stable), `state`, `connected_peers`, `gossip_score`;
`edges` frames carry the full mesh; event frames carry `at` in sim seconds for `GossipMessage`
(`from_peer`, `to_peer`, `hops`, `latency_ms`, `via`), `GossipGraft`, `GossipPrune` (`reason`),
`ScenarioPhaseFired` (`label`), `FaultInjected`, `FaultCleared`; `analytics` frames carry
`recent_delivery_ratio`, `avg_hops`, `avg_propagation_ms`. Particles are interpolated between
`from_peer` and `to_peer` over `latency_ms` from `at`. Nothing is invented.

Screencast stills (dithered) are used where the mesh is not the subject: the inspector sparkline,
Grafana, Jaeger, the Geo map. They are captured once (list at the end) and dithered at render time
by the same `<Dither>` component so the look is identical.

## Story

Three beats, one sentence each, in the order the reel plays them:

1. **Healthy mesh** — a flood publish reaches 50 peers in four hops. Establishes the rules.
2. **Sybil flood, pruned by score** — five loud attackers graft in; P4 drives their score past −10;
   every honest peer prunes them within two heartbeats, uncoordinated.
3. **Eclipse scoring cannot see** — four silent attackers close around peer-10; P4 stays 0, only a
   P3 deficit floored at −0.25; the mesh never reacts; the node survives on gossip pulls.

Then heal, then "it exports what your node exports", then the honesty card, then the end card.

## Scene table, 16:9 cut (1920×1080, 30 fps, 1710 frames)

Sim time = `(frame − sceneStart) / 30 × speed + simOffset`; speed is 1× unless stated.

| # | scene | frames | what is on screen | motion | text overlay | sound cue |
|---|---|---|---|---|---|---|
| 1 | Cold open | 0–75 (2.5 s) | Ink. A Bayer-noise field at 2 % density resolves over 40 frames into the 50-node mesh at T+0, paper dots on ink, edges at 0.5 px paper 40 %. One orange parallelogram (6 % wide) lower-left, parallax depth 0.2. | Noise→mesh via threshold ramp on the dither canvas (luminance 0→1). Parallelogram drifts +2 px. Camera at 1.0 scale. | Stamp `LUMINAR` rotate 3°, pops in at frame 30 with a 6-frame spring (damping 200, no overshoot). | Low 50 Hz hum fades in, −18 dB. |
| 2 | Title | 75–240 (5.5 s) | Mesh holds, dimmed to 60 %. Headline left-aligned, 96 px Manrope 600 paper: `libp2p GossipSub v1.1.` / `Run live. Broken on purpose.` Halftone grey rectangle behind the second line. | Lines rise 24 px with 10-frame stagger. Mesh breathes (edge opacity 35→45 %). | `Fig. 1` *Fifty peers, a mesh, and a scoring loop you can push past the prune threshold.* fades in at 150. | Hum continues; one soft tick on each headline line. |
| 3 | Beat 1: healthy mesh | 240–480 (8 s), simOffset T+4.0 | Full mesh, 1-bit. At T+5.8 peer-22 publishes `msg-1`: a paper particle (4 px square) leaves on every mesh edge; receivers flash to a solid 10 px square for 6 frames and stay 2 px larger. Ticker bottom-left, Geist Mono: `delivery 100 % · hops 4 · 190 ms` read from the first `analytics` frame after the publish (builder: do not type the numbers). | Wave ripples outward hop by hop; particles ease linear over `latency_ms`. Camera eases from 1.0 to 1.08 scale toward peer-22 over the scene. | Stamp `FLOOD PUBLISH` rotate −2° at 300. `Fig. 2` *One publish, every peer, in four hops. Same mechanism, toy constants.* | Each hop ring triggers a short wooden click, pitch down per hop (4 clicks). |
| 4 | Beat 2a: Sybils graft | 480–660 (6 s), T+9.5 | At T+10.2 five **orange** squares (`sybil-0..4`, 12 px) appear beside their targets; GRAFT edges draw in orange over 8 frames; from the next heartbeat orange 3 px particles leave each Sybil every second on every mesh edge (invalid spam). Ticker adds `invalid ↑` counter from `GossipMessage` frames whose `from_peer` starts with `sybil-`. | Attackers scale in from 0 with a sharp 4-frame spring. Spam particles are many and fast (latency from the frames). Camera 1.08 → 1.15 toward the densest attacker. | Phase label from the reel, `Sybil attack: 5 attackers graft in`, as a halftone grey bar top-left. Stamp `FIVE SYBILS` rotate 3°. | Hum rises a fifth; spam particles trigger a dry static crackle, −24 dB. |
| 5 | Beat 2b: pruned by score | 660–840 (6 s), T+11.4 at 0.6× | Camera on `sybil-0`. A **score strip** (halftone grey box, Geist Mono) under the node steps `+0.1 → −10 → −15` on the heartbeats, bar in orange going left past a dotted line marked `prune −10`. At T+11.9 the first `GossipPrune reason=score` fires: each honest→Sybil edge flashes orange then is erased; the Sybil squares turn hollow (1 px orange outline, ink fill). | Slow motion 0.6× so both heartbeats are legible. Edge erase is a 6-frame wipe along the edge. Crosshair cursor enters at frame 680, "clicks" sybil-0 at 700 (one-frame invert). | Stamp `PRUNED BY SCORE` rotate −2° at the first prune. `Fig. 3` *P4, the invalid-message penalty: −10 per heartbeat of spam. Two heartbeats, every honest peer pruned them, nobody coordinated it.* | Each PRUNE: a short paper-tear sound, −12 dB; after the last one, 20 frames of near silence. |
| 6 | Beat 3: the eclipse | 840–1110 (9 s), T+15.5 | Camera pans to `peer-10` (centre-right in this reel). At T+16.2 its mesh edges to honest peers erase (paper, no flash) and four orange **hollow** squares `eclipse-0..3` wire to it. They send nothing: no particles leave them. A second score strip under `eclipse-0` stays flat at `0.0`, with `P4 0 · P3 −0.25 floor` in grey mono. Then a publish from the honest side: paper particles reach every node except peer-10 over the mesh; after ~1 s an `IHAVE/IWANT` pull arrives as a dashed paper particle along a non-mesh line and peer-10 lights late. | Pan 1.15 scale, 2 s ease. The flat score strip is held for 60 frames with nothing happening on purpose. Late pull particle is dashed, slower. | Phase label `Eclipse on peer-10`. Stamp `SCORING CANNOT SEE THIS` rotate 3° at 960. `Fig. 4` *Four silent attackers. No invalid messages, so no P4. Only a P3 deficit, floored at −0.25. The mesh never reacts; peer-10 lives on gossip pulls, a heartbeat late.* | Hum drops to the root and thins to a sine; the late pull gets one soft click. No crackle. |
| 7 | Heal | 1110–1230 (4 s), T+23.6 | Camera back to full mesh. At T+24.1 `FaultCleared` ×2: orange squares fade to 0 over 10 frames; re-GRAFT edges draw in paper; next publish wave reaches every node including peer-10. Ticker `delivery 100 %`, and `healed in N s` where N = first `analytics` frame with `recent_delivery_ratio ≥ 0.95` after `FaultCleared` minus 24.1 (≈1.4 s in this recording). | Scale back to 1.0 over 30 frames. Wave as in scene 3. | Stamp `HEALED` rotate −2°. `Fig. 5` *Faults cleared; the mesh re-grafts and delivery is back within two heartbeats.* | Hum returns to the opening chord. |
| 8 | Same names | 1230–1410 (6 s) | Two dithered stills slide in as parallax cards: left `grafana.png` (depth 0.6), right `jaeger.png` (depth 0.9), each with a 1 px paper border, ink gap. Under them, mono list of the seven `gossipsub_*` series names, typed on at 2 names/s. | Cards enter from ±120 px with 12-frame ease; depth gives 6 px vs 9 px drift on a slow vertical pan. | Stamp `OPENTELEMETRY OUT` rotate 3°. `Fig. 6` *Seven of the series a beacon node exports, under the same names, so the same dashboard queries work on both. Not the same numbers.* | Typing ticks, one per name. |
| 9 | Mainnet (optional B-roll) | 1410–1500 (3 s) | Dithered still-sequence (3 frames from `live-mainnet` capture, 1 s apart) of the Geo map: observer dots lighting across a 1-bit world map. Orange accent: a single rotated parallelogram in the ocean. | Three-frame cross-dissolve, each 30 frames. | `Fig. 7` *Real mainnet: arrival of one slot's block at ~150 observer nodes, ~2.5 min behind. Arrival at observers, not the mesh path. Data: ethPandaOps, CC BY 4.0.* | One long low swell. |
| 10 | Honesty card | 1500–1590 (3 s) | Ink. Mono table, two columns `luminar · lighthouse`: `D 6 · 8`, `prune −10 · −8000`, `heartbeat 1 s · 0.7 s`, `score P1–P4 · P1–P7`. Halftone grey behind the right column. | Rows type on at 1 row / 8 frames. | Stamp `SAME MECHANISM, TOY CONSTANTS` rotate −2°, large, centred. | Hum only. |
| 11 | End card | 1590–1710 (4 s) | Ink. Wordmark `LUMINAR` 160 px Manrope 600 paper. Under it mono: `github.com/yashksaini-coder/luminar`. Under that: `Devcon 8 · Mumbai · 3–6 Nov 2026`. The T+0 mesh from scene 1 ghosted at 15 % behind, dithered. Orange parallelogram returns lower-left. | Wordmark holds; URL and date rise in with 8-frame stagger; mesh ghost resolves back into Bayer noise over the last 40 frames (inverse of scene 1). | Stamp `BREAK IT YOURSELF` rotate 3°, top-right, at 1620. | Hum resolves and stops 15 frames before the end; the last frame is silent. |

Total 57 s. If the platform wants ≤ 45 s, drop scenes 8 and 9 (and shorten 2 to 3 s): 44 s.

## Scene table, 9:16 cut (1080×1920, 30 fps, 1440 frames)

Same components, `orientation="tall"`. Differences only; everything not listed is identical to the
wide cut at the same scene number.

| # | scene | frames | layout change |
|---|---|---|---|
| 1 | Cold open | 0–75 | Mesh fits a 1000 px square centred vertically; stamp at top third. Safe zones: nothing readable in the top 220 px or bottom 320 px (Reels/Shorts chrome). |
| 2 | Title | 75–210 | Headline 72 px, stacked 3 lines (`libp2p GossipSub v1.1.` / `Run live.` / `Broken on purpose.`). Fig. caption moves to just above the bottom safe zone, left-aligned, max 2 lines. |
| 3 | Beat 1 | 210–420 | Ticker becomes a 3-line stack top-left under the safe zone. Camera scale 1.0 → 1.12 (more zoom, the square is smaller). |
| 4 | Beat 2a | 420–570 | Phase label full-width bar under the top safe zone. |
| 5 | Beat 2b | 570–750 | Score strip moves below the mesh square, full width, 140 px tall; the node itself is highlighted with a 2 px orange ring instead of a strip underneath. |
| 6 | Beat 3 | 750–990 | Same; the `P4 0 · P3 −0.25 floor` line goes under the strip. |
| 7 | Heal | 990–1110 | Same. |
| 8 | Same names | 1110–1230 (4 s) | One card only: a 1080×600 crop of `grafana.png` (the score heatmap and churn panels). Jaeger dropped. Four series names instead of seven. |
| 9 | Mainnet | — | Dropped. |
| 10 | Honesty card | 1230–1320 | Table at 44 px mono, centred. |
| 11 | End card | 1320–1440 | Wordmark 120 px; URL on two lines (`github.com/` / `yashksaini-coder/luminar`) so it stays ≥ 40 px. |

Total 48 s.

## Remotion project

Lives in `video/` at the repo root; nothing under `frontend/` or `backend/` changes. It is its own
npm package so the frontend lockfile stays untouched.

```
video/
  package.json            remotion, @remotion/cli, @remotion/google-fonts, @remotion/fonts, react, react-dom, zod
  remotion.config.ts      Config.setVideoImageFormat("jpeg"); Config.setConcurrency(…)
  public/
    reels/sybil-eclipse.jsonl        copied from frontend/public/reels/ (script: npm run sync-reel)
    captures/*.png                   the capture list below
    fonts/GeistMono-500.woff2        from frontend/node_modules/@fontsource/geist-mono/files/
    audio/*.wav                      hum, clicks, tear, crackle, swell
  src/
    Root.tsx              registers the two compositions
    timeline.ts           scene start/length per orientation (the two tables above, as data)
    props.ts              zod schema: { orientation, reel, repoUrl, eventLine, speedByScene }
    reel/parse.ts         JSONL → { nodes: Map<id,{x,y,state}>, edges, events sorted by at, analytics[] }
    reel/useReel.ts       fetch(staticFile(reel)) under delayRender/continueRender; cached per render
    reel/simTime.ts       frame → sim seconds given scene offset and speed
    mesh/Mesh.tsx         SVG: edges, nodes, attackers; props { simTime, focus, scale, orientation }
    mesh/Particles.tsx    GossipMessage frames with at ≤ simTime < at + latency_ms → interpolated squares
    mesh/ScoreStrip.tsx   gossip_score of one peer from the nearest snapshot, bar + threshold line
    mesh/Ticker.tsx       delivery / hops / ms from the latest analytics frame ≤ simTime
    dither/Dither.tsx     renders children to an offscreen canvas, applies Bayer 8×8, writes 1-bit paper/ink
    dither/bayer.ts       the 8×8 matrix and threshold(x, y, lum)
    type/Stamp.tsx        paper box, Manrope 600, uppercase, rotate prop, spring-in
    type/Fig.tsx          "Fig. N" + italic serif caption, bottom-right (wide) / above safe zone (tall)
    type/Mono.tsx         Geist Mono readout with tabular nums
    layers/Parallax.tsx   data-depth children drift by depth × pan(frame)
    layers/Accent.tsx     orange parallelogram / halftone rectangle, clip-path polygons
    scenes/01-ColdOpen.tsx … 11-EndCard.tsx   one file per scene; each takes { orientation }
    Launch.tsx            <Sequence> per scene from timeline[orientation]
```

Compositions in `Root.tsx`:

```tsx
<Composition id="LaunchWide" component={Launch} width={1920} height={1080} fps={30}
  durationInFrames={1710} schema={launchProps}
  defaultProps={{ orientation: "wide", reel: "reels/sybil-eclipse.jsonl",
    repoUrl: "github.com/yashksaini-coder/luminar",
    eventLine: "Devcon 8 · Mumbai · 3–6 Nov 2026" }} />
<Composition id="LaunchTall" component={Launch} width={1080} height={1920} fps={30}
  durationInFrames={1440} defaultProps={{ …same, orientation: "tall" }} />
```

Data source for the mesh animation: `public/reels/sybil-eclipse.jsonl`, parsed once per render in
`useReel` (3.6 MB, ~9 700 lines; parse ≈ 100 ms). `calculateMetadata` is not needed: durations are
fixed by the timeline, and the reel's phase times are stable across re-records. Node positions are
the `x, y` from the first `snapshot` (frozen d3 layout); attacker positions come from the first
snapshot that contains them. Snapshots arrive every 0.5 s, so `gossip_score` in the score strip is
step-interpolated, which is what the real inspector shows too.

Dither: `<Dither>` renders its SVG child into a canvas at composition size, reads the pixels once per
frame, and writes paper or ink per pixel by comparing luminance with `bayer8[y & 7][x & 7] / 64`.
Orange elements are rendered in a sibling layer above the dither so they stay flat. A 1920×1080
pass is ~2 M pixels in a typed-array loop, about 25 ms per frame on a laptop; 1 710 frames at
concurrency 4 renders in a few minutes. Set `Config.setChromiumOpenGlRenderer("angle")` if the
canvas is slow in headless Chrome.

Fonts: Manrope and Instrument Serif through `@remotion/google-fonts` (`loadFont("600")`,
`loadFont("400", { subsets: ["latin"] })` with `style: italic`); Geist Mono as a local woff2
through `@remotion/fonts` `loadFont({ family: "Geist Mono", url: staticFile("fonts/GeistMono-500.woff2"), weight: "500" })`,
copied from the frontend's existing `@fontsource/geist-mono` package so the video uses the same mono
as the app. Google Fonts are fetched at render time; if the render box is offline, vendor Manrope and
Instrument Serif the same way as Geist Mono.

How 9:16 reuses 16:9: every scene component takes `orientation` and reads its frame range from
`timeline[orientation]`; layout differences are a `const L = layout[orientation]` object per scene
(mesh box, stamp anchor, caption anchor, safe insets), never a second component. `Mesh` fits the
node bounding box into whatever box it is given, so the tall cut gets the same nodes in a square.
Scenes 8 and 9 check `orientation` to drop Jaeger and the mainnet B-roll.

Audio: `<Audio src={staticFile("audio/hum.wav")} volume={f => interpolate(...)}/>` in `Launch.tsx`;
per-scene one-shots as `<Audio startFrom>` inside `<Sequence>`. Sound is additive: the cut works
muted (most feeds autoplay muted), so every beat is also carried by a stamp or a caption.

Render:

```bash
cd video && npm install
npm run sync-reel                              # cp ../frontend/public/reels/sybil-eclipse.jsonl public/reels/
npx remotion render LaunchWide out/luminar-16x9.mp4 --codec h264 --crf 18
npx remotion render LaunchTall out/luminar-9x16.mp4 --codec h264 --crf 18
npx remotion still LaunchWide out/cover.png --frame 1620   # end card as the post's cover image
```

## Asset capture list (from the real app)

All at 1440×840 unless stated, stage theme, hero layout, captured as PNG and dithered at render time
by `<Dither>`; do not pre-dither. Store in `video/public/captures/`.

| file | how | used in |
|---|---|---|
| `inspector-sybil-0.png` | `/?reel=sybil-eclipse&theme=stage&t=12.4&peer=sybil-0` (hero off), crop the inspector panel: score sparkline stepping to −15, events list with `PRUNE reason=score` | reference for `ScoreStrip` styling; optional inset in scene 5 at 320 px wide |
| `inspector-peer-10.png` | `…&t=18.0&peer=peer-10`, crop the inspector: four `eclipse-*` connected peers, flat score | optional inset in scene 6 |
| `grafana.png` | reuse `assets/readme/grafana.png`, or recapture at 1600×900: `make otel-up`, backend with `OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318`, run `demo_sybil_eclipse`, `http://127.0.0.1:3000/d/luminar-gossipsub?kiosk&from=now-4m&to=now` | scene 8 (both cuts; tall cut crops to the heatmap + churn panels) |
| `jaeger.png` | reuse `assets/readme/jaeger.png`, or `make otel-smoke` and open the printed trace URL, span tree expanded | scene 8 wide |
| `geo-wave-0.png`, `-1.png`, `-2.png` | `/?reel=mainnet-block-wave&theme=stage&hero=1`, pause 1.5 s before a wave, then step and screenshot at three points 1 s apart (`select='gt(scene,0.01)'` on a short recording finds the wave start, per `docs/readme-assets.md`) | scene 9 wide |
| `ui-main.png` | reuse `assets/readme/ui-main.png` | not in the cut; thumbnail alternative for the post |
| `sybil-eclipse.jsonl` | `frontend/public/reels/sybil-eclipse.jsonl` as is; if re-recorded, `uv run python scripts/record_reel.py record sybil-eclipse demo_sybil_eclipse --nodes 50 --duration 40 --min-score-prunes 1` against `LUMINAR_ALLOW_RECORD=1 make backend`, then `check` | scenes 1, 3–7, 11 |

Verification before publishing: play `LaunchWide` in `npx remotion studio`, scrub to frames 660–840
and confirm the first PRUNE edge erase lands on the reel's T+11.9 (frame ≈ 685 at 0.6×); confirm the
ticker in scene 3 shows the reel's own `avg_hops`/`avg_propagation_ms`, not hard-coded text; confirm
no caption uses "identical", "beacon node's scoring" or "mesh path" for the mainnet shot.

## Open choices for the builder

- Stamp copy is placeholder-grade; keep each under 24 characters so the paper box stays one line at
  9:16.
- Scene 9 (mainnet) is optional; cut it first if the wide cut must be ≤ 50 s.
- If the halftone-dot mask reads as noise at 1080p after platform re-encode, drop the mask and keep
  the grey rectangles flat at 0.55; the Bayer dither on the mesh must stay.

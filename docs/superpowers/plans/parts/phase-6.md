# UI Overhaul — Phase 6: Remotion launch video — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render the 57 s / 48 s launch video (16:9 and 9:16) from `public/reels/sybil-eclipse.jsonl` with the site's own dither, glyphs, tokens and fonts, and land `public/video/launch-16x9.mp4` + `poster.png` for the landing's Fig. 3 plate.

**Architecture:** `web/remotion/` lives inside the Next app's `package.json` (spec §9). Everything on screen is a pure function of `(frame, reel data)`: `timeline.ts` maps frame → sim time per scene; `reel/parse.ts` turns the JSONL into typed arrays once per render (under `delayRender`); pure modules (`mesh/view.ts`, `mesh/particles.ts`, `mesh/readouts.ts`) compute what a frame shows and are vitest-tested against the real reel; `layers/Dither.tsx` draws the paper layer to a canvas and runs the shared `ditherImageData` (Bayer 8×8, 1-bit); flame elements (attacker `Diamond`s, attack/PRUNE edges, the `Reticle` cursor) render flat in a sibling layer above the dither (§7, §7.4.2). Eleven scene files share one `Launch` component through `timeline[orientation]` and per-scene `LAYOUT[scene][orientation]` tables.

**Tech Stack:** `remotion` + `@remotion/cli` + `@remotion/player` 4.0.538, `zod` 3 (Remotion schema), React 19.3.1, TypeScript 5.9.3, vitest (jsdom) for pure modules, Remotion Studio + `remotion render --frames` PNG stills for visual acceptance, local Chrome for the final render (not CI).

**Spec:** `/home/yks/Projects/luminar/docs/superpowers/specs/2026-10-24-ui-overhaul-design.md` §9 (and §4.1, §4.6, §4.7, §6.1 item 7, §7, §7.4, §10, §11 Phase 6, §12, §13.3). Storyboard: `/home/yks/Projects/luminar/docs/design/launch-video-storyboard.md` (scene tables, capture list; its `video/` package location, Geist Mono, `@remotion/google-fonts`, audio and parallelogram/halftone accents are superseded by the spec). Shared contract: `/home/yks/Projects/luminar/docs/superpowers/plans/2026-10-24-ui-overhaul-interfaces.md` (A.2 types, A.4 copy, A.19 dither core, A.20 `Stamp`/`HaloRing`/`Diamond`/`Reticle`, A.21 `reel-stats.json`, A.22 Remotion, A.24 scripts/Makefile). No `ui-inventory.md` row is assigned to this phase (the video is new; the inventory covers the simulator port).

## New interfaces introduced by this phase

All under `web/remotion/` unless noted; names A.22 already pins (`props.ts`, `timeline.ts`, `Root.tsx`, `Launch.tsx`, `fonts.css`, `SceneId`, `SceneSpan`, `timeline`, `SAFE_TALL`, `launchSchema`, `LaunchProps`, `LAUNCH_DEFAULTS`) are used verbatim.

| Name | Where | Signature / value | Why |
|---|---|---|---|
| `index.ts` | `remotion/index.ts` | `registerRoot(Root)` | Remotion needs an entry file; `remotion.config.ts` sets `Config.setEntryPoint('./remotion/index.ts')` |
| `video-out/` | `web/video-out/` (gitignored) | replaces `out/` in A.22's `video` script for the three social outputs | `next build` with `output:'export'` deletes and rewrites `web/out`; a Remotion output there is lost on the next build |
| `FPS`, `SIZE` | `timeline.ts` | `FPS = 30`; `SIZE: Record<Orientation, { width; height; durationInFrames }>` = wide 1920×1080×1710, tall 1080×1920×1440 | one source for `Root.tsx` and tests |
| `sceneAt`, `simTimeAt`, `frameForSimTime` | `timeline.ts` | `sceneAt(o: Orientation, frame: number): SceneSpan \| undefined` · `simTimeAt(span: SceneSpan, localFrame: number): number` = `(span.simOffset ?? 0) + localFrame / FPS × (span.speed ?? 1)` · `frameForSimTime(span, t): number` = `span.from + Math.round((t − simOffset) / speed × FPS)` | frame ↔ sim time, tested |
| `ReelData`, `ReelNode`, `ReelSnapshot`, `ReelMessage`, `parseReel`, `snapshotAt`, `analyticsAt` | `reel/parse.ts` | see Task 6.3 | the video's data model (storyboard `reel/parse.ts`) |
| `useReel` | `reel/useReel.ts` | `useReel(reel: string): ReelData \| null` | fetch + parse under `delayRender`, module-cached |
| `Box`, `Camera`, `Projector`, `makeProjector` | `mesh/view.ts` | see Task 6.4 | fit the frozen layout into any box; camera scale/focus |
| `Dither` | `layers/Dither.tsx` | `props { width: number; height: number; cell: number; draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void; style?: CSSProperties }` | per-frame deterministic 1-bit pass (the browser `DitherCanvas` is IntersectionObserver/reveal-driven and is not used in the video) |
| `activeParticles`, `PARTICLE_MIN_MS` | `mesh/particles.ts` | see Task 6.5 | message/spam/iwant squares interpolated over `latency_ms` with a 400 ms display floor |
| `attackersAt`, `attackEdgesAt` | `mesh/attackers.ts` | see Task 6.5 | attacker presence, grafted/pruned, edge lifetimes from GRAFT/PRUNE events |
| `drawMesh`, `Mesh`, `Attackers` | `mesh/drawMesh.ts`, `mesh/Mesh.tsx`, `mesh/Attackers.tsx` | see Task 6.5 | paper layer (dithered) and flame layer (flat) |
| `tickerAt`, `invalidCountAt`, `scoreAt`, `healedInS` | `mesh/readouts.ts` | see Task 6.6 | every number on screen |
| `Ticker`, `ScoreStrip` | `mesh/Ticker.tsx`, `mesh/ScoreStrip.tsx` | see Task 6.6 | readouts |
| `Fig`, `Mono`, `StampIn`, `Headline` | `type/*.tsx` | see Task 6.7 | video-only type components; `Stamp` itself is the shared `components/dither/Stamp.tsx` |
| `Parallax`, `useImage`, `DitheredStill` | `layers/Parallax.tsx`, `layers/useImage.ts`, `layers/DitheredStill.tsx` | see Tasks 6.7, 6.11 | depth drift; image → `Dither` |
| `SceneProps`, `LAYOUT`, `SceneLayout`, `STAMP`, `FIG`, `HEADLINE`, `TOY`, `LIGHTHOUSE`, `SERIES` | `scenes/types.ts`, `scenes/layout.ts`, `scenes/copy.ts`, `constants.ts` | see Tasks 6.7, 6.12 | per-scene layout tables (safe-zone tested), all video strings in one file (length/forbidden-phrase tested), honesty-card constants (checked against `backend/gossip/engine.py`) |
| `public/stills/{grafana,jaeger,geo-wave-0,geo-wave-1,geo-wave-2}.png` | `web/public/stills/` | PNG sources for scenes 8–9, dithered at render time | Remotion `staticFile` needs them under `public/`; phase 5's "Same names" section may point at the same two files |
| `make web-video` | `Makefile` | `cd web && npm run video` | A.24 already lists it; this phase adds it |

## Global Constraints

- Spec §11 phase rule: every task ends with `cd web && npx tsc --noEmit && npm run lint && npx vitest run` green and `make check` green for `frontend/` + `backend/`.
- Backend untouched; the reel file is read as-is (`public/reels/sybil-eclipse.jsonl`, 9 746 lines, not re-encoded, not gzipped) (spec §2, §6.4).
- Pins: `remotion`, `@remotion/cli`, `@remotion/player` **4.0.538**; `zod` 3.x latest after `npm view zod@3 version`; exact versions, lockfile committed (spec §4.7).
- No `@remotion/google-fonts`, no network at render: fonts via `@font-face` in `remotion/fonts.css` from `public/fonts/*.woff2` (Instrument Serif 400 roman + italic, IBM Plex Mono 400/500/600, Manrope variable) (spec §4.6, §9).
- Shared components used by the video (`components/dither/dither.ts`, `Stamp.tsx`, `HaloRing.tsx`, `Diamond.tsx`, `Reticle.tsx`, `lib/copy.ts`, `lib/types.ts`, `components/map/palette.ts` `scoreBand`/`BAND_DENSITY`) must stay plain React: no `next/*` imports, no `"use client"` dependence (spec §9).
- Dither: ordered Bayer 8×8 only, never error diffusion; dithered = mesh footage and stills; never dithered = text, numerals, attackers, pruned diamonds, particles, PRUNE edges, the reticle, stamps (spec §7, §9).
- `--flame` only for attacker / fault / alarm (attackers, attack and PRUNE edges, score strip bar when negative, `invalid` counter); never on a brand element, headline or the end card wordmark (spec §2, §5). The storyboard's "orange parallelogram" and "halftone grey rectangle" are **not built**; the only floating objects are `HaloRing` and `Diamond` (spec §7.4.2, owner 24 Oct).
- Copy: every honesty sentence imported from `lib/copy.ts`; `web/lib/copy.test.ts` greps `remotion/` for `FORBIDDEN` (`identical run`, `beacon node's scoring`, `the scoring your beacon node runs`, `mesh path`) — so scene 9 must import `ARRIVAL`/`PROVENANCE` rather than inline them; the word `propagation` does not appear in the mainnet caption (spec §4.10, §9).
- Stamps ≤ 24 characters (A.20 `StampProps.children`); Manrope 600 uppercase .1em, paper on pitch, `rotate(var(--stamp-tilt))`.
- Numbers on screen come from the reel (`analytics`, `gossip_score`, event counts) at render time; nothing typed in. Phase times in this recording: first publish T+5.8 (peer-22), Sybils T+10.2, all 20 `GossipPrune reason=score` at T+11.9, eclipse on peer-10 T+16.2, `FaultCleared` T+24.1, attackers gone from snapshots at T+24.4, healed (first `recent_delivery_ratio ≥ .95` after clear) at T+25.5 → `healedInS` 1.4 (spec §9; verified 24 Oct against the file).
- Audio: silent, both cuts; no `<Audio>` anywhere (spec §13.3).
- Outputs: `video-out/luminar-16x9.mp4`, `video-out/luminar-9x16.mp4` (h264 crf 18), `video-out/cover.png` (frame 1620), `public/video/launch-16x9.mp4` (1280×720, ≤ 12 MB, crf builder's), `public/video/poster.png` (frame 1620); rendering needs local Chrome and is not in CI (spec §9).
- Commits `type(web): …` (spec §12 allows `video` as a scope too; this plan uses `web` as the task text asks).

## Review Focus

1. **Message particles are shorter than a frame.** Every `GossipMessage` in the reel has `latency_ms` 0–50 (spam and IWANT are 0.0); at 30 fps a particle interpolated strictly over `latency_ms` never appears. `activeParticles` uses `max(latency_ms, PARTICLE_MIN_MS = 400)` for its visible life while keeping `at` as the start — test in Task 6.5 (`particles.test.ts` asserts the 5.8 s publish wave is visible at T+6.0 and the T+16.9 IWANT pull at T+16.95).
2. **Sim time of a typed frame.** `analytics` frames carry no sim time; their time is the latest snapshot `time` at or before them (A.21). A parser that uses wall `t / 1000` puts the first non-zero analytics at ~9.1 s instead of 7.4 s and the ticker lies by two seconds — test in Task 6.3 (`parse.test.ts` asserts `analytics[k].time === 7.4` for the first frame with `total_messages > 0`).
3. **Attackers after `FaultCleared`.** Snapshots still contain 9 attackers at T+23.9 and none at T+24.4; a scene that keys on snapshot presence pops them out on a 0.5 s boundary, a scene that keys on `clearedAt` fades them over 10 frames from T+24.1 — test in Task 6.5 (`attackers.test.ts`: `attackersAt(d, 24.2)` still returns 9 with `fading: true`; `attackersAt(d, 24.6)` returns none).
4. **Scene 3's window contains the Sybil graft.** `healthy` runs T+4.0 → T+12.0 (wide) / T+11.0 (tall), so the five diamonds and the T+11.0 spam burst would appear inside the "healthy mesh" beat. Scene 3 passes `showAttackers={false}` to `Mesh`, which also drops `spam` particles — test in Task 6.5 (`activeParticles(d, 11.05, { attackers: false })` has no `spam` kind).
5. **The landing `<video>` through FastAPI.** Starlette's `StaticFiles` serves `/video/launch-16x9.mp4` with `content-type: video/mp4`; whether it honours `Range` decides if seeking works in Safari/iOS. Task 6.14's walk records `curl -r 0-99 -sI` → `206` or `200`; if `200`, the plate keeps `preload="metadata"` and the finding goes to the owner (backend is out of scope, spec §2).

---

### Task 6.1: Remotion scaffold inside `web/` — config, entry, compositions, fonts, scripts

**Files:**
- Create: `web/remotion.config.ts`, `web/remotion/index.ts`, `web/remotion/Root.tsx`, `web/remotion/props.ts`, `web/remotion/fonts.css`, `web/remotion/Launch.tsx` (skeleton), `web/.gitignore` (add `video-out/`)
- Modify: `web/package.json` (deps + scripts `studio`, `video`), `web/eslint.config.mjs` (ignore nothing; add `remotion/**` override turning off `@next/next/no-img-element`), `Makefile` (`web-video`)
- Test: none (vitest) — acceptance is `npx remotion compositions`

**Interfaces:**
- Consumes: A.4 `REPO_URL`, `EVENT_LINE`; `app/globals.css` (tokens + base rules, phase 0); `public/fonts/*.woff2` and the family names `layout.tsx` registers (phase 0).
- Produces: A.22 `launchSchema`, `LaunchProps`, `LAUNCH_DEFAULTS`, `Orientation`; compositions `LaunchWide` 1920×1080×1710 and `LaunchTall` 1080×1920×1440 at 30 fps; `remotion/fonts.css` defining `--font-display`, `--font-mono`, `--font-ui` on `:root` (same names as `layout.tsx`); `Launch(props: LaunchProps)` that renders `<AbsoluteFill style={{ background: 'var(--bg)' }}>` with one placeholder `<Sequence>` per scene (Task 6.2 fills `timeline`; until then a single full-length sequence showing the composition id in `Mono`).

- [ ] **Step 1: Install and pin**

Run: `cd /home/yks/Projects/luminar/web && npm view remotion@4.0.538 version && npm view zod@3 version` → prints `4.0.538` and the zod 3 version to pin.
Run: `npm i -E remotion@4.0.538 @remotion/player@4.0.538 zod@<that> && npm i -DE @remotion/cli@4.0.538` → lockfile updated, no peer warnings about React 19.

- [ ] **Step 2: Config and entry**

`web/remotion.config.ts`: `Config.setEntryPoint('./remotion/index.ts'); Config.setPublicDir('./public'); Config.setVideoImageFormat('jpeg'); Config.setOverwriteOutput(true);` (`Config.setChromiumOpenGlRenderer('angle')` is added in Task 6.14 only if a 1080p frame takes > 150 ms). `web/remotion/index.ts`: `import './fonts.css'; import '../app/globals.css'; registerRoot(Root)`.

- [ ] **Step 3: `props.ts`, `Root.tsx`, `fonts.css`, `Launch.tsx` per A.22**

`fonts.css`: six `@font-face` rules with `src: url('../public/fonts/<file>.woff2') format('woff2')` (relative paths, bundled by Remotion's webpack; `/fonts/...` absolute URLs do **not** resolve under Remotion's `/public/` prefix) and `:root { --font-display: 'Instrument Serif', serif; --font-mono: 'IBM Plex Mono', monospace; --font-ui: 'Manrope', sans-serif }`. `Launch.tsx`: `const h = delayRender('fonts'); document.fonts.ready.then(() => continueRender(h))` in a `useEffect` once.

- [ ] **Step 4: Scripts, ignore, lint, Makefile**

`package.json`: `"studio": "remotion studio"`, `"video": "remotion render LaunchWide video-out/luminar-16x9.mp4 --codec h264 --crf 18 && remotion render LaunchTall video-out/luminar-9x16.mp4 --codec h264 --crf 18 && remotion still LaunchWide video-out/cover.png --frame 1620 && remotion render LaunchWide public/video/launch-16x9.mp4 --codec h264 --crf 28 --scale 0.6667 && remotion still LaunchWide public/video/poster.png --frame 1620"` (crf 28 is the starting value; Task 6.14 tunes it under the 12 MB cap). `web/.gitignore` += `video-out/`. `Makefile` += `web-video: cd web && npm run video`.

- [ ] **Step 5: Verify**

Run: `cd web && npx remotion compositions` → two lines: `LaunchWide 1920x1080 30fps 1710 frames` and `LaunchTall 1080x1920 30fps 1440 frames` (format as the CLI prints it).
Run: `npx remotion still LaunchWide /tmp/claude-1000/-home-yks-Projects-luminar/344950f1-b57c-4874-90b3-764debeb2b83/scratchpad/f0.png --frame 0` → PNG exists; open it with Read: near-black `#0b0b0d` field, placeholder text in IBM Plex Mono (serifs absent, slab terminals present = the font loaded, not a fallback).
Run: `npx tsc --noEmit && npm run lint && npx vitest run && npm run build` → green; `grep -r "fonts.googleapis\|fontshare" web/remotion` → empty.

- [ ] **Step 6: Commit**

```bash
git add web/package.json web/package-lock.json web/remotion.config.ts web/remotion web/.gitignore web/eslint.config.mjs Makefile
git commit -m "feat(web): Remotion scaffold with LaunchWide/LaunchTall compositions and self-hosted fonts"
```

### Task 6.2: Timeline — scene spans and frame ↔ sim-time maths

**Files:**
- Create: `web/remotion/timeline.ts`
- Modify: `web/remotion/Launch.tsx` (one `<Sequence from durationInFrames name={span.id}>` per `timeline[orientation]` entry; placeholder content = scene id)
- Test: `web/remotion/timeline.test.ts`

**Interfaces:**
- Produces: A.22 `SceneId`, `SceneSpan`, `timeline`, `SAFE_TALL = { top: 220, bottom: 320 }`; plus `FPS`, `SIZE`, `sceneAt`, `simTimeAt`, `frameForSimTime` (signatures in the table above).

Values (storyboard tables; `simOffset` in sim seconds, `speed` default 1):

| id | wide from/dur | tall from/dur | simOffset | speed |
|---|---|---|---|---|
| cold-open | 0 / 75 | 0 / 75 | — | |
| title | 75 / 165 | 75 / 135 | — | |
| healthy | 240 / 240 | 210 / 210 | 4.0 | |
| sybils | 480 / 180 | 420 / 150 | 9.5 | |
| pruned | 660 / 180 | 570 / 180 | 11.4 | 0.6 |
| eclipse | 840 / 270 | 750 / 240 | 15.5 | |
| heal | 1110 / 120 | 990 / 120 | 23.6 | |
| same-names | 1230 / 180 | 1110 / 120 | — | |
| mainnet | 1410 / 90 | (absent) | — | |
| honesty | 1500 / 90 | 1230 / 90 | — | |
| end | 1590 / 120 | 1320 / 120 | — | |

- [ ] **Step 1: Write the failing tests**

```ts
test('spans tile the composition exactly, in order, with no gaps', () => {
  for (const o of ['wide', 'tall'] as const) {
    const spans = timeline[o]; let cursor = 0
    for (const s of spans) { expect(s.from).toBe(cursor); cursor += s.durationInFrames }
    expect(cursor).toBe(SIZE[o].durationInFrames)
  }
  expect(timeline.wide.map(s => s.id)).toEqual(['cold-open','title','healthy','sybils','pruned','eclipse','heal','same-names','mainnet','honesty','end'])
  expect(timeline.tall.find(s => s.id === 'mainnet')).toBeUndefined()
})
test('frame ↔ sim time at the reel\'s phase marks', () => {
  const w = (id: SceneId) => timeline.wide.find(s => s.id === id)!
  expect(simTimeAt(w('pruned'), 25)).toBeCloseTo(11.9, 5)              // 0.6× slow motion
  expect(frameForSimTime(w('pruned'), 11.9)).toBe(685)                   // the storyboard's "≈ frame 685"
  expect(frameForSimTime(w('healthy'), 5.8)).toBe(294)
  expect(frameForSimTime(w('sybils'), 10.2)).toBe(501)
  expect(frameForSimTime(w('eclipse'), 16.2)).toBe(861)
  expect(frameForSimTime(w('eclipse'), 16.9)).toBe(882)
  expect(frameForSimTime(w('heal'), 24.1)).toBe(1125)
  const t = (id: SceneId) => timeline.tall.find(s => s.id === id)!
  expect(frameForSimTime(t('pruned'), 11.9)).toBe(595)
  expect(sceneAt('wide', 685)?.id).toBe('pruned'); expect(sceneAt('wide', 1710)).toBeUndefined()
  expect(SAFE_TALL).toEqual({ top: 220, bottom: 320 }); expect(FPS).toBe(30)
})
```

- [ ] **Step 2: Run to verify failure**

Run: `cd web && npx vitest run remotion/timeline.test.ts` → FAIL (module not found).

- [ ] **Step 3: Implement `timeline.ts`** with the table above as data and the three functions; wire `Launch.tsx` to it.

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run remotion/timeline.test.ts` → PASS (2 tests). `npx remotion studio` → the timeline panel shows 11 named sequences for `LaunchWide`, 10 for `LaunchTall`.

- [ ] **Step 5: Commit**

```bash
git add web/remotion/timeline.ts web/remotion/timeline.test.ts web/remotion/Launch.tsx
git commit -m "feat(web): video timeline with per-orientation scene spans and sim-time mapping"
```

### Task 6.3: Reel parser and `useReel`

**Files:**
- Create: `web/remotion/reel/parse.ts`, `web/remotion/reel/useReel.ts`
- Test: `web/remotion/reel/parse.test.ts`
- Requires: `web/public/reels/sybil-eclipse.jsonl` (phase 4 copy; if missing, `cp frontend/public/reels/sybil-eclipse.jsonl web/public/reels/` and add `!web/public/reels/*.jsonl` to the root `.gitignore`, which currently ignores `*.jsonl` except `frontend/public/reels/`); `web/lib/reel-stats.json` (interfaces Task 11).

**Interfaces:**
- Consumes: A.2 `NodeState`, `AppEvent`, `SnapshotFrame`, `AnalyticsFrame`, `EdgesFrame`; A.3 `isAttackerId`.
- Produces:

```ts
export interface ReelNode { id: string; index: number; x: number; y: number; attacker: boolean; firstSeenT: number; lastSeenT: number }
  // x,y from the first snapshot containing the node (frozen layout); attackers from their first snapshot;
  // firstSeenT = min(first snapshot time containing it, `at` of the first event naming it as peer_id/from_peer/to_peer) — a Sybil is GRAFTed at 10.2 but first snapshotted at 10.4; lastSeenT = last snapshot time containing it
export interface ReelSnapshot { time: number; states: Record<string, NodeState>; scores: Record<string, number>; connected: Record<string, string[]>; mesh: Record<string, string[]> }
export interface ReelMessage { at: number; from: string; to: string; latencyMs: number; via: 'mesh' | 'iwant' | 'spam'; hops: number; spam: boolean }   // to !== '' only; spam = isAttackerId(from)
export interface ReelData {
  nodes: ReelNode[]; byId: Map<string, ReelNode>; edges: [string, string][]
  snapshots: ReelSnapshot[]; messages: ReelMessage[]
  grafts: { at: number; from: string; to: string }[]; prunes: { at: number; from: string; to: string; reason?: string }[]
  phases: { at: number; label: string }[]; faults: { at: number; type: string; target?: string; n?: number }[]; cleared: { at: number; type: string }[]
  analytics: { time: number; delivery: number; hops: number; propagationMs: number; total: number }[]   // time = latest snapshot.time ≤ the frame's t; delivery = recent_delivery_ratio
  durationSim: number
}
export function parseReel(text: string): ReelData              // malformed lines skipped; arrays sorted by at/time
export function snapshotAt(d: ReelData, simTime: number): ReelSnapshot      // last with time ≤ simTime, else snapshots[0]
export function analyticsAt(d: ReelData, simTime: number): ReelData['analytics'][number] | null   // last with time ≤ simTime and total > 0
// useReel.ts
export function useReel(reel: string): ReelData | null         // fetch(staticFile(reel)) → parseReel under delayRender/continueRender; module-level cache keyed by reel
```

- [ ] **Step 1: Write the failing tests** (reads the real reel and `lib/reel-stats.json` once)

```ts
const d = parseReel(readFileSync(join(__dirname, '../../public/reels/sybil-eclipse.jsonl'), 'utf8'))
const stats = JSON.parse(readFileSync(join(__dirname, '../../lib/reel-stats.json'), 'utf8'))
test('nodes, edges and attackers come from the snapshots', () => {
  expect(d.nodes.filter(n => !n.attacker)).toHaveLength(50); expect(d.nodes.filter(n => n.attacker).map(n => n.id).sort()).toEqual(['eclipse-0','eclipse-1','eclipse-2','eclipse-3','sybil-0','sybil-1','sybil-2','sybil-3','sybil-4'])
  expect(d.byId.get('sybil-0')!.firstSeenT).toBeCloseTo(10.2, 1); expect(d.byId.get('sybil-0')!.lastSeenT).toBeCloseTo(23.9, 1)
  expect(d.edges.length).toBeGreaterThan(50); expect(d.durationSim).toBeCloseTo(39.5, 1)
  const n0 = d.byId.get('peer-0')!; expect(n0.x).toBeCloseTo(-62.1, 1); expect(n0.y).toBeCloseTo(294.7, 1)
})
test('events agree with reel-stats.json (two derivations, same numbers)', () => {
  expect(d.prunes.filter(p => p.reason === 'score' && p.to.startsWith('sybil-'))).toHaveLength(20)
  expect(d.prunes.find(p => p.reason === 'score')!.at).toBeCloseTo(stats.firstScorePruneAt, 1)
  expect(d.faults.find(f => f.type === 'sybil')!.at).toBeCloseTo(stats.sybilAt, 1); expect(d.faults.find(f => f.type === 'sybil')!.n).toBe(5)
  expect(d.faults.find(f => f.type === 'eclipse')!.target).toBe('peer-10'); expect(d.cleared[0].at).toBeCloseTo(stats.clearedAt, 1)
  expect(d.phases.map(p => p.label)).toEqual(['Sybil attack: 5 attackers graft in', 'Eclipse on peer-10'])
  expect(d.messages.filter(m => m.spam)).toHaveLength(40); expect(d.messages.filter(m => m.via === 'iwant')).toHaveLength(158); expect(d.messages.every(m => m.to !== '')).toBe(true)
})
test('analytics carry snapshot sim time, not wall time', () => {
  const first = d.analytics.find(a => a.total > 0)!
  expect(first.time).toBeCloseTo(7.4, 1); expect(first.delivery).toBe(1); expect(first.hops).toBeCloseTo(4.2, 1); expect(first.propagationMs).toBe(100)
  expect(Math.round(first.delivery * 100)).toBe(stats.deliveryPct); expect(first.hops).toBeCloseTo(stats.avgHops, 1); expect(first.propagationMs).toBe(stats.avgPropagationMs)
  expect(analyticsAt(d, 7.3)).toBeNull(); expect(analyticsAt(d, 7.4)!.time).toBeCloseTo(7.4, 1)
  expect(snapshotAt(d, 12.5).scores['sybil-0']).toBe(-15); expect(snapshotAt(d, 11.5).scores['sybil-0']).toBeCloseTo(-9.4, 2)
  expect(snapshotAt(d, 16.9).mesh['peer-10']).toEqual(['eclipse-0','eclipse-1','eclipse-2','eclipse-3'])
  expect(snapshotAt(d, 18).scores['eclipse-0']).toBeCloseTo(0.85, 2)   // P1 creeps up; the eclipse score is never negative in this recording
})
```

- [ ] **Step 2: Run to verify failure** → FAIL.
- [ ] **Step 3: Implement `parse.ts` and `useReel.ts`** per the interfaces (one pass over the lines; `firstSeenT`/`lastSeenT` updated per snapshot; `useReel` keeps `{ [reel]: Promise<ReelData> }` at module scope so Studio re-renders do not refetch 3.6 MB).
- [ ] **Step 4: Run to verify pass** → `npx vitest run remotion/reel` PASS (3 tests, < 2 s).
- [ ] **Step 5: Commit**

```bash
git add web/remotion/reel
git commit -m "feat(web): reel JSONL parser for the video, cross-checked against reel-stats.json"
```

### Task 6.4: View maths and the per-frame `Dither` layer

**Files:**
- Create: `web/remotion/mesh/view.ts`, `web/remotion/layers/Dither.tsx`
- Test: `web/remotion/mesh/view.test.ts`

**Interfaces:**
- Consumes: A.19 `ditherImageData`, `PAPER`, `PITCH`, `DITHER_CONTRAST`, `RawImage`.
- Produces:

```ts
// mesh/view.ts
export interface Box { x: number; y: number; w: number; h: number }
export interface Camera { scale: number; focus?: string }         // scale 1 = whole mesh fits the box with pad; focus = peer id the scale is about (default: box centre)
export type Projector = (x: number, y: number) => [number, number]
export function makeProjector(d: ReelData, box: Box, cam: Camera, pad = 40): Projector
  // fit the honest nodes' bbox into box−pad preserving aspect (uniform k), centre it; then scale about the focus node's projected point (or box centre) by cam.scale
export function lerpCamera(a: Camera, b: Camera, t: number): Camera     // scale lerp; focus switches at t ≥ .5
// layers/Dither.tsx
export function Dither(props: { width: number; height: number; cell: number; draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void; style?: React.CSSProperties }): JSX.Element
  // useLayoutEffect on [frame, width, height, cell, draw]: offscreen canvas ceil(w/cell)×ceil(h/cell), ctx.scale(1/cell), props.draw; getImageData → ditherImageData(img, 1, {paper: PAPER, pitch: PITCH}, {contrast: DITHER_CONTRAST}) → paint cell squares (paper) over a pitch fill on the visible canvas (width×height, image-rendering: pixelated). Synchronous, deterministic per frame; no delayRender needed.
```

- [ ] **Step 1: Write the failing tests**

```ts
const d = parseReel(readFileSync(join(__dirname, '../../public/reels/sybil-eclipse.jsonl'), 'utf8'))
test('scale 1 fits every honest node inside the padded box', () => {
  const box = { x: 0, y: 0, w: 1920, h: 1080 }; const p = makeProjector(d, box, { scale: 1 })
  for (const n of d.nodes.filter(n => !n.attacker)) { const [x, y] = p(n.x, n.y); expect(x).toBeGreaterThanOrEqual(40); expect(x).toBeLessThanOrEqual(1880); expect(y).toBeGreaterThanOrEqual(40); expect(y).toBeLessThanOrEqual(1040) }
  const sq = makeProjector(d, { x: 40, y: 460, w: 1000, h: 1000 }, { scale: 1 })        // the tall cut's square
  const xs = d.nodes.filter(n => !n.attacker).map(n => sq(n.x, n.y)[0]); expect(Math.min(...xs)).toBeGreaterThanOrEqual(80); expect(Math.max(...xs)).toBeLessThanOrEqual(1000)
})
test('focus node is the fixed point of the camera scale', () => {
  const box = { x: 0, y: 0, w: 1920, h: 1080 }; const f = d.byId.get('peer-22')!
  const a = makeProjector(d, box, { scale: 1, focus: 'peer-22' })(f.x, f.y); const b = makeProjector(d, box, { scale: 1.15, focus: 'peer-22' })(f.x, f.y)
  expect(b[0]).toBeCloseTo(a[0], 6); expect(b[1]).toBeCloseTo(a[1], 6)
  expect(lerpCamera({ scale: 1 }, { scale: 1.08, focus: 'peer-22' }, 0.5).scale).toBeCloseTo(1.04)
})
```

- [ ] **Step 2: Run to verify failure** → FAIL.
- [ ] **Step 3: Implement `view.ts` and `Dither.tsx`** per the interfaces.
- [ ] **Step 4: Run to verify pass** → `npx vitest run remotion/mesh/view.test.ts` PASS. Visual: temporarily point scene `cold-open`'s placeholder at `<Dither cell={3} draw={(ctx,w,h) => { ctx.fillStyle = '#888'; ctx.fillRect(0,0,w,h) }}/>`; `npx remotion still LaunchWide <scratchpad>/grey.png --frame 10` → Read the PNG: a uniform ~50 % Bayer checker of 3 px paper cells on pitch, no blur (zoom shows square cells).
- [ ] **Step 5: Commit**

```bash
git add web/remotion/mesh/view.ts web/remotion/mesh/view.test.ts web/remotion/layers/Dither.tsx
git commit -m "feat(web): video projector maths and deterministic per-frame Bayer dither layer"
```

### Task 6.5: Mesh footage — paper layer, particles, attackers

**Files:**
- Create: `web/remotion/mesh/particles.ts`, `web/remotion/mesh/attackers.ts`, `web/remotion/mesh/drawMesh.ts`, `web/remotion/mesh/Mesh.tsx`, `web/remotion/mesh/Attackers.tsx`
- Test: `web/remotion/mesh/particles.test.ts`, `web/remotion/mesh/attackers.test.ts`

**Interfaces:**
- Consumes: Task 6.3 `ReelData`, `snapshotAt`; Task 6.4 `Projector`, `Dither`; A.20 `Diamond`, `Reticle`; A.15 `scoreBand`, `BAND_DENSITY`; A.19 `bayer`.
- Produces:

```ts
// mesh/particles.ts
export const PARTICLE_MIN_MS = 400
export interface Particle { from: string; to: string; progress: number /* 0..1 */; kind: 'message' | 'spam' | 'iwant' }
export function activeParticles(d: ReelData, simTime: number, opts?: { attackers?: boolean /* default true */ }): Particle[]
  // messages with at ≤ simTime < at + max(latencyMs, PARTICLE_MIN_MS)/1000; kind spam when m.spam, iwant when via === 'iwant'; attackers:false drops spam and any particle touching an attacker id
// mesh/attackers.ts
export interface AttackerView { id: string; x: number; y: number; pruned: boolean; fading: number /* 0..1 opacity, 1 until cleared, → 0 over FADE_S */; victims: string[] }
export const FADE_S = 10 / 30
export function attackersAt(d: ReelData, simTime: number): AttackerView[]
  // present when firstSeenT ≤ simTime < cleared.at + FADE_S (cleared = first `cleared` entry after firstSeenT); pruned when the attacker has a prune event (to === id) with at ≤ simTime; victims = connected from snapshotAt before the prune, else last_targets-like: the froms of its prune events
export interface AttackEdge { from: string /* honest */; to: string /* attacker */; since: number; prunedAt?: number }
export function attackEdgesAt(d: ReelData, simTime: number): AttackEdge[]
  // one per GRAFT event (honest→attacker or attacker→honest, normalised) with at ≤ simTime; prunedAt from the matching PRUNE; still returned for 6 frames (0.2 s) after prunedAt so the erase wipe can draw
// mesh/drawMesh.ts — the PAPER layer only (what gets dithered)
export interface MeshStyle { nodeR: number /* 7 */; edgeAlpha: number /* .4 */; meshAlpha: number /* .55 */; intensity: number /* 0..1, globalAlpha of the whole layer */; field?: number /* 0..1, flat paper wash under everything (cold open noise) */ }
export function drawMesh(ctx: CanvasRenderingContext2D, d: ReelData, p: Projector, simTime: number, s: MeshStyle, opts?: { attackers?: boolean; flashUntil?: Record<string, number> }): void
  // topology edges 1 px paper edgeAlpha; mesh edges (snapshotAt.mesh, honest pairs deduped) 1.5 px paper meshAlpha; honest nodes: disc nodeR, state ≠ idle → filled, idle → rim only; node that received in the last 6 frames → nodeR+3 filled (flash); score halo: annulus 1.7 r whose fill alpha = BAND_DENSITY[scoreBand(score)] (flame band 0 is NOT drawn here — it goes to Attackers.tsx); particles kind 'message'/'iwant' as 4 px squares (iwant dashed: 2 px on/off along the path)
// mesh/Mesh.tsx
export function Mesh(props: { data: ReelData; box: Box; camera: Camera; simTime: number; cell?: number /* 3 */; style?: Partial<MeshStyle>; showAttackers?: boolean /* true */; cursor?: { peer: string; click?: boolean } }): JSX.Element
  // <Dither width height cell draw={drawMesh…}/> then, as siblings above it (flat, never dithered): <Attackers/> and, when cursor is set, <Reticle size={14}/> positioned on that peer (one-frame invert when click)
// mesh/Attackers.tsx
export function Attackers(props: { data: ReelData; p: Projector; simTime: number; box: Box }): JSX.Element
  // SVG: attack edges flame .55 dashed 4/3 (prunedAt: flame 1.0 flash for 3 frames then a wipe to 0 length over 6 frames); grafted attacker = <Diamond size={16}/> flame with hatch; pruned = <Diamond pruned/> hollow dashed; spam particles 3 px flame squares with one trailing cell; negative-score honest halo (scoreBand 0) as a flame annulus at .12; opacity = fading
```

- [ ] **Step 1: Write the failing tests**

```ts
const d = parseReel(readFileSync(join(__dirname, '../../public/reels/sybil-eclipse.jsonl'), 'utf8'))
test('publish wave at T+5.8: nothing before it, 52 squares (14 from peer-22) at T+6.0', () => {
  expect(activeParticles(d, 5.79)).toHaveLength(0)
  const ps = activeParticles(d, 6.0); expect(ps).toHaveLength(52); expect(ps.filter(p => p.from === 'peer-22')).toHaveLength(14)
  expect(ps.every(p => p.kind === 'message' && p.progress >= 0 && p.progress <= 1)).toBe(true)
})
test('spam leaves the Sybils at T+11.0; scene 3 can hide it; the IWANT pull reaches peer-10 at T+16.9', () => {
  expect(activeParticles(d, 11.05).some(p => p.kind === 'spam')).toBe(true)
  expect(activeParticles(d, 11.05, { attackers: false }).some(p => p.kind === 'spam')).toBe(false)
  expect(activeParticles(d, 16.95).some(p => p.kind === 'iwant' && p.to === 'peer-10')).toBe(true)
  expect(PARTICLE_MIN_MS).toBe(400)
})
test('attackers: five grafted at T+10.2, all pruned at T+11.9, fading after T+24.1, gone after T+24.5', () => {
  expect(attackersAt(d, 10.0)).toHaveLength(0); expect(attackersAt(d, 10.25)).toHaveLength(5)
  const a = attackersAt(d, 11.0); expect(a).toHaveLength(5); expect(a.every(x => !x.pruned && x.fading === 1)).toBe(true); expect(a.find(x => x.id === 'sybil-0')!.victims.length).toBeGreaterThanOrEqual(3)
  expect(attackersAt(d, 11.85).every(x => !x.pruned)).toBe(true); expect(attackersAt(d, 11.95).every(x => x.pruned)).toBe(true)
  expect(attackersAt(d, 16.3)).toHaveLength(9); expect(attackersAt(d, 16.3).filter(x => x.id.startsWith('eclipse-')).every(x => !x.pruned)).toBe(true)
  const fading = attackersAt(d, 24.2); expect(fading).toHaveLength(9); expect(fading[0].fading).toBeGreaterThan(0); expect(fading[0].fading).toBeLessThan(1)
  expect(attackersAt(d, 24.6)).toHaveLength(0)
})
test('attack edges live from GRAFT to PRUNE and linger 0.2 s for the wipe', () => {
  expect(attackEdgesAt(d, 10.3).filter(e => e.to.startsWith('sybil-')).length).toBeGreaterThanOrEqual(5)
  const e = attackEdgesAt(d, 12.0).find(e => e.from === 'peer-42' && e.to === 'sybil-3')!; expect(e.prunedAt).toBeCloseTo(11.9, 1)
  expect(attackEdgesAt(d, 12.2).find(e => e.from === 'peer-42' && e.to === 'sybil-3')).toBeUndefined()
  expect(attackEdgesAt(d, 16.3).filter(e => e.from === 'peer-10' && e.to.startsWith('eclipse-'))).toHaveLength(4)
})
```

- [ ] **Step 2: Run to verify failure** → FAIL.
- [ ] **Step 3: Implement the five files** per the interfaces. `drawMesh` and `Attackers` take the same `Projector`, so the flame layer sits exactly on the dithered one.
- [ ] **Step 4: Run to verify pass** → `npx vitest run remotion/mesh` PASS. Visual: point the `healthy` placeholder at `<Mesh data box={{x:0,y:0,w:1920,h:1080}} camera={{scale:1}} simTime={simTimeAt(span, frame)}/>` and the `sybils` one likewise; run `npx remotion render LaunchWide <scratchpad>/mesh --frames=250,300,520,560 --image-format=png`; Read each: 250 = 50 paper discs + dotted edges, all 1-bit; 300 = squares leaving peer-22 and a few enlarged receivers; 520 = five flame diamonds (hatched, not dithered) with dashed flame edges to honest discs; 560 = flame 3 px squares travelling from the diamonds.
- [ ] **Step 5: Commit**

```bash
git add web/remotion/mesh
git commit -m "feat(web): video mesh footage from reel data: dithered paper layer, flat flame attackers and particles"
```

### Task 6.6: Readouts — ticker and score strip from `analytics` and `gossip_score`

**Files:**
- Create: `web/remotion/mesh/readouts.ts`, `web/remotion/mesh/Ticker.tsx`, `web/remotion/mesh/ScoreStrip.tsx`, `web/remotion/constants.ts`
- Test: `web/remotion/mesh/readouts.test.ts`, `web/remotion/constants.test.ts`

**Interfaces:**
- Consumes: Task 6.3 `analyticsAt`, `snapshotAt`; A.3 `fmtLatency`; Task 6.7 `Mono` (use a `<span style={{fontFamily:'var(--font-mono)'}}>` until 6.7 lands, then swap).
- Produces:

```ts
// constants.ts (values from backend/gossip/engine.py:33-37, scoring.py; Lighthouse column from docs/roadmap-devcon8.md:29)
export const TOY = { d: 6, pruneThreshold: -10, heartbeatS: 1.0, terms: 'P1–P4' } as const
export const LIGHTHOUSE = { d: 8, thresholds: '−4000 / −8000 / −16000', heartbeatS: 0.7, terms: 'P1–P7' } as const
export const SERIES = ['gossipsub_mesh_peer_churn_events','gossipsub_mesh_peer_counts','gossipsub_mesh_peer_inclusion_events','gossipsub_score_per_mesh','gossipsub_topic_iwant_msgs','gossipsub_topic_msg_published','gossipsub_topic_msg_recv_counts'] as const
// readouts.ts
export function tickerAt(d: ReelData, simTime: number): { delivery: number; hops: number; ms: number } | null   // from analyticsAt; null before the first message
export function invalidCountAt(d: ReelData, simTime: number): number        // messages with spam && at ≤ simTime
export function scoreAt(d: ReelData, peer: string, simTime: number): number | null   // snapshotAt(...).scores[peer] ?? null (step, like the inspector)
export function healedInS(d: ReelData): number | null                       // first analytics.time with delivery ≥ .95 after cleared[0].at, minus cleared[0].at, rounded .1
export function fmtTicker(t: ReturnType<typeof tickerAt>, extra?: { invalid?: number; healedIn?: number | null }): string[]
  // ['delivery 100 %', 'hops 4.2', '100 ms'] (+ 'invalid 40' when extra.invalid ≥ 1, + 'healed in 1.4 s' when extra.healedIn) ; '—' triple when null
// Ticker.tsx
export function Ticker(props: { data: ReelData; simTime: number; orientation: Orientation; invalid?: boolean; healed?: boolean; style?: CSSProperties }): JSX.Element
  // wide: one line bottom-left, IBM Plex Mono 500 28 px tabular, items joined by ' · '; tall: 3-line stack top-left under SAFE_TALL.top; the 'invalid' item in --flame
// ScoreStrip.tsx
export function ScoreStrip(props: { data: ReelData; peer: string; simTime: number; orientation: Orientation; width: number; flat?: boolean }): JSX.Element
  // mono label `${peer}  ${signed(score)}`; bar from 0 toward min(score, −20)/−20 of width; bar --flame when score < 0 else --paper-1; dotted line at TOY.pruneThreshold labelled `prune ${TOY.pruneThreshold}`; flat → second line = `ECLIPSE_WHY` from lib/copy.ts (the storyboard's `P4 0 · P3 −0.25 floor` is not what this recording shows: eclipse-0's score climbs +0.1 → +1.6 through P1 and never goes negative, so the strip shows that real climb and the sentence explains why P4 never fires). Height 60 (wide) / 140 (tall). Text never dithered.
```

- [ ] **Step 1: Write the failing tests**

```ts
const d = parseReel(readFileSync(join(__dirname, '../../public/reels/sybil-eclipse.jsonl'), 'utf8'))
test('ticker numbers are the reel\'s own', () => {
  expect(tickerAt(d, 7.3)).toBeNull(); expect(tickerAt(d, 7.4)).toEqual({ delivery: 1, hops: 4.2, ms: 100 })
  expect(fmtTicker(tickerAt(d, 7.4))).toEqual(['delivery 100 %', 'hops 4.2', '100 ms']); expect(fmtTicker(null)).toEqual(['delivery —', 'hops —', '— ms'])
  expect(invalidCountAt(d, 10.9)).toBe(0); expect(invalidCountAt(d, 11.1)).toBeGreaterThan(0); expect(invalidCountAt(d, 12.0)).toBe(40)
  expect(healedInS(d)).toBeCloseTo(1.4, 1); expect(fmtTicker(tickerAt(d, 25.5), { healedIn: healedInS(d) })).toContain('healed in 1.4 s')
})
test('score strip steps on snapshots: +0.1 → −9.4 → −15 for sybil-0; eclipse-0 climbs and never goes negative', () => {
  expect(scoreAt(d, 'sybil-0', 10.5)).toBeCloseTo(0.1); expect(scoreAt(d, 'sybil-0', 11.5)).toBeCloseTo(-9.4); expect(scoreAt(d, 'sybil-0', 12.5)).toBe(-15)
  expect(scoreAt(d, 'eclipse-0', 18)).toBeCloseTo(0.85, 2); expect(scoreAt(d, 'eclipse-0', 16.5)).toBeCloseTo(0.1, 2); expect(scoreAt(d, 'eclipse-0', 24)).toBeGreaterThan(0)
  for (let t = 16.4; t <= 24; t += 0.5) expect(scoreAt(d, 'eclipse-0', t)!).toBeGreaterThanOrEqual(0)
  expect(scoreAt(d, 'nobody', 18)).toBeNull()
})
// constants.test.ts — the honesty card cannot drift from the engine
test('toy constants match backend/gossip/engine.py and the seven series exist in the backend', () => {
  const eng = readFileSync(join(__dirname, '../../backend/gossip/engine.py'), 'utf8')
  expect(eng).toMatch(new RegExp(`^D = ${TOY.d}\\b`, 'm')); expect(eng).toMatch(new RegExp(`^SCORE_THRESHOLD_PRUNE = ${TOY.pruneThreshold}\\.0`, 'm')); expect(eng).toMatch(new RegExp(`^HEARTBEAT_INTERVAL = ${TOY.heartbeatS.toFixed(1)}`, 'm'))
  const backend = execSync('grep -rho "gossipsub_[a-z_]*" ../backend', { encoding: 'utf8' })
  for (const s of SERIES) expect(backend).toContain(s)
  expect(SERIES).toHaveLength(7)
})
```

- [ ] **Step 2: Run to verify failure** → FAIL.
- [ ] **Step 3: Implement** `constants.ts`, `readouts.ts`, `Ticker.tsx`, `ScoreStrip.tsx` per the interfaces.
- [ ] **Step 4: Run to verify pass** → `npx vitest run remotion/mesh/readouts.test.ts remotion/constants.test.ts` PASS.
- [ ] **Step 5: Commit**

```bash
git add web/remotion/mesh/readouts.ts web/remotion/mesh/readouts.test.ts web/remotion/mesh/Ticker.tsx web/remotion/mesh/ScoreStrip.tsx web/remotion/constants.ts web/remotion/constants.test.ts
git commit -m "feat(web): video ticker and score strip read analytics and gossip_score from the reel"
```

### Task 6.7: Type components, parallax, per-scene layout tables, all video copy

**Files:**
- Create: `web/remotion/type/Fig.tsx`, `web/remotion/type/Mono.tsx`, `web/remotion/type/StampIn.tsx`, `web/remotion/type/Headline.tsx`, `web/remotion/layers/Parallax.tsx`, `web/remotion/scenes/types.ts`, `web/remotion/scenes/layout.ts`, `web/remotion/scenes/copy.ts`
- Test: `web/remotion/scenes/layout.test.ts`, `web/remotion/scenes/copy.test.ts`

**Interfaces:**
- Consumes: A.20 `Stamp` (`components/dither/Stamp.tsx`), A.4 `MECHANISM`, `ARRIVAL`, `PROVENANCE`, `SAME_NAMES`, `EVENT_LINE`, `REPO_URL`, `FORBIDDEN`; Task 6.2 `SAFE_TALL`, `SIZE`.
- Produces:

```ts
// scenes/types.ts
export interface SceneProps { data: ReelData; orientation: Orientation; span: SceneSpan }   // every scene: export default function Scene(props: SceneProps)
// scenes/layout.ts
export type Anchor = 'tl' | 'tr' | 'bl' | 'br' | 'c'
export interface SceneLayout { mesh?: Box; stamp: { anchor: Anchor; inset: [number, number] }; caption?: Box; readout?: Box; strip?: Box; headlinePx?: number; monoPx?: number; cell: number }
export const LAYOUT: Record<SceneId, Record<Orientation, SceneLayout>>
  // wide: mesh {0,0,1920,1080} (scenes 1,3–7,11 ghost), caption bottom-right {1180,940,700,100}, readout bottom-left {64,980,900,60}, strip {…under focus node, 420×60}, headlinePx 96, monoPx 28, cell 3
  // tall: mesh {40,460,1000,1000} (the 1000 px square, vertically centred), caption {60,1500,960,100} (just above SAFE_TALL.bottom = 1600), readout {60,240,960,120} (under SAFE_TALL.top), strip {40,1470,1000,140} (below the square, full width), headlinePx 72, monoPx 44 (honesty) / 36 (ticker), cell 3; scene 8 one card {40,560,1000,600}; scene 11 wordmark 120, URL two lines
export function boxes(l: SceneLayout): Box[]                     // every Box in a layout (for the safe-zone test)
// scenes/copy.ts — every string the video shows, once
export const HEADLINE: Record<Orientation, string[]>   // wide ['libp2p GossipSub v1.1.', 'Run live. Broken on purpose.'] · tall ['libp2p GossipSub v1.1.', 'Run live.', 'Broken on purpose.']; line 2 (wide) / line 3 (tall) italic
export const STAMP: Record<SceneId, string>            // cold-open 'LUMINAR' · title '' · healthy 'FLOOD PUBLISH' · sybils 'FIVE SYBILS' · pruned 'PRUNED BY SCORE' · eclipse 'SCORING CANNOT SEE THIS' · heal 'HEALED' · same-names 'OPENTELEMETRY OUT' · mainnet '' · honesty 'TOY CONSTANTS' · end 'BREAK IT YOURSELF'
export const STAMP_TILT: Record<SceneId, number>       // 3, 0, −2, 3, −2, 3, −2, 3, 0, −2, 3
export const FIG: Partial<Record<SceneId, string>>     // title: 'Fifty peers, a mesh, and a scoring loop you can push past the prune threshold.' · healthy: `One publish, every peer, in four hops. ${MECHANISM}` · pruned: 'P4, the invalid-message penalty: −10 per heartbeat of spam. One heartbeat later every honest peer had pruned them; nobody coordinated it.' · eclipse: 'Four silent attackers. No invalid messages, so no P4. Only a P3 deficit, floored at −0.25. The mesh never reacts; peer-10 lives on gossip pulls, a heartbeat late.' · heal: 'Faults cleared; the mesh re-grafts and delivery is back within two heartbeats.' · same-names: `Seven of ${SAME_NAMES}, so the same dashboard queries work on both. Not the same numbers.` · mainnet: `Real mainnet: one slot's block, ${ARRIVAL}. ${PROVENANCE}`
export const FIG_N: Partial<Record<SceneId, number>>   // title 1 · healthy 2 · pruned 3 · eclipse 4 · heal 5 · same-names 6 · mainnet 7
export const HONESTY_ROWS: [label: string, luminar: string, lighthouse: string][]   // from TOY/LIGHTHOUSE: ['D', '6', '8'], ['prune threshold', '−10', '−4000 / −8000 / −16000'], ['heartbeat', '1 s', '0.7 s'], ['score', 'P1–P4', 'P1–P7']
// type/
export function Mono(props: { children: ReactNode; px?: number; dim?: boolean; flame?: boolean; style?: CSSProperties }): JSX.Element      // IBM Plex Mono 500, font-variant-numeric tabular-nums
export function Fig(props: { n: number; children: string; orientation: Orientation; box: Box; at: number /* local frame fade-in start */ }): JSX.Element   // 'Fig. N' Manrope 600 .12em + Instrument Serif italic 28 px (wide) / 30 px (tall, ≤ 2 lines); right-aligned wide, left tall; opacity interpolate [at, at+12]
export function StampIn(props: { children: string; tilt: number; anchor: Anchor; inset: [number, number]; at: number; flame?: boolean }): JSX.Element   // shared <Stamp tilt flame> scaled by spring({frame: frame−at, fps, config: {damping: 200}}) from 0 → 1 (no overshoot), hidden before at
export function Headline(props: { lines: string[]; px: number; italicLast?: boolean; at: number; stagger?: number /* 10 */ }): JSX.Element   // Instrument Serif, each line translateY 24→0 + opacity over 14 frames with stagger
// layers/Parallax.tsx
export function Parallax(props: { depth: number; pan: number; children: ReactNode; style?: CSSProperties }): JSX.Element   // translateY(depth × pan px)
```

- [ ] **Step 1: Write the failing tests**

```ts
test('every tall layout box stays outside the Reels/Shorts safe zones', () => {
  for (const id of Object.keys(LAYOUT) as SceneId[]) for (const b of boxes(LAYOUT[id].tall)) {
    expect(b.y, `${id} top`).toBeGreaterThanOrEqual(SAFE_TALL.top); expect(b.y + b.h, `${id} bottom`).toBeLessThanOrEqual(SIZE.tall.height - SAFE_TALL.bottom)
    expect(b.x).toBeGreaterThanOrEqual(0); expect(b.x + b.w).toBeLessThanOrEqual(SIZE.tall.width)
  }
  expect(LAYOUT.title.tall.headlinePx).toBe(72); expect(LAYOUT.title.wide.headlinePx).toBe(96); expect(LAYOUT.pruned.tall.strip!.h).toBe(140); expect(LAYOUT.honesty.tall.monoPx).toBe(44)
})
test('stamps ≤ 24 chars, copy clean, honesty rows from constants', () => {
  for (const s of Object.values(STAMP)) expect(s.length).toBeLessThanOrEqual(24)
  const all = [...Object.values(STAMP), ...Object.values(FIG), ...HEADLINE.wide, ...HEADLINE.tall, ...HONESTY_ROWS.flat()].join('\n')
  for (const f of FORBIDDEN) if (!PROVENANCE.includes(f)) expect(all).not.toContain(f)    // 'mesh path' reaches the video only inside the imported PROVENANCE
  expect(FIG.mainnet).not.toMatch(/propagation|identical/i); expect(FIG.mainnet).toContain(ARRIVAL); expect(FIG.mainnet).toContain(PROVENANCE)
  expect(HEADLINE.tall).toHaveLength(3); expect(HONESTY_ROWS).toEqual([['D', '6', '8'], ['prune threshold', '−10', '−4000 / −8000 / −16000'], ['heartbeat', '1 s', '0.7 s'], ['score', 'P1–P4', 'P1–P7']])
})
```

- [ ] **Step 2: Run to verify failure** → FAIL.
- [ ] **Step 3: Implement** the eight files per the interfaces. `Fig` and `StampIn` import `Stamp` from `@/components/dither/Stamp` unchanged (the shared component must render without `next/*`; if phase 5 gave it `"use client"`, that directive is harmless under Remotion's bundler).
- [ ] **Step 4: Run to verify pass** → `npx vitest run remotion/scenes` PASS; `npx vitest run lib/copy.test.ts` still PASS (the grep over `remotion/` finds forbidden phrases only via imports).
- [ ] **Step 5: Commit**

```bash
git add web/remotion/type web/remotion/layers/Parallax.tsx web/remotion/scenes
git commit -m "feat(web): video type components, parallax, safe-zone layout tables and all on-screen copy"
```

### Task 6.8: Scenes 1–2 — cold open and title

**Files:**
- Create: `web/remotion/scenes/01-ColdOpen.tsx`, `web/remotion/scenes/02-Title.tsx`
- Modify: `web/remotion/Launch.tsx` (`SCENES: Record<SceneId, React.FC<SceneProps>>`, `useReel(props.reel)`; renders nothing until data is non-null)
- Test: scripted stills (below)

**Interfaces:**
- Consumes: 6.4 `Dither`, 6.5 `Mesh`, `drawMesh`, 6.7 `StampIn`, `Headline`, `Fig`, `LAYOUT`, `STAMP`, `HEADLINE`, `FIG`, A.20 `HaloRing`.
- Produces: the two scene components (default exports taking `SceneProps`).

Behaviour pinned:
- **01**: `Mesh` at `simTime 0`, camera `{scale: 1}`, `style.intensity = interpolate(f, [0, 40], [0, 1], clamp)`, `style.field = interpolate(f, [0, 40], [0.02, 0], clamp)` (the 2 % Bayer noise field resolving into the mesh); one `HaloRing size={220} band={2}` lower-left at `Parallax depth .2`, drifting `pan = f × 0.05` (+2 px over the scene); `StampIn 'LUMINAR' tilt 3 at 30`. No orange shape (spec §7.4.2).
- **02**: `Mesh` held at `simTime 0` with `intensity .6` and `meshAlpha` breathing `.35 → .45` on a 90-frame sine; `Headline lines=HEADLINE[o] px=LAYOUT.title[o].headlinePx italicLast at 0 stagger 10`; a `HaloRing size={160}` behind the italic line instead of the halftone rectangle; `Fig n=1 at 75` (local; wide frame 150).

- [ ] **Step 1: Implement the two scenes and the `SCENES` map** per the pins above.
- [ ] **Step 2: Scripted stills**

Run: `cd web && npx remotion render LaunchWide <scratchpad>/s12 --frames=0,20,45,100,160,230 --image-format=png` and Read each PNG. Expected: f0 = pitch field with a sparse ~2 % paper-cell noise and no mesh; f20 = mesh half-resolved out of the noise; f45 = full 1-bit mesh, `LUMINAR` stamp fully popped (paper box, Manrope caps, tilted 3°), halo ring lower-left; f100 = headline line 1 in Instrument Serif at 96 px fully up, line 2 italic still rising; f160 = both lines, `Fig. 1` caption visible bottom-right; f230 = same, mesh edges slightly brighter than at f160 (breathing). Nothing orange anywhere in scenes 1–2.
Run: `npx remotion render LaunchTall <scratchpad>/t12 --frames=45,160 --image-format=png` → mesh inside the 1000 px square (y 460–1460), stamp in the top third below y 220, headline three lines at 72 px, caption above y 1600.

- [ ] **Step 3: Gate** → `npx tsc --noEmit && npm run lint && npx vitest run` green.
- [ ] **Step 4: Commit**

```bash
git add web/remotion/scenes/01-ColdOpen.tsx web/remotion/scenes/02-Title.tsx web/remotion/Launch.tsx
git commit -m "feat(web): video scenes 1-2, cold open resolving from Bayer noise and the serif title"
```

### Task 6.9: Scenes 3–4 — healthy mesh and the Sybil graft

**Files:**
- Create: `web/remotion/scenes/03-Healthy.tsx`, `web/remotion/scenes/04-Sybils.tsx`
- Test: scripted stills

**Interfaces:**
- Consumes: 6.2 `simTimeAt`, `frameForSimTime`; 6.5 `Mesh`; 6.6 `Ticker`; 6.7 `StampIn`, `Fig`, `Mono`, `LAYOUT`, `STAMP`, `FIG`; 6.4 `lerpCamera`.

Behaviour pinned:
- **03**: `simTime = simTimeAt(span, f)`; camera `lerpCamera({scale:1}, {scale: o==='wide' ? 1.08 : 1.12, focus:'peer-22'}, f/dur)`; `showAttackers={false}` (Review Focus 4); `Ticker` (no invalid) in `LAYOUT.healthy[o].readout`; `StampIn STAMP.healthy tilt −2 at 60` (wide frame 300); `Fig n=2`.
- **04**: camera `lerpCamera({scale: 1.08, focus:'peer-22'}, {scale: 1.15, focus: densest attacker = the sybil with most victims at T+11}, f/dur)`; `showAttackers` on; the phase label `data.phases[0].label` (`Sybil attack: 5 attackers graft in`) as a `Mono dim` bar top-left (wide) / full-width under the top safe zone (tall) — a hair-ruled paper-2 text, **no halftone slab**; `Ticker invalid` (adds `invalid N` in flame once ≥ 1); `StampIn STAMP.sybils tilt 3 at frameForSimTime(span, 10.2) − span.from`; no caption in this scene.

- [ ] **Step 1: Implement both scenes.**
- [ ] **Step 2: Scripted stills**

Run: `npx remotion render LaunchWide <scratchpad>/s34 --frames=290,300,330,470,500,505,540,600 --image-format=png`. Expected: f290 = mesh idle, ticker reads `delivery — · hops — · — ms`; f300 = squares leaving peer-22 (centre of the slight zoom), `FLOOD PUBLISH` stamp mid-pop; f330 = enlarged receivers spreading outward; f470 = ticker `delivery 100 % · hops 4.2 · 100 ms` (the reel's first analytics values; **if the ticker shows different digits, the parser or `analyticsAt` is wrong, not the storyboard**), no diamonds although sim time is 11.7; f500 = sybils scene, no diamonds yet (T+10.17); f505 = five flame diamonds scaling in with dashed flame edges, `FIVE SYBILS` stamp, phase label bar; f540 = ticker still `invalid` absent (spam starts T+11.0, frame 525 → check f540 shows `invalid` in flame with a count ≥ 1); f600 = flame 3 px squares streaming from the diamonds.

- [ ] **Step 3: Gate** → tsc/lint/vitest green.
- [ ] **Step 4: Commit**

```bash
git add web/remotion/scenes/03-Healthy.tsx web/remotion/scenes/04-Sybils.tsx
git commit -m "feat(web): video scenes 3-4, flood publish with reel ticker and the Sybil graft"
```

### Task 6.10: Scenes 5–7 — pruned by score, the eclipse, heal

**Files:**
- Create: `web/remotion/scenes/05-Pruned.tsx`, `web/remotion/scenes/06-Eclipse.tsx`, `web/remotion/scenes/07-Heal.tsx`
- Test: scripted stills (the spec's frame-685 verification lives here)

**Interfaces:**
- Consumes: 6.5 `Mesh` (`cursor` prop), `attackersAt`; 6.6 `ScoreStrip`, `Ticker`, `healedInS`; 6.7 type + layout + copy.

Behaviour pinned:
- **05** (0.6×): camera `{scale: 1.15, focus: 'sybil-0'}`; `ScoreStrip peer='sybil-0'` in `LAYOUT.pruned[o].strip` (wide: under the node; tall: full-width below the square and the node gets a 2 px flame ring instead); the first PRUNE (`frameForSimTime(span, 11.9)` = wide 685 / tall 595) triggers, via `attackEdgesAt`, the flame flash + 6-frame wipe on every honest→Sybil edge and flips the diamonds hollow; `cursor={{ peer: 'sybil-0', click: f === 40 }}` from local frame 20 (wide 680) — the `Reticle` glyph, not a crosshair sprite; `StampIn STAMP.pruned tilt −2 at frameForSimTime(span, 11.9) − span.from`; `Fig n=3`.
- **06**: camera eases `{scale: 1.15, focus:'sybil-0'} → {scale: 1.15, focus:'peer-10'}` over 60 frames; at T+16.2 peer-10's honest mesh edges disappear (they leave `snapshotAt().mesh` at the 16.4 snapshot — a step, no flash) and four hollow-style **eclipse** diamonds wire to it (grafted, flame; they never emit spam because the reel has none); `ScoreStrip peer='eclipse-0' flat` held from local frame 60 for ≥ 60 frames (the bar creeps right by +0.25 per snapshot and never turns flame — that stillness is the point); phase label `data.phases[1].label`; the T+16.9 IWANT pull renders as the dashed, slower particle to peer-10 (frame 882); `StampIn STAMP.eclipse tilt 3 at 120` (wide 960); `Fig n=4`.
- **07**: camera back to `{scale: 1}` over 30 frames; attackers fade through `fading` after T+24.1 (frame 1125); `Ticker healed` shows `healed in 1.4 s` once `simTime ≥ cleared.at + healedInS(d)` (T+25.5 is outside this scene's window T+23.6–27.6? — it is inside: 1110 + 1.9 × 30 = frame 1167); `StampIn STAMP.heal tilt −2 at 15`; `Fig n=5`.

- [ ] **Step 1: Implement the three scenes.**
- [ ] **Step 2: Scripted stills — the spec's verification**

Run: `npx remotion render LaunchWide <scratchpad>/s567 --frames=670,684,686,692,700,760,860,862,882,900,1120,1130,1170 --image-format=png`. Expected: f670 = score strip `sybil-0  −9.40` with flame bar short of the dotted `prune −10` line, five hatched diamonds with dashed edges, reticle not yet shown; f684 = reticle on sybil-0, edges intact (T+11.88); **f686 = every honest→Sybil edge flashing solid flame (T+11.92 > 11.9) — this is the "≈ frame 685" check**; f692 = edges mid-wipe, diamonds hollow/dashed, strip `−9.15` (snapshot 11.9) — the −15 step lands at T+12.4 = frame 710; f700 = one-frame inverted reticle (click), `PRUNED BY SCORE` stamp; f760 = strip `−17.50` (snapshot 13.4), no attack edges; f860 = eclipse scene, camera on peer-10, honest mesh edges still attached; f862 = four eclipse diamonds grafted, flame dashed edges to peer-10; f882 = a dashed paper particle arriving at peer-10 from peer-37, no flame particles anywhere; f900 = strip `eclipse-0  +0.60` (snapshot 17.4), bar paper-1 not flame, second line the `ECLIPSE_WHY` sentence; f1120 = heal scene, 9 diamonds still at full opacity (T+23.93); f1130 = diamonds fading (T+24.27); f1170 = diamonds gone, ticker `delivery 100 % · … · healed in 1.4 s`, `HEALED` stamp.
Then `npx remotion studio`, open `LaunchWide`, scrub 660–840 with the frame counter and confirm the erase starts on 685/686 and the strip never shows a value the reel does not contain (+0.10, +0.35, −9.40, −9.15, −15.00, −17.50, −18.75).

- [ ] **Step 3: Gate** → tsc/lint/vitest green.
- [ ] **Step 4: Commit**

```bash
git add web/remotion/scenes/05-Pruned.tsx web/remotion/scenes/06-Eclipse.tsx web/remotion/scenes/07-Heal.tsx
git commit -m "feat(web): video scenes 5-7, score prune at T+11.9, the silent eclipse and the heal"
```

### Task 6.11: Stills — capture, `DitheredStill`, scenes 8–9

**Files:**
- Create: `web/public/stills/grafana.png`, `web/public/stills/jaeger.png`, `web/public/stills/geo-wave-0.png`, `geo-wave-1.png`, `geo-wave-2.png`, `web/remotion/layers/useImage.ts`, `web/remotion/layers/DitheredStill.tsx`, `web/remotion/scenes/08-SameNames.tsx`, `web/remotion/scenes/09-Mainnet.tsx`
- Test: scripted stills

**Interfaces:**
- Consumes: 6.4 `Dither`; A.19 `coverRect`; 6.6 `SERIES`; 6.7 `Parallax`, `Fig`, `Mono`, `StampIn`, `FIG`, `STAMP`; A.20 `HaloRing`.
- Produces:

```ts
export function useImage(src: string): HTMLImageElement | null       // staticFile(src); new Image() under delayRender/continueRender; module cache
export function DitheredStill(props: { src: string; box: Box; cell?: number /* 3 */; focus?: [number, number]; border?: boolean /* 1 px paper */; style?: CSSProperties }): JSX.Element
  // <Dither draw={(ctx,w,h) => ctx.drawImage(img, ...coverRect(img.width, img.height, w, h, fx, fy), 0, 0, w, h)}/>; renders nothing until the image is loaded
```

- [ ] **Step 1: Capture**

`cp assets/readme/grafana.png assets/readme/jaeger.png web/public/stills/`. Geo frames: with a phase-4 build served (`python3 -m http.server -d web/out 9000`) open `http://localhost:9000/reels/mainnet-block-wave/?theme=stage&hero=1` at 1440×840 (chrome-devtools `resize_page` + `navigate_page`), press Space, pause ~1.5 s before a wave (the first observer dots lighting), then `take_screenshot` three times stepping `seekReelToSimTime` +1 s each (`window.__luminar` or the scrubber) → `geo-wave-0/1/2.png`. If phase 4 is not merged yet, capture the same three frames from `master`'s `frontend/` at `/?reel=mainnet-block-wave&theme=stage&hero=1` (the dither makes the two indistinguishable). PNGs ≤ 400 KB each (`magick -colors 255 PNG8:`).

- [ ] **Step 2: Implement `useImage`, `DitheredStill`, scenes 08 and 09**

**08**: wide — two `DitheredStill` cards (`grafana` depth .6 at x 120, `jaeger` depth .9 at x 1000, each 760×430, 1 px paper border) entering from ±120 px over 12 frames, `Parallax pan = f × 0.1`; under them `SERIES` typed on at 2 names/s (`Mono`, each name appears at local frame 30 + 15 i); `StampIn STAMP['same-names'] tilt 3 at 10`; `Fig n=6`. Tall — one card `LAYOUT['same-names'].tall.mesh` (the 1000×600 crop of grafana with `focus [.5, .35]`), four names (`SERIES.slice(0, 4)`).
**09** (wide only; `timeline.tall` has no span): three `DitheredStill geo-wave-k` full-frame with 30-frame cross-dissolves (opacity interpolate); one `HaloRing size={180}` over the ocean (depth .4) — not a parallelogram; `Fig n=7` = `FIG.mainnet` (two lines, the second is `PROVENANCE`).

- [ ] **Step 3: Scripted stills**

Run: `npx remotion render LaunchWide <scratchpad>/s89 --frames=1240,1300,1400,1420,1460,1495 --image-format=png`. Expected: f1240 = two cards sliding in, already 1-bit (Bayer, no grey), `OPENTELEMETRY OUT` stamp; f1300 = ~4 of 7 series names typed; f1400 = all seven names in mono; f1420 = first geo frame, world land in dither, a few observer dots, halo ring; f1460 = dissolve between frames 1→2; f1495 = third frame, caption reads `Real mainnet: one slot's block, arrival at observer nodes, ~2.5 min behind.` + the provenance line. `npx remotion render LaunchTall <scratchpad>/t8 --frames=1150,1220 --image-format=png` → one card inside y 560–1160, four names, nothing below y 1600.
Run: `grep -rn "propagation\|identical\|beacon node's scoring" web/remotion/scenes --include='*.tsx' --include='copy.ts'` → empty (the test file's regex is excluded).

- [ ] **Step 4: Gate** → tsc/lint/vitest green (`copy.test.ts` must still pass with the new scene files).
- [ ] **Step 5: Commit**

```bash
git add web/public/stills web/remotion/layers/useImage.ts web/remotion/layers/DitheredStill.tsx web/remotion/scenes/08-SameNames.tsx web/remotion/scenes/09-Mainnet.tsx
git commit -m "feat(web): video scenes 8-9, dithered Grafana/Jaeger and mainnet observer stills"
```

### Task 6.12: Scenes 10–11 — honesty card and end card

**Files:**
- Create: `web/remotion/scenes/10-Honesty.tsx`, `web/remotion/scenes/11-End.tsx`
- Test: scripted stills

**Interfaces:**
- Consumes: 6.7 `HONESTY_ROWS`, `Mono`, `StampIn`, `Headline`; 6.5 `Mesh`; 6.2 `SIZE`; A.4 `REPO_URL`, `EVENT_LINE`, `MECHANISM` (props `repoUrl`, `eventLine` from `LaunchProps` reach the scene through `Launch`; add them to `SceneProps` as `repoUrl: string; eventLine: string`).

Behaviour pinned:
- **10**: pitch field; `Headline [MECHANISM] px 56 (wide) / 44 (tall)` serif at the top of the card; two-column mono table from `HONESTY_ROWS` with header `luminar · lighthouse`, rows typing on 1 row / 8 frames at `monoPx` 28 (wide) / 44 (tall); a `HaloRing` behind the right column header instead of the halftone block; `StampIn STAMP.honesty ('TOY CONSTANTS') tilt −2 at 20` large, centred below the table.
- **11**: wordmark `LUMINAR` Manrope 600 .14em at 160 px (wide) / 120 px (tall) in paper (never flame); under it `Mono repoUrl` (tall: two lines `github.com/` / `yashksaini-coder/luminar`, ≥ 40 px); `Mono eventLine`; URL and date rise with 8-frame stagger; the T+0 mesh ghosted behind at `intensity .15`, resolving back into noise over the last 40 frames (`field` 0 → .02, `intensity` .15 → 0 on `[dur−40, dur]`); one `HaloRing` lower-left where the storyboard put the parallelogram; `StampIn STAMP.end tilt 3 anchor 'tr' at 30` (wide frame 1620).

- [ ] **Step 1: Implement both scenes and thread `repoUrl`/`eventLine` through `Launch`.**
- [ ] **Step 2: Scripted stills**

Run: `npx remotion render LaunchWide <scratchpad>/s1011 --frames=1505,1540,1589,1600,1625,1700,1709 --image-format=png`. Expected: f1505 = `Same mechanism, toy constants.` serif, header row only; f1540 = all four rows (`D 6 · 8`, `prune threshold −10 · −4000 / −8000 / −16000`, `heartbeat 1 s · 0.7 s`, `score P1–P4 · P1–P7`), `TOY CONSTANTS` stamp; f1589 = same (last frame of the scene); f1600 = `LUMINAR` wordmark, URL rising; f1625 = URL + `Devcon 8 · Mumbai · 3–6 Nov 2026`, ghost mesh behind, `BREAK IT YOURSELF` stamp top-right — **this is `cover.png`/`poster.png` territory (frame 1620): check it reads as a poster on its own**; f1700 = ghost dissolving to sparse noise; f1709 = near-pure pitch with the wordmark. Tall: `--frames=1300,1400` → table at 44 px centred, wordmark 120 px, URL on two lines, all within y 220–1600.

- [ ] **Step 3: Gate** → tsc/lint/vitest green; `cd web && npx vitest run lib/copy.test.ts remotion` PASS.
- [ ] **Step 4: Commit**

```bash
git add web/remotion/scenes/10-Honesty.tsx web/remotion/scenes/11-End.tsx web/remotion/Launch.tsx web/remotion/scenes/types.ts
git commit -m "feat(web): video scenes 10-11, honesty card from engine constants and the end card"
```

### Task 6.13: Tall cut pass — safe zones and layout deltas end to end

**Files:**
- Modify: any `web/remotion/scenes/*.tsx` or `scenes/layout.ts` value the walk below falls on (no new files)
- Test: `web/remotion/scenes/layout.test.ts` (already green) + scripted stills

**Interfaces:** none new.

- [ ] **Step 1: Full tall contact sheet**

Run: `npx remotion render LaunchTall <scratchpad>/tall --frames=40,120,260,445,595,600,771,882,1005,1150,1280,1380,1439 --image-format=png`; Read each. Expected, per the storyboard's 9:16 table: mesh always inside the 1000 px square (y 460–1460); stamps in the top third but below y 220; captions left-aligned, ≤ 2 lines, bottom edge above y 1600; ticker as a 3-line stack top-left under y 220 (f260); phase label a full-width bar under the safe zone (f445); score strip full-width 140 px below the square and the focused node ringed 2 px flame (f595–600); the `ECLIPSE_WHY` line under the strip (f882); single grafana card + four names (f1150); table at 44 px (f1280); wordmark 120 px with the URL on two lines ≥ 40 px (f1380); nothing readable in the top 220 or bottom 320 px on any frame.

- [ ] **Step 2: Fix what the sheet shows** by editing `LAYOUT[*].tall` values (the test keeps every box inside the safe area) or the scene's `L = LAYOUT[id][orientation]` reads; never a second component per orientation.

- [ ] **Step 3: Verify** → re-render the frames that changed; `npx vitest run remotion/scenes/layout.test.ts` PASS; tsc/lint green.

- [ ] **Step 4: Commit**

```bash
git add web/remotion/scenes
git commit -m "fix(web): tall-cut layout deltas verified against the Reels/Shorts safe zones"
```

### Task 6.14: Render, landing plate assets, FastAPI playback

**Files:**
- Create (committed): `web/public/video/launch-16x9.mp4`, `web/public/video/poster.png`
- Create (gitignored): `web/video-out/luminar-16x9.mp4`, `web/video-out/luminar-9x16.mp4`, `web/video-out/cover.png`
- Modify: `web/package.json` `video` script crf if 6.1's 28 misses the cap; `web/remotion.config.ts` (`setChromiumOpenGlRenderer('angle')` only if needed)
- Test: scripted walk below

**Interfaces:**
- Consumes: phase 5 `components/landing/VideoPlate.tsx` (native `<video src="/video/launch-16x9.mp4" poster="/video/poster.png" preload="metadata" playsinline controls>`, 1280×720, caption `FIG3`); A.24 `make web-video`.

- [ ] **Step 1: Time one frame**

Run: `cd web && time npx remotion still LaunchWide <scratchpad>/timing.png --frame 700` → if the still takes > 150 ms per frame of pure render in the log (`Rendered frame` timing with `--log=verbose`), add `Config.setChromiumOpenGlRenderer('angle')` and re-time; keep whichever is faster.

- [ ] **Step 2: Render everything**

Run: `make web-video` (≈ 1710 + 1440 frames; several minutes). Expected: five files written; the CLI prints each output path.
Run: `ls -l web/public/video/launch-16x9.mp4 && npx remotion ffmpeg -i web/public/video/launch-16x9.mp4 2>&1 | grep -E "Stream|Duration"` → size ≤ 12 582 912 bytes (12 MB), `1280x720`, `h264`, `Duration: 00:00:57`, **no audio stream**. If the size exceeds the cap raise crf by 2 and re-run the last two script steps; if Remotion rejects `--scale 0.6667` (odd dimension), replace that step with `npx remotion ffmpeg -i video-out/luminar-16x9.mp4 -vf scale=1280:720 -c:v libx264 -crf <same> -pix_fmt yuv420p -an public/video/launch-16x9.mp4` and commit the script change.
Run: `npx remotion ffmpeg -i web/video-out/luminar-9x16.mp4 2>&1 | grep Stream` → `1080x1920`, `Duration: 00:00:48`, no audio.

- [ ] **Step 3: Play both cuts**

Run: `vlc web/video-out/luminar-16x9.mp4` then `vlc web/video-out/luminar-9x16.mp4` (or `mpv`). Expected: both play start to end without a decoder warning; in the 9:16 cut, with the player's window at phone proportions, every stamp, caption, ticker line and the table sit clear of the top 220 / bottom 320 px bands (hold a ruler at 11.5 % / 16.7 % of the height); the prune erase in the wide cut lands at 0:22.8 (frame 685 / 30).

- [ ] **Step 4: Landing plate through FastAPI**

Run: `cd web && npm run build` → `web/out/video/launch-16x9.mp4` and `poster.png` exist. Then, on a scratch copy of the repo (or after moving the old `frontend/dist` aside): `ln -s ../web/out frontend/dist && make backend`. In Chrome (chrome-devtools `navigate_page http://localhost:8000/`): scroll to Fig. 3; the poster shows the dithered end card (frame 1620); press play → the video plays inline with controls, muted autoplay does **not** happen, `FIG3` caption reads *Fifty-seven seconds: one publish, five Sybils, one eclipse, one heal.*; `list_network_requests` shows `/video/launch-16x9.mp4` with status 200 or 206 and `content-type: video/mp4`.
Run: `curl -sI -r 0-99 http://localhost:8000/video/launch-16x9.mp4 | head -5` → record `206 Partial Content` (seeking works everywhere) or `200` (Review Focus 5: report to the owner; the plate keeps `preload="metadata"`). Restore `frontend/dist`.

- [ ] **Step 5: Gate and commit**

Run: `cd web && npx tsc --noEmit && npm run lint && npx vitest run && npm run build` → green; `make check` (repo root) → green; `git status` shows only the two `public/video/` files (+ any script/config change), never `video-out/`.

```bash
git add web/public/video/launch-16x9.mp4 web/public/video/poster.png web/package.json web/remotion.config.ts
git commit -m "feat(web): render the launch video; landing mp4 (1280x720, under 12 MB) and poster committed"
```

---

## Self-review notes

- Spec §9 coverage: location (6.1), compositions and `timeline[orientation]` (6.1–6.2), scenes 1–11 (6.8–6.12), tall safe zones and deltas (6.7 test, 6.13), data source and "nothing typed in" (6.3, 6.5, 6.6 with tests against the file), dither 1-bit via the shared Bayer with flame in a sibling layer (6.4, 6.5), stills dithered at render time (6.11), outputs and scripts (6.1, 6.14), silent (constraint, 6.14 checks no audio stream), fonts via `@font-face` (6.1), verification list (6.9 ticker, 6.10 frame 685, 6.11/6.12 copy grep). §7.4: `HaloRing`/`Diamond` are the only floating objects (6.8, 6.11, 6.12), the `Reticle` is the cursor (6.10). §6.1 item 7: mp4 + poster (6.14). §13.3: silent. §11 Phase 6 checklist: every item has a task.
- Deviations recorded under "New interfaces": `video-out/` instead of `out/`; `remotion/index.ts`; `public/stills/`; Fig. 3/5 wording where the recording differs from the storyboard (all 20 prunes land in one heartbeat at T+11.9; `prune threshold` row names Lighthouse's three thresholds rather than a bare −8000).
- Type consistency: `Box`, `Camera`, `Projector` defined once in `mesh/view.ts`; `SceneProps` once in `scenes/types.ts` (extended in 6.12 with `repoUrl`/`eventLine`); `Orientation`, `SceneId`, `SceneSpan` from A.22; `ReelData` from 6.3 everywhere.
- Review Focus 1–5 are pinned to Tasks 6.5, 6.3, 6.5, 6.5 and 6.14.

## Phase acceptance gate (spec §11, Phase 6, verbatim)

Checklist: `remotion/` tree, both compositions, scenes 1–11, data from the reel, stills
captured and dithered at render time, `npm run video`, landing mp4 + poster committed.
Acceptance: the storyboard's verification (frame ≈ 685 prune, ticker numbers from analytics,
copy grep clean); both mp4s play in VLC and the 9:16 cut keeps every readable element outside
the safe zones; `public/video/launch-16x9.mp4` ≤ 12 MB and plays from `/` through FastAPI.

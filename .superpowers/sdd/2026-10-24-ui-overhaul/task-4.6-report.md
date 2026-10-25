# Task 4.6 report: real reel, auto-Geo once, recorded provenance

BASE e3b7eb9f79c932000c1a968eb59adc90b378e766 · HEAD 160ad018ccf9fe4cd86e914612abac9910f521b8
Commit: 160ad01 feat(web): auto-Geo once per feed-on from a store subscription, recorded provenance in real reels

## Implemented
- `web/lib/actions.test.ts`: appended the brief's test verbatim (plus `import { dispatchFrame } from '@/lib/api/dispatch'`).
- `web/components/sim/Provenance.tsx`: kicker `RECORDED MAINNET` vs `LIVE MAINNET` on `useStore(s => s.reel)`; lag cell `recorded` vs `T−${lag_s ?? 156}s`; `PROVENANCE` copy unchanged.
- `web/lib/actions.ts`: NOT changed. Step 2 passed on first run, so per the brief `initAutoGeo` (Task 2.7) already handles telemetry_status landing before the observer snapshot. Hence no RED for this test (brief says PASS is the expected outcome when 2.7 is correct).

## Tests
- `npx vitest run lib/actions.test.ts -t initAutoGeo` → 2 passed | 26 skipped (passed before any implementation change, as the brief anticipated).
- `npx vitest run` → Test Files 65 passed (65), Tests 242 passed (242). No stderr/warnings from tests (vitest's own jsdom perf hint only).
- `npx tsc --noEmit` → clean.
- `npm run lint` → 0 errors, 39 warnings, all in pre-existing `web/figures/sorter/core.js` (not touched).

## Browser walk (Next dev on :3000, Chrome DevTools MCP)
1. `/reels/mainnet-block-wave/` after load: GEO aria-pressed=true; dithered world land with only observer double rings; card: `RECORDED MAINNET` / `slot 15466393 · recorded · 138 observers · arrival at observer nodes, not mesh paths · data: ethPandaOps (CC BY 4.0)`. PASS.
2. Click FORCE, Space, 10.5 s played (`10.5s / 1:36`): card gains `· shown on the Geo layout`, FORCE still pressed, no auto-switch back. PASS.
3. Press `0` → `/sim/`: provenance card absent; GEO disabled with title `Geo needs real observers · turn MAINNET on`. PASS.
Dev server stopped afterwards.

## Rulings applied
- R34: trailer `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. No other ruling is tagged 4.6.

## Self-review
Diff is 2 files, minimal; test asserts behaviour through real dispatchFrame/store. Brief's `git add web/lib/actions.ts` omitted because the file is unchanged.

## Concerns
None.

## Fix round 1 (2026-10-25), BASE 160ad018ccf9fe4cd86e914612abac9910f521b8

Both findings were "cannot verify from diff". I re-ran everything independently and found no defect, so no code changed. This round adds evidence only.

### Finding 1: browser walk (re-run in Chrome DevTools MCP, Next dev on :3000, backend :8000)
1. `/reels/mainnet-block-wave/` after 4 s: evaluate_script returned `GEO aria-pressed="true"`, `FORCE "false"`; the a11y snapshot shows complementary "Data provenance" = `RECORDED MAINNET` / `slot 15466393 · recorded · 138 observers · arrival at observer nodes, not mesh paths · data: ethPandaOps (CC BY 4.0)`. Screenshot /tmp/claude-1000/-home-yks-Projects-luminar/344950f1-b57c-4874-90b3-764debeb2b83/scratchpad/step1-geo.png shows the dithered world map with only cyan observer double rings and no simulated peers. PASS.
2. Clicked FORCE, then Play, then waited 11 s; the clock read 14.5s / 1:36. Result: `FORCE "true"`, `GEO "false"` (no auto-switch back), and the card ends with `· shown on the Geo layout`. Screenshot: /tmp/claude-1000/-home-yks-Projects-luminar/344950f1-b57c-4874-90b3-764debeb2b83/scratchpad/step2-force.png. PASS.
3. Pressing `0` reported "Page navigated to http://localhost:3000/sim/". The provenance card query returned null, and GEO has `disabled: true` with title `Geo needs real observers · turn MAINNET on`. Screenshot: /tmp/claude-1000/-home-yks-Projects-luminar/344950f1-b57c-4874-90b3-764debeb2b83/scratchpad/step3-sim.png. PASS.

### Finding 2: suite numbers (re-run)
- Covering test: `cd web && npx vitest run lib/actions.test.ts` → Test Files 1 passed (1), Tests 28 passed (28).
- Full suite: `cd web && npx vitest run` → Test Files 65 passed (65), Tests 242 passed (242). Only vitest's own jsdom performance hint appears; there are no test warnings.
- `npx tsc --noEmit` → no output (clean).
- `npm run lint` → ✖ 39 problems (0 errors, 39 warnings). All 39 are pre-existing, in web/figures/sorter/core.js.

Dev server stopped afterwards (port 3000 free). Rulings: R34 (trailer). No other ruling is tagged 4.6.

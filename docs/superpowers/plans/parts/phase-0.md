# UI Overhaul — Phase 0: Scaffold, Tokens, Fonts, Makefile/CI, Static Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up `web/` as a Next 16 static export that FastAPI already knows how to serve, with `tokens.css` as the one styling source, three self-hosted fonts visible on empty `/`, `/sim/`, `/figure/`, and `make web*` + a CI `web-build` job — without touching `frontend/`, `backend/` or the deploy files.

**Architecture:** Hand-written scaffold (no `create-next-app` template to clean up): exact pins from spec §4.7, `next.config.ts` exported as a phase function so the `/api` dev proxy never reaches the export, `app/globals.css` = `docs/design/tokens.css` verbatim + ≈120 lines of base rules, fonts through `next/font/local` with the three family variables written as an inline style on `<html>` so they beat the fallback stacks `tokens.css` declares on `:root`. Acceptance is vitest for the config/CSS/font contracts and a curl + browser walk for the mount and the faces.

**Tech Stack:** Next 16.4.3 (`output: 'export'`), React 19.3.1, TypeScript 5.9.3, ESLint + `eslint-config-next` 16.4.3, vitest (jsdom), `@fontsource/*` 5.3.0 as the woff2 source, GNU make, GitHub Actions `setup-node@v4` on Node 22.

**Spec:** `/home/yks/Projects/luminar/docs/superpowers/specs/2026-10-24-ui-overhaul-design.md` §3, §4.1–§4.3, §4.6–§4.7, §5, §11 Phase 0. Contract: `/home/yks/Projects/luminar/docs/superpowers/plans/2026-10-24-ui-overhaul-interfaces.md` A.1, A.24. Supporting: `docs/design/nextjs-architecture.md` §1, §12, §13; `docs/design/tokens.css`; `docs/design/ui-inventory.md` §11 (the one inventory section this phase retires: Geist/Geist Mono + `--lm-*` tokens → tokens.css, legacy aliases dropped by construction because `web/` never defines them).

## New interfaces introduced by this phase

Nothing in A.1–A.24 is renamed. Names this phase adds (the assembler may merge them into the contract):

| Name | Where | Why |
|---|---|---|
| Base CSS classes `.hair`, `.plate`, `.btn`, `.btn-primary`, `.menu`, `.menu-item`, `.menu-sep`, `.t-display`, `.t-poster`, `.t-fig`, `.t-narr`, `.t-ui`, `.t-label`, `.t-micro`, `.t-kpi`, `.num`, `.sr-only`, element rules `kbd`, `:focus-visible` | `web/app/globals.css` after the verbatim tokens block | spec §4.3 "≈300 lines of base rules (reset, type classes, `.hair`, `.plate`, buttons, menu, kbd)"; later phases' CSS Modules compose these instead of restating tokens |
| `--font-display`, `--font-mono`, `--font-ui` set as an **inline `style` on `<html>`** from `localFont(...).style.fontFamily` | `web/app/layout.tsx` | spec §4.6 says `layout.tsx` exposes these names and `tokens.css` is verbatim; `tokens.css:160-162` already declares them on `:root` with real family names, and `next/font/local` registers hashed families. An inline style wins the cascade deterministically; a `variable` class on `<html>` ties with `:root` and depends on stylesheet order. **Consequence for phase 2:** the deck.gl `TextLayer` family is the first entry of the computed `--font-mono` (`getComputedStyle(document.documentElement).getPropertyValue('--font-mono')`), and `document.fonts.load` is called with that name, not the literal `"IBM Plex Mono"`. |
| `web/next.config.test.ts`, `web/app/globals.test.ts`, `web/app/fonts.test.ts` | next to the module they test (A.1 rule) | the phase's vitest guards |
| `config(phase: string): NextConfig` default export of `next.config.ts` | `web/next.config.ts` | rewrites exist only when `phase === PHASE_DEVELOPMENT_SERVER`, so the export never carries custom routes (architecture §12) |

Overlap with the interfaces plan, settled here: this phase installs **vitest + jsdom**, writes `vitest.config.ts`, the `test`/`test:watch` scripts and the Makefile `web-test` / `web-check` (with `npx vitest run`) targets, so interfaces **Task 1 Step 3 becomes a no-op**. This phase also pins every §4.7 runtime dependency except `remotion`, `@remotion/player`, `@remotion/cli` (phase 6 adds them with `remotion.config.ts`), plus `@types/culori` so no `culori.d.ts` shim is needed (inventory pain point 6). Tests import `test`/`expect` from `'vitest'` explicitly (no `globals: true`, so `tsconfig` stays Next's).

## Global Constraints

- Backend untouched: `backend/main.py:1043` mounts `frontend/dist` with `StaticFiles(html=True)`; the export must be the shape Starlette resolves (`sim/index.html`, `404.html`) (spec §3).
- `next` 16.4.3, `react`/`react-dom` 19.3.1, `typescript` 5.9.3 (not 7.x), `eslint-config-next` 16.4.3; `zustand` 5.0.16, `@deck.gl/core|layers|extensions` 9.4.0, `@luma.gl/core|webgl` 9.4.2, `d3-force` 3.0.0, `culori` 4.0.2; exact pins, lockfile committed; builder re-runs `npm view <pkg> version` before pinning anything the spec leaves open (spec §4.2, §4.7).
- Absent on purpose: `@deck.gl/react`, Tailwind, immer, any UI kit, any icon set (spec §4.7).
- `output: 'export'`, `trailingSlash: true`, `images.unoptimized: true`; dev `rewrites()` proxies `/api/:path*` to `:8000`; no rewrites/middleware in the output (spec §4.2).
- `app/globals.css` = `docs/design/tokens.css` verbatim (edit tokens only there) + base rules; CSS Modules per component; no CSS-in-JS, no utility framework (spec §4.3).
- Fonts: Instrument Serif 400 roman + italic, IBM Plex Mono 400/500/600, Manrope variable, via `next/font/local` from `public/fonts/*.woff2` copied once from `@fontsource/instrument-serif` 5.3.0, `@fontsource/ibm-plex-mono` 5.3.0, `@fontsource-variable/manrope` 5.3.0; no Google Fonts, Fontshare or CDN at build or run time (spec §4.6, §2).
- Token values are not the builder's to change (spec §12). `--flame` never brand/hover/CTA; `--paper-3` never text; square corners (`--r-0`) everywhere but nodes (spec §5).
- No orange trapezoid shard, no grey halftone slab, anywhere (spec §7.4 item 2) — this phase adds no class for either.
- `VITE_API_URL` → `NEXT_PUBLIC_API_URL`, build-time, unset in the container (spec §4.2).
- `frontend/` is not touched until phase 7; `master` stays shippable; old Makefile targets stay (spec §3, §4.1).
- Node 22 in CI and Docker (`node-version: 22`, `node:22-slim`); Next 16 needs ≥ 20.9 (spec §3).
- Commits `type(scope): message`, scope `web` (spec §12).
- Every task ends with `cd web && npx tsc --noEmit && npm run lint && npx vitest run && npm run build` green and `make check` green (spec §11).

## Review Focus

1. **`/sim` without a trailing slash** — Starlette must answer 307 → `/sim/`, which only happens when the export writes `sim/index.html` (`trailingSlash: true`); pinned by `next.config.test.ts` and the curl walk in Task 0.1.
2. **A junk URL** — must get `404.html` with status 404, never `index.html` with 200 (a SPA-style catch-all would hide broken reel links in talk notes); curl walk in Task 0.1.
3. **The dev `/api` rewrite leaking into `next build`** — Next warns and the export silently has no proxy; `next.config.test.ts` asserts `rewrites` is `undefined` in the build phase (Task 0.1).
4. **Token drift** — someone edits the tokens block inside `globals.css` instead of `docs/design/tokens.css`; `globals.test.ts` asserts `globals.css` starts with `tokens.css` byte-for-byte (Task 0.2).
5. **Silent font fallback** — if `--font-display` resolves to the `:root` string, text renders in Georgia with no error; `fonts.test.ts` asserts the inline-style override and the browser walk checks `document.fonts` and the computed variable (Task 0.3).

---

### Task 0.1: Scaffold `web/` as a static export that FastAPI serves

**Files:**
- Create: `web/package.json`, `web/tsconfig.json`, `web/next.config.ts`, `web/eslint.config.mjs`, `web/vitest.config.ts`, `web/app/layout.tsx`, `web/app/page.tsx`, `web/app/sim/page.tsx`, `web/app/figure/page.tsx`, `web/app/not-found.tsx`
- Modify: `.gitignore` (append `web/out/`, `web/next-env.d.ts`, `web/*.tsbuildinfo`; `node_modules/` and `.next/` are already ignored)
- Test: `web/next.config.test.ts`

**Interfaces:**
- Consumes: spec §4.1 tree, §4.2, §4.7; A.1 path alias `@/*`; `backend/main.py:1043` mount.
- Produces: `config(phase: string): NextConfig` (default export of `next.config.ts`); `package.json` scripts `dev` (`next dev`), `build` (`next build`), `start` (`next start`, unused), `lint` (`eslint .`), `test` (`vitest run`), `test:watch` (`vitest`); `vitest.config.ts` with `test: { environment: 'jsdom', include: ['**/*.test.ts'] }` and `resolve.alias: { '@': __dirname }`; `tsconfig.json` `paths: { '@/*': ['./*'] }`; four pre-rendered routes `/`, `/sim/`, `/figure/`, `/404.html`; `RootLayout` rendering `<html lang="en" data-theme="dark">`.

- [ ] **Step 1: Write the failing test**

```ts
// web/next.config.test.ts
import { test, expect } from 'vitest'
import config from './next.config'

test('export settings the FastAPI mount depends on', () => {
  const c = config('phase-production-build')
  expect(c.output).toBe('export')
  expect(c.trailingSlash).toBe(true)
  expect(c.images?.unoptimized).toBe(true)
  expect(c.rewrites).toBeUndefined()
})

test('dev proxies /api to :8000 and nothing else', async () => {
  const c = config('phase-development-server')
  expect(await c.rewrites!()).toEqual([
    { source: '/api/:path*', destination: 'http://localhost:8000/api/:path*' },
  ])
})
```

- [ ] **Step 2: Write `web/package.json` and resolve the open pins**

Run: `cd /home/yks/Projects/luminar && mkdir -p web && cd web && for p in eslint vitest jsdom @types/culori @types/react @types/react-dom; do echo "$p $(npm view $p version)"; done; echo "@types/node $(npm view @types/node@22 version | tail -1 | awk '{print $2}' | tr -d "'")"`
Expected: one line per package; write each value **exact** (no `^`) into `package.json`:

- `dependencies`: `next` 16.4.3 · `react` 19.3.1 · `react-dom` 19.3.1 · `zustand` 5.0.16 · `@deck.gl/core` `@deck.gl/layers` `@deck.gl/extensions` 9.4.0 · `@luma.gl/core` `@luma.gl/webgl` 9.4.2 · `d3-force` 3.0.0 · `culori` 4.0.2
- `devDependencies`: `typescript` 5.9.3 · `eslint-config-next` 16.4.3 · `@types/d3-force` 3.0.10 · `@fontsource/instrument-serif` 5.3.0 · `@fontsource/ibm-plex-mono` 5.3.0 · `@fontsource-variable/manrope` 5.3.0 · `eslint`, `vitest`, `jsdom`, `@types/node` (22.x), `@types/react`, `@types/react-dom`, `@types/culori` at the values just printed
- `"name": "luminar-web"`, `"private": true`, scripts exactly as listed under Produces. No `"type": "module"` (Next's default; `eslint.config.mjs` is ESM by extension).

- [ ] **Step 3: Install and verify the pins are exact**

Run: `cd /home/yks/Projects/luminar/web && npm install && grep -c '"\^\|"~' package.json; node -e "console.log(require('next/package.json').version)"`
Expected: `package-lock.json` written; grep prints `0`; node prints `16.4.3`.

- [ ] **Step 4: Run the test to verify it fails**

Run: `cd /home/yks/Projects/luminar/web && npx vitest run next.config.test.ts`
Expected: FAIL — `vitest.config.ts` / `next.config.ts` not found.

- [ ] **Step 5: Write the config files**

`web/next.config.ts` — `import type { NextConfig } from 'next'`, `import { PHASE_DEVELOPMENT_SERVER } from 'next/constants'`; default-export `(phase: string): NextConfig => ({ output: 'export', trailingSlash: true, images: { unoptimized: true }, ...(phase === PHASE_DEVELOPMENT_SERVER && { rewrites: async () => [{ source: '/api/:path*', destination: 'http://localhost:8000/api/:path*' }] }) })`.

`web/tsconfig.json` — Next 16 defaults (`target` ES2022, `lib` `["dom","dom.iterable","esnext"]`, `strict`, `noEmit`, `module` esnext, `moduleResolution` bundler, `jsx` `react-jsx`, `isolatedModules`, `resolveJsonModule`, `esModuleInterop`, `skipLibCheck`, `incremental`, `plugins: [{ "name": "next" }]`) plus `"paths": { "@/*": ["./*"] }`; `include` `["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"]`, `exclude` `["node_modules", "out"]`. If `next build` appends fields, keep its edits.

`web/eslint.config.mjs` — the shape `create-next-app@16` writes: `defineConfig([...nextVitals, ...nextTs, globalIgnores(['.next/**', 'out/**', 'next-env.d.ts'])])` with `nextVitals` from `eslint-config-next/core-web-vitals` and `nextTs` from `eslint-config-next/typescript` (follow the installed package's README if its export names differ).

`web/vitest.config.ts` — `defineConfig({ test: { environment: 'jsdom', include: ['**/*.test.ts'], exclude: ['node_modules', 'out', '.next'] }, resolve: { alias: { '@': __dirname } } })` from `vitest/config`.

- [ ] **Step 6: Write the layout and the four pages**

`web/app/layout.tsx` — server component; `export const metadata: Metadata = { title: { default: 'Luminar', template: '%s · Luminar' }, description: 'Real-time GossipSub v1.1 simulator' }`; `export default function RootLayout({ children }: { children: React.ReactNode })` returning `<html lang="en" data-theme="dark"><body>{children}</body></html>`. No CSS import yet (Task 0.2), no fonts yet (Task 0.3).

`web/app/page.tsx`, `web/app/sim/page.tsx` (`metadata.title = 'Simulator'`), `web/app/figure/page.tsx` (`metadata.title = 'Figure'`) — each returns the same specimen with its own route label, using classes Task 0.2 defines (unstyled until then):

```tsx
<main style={{ padding: 'var(--gutter, 16px)' }}>
  <p className="t-ui">LUMINAR <span className="t-label">gossipsub v1.1</span></p>
  <h1 className="t-display">Fifty peers, <em>five Sybils grafted at once.</em></h1>
  <p className="num">T+ 12.3s · /sim/</p>   {/* '/' and '/figure/' on the other two */}
</main>
```

`web/app/not-found.tsx` — `<main>` with `<h1 className="t-display">Not found</h1>` and a `<p className="t-ui">` holding links to `/` and `/sim/`.

- [ ] **Step 7: Build, type-check, lint, test**

Run: `cd /home/yks/Projects/luminar/web && npm run build && ls out/index.html out/sim/index.html out/figure/index.html out/404.html && npx tsc --noEmit && npm run lint && npx vitest run`
Expected: build log lists `○ /`, `○ /_not-found`, `○ /figure`, `○ /sim` as static; all four files listed; tsc and lint clean; `2 passed`. The build log must **not** contain `Specified "rewrites"` (Review Focus 3).

- [ ] **Step 8: Prove the FastAPI mount (curl walk, backend on a spare port)**

Run, as one block from `/home/yks/Projects/luminar`:

```bash
[ -e frontend/dist ] && mv frontend/dist frontend/dist.bak
ln -s ../web/out frontend/dist
uv run uvicorn backend.main:app --port 8001 & PID=$!; sleep 4
curl -s -o /dev/null -w '%{http_code} %{redirect_url}\n' http://localhost:8001/sim
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:8001/sim/
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:8001/figure/
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:8001/no-such-page
curl -s http://localhost:8001/no-such-page | grep -c 'Not found'
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:8001/api/sim/snapshot
kill $PID; rm frontend/dist; [ -e frontend/dist.bak ] && mv frontend/dist.bak frontend/dist; ls -la frontend/dist 2>&1 | head -1
```

Expected, line by line: `307 http://localhost:8001/sim/` · `200` · `200` · `404` · `1` (our `not-found.tsx` text, served as `404.html`) · `200` (API still wins over the mount) · final `ls` shows no symlink left behind (either the restored directory or "No such file").

- [ ] **Step 9: Append to `.gitignore` and commit**

Append under the `# Node` block: `web/out/`, `web/next-env.d.ts`, `web/*.tsbuildinfo`. Then:

```bash
git add .gitignore web/package.json web/package-lock.json web/tsconfig.json web/next.config.ts web/next.config.test.ts web/eslint.config.mjs web/vitest.config.ts web/app
git status --short web | grep -v '^A ' ; git commit -m "feat(web): scaffold Next 16 static export with the FastAPI mount contract"
```

Expected: the `grep` prints nothing (no `node_modules`, `out`, `.next` staged).

### Task 0.2: `globals.css` = tokens verbatim + base rules

**Files:**
- Create: `web/app/globals.css`
- Modify: `web/app/layout.tsx` (add `import './globals.css'`)
- Test: `web/app/globals.test.ts`

**Interfaces:**
- Consumes: `docs/design/tokens.css` (307 lines, the single source); spec §4.3, §5, §10.
- Produces: the base classes listed under "New interfaces" with these exact rules —
  - `.hair` (`border-top: var(--hair-w) solid var(--hair)`), `.plate` (`background: var(--bg); color: var(--fg); position: relative`; the light-mode override already lives in tokens.css:280-290)
  - `.t-display` (`font: 400 var(--t-h1)/var(--lh-tight) var(--font-display)`; `em` inside → `font-style: italic`), `.t-poster` (same face at `--t-poster`, `letter-spacing: var(--track-poster)`), `.t-fig` (display italic `--t-fig`), `.t-narr` (display italic `--t-narr`), `.t-ui` (`600 var(--t-ui)/var(--lh-ui) var(--font-ui)`), `.t-label` (`500 var(--t-label)/1 var(--font-mono)`, `text-transform: uppercase`, `letter-spacing: var(--track-label)`, `color: var(--fg-3)`), `.t-micro` (`--t-micro`, mono), `.t-kpi` (`500 var(--t-kpi)/1 var(--font-mono)`), `.num` (mono, `font-feature-settings: var(--tnum)`, `font-variant-numeric: tabular-nums`)
  - `.btn` (mono `--t-ui`, `border: var(--hair-w) solid var(--hair-strong)`, `padding: 0 var(--s-3)`, `height: 32px`, `border-radius: var(--r-0)`, `transition: transform var(--d-press) var(--ease)`, `:active { transform: scale(.97) }`, `:hover { background: var(--wash) }`), `.btn-primary` (`background: var(--fg); color: var(--bg); border-color: var(--fg)`)
  - `.menu` (`background: var(--raised); border: var(--hair-w) solid var(--hair-strong); padding: var(--s-1) 0; min-width: 220px; margin: 0`; popover positioning is phase 3's call, spec §12), `.menu-item` (mono `--t-body`, `height: var(--row-h)` min, `padding: 0 var(--s-3)`, `:hover, &[aria-current="true"] { background: var(--wash-bg) }`), `.menu-sep` (`border-top: var(--hair-w) solid var(--hair); margin: var(--s-1) 0`)
  - `kbd` (`font: 500 var(--t-micro)/1 var(--font-mono); border: var(--hair-w) solid var(--hair-strong); padding: 1px 4px; color: var(--fg-2)`), `.sr-only` (the standard clip pattern)
  - reset: `*, *::before, *::after { box-sizing: border-box; margin: 0 }`; `html { background: var(--bg); color: var(--fg); font: 400 var(--t-body)/var(--lh-body) var(--font-mono); font-variant-numeric: tabular-nums; -webkit-font-smoothing: antialiased; }`; `body { min-height: 100dvh }`; `button, input, select, textarea { font: inherit; color: inherit; background: none; border: 0; border-radius: var(--r-0) }`; `a { color: inherit }`; `canvas, img, video, svg { display: block; max-width: 100% }`
  - `:focus-visible { outline: var(--hair-w2) solid var(--focus); outline-offset: 2px }` — never removed anywhere (spec §10)

- [ ] **Step 1: Write the failing test**

```ts
// web/app/globals.test.ts
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { test, expect } from 'vitest'

const tokens = readFileSync(resolve(__dirname, '../../docs/design/tokens.css'), 'utf8')
const globals = readFileSync(resolve(__dirname, 'globals.css'), 'utf8')

test('globals.css begins with docs/design/tokens.css verbatim', () => {
  expect(globals.startsWith(tokens)).toBe(true)
})

test('base rules keep the focus ring, tabular numerals and square corners', () => {
  expect(globals).toMatch(/:focus-visible\s*\{[^}]*outline:\s*var\(--hair-w2\) solid var\(--focus\)/)
  expect(globals).toMatch(/font-variant-numeric:\s*tabular-nums/)
  expect(globals.slice(tokens.length)).not.toMatch(/outline:\s*(none|0)\b/)
  expect(globals.slice(tokens.length)).not.toMatch(/border-radius:(?!\s*var\(--r-(0|node)\))/)
})

test('no network stylesheet or shard/slab decoration', () => {
  expect(globals).not.toMatch(/googleapis|fontshare|@import\s+url\(\s*['"]?https?:/)
  expect(globals.slice(tokens.length)).not.toMatch(/shard|slab|--halftone/)
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd /home/yks/Projects/luminar/web && npx vitest run app/globals.test.ts`
Expected: FAIL — `ENOENT ... app/globals.css`.

- [ ] **Step 3: Write `web/app/globals.css`**

Run: `cd /home/yks/Projects/luminar/web && cp ../docs/design/tokens.css app/globals.css && printf '\n/* ===== base rules (phase 0; tokens above are verbatim from docs/design/tokens.css — edit them only there) ===== */\n' >> app/globals.css`, then append the base rules from the Interfaces block (reset → focus → type classes → `.hair`/`.plate` → buttons → menu → `kbd`/`.sr-only`). Target ≤ 150 added lines. Add `import './globals.css'` as the first line of `web/app/layout.tsx`.

- [ ] **Step 4: Run the tests, type-check, lint, build**

Run: `cd /home/yks/Projects/luminar/web && npx vitest run && npx tsc --noEmit && npm run lint && npm run build`
Expected: `5 passed`; tsc, lint, build clean.

- [ ] **Step 5: Browser walk (chrome-devtools MCP against `npm run dev`)**

Run: `cd /home/yks/Projects/luminar/web && npm run dev` (port 3000). Then:

1. `navigate_page` → `http://localhost:3000/sim/`.
2. `evaluate_script` → `getComputedStyle(document.documentElement).getPropertyValue('--pitch-0').trim()` — expected `oklch(15.1% 0.004 286)` (Chrome applies the `@supports` override; `#0b0b0d` only on a browser without OKLCH).
3. `evaluate_script` → `getComputedStyle(document.body).backgroundColor` — expected a near-black (`oklch(0.151 0.004 286)` or `rgb(11, 11, 13)`), and `getComputedStyle(document.body).color` an off-white (`rgb(242, 242, 239)` equivalent).
4. `take_screenshot` — the specimen is light text on a near-black field, square corners, `T+ 12.3s · /sim/` with tabular digits; no scrollbar colour mismatch (`color-scheme: dark`).
5. `press_key` `Tab` until the first link in `not-found` (navigate to `http://localhost:3000/zzz` first) has focus; `take_screenshot` — a 2 px off-white outline 2 px outside the link, no rounded corners.

- [ ] **Step 6: Commit**

```bash
git add web/app/globals.css web/app/globals.test.ts web/app/layout.tsx
git commit -m "feat(web): tokens.css verbatim and base rules in globals.css"
```

### Task 0.3: Self-hosted fonts via `next/font/local`

**Files:**
- Create: `web/public/fonts/instrument-serif-latin-400-normal.woff2`, `web/public/fonts/instrument-serif-latin-400-italic.woff2`, `web/public/fonts/ibm-plex-mono-latin-400-normal.woff2`, `web/public/fonts/ibm-plex-mono-latin-500-normal.woff2`, `web/public/fonts/ibm-plex-mono-latin-600-normal.woff2`, `web/public/fonts/manrope-latin-wght-normal.woff2`
- Modify: `web/app/layout.tsx`
- Test: `web/app/fonts.test.ts`

**Interfaces:**
- Consumes: spec §4.6; `tokens.css:160-162` (`--font-display`, `--font-mono`, `--font-ui` fallback stacks); the fontsource packages installed in Task 0.1.
- Produces: `<html>` carrying `style="--font-display: …; --font-mono: …; --font-ui: …"` with the hashed `next/font` families; `/fonts/*.woff2` served from the frontend origin (for Remotion's `@font-face` in phase 6 and the `/figure/` iframe in phase 5); the six file names above are the canonical ones later phases reference.

- [ ] **Step 1: Write the failing test**

```ts
// web/app/fonts.test.ts
import { existsSync, statSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { test, expect } from 'vitest'

const FILES = [
  'instrument-serif-latin-400-normal.woff2', 'instrument-serif-latin-400-italic.woff2',
  'ibm-plex-mono-latin-400-normal.woff2', 'ibm-plex-mono-latin-500-normal.woff2', 'ibm-plex-mono-latin-600-normal.woff2',
  'manrope-latin-wght-normal.woff2',
]
const layout = readFileSync(resolve(__dirname, 'layout.tsx'), 'utf8')

test('the six woff2 files are in public/fonts and non-empty', () => {
  for (const f of FILES) {
    const p = resolve(__dirname, '../public/fonts', f)
    expect(existsSync(p), f).toBe(true)
    expect(statSync(p).size).toBeGreaterThan(1000)
  }
})

test('layout loads fonts locally and writes the three variables as an inline style', () => {
  expect(layout).toMatch(/from 'next\/font\/local'/)
  expect(layout).not.toMatch(/next\/font\/google|googleapis|fontshare/)
  for (const v of ['--font-display', '--font-mono', '--font-ui']) expect(layout).toContain(`'${v}'`)
  expect(layout).toMatch(/<html[^>]*style=\{/)
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd /home/yks/Projects/luminar/web && npx vitest run app/fonts.test.ts`
Expected: FAIL — `instrument-serif-latin-400-normal.woff2: expected false to be true`.

- [ ] **Step 3: Copy the files once from the fontsource packages**

Run:
```bash
cd /home/yks/Projects/luminar/web && mkdir -p public/fonts && \
cp node_modules/@fontsource/instrument-serif/files/instrument-serif-latin-400-{normal,italic}.woff2 public/fonts/ && \
cp node_modules/@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-{400,500,600}-normal.woff2 public/fonts/ && \
cp node_modules/@fontsource-variable/manrope/files/manrope-latin-wght-normal.woff2 public/fonts/ && \
ls -la public/fonts && du -sh public/fonts
```
Expected: six files, total under 400 KB. (OFL licences ship inside the packages; no licence file is needed next to the woff2s.)

- [ ] **Step 4: Declare the fonts in `web/app/layout.tsx`**

`import localFont from 'next/font/local'`, then at module scope:
- `const display = localFont({ src: [{ path: '../public/fonts/instrument-serif-latin-400-normal.woff2', weight: '400', style: 'normal' }, { path: '../public/fonts/instrument-serif-latin-400-italic.woff2', weight: '400', style: 'italic' }], display: 'swap' })`
- `const mono = localFont({ src: [400, 500, 600 weights from the three ibm-plex-mono files, style 'normal'], display: 'swap' })`
- `const ui = localFont({ src: '../public/fonts/manrope-latin-wght-normal.woff2', weight: '200 800', display: 'swap' })`

Render `<html lang="en" data-theme="dark" style={{ '--font-display': display.style.fontFamily, '--font-mono': mono.style.fontFamily, '--font-ui': ui.style.fontFamily } as React.CSSProperties}>`. No `variable:` option, no `className` on `<html>` (one mechanism only; see "New interfaces").

- [ ] **Step 5: Run the tests, type-check, lint, build, and the CDN grep**

Run: `cd /home/yks/Projects/luminar/web && npx vitest run && npx tsc --noEmit && npm run lint && npm run build && grep -r "fonts.googleapis\|fontshare" out; echo "grep exit $?"; ls out/_next/static/media/*.woff2 | wc -l; ls out/fonts | wc -l`
Expected: `7 passed`; tsc/lint/build clean; `grep exit 1` (no matches); `6` media files emitted by `next/font`; `6` raw files under `out/fonts`.

- [ ] **Step 6: Browser walk (chrome-devtools MCP against `npm run dev`)**

For each of `http://localhost:3000/`, `http://localhost:3000/sim/`, `http://localhost:3000/figure/`:

1. `navigate_page` → URL; `wait_for` text `LUMINAR`.
2. `evaluate_script` → `document.fonts.ready.then(() => [...document.fonts].filter(f => f.status === 'loaded').map(f => f.family + ' ' + f.weight + ' ' + f.style).sort())` — expected entries whose families start with `__Instrument_Serif` (400 normal **and** 400 italic), `__IBM_Plex_Mono` (400, 500, 600) and `__Manrope` (`200 800`); no `Georgia`, `Menlo` or `Segoe UI` entry.
3. `evaluate_script` → `getComputedStyle(document.documentElement).getPropertyValue('--font-display').trim().startsWith("'__Instrument_Serif")` — expected `true` (Review Focus 5); same for `--font-mono` → `__IBM_Plex_Mono`, `--font-ui` → `__Manrope`.
4. `take_screenshot` — headline in a high-contrast serif with the second clause italic; `LUMINAR` in a geometric sans at 600; `T+ 12.3s` in a mono with equal-width digits.
5. `list_network_requests` — every request host is `localhost:3000`; zero requests to any other host.

- [ ] **Step 7: Commit**

```bash
git add web/public/fonts web/app/layout.tsx web/app/fonts.test.ts
git commit -m "feat(web): self-host Instrument Serif, IBM Plex Mono and Manrope via next/font/local"
```

### Task 0.4: Makefile targets and the CI `web-build` job

**Files:**
- Modify: `Makefile` (`.PHONY` line; new section `# ── Web (Next.js overhaul) ──` after `# ── Quality ──`), `.github/workflows/ci.yml` (new job after `frontend-build`)
- Test: none in vitest (shell assertions below); `make check` remains the regression guard for `frontend/` and `backend/`.

**Interfaces:**
- Consumes: A.24 Makefile block; spec §11 Phase 0 CI line; the scripts from Task 0.1.
- Produces: `make web` (`cd web && npm run dev`), `make web-build` (`cd web && npm run build`), `make web-test` (`cd web && npx vitest run`), `make web-check` (`cd web && npx tsc --noEmit && npm run lint && npx vitest run`); CI job id `web-build`, name `Web Build`. (`web-stats` and `web-video` are added by interfaces Task 11 and phase 6.)

- [ ] **Step 1: Verify the targets are missing**

Run: `cd /home/yks/Projects/luminar && make -n web-check; echo "exit $?"`
Expected: `make: *** No rule to make target 'web-check'.  Stop.` and `exit 2`.

- [ ] **Step 2: Add the Makefile targets**

Each with a `## …` help comment so `make help` lists it; add `web web-build web-test web-check` to `.PHONY`. Old targets untouched (`install`, `clean`, `check` change in phase 7).

- [ ] **Step 3: Add the CI job**

After `frontend-build` in `.github/workflows/ci.yml`:

```yaml
  web-build:
    name: Web Build
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
          cache-dependency-path: web/package-lock.json
      - run: cd web && npm ci
      - run: cd web && npx tsc --noEmit
      - run: cd web && npm run lint
      - run: cd web && npx vitest run
      - run: cd web && npm run build
```

- [ ] **Step 4: Verify locally**

Run: `cd /home/yks/Projects/luminar && make -n web-check && make help | grep -c '^.*web' && make web-check && make web-build && make check && grep -c 'web-build:\|cache-dependency-path: web/package-lock.json\|node-version: 22' .github/workflows/ci.yml && python3 -c "import yaml,sys; d=yaml.safe_load(open('.github/workflows/ci.yml')); print(sorted(d['jobs']))" 2>/dev/null || echo "pyyaml absent — grep line above is the check"`
Expected: the `-n` line prints `cd web && npx tsc --noEmit && npm run lint && npx vitest run`; help count `4`; `make web-check`, `make web-build`, `make check` all exit 0 (ruff, pytest, `frontend/` tsc + vite build untouched); grep count `4` (two `node-version: 22`, one job key, one cache path); the yaml line, if pyyaml is present, prints `['backend-lint', 'backend-test', 'frontend-build', 'web-build']`.

- [ ] **Step 5: Node 22 parity check (CI runs 22, the laptop runs 26)**

Run: `cd /home/yks/Projects/luminar/web && node -e "const v=process.versions.node.split('.')[0]; console.log(v>=22?'ok '+v:'too old '+v)"; grep -o '"node": *"[^"]*"' package.json || echo "no engines field (intended)"`
Expected: `ok 26` (or `ok 22`); no `engines` field — the pin lives in CI and the Dockerfile, not in `package.json`.

- [ ] **Step 6: Commit**

```bash
git add Makefile .github/workflows/ci.yml
git commit -m "chore(web): Makefile web targets and CI web-build job"
```

---

## Self-review notes

- Spec coverage for Phase 0 (§11): `web/` + `next.config.ts` → 0.1; `globals.css` = tokens + base → 0.2; three fonts on empty `/`, `/sim/`, `/figure/` → 0.1 pages + 0.3; `make web`, `web-build`, `web-check` → 0.4; CI job with `node-version: 22`, `npm ci`, `tsc`, `lint`, `build`, `cache-dependency-path: web/package-lock.json` → 0.4; acceptance `out/sim/index.html`, symlink proof (307, `404.html`), CDN grep → 0.1 Step 8 and 0.3 Step 5. Spec §4.1 files that are *not* phase 0: `reels/[name]/page.tsx` (phase 4), `remotion.config.ts` (phase 6), everything under `components/`, `lib/`, `scripts/` (interfaces plan Part B, phases 2–6).
- The one spec tension (next/font/local vs. verbatim `tokens.css` font stacks) is resolved in "New interfaces" with the reason and the phase-2 consequence; token values are untouched.
- Type consistency: `config(phase: string): NextConfig` is the only new signature and is used by exactly one test. Class names in 0.1's pages (`t-ui`, `t-label`, `t-display`, `num`) are the ones 0.2 defines.
- Review Focus 1–5 are pinned to Tasks 0.1 (1–3), 0.2 (4), 0.3 (5).
- Proportion: four tasks, four commits, three vitest files, one curl walk, two browser walks; the plan is shorter than `tokens.css`.

---

## Phase acceptance gate (spec §11, Phase 0 — verbatim)

> Parity checklist: `web/` created with §4.1's `next.config.ts`; `globals.css` = tokens.css +
> base rules; three fonts self-hosted and visible on an empty `/`, `/sim/`, `/figure/`; `make web`,
> `make web-build`, `make web-check`; `.github/workflows/ci.yml` gains a `web-build` job
> (`node-version: 22`, `npm ci`, `tsc`, `lint`, `build`, `cache-dependency-path: web/package-lock.json`).
> Acceptance: `npm run build` writes `web/out/sim/index.html`; `ln -s ../web/out frontend/dist`
> on a scratch copy proves FastAPI serves `/sim/` with a 307 from `/sim` and `404.html` for junk;
> `grep -r "fonts.googleapis\|fontshare" web/out` is empty.

> Every phase ends with `cd web && npx tsc --noEmit && npm run lint && npm run build` green and
> `make check` still green for `frontend/` and `backend/`.

// Real-DPR walk (review round 3): headless Chrome on the Intel iGPU (ANGLE gl-egl) at --force-device-scale-factor, fresh profile (cold GPU shader cache).
// Usage: node real-dpr.mjs 1.5   (prod export on :3000, backend :8000). puppeteer-core comes from the chrome-devtools-mcp npx cache; adjust the import if it moves.
// Headless frame production caps a RUNNING sim at ~10-18 fps even at DPR 1 (headful 54 fps), so read its burst fps only for the arrival long task.
import puppeteer from '/home/yks/.npm/_npx/668c188756b835f3/node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js'
import { readFileSync } from 'node:fs'
const W = '/home/yks/Projects/luminar/docs/superpowers/plans/parts/phase-2-walk/'
const src = f => readFileSync(W + f, 'utf8')
const dpr = process.argv[2] || '1.5'
const api = (p, b) => fetch('http://localhost:8000' + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b ?? {}) })
const sleep = ms => new Promise(r => setTimeout(r, ms))
const b = await puppeteer.launch({ executablePath: '/opt/google/chrome/chrome', headless: true, defaultViewport: null,
  args: ['--window-size=1440,987', `--force-device-scale-factor=${dpr}`, '--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl-egl'] })
const p = await b.newPage()
const errors = []
p.on('console', m => { if (m.type() === 'error' || m.type() === 'warn') errors.push(`${m.type()}: ${m.text()}`) })
p.on('response', r => { if (r.status() >= 400) errors.push('http ' + r.status() + ' ' + r.url()) })
p.on('pageerror', e => errors.push('pageerror: ' + e.message))
await p.evaluateOnNewDocument(src('hook.js'))
await api('/api/fault/clear-all'); await api('/api/sim/play')
await p.goto('http://localhost:3000/sim/', { waitUntil: 'load' })
await p.waitForFunction(() => window.__luminar && window.__luminar.store.getState().nodes.length > 0, { timeout: 15000 })
const run = async f => p.evaluate(`(${src(f)})()`)
const out = { dpr }
out.env = await p.evaluate(() => { const c = document.querySelector('canvas'); const gl = c.getContext('webgl2'); const e = gl.getExtension('WEBGL_debug_renderer_info')
  return { devicePixelRatio, inner: [innerWidth, innerHeight], canvasCss: [c.clientWidth, c.clientHeight], buffer: [gl.drawingBufferWidth, gl.drawingBufferHeight], gpu: gl.getParameter(e.UNMASKED_RENDERER_WEBGL) } })
out.cold = []
for (let i = 0; i < 5; i++) { const r = await run('cold200.js'); out.cold.push({ layoutMs: r.layouts.at(-1)?.ms, firstPaintAfterResp: r.firstPaintAfterResp, nodes: r.nodes, meshEdges: r.layers.includes('mesh-edges') }) }
out.burst = []
await api('/api/sim/play'); await sleep(1000)
for (let i = 0; i < 2; i++) { await api('/api/fault/clear-all'); await sleep(2000); const st0 = await p.evaluate(() => window.__luminar.store.getState().simTime); if (i === 0) await p.tracing.start({ path: `trace-burst-dpr${dpr}.json` }); const r = await run('burst.js'); if (i === 0) await p.tracing.stop(); const st1 = await p.evaluate(() => window.__luminar.store.getState().simTime); out.burst.push({ fps: Object.values(r.fpsPerSecond), p50: r.gapP50, p95: r.gapP95, longs: r.longs, layouts: r.layouts, commits: r.commits, rendered: r.rendered, attackers: r.attackers, simAdvanced: +(st1 - st0).toFixed(1) }) }
await api('/api/fault/clear-all'); await api('/api/sim/pause'); await sleep(3000)
const idle = await run('idle.js'); out.idle = { fps: idle.fps, p50: idle.gapP50, max: idle.gapMax, longs: idle.longs, commits: idle.commits, state: idle.state }
await api('/api/sim/play')
out.commitsTotal = await p.evaluate(() => window.__commits.length); out.errors = errors
console.log(JSON.stringify(out, null, 1))
await b.close()

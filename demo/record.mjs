// Frame-by-frame screencast of the real Luminar UI (the static export in web/out), deterministic.
//
//   node record.mjs [--shot mesh,sybil] [--fps 30] [--smoke] [--list]
//
// Why not screen-record: live capture inherits every skipped requestAnimationFrame. The app's clock is
// performance.now / setInterval (reel replay) and requestAnimationFrame (particles, deck.gl), so Playwright's
// fake clock steps all of it: one `clock.runFor(1000 / fps)` per output frame, then a screenshot. A slow frame
// costs render time, never a dropped frame. Shots (url, seek, speed, timed clicks) live in shots.mjs; each shot
// leaves out/frames/<id>/f00000.png… plus <id>.json (the cursor path, for the composition's cursor overlay).
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { startServer } from './serve.mjs'
import { SHOTS } from './shots.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const arg = (name, dflt) => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : dflt }
const SMOKE = process.argv.includes('--smoke')
const FPS = Number(arg('--fps', 30))
const W = 1920, H = 1080

if (process.argv.includes('--list')) { for (const s of SHOTS) console.log(`${s.id}\t${s.seconds}s\t${s.url}`); process.exit(0) }
const wanted = arg('--shot', 'all')
const shots = SHOTS.filter(s => wanted === 'all' || wanted.split(',').includes(s.id))
if (!shots.length) { console.error(`no shot named ${wanted}; --list`); process.exit(1) }

const { srv, port } = await startServer()
const browser = await chromium.launch({
  channel: 'chromium',   // full Chromium (new headless); the app picks its Canvas 2D backend on software GL, same atlas, deterministic
  args: ['--ignore-gpu-blocklist', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader', '--font-render-hinting=none', '--disable-lcd-text'],
})

/** Screen point of a peer: world position → the deck viewport's projection → page coordinates of the canvas. */
async function peerPoint(page, id) {
  return page.evaluate(id => {
    const pos = window.__luminar.positions().get(id)
    const vp = window.__luminar.viewState()
    const canvas = document.querySelector('[data-slot="canvas"] canvas')
    if (!pos || !vp || !canvas) return null
    const [sx, sy] = vp.project(pos)
    const r = canvas.getBoundingClientRect()
    return { x: r.left + sx, y: r.top + sy }
  }, id)
}

for (const shot of shots) {
  const outDir = join(HERE, 'out', SMOKE ? 'smoke' : 'frames', shot.id)
  if (!SMOKE) mkdirSync(outDir, { recursive: true }); else { rmSync(outDir, { recursive: true, force: true }); mkdirSync(outDir, { recursive: true }) }
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, colorScheme: 'dark', locale: 'en-US' })
  await ctx.clock.install()
  // The DHT particle picks a random neighbour; pin Math.random so two renders of a shot are the same pixels.
  await ctx.addInitScript(() => {
    let a = 0x9e3779b9
    Math.random = () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
  })
  const page = await ctx.newPage()
  page.on('pageerror', e => console.error('[js]', String(e).slice(0, 300)))
  page.on('console', m => { if (m.type() === 'error') console.error('[console]', m.text().slice(0, 300)) })
  await page.goto(`http://127.0.0.1:${port}${shot.url}`, { waitUntil: 'networkidle', timeout: 120_000 })
  // Reel parsed, fonts in, canvas reveal done (its timer runs on the still-live fake clock).
  await page.waitForFunction(() => { const s = window.__luminar?.store.getState(); return !!s && !!s.reel && s.reel.durationMs > 0 && !s.reelLoad && s.nodes.length > 0 }, null, { timeout: 120_000 })
  await page.evaluate(() => document.fonts.ready)
  await page.waitForFunction(() => !document.querySelector('[data-reveal]'), null, { timeout: 30_000 })
  await page.waitForTimeout(800)
  const backend = await page.evaluate(() => { const c = document.querySelector('[data-slot="canvas"] canvas'); return c && (c.getContext('webgl2') || c.getContext('webgl')) ? 'webgl' : 'canvas2d' })
  if (shot.seek !== undefined) {
    // The scrubber is the app's own seek: a range input in thousandths of the reel (React listens to `input`).
    await page.evaluate(sec => {
      const s = window.__luminar.store.getState()
      const el = document.querySelector('input[aria-label="timeline"]')
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
      setter.call(el, String(Math.round((sec / s.reel.durationSim) * 1000)))
      el.dispatchEvent(new Event('input', { bubbles: true }))
    }, shot.seek)
    await page.waitForTimeout(300)   // seekTo coalesces on the next animation frame
  }
  if (shot.speed !== undefined && shot.speed !== 1) await page.getByRole('group', { name: 'Speed' }).getByRole('button', { name: `${String(shot.speed).replace(/^0\./, '.')}×`, exact: true }).click()
  await page.mouse.move(W / 2, H - 20)   // park the pointer off the mesh so no hover ring leaks into frame 0
  await page.waitForTimeout(300)
  const simT = await page.evaluate(() => window.__luminar.store.getState().simTime)
  // Freeze time: jump a little ahead (the live fake clock kept moving since we read it) and pause there.
  const now = await page.evaluate(() => Date.now())
  await ctx.clock.pauseAt(now + 2000)
  // The transport's own Play control (Space on a focused speed button is that button's activation, not play).
  if (shot.play !== false) {
    await page.getByRole('button', { name: 'Play (Space)' }).click()
    await page.evaluate(() => document.activeElement?.blur())
    const playing = await page.evaluate(() => window.__luminar.store.getState().playing)
    if (!playing) throw new Error(`${shot.id}: the reel did not start`)
  }
  const frames = Math.round(shot.seconds * FPS)
  const spots = SMOKE ? [0, Math.round(frames * 0.33), Math.round(frames * 0.66), frames - 1] : null
  console.log(`${shot.id}: ${backend}, sim T+${simT.toFixed(2)}, ${shot.seconds}s → ${frames} frames @ ${FPS}`)
  const frameMs = 1000 / FPS
  const cursor = []   // { t, x, y, kind: 'move' | 'click' } on the shot clock
  const fired = new Set()
  let glide = null    // an in-flight pointer move: { from, to, start, steps, peer }; every frame of it is still captured
  const stepClock = async () => {
    await ctx.clock.runFor(frameMs)
    // React commits through MessageChannel (not under the fake clock): let two macrotasks pass so the DOM
    // (ticker, inspector) has the state the canvas just drew; then pin CSS animations/transitions to the clock.
    await page.evaluate(ms => new Promise(r => {
      const ch = new MessageChannel(); let n = 0
      ch.port1.onmessage = () => { if (++n < 2) ch.port2.postMessage(0); else r() }
      ch.port2.postMessage(0)
      for (const a of document.getAnimations()) { try { if (a.playState !== 'paused') a.pause(); a.currentTime = (a.currentTime ?? 0) + ms } catch { /* detached */ } }
    }), frameMs)
  }
  for (let f = 0; f < frames; f++) {
    const t = f / FPS
    for (const [i, act] of (shot.actions ?? []).entries()) {
      if (fired.has(i) || t < act.at) continue
      fired.add(i)
      if (act.click) {
        // Glide the pointer to the peer over 12 frames (recorded for the overlay), then click it.
        const to = await peerPoint(page, act.click)
        if (!to) throw new Error(`${shot.id}: no position for ${act.click}`)
        glide = { from: { x: W * 0.5, y: H * 0.78 }, to, start: f, steps: 12, peer: act.click }
      }
      if (act.run) await act.run(page)
    }
    if (glide) {
      const k = f - glide.start + 1
      const e = 1 - (1 - Math.min(1, k / glide.steps)) ** 3
      // Re-aim every frame: a relayout's 500 ms view transition (an attacker joining) moves the node under the glide.
      glide.to = (await peerPoint(page, glide.peer)) ?? glide.to
      const x = glide.from.x + (glide.to.x - glide.from.x) * e, y = glide.from.y + (glide.to.y - glide.from.y) * e
      await page.mouse.move(x, y)
      if (k < glide.steps) cursor.push({ t, x, y, kind: 'move' })
      else {
        await page.mouse.click(glide.to.x, glide.to.y)
        cursor.push({ t, x: glide.to.x, y: glide.to.y, kind: 'click' })
        console.log(`  ${shot.id}: click ${glide.peer} at ${t.toFixed(2)}s (${glide.to.x.toFixed(0)}, ${glide.to.y.toFixed(0)})`)
        glide = null
      }
    }
    if (f > 0) await stepClock()
    const want = !SMOKE || spots.includes(f)
    if (!want) continue
    const file = join(outDir, SMOKE ? `spot-${String(f).padStart(5, '0')}.png` : `f${String(f).padStart(5, '0')}.png`)
    if (!SMOKE && existsSync(file)) continue
    await page.screenshot({ path: file, clip: { x: 0, y: 0, width: W, height: H }, animations: 'disabled', caret: 'hide' })
    if (!SMOKE && f % 150 === 0) console.log(`  ${shot.id} ${f}/${frames}`)
  }
  const simEnd = await page.evaluate(() => window.__luminar.store.getState().simTime)
  writeFileSync(join(outDir, '..', `${shot.id}.json`), JSON.stringify({ id: shot.id, fps: FPS, seconds: shot.seconds, simFrom: simT, simTo: simEnd, speed: shot.speed ?? 1, backend, cursor }, null, 2))
  console.log(`  done ${shot.id}: sim T+${simT.toFixed(2)} → T+${simEnd.toFixed(2)} → ${outDir}`)
  await ctx.close()
}
await browser.close()
srv.close()

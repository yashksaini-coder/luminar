// T10 final walk: cdp-audit.mjs trimmed to the default state. usage: node walk.mjs [route-filter] [vp-filter]; RM=1 = reduced-motion full-page run.
import { spawn } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
const require = createRequire('/home/yks/Projects/luminar/web/package.json')
const WebSocket = require('ws')
const OUT = '/home/yks/Projects/luminar/docs/superpowers/plans/parts/motion-walk'
const SCRATCH = '/tmp/claude-1000/-home-yks-Projects-luminar/344950f1-b57c-4874-90b3-764debeb2b83/scratchpad'
const RM = process.env.RM === '1' || process.env.CTRL === '1'; const CTRL = process.env.CTRL === '1'
const [routeF = 'all', vpF = 'all'] = process.argv.slice(2)
const ROUTES = {
  landing: 'http://127.0.0.1:9010/',
  sim: 'http://localhost:3010/sim/',
  'reels-sybil-eclipse': 'http://127.0.0.1:9010/reels/sybil-eclipse/',
  'reels-mainnet-block-wave': 'http://127.0.0.1:9010/reels/mainnet-block-wave/',
  figure: 'http://127.0.0.1:9010/figure/',
  '404': 'http://127.0.0.1:9010/404.html',
}
const VPS = RM ? [[1440, 900, 1], [390, 844, 1]] : [[390, 844, 1], [844, 390, 1], [768, 1024, 1], [1024, 768, 1], [1280, 720, 1], [1440, 900, 1], [1920, 1080, 1], [390, 844, 2], [1440, 900, 2]]
const isSim = r => r === 'sim' || r.startsWith('reels')
const MEASURE = String(function () {
  const vw = innerWidth, vh = innerHeight
  const skip = el => !!el.closest('nextjs-portal, next-route-announcer')
  const sel = el => { let s = el.tagName.toLowerCase(); if (el.id) s += '#' + el.id; const c = [...el.classList].slice(0, 2).join('.'); if (c) s += '.' + c; const t = (el.getAttribute('aria-label') || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 28); return s + (t ? ` "${t}"` : '') }
  const vis = el => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && cs.opacity !== '0' && !skip(el) }
  const out = { vw, vh, sw: document.documentElement.scrollWidth, sh: document.documentElement.scrollHeight, hscroll: document.documentElement.scrollWidth > innerWidth, overflowers: [], overlaps: [], anims: document.getAnimations().length, animNames: document.getAnimations().slice(0, 8).map(a => (a.animationName || a.transitionProperty || a.constructor.name) + '@' + (a.effect?.target ? sel(a.effect.target) : '?')) }
  const all = [...document.querySelectorAll('body *')].filter(el => !skip(el))
  for (const el of all) { const r = el.getBoundingClientRect(); if (r.width > 0 && (r.right > vw + 1 || r.left < -1) && getComputedStyle(el).position !== 'fixed' && !el.closest('[data-dither], canvas') && !el.matches('canvas')) { out.overflowers.push({ sel: sel(el), l: Math.round(r.left), r: Math.round(r.right) }); if (out.overflowers.length > 25) break } }
  const fa = all.filter(el => { const p = getComputedStyle(el).position; return (p === 'fixed' || p === 'absolute' || p === 'sticky') && vis(el) && !el.matches('canvas') && !el.closest('figure, [data-dither]') })
  const fr = fa.map(el => ({ el, r: el.getBoundingClientRect() }))
  const big = r => r.width >= vw * 0.9 && r.height >= vh * 0.5
  for (let i = 0; i < fr.length; i++) for (let j = i + 1; j < fr.length; j++) {
    const A = fr[i], B = fr[j]; if (A.el.contains(B.el) || B.el.contains(A.el)) continue
    const a = A.r, b = B.r; const ix = Math.min(a.right, b.right) - Math.max(a.left, b.left), iy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)
    if (ix > 2 && iy > 2 && !big(a) && !big(b) && !(A.el.parentElement === B.el.parentElement && getComputedStyle(A.el.parentElement).position === 'relative' && A.el.parentElement.closest('[class*=track], [class*=range]'))) out.overlaps.push({ a: sel(A.el), b: sel(B.el), ix: Math.round(ix), iy: Math.round(iy) })
  }
  out.overlaps = out.overlaps.slice(0, 40)
  return JSON.stringify(out)
})
const PORT = Number(process.env.PORT || 9333)
const flags = ['--headless=new', '--no-sandbox', '--disable-gpu', '--hide-scrollbars', `--remote-debugging-port=${PORT}`, `--user-data-dir=${SCRATCH}/walk-prof-${PORT}`, '--window-size=1920,1080']
if (RM && !CTRL) flags.push('--force-prefers-reduced-motion')
const chrome = spawn('chromium', [...flags, 'about:blank'], { stdio: 'ignore' })
const sleep = ms => new Promise(r => setTimeout(r, ms))
let wsUrl
for (let i = 0; i < 50; i++) { try { wsUrl = (await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json()).webSocketDebuggerUrl; break } catch { await sleep(200) } }
if (!wsUrl) { chrome.kill(); throw new Error('no chrome') }
const ws = new WebSocket(wsUrl); await new Promise(r => ws.on('open', r))
let id = 0; const pending = new Map(); const listeners = []
ws.on('message', d => { const m = JSON.parse(d); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id) } else listeners.forEach(f => f(m)) })
const send = (method, params = {}, sessionId) => new Promise((res, rej) => { const i = ++id; pending.set(i, m => m.error ? rej(new Error(method + ': ' + JSON.stringify(m.error))) : res(m.result)); ws.send(JSON.stringify({ id: i, method, params, sessionId })) })
const results = []
for (const [route, url] of Object.entries(ROUTES)) {
  if (routeF !== 'all' && !routeF.split(',').some(f => route.includes(f))) continue
  if (RM && route !== 'landing') continue
  for (const [w, h, dpr] of VPS) {
    const vpName = `${w}x${h}${dpr === 2 ? '@2x' : ''}`
    if (vpF !== 'all' && !vpF.split(',').some(v => vpName === v)) continue
    const { targetId } = await send('Target.createTarget', { url: 'about:blank' })
    const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true })
    const S = (m, p) => send(m, p, sessionId)
    await S('Page.enable'); await S('Runtime.enable'); await S('Page.addScriptToEvaluateOnNewDocument', { source: 'try{localStorage.clear()}catch{}' })
    const mobile = w <= 1024
    await S('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: dpr, mobile, screenWidth: w, screenHeight: h })
    await S('Emulation.setTouchEmulationEnabled', { enabled: mobile, maxTouchPoints: mobile ? 5 : 1 })
    if (mobile) await S('Emulation.setUserAgentOverride', { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' })
    const loaded = new Promise(r => { const f = m => { if (m.method === 'Page.loadEventFired' && m.sessionId === sessionId) { listeners.splice(listeners.indexOf(f), 1); r() } }; listeners.push(f) })
    await S('Page.navigate', { url })
    await Promise.race([loaded, sleep(15000)])
    await sleep(isSim(route) ? (route.startsWith('reels') ? 7000 : 4000) : route === 'figure' ? 4000 : 2500)
    let data
    if (RM) {
      // scroll through so every data-reveal section has met the observer, then settle 2 s and count running animations
      await S('Runtime.evaluate', { expression: `(async()=>{const h=document.documentElement.scrollHeight;for(let y=0;y<h;y+=innerHeight/2){scrollTo(0,y);await new Promise(r=>setTimeout(r,120))}scrollTo(0,0)})()`, awaitPromise: true })
      await sleep(2000)
    }
    try { const r = await S('Runtime.evaluate', { expression: `(${MEASURE})()`, returnByValue: true }); data = JSON.parse(r.result.value) } catch (e) { data = { error: String(e.message) } }
    data.route = route; data.vp = vpName
    let shot, file
    if (RM) {
      const { contentSize } = await S('Page.getLayoutMetrics')
      shot = await S('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width: w, height: Math.ceil(contentSize.height), scale: 1 } })
      file = CTRL ? `${SCRATCH}/walk/ctrl-${w}x${h}.png` : `${OUT}/landing-${w}x${h}-reduced-full.png`
    } else {
      shot = await S('Page.captureScreenshot', { format: 'png' })
      file = `${OUT}/${route}-${vpName}.png`
    }
    writeFileSync(file, Buffer.from(shot.data, 'base64'))
    results.push(data)
    console.log(`${route} ${vpName}: hscroll=${data.hscroll} sw=${data.sw}/${data.vw} overflowers=${data.overflowers?.length} overlaps=${data.overlaps?.length} anims=${data.anims}${data.error ? ' ERR ' + data.error : ''}`)
    await send('Target.closeTarget', { targetId })
  }
}
writeFileSync(`${SCRATCH}/walk/walk-${CTRL ? 'ctrl' : RM ? 'rm' : 'full'}-${routeF}-${vpF}.json`.replace(/,/g, '+'), JSON.stringify(results, null, 1))
ws.close(); chrome.kill()

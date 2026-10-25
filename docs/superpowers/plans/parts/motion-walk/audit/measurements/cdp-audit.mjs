// Responsive audit over CDP: emulate each viewport, run an in-page measuring script, optional interaction scenarios, screenshot.
// usage: node cdp-audit.mjs <route-filter|all> <viewport-filter|all> <scenario-filter|all>
import { spawn } from 'node:child_process'
import { writeFileSync, mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'
const require = createRequire('/home/yks/Projects/luminar/web/package.json')
const WebSocket = require('ws')

const AUDIT = '/home/yks/Projects/luminar/docs/superpowers/plans/parts/motion-walk/audit'
const SCRATCH = '/tmp/claude-1000/-home-yks-Projects-luminar/344950f1-b57c-4874-90b3-764debeb2b83/scratchpad'
mkdirSync(`${AUDIT}/states`, { recursive: true })
const [routeF = 'all', vpF = 'all', scF = 'all'] = process.argv.slice(2)

const ROUTES = {
  landing: 'http://127.0.0.1:9002/',
  'reels-sybil-eclipse': 'http://127.0.0.1:9002/reels/sybil-eclipse/',
  'reels-mainnet-block-wave': 'http://127.0.0.1:9002/reels/mainnet-block-wave/',
  figure: 'http://127.0.0.1:9002/figure/',
  '404': 'http://127.0.0.1:9002/404.html',
  sim: 'http://localhost:3000/sim/',
}
const VPS = [[390, 844, 1], [844, 390, 1], [768, 1024, 1], [1024, 768, 1], [1280, 720, 1], [1440, 900, 1], [1920, 1080, 1], [390, 844, 2], [1440, 900, 2]]
const isSim = r => r === 'sim' || r.startsWith('reels')
// scenarios: name → steps; each step {click: css} | {key} | {wait: ms} | {eval: js}
const SCENARIOS = {
  default: [],
  menu: [{ click: 'button[aria-expanded][aria-controls], header button[aria-expanded]' }, { wait: 700 }],
  legend: [{ click: 'aside[aria-label="Legend"] button[aria-label="Collapse legend"]' }, { wait: 300 }],
  settings: [{ click: 'aside[aria-label="Legend"] button[aria-label="Settings"]' }, { wait: 300 }],
  fault: [{ click: 'button[popovertarget="menu-fault"]' }, { wait: 500 }],
  reelsmenu: [{ click: 'button[popovertarget="menu-reels"]' }, { wait: 500 }],
  keyhelp: [{ key: '?' }, { wait: 500 }],
  logrow: [{ click: '[class*="drawerBtn"]:last-of-type' }, { wait: 600 }, { click: '[aria-label="Event log"] [role=button]' }, { wait: 600 }],
  stats: [{ click: '[class*=drawerBtn]:first-of-type' }, { wait: 600 }],
  hero: [{ eval: 'location.search = "?hero=1&theme=stage"' }, { wait: 5000 }],
}
const ROUTE_SCENARIOS = {
  landing: ['default', 'menu'],
  '404': ['default'], figure: ['default'],
  sim: ['default', 'menu', 'legend', 'settings', 'fault', 'reelsmenu', 'keyhelp', 'logrow', 'stats', 'hero'],
  'reels-sybil-eclipse': ['default', 'fault', 'logrow', 'hero'],
  'reels-mainnet-block-wave': ['default'],
}

const MEASURE = String(function () {
  const vw = innerWidth, vh = innerHeight
  const skip = el => !!el.closest('nextjs-portal, next-route-announcer')
  const sel = el => {
    let s = el.tagName.toLowerCase()
    if (el.id) s += '#' + el.id
    const c = [...el.classList].slice(0, 2).join('.'); if (c) s += '.' + c
    const t = (el.getAttribute('aria-label') || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 28)
    return s + (t ? ` "${t}"` : '')
  }
  const vis = el => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && cs.opacity !== '0' && !skip(el) }
  const inView = r => r.bottom > 0 && r.top < vh && r.right > 0 && r.left < vw
  const out = { vw, vh, sw: document.scrollingElement.scrollWidth, sh: document.scrollingElement.scrollHeight, hscroll: document.scrollingElement.scrollWidth > vw, overflowers: [], small: [], gaps: [], text: [], overlaps: [], clipped: [], rects: {}, inert: [], focusOutline: null }
  const all = [...document.querySelectorAll('body *')].filter(el => !skip(el))
  for (const el of all) { const r = el.getBoundingClientRect(); if (r.width > 0 && (r.right > vw + 1 || r.left < -1) && getComputedStyle(el).position !== 'fixed' && !el.closest('[data-dither], canvas') && !el.matches('canvas')) { out.overflowers.push({ sel: sel(el), l: Math.round(r.left), r: Math.round(r.right) }); if (out.overflowers.length > 25) break } }
  const inter = [...document.querySelectorAll('a[href],button,input,select,textarea,[role=button],[role=menuitem],[role=switch],[tabindex]:not([tabindex="-1"])')].filter(el => vis(el) && !el.closest('[inert]') && !(el.matches('input') && el.closest('label')))
  const rects = inter.map(el => ({ el, r: el.getBoundingClientRect() }))
  for (const { el, r } of rects) if ((r.width < 44 || r.height < 44) && inView(r)) out.small.push({ sel: sel(el), w: Math.round(r.width), h: Math.round(r.height) })
  for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
    const A = rects[i], B = rects[j]; if (A.el.contains(B.el) || B.el.contains(A.el)) continue
    const a = A.r, b = B.r
    const dx = Math.max(a.left - b.right, b.left - a.right), dy = Math.max(a.top - b.bottom, b.top - a.bottom)
    const horiz = dy < 0 && dx >= 0 && dx < 8, vert = dx < 0 && dy >= 0 && dy < 8
    if ((horiz || vert) && inView(a)) out.gaps.push({ a: sel(A.el), b: sel(B.el), gap: Math.round(Math.max(dx, dy) * 10) / 10 })
  }
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); const seen = new Map(); let n
  while ((n = walker.nextNode())) {
    if (!n.textContent.trim()) continue; const el = n.parentElement; if (!vis(el) || el.closest('[inert]')) continue
    const cs = getComputedStyle(el); const fs = parseFloat(cs.fontSize)
    const body = !!el.closest('p, li, dd.body') || el.matches('p, li')
    if (fs < (body ? 16 : 12)) { const k = sel(el) + '|' + fs; if (!seen.has(k)) seen.set(k, { sel: sel(el), fs: Math.round(fs * 10) / 10, body, font: cs.fontFamily.split(',')[0].replace(/['"]/g, '').slice(0, 24) }) }
  }
  out.text = [...seen.values()].slice(0, 80)
  const fa = all.filter(el => { const p = getComputedStyle(el).position; return (p === 'fixed' || p === 'absolute' || p === 'sticky') && vis(el) && !el.matches('canvas') && !el.closest('figure, [data-dither]') })
  const fr = fa.map(el => ({ el, r: el.getBoundingClientRect() }))
  const big = r => r.width >= vw * 0.9 && r.height >= vh * 0.5
  for (let i = 0; i < fr.length; i++) for (let j = i + 1; j < fr.length; j++) {
    const A = fr[i], B = fr[j]; if (A.el.contains(B.el) || B.el.contains(A.el)) continue
    const a = A.r, b = B.r; const ix = Math.min(a.right, b.right) - Math.max(a.left, b.left), iy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)
    if (ix > 2 && iy > 2 && !big(a) && !big(b) && !(A.el.parentElement === B.el.parentElement && getComputedStyle(A.el.parentElement).position === 'relative' && A.el.parentElement.closest('[class*=track], [class*=range]'))) out.overlaps.push({ a: sel(A.el), b: sel(B.el), ix: Math.round(ix), iy: Math.round(iy) })
  }
  out.overlaps = out.overlaps.slice(0, 40)
  for (const el of all) {
    if (!vis(el)) continue; const cs = getComputedStyle(el)
    if ((cs.overflowX === 'hidden' || cs.overflow === 'hidden' || cs.overflowX === 'clip') && el.scrollWidth > el.clientWidth + 2 && cs.textOverflow !== 'ellipsis' && !el.matches('canvas, video, figure, [class*=plate], [class*=field], [class*=shell], [class*=canvas], [class*=list], [class*=rail], [class*=events]')) { const t = (el.textContent || '').trim(); if (t) out.clipped.push({ sel: sel(el), sw: el.scrollWidth, cw: el.clientWidth }) }
    if (out.clipped.length > 20) break
  }
  const KEY = { toolbar: 'header', strip: '[class*="CommandStrip_strip"]', modes: '[role=group][aria-label=Layout]', legend: 'aside[aria-label=Legend]', narrator: '[aria-live=polite][aria-atomic]', range: 'input[type=range]', kbd: '.kbdHint', footer: 'footer', ticker: '[class*=ticker]', inspector: 'section[aria-label^="Peer "]', railL: '[data-rail=l]', railR: '[data-rail=r]', menu: '[popover]:popover-open, [role=dialog]', main: 'main', h1: 'h1', nav: 'nav', progress: '[role=progressbar]', faultBtn: 'button[popovertarget="menu-fault"]', speed10: '[aria-label=Speed] button:last-child', canvasCol: 'main[data-slot=canvas]', logBtn: '[class*="drawerBtn"]:last-of-type' }
  for (const [k, q] of Object.entries(KEY)) { const el = document.querySelector(q); if (el) { const r = el.getBoundingClientRect(); out.rects[k] = { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height), vis: vis(el), inert: !!el.closest('[inert]') } } }
  out.canvasFree = out.rects.strip && out.rects.toolbar ? Math.round(out.rects.strip.y - (out.rects.toolbar.y + out.rects.toolbar.h)) : null
  out.active = document.activeElement ? sel(document.activeElement) : null
  return JSON.stringify(out)
})

const PORT = Number(process.env.PORT || 9333)
const chrome = spawn('chromium', ['--headless=new', '--no-sandbox', '--disable-gpu', '--hide-scrollbars', `--remote-debugging-port=${PORT}`, `--user-data-dir=${SCRATCH}/cdp-prof-${PORT}`, '--window-size=1920,1080', 'about:blank'], { stdio: 'ignore' })
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
  for (const [w, h, dpr] of VPS) {
    const vpName = `${w}x${h}${dpr === 2 ? '@2x' : ''}`
    if (vpF !== 'all' && !vpF.split(',').some(v => vpName === v)) continue
    const scenarios = (ROUTE_SCENARIOS[route] || ['default']).filter(s => scF === 'all' ? (dpr === 1 || s === 'default') : scF.split(',').includes(s))
    for (const sc of scenarios) {
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
      await sleep(isSim(route) ? (route.startsWith('reels') ? 7000 : 3500) : route === 'figure' ? 4000 : 1500)
      let stepErr = null
      for (const step of SCENARIOS[sc]) {
        try {
          if (step.click) { const r = await S('Runtime.evaluate', { expression: `(()=>{const el=document.querySelector(${JSON.stringify(step.click)}); if(!el) return 'missing'; el.click(); return 'ok'})()`, returnByValue: true }); if (r.result.value !== 'ok') stepErr = `click ${step.click}: ${r.result.value}` }
          if (step.key) { await S('Input.dispatchKeyEvent', { type: 'keyDown', key: step.key, text: step.key, code: 'Slash', modifiers: 8 }); await S('Input.dispatchKeyEvent', { type: 'keyUp', key: step.key, code: 'Slash', modifiers: 8 }) }
          if (step.eval) await S('Runtime.evaluate', { expression: step.eval, returnByValue: true })
          if (step.wait) await sleep(step.wait)
        } catch (e) { stepErr = String(e.message) }
      }
      let data
      try { const r = await S('Runtime.evaluate', { expression: `(${MEASURE})()`, returnByValue: true }); data = JSON.parse(r.result.value) } catch (e) { data = { error: String(e.message) } }
      data.route = route; data.vp = vpName; data.scenario = sc; data.stepErr = stepErr
      const shot = await S('Page.captureScreenshot', { format: 'png' })
      const file = sc === 'default' ? `${AUDIT}/states/${route}-${w}x${h}${dpr === 2 ? '@2x' : ''}-cdp.png` : `${AUDIT}/states/${route}-${w}x${h}-${sc}.png`
      writeFileSync(file, Buffer.from(shot.data, 'base64'))
      results.push(data)
      console.log(`${route} ${vpName} ${sc}: hscroll=${data.hscroll} sw=${data.sw} small=${data.small?.length} gaps=${data.gaps?.length} text=${data.text?.length} overlaps=${data.overlaps?.length} clipped=${data.clipped?.length} canvasFree=${data.canvasFree}${stepErr ? ' STEP:' + stepErr : ''}`)
      await send('Target.closeTarget', { targetId })
    }
  }
}
writeFileSync(`${SCRATCH}/audit-${routeF}-${vpF}-${scF}.json`.replace(/,/g, '+'), JSON.stringify(results, null, 1))
ws.close(); chrome.kill()

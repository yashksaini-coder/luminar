async () => {
  await new Promise(r => setTimeout(r, 3000))
  performance.clearMeasures('layout')
  const longs = [], frames = []
  const po = new PerformanceObserver(l => { for (const e of l.getEntries()) longs.push({ at: Math.round(e.startTime - t0), ms: Math.round(e.duration) }) })
  po.observe({ type: 'longtask' })
  let run = true; const loop = t => { frames.push(t); if (run) requestAnimationFrame(loop) }; requestAnimationFrame(loop)
  const t0 = performance.now(); window.__rendered = {}; const nc0 = (window.__commits || []).length
  await fetch('http://localhost:8000/api/fault/sybil', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ n_attackers: 10, target_topic: 'lumina/blocks/1.0' }) })
  await new Promise(r => setTimeout(r, 6000)); run = false; po.disconnect()
  const per = {}; for (const f of frames) { const s = Math.floor((f - t0) / 1000); per[s] = (per[s] || 0) + 1 }
  const gaps = frames.slice(1).map((f, i) => f - frames[i]).sort((a, b) => a - b)
  const L = window.__luminar.layerIds(); const c0 = window.__commitsAt0
  return { longs, layouts: performance.getEntriesByName('layout').map(e => ({ at: Math.round(e.startTime - t0), ms: Math.round(e.duration) })), fpsPerSecond: per,
    gapP50: gaps[gaps.length >> 1].toFixed(1), gapP95: gaps[Math.floor(gaps.length * .95)].toFixed(1), layers: L, commits: (window.__commits || []).length - nc0, rendered: window.__rendered, attackers: window.__luminar.store.getState().nodes.filter(n => n.state === 'attacker').length }
}

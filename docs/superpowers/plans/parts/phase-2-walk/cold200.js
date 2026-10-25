async () => {
  const L = window.__luminar
  const post = (p, b) => fetch('http://localhost:8000' + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) })
  await post('/api/sim/reconfigure', { n_nodes: 50 })
  await new Promise(r => setTimeout(r, 3000))
  performance.clearMeasures('layout'); performance.mark('t0')
  const t0 = performance.now()
  let firstPaint = null, settled = null
  const done = new Promise(res => {
    const poll = () => {
      const s = L.store.getState()
      if (firstPaint === null && s.nodes.length === 200 && L.layerIds().includes('nodes')) firstPaint = performance.now()
      if (firstPaint !== null && s.edges.length > 0 && performance.getEntriesByName('layout', 'measure').length >= 1 && s.nodes.length === 200) {}
      requestAnimationFrame(poll)
    }
    requestAnimationFrame(poll)
    setTimeout(res, 3000)
  })
  const r = await post('/api/sim/reconfigure', { n_nodes: 200 })
  const tResp = performance.now()
  await done
  const m = performance.getEntriesByName('layout', 'measure')
  return { status: r.status, respMs: +(tResp - t0).toFixed(1), firstPaintAfterResp: firstPaint && +(firstPaint - tResp).toFixed(1),
    layouts: m.map(e => ({ at: +(e.startTime - tResp).toFixed(1), ms: +e.duration.toFixed(1) })),
    nodes: L.store.getState().nodes.length, edges: L.store.getState().edges.length, layers: L.layerIds(), sel: L.store.getState().selectedPeer }
}

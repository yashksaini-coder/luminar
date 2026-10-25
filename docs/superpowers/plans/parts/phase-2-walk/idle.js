async () => {
  const frames = []; let run = true; const loop = t => { frames.push(t); if (run) requestAnimationFrame(loop) }; requestAnimationFrame(loop)
  const longs = []; const po = new PerformanceObserver(l => { for (const e of l.getEntries()) longs.push(Math.round(e.duration)) }); po.observe({ type: 'longtask' })
  const nc0 = window.__commits.length; window.__rendered = {}
  // count deck redraws: luma's animation loop calls deck._onRenderFrame; read deck stats if exposed
  await new Promise(r => setTimeout(r, 3000)); run = false; po.disconnect()
  const gaps = frames.slice(1).map((f, i) => f - frames[i]).sort((a, b) => a - b)
  return { fps: +(frames.length / 3).toFixed(1), gapP50: gaps[gaps.length >> 1].toFixed(1), gapMax: gaps.at(-1).toFixed(1), longs, commits: window.__commits.length - nc0, rendered: window.__rendered, layers: window.__luminar.layerIds(), state: window.__luminar.store.getState().simState }
}

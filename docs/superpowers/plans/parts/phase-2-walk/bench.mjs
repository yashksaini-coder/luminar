// d3-force cost of a cold 200-node layout, outside the browser, with the forces of
// web/components/map/layout.ts. Usage: node bench.mjs snap-200.json [ticks=300] [collideIterations=2]
import { createRequire } from 'node:module'
import fs from 'node:fs'
const { forceCenter, forceCollide, forceLink, forceManyBody, forceSimulation } =
  createRequire(new URL('../../../../../web/package.json', import.meta.url))('d3-force')
const [file, ticks = '300', iters = '2'] = process.argv.slice(2)
const d = JSON.parse(fs.readFileSync(file))
const seen = new Set(), links = []
for (const n of d.nodes) for (const p of n.connected_peers) { const k = n.peer_id < p ? n.peer_id + p : p + n.peer_id; if (!seen.has(k)) { seen.add(k); links.push({ source: n.peer_id, target: p }) } }
const n = d.nodes.length, baseDist = Math.max(40, 400 / Math.sqrt(n)), initRadius = Math.min(300, n * 6)
for (let rep = 0; rep < 3; rep++) {
  const nodes = d.nodes.map((x, k) => ({ id: x.peer_id, x: initRadius * Math.cos(2 * Math.PI * k / n), y: initRadius * Math.sin(2 * Math.PI * k / n) }))
  const t = performance.now()
  const sim = forceSimulation(nodes).force('link', forceLink(links.map(l => ({ ...l }))).id(d => d.id).strength(0.4).distance(baseDist))
    .force('charge', forceManyBody().strength(-800).distanceMax(baseDist * 6).theta(0.9))
    .force('center', forceCenter(0, 0).strength(0.03)).force('collide', forceCollide(baseDist * 0.25).iterations(+iters)).stop()
  sim.alpha(1); for (let i = 0; i < +ticks; i++) sim.tick()
  console.log(`${n} nodes ${links.length} links ticks=${ticks} collide=${iters}: ${(performance.now() - t).toFixed(1)} ms`)
}

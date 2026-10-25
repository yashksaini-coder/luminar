/** The PAPER layer of the video mesh (the part that gets dithered): topology, mesh edges, honest discs, halos, message squares. */
import { BAND_DENSITY, scoreBand } from '../../components/map/palette'
import { snapshotAt, type ReelData } from '../reel/parse'
import { activeParticles, flightS } from './particles'
import type { Projector } from './view'

export interface MeshStyle { nodeR: number; edgeAlpha: number; meshAlpha: number; intensity: number; field?: number }
export const DEFAULT_MESH_STYLE: MeshStyle = { nodeR: 7, edgeAlpha: 0.4, meshAlpha: 0.55, intensity: 1 }

const PAPER = '242,242,239'
const FLASH_S = 6 / 30

export function drawMesh(
  ctx: CanvasRenderingContext2D, d: ReelData, p: Projector, simTime: number, s: MeshStyle,
  opts: { attackers?: boolean; flashUntil?: Record<string, number> } = {},
): void {
  const snap = snapshotAt(d, simTime)
  const honest = (id: string) => { const n = d.byId.get(id); return n && !n.attacker ? n : undefined }
  const at = (id: string) => { const n = d.byId.get(id)!; return p(n.x, n.y) }
  const paper = (a: number) => `rgba(${PAPER},${a})`
  const line = (a: string, b: string) => { const [x0, y0] = at(a), [x1, y1] = at(b); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1) }

  ctx.save()
  // opaque pitch ground: the dither reads RGB luma, so paper at alpha a must composite onto black to read as a
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = 'rgb(0,0,0)'; ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height); ctx.restore()
  ctx.globalAlpha = s.intensity
  if (s.field) { ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = paper(s.field); ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height); ctx.restore() }

  ctx.lineWidth = 1; ctx.strokeStyle = paper(s.edgeAlpha); ctx.beginPath()
  for (const [a, b] of d.edges) if (honest(a) && honest(b)) line(a, b)
  ctx.stroke()

  ctx.lineWidth = 1.5; ctx.strokeStyle = paper(s.meshAlpha); ctx.beginPath()
  for (const [a, peers] of Object.entries(snap.mesh)) {
    if (!honest(a)) continue
    for (const b of peers) if (a < b && honest(b)) line(a, b)
  }
  ctx.stroke()

  const flashed = new Set<string>()
  for (const m of d.messages) {
    if (m.at > simTime) break
    const arrive = m.at + flightS(m.latencyMs)
    if (arrive <= simTime && arrive > simTime - FLASH_S) flashed.add(m.to)
  }
  for (const [id, until] of Object.entries(opts.flashUntil ?? {})) if (until > simTime) flashed.add(id)

  for (const n of d.nodes) {
    if (n.attacker) continue
    const [x, y] = p(n.x, n.y), r = s.nodeR
    const band = scoreBand(snap.scores[n.id] ?? 0)
    if (band > 0) {
      ctx.fillStyle = paper(BAND_DENSITY[band]); ctx.beginPath()
      ctx.arc(x, y, 1.7 * r, 0, Math.PI * 2); ctx.arc(x, y, r + 1, 0, Math.PI * 2, true)
      ctx.fill()
    }
    ctx.beginPath()
    if (flashed.has(n.id)) { ctx.arc(x, y, r + 3, 0, Math.PI * 2); ctx.fillStyle = paper(1); ctx.fill() }
    else if ((snap.states[n.id] ?? 'idle') === 'idle') { ctx.arc(x, y, r - 0.5, 0, Math.PI * 2); ctx.lineWidth = 1; ctx.strokeStyle = paper(1); ctx.stroke() }
    else { ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fillStyle = paper(1); ctx.fill() }
  }

  ctx.fillStyle = paper(1); ctx.strokeStyle = paper(1); ctx.lineWidth = 1; ctx.setLineDash([2, 2])
  for (const q of activeParticles(d, simTime, { attackers: opts.attackers })) {
    if (q.kind === 'spam') continue
    const [x0, y0] = at(q.from), [x1, y1] = at(q.to)
    const x = x0 + (x1 - x0) * q.progress, y = y0 + (y1 - y0) * q.progress
    if (q.kind === 'iwant') { ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x, y); ctx.stroke() }
    ctx.fillRect(x - 2, y - 2, 4, 4)
  }
  ctx.restore()
}

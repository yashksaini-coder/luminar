/** The flat FLAME layer above the dithered mesh (never dithered): attack edges, attacker diamonds, spam squares, negative-score halos. */
import type { JSX } from 'react'
import { Diamond } from '../../components/dither/Diamond'
import { snapshotAt, type ReelData } from '../reel/parse'
import { attackEdgesAt, attackersAt, EDGE_LINGER_S } from './attackers'
import { DEFAULT_MESH_STYLE } from './drawMesh'
import { activeParticles } from './particles'
import type { Box, Projector } from './view'

const FLASH_S = 3 / 30
const DIAMOND = 16
const SPAM = 3

export function Attackers({ data, p, simTime, box }: { data: ReelData; p: Projector; simTime: number; box: Box }): JSX.Element {
  const attackers = attackersAt(data, simTime)
  const opacity = new Map(attackers.map(a => [a.id, a.fading]))
  const snap = snapshotAt(data, simTime)
  const r = DEFAULT_MESH_STYLE.nodeR
  const at = (id: string) => { const n = data.byId.get(id)!; return p(n.x, n.y) }

  return (
    <svg width={box.w} height={box.h} viewBox={`${box.x} ${box.y} ${box.w} ${box.h}`}
      style={{ position: 'absolute', left: box.x, top: box.y, overflow: 'visible' }} aria-hidden="true">
      {data.nodes.filter(n => !n.attacker && (snap.scores[n.id] ?? 0) < 0).map(n => {
        const [x, y] = p(n.x, n.y), R = 1.7 * r, ri = r + 1
        return <path key={`h-${n.id}`} fillRule="evenodd" fill="var(--flame)" fillOpacity={0.12}
          d={`M${x - R},${y}a${R},${R} 0 1,0 ${2 * R},0a${R},${R} 0 1,0 ${-2 * R},0ZM${x - ri},${y}a${ri},${ri} 0 1,0 ${2 * ri},0a${ri},${ri} 0 1,0 ${-2 * ri},0Z`} />
      })}
      {attackEdgesAt(data, simTime).filter(e => opacity.has(e.to)).map(e => {
        const [x0, y0] = at(e.from), [x1, y1] = at(e.to)
        const since = e.prunedAt === undefined ? -1 : simTime - e.prunedAt
        const len = since < 0 ? 1 : Math.max(0, 1 - since / EDGE_LINGER_S)  // wipe toward the honest end
        const strong = since >= 0 && since < FLASH_S
        return <line key={`e-${e.from}-${e.to}-${e.since}`} x1={x0} y1={y0} x2={x0 + (x1 - x0) * len} y2={y0 + (y1 - y0) * len}
          stroke="var(--flame)" strokeWidth={strong ? 2 : 1} strokeDasharray={strong ? undefined : '4 3'} strokeOpacity={(strong ? 1 : 0.55) * opacity.get(e.to)!} />
      })}
      {activeParticles(data, simTime).filter(q => q.kind === 'spam').map((q, i) => {
        const [x0, y0] = at(q.from), [x1, y1] = at(q.to)
        const x = x0 + (x1 - x0) * q.progress, y = y0 + (y1 - y0) * q.progress
        const len = Math.hypot(x1 - x0, y1 - y0) || 1, tx = ((x0 - x1) / len) * SPAM, ty = ((y0 - y1) / len) * SPAM
        const o = opacity.get(q.from) ?? 1
        return (
          <g key={`s-${i}`} fill="var(--flame)" opacity={o}>
            <rect x={x + tx - SPAM / 2} y={y + ty - SPAM / 2} width={SPAM} height={SPAM} opacity={0.5} />
            <rect x={x - SPAM / 2} y={y - SPAM / 2} width={SPAM} height={SPAM} />
          </g>
        )
      })}
      {attackers.map(a => {
        const [x, y] = p(a.x, a.y)
        return (
          <g key={a.id} transform={`translate(${x - DIAMOND / 2},${y - DIAMOND / 2})`} opacity={a.fading}>
            <Diamond size={DIAMOND} pruned={a.pruned} />
          </g>
        )
      })}
    </svg>
  )
}

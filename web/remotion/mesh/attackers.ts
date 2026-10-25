/** Attacker presence, prune state and attack edges at a sim time, from the reel's snapshots and GRAFT/PRUNE events. */
import { snapshotAt, type ReelData } from '../reel/parse'

export interface AttackerView { id: string; x: number; y: number; pruned: boolean; fading: number /* 0..1 */; victims: string[] }
export interface AttackEdge { from: string /* honest */; to: string /* attacker */; since: number; prunedAt?: number }

export const FADE_S = 10 / 30
/** How long a pruned attack edge is still returned so the erase wipe can draw (6 frames). */
export const EDGE_LINGER_S = 6 / 30

export function attackersAt(d: ReelData, simTime: number): AttackerView[] {
  const out: AttackerView[] = []
  for (const n of d.nodes) {
    if (!n.attacker || simTime < n.firstSeenT) continue
    const clearedAt = d.cleared.find(c => c.at >= n.firstSeenT)?.at ?? Infinity
    if (simTime >= clearedAt + FADE_S) continue
    const prunes = d.prunes.filter(p => p.to === n.id)
    const pruned = prunes.some(p => p.at <= simTime)
    const connected = snapshotAt(d, simTime).connected[n.id] ?? []
    const victims = !pruned && connected.length > 0 ? connected : [...new Set(prunes.map(p => p.from))]
    const fading = simTime < clearedAt ? 1 : 1 - (simTime - clearedAt) / FADE_S
    out.push({ id: n.id, x: n.x, y: n.y, pruned, fading, victims })
  }
  return out
}

export function attackEdgesAt(d: ReelData, simTime: number): AttackEdge[] {
  const isAttacker = (id: string) => d.byId.get(id)?.attacker ?? false
  const out: AttackEdge[] = []
  for (const g of d.grafts) {
    if (g.at > simTime) break
    if (isAttacker(g.from) === isAttacker(g.to)) continue
    const [from, to] = isAttacker(g.to) ? [g.from, g.to] : [g.to, g.from]
    const prunedAt = d.prunes.find(p => p.at >= g.at && ((p.from === from && p.to === to) || (p.from === to && p.to === from)))?.at
    if (prunedAt !== undefined && simTime >= prunedAt + EDGE_LINGER_S) continue
    out.push({ from, to, since: g.at, prunedAt: prunedAt !== undefined && prunedAt <= simTime ? prunedAt : undefined })
  }
  return out
}

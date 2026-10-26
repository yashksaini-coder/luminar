/** Message particles in flight at a sim time, from the reel's GossipMessage events. */
import type { ReelData, ReelMessage } from '../reel/parse'

export const PARTICLE_MIN_MS = 400
/** An IWANT pull flies slower than a mesh push and lands on its logged time (+ a 2-frame hold) so the still at that frame shows it arriving. */
export const IWANT_MS = 900
const LAND_HOLD_S = 2 / 30

export interface Particle { from: string; to: string; progress: number /* 0..1 */; kind: 'message' | 'spam' | 'iwant' }

/** Flight time (s) of a message: its latency, never shorter than PARTICLE_MIN_MS so it stays visible. */
export const flightS = (latencyMs: number) => Math.max(latencyMs, PARTICLE_MIN_MS) / 1000

/** [departure, arrival] in sim s: a push leaves at `at`; an IWANT pull arrives at `at`. */
export function flightWindow(m: ReelMessage): [number, number] {
  return m.via === 'iwant' ? [m.at - IWANT_MS / 1000, m.at] : [m.at, m.at + flightS(m.latencyMs)]
}

export function activeParticles(d: ReelData, simTime: number, opts: { attackers?: boolean } = {}): Particle[] {
  const attackers = opts.attackers ?? true
  const out: Particle[] = []
  // ponytail: linear scan of every message per frame; binary-search on `at` if reels grow past ~100k messages
  for (const m of d.messages) {
    if (m.at > simTime + IWANT_MS / 1000) break
    const [t0, t1] = flightWindow(m)
    const iwant = m.via === 'iwant' && !m.spam
    if (simTime < t0 || simTime >= t1 + (iwant ? LAND_HOLD_S : 0)) continue
    if (!attackers && (m.spam || d.byId.get(m.from)?.attacker || d.byId.get(m.to)?.attacker)) continue
    out.push({ from: m.from, to: m.to, progress: Math.min(1, (simTime - t0) / (t1 - t0)), kind: m.spam ? 'spam' : iwant ? 'iwant' : 'message' })
  }
  return out
}

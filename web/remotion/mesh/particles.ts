/** Message particles in flight at a sim time, from the reel's GossipMessage events. */
import type { ReelData } from '../reel/parse'

export const PARTICLE_MIN_MS = 400

export interface Particle { from: string; to: string; progress: number /* 0..1 */; kind: 'message' | 'spam' | 'iwant' }

/** Flight time (s) of a message: its latency, never shorter than PARTICLE_MIN_MS so it stays visible. */
export const flightS = (latencyMs: number) => Math.max(latencyMs, PARTICLE_MIN_MS) / 1000

export function activeParticles(d: ReelData, simTime: number, opts: { attackers?: boolean } = {}): Particle[] {
  const attackers = opts.attackers ?? true
  const out: Particle[] = []
  // ponytail: linear scan of every message per frame; binary-search on `at` if reels grow past ~100k messages
  for (const m of d.messages) {
    if (m.at > simTime) break
    const dur = flightS(m.latencyMs)
    if (simTime >= m.at + dur) continue
    if (!attackers && (m.spam || d.byId.get(m.from)?.attacker || d.byId.get(m.to)?.attacker)) continue
    out.push({ from: m.from, to: m.to, progress: (simTime - m.at) / dur, kind: m.spam ? 'spam' : m.via === 'iwant' ? 'iwant' : 'message' })
  }
  return out
}

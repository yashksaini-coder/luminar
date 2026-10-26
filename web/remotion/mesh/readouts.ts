/** Ticker and score-strip numbers read straight from the reel's analytics frames, messages and gossip_score. */
import { analyticsAt, snapshotAt, type ReelData } from '../reel/parse'

export function tickerAt(d: ReelData, simTime: number): { delivery: number; hops: number; ms: number } | null {
  const a = analyticsAt(d, simTime)
  return a && { delivery: a.delivery, hops: a.hops, ms: a.propagationMs }
}

export function invalidCountAt(d: ReelData, simTime: number): number {
  return d.messages.filter(m => m.spam && m.at <= simTime).length
}

/** Steps on snapshots, like the inspector. */
export function scoreAt(d: ReelData, peer: string, simTime: number): number | null {
  return snapshotAt(d, simTime)?.scores[peer] ?? null
}

export function healedInS(d: ReelData): number | null {
  const at = d.cleared[0]?.at
  if (at === undefined) return null
  const a = d.analytics.find(x => x.time > at && x.delivery >= 0.95)
  return a ? Math.round((a.time - at) * 10) / 10 : null
}

export function fmtTicker(t: ReturnType<typeof tickerAt>, extra?: { invalid?: number; healedIn?: number | null }): string[] {
  const out = t
    ? [`delivery ${Math.round(t.delivery * 100)} %`, `hops ${t.hops.toFixed(1)}`, `${Math.round(t.ms)} ms`]
    : ['delivery —', 'hops —', '— ms']
  if (extra?.invalid && extra.invalid >= 1) out.push(`invalid ${extra.invalid}`)
  if (extra?.healedIn) out.push(`healed in ${extra.healedIn.toFixed(1)} s`)
  return out
}

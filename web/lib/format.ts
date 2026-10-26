import type { CdfPoint, PeerNode } from '@/lib/types'

export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0.0s'
  if (seconds < 60) return seconds.toFixed(1) + 's'
  const r = Math.round(seconds) // round first, or 119.96 renders as 1:60
  return `${Math.floor(r / 60)}:${String(r % 60).padStart(2, '0')}`
}

export function formatNumber(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K'
  return String(n)
}

/** "1,284" under 10k, "61.9K" above. */
export function fmtCount(n: number): string {
  return n < 10_000 ? n.toLocaleString('en-US') : formatNumber(n)
}

export function fmtLatency(ms: number): string {
  return ms >= 1000 ? (ms / 1000).toFixed(1) + 's' : ms.toFixed(0) + 'ms'
}

export function signed(v: number): string {
  return (v < 0 ? '-' : '+') + Math.abs(v).toFixed(2)
}

/** n12 for simulated peers, the raw id for attackers/telemetry peers. */
export function shortName(node: { peer_id: string; index: number }): string {
  return node.peer_id.startsWith('peer-') ? `n${node.index}` : node.peer_id
}

export function shortId(id: string): string {
  return id.startsWith('peer-') ? 'n' + id.slice(5) : id
}

export function isAttackerId(id: string): boolean {
  return /^(sybil|eclipse)-/.test(id)
}

export function isPruned(node: Pick<PeerNode, 'state' | 'connected_peers'>): boolean {
  return node.state === 'attacker' && node.connected_peers.length === 0
}

export function isSimPeer(nd: Pick<PeerNode, 'is_real' | 'is_telemetry'>): boolean {
  return !nd.is_real && !nd.is_telemetry
}

/** min / max latency and the point nearest p50. */
export function cdfStats(pts: CdfPoint[]): { min: number; max: number; p50: number } {
  const p50 = pts.reduce((a, b) => (Math.abs(b.percentile - 50) < Math.abs(a.percentile - 50) ? b : a))
  return { min: pts[0].latency_ms, max: pts[pts.length - 1].latency_ms, p50: p50.latency_ms }
}

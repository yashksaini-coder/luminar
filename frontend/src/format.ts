export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0.0s'
  if (seconds < 60) return seconds.toFixed(1) + 's'
  const r = Math.round(seconds)  // round first, or 119.96 renders as 1:60
  return `${Math.floor(r / 60)}:${String(r % 60).padStart(2, '0')}`
}

export function formatNumber(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K'
  return String(n)
}

export function truncatePeerId(peerId: string): string {
  return peerId.replace('peer-', '#')
}


/** Short display name: n12 for simulated peers, the raw id for attackers/telemetry peers. */
export function shortName(node: { peer_id: string; index: number }): string {
  return node.peer_id.startsWith('peer-') ? `n${node.index}` : node.peer_id
}

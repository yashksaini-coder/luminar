export function formatTime(seconds: number): string {
  if (seconds < 0) return '0.0s'
  if (seconds < 60) return seconds.toFixed(1) + 's'
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toFixed(0).padStart(2, '0')}`
}

export function formatNumber(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K'
  return String(n)
}

export function truncatePeerId(peerId: string): string {
  return peerId.replace('peer-', '#')
}


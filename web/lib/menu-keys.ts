/** Roving-tabindex arithmetic for role="menu" (spec §10). */

export function nextMenuIndex(current: number, key: string, count: number): number | null {
  if (count === 0) return null
  switch (key) {
    case 'ArrowDown': return (current + 1) % count
    case 'ArrowUp': return (current - 1 + count) % count
    case 'Home': return 0
    case 'End': return count - 1
    default: return null
  }
}

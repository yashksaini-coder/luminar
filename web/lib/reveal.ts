// web/lib/reveal.ts
// The one scroll-reveal mechanism (plan D2): a single IntersectionObserver over every [data-reveal]
// section sets data-in once ≥30% of it is visible and forgets it; globals.css animates the children.
// ponytail: a section taller than ~3.3 viewports never reaches .3 — none on this site is; add a
// height-aware threshold if one appears.
export const REVEAL_RATIO = 0.3

export function attachReveal(root: ParentNode = document): () => void {
  const pending = Array.from(root.querySelectorAll<HTMLElement>('[data-reveal]:not([data-in])'))
  if (typeof IntersectionObserver === 'undefined') {
    for (const el of pending) el.dataset.in = '1'
    return () => {}
  }
  const io = new IntersectionObserver(entries => {
    for (const e of entries) {
      const i = pending.indexOf(e.target as HTMLElement)
      if (i < 0 || e.intersectionRatio < REVEAL_RATIO) continue
      ;(e.target as HTMLElement).dataset.in = '1'
      io.unobserve(e.target)
      pending.splice(i, 1)
    }
    if (!pending.length) io.disconnect()
  }, { threshold: REVEAL_RATIO })
  for (const el of pending) io.observe(el)
  return () => io.disconnect()
}

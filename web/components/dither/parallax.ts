// Plate parallax: layers marked data-depth travel --parallax-travel × depth across the plate's
// scroll life (backboard teardown §9). Inert under reduced motion, where the token is 0px.
import { type RefObject, useEffect } from 'react'
import { reducedMotion } from '@/lib/prefs'

export function attachParallax(root: HTMLElement): () => void {
  if (reducedMotion()) return () => {}
  const travel = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--parallax-travel')) || 0
  if (travel === 0) return () => {}
  let queued = false
  const frame = () => {
    queued = false
    const vh = innerHeight, r = root.getBoundingClientRect()
    if (r.bottom < -100 || r.top > vh + 100) return
    const p = Math.min(1, Math.max(0, (vh - r.top) / (vh + r.height)))
    // Queried per frame: DitherImage swaps its skeleton for a canvas after decode, and a layer bound once would stay on the detached div.
    for (const el of root.querySelectorAll<HTMLElement>('[data-depth]')) el.style.transform = `translate3d(0, ${((p - 0.5) * travel * Number(el.dataset.depth)).toFixed(1)}px, 0)`
  }
  const on = () => { if (!queued) { queued = true; requestAnimationFrame(frame) } }
  addEventListener('scroll', on, { passive: true }); addEventListener('resize', on); frame()
  return () => { removeEventListener('scroll', on); removeEventListener('resize', on) }
}

export function useParallax(ref: RefObject<HTMLElement | null>): void {
  useEffect(() => (ref.current ? attachParallax(ref.current) : undefined), [ref])
}

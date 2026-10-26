'use client'
// The loupe: on fine pointers, a 132 px square of the un-dithered source follows the pointer over the plate (spec §7).
import { type RefObject, useEffect, useRef } from 'react'
import { drawLoupe, LOUPE_PX } from './dither'

export interface LoupeProps { plateRef: RefObject<HTMLElement | null>; final: ImageData | null; source: CanvasImageSource | null; cover: [number, number, number, number]; size?: number }

export default function Loupe({ plateRef, final, source, cover, size = LOUPE_PX }: LoupeProps) {
  const last = useRef<[number, number] | null>(null)
  const [sx, sy, sw, sh] = cover
  useEffect(() => {
    const plate = plateRef.current
    if (typeof window === 'undefined' || !matchMedia('(hover: hover) and (pointer: fine)').matches || !final || !source || !plate) return
    const canvas = plate.querySelector<HTMLCanvasElement>('canvas[data-dither]')
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    let shown = false
    const restore = () => { if (shown) { ctx.putImageData(final, 0, 0); shown = false } }
    const paint = () => {
      if (!last.current) return
      const r = canvas.getBoundingClientRect()
      const x = last.current[0] - r.left, y = last.current[1] - r.top
      if (x >= 0 && y >= 0 && x <= r.width && y <= r.height) { drawLoupe(ctx, final, source, [sx, sy, sw, sh], x, y, size); shown = true }
      else restore()
    }
    const onMove = (e: PointerEvent) => { last.current = [e.clientX, e.clientY]; paint() }
    const onLeave = () => { last.current = null; restore() }
    paint()   // final changed (resize, Fig. 1 loop): redraw at the last pointer position
    document.addEventListener('pointermove', onMove)
    plate.addEventListener('pointerleave', onLeave)
    window.addEventListener('blur', onLeave)
    return () => {
      document.removeEventListener('pointermove', onMove)
      plate.removeEventListener('pointerleave', onLeave)
      window.removeEventListener('blur', onLeave)
    }
  }, [plateRef, final, source, sx, sy, sw, sh, size])
  return null
}

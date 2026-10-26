'use client'
// One canvas for every pixel effect on the landing (spec "Shared engine"). The box is sized by CSS
// (className), so the server markup reserves it and nothing shifts. The client draws renderField() at
// cell resolution as crisp squares (dots for halftone/scatter), animates on requestAnimationFrame only
// while ≥10% of it is on screen, caps DPR at 2, and draws one still frame under reduced motion.
import { type CSSProperties, useEffect, useRef } from 'react'
import { reducedMotion } from '@/lib/prefs'
import { DOT_PRESETS, jitter, type Preset, renderField } from './pixel-field'
import styles from './fx.module.css'

export type Tint = 'signal' | 'paper' | 'flame'
const TINT_VAR: Record<Tint, string> = { signal: '--signal', paper: '--paper-0', flame: '--flame' }
export const VISIBLE_RATIO = 0.1
/** the frame a still (reduced motion) shows: the publish wave is mid-globe */
export const STILL_T = 2.6

export interface PixelFieldProps {
  preset: Preset
  /** body colour */
  tint?: Tint
  /** colour of the accent cells (the attacking part, the centre); defaults to tint */
  accent?: Tint
  /** CSS px per cell */
  cell?: number
  density?: number
  speed?: number
  /** sphere: network nodes on the globe */
  nodes?: number
  className?: string
  style?: CSSProperties
  'aria-label'?: string
}

export default function PixelField({ preset, tint = 'signal', accent, cell = 6, density = 1, speed = 1, nodes, className, style, 'aria-label': label }: PixelFieldProps) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const c = ref.current, ctx = c?.getContext('2d')
    if (!c || !ctx) return
    const css = getComputedStyle(c)
    const colour = (t: Tint) => css.getPropertyValue(TINT_VAR[t]).trim() || '#4ddcdc'
    const tones = ['', colour(tint), colour(accent ?? tint), colour('paper')]
    const dots = DOT_PRESETS.includes(preset)
    let w = 0, h = 0, dpr = 1

    const draw = (t: number) => {
      if (!w || !h) return
      const px = cell * dpr, cols = Math.floor(c.width / px), rows = Math.floor(c.height / px)
      const f = renderField(preset, t, cols, rows, { density, nodes })
      const ox = Math.floor((c.width - cols * px) / 2), oy = Math.floor((c.height - rows * px) / 2)
      const gap = Math.max(1, Math.round(px * 0.22)), size = Math.round(px) - gap
      ctx.clearRect(0, 0, c.width, c.height)
      for (let k = 1; k <= 3; k++) {   // one path per tone: thousands of rects, three fills
        ctx.beginPath()
        for (let i = 0; i < f.tone.length; i++) {
          if (f.tone[i] !== k) continue
          const x = i % cols, y = (i - x) / cols
          if (dots) {
            const [jx, jy] = preset === 'scatter' ? jitter(x, y, cols, rows) : [0, 0]
            const r = (preset === 'scatter' ? 0.42 : 0.5 * Math.sqrt(f.v[i])) * px
            const X = ox + (x + 0.5 + jx) * px, Y = oy + (y + 0.5 + jy) * px
            ctx.moveTo(X + r, Y); ctx.arc(X, Y, r, 0, Math.PI * 2)
          } else ctx.rect(ox + Math.round(x * px), oy + Math.round(y * px), size, size)
        }
        ctx.fillStyle = tones[k]; ctx.globalAlpha = k === 1 && !dots ? 0.5 : 1   // the body recedes so edges and nodes read
        ctx.fill()
      }
      ctx.globalAlpha = 1
    }

    const still = reducedMotion()
    let raf = 0, last: number | undefined, clock = STILL_T, on = false
    const tick = (now: number) => {
      clock += Math.min(0.1, (now - (last ?? now)) / 1000) * speed   // a background tab resumes, not jumps
      last = now
      draw(clock)
      raf = requestAnimationFrame(tick)
    }
    const start = () => { if (!on && !still) { on = true; last = undefined; raf = requestAnimationFrame(tick) } }
    const stop = () => { on = false; cancelAnimationFrame(raf) }

    const size = () => {
      w = c.clientWidth; h = c.clientHeight; dpr = Math.min(window.devicePixelRatio || 1, 2)
      c.width = Math.round(w * dpr); c.height = Math.round(h * dpr)
      draw(clock)
    }
    size()
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(size) : undefined
    ro?.observe(c)
    let io: IntersectionObserver | undefined
    if (typeof IntersectionObserver !== 'undefined') {
      io = new IntersectionObserver(([e]) => (e.intersectionRatio >= VISIBLE_RATIO ? start() : stop()), { threshold: [0, VISIBLE_RATIO] })
      io.observe(c)
    }
    return () => { stop(); ro?.disconnect(); io?.disconnect() }
  }, [preset, tint, accent, cell, density, speed, nodes])

  return (
    <canvas ref={ref} className={`${styles.field}${className ? ` ${className}` : ''}`} style={style} data-preset={preset}
      {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })} />
  )
}

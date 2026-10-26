'use client'

// Canvas sparkline: a translucent area under a 1.5 px accent line, a hairline baseline and a dot on the
// latest value, optional dashed zero line. Plain chart marks, no dither: the trend has to read at a glance.
// Colours re-read per draw because the stage theme swaps tokens.
import { useEffect, useRef, useState } from 'react'
import { sparkPoints } from '@/lib/spark'

// Shared with StatsRail's CDF so the DPR policy lives in one place.
export function sizeCanvas(cv: HTMLCanvasElement, ctx: CanvasRenderingContext2D, w: number, h: number) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  cv.width = Math.round(w * dpr)
  cv.height = Math.round(h * dpr)
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, w, h)
}

/** Fills the path under a line (closed down to the baseline) with the ink at low alpha. */
export function fillUnder(ctx: CanvasRenderingContext2D, pts: readonly (readonly [number, number])[], base: number, ink: string, alpha = 0.16) {
  ctx.beginPath()
  ctx.moveTo(pts[0][0], base)
  for (const [x, y] of pts) ctx.lineTo(x, y)
  ctx.lineTo(pts[pts.length - 1][0], base)
  ctx.closePath()
  ctx.globalAlpha = alpha
  ctx.fillStyle = ink
  ctx.fill()
  ctx.globalAlpha = 1
}

export interface SparklineProps {
  values: number[]; height?: number; domain?: [number, number]; zeroLine?: boolean; alarm?: boolean; 'aria-label': string
}

export default function Sparkline({ values, height = 36, domain, zeroLine, alarm, 'aria-label': label }: SparklineProps) {
  const ref = useRef<HTMLCanvasElement>(null)
  const [width, setWidth] = useState(0)
  const h = Math.max(12, height)

  useEffect(() => {
    const parent = ref.current?.parentElement
    if (!parent) return
    const ro = new ResizeObserver(([e]) => setWidth(Math.floor(e.contentRect.width)))
    ro.observe(parent)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    const cv = ref.current
    const ctx = cv?.getContext('2d')
    if (!cv || !ctx || width === 0) return
    sizeCanvas(cv, ctx, width, h)
    if (values.length < 2) return
    const css = getComputedStyle(document.documentElement)
    const tok = (n: string) => css.getPropertyValue(n).trim()
    const ink = tok(alarm ? '--flame' : '--signal')
    const { pts } = sparkPoints(values, width - 3, h - 3, domain)   // room for the end dot
    const shifted = pts.map(([x, y]) => [x + 1, y + 1.5] as const)

    ctx.beginPath()   // baseline
    ctx.moveTo(0, h - 0.5); ctx.lineTo(width, h - 0.5)
    ctx.strokeStyle = tok('--hair'); ctx.lineWidth = 1; ctx.stroke()

    fillUnder(ctx, shifted, h, ink)
    ctx.beginPath()
    shifted.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)))
    ctx.strokeStyle = ink
    ctx.lineWidth = 1.5
    ctx.lineJoin = 'round'
    ctx.stroke()

    const [ex, ey] = shifted[shifted.length - 1]   // latest value
    ctx.beginPath(); ctx.arc(ex, ey, 2, 0, Math.PI * 2); ctx.fillStyle = ink; ctx.fill()

    const { zeroY } = sparkPoints(values, width - 3, h - 3, domain)
    if (zeroLine && zeroY !== null) {
      ctx.beginPath()
      ctx.setLineDash([2, 2])
      ctx.moveTo(0, zeroY + 1.5)
      ctx.lineTo(width, zeroY + 1.5)
      ctx.strokeStyle = tok('--hair-strong')
      ctx.lineWidth = 1
      ctx.stroke()
      ctx.setLineDash([])
    }
  }, [values, domain, alarm, zeroLine, width, h])

  return <canvas ref={ref} role="img" aria-label={label} style={{ display: 'block', width: '100%', height: h }} />
}

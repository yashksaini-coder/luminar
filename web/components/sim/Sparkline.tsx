'use client'

// Canvas sparkline: dithered area (2×2 checker at --cell-ui, the only dither here), 1.5 px line,
// optional dashed zero line. Colours re-read per draw because the stage theme swaps tokens.
import { useEffect, useRef, useState } from 'react'
import { sparkPoints } from '@/lib/spark'

// Shared with StatsRail's CDF so DPR policy and dither cell live in one place.
export function sizeCanvas(cv: HTMLCanvasElement, ctx: CanvasRenderingContext2D, w: number, h: number) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  cv.width = Math.round(w * dpr)
  cv.height = Math.round(h * dpr)
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, w, h)
}

export function checkerPattern(ctx: CanvasRenderingContext2D, ink: string, cell: number) {
  const tile = document.createElement('canvas')
  tile.width = tile.height = cell * 2
  const tctx = tile.getContext('2d')!
  tctx.fillStyle = ink
  tctx.fillRect(0, 0, cell, cell)
  tctx.fillRect(cell, cell, cell, cell)
  return ctx.createPattern(tile, 'repeat')
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
    const ink = tok(alarm ? '--flame' : '--fg')
    const cell = parseFloat(tok('--cell-ui')) || 4
    const { pts, zeroY } = sparkPoints(values, width, h, domain)

    const pattern = checkerPattern(ctx, ink, cell)
    if (pattern) {
      ctx.beginPath()
      ctx.moveTo(pts[0][0], h)
      for (const [x, y] of pts) ctx.lineTo(x, y)
      ctx.lineTo(pts[pts.length - 1][0], h)
      ctx.closePath()
      ctx.fillStyle = pattern
      ctx.fill()
    }

    ctx.beginPath()
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)))
    ctx.strokeStyle = ink
    ctx.lineWidth = 1.5
    ctx.stroke()

    if (zeroLine && zeroY !== null) {
      ctx.beginPath()
      ctx.setLineDash([2, 2])
      ctx.moveTo(0, zeroY)
      ctx.lineTo(width, zeroY)
      ctx.strokeStyle = tok('--hair-strong')
      ctx.lineWidth = 1
      ctx.stroke()
      ctx.setLineDash([])
    }
  }, [values, domain, alarm, zeroLine, width, h])

  return <canvas ref={ref} role="img" aria-label={label} style={{ display: 'block', width: '100%', height: h }} />
}

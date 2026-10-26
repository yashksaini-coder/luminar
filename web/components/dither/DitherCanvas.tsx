'use client'
// A 1-bit dithered plate canvas: progressive reveal once 30 % in view, optional redraw loop,
// resize redraw and the loupe (spec §7, §7.4). Image or draw-callback sources only: generated or recorded data.
import { useEffect, useRef, useState } from 'react'
import { reducedMotion } from '@/lib/prefs'
import { coverRect, DITHER_CONTRAST, drawDither, LOUPE_PX, REVEAL_STEP_MS, revealSteps } from './dither'
import styles from './DitherCanvas.module.css'
import Loupe from './Loupe'

type DrawSource = (ctx: CanvasRenderingContext2D, w: number, h: number) => void
export interface DitherCanvasProps {
  source: HTMLImageElement | HTMLCanvasElement | DrawSource
  cell?: number
  reveal?: boolean
  loop?: { fps: number; paused?: boolean }
  focus?: [number, number]
  /** Extra ms before the first reveal step, so a plate can land after its card frame (T4). */
  delay?: number
  loupe?: boolean
  onFinal?: (img: ImageData) => void
  className?: string; 'aria-label'?: string; depth?: number
}

interface Final { img: ImageData; source: HTMLImageElement | HTMLCanvasElement; cover: [number, number, number, number] }

export default function DitherCanvas({ source, cell, reveal, loop, focus, delay, loupe, onFinal, className, 'aria-label': label, depth }: DitherCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const plateRef = useRef<HTMLElement | null>(null)
  const [final, setFinal] = useState<Final | null>(null)
  const onFinalRef = useRef(onFinal)
  const pausedRef = useRef(loop?.paused)
  useEffect(() => { onFinalRef.current = onFinal; pausedRef.current = loop?.paused })
  const fps = loop?.fps
  const [fx, fy] = focus ?? [0.5, 0.5]

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    plateRef.current = canvas.parentElement
    const finalCell = cell ?? (parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--cell-final')) || 3)
    const offscreen = typeof source === 'function' ? document.createElement('canvas') : null
    const sourceEl = offscreen ?? (source as HTMLImageElement | HTMLCanvasElement)
    let currentCell = 0   // 0 = nothing drawn yet: a resize before the reveal starts must not draw
    const timers: ReturnType<typeof setTimeout>[] = []
    let interval: ReturnType<typeof setInterval> | undefined

    const render = (c: number) => {
      currentCell = c
      const w = Math.round(canvas.clientWidth), h = Math.round(canvas.clientHeight)
      if (!w || !h) return   // no size (jsdom, hidden): nothing to draw, and no getContext call
      canvas.getContext('2d', { willReadFrequently: true })   // first call fixes the attributes: drawDither reads back every pass
      if (offscreen) {
        offscreen.width = w; offscreen.height = h
        const octx = offscreen.getContext('2d')
        if (!octx) return
        ;(source as DrawSource)(octx, w, h)
      }
      const img = drawDither(canvas, sourceEl, c, { contrast: DITHER_CONTRAST, positive: true, focus: [fx, fy] })
      if (img && c === finalCell) {
        setFinal({ img, source: sourceEl, cover: coverRect(sourceEl.width, sourceEl.height, w, h, fx, fy) })
        onFinalRef.current?.(img)
      }
    }
    const settle = () => {
      render(finalCell)
      if (fps) interval = setInterval(() => { if (!pausedRef.current) render(finalCell) }, 1000 / fps)
    }

    let io: IntersectionObserver | undefined
    if (reveal !== false && typeof IntersectionObserver !== 'undefined' && !reducedMotion()) {
      io = new IntersectionObserver(entries => {
        if (!entries.some(e => e.intersectionRatio >= 0.3)) return
        io?.disconnect()
        const steps = revealSteps(finalCell)
        steps.forEach((c, i) => timers.push(setTimeout(() => (i === steps.length - 1 ? settle() : render(c)), i * REVEAL_STEP_MS + (delay ?? 0))))
      }, { threshold: 0.3 })
      io.observe(canvas)
    } else settle()

    let debounce: ReturnType<typeof setTimeout> | undefined
    const ro = typeof ResizeObserver !== 'undefined' && canvas.parentElement
      ? new ResizeObserver(() => { clearTimeout(debounce); debounce = setTimeout(() => { if (currentCell) render(currentCell) }, 120) })
      : undefined
    if (ro && canvas.parentElement) ro.observe(canvas.parentElement)

    return () => {
      io?.disconnect(); ro?.disconnect()
      timers.forEach(clearTimeout); clearTimeout(debounce); clearInterval(interval)
    }
  }, [source, cell, reveal, fps, fx, fy, delay])

  return (
    <>
      <canvas
        ref={canvasRef}
        data-dither="1"
        role="img"
        aria-label={label}
        className={className ? `${styles.canvas} ${className}` : styles.canvas}
        data-depth={depth}
      />
      {loupe && <Loupe plateRef={plateRef} final={final?.img ?? null} source={final?.source ?? null} cover={final?.cover ?? [0, 0, 1, 1]} size={LOUPE_PX} />}
    </>
  )
}

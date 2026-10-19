/** Read a design token at draw time: canvas has no var(), and the stage theme swaps tokens. */
export function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

export interface CdfPoint { percentile: number; latency_ms: number }

/** min / max latency and the point nearest p50 — shared by the chart and its title/axis. */
export function cdfStats(pts: CdfPoint[]): { min: number; max: number; p50: number } {
  const p50 = pts.reduce((a, b) => (Math.abs(b.percentile - 50) < Math.abs(a.percentile - 50) ? b : a))
  return { min: pts[0].latency_ms, max: pts[pts.length - 1].latency_ms, p50: p50.latency_ms }
}

export function fmtLatency(ms: number): string {
  return ms >= 1000 ? (ms / 1000).toFixed(1) + 's' : ms.toFixed(0) + 'ms'
}

/** Size a canvas in CSS px at device resolution and return a scaled 2D context. */
export function setupCanvas(canvas: HTMLCanvasElement, width: number, height: number): CanvasRenderingContext2D | null {
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  const dpr = window.devicePixelRatio || 1
  canvas.width = Math.round(width * dpr)
  canvas.height = Math.round(height * dpr)
  canvas.style.width = width + 'px'
  canvas.style.height = height + 'px'
  ctx.scale(dpr, dpr)
  return ctx
}

function hline(ctx: CanvasRenderingContext2D, y: number, w: number, color: string) {
  ctx.strokeStyle = color
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(0, y)
  ctx.lineTo(w, y)
  ctx.stroke()
}

/** True CDF: x = latency (linear min→max), y = percentile. No margins, no in-canvas text. */
export function drawCDF(canvas: HTMLCanvasElement, pts: CdfPoint[], width: number, height: number): void {
  if (pts.length === 0) return
  const ctx = setupCanvas(canvas, width, height)
  if (!ctx) return
  const { min, max, p50 } = cdfStats(pts)
  const span = Math.max(max - min, 1e-9)
  const x = (ms: number) => ((ms - min) / span) * width
  const y = (p: number) => height - (p / 100) * height

  hline(ctx, 0.5, width, cssVar('--lm-raised'))
  hline(ctx, Math.round(y(50)) + 0.5, width, cssVar('--lm-raised'))
  hline(ctx, height - 0.5, width, cssVar('--lm-border'))

  const px = Math.round(x(p50)) + 0.5
  ctx.setLineDash([2, 2])
  ctx.strokeStyle = cssVar('--lm-border-strong')
  ctx.beginPath()
  ctx.moveTo(px, 0)
  ctx.lineTo(px, height)
  ctx.stroke()
  ctx.setLineDash([])

  ctx.strokeStyle = cssVar('--lm-fg')
  ctx.lineWidth = 1.5
  ctx.lineJoin = 'round'
  ctx.beginPath()
  pts.forEach((p, i) => {
    if (i === 0) ctx.moveTo(x(p.latency_ms), y(p.percentile))
    else ctx.lineTo(x(p.latency_ms), y(p.percentile))
  })
  ctx.stroke()
}

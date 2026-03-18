export interface SparklineOptions {
  width: number
  height: number
  data: number[]        // array of values
  maxValue?: number     // if not provided, auto-scale
  color: string         // primary line color (CSS)
  fillColor?: string    // area fill (CSS with alpha)
  gridLines?: number    // number of horizontal grid lines
  label?: string        // bottom-right label
}

export function drawSparkline(canvas: HTMLCanvasElement, opts: SparklineOptions): void {
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const dpr = window.devicePixelRatio || 1
  const { width, height, data, color, fillColor, gridLines, label } = opts

  canvas.width = Math.round(width * dpr)
  canvas.height = Math.round(height * dpr)
  canvas.style.width = width + 'px'
  canvas.style.height = height + 'px'
  ctx.scale(dpr, dpr)

  const maxVal = opts.maxValue ?? Math.max(...data, 1)
  const n = data.length
  if (n < 2) return

  ctx.clearRect(0, 0, width, height)

  // Grid lines
  if (gridLines && gridLines > 0) {
    ctx.strokeStyle = 'rgba(255,255,255,0.04)'
    ctx.lineWidth = 1
    for (let i = 1; i <= gridLines; i++) {
      const y = height - (height * i) / (gridLines + 1)
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(width, y)
      ctx.stroke()
    }
  }

  // Build path
  const stepX = width / (n - 1)

  // Fill
  if (fillColor) {
    ctx.beginPath()
    for (let i = 0; i < n; i++) {
      const x = i * stepX
      const y = height - (data[i] / maxVal) * height
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.lineTo(width, height)
    ctx.lineTo(0, height)
    ctx.closePath()
    ctx.fillStyle = fillColor
    ctx.fill()
  }

  // Line
  ctx.beginPath()
  for (let i = 0; i < n; i++) {
    const x = i * stepX
    const y = height - (data[i] / maxVal) * height
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  ctx.strokeStyle = color
  ctx.lineWidth = 1.5
  ctx.stroke()

  // Current value dot at end
  if (n > 0) {
    const lastX = (n - 1) * stepX
    const lastY = height - (data[n - 1] / maxVal) * height
    ctx.beginPath()
    ctx.arc(lastX, lastY, 2.5, 0, Math.PI * 2)
    ctx.fillStyle = color
    ctx.fill()
  }

  // Label
  if (label) {
    ctx.font = '10px "JetBrains Mono", monospace'
    ctx.textAlign = 'right'
    ctx.textBaseline = 'bottom'
    ctx.fillStyle = 'rgba(255,255,255,0.3)'
    ctx.fillText(label, width - 2, height - 2)
  }
}

// CDF chart — X = evenly spaced percentile points, Y = delivery %, full width always used
export function drawCDF(
  canvas: HTMLCanvasElement,
  percentiles: { percentile: number; latency_ms: number }[],
  width: number,
  height: number,
): void {
  const ctx = canvas.getContext('2d')
  if (!ctx || percentiles.length === 0) return

  const dpr = window.devicePixelRatio || 1
  canvas.width = Math.round(width * dpr)
  canvas.height = Math.round(height * dpr)
  canvas.style.width = width + 'px'
  canvas.style.height = height + 'px'
  ctx.scale(dpr, dpr)
  ctx.clearRect(0, 0, width, height)

  const ml = 30, mr = 8, mt = 4, mb = 16
  const pw = width - ml - mr
  const ph = height - mt - mb
  const n = percentiles.length

  ctx.font = '8px "JetBrains Mono", monospace'

  // Y-axis gridlines (0% to 100%)
  for (const pct of [0, 25, 50, 75, 100]) {
    const y = mt + ph - (pct / 100) * ph
    ctx.strokeStyle = 'rgba(255,255,255,0.06)'
    ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(ml, y); ctx.lineTo(ml + pw, y); ctx.stroke()
    ctx.fillStyle = 'rgba(255,255,255,0.25)'
    ctx.textAlign = 'right'
    ctx.textBaseline = 'middle'
    ctx.fillText(pct + '%', ml - 4, y)
  }

  // X-axis: evenly spaced percentile ticks with latency labels
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  ctx.fillStyle = 'rgba(255,255,255,0.2)'
  // Show labels for p0, p50, p100
  const labelIndices = [0, Math.floor(n / 2), n - 1]
  for (const idx of labelIndices) {
    if (idx < 0 || idx >= n) continue
    const x = ml + (idx / Math.max(n - 1, 1)) * pw
    const lat = percentiles[idx].latency_ms
    const label = lat < 1000 ? lat.toFixed(0) + 'ms' : (lat / 1000).toFixed(1) + 's'
    ctx.fillText(label, x, mt + ph + 3)
  }

  // CDF area fill (gradient)
  const grad = ctx.createLinearGradient(0, mt, 0, mt + ph)
  grad.addColorStop(0, 'rgba(0, 180, 100, 0.25)')
  grad.addColorStop(1, 'rgba(0, 180, 100, 0.02)')

  ctx.beginPath()
  ctx.moveTo(ml, mt + ph)  // bottom-left start
  for (let i = 0; i < n; i++) {
    const x = ml + (i / Math.max(n - 1, 1)) * pw
    const y = mt + ph - (percentiles[i].percentile / 100) * ph
    ctx.lineTo(x, y)
  }
  ctx.lineTo(ml + pw, mt + ph)  // bottom-right close
  ctx.closePath()
  ctx.fillStyle = grad
  ctx.fill()

  // CDF line
  ctx.beginPath()
  for (let i = 0; i < n; i++) {
    const x = ml + (i / Math.max(n - 1, 1)) * pw
    const y = mt + ph - (percentiles[i].percentile / 100) * ph
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  ctx.strokeStyle = 'oklch(0.75 0.14 155)'
  ctx.lineWidth = 1.5
  ctx.stroke()

  // End dot
  if (n > 0) {
    const lastY = mt + ph - (percentiles[n - 1].percentile / 100) * ph
    ctx.beginPath()
    ctx.arc(ml + pw, lastY, 3, 0, Math.PI * 2)
    ctx.fillStyle = 'oklch(0.75 0.14 155)'
    ctx.fill()
  }
}

import type { RGBA } from '@/lib/types'

/** Ordered (Bayer 8×8) 1-bit dither: one module for plates, the atlas halos and the video (spec §7; teardown §6, §9). */
export const BAYER8: readonly number[] = [
  0, 32, 8, 40, 2, 34, 10, 42, 48, 16, 56, 24, 50, 18, 58, 26,
  12, 44, 4, 36, 14, 46, 6, 38, 60, 28, 52, 20, 62, 30, 54, 22,
  3, 35, 11, 43, 1, 33, 9, 41, 51, 19, 59, 27, 49, 17, 57, 25,
  15, 47, 7, 39, 13, 45, 5, 37, 63, 31, 55, 23, 61, 29, 53, 21,
].map(v => (v + 0.5) / 64)

export function bayer(x: number, y: number): number {
  return BAYER8[(y & 7) * 8 + (x & 7)]
}

export function luma601(r: number, g: number, b: number): number {
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255
}

export function applyContrast(l: number, contrast: number, level: number): number {
  return Math.min(1, Math.max(0, (l - 0.5) * contrast + 0.5 + level))
}

export const DITHER_CONTRAST = 1.15
export const REVEAL_STEPS = [28, 20, 14, 10, 7, 5, 4, 3] as const
export const REVEAL_STEP_MS = 150
export const LOUPE_PX = 132
export const PAPER: RGBA = [242, 242, 239, 255]
export const PITCH: RGBA = [11, 11, 13, 255]
export const FLAME: RGBA = [255, 90, 44, 255]

export interface RawImage { width: number; height: number; data: Uint8ClampedArray }
export interface DitherPalette { paper: RGBA; pitch: RGBA }
/** density (0..1): when set, ignores luma and lights a cell iff bayer(x,y) < density. */
export interface DitherOpts { contrast?: number; level?: number; positive?: boolean; density?: number }

/** Pure: same input, same output. Each cell×cell block takes the luma of its top-left source pixel. */
export function ditherImageData(src: RawImage, cell: number, palette: DitherPalette, opts: DitherOpts = {}): RawImage {
  const { contrast = DITHER_CONTRAST, level = 0, positive = true, density } = opts
  const { width, height } = src
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) {
    const cy = Math.floor(y / cell)
    for (let x = 0; x < width; x++) {
      const cx = Math.floor(x / cell)
      const t = bayer(cx, cy)
      let lit: boolean
      if (density !== undefined) lit = t < density
      else {
        const s = (cy * cell * width + cx * cell) * 4
        lit = (applyContrast(luma601(src.data[s], src.data[s + 1], src.data[s + 2]), contrast, level) >= t) === positive
      }
      const c = lit ? palette.paper : palette.pitch
      const i = (y * width + x) * 4
      data[i] = c[0]; data[i + 1] = c[1]; data[i + 2] = c[2]; data[i + 3] = 255
    }
  }
  return { width, height, data }
}

export function revealSteps(finalCell: number): number[] {
  return [...REVEAL_STEPS.filter(c => c > finalCell), finalCell]
}

/** object-fit: cover source rect for an iw×ih image in a w×h box with focal point (fx, fy). */
export function coverRect(iw: number, ih: number, w: number, h: number, fx: number, fy: number): [sx: number, sy: number, sw: number, sh: number] {
  const s = Math.max(w / iw, h / ih), sw = w / s, sh = h / s
  return [(iw - sw) * fx, (ih - sh) * fy, sw, sh]
}

const css = (c: RGBA) => `rgb(${c[0]} ${c[1]} ${c[2]})`

function smallContext(w: number, h: number): OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h).getContext('2d', { willReadFrequently: true })
  const c = document.createElement('canvas')
  c.width = w; c.height = h
  return c.getContext('2d', { willReadFrequently: true })
}

/** Browser: one dither pass at `cell` CSS px; returns the final ImageData (for the loupe), null when the canvas has no size. */
export function drawDither(
  canvas: HTMLCanvasElement,
  source: CanvasImageSource & { width: number; height: number },
  cell: number,
  opts: DitherOpts & { focus?: [number, number]; palette?: DitherPalette } = {},
): ImageData | null {
  const { focus = [0.5, 0.5], palette = { paper: PAPER, pitch: PITCH }, ...dither } = opts
  const dpr = Math.min(devicePixelRatio || 1, 2)
  const w = Math.round(canvas.clientWidth), h = Math.round(canvas.clientHeight)
  if (!w || !h) return null
  canvas.width = w * dpr; canvas.height = h * dpr

  const cw = Math.ceil(w / cell), ch = Math.ceil(h / cell)
  const octx = smallContext(cw, ch)
  const ctx = canvas.getContext('2d')
  if (!octx || !ctx) return null
  octx.drawImage(source, ...coverRect(source.width, source.height, cw, ch, focus[0], focus[1]), 0, 0, cw, ch)
  const small = ditherImageData(octx.getImageData(0, 0, cw, ch), 1, palette, dither)

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.fillStyle = css(palette.pitch); ctx.fillRect(0, 0, w, h)
  ctx.fillStyle = css(palette.paper)
  const [pr, pg, pb] = palette.paper
  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      const i = (y * cw + x) * 4
      if (small.data[i] === pr && small.data[i + 1] === pg && small.data[i + 2] === pb) ctx.fillRect(x * cell, y * cell, cell, cell)
    }
  }
  return ctx.getImageData(0, 0, canvas.width, canvas.height)
}

/** Browser: restore the final pass, then show the un-dithered source in a size² square centred at (x, y) CSS px. */
export function drawLoupe(
  ctx: CanvasRenderingContext2D,
  final: ImageData,
  source: CanvasImageSource,
  cover: [number, number, number, number],
  x: number,
  y: number,
  size = LOUPE_PX,
): void {
  ctx.putImageData(final, 0, 0)
  const t = ctx.getTransform()
  const w = ctx.canvas.width / t.a, h = ctx.canvas.height / t.d
  const lx = x - size / 2, ly = y - size / 2
  ctx.save()
  ctx.beginPath(); ctx.rect(lx, ly, size, size); ctx.clip()
  ctx.filter = `grayscale(1) contrast(${DITHER_CONTRAST})`
  ctx.drawImage(source, ...cover, 0, 0, w, h)
  ctx.restore()
  ctx.strokeStyle = css(PAPER); ctx.lineWidth = 1
  ctx.strokeRect(lx + 0.5, ly + 0.5, size - 1, size - 1)
}

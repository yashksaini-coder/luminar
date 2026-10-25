/** Per-frame 1-bit Bayer dither: draw at cell resolution, threshold, paint paper cells over pitch. Deterministic per frame. */
import { useLayoutEffect, useRef, type CSSProperties, type JSX } from 'react'
import { useCurrentFrame } from 'remotion'
import { DITHER_CONTRAST, PAPER, PITCH, ditherImageData } from '../../components/dither/dither'

const rgb = ([r, g, b]: readonly number[]) => `rgb(${r},${g},${b})`

export function Dither(props: {
  width: number
  height: number
  cell: number
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void
  style?: CSSProperties
}): JSX.Element {
  const { width, height, cell, draw, style } = props
  const frame = useCurrentFrame()
  const ref = useRef<HTMLCanvasElement>(null)

  useLayoutEffect(() => {
    const out = ref.current?.getContext('2d')
    if (!out) return
    const sw = Math.ceil(width / cell), sh = Math.ceil(height / cell)
    const off = document.createElement('canvas')
    off.width = sw; off.height = sh
    const ctx = off.getContext('2d', { willReadFrequently: true })!
    ctx.scale(1 / cell, 1 / cell)
    draw(ctx, width, height)
    const img = ditherImageData(ctx.getImageData(0, 0, sw, sh), 1, { paper: PAPER, pitch: PITCH }, { contrast: DITHER_CONTRAST })
    out.fillStyle = rgb(PITCH)
    out.fillRect(0, 0, width, height)
    out.fillStyle = rgb(PAPER)
    for (let y = 0; y < sh; y++)
      for (let x = 0; x < sw; x++)
        if (img.data[(y * sw + x) * 4] === PAPER[0]) out.fillRect(x * cell, y * cell, cell, cell)
  }, [frame, width, height, cell, draw])

  return <canvas ref={ref} width={width} height={height} style={{ imageRendering: 'pixelated', ...style }} />
}

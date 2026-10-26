/** A still image cover-fitted into a box and 1-bit dithered through `Dither`; renders nothing until the image is loaded. */
import { useCallback, type CSSProperties, type JSX } from 'react'
import { Img, staticFile } from 'remotion'
import { coverRect } from '@/components/dither/dither'
import type { Box } from '../mesh/view'
import { Dither } from './Dither'
import { useImage } from './useImage'

export function DitheredStill({ src, box, cell = 3, focus = [0.5, 0.5], border = false, style }: {
  src: string; box: Box; cell?: number; focus?: [number, number]; border?: boolean; style?: CSSProperties
}): JSX.Element | null {
  const img = useImage(src)
  const [fx, fy] = focus
  const draw = useCallback((ctx: CanvasRenderingContext2D, w: number, h: number) => {
    if (img) ctx.drawImage(img, ...coverRect(img.width, img.height, w, h, fx, fy), 0, 0, w, h)
  }, [img, fx, fy])
  if (!img) return null
  return (
    <Dither width={box.w} height={box.h} cell={cell} draw={draw}
      style={{ position: 'absolute', left: box.x, top: box.y, outline: border ? '1px solid var(--paper-0)' : undefined, ...style }} />
  )
}

/** The same still drawn as-is (no dither): screenshots of real dashboards read as screenshots. */
export function Still({ src, box, focus = [0.5, 0.5], border = false, style }: {
  src: string; box: Box; focus?: [number, number]; border?: boolean; style?: CSSProperties
}): JSX.Element {
  const [fx, fy] = focus
  return (
    <Img src={staticFile(src)} alt=""
      style={{ position: 'absolute', left: box.x, top: box.y, width: box.w, height: box.h, objectFit: 'cover',
        objectPosition: `${fx * 100}% ${fy * 100}%`, outline: border ? '1px solid var(--paper-0)' : undefined, ...style }} />
  )
}

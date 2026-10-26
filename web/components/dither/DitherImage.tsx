'use client'
// A dithered still: a --dither-25 skeleton until the image decodes, then a DitherCanvas (skeleton stays on failure).
import { useEffect, useState } from 'react'
import DitherCanvas, { type DitherCanvasProps } from './DitherCanvas'
import styles from './DitherCanvas.module.css'

export interface DitherImageProps extends Omit<DitherCanvasProps, 'source' | 'aria-label'> { src: string; alt: string }

export default function DitherImage({ src, alt, ...rest }: DitherImageProps) {
  const [img, setImg] = useState<HTMLImageElement | null>(null)
  useEffect(() => {
    let live = true
    const el = new Image(); el.decoding = 'async'; el.src = src
    el.decode().then(() => { if (live) setImg(el) }).catch(() => {})
    return () => { live = false }
  }, [src])
  if (!img) return <div className={styles.skeleton} data-depth={rest.depth} data-src={src} aria-hidden />
  return <DitherCanvas source={img} aria-label={alt} {...rest} />
}

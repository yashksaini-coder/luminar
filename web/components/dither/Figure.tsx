'use client'
// The figure plate: a pitch plate with parallax layers and the reticle cursor, then "Fig. N" and
// an italic caption (right-aligned; left-aligned with a 4 / 3 plate under narrowAt px).
import { type CSSProperties, type ReactNode, useEffect, useRef, useState } from 'react'
import { RETICLE_CURSOR } from './Reticle'
import Stamp from './Stamp'
import styles from './Figure.module.css'
import { useParallax } from './parallax'

export interface FigureProps { n: number; caption: string; aspect?: string; narrowAspect?: string; narrowAt?: number; stamp?: string; children?: ReactNode; className?: string }

export default function Figure({ n, caption, aspect = '16 / 6.4', narrowAspect = '4 / 3', narrowAt = 450, stamp, children, className }: FigureProps) {
  const plateRef = useRef<HTMLDivElement>(null)
  const [narrow, setNarrow] = useState(false)
  useParallax(plateRef)
  useEffect(() => {
    const el = plateRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(([e]) => setNarrow(e.contentRect.width < narrowAt))
    ro.observe(el)
    return () => ro.disconnect()
  }, [narrowAt])
  return (
    <figure className={className ? `${styles.figure} ${className}` : styles.figure}>
      <div
        ref={plateRef}
        className={`plate ${styles.plate}`}
        data-narrow-at={narrowAt}
        data-narrow={narrow ? '1' : undefined}
        style={{ aspectRatio: narrow ? narrowAspect : aspect, '--cursor-reticle': RETICLE_CURSOR } as CSSProperties}
      >
        {children}
        {stamp && <Stamp className={styles.stamp}>{stamp}</Stamp>}
      </div>
      <figcaption className={narrow ? styles.capLeft : undefined}><span className={styles.fig}>Fig. {n}</span><em>{caption}</em></figcaption>
    </figure>
  )
}

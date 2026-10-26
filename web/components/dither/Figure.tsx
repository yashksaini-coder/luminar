'use client'
// The figure plate: a pitch plate with parallax layers and the reticle cursor, then "Fig. N" and
// an italic caption (right-aligned; left-aligned with the narrow aspect under 450 px, by container query).
import { type CSSProperties, type ReactNode, useRef } from 'react'
import { RETICLE_CURSOR } from './Reticle'
import Stamp from './Stamp'
import styles from './Figure.module.css'
import { useParallax } from './parallax'

export interface FigureProps {
  n: number; caption: string; aspect?: string; narrowAspect?: string; stamp?: string; children?: ReactNode; className?: string
  /** `card`: the plate rises as a card (data-k) inside a data-reveal section; `reveal` makes the figure that section. */
  kind?: 'card'; reveal?: boolean
  /** Reading-order index of the caption inside its data-reveal section (sets data-k="up" on the figcaption). */
  captionI?: number
}

export default function Figure({ n, caption, aspect = '16 / 6.4', narrowAspect = '4 / 3', stamp, children, className, kind, reveal, captionI }: FigureProps) {
  const plateRef = useRef<HTMLDivElement>(null)
  useParallax(plateRef)
  return (
    <figure className={className ? `${styles.figure} ${className}` : styles.figure} data-reveal={reveal ? '' : undefined}>
      <div
        ref={plateRef}
        className={`plate ${styles.plate}`}
        data-k={kind}
        style={{ '--aspect': aspect, '--narrow-aspect': narrowAspect, '--cursor-reticle': RETICLE_CURSOR } as CSSProperties}
      >
        {children}
        {stamp && <Stamp className={styles.stamp}>{stamp}</Stamp>}
      </div>
      <figcaption data-k={captionI === undefined ? undefined : 'up'} style={captionI === undefined ? undefined : { '--i': captionI } as CSSProperties}>
        <span className={styles.fig}>Fig. {n}</span><em>{caption}</em>
      </figcaption>
    </figure>
  )
}

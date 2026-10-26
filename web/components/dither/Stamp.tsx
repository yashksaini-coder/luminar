// The plate stamp: Manrope 600 uppercase label, paper on pitch, tilted, the one shadow in the
// system; flame variant for attacks. Never dithered (spec §7). Plain React, no next/* and no
// hooks: Remotion's StampIn reuses it (spec §9).
import type { CSSProperties } from 'react'
import styles from './glyphs.module.css'

export interface StampProps { children: string; tilt?: number; flame?: boolean; depth?: number; className?: string }

const FLAME: CSSProperties = { background: 'var(--flame)', color: 'var(--on-flame)' }

export default function Stamp({ children, tilt = 3, flame = false, depth, className }: StampProps) {
  if (process.env.NODE_ENV !== 'production' && children.length > 24) console.warn('Stamp over 24 characters:', children)
  return (
    <span
      className={className ? `${styles.stamp} ${className}` : styles.stamp}
      data-depth={depth}
      style={{ '--stamp-tilt': `${tilt}deg` } as CSSProperties}
    >
      <span className={styles.inner} style={flame ? FLAME : undefined}>{children}</span>
    </span>
  )
}

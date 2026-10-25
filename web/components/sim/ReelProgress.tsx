'use client'

import { useId } from 'react'
import { useStore } from '@/lib/store'
import { loadLabel } from '@/lib/reels'
import styles from './ReelProgress.module.css'

/** The reel download bar over the canvas: a dithered fill (the bar is 12 px, so dither is allowed) under a plain-text label. */
export default function ReelProgress({ title }: { title: string }) {
  const p = useStore(s => s.reelLoad)
  const labelId = useId()
  if (!p) return null
  const pct = p.total ? (p.loaded / p.total) * 100 : 100
  const label = `REEL · ${title} · ${loadLabel(p)}`
  return (
    <div className={styles.wrap}>
      <p id={labelId} className={styles.label}>{label}</p>
      <div className={styles.track} role="progressbar" aria-labelledby={labelId}
        aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)}>
        <div className={styles.fill} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

'use client'

import { useEffect, useState } from 'react'
import { useStore } from '@/lib/store'
import styles from './Narrator.module.css'

export const CAPTION_MS = 4000   // equals --d-caption

// The store keeps the last caption for the ticker; this card only hides itself after CAPTION_MS.
export default function Narrator() {
  const c = useStore(s => s.caption)
  const [hiddenSeq, setHiddenSeq] = useState(0)
  const seq = c?.seq ?? 0
  useEffect(() => {
    if (!seq) return
    const t = setTimeout(() => setHiddenSeq(seq), CAPTION_MS)
    return () => clearTimeout(t)
  }, [seq])
  const show = c && c.seq !== hiddenSeq
  return (
    <div className={styles.card} aria-live="polite" aria-atomic="true" data-visible={show ? '' : undefined}>
      {show && (
        <>
          <div className={styles.kicker} data-healed={c.kind === 'healed' ? '' : undefined}>
            {`T+${c.at.toFixed(1)}s · ${c.kind === 'phase' ? 'PHASE' : 'NARRATOR'}`}
          </div>
          <p className={styles.sentence}>{c.text}</p>
          <div key={c.seq} className={styles.drain} />
        </>
      )}
    </div>
  )
}

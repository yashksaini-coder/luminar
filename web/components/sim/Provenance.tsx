'use client'

import { PROVENANCE } from '@/lib/copy'
import { useStore } from '@/lib/store'
import styles from './Provenance.module.css'

export default function Provenance() {
  const m = useStore(s => s.mainnet)
  const mode = useStore(s => s.layoutMode)
  const reel = useStore(s => s.reel)
  if (!m?.enabled) return null
  return (
    <aside aria-label="Data provenance" className={styles.card}>
      <p className={styles.kicker}><i aria-hidden className={styles.dot} />{reel ? 'RECORDED MAINNET' : 'LIVE MAINNET'}</p>
      <p className={styles.body}>
        {`slot ${m.slot ?? '—'} · ${reel ? 'recorded' : `T−${m.lag_s ?? 156}s`} · ${m.with_geo ?? m.observers} observers · ${PROVENANCE}`}
        {mode !== 'geo' && ' · shown on the Geo layout'}
      </p>
    </aside>
  )
}

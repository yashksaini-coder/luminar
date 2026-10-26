'use client'

/** FORCE | RADIAL | GEO layout tabs, top-centre over the canvas. Geo stays disabled until real observers exist. */

import { useEffect } from 'react'
import { selectCanGeo, useStore } from '@/lib/store'
import type { LayoutMode } from '@/lib/types'
import styles from './ModeSwitcher.module.css'

export const GEO_DISABLED = 'Geo needs real observers · turn MAINNET on'
const MODES: LayoutMode[] = ['force', 'radial', 'geo']

export default function ModeSwitcher() {
  const mode = useStore(s => s.layoutMode)
  const canGeo = useStore(selectCanGeo)
  // Real nodes vanished while in Geo: go back to the layout auto-Geo left (auto-Geo itself is initAutoGeo, A.0).
  useEffect(() => {
    if (!canGeo && mode === 'geo') useStore.getState().setLayoutMode(useStore.getState().layoutBeforeGeo ?? 'force')
  }, [canGeo, mode])
  return (
    <div role="group" aria-label="Layout" className={styles.switch}>
      {MODES.map(m => {
        const off = m === 'geo' && !canGeo
        return (
          // aria-disabled, not disabled: a tap on GEO explains itself in a toast instead of doing nothing
          <button key={m} type="button" className={styles.tab} aria-pressed={mode === m} aria-disabled={off || undefined} title={off ? GEO_DISABLED : undefined}
            onClick={() => { if (off) useStore.getState().pushToast(GEO_DISABLED, 'info'); else if (m !== mode) useStore.getState().setLayoutMode(m) }}>
            {m.toUpperCase()}
          </button>
        )
      })}
    </div>
  )
}

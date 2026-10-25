'use client'

import { useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useStore, type AppState } from '@/lib/store'
import { tickerCells } from '@/lib/ticker'
import styles from './Ticker.module.css'

/** Hero lower-third: re-renders at the clock rate (eight spans, accepted). */
export default function Ticker() {
  // R2: pick primitive/reference inputs with useShallow; tickerCells builds fresh objects, so it runs in useMemo.
  const inputs = useStore(useShallow(s => ({
    nodes: s.nodes, gossipAnalytics: s.gossipAnalytics, invalidCount: s.invalidCount, simTime: s.simTime,
    phaseLabel: s.phaseLabel, activeScenario: s.activeScenario, layoutMode: s.layoutMode, mainnet: s.mainnet,
  })))
  const cells = useMemo(() => tickerCells(inputs as AppState), [inputs])
  return (
    <div role="region" aria-label="broadcast readout" aria-live="off" className={styles.ticker}>
      {cells.map(c => (
        <span key={c.key} className={styles.cell} data-danger={c.danger ? '' : undefined}>
          <span className={styles.key}>{c.key}</span>
          <span className={styles.value}>{c.value}</span>
        </span>
      ))}
    </div>
  )
}

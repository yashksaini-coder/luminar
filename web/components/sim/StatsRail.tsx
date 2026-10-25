'use client'

// Left rail: KPI tiles with sparklines, NODES (state strip + counts), MESSAGES [spec §6.2].
// Task 3.5 fills the cdf / beats / cats / infra placeholders and wires onBeat.
import { useEffect, useRef } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { fmtCount, isPruned } from '@/lib/format'
import { selectAttackers, selectKpis, selectStateCounts, useStore } from '@/lib/store'
import type { AnalyticsSample, Beat } from '@/lib/types'
import Glyph, { type GlyphRole } from './Glyph'
import Sparkline from './Sparkline'
import styles from './StatsRail.module.css'

const ROWS: GlyphRole[] = ['idle', 'origin', 'receiving', 'decoded', 'joining', 'failed', 'error', 'attacker', 'pruned']

function useSeries(key: Exclude<keyof AnalyticsSample, 't'>) {
  return useStore(useShallow(s => s.analyticsHistory.map(x => x[key])))
}

function Kpi({ label, value, unit, series, aria }: { label: string; value: string | null; unit?: string; series: number[]; aria: string }) {
  return (
    <div className={styles.kpi}>
      <span className={styles.kpiLabel}>{label}</span>
      <span className={styles.kpiValue}>
        {value ?? '—'}{value !== null && unit && <span className={styles.unit}>{unit}</span>}
      </span>
      <Sparkline values={series} height={24} aria-label={aria} />
    </div>
  )
}

function StateStrip() {
  const ref = useRef<HTMLCanvasElement>(null)
  const roles = useStore(useShallow(s => s.nodes.map(n => (isPruned(n) ? 'pruned' : n.state))))
  useEffect(() => {
    const cv = ref.current
    const ctx = cv?.getContext('2d')
    if (!cv || !ctx) return
    const draw = () => {
      const w = cv.clientWidth
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      cv.width = Math.round(w * dpr)
      cv.height = Math.round(6 * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, w, 6)
      if (roles.length === 0) return
      const css = getComputedStyle(document.documentElement)
      const cw = w / roles.length
      roles.forEach((r, i) => {
        const token = r === 'attacker' ? '--flame' : r === 'pruned' ? '--paper-3' : `--node-${r}`
        ctx.fillStyle = css.getPropertyValue(token).trim()
        ctx.fillRect(i * cw, 0, Math.max(1, cw - (cw > 3 ? 1 : 0)), 6)   // solid cells, 1 px gap when room
      })
    }
    draw()
    const ro = new ResizeObserver(draw)
    ro.observe(cv)
    return () => ro.disconnect()
  }, [roles])
  return <canvas ref={ref} className={styles.strip} height={6} role="img" aria-label="node states in order" />
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- onBeat is wired by Task 3.5 (beats section)
export default function StatsRail(_props: { onBeat: (b: Beat) => void }) {
  const k = useStore(useShallow(selectKpis))
  const counts = useStore(useShallow(selectStateCounts))
  const nodeCount = useStore(s => s.nodeCount)
  const attackers = useStore(s => selectAttackers(s).length)
  const sent = useStore(s => s.totalMessagesSent)
  const received = useStore(s => s.totalMessagesReceived)
  const invalid = useStore(s => s.invalidCount)
  const events = useStore(s => s.eventCount)
  const delivery = useSeries('delivery'), prop = useSeries('propagationMs'), hops = useSeries('hops'), degree = useSeries('degree')

  return (
    <div className={styles.rail}>
      <section className={styles.section} data-section="kpi">
        <div className={styles.kpis}>
          <Kpi label="Delivery" value={k.delivery === null ? null : (k.delivery * 100).toFixed(1)} unit="%"
            series={delivery} aria="delivery, last 60 analytics frames" />
          <Kpi label="Propagation" value={k.propagationMs === null ? null : k.propagationMs.toFixed(0)} unit="ms"
            series={prop} aria="propagation, last 60 analytics frames" />
          <Kpi label="Avg hops" value={k.hops === null ? null : k.hops.toFixed(1)}
            series={hops} aria="average hops, last 60 analytics frames" />
          <Kpi label="Mesh degree" value={k.degAvg === null ? null : k.degAvg.toFixed(1)}
            unit={k.degMin !== null && k.degMax !== null ? `${k.degMin}–${k.degMax}` : undefined}
            series={degree} aria="mesh degree, last 60 analytics frames" />
        </div>
      </section>

      <section className={styles.section} data-section="nodes">
        <h2 className={styles.heading}>Nodes<span className={styles.meta}>{nodeCount}{attackers ? ` +${attackers}` : ''}</span></h2>
        <StateStrip />
        <dl className={styles.counts}>
          {ROWS.map(role => (
            <div key={role} className={styles.countRow}>
              <dt><Glyph role={role} />{role}</dt>
              <dd>{counts[role] ?? 0}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className={styles.section} data-section="messages">
        <h2 className={styles.heading}>Messages</h2>
        <dl className={styles.rows}>
          <div><dt>Sent</dt><dd>{fmtCount(sent)}</dd></div>
          <div><dt>Received</dt><dd>{fmtCount(received)}</dd></div>
          <div><dt>Invalid</dt><dd data-alarm={invalid > 0 ? '' : undefined}>{fmtCount(invalid)}</dd></div>
          <div><dt>Total events</dt><dd>{fmtCount(events)}</dd></div>
        </dl>
      </section>

      <section data-section="cdf" />
      <section data-section="beats" />
      <section data-section="cats" />
      <section data-section="infra" />
    </div>
  )
}

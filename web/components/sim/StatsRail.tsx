'use client'

// Left rail: KPI tiles with sparklines, NODES (state strip + counts), MESSAGES, DELIVERY CDF,
// BEATS, EVENT CATEGORIES, INFRASTRUCTURE [spec §6.2].
import { useEffect, useRef } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { cdfStats, fmtCount, fmtLatency, formatNumber, isPruned } from '@/lib/format'
import { selectAttackers, selectHasMessages, selectKpis, selectStateCounts, useStore } from '@/lib/store'
import type { AnalyticsSample, Beat, CdfPoint } from '@/lib/types'
import Glyph, { type GlyphRole } from './Glyph'
import Sparkline from './Sparkline'
import styles from './StatsRail.module.css'

const CATS = ['gossip', 'connection', 'stream', 'dht', 'fault', 'health'] as const
const BEAT_MARK: Record<Beat['kind'], string> = { fault: 'var(--flame)', prune: 'var(--flame)', healed: 'var(--signal)', phase: 'var(--fg)' }

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

// x = latency (linear min→max), y = percentile; not Sparkline, whose x is the sample index.
function DeliveryCdf({ pts }: { pts: CdfPoint[] }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const { min, max, p50 } = cdfStats(pts)   // R29: callers guard non-empty
  useEffect(() => {
    const cv = ref.current
    const ctx = cv?.getContext('2d')
    if (!cv || !ctx) return
    const h = 56
    const draw = () => {
      const w = cv.clientWidth
      if (w === 0) return
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      cv.width = Math.round(w * dpr)
      cv.height = Math.round(h * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, w, h)
      const css = getComputedStyle(document.documentElement)
      const tok = (n: string) => css.getPropertyValue(n).trim()
      const ink = tok('--fg')
      const cell = parseFloat(tok('--cell-ui')) || 4
      const span = max - min || 1
      const x = (ms: number) => ((ms - min) / span) * w
      const y = (pc: number) => h - (pc / 100) * (h - 1.5) - .75
      const xy = pts.map(p => [x(p.latency_ms), y(p.percentile)] as const)

      const tile = document.createElement('canvas')
      tile.width = tile.height = cell * 2
      const tctx = tile.getContext('2d')!
      tctx.fillStyle = ink
      tctx.fillRect(0, 0, cell, cell)
      tctx.fillRect(cell, cell, cell, cell)
      const pattern = ctx.createPattern(tile, 'repeat')
      if (pattern) {
        ctx.beginPath()
        ctx.moveTo(xy[0][0], h)
        for (const [px, py] of xy) ctx.lineTo(px, py)
        ctx.lineTo(xy[xy.length - 1][0], h)
        ctx.closePath()
        ctx.fillStyle = pattern
        ctx.fill()
      }

      ctx.beginPath()
      ctx.setLineDash([2, 2])
      ctx.moveTo(x(p50), 0)
      ctx.lineTo(x(p50), h)
      ctx.strokeStyle = tok('--hair-strong')
      ctx.lineWidth = 1
      ctx.stroke()
      ctx.setLineDash([])

      ctx.beginPath()
      xy.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)))
      ctx.strokeStyle = ink
      ctx.lineWidth = 1.5
      ctx.stroke()
    }
    draw()
    const ro = new ResizeObserver(draw)
    ro.observe(cv)
    return () => ro.disconnect()
  }, [pts, min, max, p50])
  return (
    <>
      <h2 className={styles.heading}>Delivery CDF<span className={styles.meta}>p50 {fmtLatency(p50)}</span></h2>
      <canvas ref={ref} className={styles.cdf} height={56} role="img" aria-label="delivery latency CDF" />
      <div className={styles.axis}><span>{fmtLatency(min)}</span><span>p50</span><span>{fmtLatency(max)}</span></div>
    </>
  )
}

export default function StatsRail({ onBeat }: { onBeat: (b: Beat) => void }) {
  const k = useStore(useShallow(selectKpis))
  const counts = useStore(useShallow(selectStateCounts))
  const nodeCount = useStore(s => s.nodeCount)
  const attackers = useStore(s => selectAttackers(s).length)
  const sent = useStore(s => s.totalMessagesSent)
  const received = useStore(s => s.totalMessagesReceived)
  const invalid = useStore(s => s.invalidCount)
  const events = useStore(s => s.eventCount)
  const hasMessages = useStore(selectHasMessages)
  const cdf = useStore(s => s.gossipAnalytics?.latency_cdf)
  const beats = useStore(useShallow(s => s.beats))
  const inReel = useStore(s => s.reel !== null)
  const cats = useStore(s => s.eventCounts)
  const sm = useStore(s => s.streamManager)
  const dht = useStore(s => s.dhtCoordinator)
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

      <section className={styles.section} data-section="cdf">
        {hasMessages && cdf && cdf.length > 0
          ? <DeliveryCdf pts={cdf} />
          : <><h2 className={styles.heading}>Delivery CDF</h2><span className={styles.empty}>—</span></>}
      </section>

      <section className={styles.section} data-section="beats">
        <h2 className={styles.heading}>Beats</h2>
        {beats.length === 0
          ? <span className={styles.empty}>no beats yet</span>
          : beats.map((b, i) => (
            <button key={i} type="button" className={styles.beat} onClick={() => onBeat(b)} title={inReel ? 'seek' : 'show caption'}>
              <span className={styles.mark} style={{ background: BEAT_MARK[b.kind] }} />
              <span className={styles.beatLabel}>{b.label}</span>
              <span className={styles.beatTime}>T+{b.time.toFixed(1)}s</span>
            </button>
          ))}
      </section>

      <section className={styles.section} data-section="cats">
        <h2 className={styles.heading}>Event categories</h2>
        <div className={styles.bars}>
          {CATS.map(cat => {
            const n = cats[cat] ?? 0
            const frac = n === 0 || events === 0 ? 0 : Math.min(1, Math.max(n / events, .02))
            return (
              <div key={cat} className={styles.barRow}>
                <span className={styles.barLabel}>{cat}</span>
                <span className={styles.bar}>
                  <span className={styles.fill} data-fault={cat === 'fault' ? '' : undefined} style={{ width: `${frac * 100}%` }} />
                </span>
                <span className={styles.barValue}>{formatNumber(n)}</span>
              </div>
            )
          })}
        </div>
      </section>

      <section className={styles.section} data-section="infra">
        <h2 className={styles.heading}>Infrastructure</h2>
        <div className={styles.bars}>
          <div className={styles.barRow}>
            <span className={styles.barLabel}>Streams</span>
            <span className={styles.bar}>
              <span className={styles.fill} style={{ width: `${sm.max > 0 ? Math.min(1, sm.open / sm.max) * 100 : 0}%` }} />
            </span>
            <span className={styles.barValue}>{sm.open}/{sm.max}</span>
          </div>
          <div className={styles.barRow}>
            <span className={styles.barLabel}>DHT</span>
            <span className={styles.segs} data-segments={dht.available}>
              {Array.from({ length: dht.available }, (_, i) => (
                <span key={i} className={styles.seg} data-on={i < dht.active ? '' : undefined} />
              ))}
            </span>
            <span className={styles.barValue}>{dht.active}/{dht.available}</span>
          </div>
        </div>
      </section>
    </div>
  )
}

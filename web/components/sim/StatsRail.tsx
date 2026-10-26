'use client'

// Left rail: KPI tiles with sparklines, NODES (state strip + counts), MESSAGES, DELIVERY CDF,
// BEATS, EVENT CATEGORIES, INFRASTRUCTURE [spec §6.2].
import { useEffect, useRef } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { cdfStats, fmtCount, fmtLatency, formatNumber, isPruned } from '@/lib/format'
import { selectAttackers, selectHasMessages, selectKpis, selectStateCounts, useStore } from '@/lib/store'
import type { AnalyticsSample, Beat, CdfPoint } from '@/lib/types'
import Glyph, { type GlyphRole } from './Glyph'
import { monoFamily } from '@/lib/fonts'
import Sparkline, { fillUnder, sizeCanvas } from './Sparkline'
import styles from './StatsRail.module.css'

const CATS = ['gossip', 'connection', 'stream', 'dht', 'fault', 'health'] as const
const BEAT_MARK: Record<Beat['kind'], string> = { fault: 'var(--flame)', prune: 'var(--flame)', healed: 'var(--signal)', phase: 'var(--fg)' }

const ROWS: GlyphRole[] = ['idle', 'origin', 'receiving', 'decoded', 'joining', 'failed', 'error', 'attacker', 'pruned']

function useSeries(key: Exclude<keyof AnalyticsSample, 't'>) {
  return useStore(useShallow(s => s.analyticsHistory.map(x => x[key])))
}

function Kpi({ label, value, unit, series, aria, busy }: { label: string; value: string | null; unit?: string; series: number[]; aria: string; busy: boolean }) {
  return (
    <div className={styles.kpi}>
      <span className={styles.kpiLabel}>{label}</span>
      {busy ? <span className={`skeleton ${styles.skelValue}`} /> : (
        <span className={styles.kpiValue}>
          {value ?? '—'}{value !== null && unit && <span className={styles.unit}>{unit}</span>}
        </span>
      )}
      {busy ? <span className={`skeleton ${styles.skelSpark}`} /> : <Sparkline values={series} height={24} aria-label={aria} />}
    </div>
  )
}

/** Booting: no socket open/close yet and no reel (a reel never opens one): rails show skeletons shaped like their rows (B9). */
const selectBooting = (s: { connecting: boolean; reel: unknown }) => s.connecting && s.reel === null

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

// x = latency (linear min→max), y = percentile with a 0/50/100 % grid; not Sparkline, whose x is the sample index.
const CDF_H = 92
function DeliveryCdf({ pts }: { pts: CdfPoint[] }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const { min, max, p50 } = cdfStats(pts)   // R29: callers guard non-empty
  useEffect(() => {
    const cv = ref.current
    const ctx = cv?.getContext('2d')
    if (!cv || !ctx) return
    const h = CDF_H
    const draw = () => {
      const w = cv.clientWidth
      if (w === 0) return
      sizeCanvas(cv, ctx, w, h)
      const css = getComputedStyle(document.documentElement)
      const tok = (n: string) => css.getPropertyValue(n).trim()
      const ink = tok('--signal')
      const left = 28, top = 6, bottom = h - 7   // y labels live in the left gutter; room for the 0 % label
      const plotW = w - left - 4
      const span = max - min || 1
      const x = (ms: number) => left + ((ms - min) / span) * plotW
      const y = (pc: number) => bottom - (pc / 100) * (bottom - top)

      // grid: 0 / 50 / 100 %, labelled in the gutter
      ctx.font = `10px ${monoFamily()}`; ctx.textBaseline = 'middle'; ctx.textAlign = 'right'
      for (const pc of [0, 50, 100]) {
        const gy = Math.round(y(pc)) + 0.5
        ctx.beginPath(); ctx.moveTo(left, gy); ctx.lineTo(w, gy)
        ctx.strokeStyle = tok(pc === 0 ? '--hair-strong' : '--hair'); ctx.lineWidth = 1; ctx.stroke()
        ctx.fillStyle = tok('--fg-3'); ctx.fillText(`${pc}%`, left - 5, gy)
      }

      // the CDF as a step curve: each point holds its percentile until the next latency
      const xy: [number, number][] = []
      pts.forEach((p, i) => {
        if (i) xy.push([x(p.latency_ms), y(pts[i - 1].percentile)])
        xy.push([x(p.latency_ms), y(p.percentile)])
      })
      fillUnder(ctx, xy, bottom, ink, 0.14)
      ctx.beginPath()
      xy.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)))
      ctx.strokeStyle = ink; ctx.lineWidth = 1.5; ctx.lineJoin = 'round'; ctx.stroke()

      // p50: dashed guides to the 50 % point, marked with a dot
      const px50 = x(p50), py50 = y(50)
      ctx.setLineDash([3, 3]); ctx.strokeStyle = tok('--fg-3'); ctx.lineWidth = 1
      ctx.beginPath(); ctx.moveTo(px50, bottom); ctx.lineTo(px50, py50); ctx.lineTo(left, py50); ctx.stroke()
      ctx.setLineDash([])
      ctx.beginPath(); ctx.arc(px50, py50, 3, 0, Math.PI * 2); ctx.fillStyle = tok('--fg'); ctx.fill()
    }
    draw()
    const ro = new ResizeObserver(draw)
    ro.observe(cv)
    return () => ro.disconnect()
  }, [pts, min, max, p50])
  return (
    <>
      <h2 className={styles.heading}>Delivery CDF<span className={styles.meta}>p50 {fmtLatency(p50)}</span></h2>
      <canvas ref={ref} className={styles.cdf} height={CDF_H} role="img"
        aria-label={`delivery latency CDF: ${fmtLatency(min)} to ${fmtLatency(max)}, half of deliveries within ${fmtLatency(p50)}`} />
      <div className={styles.axis}><span>{fmtLatency(min)}</span><span>latency</span><span>{fmtLatency(max)}</span></div>
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
  const busy = useStore(selectBooting)

  return (
    <div className={styles.rail} aria-busy={busy || undefined}>
      <section className={styles.section} data-section="kpi">
        <div className={styles.kpis}>
          <Kpi label="Delivery" value={k.delivery === null ? null : (k.delivery * 100).toFixed(k.delivery >= 0.9995 ? 0 : 1)} unit="%"
            series={delivery} aria="delivery, last 60 analytics frames" busy={busy} />
          <Kpi label="Propagation" value={k.propagationMs === null ? null : k.propagationMs.toFixed(0)} unit="ms"
            series={prop} aria="propagation, last 60 analytics frames" busy={busy} />
          <Kpi label="Avg hops" value={k.hops === null ? null : k.hops.toFixed(1)}
            series={hops} aria="average hops, last 60 analytics frames" busy={busy} />
          <Kpi label="Mesh degree" value={k.degAvg === null ? null : k.degAvg.toFixed(1)}
            unit={k.degMin !== null && k.degMax !== null ? `${k.degMin}–${k.degMax}` : undefined}
            series={degree} aria="mesh degree, last 60 analytics frames" busy={busy} />
        </div>
      </section>

      <section className={styles.section} data-section="nodes">
        <h2 className={styles.heading}>Nodes<span className={styles.meta}>{nodeCount}{attackers ? ` +${attackers}` : ''}</span></h2>
        {busy ? <span className={`skeleton ${styles.strip}`} /> : <StateStrip />}
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
            {/* the backend sends free permits (semaphore value): capacity is busy + free */}
            <span className={styles.segs} data-segments={dht.active + dht.available}>
              {Array.from({ length: dht.active + dht.available }, (_, i) => (
                <span key={i} className={styles.seg} data-on={i < dht.active ? '' : undefined} />
              ))}
            </span>
            <span className={styles.barValue}>{dht.active}/{dht.active + dht.available}</span>
          </div>
        </div>
      </section>
    </div>
  )
}

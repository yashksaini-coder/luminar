'use client'
// The readout strip under Fig. 1: four numbers from the sybil-eclipse recording (lib/reel-stats.json).
// dt precedes dd in the DOM (valid <dl>); CSS puts the number on top. The server renders the final
// numbers; once the strip reveals (data-in, lib/reveal.ts) each one counts up from 0 in 900 ms (D9).
import { type CSSProperties, useEffect, useRef } from 'react'
import { RECORDING_NOT_RUN } from '@/lib/copy'
import { reducedMotion } from '@/lib/prefs'
import stats from '@/lib/reel-stats.json'
import styles from './Readouts.module.css'

const CELLS: [number, string, string][] = [   // value, static suffix, label
  [stats.peers, '', 'peers in the recording'],
  [stats.sybils, '', `Sybils grafted at T+${stats.sybilAt}s`],
  [stats.heartbeatsToPrune, '', 'heartbeats from graft to first prune'],
  [stats.deliveryPct, '%', RECORDING_NOT_RUN],
]
export const COUNT_MS = 900   // = --d-count
const REVEAL_WAIT_MS = 3000   // no data-in by then (observer never fired): stay on the final value
/** ease-in-out cubic ≈ --io (D9) */
export const easeCount = (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2)

function Count({ to, suffix = '' }: { to: number; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    const el = ref.current, sec = el?.closest<HTMLElement>('[data-reveal]')
    if (!el || !sec || reducedMotion()) return
    let raf = 0, start: number | undefined
    const tick = (ts: number) => {
      start ??= ts
      const t = Math.min(1, (ts - start) / COUNT_MS)
      el.textContent = `${Math.round(easeCount(t) * to)}${suffix}`
      if (t < 1) raf = requestAnimationFrame(tick)
    }
    const run = () => { el.textContent = `0${suffix}`; raf = requestAnimationFrame(tick) }
    const mo = new MutationObserver(() => { if (sec.dataset.in) { mo.disconnect(); run() } })
    if (sec.dataset.in) run(); else mo.observe(sec, { attributes: true, attributeFilter: ['data-in'] })
    const giveUp = setTimeout(() => mo.disconnect(), REVEAL_WAIT_MS)
    return () => { mo.disconnect(); clearTimeout(giveUp); cancelAnimationFrame(raf) }
  }, [to, suffix])
  return <span ref={ref}>{to}{suffix}</span>
}

export default function Readouts() {
  return (
    <dl className={styles.readouts} data-reveal="">
      {CELLS.map(([n, suffix, label], i) => (
        <div key={label} className={styles.cell} data-k="up" style={{ '--i': i } as CSSProperties}>
          <dt><em>{label}</em></dt><dd><Count to={n} suffix={suffix} /></dd>
        </div>
      ))}
    </dl>
  )
}

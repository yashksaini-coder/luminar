'use client'
// Live mainnet card (landing redesign §11, replaces the LiveMainnet prose). Left: the honest copy
// (ARRIVAL, PROVENANCE), the recording's slot range and observer count. Right: an equirectangular world
// (public/geo/land-110m.json, fetched once the card nears the viewport) whose observer sites light in
// the order they first saw the block of slot 15466393, replayed from the recording at 0.4× speed. No
// LIVE claim: this page is static, the dots are the recorded slot. Story pauses off screen; reduced
// motion and no JS show the final frame (every site lit).
import { type CSSProperties, useEffect, useRef, useState } from 'react'
import { getStatic } from '@/lib/api/client'
import Glyph from '@/components/sim/Glyph'
import { ARRIVAL, PROVENANCE } from '@/lib/copy'
import { reducedMotion } from '@/lib/prefs'
import { REEL_MANIFEST, reelHref } from '@/lib/reels'
import styles from './MainnetCard.module.css'

const k = (kind: string, i: number) => ({ 'data-k': kind, style: { '--i': i } as CSSProperties })

export const SLOT = 15466393
export const SLOTS = '15466393–15466400'
export const OBSERVERS = REEL_MANIFEST.find(r => r.name === 'mainnet-block-wave')?.nodes ?? 0
/** [lon, lat, first seen ms after slot start, observers at the site]: slot 15466393 of
 *  public/reels/mainnet-block-wave.jsonl, observers grouped by site (x / 2.5, −y / 2.5), sorted by arrival. */
export const ARR: [number, number, number, number][] = [
  [24.9,60.2,3247,35], [16.4,48.2,3247,3], [-0.2,51.6,3248,1], [26,64,3258,6], [1.4,43.6,3278,2], [8.2,50.1,3286,1], [13.4,52.5,3287,1], [4.9,52.4,3305,2],
  [-0.1,51.5,3305,1], [10.5,51.5,3305,1], [14.5,46,3307,1], [-3.7,40.4,3313,1], [11.1,49.4,3316,4], [10,53.6,3321,1], [-79.4,43.7,3325,1], [4.5,50.8,3328,1],
  [-98.5,39.8,3330,1], [2,46,3331,2], [-123.1,49.2,3342,1], [-89.2,43.2,3344,1], [-96.5,33,3346,4], [10.4,48.2,3347,1], [2.2,48.9,3355,1], [-115.1,36.2,3359,2],
  [-81.4,28.5,3360,1], [77.6,13,3361,3], [-74.1,40.6,3363,1], [-97.8,30.3,3363,1], [-96.1,19.1,3363,1], [-75.2,-10,3374,1], [-105,39.7,3380,2], [19.9,50.1,3382,1],
  [-16.9,32.7,3382,1], [20,52,3386,1], [-46.6,-23.6,3389,4], [-74.3,40.7,3390,2], [151.2,-33.9,3396,9], [-102,23,3398,1], [-122,37.4,3402,6], [103.8,1.3,3405,1],
  [-82.4,34.8,3407,1], [33,34.7,3415,1], [23.3,42.7,3417,2], [-89.5,43,3417,1], [-125.9,49.2,3425,1], [139.7,35.7,3428,1], [21,52.2,3430,1], [76.9,43.2,3437,1],
  [28,-26.2,3450,2], [-122.4,37.6,3454,1], [145,-37.8,3457,3], [-120.7,35.5,3494,1], [-74.2,40.9,3504,1], [12.5,41.9,3507,1], [-97.2,49.9,3526,1], [153,-27.5,3526,2],
  [-74.6,40.8,3531,1], [100.5,13.8,3541,1], [174.8,-36.8,3597,2], [47.8,29.5,3710,1], [-87.6,41.8,5195,1],
]
export const FIRST_MS = ARR[0][2]
export const LAST_MS = ARR[ARR.length - 1][2]
/** CUM[n] = observers at the first n sites */
const CUM = ARR.reduce<number[]>((a, [, , , n]) => [...a, a[a.length - 1] + n], [0])

export const SPEED = 0.4
const LEAD = 700, HOLD = 1800, RESET = 600
const PLAY = (LAST_MS - FIRST_MS) / SPEED
export const LOOP_MS = LEAD + PLAY + HOLD + RESET
/** Story clock → ms after slot start on screen; −1 = nothing lit (lead in, reset). */
export function msAt(t: number): number {
  const p = t % LOOP_MS - LEAD
  if (p < 0 || p > PLAY + HOLD) return -1
  return Math.min(LAST_MS, FIRST_MS + p * SPEED)
}
export const litCount = (ms: number) => { let n = 0; while (n < ARR.length && ARR[n][2] <= ms) n++; return n }

type LandFile = { features: { geometry: { coordinates: number[][][] } }[] }
const VIEW = { x: -180, y: -78, w: 360, h: 136 }   // lat 78°N … 58°S; Antarctica falls outside
/** Outer rings as one path in degrees (y = −lat), points closer than 0.6° dropped. */
export function landPath(fc: LandFile): string {
  let d = ''
  for (const f of fc.features) {
    const ring = f.geometry.coordinates[0]
    if (!ring || ring.every(([, lat]) => lat < -58)) continue
    let px = Infinity, py = Infinity, s = ''
    for (const [lon, lat] of ring) {
      if (Math.abs(lon - px) + Math.abs(lat - py) < 0.6) continue
      s += `${s ? 'L' : 'M'}${lon.toFixed(1)},${(-lat).toFixed(1)}`; px = lon; py = lat
    }
    if (s.split('L').length > 2) d += `${s}Z`
  }
  return d
}

function WorldMap() {
  const wrap = useRef<HTMLDivElement>(null), msEl = useRef<HTMLSpanElement>(null), nEl = useRef<HTMLSpanElement>(null)
  const [land, setLand] = useState('')

  useEffect(() => {
    const box = wrap.current
    if (!box) return
    let alive = true
    const load = () => getStatic<LandFile>('/geo/land-110m.json').then(fc => { if (alive && fc) setLand(landPath(fc)) })
    if (typeof IntersectionObserver === 'undefined') { load(); return () => { alive = false } }
    const near = new IntersectionObserver(([e]) => { if (e.isIntersecting) { near.disconnect(); load() } }, { rootMargin: '600px 0px' })
    near.observe(box)
    return () => { alive = false; near.disconnect() }
  }, [])

  useEffect(() => {
    const box = wrap.current
    if (!box || reducedMotion() || typeof IntersectionObserver === 'undefined') return
    const dots = [...box.querySelectorAll<SVGGElement>('[data-dot]')]
    let lit = dots.length, raf = 0, clock = 0, last: number | undefined
    const paint = (ms: number) => {
      const n = litCount(ms)
      for (let i = Math.min(n, lit); i < Math.max(n, lit); i++) dots[i]?.toggleAttribute('data-lit', i < n)
      lit = n
      if (msEl.current) msEl.current.textContent = ms < 0 ? '····' : String(Math.round(ms))
      if (nEl.current) nEl.current.textContent = String(CUM[n])
    }
    paint(-1)   // the story starts empty; the server markup is the final frame
    const tick = (ts: number) => {
      if (last !== undefined) clock += ts - last
      last = ts; paint(msAt(clock)); raf = requestAnimationFrame(tick)
    }
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting && !raf) { last = undefined; raf = requestAnimationFrame(tick) }
      else if (!e.isIntersecting && raf) { cancelAnimationFrame(raf); raf = 0 }
    }, { threshold: 0.3 })
    io.observe(box)
    return () => { io.disconnect(); cancelAnimationFrame(raf) }
  }, [])

  return (
    <div ref={wrap} className={styles.map}>
      <p className={styles.tag}><span>slot {SLOT}</span><span>recorded · {SPEED}× speed</span></p>
      <svg className={styles.svg} viewBox={`${VIEW.x} ${VIEW.y} ${VIEW.w} ${VIEW.h}`} role="img"
        aria-label={`World map: ${OBSERVERS} observer nodes at ${ARR.length} sites light in the order they first saw the block of slot ${SLOT}, from ${FIRST_MS} ms to ${LAST_MS} ms after slot start.`}>
        <path className={styles.land} d={land} data-ready={land ? '' : undefined} />
        {ARR.map(([lon, lat, , n], i) => (
          <g key={i} data-dot="" data-lit="" transform={`translate(${lon} ${-lat})`}>
            <circle className={styles.idle} r={1.6 + Math.sqrt(n) * 0.55} />
            <circle className={styles.ring} r={1.6 + Math.sqrt(n) * 0.55} />
            <circle className={styles.core} r={1.6 + Math.sqrt(n) * 0.55} />
          </g>
        ))}
      </svg>
      <p className={styles.read} aria-hidden="true">
        <span><b ref={msEl}>{LAST_MS}</b> ms after slot start</span>
        <span><b ref={nEl}>{OBSERVERS}</b> / {OBSERVERS} observers</span>
      </p>
    </div>
  )
}

export default function MainnetCard() {
  return (
    <section className={styles.section} data-reveal="" aria-labelledby="mainnet-h">
      <article className={styles.card} {...k('card', 0)}>
        <div className={styles.copy}>
          <p className={styles.kicker}><span className={styles.observer} aria-hidden="true"><Glyph role="observer" size={14} /></span>Mainnet arrivals</p>
          <h2 id="mainnet-h" className={styles.h2}>Real blocks, real observers</h2>
          <p className={styles.body}>{`The MAINNET badge polls ethPandaOps once per slot and lights each observer node as a block reaches it: ${ARRIVAL}. The Geo view hides simulated peers, so the pattern is the real network's, never the route a block took.`}</p>
          <dl className={styles.facts}>
            <div><dt>Recorded slots</dt><dd>{SLOTS}</dd></div>
            <div><dt>Observer nodes</dt><dd>{OBSERVERS}</dd></div>
            <div><dt>First seen, slot {SLOT}</dt><dd>{FIRST_MS} ms</dd></div>
          </dl>
          <p className={styles.credit}>{PROVENANCE}</p>
          <div><a className="chev" href={reelHref('mainnet-block-wave')}>Watch the recorded block wave <span aria-hidden="true">›</span></a></div>
        </div>
        <WorldMap />
      </article>
    </section>
  )
}

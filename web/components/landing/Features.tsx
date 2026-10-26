'use client'
// Features (v2): a hairline grid of five cells between the rails, each a numbered mono kicker, a serif
// title, one or two sentences and a live visual that acts out its claim (design-to-motion B4); the mainnet
// cell spans two columns with the world map of observer arrivals (condensed from the old MainnetCard).
// Each cell is its own reveal (the grid is over 3.3 phone viewports tall, so it would never reach the 30%
// bar), staggered by column; each visual runs a story on its own JS clock only while ≥30% of it is on
// screen, offset so the cells never act in unison. Reduced motion (or no IntersectionObserver) draws one
// still frame instead. The server markup IS that still frame, so no-JS readers get the informative state.
// Numbers come from lib/reel-stats.json and the reel manifest; ARR are real observer arrivals.
import { type ComponentType, type CSSProperties, useEffect, useRef, useState } from 'react'
import Stamp from '@/components/dither/Stamp'
import { easeCount } from '@/components/fx/pixel-field'
import { getStatic } from '@/lib/api/client'
import { ARRIVAL } from '@/lib/copy'
import { reducedMotion } from '@/lib/prefs'
import stats from '@/lib/reel-stats.json'
import { REEL_MANIFEST, reelHref } from '@/lib/reels'
import SectionHead from './SectionHead'
import s from './sections.module.css'
import styles from './Features.module.css'

type Draw = (root: HTMLElement, s: number) => void
type Key = [number, number]

/** Keyframe track in seconds, eased per segment (design-to-motion B4). */
export function track(keys: Key[], t: number): number {
  if (t <= keys[0][0]) return keys[0][1]
  for (let k = 1; k < keys.length; k++) {
    const [t1, v1] = keys[k], [t0, v0] = keys[k - 1]
    if (t <= t1) return v0 + (v1 - v0) * easeCount(Math.min(1, (t - t0) / (t1 - t0 || 1)))
  }
  return keys[keys.length - 1][1]
}

/** Story clock: `draw(root, s)` every frame while ≥30% visible, paused off screen, s loops over `loop` s. */
export function useStory(loop: number, still: number, draw: Draw, offset = 0) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const root = ref.current
    if (!root) return
    if (reducedMotion() || typeof IntersectionObserver === 'undefined') { draw(root, still); return }
    let raf = 0, last = 0, elapsed = -offset, on = false
    const tick = (ts: number) => {
      elapsed += Math.min(ts - (last || ts), 100) / 1000   // a long frame (tab switch) never skips a beat
      last = ts
      draw(root, elapsed < 0 ? still : elapsed % loop)   // before its offset a card shows its finished frame
      raf = requestAnimationFrame(tick)
    }
    draw(root, still)   // at rest (off screen, before the first play) every visual shows its finished frame
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting === on) return
      on = e.isIntersecting
      if (on) { last = 0; elapsed = -offset; raf = requestAnimationFrame(tick) } else { cancelAnimationFrame(raf); draw(root, still) }
    }, { threshold: 0.3 })
    io.observe(root)
    return () => { io.disconnect(); cancelAnimationFrame(raf) }
  }, [loop, still, draw, offset])
  return ref
}

const all = (root: HTMLElement, a: string) => root.querySelectorAll<HTMLElement | SVGElement>(`[data-a="${a}"]`)
const set = (root: HTMLElement, a: string, f: (el: HTMLElement | SVGElement, k: number) => void) => all(root, a).forEach(f)
const op = (el: HTMLElement | SVGElement, v: number) => { el.style.opacity = String(v) }
const pct = (v: number) => `${+(v * 100).toFixed(2)}%`

// 1 · Peer scoring: the score falls past GRAFT −5 and PRUNE −10 in two heartbeats, then a PRUNED stamp.
const LO = -13, HI = 1
const x = (v: number) => (v - LO) / (HI - LO)
const drawScore: Draw = (root, s) => {
  const fall = track([[0, 0], [0.6, 0], [1.1, 6], [1.9, 6], [2.4, 11.7], [3.9, 11.7], [4.5, 0]], s)
  set(root, 'bar', el => { el.style.transform = `scaleX(${fall / -LO})` })
  set(root, 'alarm', el => op(el, track([[2.25, 0], [2.4, 1], [3.9, 1], [4.5, 0]], s)))
  set(root, 'hb', (el, k) => op(el, track([[0.6 + k * 1.3, 0], [1 + k * 1.3, 1], [3.9, 1], [4.3, 0]], s)))
  set(root, 'stamp', el => {
    op(el, track([[2.6, 0], [2.8, 1], [3.9, 1], [4.2, 0]], s))
    el.style.transform = `scale(${track([[2.6, 1.15], [2.8, 1]], s)})`
  })
}
function ScoreVisual() {
  const ref = useStory(5.2, 3, drawScore, 0.9)
  return (
    <div ref={ref} className={styles.score} aria-hidden="true">
      <div className={styles.axis}>
        <span className={styles.bar} data-a="bar" style={{ left: 0, right: pct(1 - x(0)) }} />
        <span className={`${styles.bar} ${styles.alarm}`} data-a="alarm" style={{ left: 0, right: pct(1 - x(0)) }} />
        {([[-10, 'PRUNE −10'], [-5, 'GRAFT −5'], [0, '0']] as const).map(([v, l]) => (
          <span key={v} className={styles.tick} style={{ left: pct(x(v)) }}><span>{l}</span></span>
        ))}
      </div>
      <div className={styles.hbs}>
        <span data-a="hb">heartbeat 1</span><span data-a="hb">heartbeat 2</span>
        <span className={styles.stamp} data-a="stamp"><Stamp flame tilt={-3}>pruned</Stamp></span>
      </div>
    </div>
  )
}

// 2 · Attacks: a Sybil diamond grafts into a 7 peer mesh, its dashed flame links appear, then snap away.
const RING = Array.from({ length: 6 }, (_, k) => [100 + 50 * Math.cos((k * Math.PI) / 3), 62 + 38 * Math.sin((k * Math.PI) / 3)] as const)
const PEERS = [[100, 62] as const, ...RING]
const MESH = [[0, 1], [0, 2], [0, 3], [0, 4], [0, 5], [0, 6], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 1]]
const SYBIL = [178, 18] as const
const PREY = [1, 6, 0]
const drawMesh: Draw = (root, s) => {
  set(root, 'sybil', el => {
    op(el, track([[0.8, 0], [1.2, 1], [3.6, 1], [4.4, 0]], s))
    el.style.transform = `translate(${track([[3.4, 0], [4.4, 12]], s)}px, ${track([[3.4, 0], [4.4, -8]], s)}px) scale(${track([[0.8, 0.85], [1.2, 1]], s)})`
  })
  set(root, 'armed', el => op(el, track([[3.4, 1], [3.6, 0]], s)))
  set(root, 'pruned', el => op(el, track([[3.4, 0], [3.6, 1]], s)))
  set(root, 'link', (el, k) => op(el, track([[1.3 + k * 0.25, 0], [1.6 + k * 0.25, 1], [3.4, 1], [3.5, 0]], s)))
}
function MeshVisual() {
  const ref = useStory(5.6, 2.6, drawMesh, 1.35)
  const d = (r: number) => `M0,${-r}L${r},0L0,${r}L${-r},0Z`
  return (
    <div ref={ref} className={styles.mesh} aria-hidden="true">
      <svg viewBox="0 0 200 124" preserveAspectRatio="xMidYMid meet">
        {MESH.map(([a, b]) => <line key={`${a}-${b}`} x1={PEERS[a][0]} y1={PEERS[a][1]} x2={PEERS[b][0]} y2={PEERS[b][1]} className={styles.meshLink} />)}
        {PREY.map((p) => <line key={p} data-a="link" x1={SYBIL[0]} y1={SYBIL[1]} x2={PEERS[p][0]} y2={PEERS[p][1]} className={styles.attackLink} />)}
        {PEERS.map(([cx, cy], k) => <circle key={k} cx={cx} cy={cy} r={6} className={styles.peer} />)}
        <g data-a="sybil" className={styles.sybil}>
          <g transform={`translate(${SYBIL[0]} ${SYBIL[1]})`}>
            <path data-a="armed" d={d(9)} className={styles.armed} />
            <path data-a="pruned" d={d(9)} className={styles.prunedGlyph} style={{ opacity: 0 }} />
          </g>
        </g>
      </svg>
    </div>
  )
}

// 3 · Recordings: a playhead sweeps the sybil-eclipse reel; each beat tick labels itself as the head passes.
export const BEATS: [number, string][] = [[stats.sybilAt, 'Sybil graft'], [stats.firstScorePruneAt, 'first prune'], [stats.eclipseAt, `eclipse on ${stats.eclipseTarget}`], [stats.clearedAt, 'faults cleared']]
const SWEEP = [0.4, 6.4] as const
const drawScrub: Draw = (root, s) => {
  const p = s < SWEEP[1] ? Math.max(0, (s - SWEEP[0]) / (SWEEP[1] - SWEEP[0])) : track([[7, 1], [7.4, 0]], s)   // play, hold, rewind
  const tNow = p * stats.simDurationS
  set(root, 'head', el => { el.style.transform = `translateX(${pct(p)})` })
  set(root, 'fill', el => { el.style.transform = `scaleX(${p})` })
  set(root, 'lab', (el, k) => op(el, Math.min(1, Math.max(0, (tNow - BEATS[k][0]) / 0.6))))
  set(root, 'time', el => { el.textContent = tNow.toFixed(1) })
  const beat = [...BEATS].reverse().find(([t]) => tNow >= t)
  set(root, 'beat', el => { el.textContent = beat ? beat[1] : 'publish' })
}
function ScrubVisual() {
  const ref = useStory(7.6, 6.4, drawScrub, 1.8)
  return (
    <div ref={ref} className={styles.scrub} aria-hidden="true">
      <p className={styles.readout}>T+<span data-a="time">{stats.simDurationS.toFixed(1)}</span> s <span className={styles.dim}>/ {stats.simDurationS} s · </span><span data-a="beat">{BEATS[3][1]}</span></p>
      <div className={styles.track}>
        <span className={styles.rail} />
        <span className={styles.fill} data-a="fill" />
        {BEATS.map(([t], k) => (
          <span key={t} className={`${styles.beat} ${k % 2 ? styles.below : ''}`} style={{ left: pct(t / stats.simDurationS) }}>
            <span className={styles.lab} data-a="lab">{t}</span>
          </span>
        ))}
        <span className={styles.headWrap} data-a="head" style={{ transform: 'translateX(100%)' }}><span className={styles.playhead} /></span>
      </div>
      <p className={styles.ends}><span>0 s</span><span>{stats.simDurationS} s</span></p>
    </div>
  )
}

// 4 · Mainnet: an equirectangular world (public/geo/land-110m.json, fetched once the cell nears the
// viewport) whose observer sites light in the order they first saw the block of slot 15466393, replayed
// from the recording at 0.4× speed. No LIVE claim: this page is static, the dots are the recorded slot.
export const SLOT = 15466393
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
const LEAD = 0.7, HOLD = 1.8, RESET = 0.6, PLAY = (LAST_MS - FIRST_MS) / 1000 / SPEED
export const MAP_LOOP = LEAD + PLAY + HOLD + RESET
/** story seconds → ms after slot start on screen; −1 = nothing lit (lead in, reset) */
export function msAt(t: number): number {
  const p = t % MAP_LOOP - LEAD
  if (p < 0 || p > PLAY + HOLD) return -1
  return Math.min(LAST_MS, FIRST_MS + p * 1000 * SPEED)
}
export const litCount = (ms: number) => { let n = 0; while (n < ARR.length && ARR[n][2] <= ms) n++; return n }

type LandFile = { features: { geometry: { coordinates: number[][][] } }[] }
const VIEW = { x: -180, y: -72, w: 360, h: 124 }   // lat 72°N … 52°S: every site with room for its ping, no polar sea
/** Outer rings as one path in degrees (y = −lat), points closer than 0.6° dropped, Antarctica cropped. */
export function landPath(fc: LandFile): string {
  let d = ''
  for (const f of fc.features) {
    const ring = f.geometry.coordinates[0]
    if (!ring || ring.every(([, lat]) => lat < -58)) continue
    let px = Infinity, py = Infinity, p = ''
    for (const [lon, lat] of ring) {
      if (Math.abs(lon - px) + Math.abs(lat - py) < 0.6) continue
      p += `${p ? 'L' : 'M'}${lon.toFixed(1)},${(-lat).toFixed(1)}`; px = lon; py = lat
    }
    if (p.split('L').length > 2) d += `${p}Z`
  }
  return d
}
const drawMap: Draw = (root, t) => {
  const ms = msAt(t), n = litCount(ms)
  root.querySelectorAll('[data-dot]').forEach((el, i) => el.toggleAttribute('data-lit', i < n))
  set(root, 'ms', el => { el.textContent = ms < 0 ? '····' : String(Math.round(ms)) })
  set(root, 'obs', el => { el.textContent = String(CUM[n]) })
}
function MapVisual() {
  const ref = useStory(MAP_LOOP, MAP_LOOP - RESET - 0.01, drawMap, 0.6)
  const [land, setLand] = useState('')
  useEffect(() => {
    const box = ref.current
    if (!box) return
    let alive = true
    const load = () => getStatic<LandFile>('/geo/land-110m.json').then(fc => { if (alive && fc) setLand(landPath(fc)) })
    if (typeof IntersectionObserver === 'undefined') { load(); return () => { alive = false } }
    const near = new IntersectionObserver(([e]) => { if (e.isIntersecting) { near.disconnect(); load() } }, { rootMargin: '600px 0px' })
    near.observe(box)
    return () => { alive = false; near.disconnect() }
  }, [ref])
  return (
    <div ref={ref} className={styles.map} aria-hidden="true">
      <p className={styles.mapTag}><span>slot {SLOT}</span><span>recorded · {SPEED}× speed</span></p>
      <svg className={styles.world} viewBox={`${VIEW.x} ${VIEW.y} ${VIEW.w} ${VIEW.h}`}>
        <path className={styles.land} d={land} data-ready={land ? '' : undefined} />
        {ARR.map(([lon, lat, , n], i) => (
          <g key={i} data-dot="" data-lit="" transform={`translate(${lon} ${-lat})`}>
            <circle className={styles.idle} r={1.6 + Math.sqrt(n) * 0.55} />
            <circle className={styles.ping} r={1.6 + Math.sqrt(n) * 0.55} />
            <circle className={styles.core} r={1.6 + Math.sqrt(n) * 0.55} />
          </g>
        ))}
      </svg>
      <p className={styles.mapRead}>
        <span><b data-a="ms">{LAST_MS}</b> ms after slot start</span>
        <span><b data-a="obs">{OBSERVERS}</b> / {OBSERVERS} observers</span>
      </p>
    </div>
  )
}

// 6 · Stage: the hero ticker counts up to the recording's numbers, then a wash steps across the readouts.
export const TICKER: [number, number, string, string][] = [[stats.deliveryPct, 0, '%', 'delivery'], [stats.avgHops, 1, '', 'avg hops'], [stats.avgPropagationMs, 0, 'ms', 'propagation']]
const drawTicker: Draw = (root, s) => {
  const t = easeCount(Math.min(1, Math.max(0, (s - 0.3) / 0.9)))
  set(root, 'val', (el, k) => { const [v, dp] = TICKER[k]; el.textContent = (v * t).toFixed(dp) })
  set(root, 'wash', (el, k) => op(el, track([[1.8 + k, 0], [2.1 + k, 1], [2.6 + k, 1], [2.9 + k, 0]], s)))
}
function TickerVisual() {
  const ref = useStory(5.4, 1.4, drawTicker, 2.6)
  return (
    <div ref={ref} className={styles.ticker} aria-hidden="true">
      {TICKER.map(([v, dp, unit, label]) => (
        <div key={label} className={styles.cell}>
          <span className={styles.wash} data-a="wash" style={{ opacity: 0 }} />
          <span className={styles.value}><span data-a="val">{v.toFixed(dp)}</span><small>{unit}</small></span>
          <span className={styles.label}>{label}</span>
        </div>
      ))}
    </div>
  )
}

interface Card { kicker: string; title: string; body: string; visual: ComponentType; alt: string; link: [string, string]; wide?: boolean }
export const CARDS: Card[] = [
  {
    kicker: 'P1–P4 scoring', title: 'Peer scoring that bites', visual: ScoreVisual,
    body: `Every invalid message costs a Sybil ten points of P4. Its score falls past the GRAFT bar at −5 and the PRUNE bar at −10, and the mesh drops it ${stats.heartbeatsToPrune} heartbeats after the graft.`,
    alt: 'A score bar falls from 0 past GRAFT −5 and PRUNE −10 in two heartbeats; the peer is pruned.',
    link: ['/sim/', 'Open the simulator'],
  },
  {
    kicker: 'Fault injection', title: 'Attacks you inject live', visual: MeshVisual,
    body: `Graft ${stats.sybils} Sybils, eclipse one peer or cut the network in two while it runs. Clear the fault and the mesh heals: ${stats.healedInS} s in the recording.`,
    alt: 'A flame diamond grafts into a seven peer mesh with dashed links, then the links snap away.',
    link: ['/sim/', 'Inject an attack'],
  },
  {
    kicker: 'Recordings', title: 'Reproducible recordings', visual: ScrubVisual,
    body: 'Any run can be recorded and replayed in the browser with no backend. Scrub straight to the graft, the prune or the heal.',
    alt: `A playhead sweeps a ${stats.simDurationS} s recording past beats at ${BEATS.map(([t]) => `${t} s`).join(', ')}.`,
    link: [reelHref('sybil-eclipse'), 'Watch the Sybil recording'],
  },
  {
    kicker: 'Live mainnet', title: 'Real block arrivals, on a map', visual: MapVisual, wide: true,
    body: `In mainnet mode the Geo view lights ethPandaOps observers as each block reaches them: ${ARRIVAL}. The pattern is the real network's, never the path a block took.`,
    alt: `World map: ${OBSERVERS} observer nodes at ${ARR.length} sites light in the order they first saw the block of slot ${SLOT}, from ${FIRST_MS} ms to ${LAST_MS} ms after slot start.`,
    link: [reelHref('mainnet-block-wave'), 'Watch the recorded block wave'],
  },
  {
    kicker: 'Stage mode', title: 'Built for the stage', visual: TickerVisual,
    body: 'Every recording opens in a projector theme with a broadcast ticker, and the number keys jump between recordings mid talk.',
    alt: `A broadcast ticker counts up to delivery ${stats.deliveryPct}%, ${stats.avgHops} average hops and ${stats.avgPropagationMs} ms propagation.`,
    link: [reelHref('sybil-eclipse', new URLSearchParams('theme=stage&hero=1')), 'Open a recording on stage'],
  },
]

const at = (i: number) => ({ '--i': i }) as CSSProperties

export default function Features() {
  return (
    <section id="features" className={styles.section} aria-labelledby="features-h">
      <SectionHead id="features-h" kicker="What it does"
        title="A GossipSub v1.1 network you can run on a laptop"
        lead={'20 to 200 simulated libp2p peers with mesh, IHAVE/IWANT and P1\u2060–\u2060P4 peer scoring. Attack it, record it, replay it.'} />
      <div className={s.row} data-grid="">
        <ul className={styles.grid}>
          {CARDS.map(({ kicker, title, body, visual: Visual, alt, link, wide }, k) => (
            <li key={title} data-reveal="" className={wide ? styles.wide : undefined}>
              <article className={styles.card} data-k="card" style={at(k % 3)}>
                <p className={styles.cardKicker}><span>{String(k + 1).padStart(2, '0')}</span>{kicker}</p>
                <figure className={`plate ${styles.visual}`}><Visual /><figcaption className="sr-only">{alt}</figcaption></figure>
                <h3 className={styles.h3}>{title}</h3>
                <p className={styles.body}>{body}</p>
                <a className={styles.link} href={link[0]}>{link[1]}<span aria-hidden="true">→</span></a>
              </article>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

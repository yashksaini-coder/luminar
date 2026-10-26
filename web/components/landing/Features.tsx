'use client'
// Features bento: six cards, each a mono kicker, a serif title, one or two sentences and a small live
// visual that acts out its claim (design-to-motion B4). Each card is its own reveal (the whole grid is
// over 3.3 phone viewports tall, so it would never reach the 30% bar), staggered by column; each visual runs a story on its own JS clock only while ≥30% of it is on screen, offset so the
// cards never act in unison. Reduced motion (or no IntersectionObserver) draws one still frame instead.
// The server markup IS that still frame, so no-JS readers get the informative state too.
// Numbers come from lib/reel-stats.json and the reel manifest; ARRIVALS are real observer arrivals.
import { type ComponentType, type CSSProperties, useEffect, useRef } from 'react'
import Stamp from '@/components/dither/Stamp'
import { easeCount } from '@/components/fx/pixel-field'
import { ARRIVAL, SAME_NAMES } from '@/lib/copy'
import { reducedMotion } from '@/lib/prefs'
import stats from '@/lib/reel-stats.json'
import { REEL_MANIFEST, reelHref } from '@/lib/reels'
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

// 4 · Mainnet: ten of the 138 observers of slot 15466393 light in their real arrival order and spacing.
// Sampled every ~15th rank from public/reels/mainnet-block-wave.jsonl (BlockSeen, seen_ms); the test re-checks them.
export const SLOT = 15466393
export const ARRIVALS: [string, number][] = [['AT', 3247], ['FI', 3272], ['FI', 3298], ['FI', 3329], ['US', 3359], ['BR', 3389], ['BR', 3433], ['US', 3494], ['AU', 3581], ['US', 5195]]
const OBSERVERS = REEL_MANIFEST.find((r) => r.name === 'mainnet-block-wave')?.nodes ?? 0
const litAt = (ms: number) => 0.5 + ((ms - ARRIVALS[0][1]) / 1000) * 2.4   // 2.4× slower than real time
const drawWave: Draw = (root, s) => {
  const fade = track([[6.4, 1], [6.8, 0]], s)
  set(root, 'lit', (el, k) => op(el, track([[litAt(ARRIVALS[k][1]), 0], [litAt(ARRIVALS[k][1]) + 0.15, 1]], s) * fade))
  set(root, 'ring', (el, k) => {
    const t = s - litAt(ARRIVALS[k][1]), on = t >= 0 && t < 0.9
    op(el, on ? 0.55 * (1 - t / 0.9) : 0)
    el.style.transform = `scale(${on ? 1 + 1.6 * easeCount(t / 0.9) : 1})`
  })
}
function WaveVisual() {
  const ref = useStory(7.2, 6.2, drawWave, 0.6)
  return (
    <div ref={ref} className={styles.wave} aria-hidden="true">
      <p className={styles.meta}>recorded slot {SLOT}</p>
      <ol className={styles.strip}>
        {ARRIVALS.map(([cc, ms], k) => (
          <li key={k}>
            <span className={styles.obs}><span className={styles.lit} data-a="lit" /><span className={styles.ring} data-a="ring" style={{ opacity: 0 }} /></span>
            <span className={styles.cc}>{cc}</span><span className={styles.ms}>{ms}</span>
          </li>
        ))}
      </ol>
      <p className={styles.meta}>{OBSERVERS} observers · ms in slot</p>
    </div>
  )
}

// 5 · Metrics: the curl types, four gossipsub_* names land, the publish counter ticks with each message.
export const CMD = 'curl localhost:8000/metrics'
export const NAMES = ['gossipsub_mesh_peer_counts', 'gossipsub_score_per_mesh', 'gossipsub_topic_iwant_msgs', 'gossipsub_topic_msg_published']
const TYPE = [0.3, 0.055] as const   // start, s per glyph
const COUNT_FROM = 3.1, COUNT_EVERY = 0.6, COUNT_MAX = 6
const drawMetrics: Draw = (root, s) => {
  const back = s > 7.6 ? Math.ceil((s - 7.6) / 0.03) : 0   // deletes a little faster than it types
  const n = Math.max(0, Math.min(CMD.length, Math.floor((s - TYPE[0]) / TYPE[1])) - back)
  set(root, 'cmd', el => { el.textContent = CMD.slice(0, n) })
  set(root, 'caret', el => op(el, n < CMD.length && s > TYPE[0] ? 1 : s % 1 < 0.5 ? 1 : 0))
  const done = TYPE[0] + CMD.length * TYPE[1]
  set(root, 'line', (el, k) => op(el, track([[done + 0.2 + k * 0.15, 0.2], [done + 0.5 + k * 0.15, 1], [7.4, 1], [7.6, 0.2]], s)))   // last scrape stays faint, never an empty card
  const c = s < COUNT_FROM ? 0 : Math.min(COUNT_MAX, 1 + Math.floor((s - COUNT_FROM) / COUNT_EVERY))
  set(root, 'count', el => { el.textContent = String(c) })
  const since = s - COUNT_FROM
  set(root, 'flash', el => op(el, since >= 0 && since < COUNT_MAX * COUNT_EVERY ? 0.6 * (1 - (since % COUNT_EVERY) / COUNT_EVERY) : 0))
}
function MetricsVisual() {
  const ref = useStory(8.6, 7.2, drawMetrics, 2.2)
  return (
    <div ref={ref} className={styles.code} aria-hidden="true">
      <p className={styles.cmd}><span className={styles.dim}>$ </span><span data-a="cmd">{CMD}</span><span className={styles.caret} data-a="caret" /></p>
      <ul>
        {NAMES.map((name) => (
          <li key={name} data-a="line">
            {name === NAMES[3] && <span className={styles.flash} data-a="flash" style={{ opacity: 0 }} />}
            <span>{name}</span>{name === NAMES[3] && <b data-a="count">{COUNT_MAX}</b>}
          </li>
        ))}
      </ul>
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

interface Card { kicker: string; title: string; body: string; visual: ComponentType; alt: string; link?: [string, string] }
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
    body: 'Record the frames the backend streams to JSONL and replay them offline with no backend. Scrub straight to the graft, the prune or the heal.',
    alt: `A playhead sweeps a ${stats.simDurationS} s recording past beats at ${BEATS.map(([t]) => `${t} s`).join(', ')}.`,
    link: [reelHref('sybil-eclipse'), 'Watch the Sybil recording'],
  },
  {
    kicker: 'Live mainnet', title: 'Real block arrivals', visual: WaveVisual,
    body: `The Geo view lights ethPandaOps observers as each mainnet block reaches them: ${ARRIVAL}.`,
    alt: `Ten observers of recorded slot ${SLOT} light in arrival order, from ${ARRIVALS[0][1]} ms to ${ARRIVALS[ARRIVALS.length - 1][1]} ms.`,
    link: [reelHref('mainnet-block-wave'), 'Watch the recorded block wave'],
  },
  {
    kicker: 'Observability', title: 'Same metric names', visual: MetricsVisual,
    body: `/metrics carries ${SAME_NAMES}, scraped by the bundled Prometheus; publish traces go out over OpenTelemetry. The names match; the numbers are the toy's.`,
    alt: `A terminal runs ${CMD} and lists four gossipsub metric names while the publish counter ticks.`,
  },
  {
    kicker: 'Stage mode', title: 'Built for the stage', visual: TickerVisual,
    body: 'Add ?theme=stage&hero=1 to any recording for a projector theme and a broadcast ticker. Keys 1 to 9 jump between recordings.',
    alt: `A broadcast ticker counts up to delivery ${stats.deliveryPct}%, ${stats.avgHops} average hops and ${stats.avgPropagationMs} ms propagation.`,
    link: [reelHref('sybil-eclipse', new URLSearchParams('theme=stage&hero=1')), 'Open a recording on stage'],
  },
]

const at = (i: number) => ({ '--i': i }) as CSSProperties

export default function Features() {
  return (
    <section className={styles.section} aria-labelledby="features-h">
      <header className={styles.head} data-reveal="">
        <p className={styles.kicker} data-k="up" style={at(0)}>What it does</p>
        <h2 id="features-h" className={styles.h2} data-k="up" style={at(1)}>A GossipSub v1.1 network you can run on a laptop</h2>
        <p className={styles.lead} data-k="up" style={at(2)}>20 to 200 simulated libp2p peers with mesh, IHAVE/IWANT and P1–P4 peer scoring. Attack it, record it, scrape it.</p>
      </header>
      <ul className={styles.grid}>
        {CARDS.map(({ kicker, title, body, visual: Visual, alt, link }, k) => (
          <li key={title} data-reveal="">
            <article className={styles.card} data-k="card" style={at(k % 3)}>
              <figure className={`plate ${styles.visual}`}><Visual /><figcaption className="sr-only">{alt}</figcaption></figure>
              <p className={styles.cardKicker}>{kicker}</p>
              <h3 className={styles.h3}>{title}</h3>
              <p className={styles.body}>{body}</p>
              {link && <a className={`chev ${styles.link}`} href={link[0]}>{link[1]} <span aria-hidden="true">›</span></a>}
            </article>
          </li>
        ))}
      </ul>
    </section>
  )
}

// Problem framing (landing v2 §3, fixpoint reference): a centred two-line serif statement with one
// highlighted word, then three benefit columns between the grid rails, each over a small PixelField.
// Every number comes from the sybil-eclipse recording (lib/reel-stats.json).
import type { CSSProperties } from 'react'
import Cursor from '@/components/fx/Cursor'
import PixelField from '@/components/fx/PixelField'
import type { Preset } from '@/components/fx/pixel-field'
import type { Tint } from '@/components/fx/PixelField'
import stats from '@/lib/reel-stats.json'
import styles from './Problem.module.css'

export interface Benefit { title: string; body: string; value: string; unit: string; preset: Preset; tint: Tint; accent?: Tint; art: string }

export const BENEFITS: Benefit[] = [
  {
    title: 'See every hop',
    body: `A publish lights the mesh peer by peer, so you watch the path it takes. In the recording each message crosses ${stats.peers} peers in ${stats.avgHops} hops on average.`,
    value: String(stats.avgHops), unit: 'avg hops', preset: 'sphere', tint: 'signal',
    art: `A small globe of ${stats.peers} peers with a publish crossing it`,
  },
  {
    title: 'Break it on purpose',
    body: `Inject Sybils, an eclipse or a partition, live or on a timer, and watch P1–P4 scoring answer. ${stats.sybils} Sybils grafted at T+${stats.sybilAt} s are gone by T+${stats.firstScorePruneAt} s.`,
    value: String(stats.heartbeatsToPrune), unit: 'heartbeats to prune', preset: 'swirl', tint: 'paper', accent: 'flame',
    art: 'A dither swirl winding into a flame centre: a fault pulling on the mesh',
  },
  {
    title: 'Replay any moment',
    body: 'Every run can be recorded and scrubbed in the browser with no backend. Pause on the prune, step back to the graft, share the timestamp.',
    value: String(stats.simDurationS), unit: 's recorded', preset: 'scatter', tint: 'signal',
    art: 'A loose cloud of dots settling into a grid, like frames of a recording',
  },
]

const i = (n: number) => ({ '--i': n }) as CSSProperties

export default function Problem() {
  return (
    <section id="problem" className={styles.section} aria-labelledby="problem-h" data-grid="">
      <div className={styles.head} data-reveal="">
        <h2 id="problem-h" className={styles.h2}>
          <span data-k="up" style={i(0)}>Gossip attacks are invisible</span>{' '}
          <span data-k="up" style={i(1)}>until the mesh <em className={styles.hl}>breaks</em></span>
        </h2>
        <p className={styles.sub} data-k="up" style={i(2)}>
          A flooding Sybil or a silent eclipse looks like any other peer until delivery drops. Luminar puts the mechanism on screen.
        </p>
      </div>
      <ol className={styles.cols} data-reveal="">
        {BENEFITS.map((b, n) => (
          <li key={b.title} className={styles.col} data-k="card" style={i(n)}>
            <span className={styles.idx} aria-hidden="true">{`0${n + 1}`}</span>
            <h3 className={styles.h3}>{b.title}</h3>
            <p className={styles.body}>{b.body}</p>
            <div className={styles.art}>
              <PixelField preset={b.preset} tint={b.tint} accent={b.accent} cell={5} nodes={b.preset === 'sphere' ? stats.peers : undefined} speed={0.8} aria-label={b.art} />
            </div>
            <p className={styles.fact}><b>{b.value}</b> {b.unit}<Cursor /></p>
          </li>
        ))}
      </ol>
    </section>
  )
}

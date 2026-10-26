// Landing hero (v2, Axiom reference): two grid cells between the rails. Left, on a hairline hatch: the chip,
// the serif headline, the lead (ending on the honesty line) and two CTAs. Right: the PixelField globe of
// fifty peers with a publish wave crossing it, under a status chip and a level meter. Below, one grid row:
// the "modelled on" wordmarks (text, not logos) and the stats bar from the recording with blinking cursors.
// The section reveals once (D2). The lead is the LCP element and must not wait for the Reveal island to hydrate,
// so the root layout's head script sets data-in on [data-hero-reveal] at DOMContentLoaded (suppressHydrationWarning:
// data-in). Keeping that script in the layout means React never renders a <script> on client navigation.
import type { CSSProperties } from 'react'
import Cursor from '@/components/fx/Cursor'
import PixelField from '@/components/fx/PixelField'
import { MECHANISM } from '@/lib/copy'
import stats from '@/lib/reel-stats.json'
import { reelHref } from '@/lib/reels'
import styles from './Hero.module.css'

export const LEAD = `Fifty simulated peers run GossipSub v1.1 with P1–P4 peer scoring. Inject Sybils, an eclipse or a partition and watch the score bite, live or from a recording. ${MECHANISM}`
export const MODELLED_ON = ['libp2p', 'GossipSub v1.1', 'Ethereum', 'OpenTelemetry', 'Prometheus'] as const
/** value, unit, label: every number from the sybil-eclipse recording (lib/reel-stats.json) */
export const STATS: [number, string, string][] = [
  [stats.peers, '', 'Peers'],
  [stats.heartbeatsToPrune, 'heartbeats', 'Sybils pruned in'],
  [stats.deliveryPct, '%', 'Delivery'],
]
const METER = 14
const i = (n: number) => ({ '--i': n }) as CSSProperties

export default function Hero() {
  return (
    <section className={styles.top} data-reveal="" data-hero-reveal="" aria-labelledby="hero-h" suppressHydrationWarning>
      <div className={styles.cells} data-grid="">
        <div className={styles.copy}>
          <p className={styles.chip} data-k="up" style={i(0)}>GossipSub v1.1 simulator<Cursor /></p>
          <h1 id="hero-h" className={styles.h1}><span data-k="up" style={i(1)}>Watch a peer-to-peer</span> <span data-k="up" style={i(2)}>network defend itself</span></h1>
          <p className={styles.lead} data-k="up" style={i(3)}>{LEAD}</p>
          <div className={styles.ctas}>
            <span data-k="pop" style={i(4)}><a className={styles.primary} href="/sim/">Open the simulator</a></span>
            <span data-k="up" style={i(5)}><a className={styles.ghost} href={reelHref('sybil-eclipse')}>Watch a recording</a></span>
          </div>
        </div>
        <div className={styles.visual}>
          <PixelField preset="sphere" tint="signal" cell={7} nodes={stats.peers} className={styles.globe}
            aria-label={`${stats.peers} peers on a turning globe; a publish spreads hop by hop across the mesh`} />
          <p className={styles.status}><span className={styles.dot} aria-hidden="true" />All peers gossiping</p>
          <span className={styles.meter} aria-hidden="true">{Array.from({ length: METER }, (_, n) => <i key={n} style={i(n)} />)}</span>
        </div>
      </div>
      <div className={styles.strip} data-grid="">
        <div className={styles.marks}>
          <p className={styles.label} id="modelled-on">Modelled on</p>
          <ul aria-labelledby="modelled-on">{MODELLED_ON.map((m, n) => <li key={m} data-mark={n}>{m}</li>)}</ul>
        </div>
        <dl className={styles.stats} aria-label="From the sybil-eclipse recording">
          {STATS.map(([v, unit, label], n) => (
            <div key={label} data-k="up" style={i(6 + n)}>
              <dt>{label}</dt>
              <dd>{v}{unit === '%' ? '%' : unit && <span className={styles.unit}>{unit}</span>}<Cursor /></dd>
            </div>
          ))}
        </dl>
      </div>
      <div className={styles.close} data-grid="" aria-hidden="true" />
    </section>
  )
}

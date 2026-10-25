// Landing hero: the two-line poster, the lead (ending on the honesty line), the two calls to action,
// the proof line from the recording and Fig. 1, the live replay plate. The section reveals once (D2):
// poster lines, lead, CTA, chevron, proof and Fig. 1 caption rise in reading order.
import type { CSSProperties } from 'react'
import Figure from '@/components/dither/Figure'
import PlateReplay from '@/components/landing/PlateReplay'
import type { PlateFrames } from '@/components/landing/plate-draw'
import { FIG1, MECHANISM } from '@/lib/copy'
import plateFrames from '@/lib/plate-frames.json'
import stats from '@/lib/reel-stats.json'
import { reelHref } from '@/lib/reels'
import styles from './Hero.module.css'

const PRUNE_AFTER_S = (stats.firstScorePruneAt - stats.sybilAt).toFixed(1)   // 11.9 − 10.2 → 1.7
export const PROOF = `${stats.peers} peers · ${stats.sybils} Sybils · first prune ${PRUNE_AFTER_S} s after the graft · ${stats.deliveryPct}% delivery`
const i = (n: number) => ({ '--i': n }) as CSSProperties

export default function Hero() {
  return (
    <section className={styles.hero} data-reveal="">
      <div className={styles.prose}>
        <h1 className={styles.poster}><span data-k="up" style={i(0)}>Gossip,</span><br /><span data-k="up" style={i(1)}><em>scored.</em></span></h1>
        <p className={styles.lead} data-k="up" style={i(2)}>
          {`Fifty simulated peers run GossipSub v1.1: mesh, flood publish, IHAVE/IWANT and P1–P4 peer scoring. Inject Sybils, an eclipse or a partition and watch the score bite, live or from a recording. ${MECHANISM}`}
        </p>
        <div className={styles.row}>
          <span data-k="pop" style={i(3)}><a className={`btn btn-primary ${styles.cta}`} href="/sim/">Open the simulator</a></span>
          <span data-k="up" style={i(4)}><a className="chev" href={reelHref('sybil-eclipse')}>Watch a recording <span aria-hidden="true">›</span></a></span>
        </div>
        <p className={styles.proof} data-k="up" style={i(5)}>{PROOF}</p>
      </div>
      <div className={styles.plate}>
        <Figure n={1} caption={FIG1} captionI={5}><PlateReplay plate={plateFrames as PlateFrames} /></Figure>
      </div>
    </section>
  )
}

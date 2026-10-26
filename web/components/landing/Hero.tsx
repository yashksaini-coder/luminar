// Landing hero: the two-line poster, the lead (ending on the honesty line), the two calls to action,
// the proof line from the recording and Fig. 1, the live replay plate. The section reveals once (D2):
// poster lines, lead, CTA, chevron, proof and Fig. 1 caption rise in reading order. The inline script
// after the section sets data-in at parse time (a forced reflow first so the transition still runs):
// the lead is the LCP element and must not wait for the Reveal island to hydrate (Lighthouse LCP 7 s → ~FCP).
// Above the poster, four spec chips say what it is at a glance; under the CTAs, a terminal chip copies the
// whole local setup (clone, install, run) for the developer who would rather start than read.
import type { CSSProperties } from 'react'
import Figure from '@/components/dither/Figure'
import CopyCommand from '@/components/landing/CopyCommand'
import PlateReplay from '@/components/landing/PlateReplay'
import type { PlateFrames } from '@/components/landing/plate-draw'
import { FIG1, MECHANISM, REPO_URL } from '@/lib/copy'
import plateFrames from '@/lib/plate-frames.json'
import stats from '@/lib/reel-stats.json'
import { reelHref } from '@/lib/reels'
import styles from './Hero.module.css'

const PRUNE_AFTER_S = (stats.firstScorePruneAt - stats.sybilAt).toFixed(1)   // 11.9 − 10.2 → 1.7
export const PROOF = `${stats.peers} peers · ${stats.sybils} Sybils · first prune ${PRUNE_AFTER_S} s after the graft · ${stats.deliveryPct}% delivery`
export const CHIPS = ['GossipSub v1.1', 'P1–P4 scoring', '20–200 peers', 'OpenTelemetry']
export const SETUP = `git clone https://${REPO_URL} && cd luminar && make install && make dev`
const i = (n: number) => ({ '--i': n }) as CSSProperties

export default function Hero() {
  return (<>
    <section className={styles.hero} data-reveal="">
      <div className={styles.prose}>
        <ul className={styles.chips} aria-label="What it is" data-k="up" style={i(0)}>{CHIPS.map((c) => <li key={c}>{c}</li>)}</ul>
        <h1 className={styles.poster}><span data-k="up" style={i(1)}>Gossip,</span><br /><span data-k="up" style={i(2)}><em>scored.</em></span></h1>
        <p className={styles.lead} data-k="up" style={i(3)}>
          {`Fifty simulated peers run GossipSub v1.1: mesh, flood publish, IHAVE/IWANT and P1–P4 peer scoring. Inject Sybils, an eclipse or a partition and watch the score bite, live or from a recording. ${MECHANISM}`}
        </p>
        <div className={styles.row}>
          <span data-k="pop" style={i(4)}><a className={`btn btn-primary ${styles.cta}`} href="/sim/">Open the simulator</a></span>
          <span data-k="up" style={i(5)}><a className="chev" href={reelHref('sybil-eclipse')}>Watch a recording <span aria-hidden="true">›</span></a></span>
        </div>
        <div className={styles.term} data-k="up" style={i(6)}>
          <code><span className={styles.prompt} aria-hidden="true">$</span> make dev <span className={styles.where}>→ localhost:3000</span></code>
          <CopyCommand text={SETUP} label="Copy the clone, install and run commands" className={styles.copy} />
        </div>
        <p className={styles.proof} data-k="up" style={i(7)}>{PROOF}</p>
      </div>
      <div className={styles.plate}>
        <Figure n={1} caption={FIG1} captionI={7}><PlateReplay plate={plateFrames as PlateFrames} /></Figure>
      </div>
    </section>
    <script dangerouslySetInnerHTML={{ __html: "(function(s){s.offsetWidth;s.dataset.in='1'})(document.currentScript.previousElementSibling)" }} />
  </>)
}

// Landing hero: the two-line poster, the lead (ending on the honesty line), the two calls to action
// and Fig. 1, the live replay plate.
import Figure from '@/components/dither/Figure'
import PlateReplay from '@/components/landing/PlateReplay'
import type { PlateFrames } from '@/components/landing/plate-draw'
import { FIG1, MECHANISM } from '@/lib/copy'
import plateFrames from '@/lib/plate-frames.json'
import styles from './Hero.module.css'

export default function Hero() {
  return (
    <section className={styles.hero}>
      <div className={styles.prose}>
        <h1 className={styles.poster}>Gossip,<br /><em>scored.</em></h1>
        <p className={styles.lead}>
          {`Fifty simulated peers run GossipSub v1.1: mesh, flood publish, IHAVE/IWANT and P1–P4 peer scoring. Inject Sybils, an eclipse or a partition and watch the score bite, live or from a recording. ${MECHANISM}`}
        </p>
        <div className={styles.row}>
          <a className={`btn btn-primary ${styles.cta}`} href="/sim/">Open the simulator</a>
          <a className="chev" href="/reels/sybil-eclipse/">Watch a recording <span aria-hidden="true">›</span></a>
        </div>
      </div>
      <div className={styles.plate}>
        <Figure n={1} caption={FIG1}><PlateReplay plate={plateFrames as PlateFrames} /></Figure>
      </div>
    </section>
  )
}

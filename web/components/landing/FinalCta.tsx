// Final call to action (land-03): the hero's two actions again for the reader who reached the bottom.
// Reuses Hero.module.css read-only for the gutter, prose column, row and CTA geometry (plan T6).
// data-k sits on wrappers, never on .btn/.chev, because [data-k] carries the rise transition.
import { reelHref } from '@/lib/reels'
import styles from './Hero.module.css'

const at = (i: number) => ({ '--i': i }) as React.CSSProperties

export default function FinalCta() {
  return (
    <section data-reveal aria-label="Open the simulator" className={styles.hero}>
      <div className={styles.prose}>
        <p className="t-display" data-k="up" style={at(0)}>Fifty peers, five Sybils, two heartbeats.</p>
        <div className={styles.row}>
          <div data-k="pop" style={at(1)}><a className={`btn btn-primary ${styles.cta}`} href="/sim/">Open the simulator</a></div>
          <div data-k="up" style={at(2)}><a className="chev" href={reelHref('sybil-eclipse')}>Watch a recording <span aria-hidden="true">›</span></a></div>
        </div>
      </div>
    </section>
  )
}

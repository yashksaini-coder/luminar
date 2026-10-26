// Fig. 2: the relay globe framed in the page grid. A header row, then the plate: the globe on its paper
// rectangle inside a pitch plate, one halo ring over the paper's top-right corner, stamp bottom-left,
// caption the honesty line (FIG2). Under it a mono legend strip names the figure's own buttons and links
// the full-screen view. The figure is its own reveal section: the plate rises as a card (no blur: the
// globe dithers), the caption follows.
import Figure from '@/components/dither/Figure'
import HaloRing from '@/components/dither/HaloRing'
import { FIG2 } from '@/lib/copy'
import FigureFrame from './FigureFrame'
import SectionHead from './SectionHead'
import s from './sections.module.css'
import styles from './FigurePlate.module.css'

/** the globe's own action buttons (public/figures/globe.html), in its order */
export const ACTIONS = ['Post', 'Heartbeat', 'Sybil', 'Eclipse', 'Partition', 'Heal'] as const

export default function FigurePlate() {
  return (
    <section id="globe" className={styles.section} aria-labelledby="globe-h">
      <SectionHead id="globe-h" kicker="Relay globe"
        title="Turn the world, then attack it"
        lead="A hand inked figure of the same mesh on a globe. Post a message, graft a Sybil or cut the world in two, step the heartbeat and watch the relay answer. Drag to turn it." />
      <div className={s.row} data-grid="">
        <div className={s.body}>
          <Figure n={2} caption={FIG2} aspect="16 / 9" narrowAspect="4 / 3" stamp="RELAY GLOBE No. 1" className={styles.plate} kind="card" reveal captionI={1}>
            <div className={styles.paper} style={{ background: '#f4f1e8' }}>
              <FigureFrame />
            </div>
            <HaloRing size={96} band={2} depth={0.35} className={styles.halo} />
          </Figure>
          <div className={styles.legend}>
            <p className={styles.keys}><span className={styles.label}>Try</span>{ACTIONS.map(a => <span key={a} className={styles.key}>{a}</span>)}</p>
            <a className={styles.full} href="/figure/">Open full screen <span aria-hidden="true">↗</span></a>
          </div>
        </div>
      </div>
    </section>
  )
}

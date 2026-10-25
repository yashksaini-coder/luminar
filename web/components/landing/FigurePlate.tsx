// Fig. 2: the relay globe on its paper rectangle inside a pitch plate, one halo ring over the paper's
// top-right corner, stamp bottom-left; caption is the honesty line (FIG2). The figure is its own
// reveal section: the plate rises as a card (no blur: the globe dithers), the caption follows.
import Figure from '@/components/dither/Figure'
import HaloRing from '@/components/dither/HaloRing'
import { FIG2 } from '@/lib/copy'
import FigureFrame from './FigureFrame'
import styles from './FigurePlate.module.css'

export default function FigurePlate() {
  return (
    <Figure n={2} caption={FIG2} aspect="16 / 9" narrowAspect="4 / 3" stamp="RELAY GLOBE No. 1" className={styles.plate} kind="card" reveal captionI={1}>
      <div className={styles.paper} style={{ background: '#f4f1e8' }}>
        <FigureFrame />
      </div>
      <HaloRing size={96} band={2} depth={0.35} className={styles.halo} />
    </Figure>
  )
}

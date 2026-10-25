import DitherImage from '@/components/dither/DitherImage'
import Figure from '@/components/dither/Figure'
import PlateReplay from '@/components/landing/PlateReplay'
import type { PlateFrames } from '@/components/landing/plate-draw'
import { FIG1 } from '@/lib/copy'
import plateFrames from '@/lib/plate-frames.json'

export default function Home() {
  return (
    <main style={{ padding: 'var(--gutter, 16px)' }}>
      <p className="t-ui">
        LUMINAR <span className="t-label">gossipsub v1.1</span>
      </p>
      <h1 className="t-display">
        Fifty peers, <em>five Sybils grafted at once.</em>
      </h1>
      <p className="num">T+ 12.3s · /</p>
      <Figure n={1} caption={FIG1}><PlateReplay plate={plateFrames as PlateFrames} /></Figure>
      <Figure n={0} caption="dither check">
        <DitherImage src="/stills/grafana.png" alt="Grafana dashboard with the gossipsub_* series" depth={0.6} loupe />
      </Figure>
    </main>
  )
}

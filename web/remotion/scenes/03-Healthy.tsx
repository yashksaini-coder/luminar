/** Scene 3: one flood publish from peer-22 under a slight zoom, the reel's ticker, FLOOD PUBLISH, Fig. 2. */
import { useCurrentFrame } from 'remotion'
import { Mesh } from '../mesh/Mesh'
import { Ticker } from '../mesh/Ticker'
import { lerpCamera } from '../mesh/view'
import { simTimeAt } from '../timeline'
import { Fig } from '../type/Fig'
import { StampIn } from '../type/StampIn'
import { FIG, FIG_N, STAMP, STAMP_TILT } from './copy'
import { LAYOUT } from './layout'
import type { SceneProps } from './types'

export default function Healthy({ data, orientation, span }: SceneProps) {
  const f = useCurrentFrame()
  const l = LAYOUT.healthy[orientation]
  const r = l.readout!
  const simTime = simTimeAt(span, f)
  const camera = lerpCamera({ scale: 1 }, { scale: orientation === 'wide' ? 1.08 : 1.12, focus: 'peer-22' }, f / span.durationInFrames)
  return (
    <>
      <Mesh data={data} box={l.mesh!} camera={camera} simTime={simTime} cell={l.cell} showAttackers={false} />
      <Ticker data={data} simTime={simTime} orientation={orientation} style={{ left: r.x, top: r.y, bottom: undefined }} />
      <StampIn tilt={STAMP_TILT.healthy} anchor={l.stamp.anchor} inset={l.stamp.inset} at={60}>{STAMP.healthy}</StampIn>
      <Fig n={FIG_N.healthy!} orientation={orientation} box={l.caption!} at={90}>{FIG.healthy!}</Fig>
    </>
  )
}

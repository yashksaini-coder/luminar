/** Scene 7: faults clear at T+24.1, the attackers fade, the camera pulls back and the ticker reports the heal time. */
import { interpolate, useCurrentFrame } from 'remotion'
import { Mesh } from '../mesh/Mesh'
import { healedInS } from '../mesh/readouts'
import { Ticker } from '../mesh/Ticker'
import { lerpCamera } from '../mesh/view'
import { simTimeAt } from '../timeline'
import { Fig } from '../type/Fig'
import { StampIn } from '../type/StampIn'
import { FIG, FIG_N, STAMP, STAMP_TILT } from './copy'
import { LAYOUT } from './layout'
import type { SceneProps } from './types'

export default function Heal({ data, orientation, span }: SceneProps) {
  const f = useCurrentFrame()
  const l = LAYOUT.heal[orientation]
  const r = l.readout!
  const simTime = simTimeAt(span, f)
  const camera = lerpCamera({ scale: 1.15, focus: 'peer-10' }, { scale: 1 }, interpolate(f, [0, 30], [0, 1], { extrapolateRight: 'clamp' }))
  const clearedAt = data.cleared[0]?.at
  const healIn = healedInS(data)
  const healed = clearedAt !== undefined && healIn !== null && simTime >= clearedAt + healIn
  return (
    <>
      <Mesh data={data} box={l.mesh!} camera={camera} simTime={simTime} cell={l.cell} />
      <Ticker data={data} simTime={simTime} orientation={orientation} healed={healed} style={{ left: r.x, top: r.y, bottom: undefined }} />
      <StampIn tilt={STAMP_TILT.heal} anchor={l.stamp.anchor} inset={l.stamp.inset} at={15}>{STAMP.heal}</StampIn>
      <Fig n={FIG_N.heal!} orientation={orientation} box={l.caption!} at={45}>{FIG.heal!}</Fig>
    </>
  )
}

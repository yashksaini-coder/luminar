/** Scene 6: the camera walks to peer-10; four silent attackers take its mesh and the score strip barely moves. */
import { Easing, interpolate, useCurrentFrame } from 'remotion'
import { Mesh } from '../mesh/Mesh'
import { ScoreStrip } from '../mesh/ScoreStrip'
import { lerpCamera } from '../mesh/view'
import { SAFE_TALL, simTimeAt } from '../timeline'
import { Fig } from '../type/Fig'
import { focusPanel } from '../layers/focus'
import { Mono } from '../type/Mono'
import { StampIn } from '../type/StampIn'
import { FIG, FIG_N, STAMP, STAMP_TILT } from './copy'
import { LAYOUT } from './layout'
import type { SceneProps } from './types'

const EDGE = 96
const TALL_EDGE = 60
const STRIP_FROM = 60

export default function Eclipse({ data, orientation, span }: SceneProps) {
  const f = useCurrentFrame()
  const l = LAYOUT.eclipse[orientation]
  const s = l.strip!
  const simTime = simTimeAt(span, f)
  const t = interpolate(f, [0, 60], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) })
  const camera = lerpCamera({ scale: 1.15, focus: 'sybil-0' }, { scale: 1.15, focus: 'peer-10' }, t)
  const labelPos = orientation === 'tall'
    ? { left: TALL_EDGE, right: TALL_EDGE, top: SAFE_TALL.top }
    : { left: EDGE, top: EDGE }
  return (
    <>
      <Mesh data={data} box={l.mesh!} camera={camera} simTime={simTime} cell={l.cell} />
      <div style={{ position: 'absolute', ...labelPos, ...focusPanel(16), borderRadius: 0, paddingBottom: 6, borderBottom: '1px solid var(--paper-2)' }}>
        <Mono dim px={l.monoPx}>{data.phases[1]?.label}</Mono>
      </div>
      {f >= STRIP_FROM && (
        <div style={{ position: 'absolute', left: s.x, top: s.y }}>
          <ScoreStrip data={data} peer="eclipse-0" simTime={simTime} orientation={orientation} width={s.w} flat />
        </div>
      )}
      <StampIn tilt={STAMP_TILT.eclipse} anchor={l.stamp.anchor} inset={l.stamp.inset} at={120}>{STAMP.eclipse}</StampIn>
      <Fig n={FIG_N.eclipse!} orientation={orientation} box={l.caption!} at={150}>{FIG.eclipse!}</Fig>
    </>
  )
}

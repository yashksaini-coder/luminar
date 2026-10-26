/** Scene 4: five Sybils graft in around the densest victim set; phase label bar, ticker with invalid, FIVE SYBILS. */
import { useMemo } from 'react'
import { useCurrentFrame } from 'remotion'
import { attackersAt } from '../mesh/attackers'
import { Mesh } from '../mesh/Mesh'
import { Ticker } from '../mesh/Ticker'
import { lerpCamera } from '../mesh/view'
import { frameForSimTime, simTimeAt } from '../timeline'
import { focusPanel } from '../layers/focus'
import { Mono } from '../type/Mono'
import { StampIn } from '../type/StampIn'
import { STAMP, STAMP_TILT } from './copy'
import { LAYOUT } from './layout'
import type { SceneProps } from './types'

const EDGE = 96
const TALL_EDGE = 60
/** Below the 4-line ticker stack (invalid adds the 4th) and the stamp plate, above the mesh square. */
const TALL_LABEL_GAP = 64

export default function Sybils({ data, orientation, span }: SceneProps) {
  const f = useCurrentFrame()
  const l = LAYOUT.sybils[orientation]
  const r = l.readout!
  const simTime = simTimeAt(span, f)
  const densest = useMemo(
    () => attackersAt(data, 11).reduce<{ id?: string; n: number }>((best, a) => (a.victims.length > best.n ? { id: a.id, n: a.victims.length } : best), { n: -1 }).id,
    [data],
  )
  const camera = lerpCamera({ scale: 1.08, focus: 'peer-22' }, { scale: 1.15, focus: densest }, f / span.durationInFrames)
  const tall = orientation === 'tall'
  const labelPos = tall
    ? { left: TALL_EDGE, right: TALL_EDGE, top: r.y + r.h + TALL_LABEL_GAP }
    : { left: EDGE, top: EDGE }
  return (
    <>
      <Mesh data={data} box={l.mesh!} camera={camera} simTime={simTime} cell={l.cell} />
      <div style={{ position: 'absolute', ...labelPos, ...focusPanel(16), borderRadius: 0, paddingBottom: 6, borderBottom: '1px solid var(--paper-2)' }}>
        <Mono dim px={l.monoPx}>{data.phases[0]?.label}</Mono>
      </div>
      <Ticker data={data} simTime={simTime} orientation={orientation} invalid style={{ left: r.x, top: r.y, bottom: undefined }} />
      <StampIn tilt={STAMP_TILT.sybils} anchor={l.stamp.anchor} inset={l.stamp.inset} at={frameForSimTime(span, 10.2) - span.from}>{STAMP.sybils}</StampIn>
    </>
  )
}

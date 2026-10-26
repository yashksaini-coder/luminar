/** Scene 1: the mesh resolving out of a 2 % Bayer noise field, the LUMINAR stamp. */
import { interpolate, useCurrentFrame } from 'remotion'
import { Mesh } from '../mesh/Mesh'
import { StampIn } from '../type/StampIn'
import { STAMP, STAMP_TILT } from './copy'
import { LAYOUT } from './layout'
import type { SceneProps } from './types'

const CLAMP = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const

export default function ColdOpen({ data, orientation }: SceneProps) {
  const f = useCurrentFrame()
  const l = LAYOUT['cold-open'][orientation]
  const box = l.mesh!
  return (
    <>
      <Mesh data={data} box={box} camera={{ scale: 1 }} simTime={0} cell={l.cell}
        style={{ intensity: interpolate(f, [0, 40], [0, 1], CLAMP), field: interpolate(f, [0, 40], [0.02, 0], CLAMP) }} />
      <StampIn tilt={STAMP_TILT['cold-open']} anchor={l.stamp.anchor} inset={l.stamp.inset} at={30}>{STAMP['cold-open']}</StampIn>
    </>
  )
}

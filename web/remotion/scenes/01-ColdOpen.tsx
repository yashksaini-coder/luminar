/** Scene 1: the mesh resolving out of a 2 % Bayer noise field, a halo ring drifting lower-left, the LUMINAR stamp. */
import { interpolate, useCurrentFrame } from 'remotion'
import { HaloRing } from '@/components/dither/HaloRing'
import { Parallax } from '../layers/Parallax'
import { Mesh } from '../mesh/Mesh'
import { StampIn } from '../type/StampIn'
import { STAMP, STAMP_TILT } from './copy'
import { LAYOUT } from './layout'
import type { SceneProps } from './types'

const CLAMP = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const
const RING = 220
const RING_INSET = 56

export default function ColdOpen({ data, orientation }: SceneProps) {
  const f = useCurrentFrame()
  const l = LAYOUT['cold-open'][orientation]
  const box = l.mesh!
  return (
    <>
      <Mesh data={data} box={box} camera={{ scale: 1 }} simTime={0} cell={l.cell}
        style={{ intensity: interpolate(f, [0, 40], [0, 1], CLAMP), field: interpolate(f, [0, 40], [0.02, 0], CLAMP) }} />
      <Parallax depth={0.2} pan={f * 0.05}
        style={{ position: 'absolute', left: box.x + RING_INSET, top: box.y + box.h - RING - RING_INSET, lineHeight: 0 }}>
        <HaloRing size={RING} band={2} />
      </Parallax>
      <StampIn tilt={STAMP_TILT['cold-open']} anchor={l.stamp.anchor} inset={l.stamp.inset} at={30}>{STAMP['cold-open']}</StampIn>
    </>
  )
}

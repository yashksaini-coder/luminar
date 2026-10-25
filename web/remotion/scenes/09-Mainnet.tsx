/** Scene 9 (wide only): three dithered geo frames of one real mainnet slot cross-dissolving, a halo ring over the ocean, Fig. 7. */
import { interpolate, useCurrentFrame, useVideoConfig } from 'remotion'
import { HaloRing } from '@/components/dither/HaloRing'
import { DitheredStill } from '../layers/DitheredStill'
import { Parallax } from '../layers/Parallax'
import { Fig } from '../type/Fig'
import { FIG, FIG_N } from './copy'
import { LAYOUT } from './layout'
import type { SceneProps } from './types'

const DISSOLVES: [number, number][] = [[25, 55], [55, 85]]   // frame k+1 fades in over 30 frames
const RING = 180
const OCEAN = { x: 640, y: 440 }   // mid-Atlantic in the 1440×840 capture cover-fitted to 1920×1080

export default function Mainnet({ orientation }: SceneProps) {
  const f = useCurrentFrame()
  const { width, height } = useVideoConfig()
  const l = LAYOUT.mainnet[orientation]
  const box = { x: 0, y: 0, w: width, h: height }
  return (
    <>
      {[0, 1, 2].map(k => (
        <DitheredStill key={k} src={`stills/geo-wave-${k}.png`} box={box} cell={l.cell}
          style={{ opacity: k === 0 ? 1 : interpolate(f, DISSOLVES[k - 1], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }) }} />
      ))}
      <Parallax depth={0.4} pan={f * 0.1} style={{ position: 'absolute', left: OCEAN.x, top: OCEAN.y, lineHeight: 0 }}>
        <HaloRing size={RING} band={2} />
      </Parallax>
      <Fig n={FIG_N.mainnet!} orientation={orientation} box={l.caption!} at={10}>{FIG.mainnet!}</Fig>
    </>
  )
}

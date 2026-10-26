/** Scene 9 (wide only): three dithered geo frames of one real mainnet slot cross-dissolving, Fig. 7. */
import { interpolate, useCurrentFrame, useVideoConfig } from 'remotion'
import { DitheredStill } from '../layers/DitheredStill'
import { Fig } from '../type/Fig'
import { FIG, FIG_N } from './copy'
import { LAYOUT } from './layout'
import type { SceneProps } from './types'

const DISSOLVES: [number, number][] = [[25, 55], [55, 85]]   // frame k+1 fades in over 30 frames

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
      <Fig n={FIG_N.mainnet!} orientation={orientation} box={l.caption!} at={10}>{FIG.mainnet!}</Fig>
    </>
  )
}

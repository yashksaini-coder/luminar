/** Scene 2: the held mesh breathing behind the serif title; the network dims as the title lands so the words take focus. Fig. 1. */
import { interpolate, useCurrentFrame, useVideoConfig } from 'remotion'
import { focusPanel } from '../layers/focus'
import { Mesh } from '../mesh/Mesh'
import { Fig } from '../type/Fig'
import { Headline } from '../type/Headline'
import { FIG, FIG_N, HEADLINE } from './copy'
import { LAYOUT } from './layout'
import type { SceneProps } from './types'

const BREATH = 90
const CLAMP = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const

export default function Title({ data, orientation }: SceneProps) {
  const f = useCurrentFrame()
  const { width, height } = useVideoConfig()
  const l = LAYOUT.title[orientation]
  const lines = HEADLINE[orientation]
  const px = l.headlinePx!
  const tall = orientation === 'tall'
  const meshAlpha = 0.4 - 0.05 * Math.cos((2 * Math.PI * f) / BREATH)   // .35 → .45 → .35 every 90 frames
  const focus = interpolate(f, [0, 24], [0, 1], CLAMP)   // the title's first line lands over 14 frames from 0
  return (
    <>
      <Mesh data={data} box={{ x: 0, y: 0, w: width, h: height }} camera={{ scale: 1 }} simTime={0} cell={l.cell}
        style={{ intensity: 0.6 - 0.28 * focus, meshAlpha }} />
      <div style={{ position: 'absolute', left: tall ? 60 : 96, top: '50%', transform: 'translateY(-50%)' }}>
        <div aria-hidden style={{ position: 'absolute', inset: 0, opacity: focus, ...focusPanel(40) }} />
        <div style={{ position: 'relative' }}>
          <Headline lines={lines} px={px} italicLast at={0} stagger={10} />
        </div>
      </div>
      <Fig n={FIG_N.title!} orientation={orientation} box={l.caption!} at={75}>{FIG.title!}</Fig>
    </>
  )
}

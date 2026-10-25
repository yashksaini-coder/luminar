/** Scene 8: dithered Grafana and Jaeger cards slide in while the seven Lighthouse series names type on beneath them. */
import { interpolate, useCurrentFrame } from 'remotion'
import { SERIES } from '../constants'
import { DitheredStill } from '../layers/DitheredStill'
import { Parallax } from '../layers/Parallax'
import { Fig } from '../type/Fig'
import { Mono } from '../type/Mono'
import { StampIn } from '../type/StampIn'
import { FIG, FIG_N, STAMP, STAMP_TILT } from './copy'
import { LAYOUT } from './layout'
import type { SceneProps } from './types'

const CARD = { w: 760, h: 430 }
const CARD_Y = 200
const NAMES_AT = 30
const NAME_EVERY = 15   // 2 names/s at 30 fps

export default function SameNames({ orientation }: SceneProps) {
  const f = useCurrentFrame()
  const l = LAYOUT['same-names'][orientation]
  const tall = orientation === 'tall'
  const slide = (from: number) => interpolate(f, [0, 12], [from, 0], { extrapolateRight: 'clamp' })
  const names = tall ? SERIES.slice(0, 4) : SERIES
  const px = l.monoPx!
  const namesTop = tall ? l.mesh!.y + l.mesh!.h + 40 : CARD_Y + CARD.h + 60
  return (
    <>
      {tall ? (
        <DitheredStill src="stills/grafana.png" box={l.mesh!} focus={[0.5, 0.35]} border cell={l.cell}
          style={{ transform: `translateX(${slide(-120)}px)` }} />
      ) : (
        <>
          <Parallax depth={0.6} pan={f * 0.1} style={{ position: 'absolute', inset: 0 }}>
            <DitheredStill src="stills/grafana.png" box={{ x: 120, y: CARD_Y, ...CARD }} border cell={l.cell}
              style={{ transform: `translateX(${slide(-120)}px)` }} />
          </Parallax>
          <Parallax depth={0.9} pan={f * 0.1} style={{ position: 'absolute', inset: 0 }}>
            <DitheredStill src="stills/jaeger.png" box={{ x: 1000, y: CARD_Y, ...CARD }} border cell={l.cell}
              style={{ transform: `translateX(${slide(120)}px)` }} />
          </Parallax>
        </>
      )}
      <div style={{ position: 'absolute', left: tall ? 60 : 120, top: namesTop, display: 'flex', flexDirection: 'column', gap: px * 0.3 }}>
        {names.map((name, i) => {
          const chars = Math.round(interpolate(f, [NAMES_AT + NAME_EVERY * i, NAMES_AT + NAME_EVERY * (i + 1)], [0, name.length], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }))
          return <Mono key={name} px={px} style={{ whiteSpace: 'pre', minHeight: px * 1.2 }}>{name.slice(0, chars)}</Mono>
        })}
      </div>
      <StampIn tilt={STAMP_TILT['same-names']} anchor={l.stamp.anchor} inset={l.stamp.inset} at={10}>{STAMP['same-names']}</StampIn>
      <Fig n={FIG_N['same-names']!} orientation={orientation} box={l.caption!} at={45}>{FIG['same-names']!}</Fig>
    </>
  )
}

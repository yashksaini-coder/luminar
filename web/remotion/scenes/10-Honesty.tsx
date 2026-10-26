/** Scene 10: the honesty card — the serif MECHANISM line over a luminar · lighthouse table typed from the engine constants, TOY CONSTANTS stamp. */
import { interpolate, useCurrentFrame } from 'remotion'
import { MECHANISM } from '@/lib/copy'
import { Headline } from '../type/Headline'
import { Mono } from '../type/Mono'
import { StampIn } from '../type/StampIn'
import { HONESTY_ROWS, STAMP, STAMP_TILT } from './copy'
import { LAYOUT } from './layout'
import type { SceneProps } from './types'

const ROWS_AT = 8
const ROW_EVERY = 8   // one row types on per 8 frames
const STAMP_SCALE = 2   // the large stamp, scaled about its own centre

export default function Honesty({ orientation }: SceneProps) {
  const f = useCurrentFrame()
  const l = LAYOUT.honesty[orientation]
  const tall = orientation === 'tall'
  const px = l.monoPx!
  return (
    <>
      <div style={{ position: 'absolute', left: 0, right: 0, top: tall ? 300 : 200, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: px * 2 }}>
        <Headline lines={[MECHANISM]} px={l.headlinePx!} at={0} />
        <div style={{ display: 'grid', gridTemplateColumns: 'max-content max-content minmax(0, max-content)', columnGap: px * 1.5, rowGap: px * 0.5, maxWidth: tall ? 960 : undefined }}>
          <span />
          <Mono px={px} dim>luminar</Mono>
          <Mono px={px} dim>lighthouse</Mono>
          {HONESTY_ROWS.map((row, i) => {
            const text = row.join('\u0000')
            const shown = Math.round(interpolate(f, [ROWS_AT + ROW_EVERY * i, ROWS_AT + ROW_EVERY * (i + 1)], [0, text.length], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }))
            const [label = '', luminar = '', lighthouse = ''] = text.slice(0, shown).split('\u0000')
            return [
              <Mono key={`${i}l`} px={px} dim>{label}</Mono>,
              <Mono key={`${i}m`} px={px}>{luminar}</Mono>,
              <Mono key={`${i}h`} px={px}>{lighthouse}</Mono>,
            ]
          })}
        </div>
      </div>
      <div style={{ position: 'absolute', inset: 0, transform: `scale(${STAMP_SCALE})`, transformOrigin: `50% calc(50% + ${l.stamp.inset[1]}px)` }}>
        <StampIn tilt={STAMP_TILT.honesty} anchor={l.stamp.anchor} inset={l.stamp.inset} at={20}>{STAMP.honesty}</StampIn>
      </div>
    </>
  )
}

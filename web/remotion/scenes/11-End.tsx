/** Scene 11: the LUMINAR wordmark over the ghosted T+0 mesh, repo URL and event line rising, the mesh dissolving back into noise. */
import { interpolate, useCurrentFrame } from 'remotion'
import { HaloRing } from '@/components/dither/HaloRing'
import { Mesh } from '../mesh/Mesh'
import { Mono } from '../type/Mono'
import { StampIn } from '../type/StampIn'
import { STAMP, STAMP_TILT } from './copy'
import { LAYOUT } from './layout'
import type { SceneProps } from './types'

const CLAMP = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const
const RISE_AT = 10
const STAGGER = 8
const DISSOLVE = 40
const RING = 200
const RING_INSET = 96

export default function End({ data, orientation, span, repoUrl, eventLine }: SceneProps) {
  const f = useCurrentFrame()
  const l = LAYOUT.end[orientation]
  const tall = orientation === 'tall'
  const box = l.mesh!
  const px = l.monoPx!
  const out = [span.durationInFrames - DISSOLVE, span.durationInFrames]
  const rise = (k: number) => {
    const t = interpolate(f, [RISE_AT + STAGGER * k, RISE_AT + STAGGER * k + 14], [0, 1], CLAMP)
    return { opacity: t, transform: `translateY(${24 * (1 - t)}px)` }
  }
  const slash = repoUrl.indexOf('/') + 1
  return (
    <>
      <Mesh data={data} box={box} camera={{ scale: 1 }} simTime={0} cell={l.cell}
        style={{ intensity: interpolate(f, out, [0.15, 0], CLAMP), field: interpolate(f, out, [0, 0.02], CLAMP) }} />
      <div style={{ position: 'absolute', left: RING_INSET, bottom: tall ? 380 : RING_INSET, lineHeight: 0 }}>
        <HaloRing size={RING} band={2} />
      </div>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: px * 0.6, textAlign: 'center' }}>
        <div style={{ fontFamily: 'var(--font-ui)', fontWeight: 600, letterSpacing: '0.14em', marginRight: '-0.14em', fontSize: l.headlinePx, lineHeight: 1, color: 'var(--fg)', marginBottom: px }}>
          LUMINAR
        </div>
        <Mono px={px} style={{ ...rise(0), display: 'block' }}>
          {tall ? <>{repoUrl.slice(0, slash)}<br />{repoUrl.slice(slash)}</> : repoUrl}
        </Mono>
        <Mono px={px} dim style={{ ...rise(1), display: 'block' }}>{eventLine}</Mono>
      </div>
      <StampIn tilt={STAMP_TILT.end} anchor={l.stamp.anchor} inset={l.stamp.inset} at={30}>{STAMP.end}</StampIn>
    </>
  )
}

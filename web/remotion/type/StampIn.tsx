/** The shared plate Stamp, anchored in the frame and sprung in from scale 0 at local frame `at` (damping 200, no overshoot). */
import type { CSSProperties } from 'react'
import { spring, useCurrentFrame, useVideoConfig } from 'remotion'
import Stamp from '@/components/dither/Stamp'
import type { Anchor } from '../scenes/layout'

export function StampIn({ children, tilt, anchor, inset, at, flame }: { children: string; tilt: number; anchor: Anchor; inset: [number, number]; at: number; flame?: boolean }) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  if (frame < at || !children) return null
  const scale = spring({ frame: frame - at, fps, config: { damping: 200 } })
  const [dx, dy] = inset
  const pos: CSSProperties =
    anchor === 'c' ? { left: '50%', top: '50%', transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(${scale})` }
      : { [anchor[1] === 'l' ? 'left' : 'right']: dx, [anchor[0] === 't' ? 'top' : 'bottom']: dy, transform: `scale(${scale})` }
  return (
    <div style={{ position: 'absolute', ...pos }}>
      <Stamp tilt={tilt} flame={flame}>{children}</Stamp>
    </div>
  )
}

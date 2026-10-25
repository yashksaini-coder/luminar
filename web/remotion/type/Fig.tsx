/** Video figure caption: 'Fig. N' label + serif italic sentence in a layout box, fading in over 12 frames from `at`. */
import { interpolate, useCurrentFrame } from 'remotion'
import type { Box } from '../mesh/view'
import type { Orientation } from '../props'

export function Fig({ n, children, orientation, box, at }: { n: number; children: string; orientation: Orientation; box: Box; at: number }) {
  const frame = useCurrentFrame()
  const tall = orientation === 'tall'
  return (
    <figcaption
      style={{
        position: 'absolute', left: box.x, top: box.y, width: box.w, height: box.h,
        display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
        textAlign: tall ? 'left' : 'right',
        opacity: interpolate(frame, [at, at + 12], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
      }}
    >
      <span style={{ font: '600 14px var(--font-ui)', letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--fg-3)' }}>Fig. {n}</span>
      <span style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: tall ? 30 : 28, lineHeight: 1.2, color: 'var(--fg-2)', whiteSpace: 'pre-line' }}>{children}</span>
    </figcaption>
  )
}

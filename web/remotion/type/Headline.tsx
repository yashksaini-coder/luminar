/** Serif headline: each line rises 24 → 0 px and fades in over 14 frames, lines staggered. */
import { interpolate, useCurrentFrame } from 'remotion'

export function Headline({ lines, px, italicLast = false, at, stagger = 10 }: { lines: string[]; px: number; italicLast?: boolean; at: number; stagger?: number }) {
  const frame = useCurrentFrame()
  return (
    <h1 style={{ margin: 0, fontFamily: 'var(--font-display)', fontWeight: 400, fontSize: px, lineHeight: 1.05, color: 'var(--fg)' }}>
      {lines.map((line, i) => {
        const t = interpolate(frame, [at + i * stagger, at + i * stagger + 14], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
        return (
          <span
            key={i}
            style={{ display: 'block', opacity: t, transform: `translateY(${24 * (1 - t)}px)`, fontStyle: italicLast && i === lines.length - 1 ? 'italic' : 'normal' }}
          >
            {line}
          </span>
        )
      })}
    </h1>
  )
}

/** Video mono text: IBM Plex Mono 500, tabular numerals; dim → --fg-3, flame → --flame. */
import type { CSSProperties, ReactNode } from 'react'

export function Mono({ children, px = 28, dim = false, flame = false, style }: { children: ReactNode; px?: number; dim?: boolean; flame?: boolean; style?: CSSProperties }) {
  return (
    <span
      style={{
        fontFamily: 'var(--font-mono)',
        fontWeight: 500,
        fontSize: px,
        fontVariantNumeric: 'tabular-nums',
        color: flame ? 'var(--flame)' : dim ? 'var(--fg-3)' : 'var(--fg)',
        ...style,
      }}
    >
      {children}
    </span>
  )
}

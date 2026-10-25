/** Depth drift: children translate by depth × pan px vertically. */
import type { CSSProperties, ReactNode } from 'react'

export function Parallax({ depth, pan, children, style }: { depth: number; pan: number; children: ReactNode; style?: CSSProperties }) {
  return <div style={{ ...style, transform: `translateY(${depth * pan}px)` }}>{children}</div>
}

// Hollow Bayer annulus: the score-band halo as plain-React SVG [spec §7.4 twist 2; A.0, A.20].
// No next/* import and no hooks: the landing (phase 5) and Remotion (phase 6) reuse it.
import { BAND_DENSITY } from '@/components/map/palette'
import type { ScoreBand } from '@/lib/types'
import { bayer } from './dither'

export interface HaloRingProps {
  size: number; band?: ScoreBand; flame?: boolean; depth?: number; className?: string; cell?: number
}

export function HaloRing({ size, band = 2, flame = false, depth, className, cell = 4 }: HaloRingProps) {
  const id = `halo-${band}-${cell}-${flame ? 'f' : 'p'}`   // deterministic: identical instances share one definition
  const fill = flame ? 'var(--flame)' : 'var(--paper-0)'
  const cells: [number, number][] = []
  for (let cy = 0; cy < 8; cy++) for (let cx = 0; cx < 8; cx++) if (bayer(cx, cy) < BAND_DENSITY[band]) cells.push([cx, cy])
  const c = size / 2, R = size / 2, r = 0.6 * R
  const ring = (rad: number) => `M${c - rad},${c}a${rad},${rad} 0 1,0 ${2 * rad},0a${rad},${rad} 0 1,0 ${-2 * rad},0`
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} data-depth={depth} aria-hidden="true"
      shapeRendering="crispEdges" className={className}>
      <defs>
        <pattern id={id} patternUnits="userSpaceOnUse" width={8 * cell} height={8 * cell}>
          {cells.map(([cx, cy]) => <rect key={`${cx}-${cy}`} x={cx * cell} y={cy * cell} width={cell} height={cell} fill={fill} />)}
        </pattern>
      </defs>
      <path d={ring(R) + ring(r)} fillRule="evenodd" fill={`url(#${id})`} />
      <circle cx={c} cy={c} r={R - 0.5} fill="none" stroke="var(--paper-0)" strokeWidth={1} />
    </svg>
  )
}

export default HaloRing

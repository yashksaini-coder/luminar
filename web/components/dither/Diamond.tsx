// The attacker glyph, never dithered [spec §7.4; A.0, A.20]: grafted = flame rhombus with the
// --hatch 45° recipe; pruned = hollow dashed outline. Plain React (useId only), never a canvas.
import { useId } from 'react'

export interface DiamondProps { size: number; pruned?: boolean; depth?: number; className?: string; label?: string }

const POINTS = '50,0 100,50 50,100 0,50'

export function Diamond({ size, pruned = false, depth, className, label }: DiamondProps) {
  const hatch = `hatch-${useId().replace(/:/g, '')}`
  const unit = 100 / size   // viewBox units per CSS px: the hatch keeps the atlas's 3 px pitch at any size
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" role="img" data-depth={depth} className={className}
      aria-hidden={label ? undefined : true}>
      {label && <title>{label}</title>}
      {pruned ? (
        <polygon points={POINTS} fill="none" stroke="var(--paper-3)" strokeWidth={1} strokeDasharray="3 2"
          vectorEffect="non-scaling-stroke" />
      ) : (
        <>
          <defs>
            <pattern id={hatch} patternUnits="userSpaceOnUse" width={3 * unit} height={3 * unit} patternTransform="rotate(45)">
              <rect width={unit} height={3 * unit} fill="rgb(11 11 13 / .55)" />
            </pattern>
          </defs>
          <polygon points={POINTS} fill="var(--flame)" />
          <polygon points={POINTS} fill={`url(#${hatch})`} />
        </>
      )}
    </svg>
  )
}

export default Diamond

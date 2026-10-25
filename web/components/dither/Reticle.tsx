// The selection/cursor glyph: a 14 px ring with four 4 px ticks, paper on a 1 px pitch outline
// [spec §7.4 twist 3]. Plain React, no next/* import: Remotion reuses it (spec §9).

export interface ReticleProps { size?: number; className?: string; title?: string }

// Literal hex (pitch-0 / paper-0): custom properties do not resolve inside a cursor data URI.
export const RETICLE_SVG =
  "<svg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 14 14' fill='none'>" +
  "<circle cx='7' cy='7' r='5.5' stroke='#0b0b0d' stroke-width='3'/>" +
  "<circle cx='7' cy='7' r='5.5' stroke='#f2f2ef' stroke-width='1'/>" +
  "<g stroke='#f2f2ef' stroke-width='1'>" +
  "<line x1='7' y1='0' x2='7' y2='3'/><line x1='11' y1='7' x2='14' y2='7'/>" +
  "<line x1='7' y1='11' x2='7' y2='14'/><line x1='0' y1='7' x2='3' y2='7'/>" +
  '</g></svg>'

export const RETICLE_CURSOR = `url("data:image/svg+xml,${encodeURIComponent(RETICLE_SVG)}") 7 7, crosshair`

export function Reticle({ size = 14, className, title }: ReticleProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" role="img" fill="none" className={className}>
      {title && <title>{title}</title>}
      <circle cx="7" cy="7" r="5.5" stroke="var(--pitch-0)" strokeWidth="3" />
      <circle cx="7" cy="7" r="5.5" stroke="var(--paper-0)" strokeWidth="1" />
      <g stroke="var(--paper-0)" strokeWidth="1">
        <line x1="7" y1="0" x2="7" y2="3" />
        <line x1="11" y1="7" x2="14" y2="7" />
        <line x1="7" y1="11" x2="7" y2="14" />
        <line x1="0" y1="7" x2="3" y2="7" />
      </g>
    </svg>
  )
}

export default Reticle

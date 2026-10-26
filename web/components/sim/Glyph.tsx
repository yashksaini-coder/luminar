// The render-table glyph as inline SVG for DOM surfaces (legend, inspector header, state rows) [spec §6.2].
// Every role = colour AND shape; attacker/pruned delegate to Diamond, honest-with-band adds the HaloRing.
import Diamond from '@/components/dither/Diamond'
import HaloRing from '@/components/dither/HaloRing'
import type { NodeState, ScoreBand } from '@/lib/types'
import styles from './Glyph.module.css'

export type GlyphRole = NodeState | 'pruned' | 'observer' | 'honest'

const R = 5   // disc radius in a 20×20 viewBox centred on 0; rings at 1.6 r fit inside
const RIM = { vectorEffect: 'non-scaling-stroke' as const, strokeWidth: 1, fill: 'none' }

function shape(role: GlyphRole) {
  switch (role) {
    case 'idle':
      return <circle r={R} fill="var(--pitch-4)" stroke="var(--paper-3)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
    case 'origin':
      return <><circle r={R} fill="var(--paper-0)" /><circle r={R * 0.35} fill="var(--pitch-0)" /></>
    case 'decoded':
      return <><circle r={R} fill="var(--signal)" /><circle r={R * 1.6} stroke="var(--signal)" {...RIM} /></>
    case 'observer':
      return <><circle r={R} stroke="var(--signal)" {...RIM} /><circle r={R * 1.6} stroke="var(--signal)" {...RIM} /></>
    case 'joining':
      return <circle r={R} stroke="var(--paper-1)" {...RIM} />
    case 'failed':
      return <><circle r={R} fill="var(--paper-3)" /><path d="M-3,-3L3,3M3,-3L-3,3" stroke="var(--pitch-0)" {...RIM} strokeWidth={1.5} /></>
    case 'error':
      return <><circle r={R} fill="var(--flame-dim)" /><path d="M-3,-3L3,3M3,-3L-3,3" stroke="var(--pitch-0)" {...RIM} strokeWidth={1.5} /></>
    default:   // honest, receiving
      return <circle r={R} fill="var(--paper-0)" />
  }
}

export default function Glyph({ role, size = 12, band, title }: { role: GlyphRole; size?: number; band?: ScoreBand; title?: string }) {
  if (role === 'attacker' || role === 'pruned') {
    return <Diamond size={size} pruned={role === 'pruned'} label={title} className={styles.glyph} />
  }
  const halo = band !== undefined && (role === 'honest' || role === 'receiving')
  const svg = (
    <svg width={size} height={size} viewBox="-10 -10 20 20" role="img" aria-hidden={title ? undefined : true}
      className={styles.glyph}>
      {title && <title>{title}</title>}
      {shape(role)}
    </svg>
  )
  if (!halo) return svg
  return (
    <span className={styles.wrap} style={{ width: size, height: size }}>
      <HaloRing size={size * 1.7} band={band ?? 3} cell={2} className={styles.halo} />
      {svg}
    </span>
  )
}

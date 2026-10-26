// Halftone statement (landing v2 §5, Lighthouse HQ / Cotool references): one full-width grid cell filled
// with a slow halftone dot field; the honesty line sits in a solid cell on top of it (so the text never
// loses contrast to the dots), with one sentence of framing and a mono attribution. Mesh degree and
// heartbeat are the engine constants in backend/gossip/engine.py (D = 6, HEARTBEAT_INTERVAL = 1.0).
import type { CSSProperties } from 'react'
import PixelField from '@/components/fx/PixelField'
import { MECHANISM } from '@/lib/copy'
import styles from './Statement.module.css'

export const FRAMING = 'Luminar runs the GossipSub v1.1 mesh and P1–P4 scoring with numbers small enough to watch: mesh degree 6 and a one second heartbeat, where Ethereum mainnet runs D 8, 0.7 s and prune thresholds in the thousands.'

const i = (n: number) => ({ '--i': n }) as CSSProperties

export default function Statement() {
  return (
    <section className={styles.section} aria-labelledby="statement-h" data-grid="">
      <div className={styles.panel} data-reveal="">
        <PixelField preset="halftone" tint="signal" cell={12} density={0.8} speed={0.6} className={styles.field} />
        <div className={styles.copy}>
          <span className={styles.glyph} aria-hidden="true">{Array.from({ length: 9 }, (_, n) => <i key={n} />)}</span>
          <h2 id="statement-h" className={styles.h2} data-k="up" style={i(0)}>{MECHANISM}</h2>
          <p className={styles.body} data-k="up" style={i(1)}>{FRAMING}</p>
          <p className={styles.attr} data-k="up" style={i(2)}>Luminar · GossipSub v1.1 · P1–P4</p>
        </div>
      </div>
    </section>
  )
}

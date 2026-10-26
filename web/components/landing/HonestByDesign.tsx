// Honest by design (spec v2 §9, replaces the Faithfulness table): Luminar against an Ethereum mainnet node
// on the five things that change what a recording can tell you. A real table (parameter, Luminar, mainnet),
// compact enough to stay three columns at phone width; the Luminar column carries the signal tint. Values
// match backend/gossip and docs/research-live-network.md item 4; the page names no source paths.
import type { CSSProperties } from 'react'
import { MECHANISM } from '@/lib/copy'
import SectionHead from './SectionHead'
import s from './sections.module.css'
import styles from './HonestByDesign.module.css'

export interface Row { name: string; sym: string; ours: string; oursNote?: string; main: string; mainNote?: string }

export const ROWS: Row[] = [
  { name: 'Mesh degree', sym: 'D', ours: '6', oursNote: 'low 4 · high 8', main: '8' },
  { name: 'Heartbeat', sym: 'interval', ours: '1 s', main: '0.7 s' },
  { name: 'Thresholds', sym: 'score', ours: '−5 · −10', oursNote: 'graft · prune', main: '−4000 · −8000 · −16000', mainNote: 'gossip · publish · graylist' },
  { name: 'Score terms', sym: 'function', ours: 'P1–P4', oursNote: 'mesh time, first deliveries, delivery deficit, invalid messages', main: 'P1–P7', mainNote: 'adds application score, IP colocation, behaviour penalty' },
  { name: 'Eclipse', sym: 'visibility', ours: 'Invisible', oursNote: 'silent attackers send nothing invalid, so only the P3 deficit moves', main: 'Hard too', mainNote: 'P6 only sees attackers that share an IP' },
]

export default function HonestByDesign() {
  return (
    <section id="honest" className={styles.section} aria-labelledby="honest-h">
      <SectionHead id="honest-h" kicker="Luminar against mainnet" title="Honest by design"
        lead={`${MECHANISM} Luminar runs the GossipSub v1.1 mechanism with constants small enough to watch a peer get pruned on a laptop. These five differences from an Ethereum mainnet node tell you what a recording can and cannot show.`} />
      <div className={s.row} data-grid="" data-reveal="">
        <div className={s.body}>
          <table className={styles.table}>
            <caption className="sr-only">Luminar constants against an Ethereum mainnet node (Lighthouse defaults)</caption>
            <thead>
              <tr data-k="up" style={{ '--i': 0 } as CSSProperties}>
                <th scope="col"><span className="sr-only">Parameter</span></th>
                <th scope="col" className={styles.ours}><span className={styles.mark} aria-hidden="true" />Luminar</th>
                <th scope="col">Ethereum mainnet<span className={styles.thNote}>Lighthouse defaults</span></th>
              </tr>
            </thead>
            <tbody>
              {ROWS.map((r, i) => (
                <tr key={r.name} data-k="up" style={{ '--i': i + 1 } as CSSProperties}>
                  <th scope="row"><span className={styles.name}>{r.name}</span><span className={styles.sym}>{r.sym}</span></th>
                  <td className={styles.ours}><span className={styles.val}>{r.ours}</span>{r.oursNote && <span className={styles.note}>{r.oursNote}</span>}</td>
                  <td><span className={styles.val}>{r.main}</span>{r.mainNote && <span className={styles.note}>{r.mainNote}</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  )
}

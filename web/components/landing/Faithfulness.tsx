'use client'
// Faithfulness table (landing redesign §12): every place Luminar's GossipSub departs from an Ethereum mainnet
// node. Luminar column: backend/gossip/engine.py + scoring.py; mainnet column: docs/research-live-network.md item 4.
// Story (design-to-motion B4, table): a soft highlight steps down the rows while the card is on screen; the
// pointer takes over on hover; reduced motion shows the still table.
import { type CSSProperties, useEffect, useRef } from 'react'
import { ECLIPSE_WHY, MECHANISM } from '@/lib/copy'
import styles from './Faithfulness.module.css'

export interface Row { name: string; sym: string; ours: string; oursNote?: string; main: string; mainNote?: string }

export const ROWS: Row[] = [
  { name: 'Mesh degree', sym: 'D', ours: '6', oursNote: 'D_low 4 · D_high 8 · D_lazy 6', main: '8' },
  { name: 'Heartbeat', sym: 'interval', ours: '1 s', main: '0.7 s' },
  { name: 'Score thresholds', sym: 'graft · prune', ours: '−5 · −10', main: '−4000 · −8000 · −16000', mainNote: 'gossip · publish · graylist' },
  { name: 'Score terms', sym: 'score function', ours: 'P1–P4', oursNote: 'time in mesh, first deliveries, delivery deficit, invalid messages', main: 'P1–P7', mainNote: 'adds application score, IP colocation, behaviour penalty' },
  { name: 'Link latency', sym: 'per hop', ours: '5–50 ms', oursNote: 'uniform random', main: 'real internet', mainNote: 'blocks reach p50 in 104 ms (9 KB) to 348 ms (238 KB), ethPandaOps' },
  { name: 'Signatures', sym: 'validation', ours: 'none', oursNote: 'attackers send invalid messages by construction', main: 'BLS', mainNote: 'blocks and attestations are checked before relay' },
  { name: 'IWANT timing', sym: 'gossip pull', ours: 'at the heartbeat', oursNote: 'pulls wait for the next tick', main: 'on IHAVE', mainNote: 'sent as soon as the IHAVE arrives' },
  { name: 'Eclipse visibility', sym: 'scoring', ours: 'invisible', oursNote: ECLIPSE_WHY, main: 'more signals', mainNote: 'P6 IP colocation scores attackers that share an address' },
]

const CAPTION = 'Luminar constants against Lighthouse defaults on mainnet'
const up = (i: number) => ({ 'data-k': 'up', style: { '--i': i } as CSSProperties })

export default function Faithfulness() {
  const ref = useRef<HTMLElement>(null)
  useEffect(() => {   // the scan runs only while the section is on screen (design-to-motion website rules)
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) el.dataset.play = ''; else delete el.dataset.play })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  return (
    <section ref={ref} id="faithfulness" data-reveal="" aria-labelledby="faith-h" className={styles.section}>
      <p className={styles.kicker} {...up(0)}>Faithfulness</p>
      <h2 id="faith-h" className={styles.h2} {...up(1)}>{MECHANISM}</h2>
      <p className={styles.lead} {...up(2)}>Luminar runs the GossipSub v1.1 mechanism with constants small enough to watch a peer get pruned on a laptop. These are the places it departs from an Ethereum mainnet node, so you know what a recording can and cannot tell you.</p>
      <div className={styles.card} data-k="card" style={{ '--i': 3 } as CSSProperties}>
        <p className={styles.head} aria-hidden="true">{CAPTION}<span className={styles.hint}>scroll →</span></p>
        <div className={styles.scroll} role="region" aria-labelledby="faith-cap" tabIndex={0}>
          <table className={styles.table} style={{ '--rows': ROWS.length } as CSSProperties}>
            <caption id="faith-cap" className="sr-only">{CAPTION}</caption>
            <thead>
              <tr>
                <th scope="col">Parameter</th>
                <th scope="col"><span className={styles.dot} aria-hidden="true" />Luminar</th>
                <th scope="col">Ethereum mainnet <span className={styles.thNote}>Lighthouse defaults</span></th>
              </tr>
            </thead>
            <tbody>
              {ROWS.map((r, i) => (
                <tr key={r.name} style={{ '--r': i } as CSSProperties}>
                  <th scope="row"><span className={styles.name}>{r.name}</span><span className={styles.sym}>{r.sym}</span></th>
                  <td className={styles.ours}><span className={styles.val}>{r.ours}</span>{r.oursNote && <span className={styles.note}>{r.oursNote}</span>}</td>
                  <td className={styles.main}><span className={styles.val}>{r.main}</span>{r.mainNote && <span className={styles.note}>{r.mainNote}</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <p className={styles.sources} {...up(4)}>Sources: backend/gossip/engine.py · scoring.py · docs/research-live-network.md</p>
    </section>
  )
}

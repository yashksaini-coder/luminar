// FAQ (landing v2 item 10): product questions only, no setup and no commands. Radix Accordion gives the
// keyboard model and ARIA (one open at a time, the first open by default); the answers come from the engine
// constants (backend/gossip/engine.py: D = 6, HEARTBEAT_INTERVAL = 1.0, SCORE_THRESHOLD_PRUNE = -10), the
// recording (lib/reel-stats.json) and the research note. Radix renders a closed answer's text only on open,
// so every pair also ships as FAQPage JSON-LD for search and answer engines.
import * as Accordion from '@radix-ui/react-accordion'
import type { CSSProperties } from 'react'
import PixelField from '@/components/fx/PixelField'
import { ARRIVAL, ECLIPSE_WHY, MECHANISM, RECORDING_NOT_RUN } from '@/lib/copy'
import stats from '@/lib/reel-stats.json'
import styles from './Faq.module.css'

const cap = (s: string) => s[0].toUpperCase() + s.slice(1)
const i = (n: number) => ({ '--i': n }) as CSSProperties

export const QA: [string, string][] = [
  ['What is Luminar?', `A real-time simulator of a peer-to-peer gossip network. ${stats.peers} simulated peers run GossipSub v1.1 with P1–P4 peer scoring; you inject Sybils, an eclipse or a partition and watch the mesh answer, heartbeat by heartbeat, live or from a recording. A second view shows real block arrivals on Ethereum mainnet.`],
  ['Is this the scoring my node runs?', `No. ${MECHANISM} It is the P1–P4 mechanism with mesh degree 6, a one second heartbeat and a prune threshold of −10, where a mainnet client uses D 8, 0.7 s and prune thresholds in the thousands.`],
  ['Why are the Sybils pruned in two heartbeats?', `Their invalid messages drive P4 below the prune threshold, and every score is recomputed at each heartbeat. In the recording the ${stats.sybils} Sybils graft at T+${stats.sybilAt} s and the first score prune lands at T+${stats.firstScorePruneAt} s.`],
  ["Why can't scoring see an eclipse?", `${cap(ECLIPSE_WHY)}. The victim stays cut off until the fault clears; in the recording it heals ${stats.healedInS} s after that.`],
  ['Is the mainnet data live?', `It follows mainnet, a little behind. ethPandaOps' block arrival API is polled once per slot (CC BY 4.0), so you see ${ARRIVAL}, never the route a block took. The landing shows one recorded slot.`],
  ['Can I use it offline?', `Yes. A recording is a file of frames that plays in the browser with no backend and no socket once the page has loaded. The engine is not seeded, so each one is a ${RECORDING_NOT_RUN}.`],
  ['Who is it for?', 'Protocol and client engineers who want to see what peer scoring does before tuning it, researchers explaining an attack, and anyone teaching how a gossip network fails and recovers.'],
  ['Is it open source?', 'Yes, under the MIT licence, and it needs no account: no analytics, no cookies. The mainnet arrivals come from ethPandaOps under CC BY 4.0.'],
]

const LD = JSON.stringify({
  '@context': 'https://schema.org', '@type': 'FAQPage',
  mainEntity: QA.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })),
}).replace(/</g, '\\u003c')

export default function Faq() {
  return (
    <section data-reveal="" aria-labelledby="faq-h" className={styles.faq}>
      <div className={styles.cells} data-grid="">
        <div className={styles.intro}>
          <p className={styles.label} data-k="up" style={i(0)}>[ FAQ ]</p>
          <h2 id="faq-h" className={styles.h2} data-k="up" style={i(1)}>Questions, answered plainly</h2>
          <p className={styles.sub} data-k="up" style={i(2)}>What Luminar is, what it is not, and where every number on this page comes from.</p>
          <div className={styles.art} data-k="up" style={i(3)}>
            <PixelField preset="halftone" tint="signal" cell={9} speed={0.6} className={styles.field} />
            <p className={styles.count}><span>{String(QA.length).padStart(2, '0')}</span> questions</p>
          </div>
        </div>
        <Accordion.Root type="single" collapsible defaultValue="q0" className={styles.list}>
          {QA.map(([q, a], n) => (
            <Accordion.Item key={q} value={`q${n}`} className={styles.item} data-k="up" style={i(n + 2)}>
              <Accordion.Header className={styles.head}>
                <Accordion.Trigger className={styles.trigger}>
                  <span className={styles.idx} aria-hidden="true">{String(n + 1).padStart(2, '0')}</span>
                  <span className={styles.q}>{q}</span>
                  <span className={styles.icon} aria-hidden="true" />
                </Accordion.Trigger>
              </Accordion.Header>
              <Accordion.Content className={styles.content}>
                <p className={styles.a}>{a}</p>
              </Accordion.Content>
            </Accordion.Item>
          ))}
        </Accordion.Root>
      </div>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: LD }} />
    </section>
  )
}

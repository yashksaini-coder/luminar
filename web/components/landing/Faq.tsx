// FAQ (land-02): eight objections answered with the engine's constants (backend/gossip/engine.py: D = 6,
// HEARTBEAT_INTERVAL = 1.0, SCORE_THRESHOLD_PRUNE = -10), the recording's timestamps (lib/reel-stats.json)
// and the research note's mainnet column (docs/research-live-network.md). Plain <dl> markup, `up` reveal.
import { ARRIVAL, ECLIPSE_WHY, RECORDING_NOT_RUN } from '@/lib/copy'
import stats from '@/lib/reel-stats.json'
import styles from './Faq.module.css'

const cap = (s: string) => s[0].toUpperCase() + s.slice(1)

export const QA: [string, string][] = [
  ['Is this the scoring my beacon node runs?', 'No. It is the same P1–P4 mechanism with toy constants: mesh degree 6, a one second heartbeat and a prune threshold of −10, where a mainnet client uses D 8, 0.7 s and prune thresholds in the thousands.'],
  ['Why are the Sybils pruned within two heartbeats?', `Their invalid messages drive P4 below the prune threshold, and the score is recomputed at every heartbeat. In the recording they graft at T+${stats.sybilAt} s and the first score prune lands at T+${stats.firstScorePruneAt} s.`],
  ['Why does the eclipse survive the scoring?', `${cap(ECLIPSE_WHY)}. Only clearing the fault heals it.`],
  ['What is the difference between live and a recording?', `Live runs the Python engine and streams frames over a WebSocket; a recording is a JSONL file of the same frames played back in the browser. The engine is not seeded, so what you get is a ${RECORDING_NOT_RUN}.`],
  ['Can I run it offline?', 'Yes. A recording page needs no backend and no network once it has loaded: one .jsonl file, no socket.'],
  ['How big can the mesh go?', 'The presets stop at 200 peers for the talk build and the backend accepts 500. Above 100 peers the backend sends no mesh, so mesh links and the mesh peers row are hidden and the legend says so.'],
  ['Where does the mainnet data come from?', `ethPandaOps' block arrival API, polled once per slot (CC BY 4.0). It shows ${ARRIVAL}, never the route a block took through the mesh.`],
  ['Does it emit OpenTelemetry?', 'Every simulated message is a trace over OTLP and /metrics uses the gossipsub_* names Lighthouse emits. We found no consensus client that exposes OTLP itself, so the live feed is ingested from the arrival API, not traced.'],
]

export default function Faq() {
  return (
    <section data-reveal aria-labelledby="faq-h" className={styles.faq}>
      <h2 id="faq-h" className={styles.h2} data-k="up" style={{ '--i': 0 } as React.CSSProperties}>Questions</h2>
      <dl className={styles.list}>
        {QA.map(([q, a], i) => (
          <div key={q} className={styles.pair} data-k="up" style={{ '--i': i + 1 } as React.CSSProperties}>
            <dt>{q}</dt>
            <dd>{a}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

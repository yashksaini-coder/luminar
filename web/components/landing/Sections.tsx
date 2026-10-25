// Landing prose sections. WhatItDoes: the mechanism, the attacks, and why scoring misses a silent eclipse;
// SameNames: the Grafana/Jaeger stills and the gossipsub_* series; LiveMainnet: the arrival feed and its credit.
import DitherImage from '@/components/dither/DitherImage'
import { ARRIVAL, ECLIPSE_WHY, PROVENANCE, SAME_NAMES } from '@/lib/copy'
import { reelHref } from '@/lib/reels'
import styles from './Sections.module.css'

export function WhatItDoes() {
  return (
    <section className={styles.section}>
      <h2 className={styles.h2}>What it does</h2>
      <p>Every peer keeps a mesh of degree 6 and runs a heartbeat once a second. A new message is flood-published to every peer that wants the topic, then relayed peer to peer along the mesh; peers outside the mesh hear of it through IHAVE gossip and pull what they missed with IWANT.</p>
      <p>Inject a Sybil flood and the attackers graft into honest meshes at once; their invalid messages drive P4 down and the score prunes them within two heartbeats. An eclipse surrounds one peer with attackers; a partition cuts the network in two.</p>
      <p>{`Scoring cannot see a silent eclipse: ${ECLIPSE_WHY}. Only clearing the fault heals it.`}</p>
      <a className="chev" href="/sim/">Open the simulator <span aria-hidden="true">›</span></a>
    </section>
  )
}

const SERIES = ['gossipsub_mesh_peer_counts', 'gossipsub_mesh_peer_churn_events', 'gossipsub_mesh_peer_inclusion_events', 'gossipsub_score_per_mesh', 'gossipsub_topic_iwant_msgs', 'gossipsub_topic_msg_published', 'gossipsub_topic_msg_recv_counts']

export function SameNames() {
  return (
    <section className={styles.section}>
      <h2 className={styles.h2}>Same names</h2>
      <div className={`plate ${styles.stills}`}>
        <div className={styles.stillA}><DitherImage src="/stills/grafana.png" alt="Grafana: gossipsub_* series from Luminar's /metrics" depth={0.6} focus={[0.5, 0.2]} loupe /></div>
        <div className={styles.stillB}><DitherImage src="/stills/jaeger.png" alt="Jaeger: a publish trace" depth={0.9} focus={[0.5, 0.3]} /></div>
      </div>
      <p>{`/metrics emits ${SAME_NAMES}, scraped by the bundled Prometheus and Grafana; the trace is OpenTelemetry over OTLP.`}</p>
      <ul className={`mono ${styles.series}`}>{SERIES.map((s) => <li key={s}>{s}</li>)}</ul>
    </section>
  )
}

export function LiveMainnet() {
  return (
    <section className={styles.section}>
      <h2 className={styles.h2}>Live mainnet</h2>
      <p>{`The MAINNET badge polls ethPandaOps once per slot and lights observer nodes as each block reaches them: ${ARRIVAL}. `}<a className="chev" href={reelHref('mainnet-block-wave')}>Watch the recorded block wave <span aria-hidden="true">›</span></a></p>
      <p className={styles.credit}>{PROVENANCE}</p>
    </section>
  )
}

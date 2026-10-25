// Landing prose sections. WhatItDoes: the mechanism, the attacks, and why scoring misses a silent eclipse.
import { ECLIPSE_WHY } from '@/lib/copy'
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

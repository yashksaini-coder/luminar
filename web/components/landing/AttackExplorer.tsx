'use client'
// Attack explorer (landing redesign ★7): WAI-ARIA tabs (automatic activation; arrows, Home and End) over the
// three faults and the healthy baseline. Each panel: what the attack does, what the map shows, outcome numbers
// from lib/reel-stats.json (never retyped), a static topology diagram in the map's own glyph language
// (disc honest, flame diamond attacker, outlined diamond pruned, signal disc delivered, dashed flame attack
// link) and two actions. All four panels render on the server; inactive ones are `hidden`.
import { type CSSProperties, type KeyboardEvent, useId, useRef, useState } from 'react'
import { ECLIPSE_WHY } from '@/lib/copy'
import stats from '@/lib/reel-stats.json'
import { REEL_MANIFEST, reelHref } from '@/lib/reels'
import styles from './AttackExplorer.module.css'

const at = (i: number) => ({ '--i': i }) as CSSProperties
const peersIn = (reel: string) => REEL_MANIFEST.find((r) => r.name === reel)?.nodes ?? 0

type NodeKind = 'honest' | 'idle' | 'origin' | 'decoded' | 'target' | 'attacker' | 'pruned'
type EdgeKind = 'mesh' | 'attack' | 'gone'
interface Diagram { label: string; nodes: [number, number, NodeKind][]; edges: [number, number, EdgeKind][]; notes: [number, number, string][]; cut?: boolean }
export interface Attack { id: string; tab: string; reel: string; what: string; see: string[]; outcome: [string, string][]; source: string; caption: string; diagram: Diagram }

// Shared honest layout (viewBox 320 × 220); the Sybil and healthy diagrams reuse it.
const MESH: [number, number][] = [[52, 56], [150, 36], [262, 54], [34, 142], [128, 118], [224, 124], [292, 156], [88, 190], [192, 194]]
const MESH_EDGES: [number, number][] = [[0, 1], [1, 2], [0, 3], [0, 4], [1, 4], [1, 5], [2, 5], [2, 6], [3, 4], [3, 7], [4, 5], [4, 7], [4, 8], [5, 6], [5, 8], [6, 8], [7, 8]]
const mesh = (kind: (i: number) => NodeKind) => MESH.map(([x, y], i) => [x, y, kind(i)] as [number, number, NodeKind])

export const ATTACKS: Attack[] = [
  {
    id: 'sybil', tab: 'Sybil', reel: 'sybil-eclipse',
    what: `The attacker starts ${stats.sybils} Sybil peers that graft into honest meshes at once and flood invalid messages. P4 weighs each invalid message at −10, so their scores fall through the GRAFT bar at −5 and the PRUNE bar at −10, and honest peers drop them.`,
    see: [
      'Flame diamonds join, with dashed flame attack links to every peer they grafted',
      'Score halos turn flame where a score goes negative',
      `Within ${stats.heartbeatsToPrune} heartbeats the diamonds fall to a pruned outline and their links go`,
    ],
    outcome: [[`T+${stats.firstScorePruneAt} s`, 'first score prune'], [`${stats.heartbeatsToPrune}`, 'heartbeats from graft to prune'], [`${stats.sybils}`, `Sybils grafted at T+${stats.sybilAt} s`]],
    source: `Measured in the sybil-eclipse recording, ${stats.peers} peers.`,
    caption: `After the prune, T+${stats.firstScorePruneAt} s`,
    diagram: {
      label: 'Nine honest peers in a mesh; three pruned Sybil diamonds whose dashed attack links are fading out.',
      nodes: [...mesh(() => 'honest'), [96, 92, 'pruned'], [186, 80, 'pruned'], [252, 196, 'pruned']],
      edges: [...MESH_EDGES.map(([a, b]) => [a, b, 'mesh'] as [number, number, EdgeKind]), [9, 0, 'gone'], [9, 4, 'gone'], [9, 3, 'gone'], [10, 1, 'gone'], [10, 5, 'gone'], [10, 2, 'gone'], [11, 6, 'gone'], [11, 8, 'gone']],
      notes: [[252, 216, 'pruned']],
    },
  },
  {
    id: 'eclipse', tab: 'Eclipse', reel: 'sybil-eclipse',
    what: `Attackers take every mesh slot around one peer, ${stats.eclipseTarget} in the recording, and then stay silent. Scoring cannot see it: ${ECLIPSE_WHY}. Only clearing the fault heals it.`,
    see: [
      `Dashed flame links close in on ${stats.eclipseTarget} from every side`,
      'The attackers\' scores sink only to the P3 floor, −0.25, far above the PRUNE bar at −10',
      `The scrubber marks the eclipse from T+${stats.eclipseAt} s to the clear at T+${stats.clearedAt} s`,
    ],
    outcome: [['−0.25', 'attacker score floor, P3 only'], [stats.eclipseTarget, `eclipsed at T+${stats.eclipseAt} s`], [`${stats.healedInS} s`, `to heal after the clear at T+${stats.clearedAt} s`]],
    source: `Measured in the sybil-eclipse recording, ${stats.peers} peers.`,
    caption: `${stats.eclipseTarget} eclipsed, T+${stats.eclipseAt} s`,
    diagram: {
      label: `${stats.eclipseTarget} in the centre, surrounded by four attacker diamonds with dashed attack links; the honest peers around them have no link to it.`,
      nodes: [[160, 112, 'target'], [108, 70, 'attacker'], [212, 70, 'attacker'], [108, 156, 'attacker'], [212, 156, 'attacker'], [36, 40, 'honest'], [284, 40, 'honest'], [30, 182, 'honest'], [290, 182, 'honest'], [160, 24, 'honest'], [160, 204, 'honest']],
      edges: [[1, 0, 'attack'], [2, 0, 'attack'], [3, 0, 'attack'], [4, 0, 'attack'], [5, 9, 'mesh'], [9, 6, 'mesh'], [5, 7, 'mesh'], [6, 8, 'mesh'], [7, 10, 'mesh'], [10, 8, 'mesh'], [5, 1, 'mesh'], [6, 2, 'mesh'], [7, 3, 'mesh'], [8, 4, 'mesh']],
      notes: [[160, 146, stats.eclipseTarget], [160, 54, 'attackers −0.25']],
    },
  },
  {
    id: 'partition', tab: 'Partition', reel: 'partition-heal',
    what: 'A partition splits the peers into two halves by layout side and drops every link across the cut. Each half keeps its own mesh, so a publish reaches only the half it started in until the fault clears.',
    see: [
      'The mesh splits down the middle and the cross links drop',
      'A publish lights only the half it started in',
      'The scrubber band holds until the clear, then the halves reconnect',
    ],
    outcome: [['halves', 'delivery while the cut holds'], ['heals', 'after the partition clears'], [`${peersIn('partition-heal')}`, 'peers in the recording']],
    source: `From the partition-heal recording, ${peersIn('partition-heal')} peers.`,
    caption: 'While the cut holds',
    diagram: {
      label: 'Two halves split by a dashed cut line; the publish has reached the left half only.',
      nodes: [[40, 50, 'decoded'], [116, 36, 'decoded'], [72, 112, 'origin'], [30, 178, 'decoded'], [124, 160, 'decoded'], [204, 44, 'idle'], [284, 60, 'idle'], [236, 116, 'idle'], [196, 180, 'idle'], [288, 178, 'idle']],
      edges: [[0, 1], [0, 2], [1, 2], [2, 3], [2, 4], [3, 4], [1, 4], [5, 6], [5, 7], [6, 7], [7, 8], [7, 9], [8, 9]].map(([a, b]) => [a, b, 'mesh'] as [number, number, EdgeKind]),
      notes: [[160, 212, 'cut']],
      cut: true,
    },
  },
  {
    id: 'healthy', tab: 'Healthy', reel: 'healthy-publish',
    what: 'No faults. A publish floods to the mesh and every peer relays it along its mesh links of degree 6; peers outside the mesh hear of it through IHAVE gossip and pull it with IWANT.',
    see: [
      'The origin peer shows a dark core as it publishes',
      'Peers fill with signal as the message reaches them, hop by hop',
      'Peers outside the mesh pull it in through IHAVE and IWANT',
    ],
    outcome: [[`${stats.deliveryPct} %`, 'delivery'], [`${stats.avgHops}`, 'average hops'], [`${stats.avgPropagationMs} ms`, 'average propagation']],
    source: `Measured in the sybil-eclipse recording, ${stats.peers} peers.`,
    caption: 'One publish, mid relay',
    diagram: {
      label: 'Nine peers in a mesh; the origin in the middle, five peers already delivered in signal, three still waiting.',
      nodes: mesh((i) => (i === 4 ? 'origin' : [0, 1, 3, 5, 7].includes(i) ? 'decoded' : 'honest')),
      edges: MESH_EDGES.map(([a, b]) => [a, b, 'mesh'] as [number, number, EdgeKind]),
      notes: [[128, 146, 'origin']],
    },
  },
]

const diamond = (x: number, y: number, r = 9) => `M${x},${y - r}L${x + r},${y}L${x},${y + r}L${x - r},${y}Z`

function Node({ x, y, kind }: { x: number; y: number; kind: NodeKind }) {
  switch (kind) {
    case 'attacker': return <path d={diamond(x, y)} className={styles.attacker} />
    case 'pruned': return <path d={diamond(x, y)} className={styles.pruned} />
    case 'origin': return <><circle cx={x} cy={y} r={8} className={styles.honest} /><circle cx={x} cy={y} r={3} className={styles.core} /></>
    case 'decoded': return <circle cx={x} cy={y} r={7} className={styles.decoded} />
    case 'idle': return <circle cx={x} cy={y} r={7} className={styles.idle} />
    case 'target': return <><circle cx={x} cy={y} r={14} className={styles.ring} /><circle cx={x} cy={y} r={8} className={styles.honest} /></>
    default: return <circle cx={x} cy={y} r={7} className={styles.honest} />
  }
}

export function TopologyDiagram({ d }: { d: Diagram }) {
  return (
    <svg viewBox="0 0 320 220" className={styles.svg} role="img" aria-label={d.label}>
      {d.cut && <line x1="160" y1="8" x2="160" y2="196" className={styles.cut} />}
      {d.edges.map(([a, b, k]) => (
        <line key={`${a}-${b}`} x1={d.nodes[a][0]} y1={d.nodes[a][1]} x2={d.nodes[b][0]} y2={d.nodes[b][1]} className={styles[k]} />
      ))}
      {d.nodes.map(([x, y, k], i) => <Node key={i} x={x} y={y} kind={k} />)}
      {d.notes.map(([x, y, t]) => <text key={t} x={x} y={y} textAnchor="middle" className={styles.note}>{t}</text>)}
    </svg>
  )
}

function TabGlyph({ id }: { id: string }) {
  const g = id === 'sybil' ? <path d={diamond(6, 6, 5)} className={styles.attacker} />
    : id === 'eclipse' ? <><circle cx="6" cy="6" r="5" className={styles.ring} /><circle cx="6" cy="6" r="2.5" className={styles.honest} /></>
      : id === 'partition' ? <><circle cx="2.5" cy="6" r="2.5" className={styles.honest} /><circle cx="9.5" cy="6" r="2.5" className={styles.idle} /></>
        : <circle cx="6" cy="6" r="4" className={styles.decoded} />
  return <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true" className={styles.glyph}>{g}</svg>
}

export default function AttackExplorer() {
  const [sel, setSel] = useState(0)
  const tabs = useRef<(HTMLButtonElement | null)[]>([])
  const uid = useId()
  const tabId = (i: number) => `${uid}-tab-${ATTACKS[i].id}`
  const panelId = (i: number) => `${uid}-panel-${ATTACKS[i].id}`

  const onKey = (e: KeyboardEvent) => {
    const n = ATTACKS.length
    const next = { ArrowRight: (sel + 1) % n, ArrowLeft: (sel - 1 + n) % n, Home: 0, End: n - 1 }[e.key]
    if (next === undefined) return
    e.preventDefault()
    setSel(next)
    tabs.current[next]?.focus()
  }

  return (
    <section id="attacks" data-reveal="" aria-labelledby="attacks-h" className={styles.section}>
      <p className={styles.kicker} data-k="up" style={at(0)}>Attack explorer</p>
      <h2 id="attacks-h" className={styles.h2} data-k="up" style={at(1)}>Break the mesh on purpose.</h2>
      <p className={styles.lead} data-k="up" style={at(2)}>Three faults and a healthy baseline. Each one ships as a reproducible recording that plays offline, and each fault can be injected live in the simulator.</p>
      <div className={styles.card} data-k="card" style={at(3)}>
        <div role="tablist" aria-label="Attack scenarios" className={styles.tabs} onKeyDown={onKey}>
          {ATTACKS.map((a, i) => (
            <button key={a.id} ref={(el) => { tabs.current[i] = el }} type="button" role="tab" id={tabId(i)}
              aria-selected={i === sel} aria-controls={panelId(i)} tabIndex={i === sel ? 0 : -1}
              className={styles.tab} onClick={() => setSel(i)}>
              <TabGlyph id={a.id} />{a.tab}
            </button>
          ))}
        </div>
        {ATTACKS.map((a, i) => (
          <div key={a.id} role="tabpanel" id={panelId(i)} aria-labelledby={tabId(i)} tabIndex={0} hidden={i !== sel} className={styles.panel}>
            <div className={styles.text}>
              <p className={styles.what}>{a.what}</p>
              <h3 className={styles.h3}>On the map</h3>
              <ul className={styles.see}>{a.see.map((s) => <li key={s}>{s}</li>)}</ul>
              <dl className={styles.outcome}>
                {a.outcome.map(([v, l]) => <div key={l}><dt>{l}</dt><dd>{v}</dd></div>)}
              </dl>
              <p className={styles.source}>{a.source}</p>
              <div className={styles.actions}>
                <a className="chev" href={reelHref(a.reel)}>Play the recording <span aria-hidden="true">›</span></a>
                <a className="chev" href="/sim/">Try it live <span aria-hidden="true">›</span></a>
              </div>
            </div>
            <figure className={styles.figure}>
              <TopologyDiagram d={a.diagram} />
              <figcaption className={styles.caption}>{a.caption}</figcaption>
            </figure>
          </div>
        ))}
      </div>
    </section>
  )
}

'use client'

import { fmtCount, isAttackerId, isPruned, shortName, signed } from '@/lib/format'
import { selectHoveredNode, useStore } from '@/lib/store'
import type { PeerNode } from '@/lib/types'
import styles from './Tooltip.module.css'

type TooltipData = { head: { name: string; badge: string; id: string; alarm: boolean }; rows: [string, string, boolean][]; peers?: string[] }

/** The hover card's content as data; the third tuple slot is the alarm (flame) tone. */
export function tooltipRows(node: PeerNode, mesh: Record<string, string[]>, nodeById: ReadonlyMap<string, PeerNode>): TooltipData {
  const id = node.peer_id
  const attacker = node.state === 'attacker'
  const pruned = isPruned(node)
  const head = {
    name: shortName(node),
    badge: pruned ? 'PRUNED' : node.state.toUpperCase(),
    id: id.length > 16 ? `${id.slice(0, 9)}…${id.slice(-4)}` : id,
    alarm: attacker && !pruned,
  }
  const traffic: [string, string, boolean] = ['sent · recv', `↑${fmtCount(node.messages_sent)} · ↓${fmtCount(node.messages_received)}`, false]
  const n = node.connected_peers.length
  if (attacker) {
    const rows: [string, string, boolean][] = [['grafted into', `${n} meshes`, false], ['score', signed(node.gossip_score), true], traffic]
    if (n === 0) return { head, rows }
    return { head, rows, peers: node.connected_peers.map(p => { const v = nodeById.get(p); return v ? shortName(v) : p }) }
  }
  const rows: [string, string, boolean][] = [['peers', String(n), false], ['score', signed(node.gossip_score), node.gossip_score < 0], traffic]
  const sybils = (mesh[id] ?? node.connected_peers).filter(isAttackerId).length
  if (sybils > 0) rows.push(['mesh', `${sybils} sybil graft${sybils === 1 ? '' : 's'}`, true])
  return { head, rows }
}

/** Hover card content; the renderer shows and places the wrapper. */
export default function Tooltip() {
  // Rows serialised to a string so the card re-renders only when what it shows changes, not on every snapshot.
  const json = useStore(s => { const node = selectHoveredNode(s); return node ? JSON.stringify(tooltipRows(node, s.mesh, s.nodeById)) : '' })
  if (!json) return null
  const { head, rows, peers }: TooltipData = JSON.parse(json)
  const state = head.badge === 'PRUNED' ? 'pruned' : head.badge.toLowerCase()
  return (
    <div className={styles.card}>
      <div className={styles.head}>
        <span className={head.alarm ? `${styles.name} ${styles.alarm}` : styles.name}>{head.name}</span>
        <span className={head.alarm ? `${styles.badge} ${styles.alarm}` : styles.badge} data-state={state}>{head.badge}</span>
      </div>
      <div className={styles.id}>{head.id}</div>
      <dl className={styles.rows}>
        {rows.map(([label, value, alarm]) => (
          <div key={label} className={styles.row}>
            <dt>{label}</dt>
            <dd className={alarm ? styles.alarm : undefined}>{value}</dd>
          </div>
        ))}
      </dl>
      {peers && <div className={styles.peers}>{peers.join(' ')}</div>}
    </div>
  )
}

'use client'
/** Peer inspector: slides over the log rail while a peer is selected; mesh vs topology peers, score history, events. */
import { useEffect, useMemo, useRef } from 'react'
import { isNodeVisible } from '@/components/map/layout'
import { Reticle } from '@/components/dither/Reticle'
import { ECLIPSE_WHY, MESH_HIDDEN } from '@/lib/copy'
import { DEFAULT_TYPE, inspectorDetail, TYPE_CODES } from '@/lib/event-codes'
import { isAttackerId, isPruned, shortId, shortName, signed } from '@/lib/format'
import { direction, meshHolders, meshPeers, peerEvents, prunedBy } from '@/lib/inspector-peers'
import { scoreDomain } from '@/lib/spark'
import { selectSelectedNode, useStore } from '@/lib/store'
import Glyph from './Glyph'
import styles from './Inspector.module.css'
import Sparkline from './Sparkline'

function jump(id: string) {
  const s = useStore.getState()
  if (isNodeVisible(s.layoutMode, s.nodeById.get(id))) s.selectPeer(id)
}

function Chips({ ids, struck }: { ids: string[]; struck?: boolean }) {
  if (ids.length === 0) return <p className={styles.note}>none</p>
  return (
    <div className={styles.chips}>
      {ids.map(id => (
        <button key={id} type="button" title={id} className={styles.chip} onClick={() => jump(id)}
          data-attacker={isAttackerId(id) ? '' : undefined} data-struck={struck ? '' : undefined}>
          {shortId(id)}
        </button>
      ))}
    </div>
  )
}

export default function Inspector() {
  const node = useStore(selectSelectedNode)
  const mesh = useStore(s => s.mesh)
  const allEvents = useStore(s => s.events)
  const history = useStore(s => s.scoreHistory)
  const id = node?.peer_id ?? ''
  const rows = useMemo(() => (id ? peerEvents(allEvents, id) : []), [allEvents, id])
  const listRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = listRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [rows])
  if (!node) return null

  const attacker = node.state === 'attacker'
  const pruned = isPruned(node)
  const hidden = Object.keys(mesh).length === 0   // R8: the backend sends {} above 100 nodes
  // R8: an attacker is never a mesh key, so its mesh view is the honest peers holding it.
  const meshList = hidden ? null : attacker ? meshHolders(mesh, id) : (meshPeers(mesh, id) ?? [])
  const eclipsed = !attacker && meshList !== null && meshList.length > 0 && meshList.every(isAttackerId)
  const values = history.map(p => p.v)
  const last = values.at(-1)

  return (
    <section className={styles.panel} aria-label={`Peer ${shortName(node)}`}>
      <header className={styles.header}>
        <div className={styles.title}>
          <Reticle size={14} />
          <Glyph role={pruned ? 'pruned' : node.state} size={14} />
          <span className={styles.name}>{shortName(node)}</span>
          <button type="button" className={styles.close} aria-label="Close (Escape)" onClick={() => useStore.getState().selectPeer(null)}>ESC</button>
        </div>
        <div className={styles.badges}>
          <span className={styles.badge}>{pruned ? 'pruned' : node.state}</span>
          {attacker && <span className={styles.badge} data-alarm="">attacker</span>}
          {eclipsed && <span className={styles.badge} data-alarm="">eclipse target</span>}
        </div>
        <div className={styles.fullId}>{node.peer_id}</div>
      </header>

      <dl className={styles.metrics}>
        <div><dt>Sent</dt><dd>{node.messages_sent.toLocaleString('en-US')}</dd></div>
        <div><dt>Recv</dt><dd>{node.messages_received.toLocaleString('en-US')}</dd></div>
        <div><dt>Score</dt><dd data-alarm={node.gossip_score < 0 ? '' : undefined}>{signed(node.gossip_score)}</dd></div>
        <div><dt>Mesh</dt><dd>{`${meshList?.length ?? '—'}/6`}</dd></div>
      </dl>

      <div className={styles.section}>
        <h3 className={styles.heading}>Score history<span className={styles.meta}>last 50 ticks</span></h3>
        {values.length > 1 ? (
          <>
            <Sparkline values={values} height={44} domain={scoreDomain(values)} zeroLine alarm={last !== undefined && last < 0}
              aria-label="gossip score, last 50 ticks" />
            <div className={styles.axis}>
              <span>{`T+${history[0].t.toFixed(1)}`}</span><span>{`T+${history[history.length - 1].t.toFixed(1)}`}</span>
            </div>
          </>
        ) : <p className={styles.note}>collecting…</p>}
      </div>

      <div className={styles.section}>
        <h3 className={styles.heading}>Mesh peers</h3>
        {meshList === null ? <p className={styles.note}>{MESH_HIDDEN}</p>
          : attacker && pruned ? (<><Chips ids={prunedBy(allEvents, id)} struck /><p className={styles.note}>pruned from every honest mesh</p></>)
          : <Chips ids={meshList} />}
      </div>

      <div className={styles.section}>
        <h3 className={styles.heading}>Topology peers</h3>
        <Chips ids={node.connected_peers} />
      </div>

      {attacker && (
        <div className={styles.section}>
          <h3 className={styles.heading}>Why</h3>
          <p className={styles.why}>{ECLIPSE_WHY}</p>
        </div>
      )}

      <div className={styles.section}>
        <h3 className={styles.heading}>Events</h3>
      </div>
      <div ref={listRef} className={styles.events}>
        {rows.length === 0 && <p className={styles.note} data-empty="">no events for this peer yet</p>}
        {rows.map((evt, i) => {
          const { code, tone } = TYPE_CODES[evt.event_type] ?? DEFAULT_TYPE
          const other = evt.from_peer === id ? evt.to_peer : evt.from_peer
          return (
            <div key={`${evt.at}-${i}`} className={styles.row}>
              <span className={styles.at}>{evt.at.toFixed(2)}</span>
              <span data-tone={tone}>{code}</span>
              <span>{direction(evt, id)}</span>
              <span className={styles.detail}>{[other && shortId(other), inspectorDetail(evt)].filter(Boolean).join(' · ')}</span>
            </div>
          )
        })}
      </div>
    </section>
  )
}

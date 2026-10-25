'use client'
/** Event log rail: category chips, the last 500 matching rows, gap indicator, row-click selection. */
import { useEffect, useMemo, useRef, useState } from 'react'
import { buildDetail, DEFAULT_TYPE, FILTER_GROUPS, formatNode, TYPE_CODES } from '@/lib/event-codes'
import { isAttackerId } from '@/lib/format'
import { initialFilters, rowClick, toggleFilter, visibleRows } from '@/lib/log-filter'
import { useStore } from '@/lib/store'
import type { AppEvent, EventCategory } from '@/lib/types'
import styles from './LogRail.module.css'

const ALL = FILTER_GROUPS.map(([, cat]) => cat)

function activate(evt: AppEvent) {
  const s = useStore.getState()
  const r = rowClick(evt, s)
  if (r) s.selectPeer(r.select, r.highlight)
}

export default function LogRail() {
  const events = useStore(s => s.events)
  const eventCount = useStore(s => s.eventCount)
  const dropped = useStore(s => s.droppedEvents)
  const selectedPeer = useStore(s => s.selectedPeer)
  const [active, setActive] = useState<Set<EventCategory>>(initialFilters)
  const [following, setFollowing] = useState(true)
  const listRef = useRef<HTMLDivElement>(null)
  const autoTop = useRef(-1)   // scrollTop we set; its async scroll event can land after new rows grew the list
  const rows = useMemo(() => visibleRows(events, active), [events, active])

  useEffect(() => {
    if (!following) return
    const raf = requestAnimationFrame(() => {
      const el = listRef.current
      if (!el) return
      el.scrollTop = el.scrollHeight
      autoTop.current = el.scrollTop
    })
    return () => cancelAnimationFrame(raf)
  })

  const onScroll = () => {
    const el = listRef.current
    if (el && el.scrollTop !== autoTop.current) setFollowing(el.scrollHeight - el.scrollTop - el.clientHeight < 30)
  }

  return (
    <section className={styles.rail} aria-label="Event log">
      <header className={styles.header}>
        <span className={styles.label}>EVENT LOG</span>
        <span className={styles.meta}>
          {`${eventCount.toLocaleString('en-US')} · ${following ? 'following' : 'paused'}`}
          {dropped > 0 && (
            <span data-gap="" className={styles.gap} title="the backend dropped events above 200 per tick">
              {`${dropped} dropped (gap)`}
            </span>
          )}
        </span>
      </header>
      <div className={styles.chips}>
        <button type="button" className={styles.chip} onClick={() => setActive(new Set(ALL))}>All</button>
        <button type="button" className={styles.chip} onClick={() => setActive(new Set())}>None</button>
        {FILTER_GROUPS.map(([label, cat]) => (
          <button
            key={cat}
            type="button"
            className={styles.chip}
            aria-pressed={active.has(cat)}
            onClick={e => setActive(toggleFilter(active, cat, e.altKey || e.metaKey))}
          >
            {label}
          </button>
        ))}
        <span className={styles.hint}>⌥-click isolates</span>
      </div>
      <div ref={listRef} className={styles.list} onScroll={onScroll}>
        {rows.map((evt, i) => {
          const { code, tone } = TYPE_CODES[evt.event_type] ?? DEFAULT_TYPE
          const peer = evt.peer_id ?? evt.from_peer
          return (
            <div
              key={`${evt.at}-${i}`}
              role="button"
              tabIndex={0}
              className={styles.row}
              aria-current={peer !== undefined && peer === selectedPeer ? 'true' : undefined}
              onClick={() => activate(evt)}
              onKeyDown={e => { if (e.key === 'Enter') activate(evt) }}
            >
              <span className={styles.at}>{evt.at.toFixed(2)}</span>
              <span className={styles.node} data-attacker={peer && isAttackerId(peer) ? '' : undefined}>{formatNode(evt)}</span>
              <span className={styles.code} data-tone={tone}>{code}</span>
              <span className={styles.detail}>{buildDetail(evt)}</span>
            </div>
          )
        })}
      </div>
    </section>
  )
}

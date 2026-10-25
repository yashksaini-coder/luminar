'use client'

/** Popover menus on the command strip: scenarios, reels, inject fault (spec §6.2, §10). */

import { useState, type KeyboardEvent, type MouseEvent, type ReactNode, type ToggleEvent } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { exitReel, injectFault, launchScenario, openReel, setDurationPreset, setNodePreset } from '@/lib/actions'
import { faultItems, type FaultItem } from '@/lib/fault-items'
import { nextMenuIndex } from '@/lib/menu-keys'
import { useStore } from '@/lib/store'
import type { ReelManifest, ScenarioDefinition } from '@/lib/types'
import s from './Menus.module.css'
import Overlay from './Overlay'
import { DURATIONS, NODES } from './Toolbar'

const GAP = 4
const EDGE = 8

const menuItems = (menu: HTMLElement) => [...menu.querySelectorAll<HTMLElement>('[role="menuitem"]')]

function focusItem(items: HTMLElement[], i: number): void {
  items.forEach((el, k) => { el.tabIndex = k === i ? 0 : -1 })
  items[i]?.focus()
}

export function Menu({ id, label, children, disabledReason }: { id: string; label: string; children: ReactNode; disabledReason?: string }) {
  const [open, setOpen] = useState(false)
  const trigger = () => document.querySelector<HTMLElement>(`[popovertarget="${id}"]`)

  function onToggle(e: ToggleEvent<HTMLDivElement>) {
    const isOpen = e.newState === 'open'
    setOpen(isOpen)
    if (!isOpen) return
    const menu = e.currentTarget
    const btn = trigger()
    if (btn) {
      const r = btn.getBoundingClientRect()
      const { offsetWidth: w, offsetHeight: h } = menu
      const up = r.bottom + GAP + h > innerHeight - EDGE
      menu.style.top = `${up ? r.top - GAP - h : r.bottom + GAP}px`
      menu.style.left = `${Math.max(EDGE, Math.min(r.left, innerWidth - w - EDGE))}px`
    }
    focusItem(menuItems(menu), 0)
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const menu = e.currentTarget
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()   // R16: Escape closes the menu and nothing else (the peer stays selected)
      menu.hidePopover()
      trigger()?.focus()
      return
    }
    const items = menuItems(menu)
    const target = e.target as HTMLElement
    if ((e.key === 'Enter' || e.key === ' ') && target.getAttribute('role') === 'menuitem') {
      e.preventDefault()
      target.click()
      return
    }
    const next = nextMenuIndex(Math.max(0, items.indexOf(target)), e.key, items.length)
    if (next === null) return
    e.preventDefault()
    focusItem(items, next)
  }

  return (
    <>
      <button
        type="button" className={s.trigger} aria-haspopup="menu" aria-expanded={open}
        popoverTarget={disabledReason ? undefined : id} aria-disabled={disabledReason ? true : undefined} title={disabledReason}
      >
        {label} ▾
      </button>
      <div id={id} popover="auto" role="menu" aria-label={label} className={s.menu} onToggle={onToggle} onKeyDown={onKeyDown}>
        {children}
      </div>
    </>
  )
}

export function MenuItem(props: {
  onSelect: () => void; disabled?: boolean; reason?: string; active?: boolean
  kbd?: string; aside?: string; meta?: string; tag?: string; children: ReactNode
}) {
  const { onSelect, disabled, reason, active, kbd, aside, meta, tag, children } = props
  function onClick(e: MouseEvent<HTMLButtonElement>) {
    if (disabled) return
    e.currentTarget.closest<HTMLElement>('[popover]')?.hidePopover()
    onSelect()
  }
  const line2 = disabled && reason ? reason : meta
  return (
    <button type="button" role="menuitem" tabIndex={-1} className={s.item} aria-disabled={disabled || undefined} aria-current={active ? 'true' : undefined} onClick={onClick}>
      <span className={s.line}>
        {kbd && <kbd className={s.kbd}>{kbd}</kbd>}
        <span className={s.name}>{children}</span>
        {tag && <span className={s.tag}>{tag}</span>}
        {aside && <span className={s.aside}>{aside}</span>}
      </span>
      {line2 && <span className={s.meta}>{line2}</span>}
    </button>
  )
}

export interface MenuRow {
  key: string; name: string; onSelect: () => void; disabled?: boolean; reason?: string; active?: boolean
  kbd?: string; aside?: string; meta?: string; tag?: string
}

export function scenarioRows(scenarios: ScenarioDefinition[], activeId: string | null): MenuRow[] {
  return scenarios.map(sc => ({
    key: sc.id, name: sc.name, aside: `${sc.duration}s`, meta: sc.description, active: sc.id === activeId,
    onSelect: () => void launchScenario(sc.id),
  }))
}

/** Reel rows navigate by route: a row opens /reels/<name>/, `0` goes back to /sim/. */
export function reelRows(manifest: ReelManifest, activeName: string | null): MenuRow[] {
  return [
    ...manifest.map((meta, i) => ({
      key: meta.name, kbd: String(i + 1), name: meta.title, meta: meta.blurb, tag: meta.real ? 'REAL' : undefined,
      active: meta.name === activeName, onSelect: () => openReel(meta.name),
    })),
    { key: 'live', kbd: '0', name: 'Back to live', onSelect: exitReel },
  ]
}

export function faultRows(items: FaultItem[], n: number): MenuRow[] {
  return items.map(it => ({
    key: it.kind, name: it.label, aside: it.aside, disabled: it.disabled, reason: it.reason,
    onSelect: () => void injectFault(it.kind, { n }),
  }))
}

const Item = ({ row }: { row: MenuRow }) => (
  <MenuItem onSelect={row.onSelect} disabled={row.disabled} reason={row.reason} active={row.active} kbd={row.kbd} aside={row.aside} meta={row.meta} tag={row.tag}>
    {row.name}
  </MenuItem>
)

export function ScenariosMenu() {
  const scenarios = useStore(st => st.scenarios)
  const activeId = useStore(st => st.activeScenario?.scenario?.id ?? null)
  const rows = scenarioRows(scenarios, activeId)
  return (
    <Menu id="menu-scenarios" label="Scenarios">
      {rows.length === 0
        ? <MenuItem disabled onSelect={() => {}}>backend offline</MenuItem>
        : rows.map(r => <Item key={r.key} row={r} />)}
    </Menu>
  )
}

export function ReelsMenu({ manifest }: { manifest: ReelManifest }) {
  const activeName = useStore(st => st.reel?.name ?? null)
  const rows = reelRows(manifest, activeName)
  const last = rows.length - 1
  return (
    <Menu id="menu-reels" label="Reels">
      {rows.map((r, i) => [
        i === last && <hr key="sep" role="separator" className={s.sep} />,
        <Item key={r.key} row={r} />,
      ])}
    </Menu>
  )
}

const clampN = (v: number) => Math.min(10, Math.max(1, v))

export function FaultMenu() {
  const [n, setN] = useState(5)
  const st = useStore(useShallow(x => ({ selectedPeer: x.selectedPeer, nodeById: x.nodeById, activeFaults: x.activeFaults })))
  const rows = faultRows(faultItems(st, n), n)
  const step = (d: number) => (e: MouseEvent) => { e.stopPropagation(); setN(v => clampN(v + d)) }
  return (
    <Menu id="menu-fault" label="Inject fault">
      {rows.map(r => [
        r.key === 'clear-all' && <hr key="sep" role="separator" className={s.sep} />,
        <div key={r.key} className={s.row} data-attack={r.key === 'sybil' || r.key === 'eclipse' ? '' : undefined}>
          <Item row={r} />
          {r.key === 'sybil' && (
            <span className={s.stepper}>
              <button type="button" aria-label="fewer attackers" onClick={step(-1)}>−</button>
              <span aria-live="polite">{n}</span>
              <button type="button" aria-label="more attackers" onClick={step(1)}>+</button>
            </span>
          )}
        </div>,
      ])}
    </Menu>
  )
}

/** ≤1023 route to the same rows: the `Menu +` overlay. A row closes the overlay, then runs. */
export function MenuOverlay({ open, onClose, manifest }: { open: boolean; onClose: () => void; manifest: ReelManifest }) {
  const scenarios = useStore(st => st.scenarios)
  const activeId = useStore(st => st.activeScenario?.scenario?.id ?? null)
  const activeReel = useStore(st => st.reel?.name ?? null)
  const st = useStore(useShallow(x => ({ selectedPeer: x.selectedPeer, nodeById: x.nodeById, activeFaults: x.activeFaults })))
  const maxDuration = useStore(x => x.maxDuration)
  const nodeCount = useStore(x => x.nodeCount)
  const run = (f: () => void) => () => { onClose(); f() }
  const scenarioList = scenarioRows(scenarios, activeId)
  const sections: [string, MenuRow[]][] = [
    ['Scenarios', scenarioList.length ? scenarioList : [{ key: 'offline', name: 'backend offline', disabled: true, onSelect: () => {} }]],
    ['Reels', reelRows(manifest, activeReel)],
    ['Faults', faultRows(faultItems(st, 5), 5)],
  ]
  return (
    <Overlay open={open} onClose={onClose} title="Menu">
      {sections.map(([title, rows]) => (
        <section key={title} className={s.oSection}>
          <h2 className={s.oHeading}>{title}</h2>
          {rows.map(r => (
            <button
              key={r.key} type="button" data-row="" className={s.oRow} aria-disabled={r.disabled || undefined}
              aria-current={r.active ? 'true' : undefined} onClick={r.disabled ? undefined : run(r.onSelect)}
            >
              <span className={s.line}>
                {r.kbd && <kbd className={s.kbd}>{r.kbd}</kbd>}
                <span className={s.oName}>{r.name}</span>
                {r.tag && <span className={s.tag}>{r.tag}</span>}
                {r.aside && <span className={s.aside}>{r.aside}</span>}
              </span>
              {(r.disabled && r.reason ? r.reason : r.meta) && <span className={s.meta}>{r.disabled && r.reason ? r.reason : r.meta}</span>}
            </button>
          ))}
        </section>
      ))}
      <section className={s.oSection}>
        <h2 className={s.oHeading}>Presets</h2>
        <div role="group" aria-label="Duration" data-row="" className={s.oPresets}>
          {DURATIONS.map(([sec, label]) => (
            <button key={sec} type="button" className={s.oPreset} aria-pressed={maxDuration === sec} onClick={run(() => setDurationPreset(sec))}>{label}</button>
          ))}
        </div>
        <div role="group" aria-label="Nodes" data-row="" className={s.oPresets}>
          {NODES.map(n => (
            <button key={n} type="button" className={s.oPreset} aria-pressed={nodeCount === n} onClick={run(() => void setNodePreset(n))}>{n}</button>
          ))}
        </div>
      </section>
    </Overlay>
  )
}

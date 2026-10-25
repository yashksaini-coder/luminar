'use client'
// Legend (a <dl> of the render table's twins) and the settings form behind the gear [spec §6.2, §7.4.2].
import { useState, useSyncExternalStore } from 'react'
import { useShallow } from 'zustand/react/shallow'
import LegendTwins from '@/components/glyphs/LegendTwins'
import { adminToken, setAdminToken } from '@/lib/api/client'
import { MESH_HIDDEN } from '@/lib/copy'
import { reducedMotion } from '@/lib/prefs'
import { useStore } from '@/lib/store'
import Glyph, { type GlyphRole } from './Glyph'
import styles from './Legend.module.css'

const LEGEND_KEY = 'luminar.legend'

// Collapsed flag: localStorage-backed, read after hydration (the static export pre-renders without storage).
let collapsedNow: boolean | null = null
const collapseListeners = new Set<() => void>()
function readCollapsed(): boolean {
  if (collapsedNow === null) {
    // No stored choice on a phone: start collapsed, or the 176px panel covers the RADIAL/GEO tabs.
    try {
      const stored = localStorage.getItem(LEGEND_KEY)
      collapsedNow = stored ? stored === 'collapsed' : matchMedia('(max-width: 1024px)').matches
    } catch { collapsedNow = false }
  }
  return collapsedNow
}
function writeCollapsed(v: boolean): void {
  collapsedNow = v
  try { localStorage.setItem(LEGEND_KEY, v ? 'collapsed' : 'open') } catch { /* storage blocked: session only */ }
  collapseListeners.forEach(f => f())
}
const subscribeCollapsed = (f: () => void) => { collapseListeners.add(f); return () => { collapseListeners.delete(f) } }
const FILLS: [GlyphRole, string][] = [
  ['idle', 'idle'], ['origin', 'origin'], ['receiving', 'receiving'], ['decoded', 'decoded'],
  ['observer', 'observer'], ['joining', 'joining'], ['failed', 'failed'], ['error', 'error'],
]
const LINES = [['topology', 'topology'], ['mesh', 'gossip mesh'], ['attack', 'attack link'], ['message', 'message']]

function Switch({ label, checked, onChange, disabled, hint, kbd }: {
  label: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; hint?: string; kbd?: string
}) {
  return (
    <label className={styles.row}>
      <input type="checkbox" role="switch" className={styles.switch} checked={checked} disabled={disabled}
        onChange={e => onChange(e.target.checked)} />
      <span className={styles.label}>{label}{kbd && <> <kbd>{kbd}</kbd></>}</span>
      {disabled && hint && <span className={styles.hint}>{hint}</span>}
    </label>
  )
}

function Settings() {
  const s = useStore(useShallow(st => ({
    particlesEnabled: st.particlesEnabled, showLabels: st.showLabels, showEdges: st.showEdges,
    allLabels: st.allLabels, stageTheme: st.stageTheme, hero: st.hero, nodeCount: st.nodeCount,
  })))
  const { setDisplay, setPref } = useStore.getState()
  const reduced = reducedMotion()
  return (
    <form className={styles.body} onSubmit={e => e.preventDefault()}>
      <Switch label="Gossip transfers" checked={s.particlesEnabled} disabled={reduced} hint="off under reduced motion"
        onChange={v => setDisplay({ particlesEnabled: v })} />
      <Switch label="Node labels" checked={s.showLabels} onChange={v => setDisplay({ showLabels: v })} />
      <Switch label="Edge lines" checked={s.showEdges} onChange={v => setDisplay({ showEdges: v })} />
      <Switch label="All labels (≤ 50 nodes)" checked={s.allLabels} disabled={s.nodeCount > 50} hint="up to 50 nodes"
        onChange={v => setDisplay({ allLabels: v })} />
      <Switch label="Stage theme" kbd="T" checked={s.stageTheme} onChange={v => setPref('stageTheme', v)} />
      <Switch label="Hero layout" kbd="H" checked={s.hero} onChange={v => setPref('hero', v)} />
      <label className={styles.token}>
        <span className={styles.label}>Admin token</span>
        <input type="password" autoComplete="off" className={styles.input} defaultValue={adminToken() ?? ''}
          onChange={e => setAdminToken(e.target.value || null)} />
        <span className={styles.hint}>sent as X-Luminar-Token on every POST</span>
      </label>
    </form>
  )
}

export default function Legend() {
  const collapsed = useSyncExternalStore(subscribeCollapsed, readCollapsed, () => false)
  const [settings, setSettings] = useState(false)
  const toggle = () => writeCollapsed(!collapsed)
  return (
    <aside aria-label="Legend" className={styles.legend}>
      <div className={styles.head}>
        <span className={styles.title}>LEGEND</span>
        <button type="button" className={styles.btn} aria-expanded={!collapsed} aria-label="Collapse legend"
          onClick={toggle}>{collapsed ? '+' : '−'}</button>
        <button type="button" className={styles.btn} aria-label="Settings" aria-pressed={settings}
          onClick={() => { setSettings(!settings); if (collapsed) toggle() }}>{'\u2699\uFE0E'}</button>
      </div>
      {!collapsed && (settings ? <Settings /> : (
        <dl className={styles.body}>
          <LegendTwins />
          {FILLS.map(([role, text]) => <Row key={role} term={<Glyph role={role} />} text={text} />)}
          {LINES.map(([kind, text]) => <Row key={kind} term={<span className={styles.line} data-line={kind} />} text={text} />)}
          <dd className={styles.note}>{MESH_HIDDEN}</dd>
        </dl>
      ))}
    </aside>
  )
}

function Row({ term, text }: { term: React.ReactNode; text: string }) {
  return <><dt>{term}</dt><dd>{text}</dd></>
}

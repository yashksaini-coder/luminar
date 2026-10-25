'use client'

import { setDurationPreset, setNodePreset, toggleMainnet } from '@/lib/actions'
import { ARRIVAL, REPO_URL } from '@/lib/copy'
import { formatTime } from '@/lib/format'
import { selectPill, useStore } from '@/lib/store'
import styles from './Toolbar.module.css'

export const DURATIONS = [[60, '1m'], [120, '2m'], [300, '5m'], [600, '10m']] as const
export const NODES = [20, 50, 100, 200] as const

function Pill() {
  const pill = useStore(selectPill)
  const title = useStore(s => s.reel?.title ?? '')
  return (
    <span data-testid="pill" data-state={pill} className={styles.pill}>
      {pill === 'live' && <i aria-hidden className={styles.dot} />}
      {pill === 'reel' && <i aria-hidden className={styles.square} />}
      {pill === 'connecting' ? 'CONNECTING…' : pill === 'offline' ? 'OFFLINE' : pill === 'live' ? 'LIVE' : `REEL · ${title}`}
    </span>
  )
}

function Badges() {
  const mainnetOn = useStore(s => s.mainnet?.enabled ?? false)
  const active = useStore(s => s.telemetry.active)
  const peers = useStore(s => s.telemetry.peerCount)
  return (
    <>
      <button type="button" className={styles.badge} aria-pressed={mainnetOn} title={ARRIVAL} onClick={() => void toggleMainnet()}>
        MAINNET
      </button>
      {active && <span className={styles.badge} title="peers reporting · drawer after Devcon">{`TELEMETRY ${peers}`}</span>}
    </>
  )
}

function Presets() {
  const maxDuration = useStore(s => s.maxDuration)
  const nodeCount = useStore(s => s.nodeCount)
  const inReel = useStore(s => s.reel !== null)   // dimmed and inactive in a reel (WCAG 1.4.3 exempts inactive controls)
  return (
    <div className={styles.presets}>
      <span role="group" aria-label="Duration" className={styles.group}>
        {DURATIONS.map(([sec, label]) => (
          <button key={sec} type="button" className={styles.preset} aria-pressed={maxDuration === sec} disabled={inReel} onClick={() => setDurationPreset(sec)}>{label}</button>
        ))}
      </span>
      <span role="group" aria-label="Nodes" className={styles.group}>
        {NODES.map(n => (
          <button key={n} type="button" className={styles.preset} aria-pressed={nodeCount === n} disabled={inReel} onClick={() => void setNodePreset(n)}>{n}</button>
        ))}
      </span>
    </div>
  )
}

function Clock() {
  const t = useStore(s => s.simTime)
  return <time data-testid="clock" className={styles.clock}>{`T+ ${formatTime(t)}`}</time>
}

export default function Toolbar({ onMenu, menuOpen }: { onMenu: () => void; menuOpen: boolean }) {
  return (
    <header className={styles.bar}>
      <span className={styles.brand}>
        LUMINAR <span className={styles.sub}>gossipsub v1.1</span>
      </span>
      <Pill />
      <Badges />
      <span className={styles.spacer} />
      <Presets />
      <Clock />
      <a className={styles.link} href={`https://${REPO_URL}`} rel="noopener" target="_blank">GitHub</a>
      <button type="button" className={styles.menuBtn} aria-expanded={menuOpen} onClick={onMenu}>{menuOpen ? 'Menu ×' : 'Menu +'}</button>
    </header>
  )
}

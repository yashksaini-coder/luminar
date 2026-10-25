'use client'

import dynamic from 'next/dynamic'
import { useEffect, useState } from 'react'
import { autoPauseIfDue, fetchScenarios, initAutoGeo, runKey, seekTo } from '@/lib/actions'
import { getStatic } from '@/lib/api/client'
import { ws } from '@/lib/api/websocket'
import { actionForKey } from '@/lib/keys'
import { initPrefs } from '@/lib/prefs'
import { useStore } from '@/lib/store'
import type { Beat, ReelManifest } from '@/lib/types'
import CommandStrip from './CommandStrip'
import Inspector from './Inspector'
import KeyHelp from './KeyHelp'
import Legend from './Legend'
import LogRail from './LogRail'
import ModeSwitcher from './ModeSwitcher'
import Narrator from './Narrator'
import Provenance from './Provenance'
import styles from './SimApp.module.css'
import StatsRail from './StatsRail'
import Toasts from './Toasts'
import Toolbar from './Toolbar'

// Live: the caption re-announces the beat; reel: seek to it.
const onBeat = (b: Beat) => {
  const s = useStore.getState()
  if (s.reel) seekTo(b.time)
  else s.setCaption({ text: b.label, kind: b.kind === 'phase' ? 'phase' : 'narrator', at: b.time })
}

const DeckCanvas = dynamic(() => import('@/components/map/DeckCanvas'), { ssr: false })   // mounts Tooltip itself

export default function SimApp() {
  const inReel = useStore(s => s.reel !== null)
  const [overlayOpen, setOverlayOpen] = useState(false)   // the overlay itself lands in Task 3.11
  const [manifest, setManifest] = useState<ReelManifest>([])
  useEffect(() => {
    const stopPrefs = initPrefs()   // R5: data-stage and reduced motion apply before the first frame
    ws.connect()
    const stopAutoGeo = initAutoGeo()
    return () => { stopAutoGeo(); ws.disconnect(); stopPrefs() }
  }, [])
  useEffect(() => {
    void fetchScenarios()
    void getStatic<ReelManifest>('/reels/manifest.json').then(m => setManifest(m ?? []))
  }, [])
  useEffect(() => useStore.subscribe(s => s.simTime, () => autoPauseIfDue()), [])   // pause at the duration limit (R4)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as Element | null
      const inDialog = !!el?.closest?.('[role="dialog"]')
      const inMenu = inDialog || !!el?.closest?.('[role="menu"]')
      // Menus and dialogs own their keys (Review Focus 5); `?` still toggles the key help from inside a dialog.
      if (inMenu && e.key !== 'Escape' && !(inDialog && e.key === '?')) return
      if (e.key === 'Escape' && overlayOpen) { setOverlayOpen(false); return }   // no drawer: telemetry is badge-only
      const a = actionForKey(e); if (!a) return
      if (a.action === 'togglePlay') e.preventDefault()
      runKey(a.action, a.arg, manifest)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [manifest, overlayOpen])
  return (
    <div className={styles.shell} data-reel={inReel ? '' : undefined}>
      <Toolbar onMenu={() => setOverlayOpen(true)} />
      <aside data-rail="l" className={styles.railL}>
        <StatsRail onBeat={onBeat} />
      </aside>
      <main data-slot="canvas" className={styles.canvas}>
        <DeckCanvas />
        <ModeSwitcher />
        <Provenance />
        <Legend />
        <Narrator />
        <CommandStrip manifest={manifest} onDrawer={() => {}} />
        <Toasts />
        <KeyHelp />
      </main>
      <aside data-rail="r" className={styles.railR}>
        <LogRail />
        <Inspector />
      </aside>
    </div>
  )
}

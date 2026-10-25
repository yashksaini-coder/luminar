'use client'

import dynamic from 'next/dynamic'
import { useEffect, useRef, useState } from 'react'
import { autoPauseIfDue, bootSim, initAutoGeo, runKey, seekTo, teardownSim } from '@/lib/actions'
import { actionForKey } from '@/lib/keys'
import { initPrefs } from '@/lib/prefs'
import { useStore } from '@/lib/store'
import { REEL_MANIFEST } from '@/lib/reels'
import type { Beat, ReelMeta } from '@/lib/types'
import CommandStrip from './CommandStrip'
import Inspector from './Inspector'
import KeyHelp from './KeyHelp'
import Legend from './Legend'
import LogRail from './LogRail'
import { MenuOverlay } from './Menus'
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

/** Widths at or below this run the drawer shell: rails slide in, the inspector is a bottom sheet. */
export const SIM_BREAKPOINT = 1023
const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select,[tabindex]:not([tabindex="-1"])'

const DeckCanvas = dynamic(() => import('@/components/map/DeckCanvas'), { ssr: false })   // mounts Tooltip itself

export interface SimAppProps { reel?: ReelMeta | null }

export default function SimApp({ reel = null }: SimAppProps) {
  const inReel = useStore(s => s.reel !== null)
  const [overlayOpen, setOverlayOpen] = useState(false)
  const [drawer, setDrawer] = useState<'stats' | 'log' | null>(null)
  const railL = useRef<HTMLElement>(null)
  const railR = useRef<HTMLElement>(null)
  const shell = useRef<HTMLDivElement>(null)
  const manifest = REEL_MANIFEST
  useEffect(() => {
    const stopPrefs = initPrefs()   // R5: data-stage and reduced motion apply before the first frame
    const stopAutoGeo = initAutoGeo()
    return () => { stopAutoGeo(); stopPrefs() }
  }, [])
  useEffect(() => {   // reel → no socket, no API; live → socket + topology + scenarios (A.29)
    void bootSim({ reel, search: location.search })
    return teardownSim
  }, [reel?.name])   // eslint-disable-line react-hooks/exhaustive-deps -- a new reel name is a new boot; the meta object is static
  useEffect(() => useStore.subscribe(s => s.simTime, () => autoPauseIfDue()), [])
  useEffect(() => {   // back above the breakpoint the rails are inline again: drop drawer and overlay state
    const mq = matchMedia(`(max-width: ${SIM_BREAKPOINT}px)`)
    const onChange = () => { if (!mq.matches) { setDrawer(null); setOverlayOpen(false) } }
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  useEffect(() => {   // an open drawer takes focus and makes the rest of the shell inert, so aria-modal holds
    const rail = drawer === 'stats' ? railL.current : drawer === 'log' ? railR.current : null
    if (!rail || !shell.current) return
    const restore = inertExcept(shell.current, rail)
    ;(rail.querySelector<HTMLElement>(FOCUSABLE) ?? rail).focus()
    return restore
  }, [drawer])   // pause at the duration limit (R4)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as Element | null
      const inDialog = !!el?.closest?.('[role="dialog"]')
      const inMenu = inDialog || !!el?.closest?.('[role="menu"]')
      // Menus and dialogs own their keys (Review Focus 5); `?` still toggles the key help from inside a dialog.
      if (inMenu && e.key !== 'Escape' && !(inDialog && e.key === '?')) return
      if (e.key === 'Escape' && overlayOpen) { setOverlayOpen(false); return }
      if (e.key === 'Escape' && drawer) { setDrawer(null); return }
      const a = actionForKey(e); if (!a) return
      if (a.action === 'togglePlay') e.preventDefault()
      runKey(a.action, a.arg, manifest)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [manifest, overlayOpen, drawer])
  return (
    <div ref={shell} className={styles.shell} data-reel={inReel ? '' : undefined}>
      <Toolbar menuOpen={overlayOpen} onMenu={() => setOverlayOpen(o => !o)} />
      <aside ref={railL} data-rail="l" className={styles.railL} {...railProps(drawer === 'stats', 'Stats')}>
        <StatsRail onBeat={onBeat} />
      </aside>
      <main data-slot="canvas" className={styles.canvas}>
        <DeckCanvas />
        <ModeSwitcher />
        <Provenance />
        <Legend />
        <Narrator />
        <CommandStrip manifest={manifest} drawer={drawer} onDrawer={d => setDrawer(cur => (cur === d ? null : d))} />
        <Toasts />
        <KeyHelp />
      </main>
      {drawer && <button type="button" aria-label="Close panel" className={styles.scrim} onClick={() => setDrawer(null)} />}
      <aside ref={railR} data-rail="r" className={styles.railR} {...railProps(drawer === 'log', 'Log')}>
        <LogRail />
      </aside>
      {/* outside the rail so the bottom sheet is not trapped by the closed drawer's transform; on desktop it sits on the rail-r grid area */}
      <Inspector />
      <MenuOverlay open={overlayOpen} onClose={() => setOverlayOpen(false)} manifest={manifest} />
    </div>
  )
}

/** Sets `inert` on every child of `shell` except `open` and the scrim; returns the undo. */
export function inertExcept(shell: HTMLElement, open: HTMLElement): () => void {
  const others = [...shell.children].filter(el => el !== open && el.getAttribute('aria-label') !== 'Close panel')
  for (const el of others) el.setAttribute('inert', '')
  return () => { for (const el of others) el.removeAttribute('inert') }
}

// Drawer semantics only while open (≤1023 px); inline rails stay plain asides.
function railProps(open: boolean, label: string) {
  return open
    ? { 'data-open': 'true', role: 'dialog', 'aria-modal': true, 'aria-label': label, tabIndex: -1 }
    : {}
}

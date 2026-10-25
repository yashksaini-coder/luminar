'use client'

import dynamic from 'next/dynamic'
import { useEffect, useState } from 'react'
import { initAutoGeo } from '@/lib/actions'
import { ws } from '@/lib/api/websocket'
import { initPrefs } from '@/lib/prefs'
import { useStore } from '@/lib/store'
import ModeSwitcher from './ModeSwitcher'
import Provenance from './Provenance'
import styles from './SimApp.module.css'
import Toasts from './Toasts'
import Toolbar from './Toolbar'

const DeckCanvas = dynamic(() => import('@/components/map/DeckCanvas'), { ssr: false })   // mounts Tooltip itself

export default function SimApp() {
  const inReel = useStore(s => s.reel !== null)
  const [, setOverlayOpen] = useState(false)   // the overlay itself lands in Task 3.11; drawer + manifest state in Task 3.3
  useEffect(() => {
    const stopPrefs = initPrefs()   // R5: data-stage and reduced motion apply before the first frame
    ws.connect()
    const stopAutoGeo = initAutoGeo()
    return () => { stopAutoGeo(); ws.disconnect(); stopPrefs() }
  }, [])
  return (
    <div className={styles.shell} data-reel={inReel ? '' : undefined}>
      <Toolbar onMenu={() => setOverlayOpen(true)} />
      <aside data-rail="l" className={styles.railL} />
      <main data-slot="canvas" className={styles.canvas}>
        <DeckCanvas />
        <ModeSwitcher />
        <Provenance />
        <Toasts />
      </main>
      <aside data-rail="r" className={styles.railR} />
    </div>
  )
}

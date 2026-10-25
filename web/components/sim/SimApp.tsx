'use client'

import dynamic from 'next/dynamic'
import { useEffect } from 'react'
import { initAutoGeo } from '@/lib/actions'
import { ws } from '@/lib/api/websocket'
import { initPrefs } from '@/lib/prefs'
import ModeSwitcher from './ModeSwitcher'
import Toolbar from './Toolbar'

const DeckCanvas = dynamic(() => import('@/components/map/DeckCanvas'), { ssr: false })

export default function SimApp() {
  useEffect(() => {
    const stopPrefs = initPrefs()   // R5: data-stage and reduced motion apply before the first frame
    ws.connect()
    const stopAutoGeo = initAutoGeo()
    return () => { stopAutoGeo(); ws.disconnect(); stopPrefs() }
  }, [])
  return (
    <>
      <Toolbar />
      <main data-slot="canvas" style={{ position: 'relative', height: 'calc(100dvh - var(--toolbar-h))' }}>
        <DeckCanvas />
        <ModeSwitcher />
      </main>
    </>
  )
}

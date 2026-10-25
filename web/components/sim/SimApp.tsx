'use client'

import dynamic from 'next/dynamic'
import { useEffect } from 'react'
import { ws } from '@/lib/api/websocket'
import { initPrefs } from '@/lib/prefs'
import Toolbar from './Toolbar'

const DeckCanvas = dynamic(() => import('@/components/map/DeckCanvas'), { ssr: false })

export default function SimApp() {
  useEffect(() => {
    const stopPrefs = initPrefs()   // R5: data-stage and reduced motion apply before the first frame
    ws.connect()
    return () => { ws.disconnect(); stopPrefs() }
  }, [])
  return (
    <>
      <Toolbar />
      <main data-slot="canvas" style={{ height: 'calc(100dvh - var(--toolbar-h))' }}>
        <DeckCanvas />
      </main>
    </>
  )
}

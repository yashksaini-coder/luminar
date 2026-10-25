'use client'

import { useEffect } from 'react'
import { ws } from '@/lib/api/websocket'
import Toolbar from './Toolbar'

export default function SimApp() {
  useEffect(() => {
    ws.connect()
    return () => ws.disconnect()
  }, [])
  return (
    <>
      <Toolbar />
      <main data-slot="canvas" style={{ minHeight: 'calc(100dvh - var(--toolbar-h))' }} />
    </>
  )
}

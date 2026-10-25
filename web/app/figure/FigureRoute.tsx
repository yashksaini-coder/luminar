'use client'
// /figure/: the relay globe full-bleed; ?press= is forwarded so a scripted run plays unattended.
// A way back (B10) sits above the iframe; the dither skeleton covers it and aria-busy holds until the globe document loads.
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import FigureFrame from '@/components/landing/FigureFrame'

const INK = '#231e16'   // the globe's own ink on its paper (#f4f1e8); the page is paper whatever the theme

export default function FigureRoute() {
  const press = useSearchParams().get('press') ?? undefined
  const host = useRef<HTMLDivElement>(null)
  const [ready, setReady] = useState(false)
  useEffect(() => {   // load does not bubble; capture catches the iframe's without touching FigureFrame
    const el = host.current
    if (!el) return
    const on = () => setReady(true)
    el.addEventListener('load', on, true)
    return () => el.removeEventListener('load', on, true)
  }, [])
  return (
    <div ref={host} aria-busy={!ready || undefined}>
      <Link href="/" className="chev" style={{ position: 'fixed', top: 'var(--s-2)', left: 'var(--gutter)', zIndex: 2, padding: '0 var(--s-3)', color: INK, background: '#f4f1e8' }}>
        <span aria-hidden="true">←</span> Luminar
      </Link>
      {/* the iframe paints its own opaque paper before its document arrives, so the skeleton sits over it until load */}
      {!ready && <div className="skeleton" aria-hidden="true" style={{ position: 'fixed', inset: 0, zIndex: 1, pointerEvents: 'none' }} />}
      <FigureFrame fullBleed press={press} />
    </div>
  )
}

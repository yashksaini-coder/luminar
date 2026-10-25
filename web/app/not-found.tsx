// Branded 404 (landing-page-design B10): the landing nav and footer around one sentence and the two routes.
import Link from 'next/link'
import Footer from '@/components/landing/Footer'
import Nav from '@/components/landing/Nav'
import type { PlateFrames } from '@/components/landing/plate-draw'
import cards from '@/lib/reel-cards.json'
import { REEL_MANIFEST } from '@/lib/reels'

export const metadata = { title: 'Not found' }

export default function NotFound() {
  return (
    <>
      <Nav reels={REEL_MANIFEST} cards={cards as unknown as Record<string, PlateFrames>} />
      <main id="main" style={{ padding: 'var(--s-16) var(--gutter)', minHeight: '60dvh' }}>
        <div style={{ maxWidth: 'var(--col-prose)' }}>
          <h1 className="t-display">Not <em>found</em></h1>
          <p className="t-ui" style={{ margin: 'var(--s-4) 0 var(--s-8)' }}>There is no page at this address.</p>
          <p style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 'var(--s-4) var(--s-6)' }}>
            <Link href="/" className="btn btn-primary" style={{ display: 'inline-flex', alignItems: 'center', minHeight: 44 }}>Back to Luminar</Link>
            <Link href="/sim/" className="chev">Open the simulator <span aria-hidden="true">›</span></Link>
          </p>
        </div>
      </main>
      <Footer />
    </>
  )
}

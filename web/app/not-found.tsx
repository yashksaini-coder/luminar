// Branded 404 in the v2 look: the grid frame, the landing nav and footer, and one grid row with the message on
// the hatch beside a PixelField split (the address is partitioned off from the network). The buttons reuse
// the hero's primary and ghost classes so the two pages share one CTA style.
import Link from 'next/link'
import GridFrame from '@/components/fx/GridFrame'
import PixelField from '@/components/fx/PixelField'
import Footer from '@/components/landing/Footer'
import hero from '@/components/landing/Hero.module.css'
import Nav from '@/components/landing/Nav'
import type { PlateFrames } from '@/components/landing/plate-draw'
import cards from '@/lib/reel-cards.json'
import { REEL_MANIFEST } from '@/lib/reels'
import styles from './not-found.module.css'

export const metadata = { title: 'Not found' }

export default function NotFound() {
  return (
    <>
      <a href="#main" className="skip">Skip to content</a>
      <GridFrame>
        <Nav reels={REEL_MANIFEST} cards={cards as unknown as Record<string, PlateFrames>} />
        <main id="main" className={styles.main}>
          <div className={styles.cells} data-grid="">
            <div className={styles.copy}>
              <p className={styles.code}>Error 404 · no route to peer</p>
              <h1 className={styles.h1}>Not found</h1>
              <p className={styles.lead}>There is no page at this address. It may have moved, or the link was cut off on the way here.</p>
              <div className={styles.ctas}>
                <Link className={hero.primary} href="/">Back to Luminar</Link>
                <a className={hero.ghost} href="/sim/">Open the simulator</a>
              </div>
            </div>
            <div className={styles.visual}>
              <PixelField preset="split" tint="paper" accent="flame" cell={8} speed={0.7} className={styles.field}
                aria-label="A field of peers split down the middle by a gap no message crosses" />
              <p className={styles.chip}>Partitioned · 0 routes</p>
            </div>
          </div>
        </main>
        <Footer />
      </GridFrame>
    </>
  )
}

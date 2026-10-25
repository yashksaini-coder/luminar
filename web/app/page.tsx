import DitherImage from '@/components/dither/DitherImage'
import Figure from '@/components/dither/Figure'
import Hero from '@/components/landing/Hero'
import type { PlateFrames } from '@/components/landing/plate-draw'
import Nav from '@/components/landing/Nav'
import Readouts from '@/components/landing/Readouts'
import { WhatItDoes } from '@/components/landing/Sections'
import cards from '@/lib/reel-cards.json'
import { REEL_MANIFEST } from '@/lib/reels'

export default function Home() {
  return (
    <>
    <Nav reels={REEL_MANIFEST} cards={cards as unknown as Record<string, PlateFrames>} />
    <main>
      <Hero />
      <Readouts />
      <WhatItDoes />
      <div style={{ padding: 'var(--gutter, 16px)' }}>
        <Figure n={0} caption="dither check">
          <DitherImage src="/stills/grafana.png" alt="Grafana dashboard with the gossipsub_* series" depth={0.6} loupe />
        </Figure>
      </div>
    </main>
    </>
  )
}

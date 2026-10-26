import Faq from '@/components/landing/Faq'
import Features from '@/components/landing/Features'
import FigurePlate from '@/components/landing/FigurePlate'
import FinalCta from '@/components/landing/FinalCta'
import Footer from '@/components/landing/Footer'
import Hero from '@/components/landing/Hero'
import type { PlateFrames } from '@/components/landing/plate-draw'
import Nav from '@/components/landing/Nav'
import Readouts from '@/components/landing/Readouts'
import { LiveMainnet, SameNames } from '@/components/landing/Sections'
import Tagline from '@/components/landing/Tagline'
import VideoPlate from '@/components/landing/VideoPlate'
import ReelRedirect from '@/components/sim/ReelRedirect'
import cards from '@/lib/reel-cards.json'
import { REEL_MANIFEST } from '@/lib/reels'

export default function Home() {
  return (
    <>
    <ReelRedirect />
    <a href="#main" className="skip">Skip to content</a>
    <Nav reels={REEL_MANIFEST} cards={cards as unknown as Record<string, PlateFrames>} />
    <main id="main">
      <Hero />
      <Readouts />
      <Tagline />
      <Features />
      <FigurePlate />
      <VideoPlate />
      <SameNames />
      <LiveMainnet />
      <Faq />
      <FinalCta />
    </main>
    <Footer />
    </>
  )
}

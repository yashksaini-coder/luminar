import FigurePlate from '@/components/landing/FigurePlate'
import Footer from '@/components/landing/Footer'
import Hero from '@/components/landing/Hero'
import type { PlateFrames } from '@/components/landing/plate-draw'
import Nav from '@/components/landing/Nav'
import Readouts from '@/components/landing/Readouts'
import { LiveMainnet, SameNames, WhatItDoes } from '@/components/landing/Sections'
import VideoPlate from '@/components/landing/VideoPlate'
import cards from '@/lib/reel-cards.json'
import { REEL_MANIFEST } from '@/lib/reels'

export default function Home() {
  return (
    <>
    {/* ReelRedirect slot (phase 4, spec §4.8): `<ReelRedirect />` goes here, first, before <Nav/> */}
    <Nav reels={REEL_MANIFEST} cards={cards as unknown as Record<string, PlateFrames>} />
    <main>
      <Hero />
      <Readouts />
      <WhatItDoes />
      <FigurePlate />
      <VideoPlate />
      <SameNames />
      <LiveMainnet />
    </main>
    <Footer />
    </>
  )
}

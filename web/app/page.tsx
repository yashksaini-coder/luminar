import GridFrame from '@/components/fx/GridFrame'
import AttackExplorer from '@/components/landing/AttackExplorer'
import Faithfulness from '@/components/landing/Faithfulness'
import Faq from '@/components/landing/Faq'
import Features from '@/components/landing/Features'
import FigurePlate from '@/components/landing/FigurePlate'
import Footer from '@/components/landing/Footer'
import Hero from '@/components/landing/Hero'
import HowItWorks from '@/components/landing/HowItWorks'
import MainnetCard from '@/components/landing/MainnetCard'
import type { PlateFrames } from '@/components/landing/plate-draw'
import Nav from '@/components/landing/Nav'
import Observability from '@/components/landing/Observability'
import QuickStart from '@/components/landing/QuickStart'
import VideoPlate from '@/components/landing/VideoPlate'
import ReelRedirect from '@/components/sim/ReelRedirect'
import cards from '@/lib/reel-cards.json'
import { REEL_MANIFEST } from '@/lib/reels'

export default function Home() {
  return (
    <>
    <ReelRedirect />
    <a href="#main" className="skip">Skip to content</a>
    <GridFrame>
    <Nav reels={REEL_MANIFEST} cards={cards as unknown as Record<string, PlateFrames>} />
    <main id="main">
      <Hero />
      <Features />
      <HowItWorks />
      <AttackExplorer />
      <FigurePlate />
      <VideoPlate />
      <Observability />
      <MainnetCard />
      <Faithfulness />
      <QuickStart />
      <Faq />
    </main>
    <Footer />
    </GridFrame>
    </>
  )
}

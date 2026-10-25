import type { Metadata } from 'next'
import ReelRedirect from '@/components/sim/ReelRedirect'
import SimApp from '@/components/sim/SimApp'

// R15: bare title; the layout template appends ' · Luminar'
export const metadata: Metadata = { title: 'Simulator' }

export default function SimPage() {
  return (
    <>
      <ReelRedirect />
      <SimApp />
    </>
  )
}

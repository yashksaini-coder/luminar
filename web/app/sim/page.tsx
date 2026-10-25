import type { Metadata } from 'next'
import SimApp from '@/components/sim/SimApp'

// R15: bare title; the layout template appends ' · Luminar'
export const metadata: Metadata = { title: 'Simulator' }

export default function SimPage() {
  return <SimApp />
}

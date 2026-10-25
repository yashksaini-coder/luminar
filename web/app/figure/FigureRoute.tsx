'use client'
// /figure/: the relay globe full-bleed; ?press= is forwarded so a scripted run plays unattended.
import { useSearchParams } from 'next/navigation'
import FigureFrame from '@/components/landing/FigureFrame'

export default function FigureRoute() {
  const press = useSearchParams().get('press') ?? undefined
  return <FigureFrame fullBleed press={press} />
}

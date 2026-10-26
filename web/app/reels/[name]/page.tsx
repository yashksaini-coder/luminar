import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import SimApp from '@/components/sim/SimApp'
import { REEL_MANIFEST } from '@/lib/reels'

// The only dynamic route: one static page per manifest entry, anything else 404s (spec §4.2).
export const dynamicParams = false

export function generateStaticParams() { return REEL_MANIFEST.map(r => ({ name: r.name })) }

const find = (name: string) => REEL_MANIFEST.find(r => r.name === name)

// R15: bare title; the layout template appends ' · Luminar'
export async function generateMetadata({ params }: { params: Promise<{ name: string }> }): Promise<Metadata> {
  const meta = find((await params).name)
  return meta ? { title: meta.title, description: meta.blurb } : {}
}

export default async function ReelPage({ params }: { params: Promise<{ name: string }> }) {
  const meta = find((await params).name)
  if (!meta) notFound()
  return <SimApp reel={meta} />
}

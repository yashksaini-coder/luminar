'use client'
// Mounts the section reveal (lib/reveal.ts) once per route; renders nothing.
import { usePathname } from 'next/navigation'
import { useEffect } from 'react'
import { attachReveal } from '@/lib/reveal'

export default function Reveal() {
  const path = usePathname()
  useEffect(() => attachReveal(), [path])
  return null
}

'use client'

/** Old `?reel=<name>` links land on `/reels/<name>/` (spec §4.8); renders nothing. */

import { useEffect } from 'react'
import { redirectTarget } from '@/lib/reels'

export default function ReelRedirect() {
  useEffect(() => {
    const to = redirectTarget(location.search)
    if (to) location.replace(to)
  }, [])
  return null
}

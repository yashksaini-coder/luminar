/** Loads a reel from public/ once per module (Studio re-renders reuse it) and holds the render until parsed. */
import { useEffect, useState } from 'react'
import { cancelRender, continueRender, delayRender, staticFile } from 'remotion'
import { type ReelData, parseReel } from './parse'

const cache: Record<string, Promise<ReelData>> = {}

export function useReel(reel: string): ReelData | null {
  const [data, setData] = useState<ReelData | null>(null)
  useEffect(() => {
    const handle = delayRender(`reel ${reel}`)
    cache[reel] ??= fetch(staticFile(reel)).then(r => {
      if (!r.ok) throw new Error(`reel ${reel}: HTTP ${r.status}`)
      return r.text()
    }).then(parseReel)
    let live = true
    cache[reel].then(d => { if (live) setData(d); continueRender(handle) }, err => cancelRender(err))
    return () => { live = false; continueRender(handle) }
  }, [reel])
  return data
}

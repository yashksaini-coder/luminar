/** Loads a public/ image once per module and holds the render until it has decoded. */
import { useEffect, useState } from 'react'
import { cancelRender, continueRender, delayRender, staticFile } from 'remotion'

const cache: Record<string, Promise<HTMLImageElement>> = {}

export function useImage(src: string): HTMLImageElement | null {
  const [img, setImg] = useState<HTMLImageElement | null>(null)
  useEffect(() => {
    const handle = delayRender(`image ${src}`)
    cache[src] ??= new Promise((resolve, reject) => {
      const i = new Image()
      i.onload = () => resolve(i)
      i.onerror = () => reject(new Error(`image ${src} failed to load`))
      i.src = staticFile(src)
    })
    let live = true
    cache[src].then(i => { if (live) setImg(i); continueRender(handle) }, err => cancelRender(err))
    return () => { live = false; continueRender(handle) }
  }, [src])
  return img
}

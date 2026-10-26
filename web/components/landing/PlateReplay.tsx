'use client'
// Fig. 1: the live dithered replay of the sybil-eclipse reel (spec §7.4). The base is dithered;
// attackers, readouts and the stamp stay crisp. It keeps playing under the pointer (no loupe: the simulator is never
// shown un-dithered on hover); paused on keyboard focus or off screen.
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import Diamond from '@/components/dither/Diamond'
import DitherCanvas from '@/components/dither/DitherCanvas'
import HaloRing from '@/components/dither/HaloRing'
import Stamp from '@/components/dither/Stamp'
import { FIG1 } from '@/lib/copy'
import { reducedMotion } from '@/lib/prefs'
import { drawPlateFrame, frameIndexAt, PLATE_FPS, type PlateFrames, STILL_T } from './plate-draw'
import styles from './PlateReplay.module.css'

function subscribeMotion(cb: () => void): () => void {
  const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)')
  mq?.addEventListener('change', cb)
  return () => mq?.removeEventListener('change', cb)
}

export interface PlateReplayProps { plate: PlateFrames; className?: string }

export default function PlateReplay({ plate, className }: PlateReplayProps) {
  const root = useRef<HTMLDivElement>(null)
  const overlay = useRef<HTMLCanvasElement>(null)
  const stillIdx = frameIndexAt(plate, STILL_T)
  const idx = useRef(stillIdx)   // SSR and first paint show the still frame, so server markup is deterministic
  const [view, setView] = useState(stillIdx)   // 2 Hz mirror for the text only
  const still = useSyncExternalStore(subscribeMotion, reducedMotion, () => false)
  const [focus, setFocus] = useState(false)
  const [final, setFinal] = useState<ImageData | null>(null)
  const [offscreen, setOffscreen] = useState(false)
  const paused = focus || offscreen

  useEffect(() => {   // the story clock stops while the plate is out of the viewport (design-to-motion website rules)
    const el = root.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(([e]) => setOffscreen(!e.isIntersecting), { threshold: 0 })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  useEffect(() => { idx.current = still ? stillIdx : 0 }, [still, stillIdx])   // animated runs start at T+8 once revealed
  const onFinal = useCallback((img: ImageData) => { setFinal(img); setView(idx.current) }, [])

  const revealed = final !== null   // a boolean dep: each loop redraw sets a new final and must not restart the timer
  useEffect(() => {
    if (still || paused || !revealed) return
    // advances only; the text follows in onFinal, right after the canvas paints idx, so readout and frame never disagree
    const id = setInterval(() => { idx.current = (idx.current + 1) % plate.frames.length }, 1000 / PLATE_FPS)
    return () => clearInterval(id)
  }, [still, paused, revealed, plate])

  const drawBase = useCallback((ctx: CanvasRenderingContext2D, w: number, h: number) => {
    drawPlateFrame(ctx, plate, idx.current, w, h, 'base')
    const o = overlay.current
    const octx = o?.getContext('2d')
    if (o && octx) {
      const dpr = devicePixelRatio || 1
      o.width = Math.round(w * dpr); o.height = Math.round(h * dpr)
      octx.setTransform(dpr, 0, 0, dpr, 0, 0)
      drawPlateFrame(octx, plate, idx.current, w, h, 'attackers')
    }
  }, [plate])

  const f = plate.frames[view]
  return (
    <div
      ref={root}
      className={className ? `${styles.replay} ${className}` : styles.replay}
      tabIndex={0}
      role="group"
      aria-label={FIG1}
      onFocus={() => setFocus(true)} onBlur={() => setFocus(false)}
    >
      <HaloRing size={120} band={2} depth={0.35} className={styles.halo} />
      <div className={styles.canvasWrap} data-depth={0.6}>
        <DitherCanvas source={drawBase} loop={still ? undefined : { fps: PLATE_FPS, paused }} reveal onFinal={onFinal} aria-label={FIG1} />
        <canvas ref={overlay} className={styles.overlay} aria-hidden="true" />
      </div>
      <Diamond size={28} depth={0.2} className={styles.diamond} label="attacker" />
      <dl className={styles.readout} data-depth={0.8}>
        <dt>PEERS</dt><dd>{f.r.peers}</dd>
        <dt>SYBIL</dt><dd>{f.r.sybil}</dd>
        <dt>PRUNED</dt><dd>{f.r.pruned}</dd>
        <dt>T+</dt><dd>{f.t.toFixed(1)}s</dd>
      </dl>
      <Stamp depth={1.2} className={f.stamp ? styles.stamp : `${styles.stamp} ${styles.blank}`}>{f.stamp}</Stamp>
    </div>
  )
}

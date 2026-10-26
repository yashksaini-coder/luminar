'use client'

import { useEffect, useRef, useState } from 'react'
import CanvasReveal from '@/components/sim/CanvasReveal'
import Tooltip from '@/components/sim/Tooltip'
import { destroyRenderer, initRenderer, resizeRenderer, setBackendFailureHandler, fallBackToCanvas2D } from './renderer'

let contextLosses = 0   // per page: a GPU that keeps dropping contexts gets the Canvas 2D backend
import styles from './DeckCanvas.module.css'

/** The mesh canvas: React owns the elements, the renderer module owns everything drawn on them. */
export default function DeckCanvas({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const tipRef = useRef<HTMLDivElement>(null)
  // Chrome drops WebGL contexts under GPU pressure (many tabs) and deck.gl does not recover: the canvas stays
  // black while data keeps flowing. A lost context remounts a fresh <canvas> (new key) with a new renderer.
  const [gen, setGen] = useState(0)
  useEffect(() => {
    const canvas = canvasRef.current!
    initRenderer(canvas, tipRef.current)
    const ro = new ResizeObserver(([e]) => resizeRenderer(e.contentRect.width, e.contentRect.height))
    ro.observe(canvas.parentElement!)
    const lost = (e: Event) => {
      e.preventDefault()
      if (++contextLosses >= 2) fallBackToCanvas2D()
      setGen(g => g + 1)
    }
    canvas.addEventListener('webglcontextlost', lost)
    setBackendFailureHandler(() => setGen(g => g + 1))   // deck.gl could not create a context: remount on Canvas 2D
    return () => { canvas.removeEventListener('webglcontextlost', lost); setBackendFailureHandler(null); ro.disconnect(); destroyRenderer() }
  }, [gen])
  return (
    <div className={className ? `${className} ${styles.field}` : styles.field}>
      <canvas key={gen} ref={canvasRef} className={styles.canvas} />
      <CanvasReveal />
      <div ref={tipRef} role="tooltip" className={styles.tip}><Tooltip /></div>
    </div>
  )
}

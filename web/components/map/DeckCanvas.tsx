'use client'

import { useEffect, useRef } from 'react'
import CanvasReveal from '@/components/sim/CanvasReveal'
import Tooltip from '@/components/sim/Tooltip'
import { destroyRenderer, initRenderer, resizeRenderer } from './renderer'
import styles from './DeckCanvas.module.css'

/** The mesh canvas: React owns the elements, the renderer module owns everything drawn on them. */
export default function DeckCanvas({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const tipRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const canvas = canvasRef.current!
    initRenderer(canvas, tipRef.current)
    const ro = new ResizeObserver(([e]) => resizeRenderer(e.contentRect.width, e.contentRect.height))
    ro.observe(canvas.parentElement!)
    return () => { ro.disconnect(); destroyRenderer() }
  }, [])
  return (
    <div className={className ? `${className} ${styles.field}` : styles.field}>
      <canvas ref={canvasRef} className={styles.canvas} />
      <CanvasReveal />
      <div ref={tipRef} role="tooltip" className={styles.tip}><Tooltip /></div>
    </div>
  )
}

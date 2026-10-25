'use client'
// First-snapshot reveal over the mesh canvas: paper discs at the real node positions resolve 28 → --cell-mesh,
// then the overlay unmounts and the deck.gl frame shows through (spec §7 loading states).
import { useEffect, useState } from 'react'
import DitherCanvas from '@/components/dither/DitherCanvas'
import { REVEAL_STEP_MS, revealSteps } from '@/components/dither/dither'
import { nodeRadiusPx } from '@/components/map/geometry'
import { getViewState, visiblePositions } from '@/components/map/renderer'
import { reducedMotion } from '@/lib/prefs'
import { useStore } from '@/lib/store'
import styles from './CanvasReveal.module.css'

type Phase = 'idle' | 'revealing' | 'done'

function cellMesh(): number {
  return parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--cell-mesh')) || 2
}

/** Pitch field with one paper disc per visible node, projected through the deck's current orthographic view (flipY: false). */
function draw(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const { nodes, layoutMode, scale } = useStore.getState()
  const vs = getViewState() as { target?: number[]; zoom?: number } | null
  const [tx, ty] = vs?.target ?? [0, 0]
  const k = 2 ** (vs?.zoom ?? 0)
  const r = nodeRadiusPx(nodes.length, layoutMode, scale.node)
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, w, h)
  ctx.fillStyle = '#fff'
  for (const [x, y] of visiblePositions().values()) {
    ctx.beginPath(); ctx.arc(w / 2 + (x - tx) * k, h / 2 - (y - ty) * k, r, 0, 2 * Math.PI); ctx.fill()
  }
}

export default function CanvasReveal() {
  const n = useStore(s => s.nodes.length)
  const [phase, setPhase] = useState<Phase>('idle')
  const [cell, setCell] = useState(2)

  if (phase === 'idle' && n > 0) {   // the 0 → n transition, adjusted during render; never arms under reduced motion
    if (reducedMotion()) setPhase('done')
    else { setCell(cellMesh()); setPhase('revealing') }
  }

  useEffect(() => {
    if (phase !== 'revealing') return
    const t = setTimeout(() => setPhase('done'), revealSteps(cell).length * REVEAL_STEP_MS)   // R12: own timer, not onFinal
    return () => clearTimeout(t)
  }, [phase, cell])

  if (phase !== 'revealing') return null
  return (
    <div data-mesh-reveal className={styles.reveal}>
      <DitherCanvas source={draw} cell={cell} reveal aria-label="mesh loading" />
    </div>
  )
}

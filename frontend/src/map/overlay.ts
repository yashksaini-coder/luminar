import { store } from '../store'
import { chrome } from '../palette'

let ctx: CanvasRenderingContext2D | null = null
let overlayCanvas: HTMLCanvasElement | null = null

export function initOverlay(canvas: HTMLCanvasElement) {
  overlayCanvas = canvas
  ctx = canvas.getContext('2d')!
}

export function resizeOverlay() {
  if (!overlayCanvas || !ctx) return
  const dpr = window.devicePixelRatio || 1
  const w = overlayCanvas.clientWidth
  const h = overlayCanvas.clientHeight
  overlayCanvas.width = Math.round(w * dpr)
  overlayCanvas.height = Math.round(h * dpr)
}

export function drawOverlay(screenProject: (worldPos: [number, number]) => [number, number]) {
  if (!ctx || !overlayCanvas) return

  const dpr = window.devicePixelRatio || 1
  const w = overlayCanvas.clientWidth
  const h = overlayCanvas.clientHeight

  ctx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height)
  ctx.save()
  ctx.scale(dpr, dpr)

  const { nodes, nodePositions } = store
  const n = nodes.length
  const nodeRadius = Math.max(3, Math.min(8, 200 / Math.sqrt(n)))

  // Node index labels
  if (store.showLabels) {
    ctx.font = '10px "JetBrains Mono", monospace'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    ctx.fillStyle = chrome.text3.css

    for (let i = 0; i < n; i++) {
      if (!nodePositions[i]) continue
      const [sx, sy] = screenProject(nodePositions[i])
      if (sx < -20 || sx > w + 20 || sy < -20 || sy > h + 20) continue
      ctx.fillText(String(nodes[i].index), sx, sy + nodeRadius + 3)
    }
  }

  ctx.restore()
}

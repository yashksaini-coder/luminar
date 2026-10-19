/**
 * 2D overlay canvas above the deck.gl map. Node labels moved to a deck TextLayer
 * (renderer.ts); this keeps the canvas sized for anything else that wants to draw on it.
 */
let ctx: CanvasRenderingContext2D | null = null
let overlayCanvas: HTMLCanvasElement | null = null

export function initOverlay(canvas: HTMLCanvasElement) {
  overlayCanvas = canvas
  ctx = canvas.getContext('2d')!
}

export function resizeOverlay() {
  if (!overlayCanvas || !ctx) return
  const dpr = window.devicePixelRatio || 1
  overlayCanvas.width = Math.round(overlayCanvas.clientWidth * dpr)
  overlayCanvas.height = Math.round(overlayCanvas.clientHeight * dpr)
}

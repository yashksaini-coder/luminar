/** View maths for the video: fit the honest mesh into a box, then scale about a focus peer. */
import type { ReelData } from '../reel/parse'

export interface Box { x: number; y: number; w: number; h: number }
/** scale 1 = whole mesh fits the box with pad; focus = peer id the scale is about (default: box centre). */
export interface Camera { scale: number; focus?: string }
export type Projector = (x: number, y: number) => [number, number]

export function makeProjector(d: ReelData, box: Box, cam: Camera, pad = 40): Projector {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const n of d.nodes) {
    if (n.attacker) continue
    x0 = Math.min(x0, n.x); x1 = Math.max(x1, n.x)
    y0 = Math.min(y0, n.y); y1 = Math.max(y1, n.y)
  }
  const k = Math.min((box.w - 2 * pad) / Math.max(x1 - x0, 1e-9), (box.h - 2 * pad) / Math.max(y1 - y0, 1e-9))
  const ox = box.x + box.w / 2 - ((x0 + x1) / 2) * k
  const oy = box.y + box.h / 2 - ((y0 + y1) / 2) * k
  const fit = (x: number, y: number): [number, number] => [ox + x * k, oy + y * k]
  const f = cam.focus ? d.byId.get(cam.focus) : undefined
  const [cx, cy] = f ? fit(f.x, f.y) : [box.x + box.w / 2, box.y + box.h / 2]
  const s = cam.scale
  return (x, y) => {
    const [px, py] = fit(x, y)
    return [cx + (px - cx) * s, cy + (py - cy) * s]
  }
}

/** Scale lerps; focus switches at t >= .5. */
export function lerpCamera(a: Camera, b: Camera, t: number): Camera {
  return { scale: a.scale + (b.scale - a.scale) * t, focus: t >= 0.5 ? b.focus : a.focus }
}

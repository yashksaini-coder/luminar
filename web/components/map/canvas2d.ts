/** Canvas 2D backend for the mesh renderer, used when the browser has no WebGL (hardware acceleration off,
 *  GPU blocklisted, context lost twice). It takes the same deck.gl layer objects renderer.ts builds and draws
 *  their props with 2D primitives, so every drawing decision stays in renderer.ts. Layers are never initialised
 *  by deck here: they are prop holders, which is all a deck.gl Layer is until a Deck attaches it to a GPU device. */

import type { Layer } from '@deck.gl/core'
import { IconLayer, LineLayer, PathLayer, PolygonLayer, ScatterplotLayer, TextLayer } from '@deck.gl/layers'

type Pos = [number, number]
type RGBA = number[]
// deck's accessors: a constant or a function of (datum, {index}).
type Acc<T> = T | ((d: unknown, info: { index: number }) => T)
const val = <T>(a: Acc<T> | undefined, d: unknown, i: number, dflt: T): T =>
  a === undefined ? dflt : typeof a === 'function' ? (a as (d: unknown, info: { index: number }) => T)(d, { index: i }) : a

export interface View { target: Pos; zoom: number }
export interface PickInfo { object?: unknown; x: number; y: number; picked: boolean; layer?: Layer | null }

/** OrthographicView with flipY: false (y up), the same projection deck uses for this renderer. */
export function project(v: View, w: number, h: number, [x, y]: Pos): Pos {
  const k = 2 ** v.zoom
  return [w / 2 + (x - v.target[0]) * k, h / 2 - (y - v.target[1]) * k]
}
export function unproject(v: View, w: number, h: number, [sx, sy]: Pos): Pos {
  const k = 2 ** v.zoom
  return [v.target[0] + (sx - w / 2) / k, v.target[1] - (sy - h / 2) / k]
}
/** Zoom about a screen point: the world point under the cursor stays put. */
export function zoomAbout(v: View, w: number, h: number, at: Pos, zoom: number): View {
  const before = unproject(v, w, h, at)
  const next: View = { target: v.target, zoom }
  const after = unproject(next, w, h, at)
  return { target: [v.target[0] + before[0] - after[0], v.target[1] + before[1] - after[1]], zoom }
}

const rgba = (c: RGBA) => `rgba(${c[0]},${c[1]},${c[2]},${(c[3] ?? 255) / 255})`
const ZOOM_MIN = -6, ZOOM_MAX = 8, DRAG_PX = 4, PICK_MIN_PX = 6

interface DeckProps {
  canvas: HTMLCanvasElement
  initialViewState?: Partial<View> & { transitionDuration?: number; fitSeq?: number }
  layers?: Layer[]
  width?: number
  height?: number
  getCursor?: (s: { isHovering: boolean }) => string
  onClick?: (info: PickInfo) => void
  onViewStateChange?: (p: { viewState: View }) => void
  [k: string]: unknown
}

export class Canvas2DDeck {
  private props: DeckProps
  private ctx: CanvasRenderingContext2D | null
  private view: View = { target: [0, 0], zoom: 0 }
  private from: View | null = null
  private to: View | null = null
  private tStart = 0
  private tDur = 0
  private raf = 0
  private lastInitial: unknown = null
  private tints = new Map<string, HTMLCanvasElement>()
  private patterns = new Map<string, CanvasPattern | null>()
  private drag: { x: number; y: number; moved: boolean; view: View } | null = null
  private hovered: unknown = null
  private off: () => void

  constructor(props: DeckProps) {
    this.props = props
    this.ctx = props.canvas.getContext('2d')
    if (props.initialViewState) this.applyInitial(props.initialViewState, true)
    this.off = this.listen(props.canvas)
    this.schedule()
  }

  setProps(p: Partial<DeckProps>): void {
    this.props = { ...this.props, ...p }
    if (p.initialViewState) this.applyInitial(p.initialViewState, false)
    this.schedule()
  }

  finalize(): void {
    cancelAnimationFrame(this.raf)
    this.off()
    this.ctx = null
  }

  /** The shape renderer.getViewState() and CanvasReveal read. */
  get viewManager() {
    const w = this.width(), h = this.height(), v = this.view
    return { getViewports: () => [{ target: [v.target[0], v.target[1], 0], zoom: v.zoom, width: w, height: h, project: (p: Pos) => project(v, w, h, p) }] }
  }

  private width() { return this.props.width || this.props.canvas.clientWidth || 1 }
  private height() { return this.props.height || this.props.canvas.clientHeight || 1 }

  private applyInitial(iv: NonNullable<DeckProps['initialViewState']>, first: boolean): void {
    if (iv === this.lastInitial) return
    this.lastInitial = iv
    const next: View = { target: [iv.target?.[0] ?? 0, iv.target?.[1] ?? 0], zoom: iv.zoom ?? 0 }
    const dur = first ? 0 : iv.transitionDuration ?? 0
    if (dur > 0) { this.from = this.view; this.to = next; this.tStart = performance.now(); this.tDur = dur }
    else { this.from = this.to = null; this.setView(next) }
  }

  private setView(v: View): void {
    this.view = v
    this.props.onViewStateChange?.({ viewState: v })
  }

  private schedule(): void {
    if (!this.raf) this.raf = requestAnimationFrame(() => { this.raf = 0; this.draw() })
  }

  private draw(): void {
    const ctx = this.ctx
    if (!ctx) return
    if (this.from && this.to) {   // fit transition: ease-out cubic, like deck's default interpolation curve
      const t = Math.min(1, (performance.now() - this.tStart) / this.tDur), e = 1 - (1 - t) ** 3
      const a = this.from, b = this.to
      this.setView({ target: [a.target[0] + (b.target[0] - a.target[0]) * e, a.target[1] + (b.target[1] - a.target[1]) * e], zoom: a.zoom + (b.zoom - a.zoom) * e })
      if (t < 1) this.schedule(); else this.from = this.to = null
    }
    const w = this.width(), h = this.height()
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const c = this.props.canvas
    if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr) }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, w, h)
    ctx.imageSmoothingEnabled = false
    const P = (p: Pos) => project(this.view, w, h, p)
    for (const layer of this.props.layers ?? []) {
      const lp = layer.props as unknown as Record<string, unknown>
      const data = (lp.data as unknown[]) ?? []
      if (!data.length) continue
      ctx.save()
      if (layer instanceof PolygonLayer) this.polygons(ctx, lp, data, P)
      else if (layer instanceof PathLayer) this.paths(ctx, lp, data, P)
      else if (layer instanceof LineLayer) this.lines(ctx, lp, data, P)
      else if (layer instanceof ScatterplotLayer) this.dots(ctx, lp, data, P)
      else if (layer instanceof TextLayer) this.texts(ctx, lp, data, P)
      else if (layer instanceof IconLayer) this.icons(ctx, lp, data, P)
      ctx.restore()
    }
  }

  private paths(ctx: CanvasRenderingContext2D, lp: Record<string, unknown>, data: unknown[], P: (p: Pos) => Pos): void {
    const dash = lp.getDashArray as Acc<number[]> | undefined
    data.forEach((d, i) => {
      const pts = val(lp.getPath as Acc<Pos[]>, d, i, [])
      if (pts.length < 2) return
      const width = val(lp.getWidth as Acc<number>, d, i, 1)
      ctx.lineWidth = width
      ctx.strokeStyle = rgba(val(lp.getColor as Acc<RGBA>, d, i, [0, 0, 0, 255]))
      const da = dash ? val(dash, d, i, [0, 0]) : null
      ctx.setLineDash(da && da[0] ? da.map(v => v * width) : [])   // deck dash lengths are multiples of the width
      ctx.beginPath()
      pts.forEach((p, j) => { const [x, y] = P(p); if (j) ctx.lineTo(x, y); else ctx.moveTo(x, y) })
      ctx.stroke()
    })
  }

  private lines(ctx: CanvasRenderingContext2D, lp: Record<string, unknown>, data: unknown[], P: (p: Pos) => Pos): void {
    data.forEach((d, i) => {
      const [x0, y0] = P(val(lp.getSourcePosition as Acc<Pos>, d, i, [0, 0]))
      const [x1, y1] = P(val(lp.getTargetPosition as Acc<Pos>, d, i, [0, 0]))
      ctx.lineWidth = Math.max(val(lp.getWidth as Acc<number>, d, i, 1), (lp.widthMinPixels as number) ?? 0)
      ctx.strokeStyle = rgba(val(lp.getColor as Acc<RGBA>, d, i, [0, 0, 0, 255]))
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke()
    })
  }

  private dots(ctx: CanvasRenderingContext2D, lp: Record<string, unknown>, data: unknown[], P: (p: Pos) => Pos): void {
    const filled = lp.filled !== false, stroked = !!lp.stroked
    data.forEach((d, i) => {
      const [x, y] = P(val(lp.getPosition as Acc<Pos>, d, i, [0, 0]))
      const r = val(lp.getRadius as Acc<number>, d, i, 1)
      ctx.beginPath(); ctx.arc(x, y, Math.max(r, 0.5), 0, 2 * Math.PI)
      if (filled) { ctx.fillStyle = rgba(val(lp.getFillColor as Acc<RGBA>, d, i, [0, 0, 0, 255])); ctx.fill() }
      if (stroked) { ctx.lineWidth = val(lp.getLineWidth as Acc<number>, d, i, 1); ctx.strokeStyle = rgba(val(lp.getLineColor as Acc<RGBA>, d, i, [0, 0, 0, 255])); ctx.stroke() }
    })
  }

  private texts(ctx: CanvasRenderingContext2D, lp: Record<string, unknown>, data: unknown[], P: (p: Pos) => Pos): void {
    ctx.textBaseline = 'middle'
    data.forEach((d, i) => {
      const [x, y] = P(val(lp.getPosition as Acc<Pos>, d, i, [0, 0]))
      const [ox, oy] = val(lp.getPixelOffset as Acc<number[]>, d, i, [0, 0])
      const anchor = val(lp.getTextAnchor as Acc<string>, d, i, 'middle')
      ctx.textAlign = anchor === 'start' ? 'left' : anchor === 'end' ? 'right' : 'center'
      ctx.font = `${lp.fontWeight ?? 400} ${val(lp.getSize as Acc<number>, d, i, 12)}px ${lp.fontFamily ?? 'monospace'}`
      ctx.fillStyle = rgba(val(lp.getColor as Acc<RGBA>, d, i, [255, 255, 255, 255]))
      ctx.fillText(val(lp.getText as Acc<string>, d, i, ''), x + ox, y + oy)
    })
  }

  private icons(ctx: CanvasRenderingContext2D, lp: Record<string, unknown>, data: unknown[], P: (p: Pos) => Pos): void {
    const atlas = lp.iconAtlas as unknown as HTMLCanvasElement
    const mapping = lp.iconMapping as Record<string, { x: number; y: number; width: number; height: number; mask: boolean }>
    if (!atlas || !mapping) return
    data.forEach((d, i) => {
      const box = mapping[val(lp.getIcon as Acc<string>, d, i, '')]
      if (!box) return
      const [x, y] = P(val(lp.getPosition as Acc<Pos>, d, i, [0, 0]))
      const hgt = val(lp.getSize as Acc<number>, d, i, box.height), wid = hgt * (box.width / box.height)
      const src = box.mask ? this.tint(atlas, box, val(lp.getColor as Acc<RGBA>, d, i, [0, 0, 0, 255])) : atlas
      const sx = box.mask ? 0 : box.x, sy = box.mask ? 0 : box.y
      const angle = val(lp.getAngle as Acc<number>, d, i, 0)   // deck: degrees counter-clockwise; screen y is down
      ctx.save(); ctx.translate(x, y); if (angle) ctx.rotate((-angle * Math.PI) / 180)
      ctx.drawImage(src, sx, sy, box.width, box.height, -wid / 2, -hgt / 2, wid, hgt)
      ctx.restore()
    })
  }

  /** Mask icons take their colour from getColor: paint the glyph's alpha with the colour, cached per glyph and colour. */
  private tint(atlas: HTMLCanvasElement, box: { x: number; y: number; width: number; height: number }, c: RGBA): HTMLCanvasElement {
    const key = `${box.x},${box.y},${box.width},${box.height}|${c.join(',')}`
    let t = this.tints.get(key)
    if (!t) {
      if (this.tints.size > 512) this.tints.clear()   // particle alphas fade, so colours churn; keep the cache bounded
      t = document.createElement('canvas'); t.width = box.width; t.height = box.height
      const g = t.getContext('2d')!
      g.drawImage(atlas, box.x, box.y, box.width, box.height, 0, 0, box.width, box.height)
      g.globalCompositeOperation = 'source-in'; g.fillStyle = rgba(c); g.fillRect(0, 0, box.width, box.height)
      this.tints.set(key, t)
    }
    return t
  }

  private polygons(ctx: CanvasRenderingContext2D, lp: Record<string, unknown>, data: unknown[], P: (p: Pos) => Pos): void {
    const mask = lp.fillPatternAtlas as HTMLCanvasElement | undefined
    data.forEach((d, i) => {
      const ring = val(lp.getPolygon as Acc<Pos[]>, d, i, [])
      if (ring.length < 3) return
      ctx.beginPath()
      ring.forEach((p, j) => { const [x, y] = P(p); if (j) ctx.lineTo(x, y); else ctx.moveTo(x, y) })
      ctx.closePath()
      if (lp.filled !== false) {
        const fill = val(lp.getFillColor as Acc<RGBA>, d, i, [0, 0, 0, 255])
        ctx.fillStyle = mask ? this.pattern(ctx, mask, fill) ?? rgba(fill) : rgba(fill)
        ctx.fill()
      }
      if (lp.stroked) { ctx.lineWidth = (lp.lineWidthMinPixels as number) ?? 1; ctx.strokeStyle = rgba(val(lp.getLineColor as Acc<RGBA>, d, i, [0, 0, 0, 255])); ctx.stroke() }
    })
  }

  /** The 1-bit checker mask tinted with the fill colour, one CSS px per texel (the land's 50 % dither). */
  private pattern(ctx: CanvasRenderingContext2D, mask: HTMLCanvasElement, c: RGBA): CanvasPattern | null {
    const key = c.join(',')
    if (!this.patterns.has(key)) {
      const t = document.createElement('canvas'); t.width = mask.width; t.height = mask.height
      const g = t.getContext('2d')!
      g.drawImage(mask, 0, 0); g.globalCompositeOperation = 'source-in'; g.fillStyle = rgba(c); g.fillRect(0, 0, t.width, t.height)
      this.patterns.set(key, ctx.createPattern(t, 'repeat'))
    }
    return this.patterns.get(key) ?? null
  }

  /** The topmost pickable datum under a screen point (layers drawn last win, like deck's picking). */
  private pick(sx: number, sy: number): PickInfo {
    const w = this.width(), h = this.height()
    const layers = this.props.layers ?? []
    for (let li = layers.length - 1; li >= 0; li--) {
      const layer = layers[li], lp = layer.props as unknown as Record<string, unknown>
      if (!lp.pickable || !(layer instanceof IconLayer)) continue
      const data = (lp.data as unknown[]) ?? []
      for (let i = data.length - 1; i >= 0; i--) {
        const d = data[i]
        const [x, y] = project(this.view, w, h, val(lp.getPosition as Acc<Pos>, d, i, [0, 0]))
        const r = Math.max(val(lp.getSize as Acc<number>, d, i, 12) / 2, PICK_MIN_PX)
        if ((sx - x) ** 2 + (sy - y) ** 2 <= r * r) return { object: d, x: sx, y: sy, picked: true, layer }
      }
    }
    return { object: undefined, x: sx, y: sy, picked: false, layer: null }
  }

  private layerProp(info: PickInfo, name: 'onHover' | 'onClick') {
    return (info.layer?.props as unknown as Record<string, ((i: PickInfo) => void) | undefined> | undefined)?.[name]
  }

  private listen(c: HTMLCanvasElement): () => void {
    const local = (e: PointerEvent | WheelEvent): Pos => { const r = c.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top] }
    const hover = (info: PickInfo) => {
      if (info.object === this.hovered && info.picked) return
      const prev = this.hovered
      this.hovered = info.object ?? null
      c.style.cursor = this.props.getCursor?.({ isHovering: !!info.picked }) ?? ''
      // deck calls the hovered layer's onHover with the new object, and the previous layer's with none on leave
      const fn = this.layerProp(info, 'onHover') ?? (prev ? this.lastHoverFn : undefined)
      if (info.picked) this.lastHoverFn = this.layerProp(info, 'onHover')
      fn?.(info)
    }
    const down = (e: PointerEvent) => {
      const [x, y] = local(e)
      this.drag = { x, y, moved: false, view: this.view }
      c.setPointerCapture?.(e.pointerId)
    }
    const move = (e: PointerEvent) => {
      const [x, y] = local(e)
      if (this.drag) {
        const dx = x - this.drag.x, dy = y - this.drag.y
        if (!this.drag.moved && dx * dx + dy * dy < DRAG_PX * DRAG_PX) return
        this.drag.moved = true
        const k = 2 ** this.drag.view.zoom
        this.from = this.to = null
        this.setView({ target: [this.drag.view.target[0] - dx / k, this.drag.view.target[1] + dy / k], zoom: this.drag.view.zoom })
        this.schedule()
        return
      }
      hover(this.pick(x, y))
    }
    const up = (e: PointerEvent) => {
      const d = this.drag
      this.drag = null
      if (!d || d.moved) return
      const info = this.pick(...local(e))
      if (info.picked) this.layerProp(info, 'onClick')?.(info)
      this.props.onClick?.(info)   // deck's root onClick runs after the layer's
    }
    const leave = () => { if (!this.drag) hover({ object: undefined, x: -1, y: -1, picked: false, layer: null }) }
    const wheel = (e: WheelEvent) => {
      e.preventDefault()
      this.from = this.to = null
      const zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, this.view.zoom - e.deltaY * 0.002))
      this.setView(zoomAbout(this.view, this.width(), this.height(), local(e), zoom))
      this.schedule()
    }
    c.addEventListener('pointerdown', down)
    c.addEventListener('pointermove', move)
    c.addEventListener('pointerup', up)
    c.addEventListener('pointerleave', leave)
    c.addEventListener('wheel', wheel, { passive: false })
    return () => {
      c.removeEventListener('pointerdown', down)
      c.removeEventListener('pointermove', move)
      c.removeEventListener('pointerup', up)
      c.removeEventListener('pointerleave', leave)
      c.removeEventListener('wheel', wheel)
    }
  }
  private lastHoverFn: ((i: PickInfo) => void) | undefined

}

let probed: boolean | null = null
/** Whether this browser can create a WebGL2 context at all (hardware acceleration off or a blocklisted GPU says no). */
export function webglAvailable(): boolean {
  if (probed === null) {
    try {
      const c = document.createElement('canvas')
      const gl = c.getContext('webgl2')
      probed = !!gl
      ;(gl?.getExtension('WEBGL_lose_context'))?.loseContext()   // free the probe's context right away
    } catch { probed = false }
  }
  return probed
}

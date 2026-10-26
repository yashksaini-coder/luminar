/** deck.gl mesh renderer: a plain module (no React). Reads the store in a rAF loop, lays out once per topology, draws the render table. */

import { Deck, type Layer, OrthographicView } from '@deck.gl/core'
import { FillStyleExtension, type FillStyleExtensionProps, PathStyleExtension, type PathStyleExtensionProps } from '@deck.gl/extensions'
import { IconLayer, LineLayer, PathLayer, PolygonLayer, ScatterplotLayer, TextLayer } from '@deck.gl/layers'
import { RETICLE_CURSOR } from '@/components/dither/Reticle'
import { getStatic } from '@/lib/api/client'
import { subscribeEvents } from '@/lib/api/dispatch'
import { isAttackerId, isPruned, isSimPeer, shortName } from '@/lib/format'
import { monoFamily } from '@/lib/fonts'
import { reducedMotion } from '@/lib/prefs'
import { useStore } from '@/lib/store'
import type { AppEvent, Edge, LayoutMode, NodeState, PeerNode, RGBA } from '@/lib/types'
import { atlasKey, buildAtlas, type GlyphId, glyphFor, HALO_OUTER, haloFor, type IconAtlas } from './atlas'
import { bezierPoint, breathe, glyphScale, nodeRadiusPx, OBSERVER_STATIC_ALPHA, PARTICLE_CAP, particleFrame, PULSE_CAP, pulseAlpha } from './geometry'
import { Canvas2DDeck, webglAvailable } from './canvas2d'
import { attackerLayoutEdges, computeLayout, edgesKey, GEO_SCALE, isNodeVisible, resetLayoutMemory, topologyKey, WORLD_BOUNDS } from './layout'
import { PAL, type PaletteKey, PARTICLE_KEY, type ParticleKind, refreshPalette, scoreBand, withAlpha } from './palette'

export const LAYER_IDS = ['world-land', 'edges', 'attack-links', 'mesh-edges', 'hover-edges', 'hover-peer-rings', 'pulses', 'particles', 'halos', 'nodes', 'observer-rings', 'reticle', 'event-highlight-edges', 'event-highlight-rings', 'labels'] as const

type Pos = [number, number]
type Seg = [Pos, Pos]
interface Particle { fromId: string; toId: string; start: number; kind: ParticleKind; fizzle: boolean }
interface Pulse { id: string; start: number; color: RGBA }
interface ParticleDraw { kind: ParticleKind; pos: Pos; angle: number; color: RGBA }
interface PulseDraw { id: string; pos: Pos; color: RGBA }

declare global {
  interface Window { __luminar?: { store: typeof useStore; fitView: typeof fitView; viewState: typeof getViewState; layerIds: typeof layerIds } }
}

// Either a real deck.gl Deck or the Canvas 2D stand-in; renderer.ts only calls setProps/finalize on it.
type Backend = { setProps(p: Record<string, unknown>): void; finalize(): void }
let deck: Backend | null = null
let forceCanvas2D = false
let onBackendFailure: (() => void) | null = null

/** 'canvas2d' when WebGL is unavailable (hardware acceleration off, GPU blocklisted) or failed this session. */
export function rendererBackend(): 'webgl' | 'canvas2d' {
  return forceCanvas2D || (process.env.NODE_ENV !== 'test' && !webglAvailable()) ? 'canvas2d' : 'webgl'
}
/** Switch the rest of this session to the Canvas 2D backend (the next initRenderer uses it). */
export function fallBackToCanvas2D(): void { forceCanvas2D = true }
/** DeckCanvas registers a remount: deck.gl reports a dead GPU only after construction, asynchronously. */
export function setBackendFailureHandler(cb: (() => void) | null): void { onBackendFailure = cb }
let nodePositions: Pos[] = []
let nodeIndex = new Map<string, number>()
let topoKey = ''
let topoInputs: [PeerNode[], Edge[], LayoutMode] | null = null   // the store refs topoKey was last checked against
let atlas: IconAtlas | null = null
let atlasK = ''
let dirty = false
let raf = 0
let unsubStore: (() => void) | null = null
let fitPending = false
let fitSeq = 0
let lastLayerIds: string[] = []
let W = 0, H = 0
let fontsReady = false
let observersVisible = false
let tipEl: HTMLElement | null = null
let frameNow = 0
let unsubEvents: (() => void) | null = null
let particles: Particle[] = []
let pulses: Pulse[] = []
let prevStates = new Map<string, string>()
let lastNodes: PeerNode[] | null = null
let landPolygons: Pos[][] | null = null
let landRequest: Promise<void> | null = null
let checker: HTMLCanvasElement | null = null
let viewZoom = 0   // current deck zoom: the land checker's pattern scale follows it
// deck re-tessellates and re-uploads a layer whenever `data` is a new array, so arrays derived from the frozen topology
// are rebuilt only when an input changes identity (at 200 nodes the per-frame rebuild of ~1 600 dashed paths cost 20 fps).
type Memo<T> = { inputs: unknown[] | null; value: T | null }
const visibleMemo: Memo<PeerNode[]> = { inputs: null, value: null }
const edgeMemo: Memo<Seg[]> = { inputs: null, value: null }
const meshMemo: Memo<Seg[]> = { inputs: null, value: null }
function memoBy<T>(m: Memo<T>, inputs: unknown[], build: () => T): T {
  if (!m.inputs || inputs.some((v, i) => v !== m.inputs![i])) { m.inputs = inputs; m.value = build() }
  return m.value as T
}

const STATE_KEY: Record<NodeState, PaletteKey> = {
  idle: 'nodeIdle', origin: 'nodeOrigin', receiving: 'nodeReceiving', decoded: 'nodeDecoded',
  error: 'nodeError', joining: 'nodeJoining', failed: 'nodeFailed', attacker: 'nodeAttacker',
}
/** An attacker's graft↔prune flip is a state change too. */
const stateKey = (n: PeerNode) => (n.state === 'attacker' ? `attacker${n.connected_peers.length ? '+' : '-'}` : n.state)
const pulseColor = (n: PeerNode) => PAL[isPruned(n) ? 'nodePruned' : STATE_KEY[n.state]]

const PARTICLE_BASE_PX = 4   // 2 × the base 2 px cell; stage's 3 px cell only sharpens the texture, so particles grow by scale.particle alone (spec §6.3: ×1.8)

/** Peers with a gossip history worth a score halo; idle has none yet, the rest carry their own glyphs. */
const HALO_STATES = new Set<PeerNode['state']>(['origin', 'receiving', 'decoded'])
const hasHalo = (n: PeerNode) => isSimPeer(n) && HALO_STATES.has(n.state)

export function markDirty(): void { dirty = true }

/** The loop renders every frame only while something moves; otherwise only when the store is dirty. */
const animating = () => particles.length > 0 || pulses.length > 0 || (observersVisible && !reducedMotion())

type ParticleSpec = { from: string; to: string; kind: ParticleKind; fizzle: boolean }

/** Pure trigger table (A.17 "Particle triggers"). R10: neighbours(id) is the node's connected_peers, [] when unknown. */
export function particlesFor(evt: AppEvent, pick: (ids: string[]) => string | undefined, neighbours: (id: string) => string[]): ParticleSpec[] {
  const one = (from: string | undefined, to: string | undefined, kind: ParticleKind, fizzle = false): ParticleSpec[] =>
    from && to ? [{ from, to, kind, fizzle }] : []
  switch (evt.event_type) {
    case 'GossipMessage': return one(evt.from_peer, evt.to_peer, evt.from_peer?.startsWith('sybil-') ? 'spam' : 'message', !!evt.dropped)
    case 'GossipGraft': return one(evt.from_peer, evt.to_peer, 'graft')
    case 'GossipPrune': return one(evt.from_peer, evt.to_peer, 'prune')
    case 'DHTQueryStarted': {
      const from = evt.initiator ?? evt.peer_id   // the backend sends `initiator`
      return from ? one(from, pick(neighbours(from)), 'dht') : []
    }
    case 'FaultInjected': {
      const t = evt.target
      return t ? neighbours(t).slice(0, 4).map(to => ({ from: t, to, kind: 'fault' as const, fizzle: false })) : []   // a non-node target has no neighbours
    }
    default: return []
  }
}

const randomPick = (ids: string[]) => ids[Math.floor(Math.random() * ids.length)]
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(v, hi))   // lo wins when the field is narrower than the card
const neighboursOf = (id: string) => useStore.getState().nodeById.get(id)?.connected_peers ?? []

/** Cap 600; no-op when particles are off or either peer is unknown. Hidden endpoints drop at the next frame. */
export function spawnParticle(fromId: string, toId: string, kind: ParticleKind = 'message', fizzle = false): void {
  if (!useStore.getState().particlesEnabled || particles.length >= PARTICLE_CAP) return
  if (!nodeIndex.has(fromId) || !nodeIndex.has(toId)) return
  particles.push({ fromId, toId, start: frameNow, kind, fizzle })   // rAF clock, the same one the frames age against
}

/** Pulse on any state change to non-idle (first sight is not a change); off under reduced motion. */
function diffStates(nodes: PeerNode[]): void {
  const next = new Map<string, string>()
  const motion = !reducedMotion()
  for (const n of nodes) {
    const k = stateKey(n)
    next.set(n.peer_id, k)
    const prev = prevStates.get(n.peer_id)
    if (motion && prev !== undefined && prev !== k && n.state !== 'idle' && pulses.length < PULSE_CAP) {
      pulses.push({ id: n.peer_id, start: frameNow, color: pulseColor(n) })
    }
  }
  prevStates = next
}

const fontsLoaded = () => { fontsReady = true; markDirty() }

/** Test-only: jsdom has no document.fonts, so tests open the labels gate by hand. */
export function fontsReadyForTest(v: boolean): void {
  if (process.env.NODE_ENV === 'test') { fontsReady = v; markDirty() }
}

function tick(now: number): void {
  raf = requestAnimationFrame(tick)
  frameNow = now
  if (fitPending) fitView()   // the rAF after a relayout, or the first real size after a 0×0 field
  if (dirty || animating()) renderLayers()
}

export function initRenderer(canvas: HTMLCanvasElement, tooltipEl: HTMLElement | null): void {
  if (deck) destroyRenderer()   // StrictMode mounts twice; the second mount owns the deck
  tipEl = tooltipEl
  refreshPalette()
  W = canvas.parentElement?.clientWidth || window.innerWidth
  H = canvas.parentElement?.clientHeight || window.innerHeight
  const props = {
    canvas,
    views: new OrthographicView({ flipY: false }),
    initialViewState: { target: [0, 0, 0], zoom: 0 },
    controller: true,
    layers: [],
    getCursor: ({ isHovering }: { isHovering: boolean }) => (isHovering ? 'pointer' : RETICLE_CURSOR),
    // Deck's root onClick is a tap (a pan never fires it) and runs after the nodes layer's onClick.
    onClick: (info: { picked?: boolean }) => { if (!info.picked) useStore.getState().selectPeer(null) },
    onViewStateChange: ({ viewState }: { viewState: unknown }) => { viewZoom = (viewState as { zoom: number }).zoom; markDirty() },
    width: W,
    height: H,
  }
  deck = rendererBackend() === 'canvas2d'
    ? new Canvas2DDeck(props as unknown as ConstructorParameters<typeof Canvas2DDeck>[0])
    : new Deck({
        ...(props as unknown as ConstructorParameters<typeof Deck<OrthographicView>>[0]),
        // A GPU that refuses a context fails inside deck's async device setup: fall back to Canvas 2D and remount.
        onError: (err: Error) => {
          if (!/webgl|context|device/i.test(err?.message ?? '')) return
          forceCanvas2D = true
          onBackendFailure?.()
        },
      }) as unknown as Backend
  // Labels wait for the mono face so the TextLayer never bakes a fallback font into its atlas; a failed load draws with the fallback.
  fontsReady = false
  document.fonts?.load(`500 10px ${monoFamily()}`).then(fontsLoaded, fontsLoaded)
  unsubStore = useStore.subscribe(markDirty)
  unsubEvents = subscribeEvents(batch => {
    for (const e of batch) for (const p of particlesFor(e, randomPick, neighboursOf)) spawnParticle(p.from, p.to, p.kind, p.fizzle)
  })
  dirty = true
  raf = requestAnimationFrame(tick)
  window.__luminar = { store: useStore, fitView, viewState: getViewState, layerIds }
}

export function destroyRenderer(): void {
  cancelAnimationFrame(raf)
  unsubStore?.()
  unsubEvents?.()
  deck?.finalize()
  deck = null
  unsubStore = null
  unsubEvents = null
  particles = []
  pulses = []
  prevStates = new Map()
  lastNodes = null
  landPolygons = null
  landRequest = null
  viewZoom = 0
  raf = 0
  atlas = null
  atlasK = ''
  topoKey = ''          // a remount relayouts (warm from layout memory) and refits its fresh view
  topoInputs = null
  fitPending = false
  dirty = false
  observersVisible = false
  lastLayerIds = []
  tipEl = null
}

export function resizeRenderer(w: number, h: number): void {
  W = w
  H = h
  deck?.setProps({ width: w, height: h })
  markDirty()
}

function ensureAtlas(visibleCount: number): IconAtlas {
  const s = useStore.getState()
  const html = document.documentElement
  const nodePx = 2 * nodeRadiusPx(visibleCount, s.layoutMode, s.scale.node)
  const cellPx = parseFloat(getComputedStyle(html).getPropertyValue('--cell-mesh')) || (s.stageTheme ? 3 : 2)
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  const key = atlasKey(nodePx, cellPx, dpr, `${html.dataset.theme}|${html.dataset.stage}`)
  if (!atlas || key !== atlasK) {
    atlas = buildAtlas({ nodePx, cellPx, dpr, pal: PAL })
    atlasK = key
  }
  return atlas
}

type LandFile = { features: { geometry: { coordinates: number[][][] } }[] }

/** Fetches the land outlines once per renderer (outer rings, degrees → canvas units); a remount or a failed fetch tries again. */
function ensureLand(): void {
  if (landPolygons || landRequest) return
  const req: Promise<void> = getStatic<LandFile>('/geo/land-110m.json').then(fc => {
    if (landRequest !== req) return   // destroyed (or remounted) while loading
    landRequest = null
    if (!fc) return
    landPolygons = fc.features.map(f => f.geometry.coordinates[0].map(([lon, lat]) => [lon * GEO_SCALE, lat * GEO_SCALE] as Pos))
      .filter(ring => ring.some(([, y]) => y >= WORLD_BOUNDS.minY))   // Antarctica cropped: rings wholly south of the Geo frame are dropped
    markDirty()
  })
  landRequest = req
}

/** 2×2 mask: paper at (0,0) and (1,1), transparent elsewhere — a 50 % checker. */
function checkerAtlas(): HTMLCanvasElement {
  if (!checker) {
    checker = document.createElement('canvas')
    checker.width = checker.height = 2
    const ctx = checker.getContext('2d')
    if (ctx) { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 1, 1); ctx.fillRect(1, 1, 1, 1) }
  }
  return checker
}

function setLayers(layers: Layer[]): void {
  lastLayerIds = layers.map(l => l.id)
  deck!.setProps({ layers })
}

export function renderLayers(): void {
  if (!deck) return
  dirty = false
  const s = useStore.getState()
  const { nodes, edges, layoutMode, selectedPeer } = s
  refreshPalette()

  // The key string is only rebuilt when the store hands over new arrays, not on every animating frame.
  if (!topoInputs || nodes !== topoInputs[0] || edges !== topoInputs[1] || layoutMode !== topoInputs[2]) {
    topoInputs = [nodes, edges, layoutMode]
    const key = topologyKey(layoutMode, nodes, edges)
    if (key !== topoKey) {
      performance.mark('layout:start')
      // Layout memory is keyed by the edge set alone, so a node joining the same topology (an attacker) settles warm around pinned peers.
      nodePositions = computeLayout(layoutMode, nodes, [...edges, ...attackerLayoutEdges(nodes)], `${edgesKey(edges)}|${layoutMode}`).positions
      performance.measure('layout', 'layout:start')
      nodeIndex = new Map(nodes.map((n, i) => [n.peer_id, i]))
      topoKey = key
      fitPending = true
    }
  }

  if (nodes !== lastNodes) { diffStates(nodes); lastNodes = nodes }

  // Keyed on nodePositions too: the nodes layer reads positions through a closure, so a relayout must hand deck a new data array.
  const visible = memoBy(visibleMemo, [nodes, layoutMode, nodePositions], () => nodes.filter(n => isNodeVisible(layoutMode, n)))
  observersVisible = false
  if (visible.length === 0) { particles = []; pulses = []; setLayers([]); return }
  const posOf = (id: string): Pos | undefined => {
    const i = nodeIndex.get(id)
    return i !== undefined && isNodeVisible(layoutMode, nodes[i]) ? nodePositions[i] : undefined
  }
  const a = ensureAtlas(visible.length)
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  const thin = layoutMode === 'force' ? 1 : 0.4
  const r = nodeRadiusPx(visible.length, layoutMode, s.scale.node)
  const iconSize = (g: GlyphId) => a.mapping[g].height / dpr
  const atlasProps = { iconAtlas: a.image as unknown as string /* image prop: deck accepts a canvas, the d.ts says string | Texture */, iconMapping: a.mapping, sizeUnits: 'pixels' as const }
  const getPosition = (d: PeerNode) => posOf(d.peer_id)!

  const layers: Layer[] = []
  if (layoutMode === 'geo') {
    ensureLand()
    if (landPolygons) {
      layers.push(new PolygonLayer<Pos[], FillStyleExtensionProps<Pos[]>>({
        id: 'world-land', data: landPolygons, getPolygon: d => d,
        filled: true, stroked: true, getFillColor: PAL.paper0, getLineColor: withAlpha(PAL.paper0, 0.16), lineWidthMinPixels: 1,
        pickable: false,
        extensions: [new FillStyleExtension({ pattern: true })],
        fillPatternAtlas: checkerAtlas(), fillPatternMapping: { checker: { x: 0, y: 0, width: 2, height: 2 } },
        getFillPattern: () => 'checker', fillPatternMask: true,
        // PolygonLayerProps does not declare textureParameters, but deck reads it when it turns the atlas into a texture (image prop transform);
        // the 1-bit checker needs nearest: linear blends the 2×2 mask into a grey wash at DPR 1.5.
        ...{ textureParameters: { minFilter: 'nearest', magFilter: 'nearest', mipmapFilter: 'nearest' } } as object,
        // deck's 'pixels' units snap to the nearest whole zoom (a texel is 2^-round(zoom) common units); the scale makes up the
        // fractional part so one texel is exactly one CSS px, otherwise the checker beats into grey bands at a fit zoom like -0.28.
        fillPatternSizeUnits: 'pixels', getFillPatternScale: 2 ** (Math.round(viewZoom) - viewZoom), getFillPatternOffset: [0, 0],
      }))
    }
  }
  if (s.showEdges) {
    const edgeData = memoBy(edgeMemo, [edges, nodePositions, layoutMode], () => {
      const out: Seg[] = []
      for (const [src, tgt] of edges) {
        const p = posOf(src), q = posOf(tgt)
        if (p && q) out.push([p, q])
      }
      return out
    })
    if (edgeData.length) {
      const c = PAL.linkTopology
      layers.push(new PathLayer<Seg, PathStyleExtensionProps<Seg>>({
        id: 'edges', data: edgeData, getPath: d => d,
        getColor: withAlpha(c, (c[3] / 255) * s.scale.edgeAlpha * thin), getWidth: 1, widthUnits: 'pixels',
        getDashArray: [1, 3], extensions: [new PathStyleExtension({ dash: true, highPrecisionDash: true })],
      }))
    }
  }

  // Grafted attackers → each victim; pruned attackers have no connected_peers. Not gated by showEdges.
  const attackData: Seg[] = []
  for (const n of visible) {
    if (n.state !== 'attacker' || isPruned(n)) continue
    const p = posOf(n.peer_id)
    if (!p) continue
    for (const v of n.connected_peers) {
      const q = posOf(v)
      if (q) attackData.push([p, q])
    }
  }
  // Pushed even when empty: deck links a layer's shader when the layer is first created, and the
  // dashed-path program took ~620 ms (cold GPU shader cache) on the Sybil arrival frame.
  const c = PAL.linkAttack
  layers.push(new PathLayer<Seg, PathStyleExtensionProps<Seg>>({
    id: 'attack-links', data: attackData, getPath: d => d,
    getColor: withAlpha(c, (c[3] / 255) * s.scale.edgeAlpha), getWidth: 1, widthUnits: 'pixels',
    getDashArray: [4, 3], extensions: [new PathStyleExtension({ dash: true })],
  }))

  if (s.showEdges) {
    // The live GossipSub mesh, honest pairs only (attacker pairs are attack links), deduped undirected.
    const meshData = memoBy(meshMemo, [s.mesh, nodePositions, layoutMode], () => {
      const seen = new Set<string>()
      const out: Seg[] = []
      for (const [src, peers] of Object.entries(s.mesh)) {
        const p = isAttackerId(src) ? undefined : posOf(src)
        if (!p) continue
        for (const tgt of peers) {
          const pairKey = src < tgt ? `${src}|${tgt}` : `${tgt}|${src}`
          if (isAttackerId(tgt) || seen.has(pairKey)) continue
          seen.add(pairKey)
          const q = posOf(tgt)
          if (q) out.push([p, q])
        }
      }
      return out
    })
    if (meshData.length) {
      layers.push(new LineLayer<Seg>({
        id: 'mesh-edges', data: meshData, getSourcePosition: d => d[0], getTargetPosition: d => d[1],
        getColor: PAL.linkMesh, getWidth: 1, widthUnits: 'pixels',
      }))
    }
  }

  // Hover: the hovered peer's topology edges at 2 px and a ring at r+4 on each neighbour.
  const hovered = s.hoveredPeer
  const hp = hovered ? posOf(hovered) : undefined
  if (hp) {
    const hoverEdges: Seg[] = []
    for (const [src, tgt] of edges) {
      const other = src === hovered ? tgt : tgt === hovered ? src : null
      const q = other ? posOf(other) : undefined
      if (q) hoverEdges.push([hp, q])
    }
    if (hoverEdges.length) {
      layers.push(new LineLayer<Seg>({
        id: 'hover-edges', data: hoverEdges, getSourcePosition: d => d[0], getTargetPosition: d => d[1],
        getColor: PAL.paper1, getWidth: 2, widthUnits: 'pixels', widthMinPixels: 2,
      }))
      layers.push(new ScatterplotLayer<Seg>({
        id: 'hover-peer-rings', data: hoverEdges, getPosition: d => d[1],
        stroked: true, filled: false, radiusUnits: 'pixels', getRadius: r + 4,
        getLineColor: PAL.paper1, lineWidthUnits: 'pixels', getLineWidth: 1,
      }))
    }
  }

  // Positions are looked up by id every frame; an expired particle/pulse or one whose endpoint is hidden is dropped in the same pass.
  const pulseData: PulseDraw[] = []
  pulses = pulses.filter(p => {
    const pos = posOf(p.id), age = frameNow - p.start
    if (!pos || pulseAlpha(age) <= 0) return false
    pulseData.push({ id: p.id, pos, color: withAlpha(p.color, pulseAlpha(age) / 255) })
    return true
  })
  if (pulseData.length) {
    layers.push(new ScatterplotLayer<PulseDraw>({
      id: 'pulses', data: pulseData, getPosition: d => d.pos, getFillColor: d => d.color,
      radiusUnits: 'pixels', getRadius: 2.5 * r, pickable: false,
    }))
  }

  const particleData: ParticleDraw[] = []
  particles = particles.filter(p => {
    const f = particleFrame(frameNow - p.start, p.fizzle), src = posOf(p.fromId), tgt = posOf(p.toId)
    if (!f || !src || !tgt) return false
    const pos = bezierPoint(src, tgt, f.t), ahead = bezierPoint(src, tgt, f.t + 0.01)   // the curve extrapolates past t = 1, so the tangent holds at the end
    const color = withAlpha(p.fizzle ? PAL.nodeError : PAL[PARTICLE_KEY[p.kind]], f.alpha / 255)
    particleData.push({ kind: p.kind, pos, angle: (Math.atan2(ahead[1] - pos[1], ahead[0] - pos[0]) * 180) / Math.PI, color })
    return true
  })
  if (particleData.length) {
    layers.push(new IconLayer<ParticleDraw>({
      id: 'particles', data: particleData, ...atlasProps,
      getIcon: d => (d.kind === 'spam' ? 'squareTrail' : 'square'),   // the trail's cell sits at −x, so the angle points the head along travel
      getSize: PARTICLE_BASE_PX * s.scale.particle, getPosition: d => d.pos, getAngle: d => d.angle, getColor: d => d.color,
      pickable: false,
      textureParameters: { minFilter: 'nearest', magFilter: 'nearest', mipmapFilter: 'nearest' },   // hard squares, no smear
    }))
  }

  const haloData = visible.filter(hasHalo)
  if (haloData.length) {
    const bandKey = haloData.map(n => scoreBand(n.gossip_score)).join('')
    layers.push(new IconLayer<PeerNode>({
      id: 'halos', data: haloData, ...atlasProps,
      getIcon: d => haloFor(d.gossip_score), getSize: iconSize('halo-0'), getPosition,
      pickable: false,
      // 1:1 with the atlas: nearest keeps the dither cells square at a fractional screen position (linear smears them).
      textureParameters: { minFilter: 'nearest', magFilter: 'nearest', mipmapFilter: 'nearest' },
      updateTriggers: { getIcon: [bandKey, atlasK] },
    }))
  }

  layers.push(new IconLayer<PeerNode>({
    id: 'nodes', data: visible, ...atlasProps,
    getIcon: d => glyphFor(d),
    getSize: d => iconSize(glyphFor(d)) * glyphScale(d, d.peer_id === selectedPeer),
    getPosition,
    pickable: true,
    onClick: info => {
      const id = info.object?.peer_id
      if (id) useStore.getState().selectPeer(useStore.getState().selectedPeer === id ? null : id)
    },
    onHover: info => {
      useStore.getState().hoverPeer(info.object?.peer_id ?? null)
      if (!tipEl) return
      if (!info.object) { tipEl.dataset.show = '0'; return }
      tipEl.dataset.show = '1'   // React's <Tooltip> fills it; the 200 px card is clamped inside the field
      tipEl.style.transform = `translate(${clamp(info.x + 16, 0, W - 216)}px, ${clamp(info.y - 10, 0, H - tipEl.offsetHeight - 8)}px)`
    },
    updateTriggers: { getSize: [selectedPeer, atlasK], getIcon: atlasK },
  }))

  // Observers draw the static double ring in `nodes`; this ring only breathes its alpha.
  const observers = visible.filter(n => !isSimPeer(n))
  observersVisible = observers.length > 0
  if (observersVisible) {
    layers.push(new ScatterplotLayer<PeerNode>({
      id: 'observer-rings', data: observers, getPosition,
      stroked: true, filled: false, radiusUnits: 'pixels', getRadius: 1.6 * r,
      lineWidthUnits: 'pixels', getLineWidth: 1.5,
      getLineColor: withAlpha(PAL.ringTelemetry, reducedMotion() ? OBSERVER_STATIC_ALPHA : breathe(frameNow)),
    }))
  }

  const sel = selectedPeer ? posOf(selectedPeer) : undefined
  if (sel) {
    layers.push(new IconLayer<Pos>({
      id: 'reticle', data: [sel], ...atlasProps,
      getIcon: () => 'reticle', getSize: iconSize('reticle'), getPosition: d => d, pickable: false,
    }))
  }

  const highlight = s.highlightPeers.map(id => posOf(id)).filter((p): p is Pos => !!p)
  if (sel && highlight.length) {
    layers.push(new LineLayer<Pos>({
      id: 'event-highlight-edges', data: highlight, getSourcePosition: () => sel, getTargetPosition: d => d,
      getColor: withAlpha(PAL.linkHighlight, 161 / 255), getWidth: 2.5, widthUnits: 'pixels',
    }))
  }
  if (highlight.length) {
    layers.push(new ScatterplotLayer<Pos>({
      id: 'event-highlight-rings', data: highlight, getPosition: d => d,
      stroked: true, filled: false, radiusUnits: 'pixels', getRadius: 1.8 * r,
      getLineColor: withAlpha(PAL.linkHighlight, 230 / 255), lineWidthUnits: 'pixels', getLineWidth: 1.5,
    }))
  }

  if (s.showLabels && fontsReady) {
    const all = s.allLabels && visible.length <= 50
    const labelData = visible.filter(n => all || n.state === 'attacker' || n.peer_id === selectedPeer || n.peer_id === hovered)
    // Pushed even when empty, like attack-links: above 50 nodes the first label is an attacker's, on the arrival frame.
    if (visible.length) {
      layers.push(new TextLayer<PeerNode>({
        id: 'labels', data: labelData, getPosition,
        getText: d => (d.state === 'attacker' ? d.peer_id : shortName(d)),
        // R6: pruned attacker labels are paper-2 (paper-3 is never text)
        getColor: d => (d.state !== 'attacker' ? PAL.paper0 : isPruned(d) ? PAL.paper2 : PAL.flame),
        getSize: s.stageTheme ? 12 : 10, sizeUnits: 'pixels',
        fontFamily: monoFamily(), fontWeight: 500,
        // 'auto' scans the data; with no labels yet that is a 0×0 font atlas (WebGL "texSubImage2D: no canvas"), so seed it.
        characterSet: labelData.length ? 'auto' : 'sybil-0123456789',
        getTextAnchor: 'start', getAlignmentBaseline: 'center',
        // Start past whatever rings the glyph, so no label sits on the reticle's ticks (2 r + 4 px) or the halo cells (1.7 r).
        getPixelOffset: d => [(d.peer_id === selectedPeer ? 2 * r + 4 : hasHalo(d) ? HALO_OUTER * r : r * glyphScale(d, false)) + 3, 0],
        updateTriggers: { getPixelOffset: [selectedPeer, r] },
      }))
    }
  }
  setLayers(layers)
}

/** Strip height (52) + its bottom offset (36): the band the strip owns at the bottom of the canvas. */
const STRIP_CLEAR_PX = 88

export function fitView({ durationMs = reducedMotion() ? 0 : 500 }: { durationMs?: number } = {}): void {
  if (!deck) return
  const { nodes, layoutMode } = useStore.getState()
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const [id, i] of nodeIndex) {
    if (!isNodeVisible(layoutMode, nodes[i]) || nodes[i].peer_id !== id) continue   // hidden nodes must not stretch the fit
    const [x, y] = nodePositions[i]
    minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y)
  }
  if (minX === Infinity) return                               // nothing visible in this view
  if (layoutMode === 'geo') ({ minX, minY, maxX, maxY } = WORLD_BOUNDS)   // the whole map, not just where observers are
  if (W < 200 || H < 200) return                              // 0×0 field: keep fitPending; resizeRenderer re-arms the loop
  const pad = 80
  const padBottom = pad + STRIP_CLEAR_PX   // the floating command strip covers the bottom of the field
  const dx = maxX - minX || 1, dy = maxY - minY || 1
  const zoom = Math.min(4, Math.log2(Math.min((W - 2 * pad) / dx, (H - pad - padBottom) / dy)))
  const lift = (padBottom - pad) / 2 / 2 ** zoom   // centre the mesh in the band above the strip (y is up: lower the target)
  // Deck ignores an initialViewState deep-equal to the previous one, so a refit after a pan would be dropped: the seq makes each fit new.
  const fit = { target: [(minX + maxX) / 2, (minY + maxY) / 2 - lift, 0] as [number, number, number], zoom, transitionDuration: durationMs, fitSeq: ++fitSeq }
  deck.setProps({ initialViewState: fit })
  viewZoom = zoom   // a 0 ms fit fires no onViewStateChange; a transition's frames overwrite this on the way
  markDirty()
  fitPending = false
}

export function visiblePositions(): Map<string, Pos> {
  const { nodes, layoutMode } = useStore.getState()
  const out = new Map<string, Pos>()
  for (const [id, i] of nodeIndex) if (nodes[i]?.peer_id === id && isNodeVisible(layoutMode, nodes[i])) out.set(id, nodePositions[i])
  return out
}

export function resetTopology(): void {
  topoKey = ''
  topoInputs = null
  resetLayoutMemory()
  markDirty()
}

/** Ids of the layers last set on the deck, in order (tests, window.__luminar). */
export function layerIds(): string[] {
  return [...lastLayerIds]
}

/** Current deck viewport (debug / e2e). */
export function getViewState(): unknown {
  const vp = (deck as unknown as { viewManager?: { getViewports(): object[] } } | null)?.viewManager?.getViewports()[0]
  return vp ? { ...vp } : null
}

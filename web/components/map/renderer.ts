/** deck.gl mesh renderer: a plain module (no React). Reads the store in a rAF loop, lays out once per topology, draws the render table. */

import { Deck, type Layer, OrthographicView } from '@deck.gl/core'
import { PathStyleExtension, type PathStyleExtensionProps } from '@deck.gl/extensions'
import { IconLayer, LineLayer, PathLayer, ScatterplotLayer, TextLayer } from '@deck.gl/layers'
import { RETICLE_CURSOR } from '@/components/dither/Reticle'
import { isAttackerId, isPruned, isSimPeer, shortName } from '@/lib/format'
import { monoFamily } from '@/lib/fonts'
import { reducedMotion } from '@/lib/prefs'
import { useStore } from '@/lib/store'
import type { PeerNode } from '@/lib/types'
import { atlasKey, buildAtlas, type GlyphId, glyphFor, HALO_OUTER, haloFor, type IconAtlas } from './atlas'
import { breathe, glyphScale, nodeRadiusPx, OBSERVER_STATIC_ALPHA } from './geometry'
import { attackerLayoutEdges, computeLayout, isNodeVisible, resetLayoutMemory, topologyKey, WORLD_BOUNDS } from './layout'
import { PAL, refreshPalette, scoreBand, withAlpha } from './palette'

export const LAYER_IDS = ['world-land', 'edges', 'attack-links', 'mesh-edges', 'hover-edges', 'hover-peer-rings', 'pulses', 'particles', 'halos', 'nodes', 'observer-rings', 'reticle', 'event-highlight-edges', 'event-highlight-rings', 'labels'] as const

type Pos = [number, number]
type Seg = [Pos, Pos]

declare global {
  interface Window { __luminar?: { store: typeof useStore; fitView: typeof fitView; viewState: typeof getViewState; layerIds: typeof layerIds } }
}

let deck: Deck<OrthographicView> | null = null
let nodePositions: Pos[] = []
let nodeIndex = new Map<string, number>()
let topoKey = ''
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
let frameNow = 0

/** Peers with a gossip history worth a score halo; idle has none yet, the rest carry their own glyphs. */
const HALO_STATES = new Set<PeerNode['state']>(['origin', 'receiving', 'decoded'])
const hasHalo = (n: PeerNode) => isSimPeer(n) && HALO_STATES.has(n.state)

export function markDirty(): void { dirty = true }

/** Observer rings breathe while visible; Task 2.6 adds particles and pulses. */
const animating = () => observersVisible && !reducedMotion()

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
  void tooltipEl                // positioned by the renderer once Task 2.8 lands the Tooltip
  refreshPalette()
  W = canvas.parentElement?.clientWidth || window.innerWidth
  H = canvas.parentElement?.clientHeight || window.innerHeight
  deck = new Deck({
    canvas,
    views: new OrthographicView({ flipY: false }),
    initialViewState: { target: [0, 0, 0], zoom: 0 },
    controller: true,
    layers: [],
    getCursor: ({ isHovering }) => (isHovering ? 'pointer' : RETICLE_CURSOR),
    // Deck's root onClick is a tap (a pan never fires it) and runs after the nodes layer's onClick.
    onClick: info => { if (!info.picked) useStore.getState().selectPeer(null) },
    width: W,
    height: H,
  })
  // Labels wait for the mono face so the TextLayer never bakes a fallback font into its atlas; a failed load draws with the fallback.
  fontsReady = false
  document.fonts?.load(`500 10px ${monoFamily()}`).then(fontsLoaded, fontsLoaded)
  unsubStore = useStore.subscribe(markDirty)
  dirty = true
  raf = requestAnimationFrame(tick)
  window.__luminar = { store: useStore, fitView, viewState: getViewState, layerIds }
}

export function destroyRenderer(): void {
  cancelAnimationFrame(raf)
  unsubStore?.()
  deck?.finalize()
  deck = null
  unsubStore = null
  raf = 0
  atlas = null
  atlasK = ''
  topoKey = ''          // a remount relayouts (warm from layout memory) and refits its fresh view
  fitPending = false
  dirty = false
  observersVisible = false
  lastLayerIds = []
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

  const key = topologyKey(layoutMode, nodes, edges)
  if (key !== topoKey) {
    performance.mark('layout:start')
    nodePositions = computeLayout(layoutMode, nodes, [...edges, ...attackerLayoutEdges(nodes)], key).positions
    performance.measure('layout', 'layout:start')
    nodeIndex = new Map(nodes.map((n, i) => [n.peer_id, i]))
    topoKey = key
    fitPending = true
  }

  const visible = nodes.filter(n => isNodeVisible(layoutMode, n))
  observersVisible = false
  if (visible.length === 0) { setLayers([]); return }
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
  if (s.showEdges) {
    const edgeData: Seg[] = []
    for (const [src, tgt] of edges) {
      const p = posOf(src), q = posOf(tgt)
      if (p && q) edgeData.push([p, q])
    }
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
  if (attackData.length) {
    const c = PAL.linkAttack
    layers.push(new PathLayer<Seg, PathStyleExtensionProps<Seg>>({
      id: 'attack-links', data: attackData, getPath: d => d,
      getColor: withAlpha(c, (c[3] / 255) * s.scale.edgeAlpha), getWidth: 1, widthUnits: 'pixels',
      getDashArray: [4, 3], extensions: [new PathStyleExtension({ dash: true })],
    }))
  }

  if (s.showEdges) {
    // The live GossipSub mesh, honest pairs only (attacker pairs are attack links), deduped undirected.
    const seen = new Set<string>()
    const meshData: Seg[] = []
    for (const [src, peers] of Object.entries(s.mesh)) {
      const p = isAttackerId(src) ? undefined : posOf(src)
      if (!p) continue
      for (const tgt of peers) {
        const pairKey = src < tgt ? `${src}|${tgt}` : `${tgt}|${src}`
        if (isAttackerId(tgt) || seen.has(pairKey)) continue
        seen.add(pairKey)
        const q = posOf(tgt)
        if (q) meshData.push([p, q])
      }
    }
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
    onHover: info => useStore.getState().hoverPeer(info.object?.peer_id ?? null),
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
    if (labelData.length) {
      layers.push(new TextLayer<PeerNode>({
        id: 'labels', data: labelData, getPosition,
        getText: d => (d.state === 'attacker' ? d.peer_id : shortName(d)),
        // R6: pruned attacker labels are paper-2 (paper-3 is never text)
        getColor: d => (d.state !== 'attacker' ? PAL.paper0 : isPruned(d) ? PAL.paper2 : PAL.flame),
        getSize: s.stageTheme ? 12 : 10, sizeUnits: 'pixels',
        fontFamily: monoFamily(), fontWeight: 500, characterSet: 'auto',
        getTextAnchor: 'start', getAlignmentBaseline: 'center',
        // Start past whatever rings the glyph, so no label sits on the reticle's ticks (2 r + 4 px) or the halo cells (1.7 r).
        getPixelOffset: d => [(d.peer_id === selectedPeer ? 2 * r + 4 : hasHalo(d) ? HALO_OUTER * r : r * glyphScale(d, false)) + 3, 0],
        updateTriggers: { getPixelOffset: [selectedPeer, r] },
      }))
    }
  }
  setLayers(layers)
}

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
  const dx = maxX - minX || 1, dy = maxY - minY || 1
  const zoom = Math.min(4, Math.log2(Math.min((W - 2 * pad) / dx, (H - 2 * pad) / dy)))
  // Deck ignores an initialViewState deep-equal to the previous one, so a refit after a pan would be dropped: the seq makes each fit new.
  const fit = { target: [(minX + maxX) / 2, (minY + maxY) / 2, 0] as [number, number, number], zoom, transitionDuration: durationMs, fitSeq: ++fitSeq }
  deck.setProps({ initialViewState: fit })
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

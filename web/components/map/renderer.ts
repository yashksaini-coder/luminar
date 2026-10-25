/** deck.gl mesh renderer: a plain module (no React). Reads the store in a rAF loop, lays out once per topology, draws the render table. */

import { Deck, type Layer, OrthographicView } from '@deck.gl/core'
import { PathStyleExtension, type PathStyleExtensionProps } from '@deck.gl/extensions'
import { IconLayer, LineLayer, PathLayer } from '@deck.gl/layers'
import { RETICLE_CURSOR } from '@/components/dither/Reticle'
import { isAttackerId } from '@/lib/format'
import { monoFamily } from '@/lib/fonts'
import { reducedMotion } from '@/lib/prefs'
import { useStore } from '@/lib/store'
import type { PeerNode } from '@/lib/types'
import { atlasKey, buildAtlas, glyphFor, type IconAtlas } from './atlas'
import { glyphScale, nodeRadiusPx } from './geometry'
import { attackerLayoutEdges, computeLayout, isNodeVisible, resetLayoutMemory, topologyKey, WORLD_BOUNDS } from './layout'
import { PAL, refreshPalette, withAlpha } from './palette'

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

export function markDirty(): void { dirty = true }

/** False until Task 2.6 adds particles, pulses and observer rings. */
const animating = () => false

function tick(): void {
  raf = requestAnimationFrame(tick)
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
  // Repaint once the mono face is in; Task 2.5's labels TextLayer adds its fontsReady gate here.
  document.fonts?.load(`500 10px ${monoFamily()}`).then(markDirty, markDirty)
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
  if (visible.length === 0) { setLayers([]); return }
  const posOf = (id: string): Pos | undefined => {
    const i = nodeIndex.get(id)
    return i !== undefined && isNodeVisible(layoutMode, nodes[i]) ? nodePositions[i] : undefined
  }
  const a = ensureAtlas(visible.length)
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  const thin = layoutMode === 'force' ? 1 : 0.4

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

  layers.push(new IconLayer<PeerNode>({
    id: 'nodes', data: visible, iconAtlas: a.image as unknown as string /* image prop: deck accepts a canvas, the d.ts says string | Texture */, iconMapping: a.mapping, sizeUnits: 'pixels',
    getIcon: d => glyphFor(d),
    getSize: d => (a.mapping[glyphFor(d)].height / dpr) * glyphScale(d, d.peer_id === selectedPeer),
    getPosition: d => posOf(d.peer_id)!,
    pickable: true,
    onClick: info => {
      const id = info.object?.peer_id
      if (id) useStore.getState().selectPeer(useStore.getState().selectedPeer === id ? null : id)
    },
    onHover: info => useStore.getState().hoverPeer(info.object?.peer_id ?? null),
    updateTriggers: { getSize: [selectedPeer, atlasK], getIcon: atlasK },
  }))
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

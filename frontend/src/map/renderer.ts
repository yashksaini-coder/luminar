import { Deck, OrthographicView } from '@deck.gl/core'
import { ScatterplotLayer, LineLayer, TextLayer, PolygonLayer } from '@deck.gl/layers'
import { getStatic } from '../api/client'
import { GEO_SCALE } from './layout'
import { store } from '../store'
import { shortName } from '../format'
import {
  MAP, STATE_COLORS, STATE_CSS, PARTICLE_KIND_KEY, nodeFillColor, nodeLineColor, nodeLineWidth,
  refreshPalette, isAttackerId, PULSE_RING_DURATION_MS, type RGBA, type ParticleKind,
} from '../palette'
import type { PeerNode } from '../types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let deck: any = null
let tooltipEl: HTMLElement | null = null
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
// deck's TextLayer bakes its font atlas once per font key; wait for Geist Mono before the first label.
let fontsReady = false

// Pulse tracking
interface Pulse {
  nodeIdx: number
  startTime: number
  color: RGBA
}
const pulses: Pulse[] = []
let prevStates: string[] = []

// Particle tracking (gossip message animations)
interface Particle {
  fromIdx: number
  toIdx: number
  startTime: number
  color: RGBA
  lifetime: number  // ms
  fizzle: boolean   // dropped hop: travel to 60% then fade out
}

const particles: Particle[] = []
const PARTICLE_LIFETIME_MS = 1200
const PARTICLE_TRAVEL_MS = 800
const PARTICLE_CAP = 600
const FIZZLE_AT = 0.6
const FIZZLE_ALPHA = 89  // .35 × 255

type Pos = [number, number]
type Seg = { source: Pos; target: Pos }

/** Spawn a hop particle; `color` is an rgba tuple or a `ParticleKind` ('message' when omitted). */
export function spawnParticle(fromPeerId: string, toPeerId: string, color?: RGBA | ParticleKind, fizzle = false) {
  if (!store.particlesEnabled) return
  if (particles.length > PARTICLE_CAP) return  // cap
  const fromIdx = store.nodeIndex.get(fromPeerId)
  const toIdx = store.nodeIndex.get(toPeerId)
  if (fromIdx === undefined || toIdx === undefined) return
  if (!store.nodePositions[fromIdx] || !store.nodePositions[toIdx]) return
  refreshPalette()

  particles.push({
    fromIdx,
    toIdx,
    startTime: performance.now(),
    color: fizzle ? STATE_COLORS.error
      : typeof color === 'string' ? MAP[PARTICLE_KIND_KEY[color]]
      : color ?? MAP.particle,
    lifetime: PARTICLE_LIFETIME_MS,
    fizzle,
  })
}

/** Point on a quadratic bezier bowed to the left of travel, so A→B and B→A don't overlap. */
function bezierPoint(src: Pos, tgt: Pos, t: number): Pos {
  const dx = tgt[0] - src[0], dy = tgt[1] - src[1]
  const len = Math.hypot(dx, dy) || 1
  const bow = Math.min(18, len * 0.12)
  const cx = (src[0] + tgt[0]) / 2 - (dy / len) * bow
  const cy = (src[1] + tgt[1]) / 2 + (dx / len) * bow
  const u = 1 - t
  return [u * u * src[0] + 2 * u * t * cx + t * t * tgt[0], u * u * src[1] + 2 * u * t * cy + t * t * tgt[1]]
}

export function initRenderer(canvas: HTMLCanvasElement, tooltip: HTMLElement) {
  tooltipEl = tooltip
  refreshPalette()
  document.fonts.load('500 10px "Geist Mono"').catch(() => undefined).then(() => { fontsReady = true; renderLayers() })

  deck = new Deck({
    canvas,
    views: new OrthographicView({ flipY: false }) as any,
    initialViewState: { target: [0, 0, 0], zoom: 0 } as any,
    controller: true,
    layers: [],
    // Background click to deselect. Deck's root onClick is a tap recognizer (a pan never
    // fires it, unlike a native click) and runs after the nodes layer's onClick.
    onClick: (info: any) => {
      if (info.picked || store.selectedNode < 0) return
      store.selectedNode = -1
      store.highlightPeers = []
      if (tooltipEl) tooltipEl.style.display = 'none'
      document.dispatchEvent(new CustomEvent('luminar:nodeselect'))
      renderLayers()
    },
    getCursor: ({ isHovering }: { isHovering: boolean }) => isHovering ? 'pointer' : 'grab',
    width: canvas.parentElement!.clientWidth,
    height: canvas.parentElement!.clientHeight,
  })
}

export function resizeRenderer(w: number, h: number) {
  deck?.setProps({ width: w, height: h })
}

const ring = (id: string, extra: Record<string, unknown>) => new ScatterplotLayer({
  id,
  stroked: true,
  filled: false,
  radiusUnits: 'common' as const,
  lineWidthUnits: 'pixels' as const,
  antialiasing: true,
  pickable: false,
  ...extra,
})

const withAlpha = (c: RGBA, a: number): RGBA => [c[0], c[1], c[2], Math.max(0, Math.min(255, Math.round(a)))]

// ── World land outlines for the Geo layout (Natural Earth 110m, public domain), loaded once ──
type Ring = [number, number][]
let landPolygons: Ring[] | null = null
let landLoading = false
const WORLD_BOUNDS = { minX: -180 * GEO_SCALE, maxX: 180 * GEO_SCALE, minY: -58 * GEO_SCALE, maxY: 84 * GEO_SCALE }  // y up; Antarctica cropped

function ensureLand() {
  if (landPolygons || landLoading) return
  landLoading = true
  getStatic<{ features: { geometry: { type: string; coordinates: number[][][] } }[] }>('/geo/land-110m.json')
    .then(fc => {
      landPolygons = (fc?.features ?? []).map(f => f.geometry.coordinates[0].map(([lon, lat]) => [lon * GEO_SCALE, lat * GEO_SCALE] as [number, number]))
      renderLayers()
    })
    .finally(() => { landLoading = false })
}

export function renderLayers() {
  if (!deck) return
  refreshPalette()

  const { nodes, edges, nodePositions, selectedNode, hoveredNode } = store
  const n = nodes.length
  if (n === 0 || nodePositions.length === 0) { deck.setProps({ layers: [] }); return }

  // Node radius scales with count; smaller in grid/radial for cleaner look
  const baseRadius = Math.max(3, Math.min(8, 200 / Math.sqrt(n))) * store.scale.node
  const nodeRadius = store.layoutMode === 'force' ? baseRadius : baseRadius * 0.5  // grid/radial: ~45% of the slot
  const radiusOf = (d: { state: string; _idx: number }) =>
    nodeRadius * (d._idx === selectedNode ? 1.5 : 1) * (d.state === 'attacker' ? 1.15 : 1)
  const la = store.layoutMode === 'force' ? 1 : 0.4   // grid/radial thin every edge layer
  const ea = la * store.scale.edgeAlpha                 // stage bumps topology + attack links; mesh has its own stage token
  const now = performance.now()

  // Cap arrays to prevent memory issues during high throughput
  if (pulses.length > 200) pulses.splice(0, pulses.length - 200)
  if (particles.length > PARTICLE_CAP) particles.splice(0, particles.length - PARTICLE_CAP)

  // Detect state changes for pulse animation; an attacker's graft↔prune flip counts too
  const stateKeys = nodes.map(nd => nd.state + (nd.state === 'attacker' ? (nd.connected_peers.length > 0 ? '+' : '-') : ''))
  if (prevStates.length === n && !reducedMotion) {
    for (let i = 0; i < n; i++) {
      if (stateKeys[i] !== prevStates[i] && nodes[i].state !== 'idle') {
        pulses.push({ nodeIdx: i, startTime: now, color: STATE_COLORS[nodes[i].state] ?? STATE_COLORS.idle })
      }
    }
  }
  prevStates = stateKeys

  // Prune expired pulses
  for (let i = pulses.length - 1; i >= 0; i--) {
    if (now - pulses[i].startTime > PULSE_RING_DURATION_MS) pulses.splice(i, 1)
  }

  // Prune expired particles
  for (let i = particles.length - 1; i >= 0; i--) {
    if (now - particles[i].startTime > particles[i].lifetime) particles.splice(i, 1)
  }

  const layers: any[] = []

  // 0. World map under everything in the Geo layout
  if (store.layoutMode === 'geo') {
    ensureLand()
    if (landPolygons) {
      layers.push(new PolygonLayer({
        id: 'world-land',
        data: landPolygons,
        getPolygon: (d: Ring) => d,
        filled: true,
        stroked: true,
        getFillColor: [242, 242, 239, 12],
        getLineColor: [242, 242, 239, 40],
        lineWidthMinPixels: 1,
        pickable: false,
      }))
    }
  }
  // Geo layout shows the real world only: simulated peers have no coordinates, and drawing
  // their topology over the observers would merge two provenances in one graph.
  const geoOnly = store.layoutMode === 'geo' && nodes.some(nd => nd.is_real || nd.is_telemetry)
  const hidden = (nd: { is_real?: boolean; is_telemetry?: boolean } | undefined) =>
    geoOnly && !!nd && !nd.is_real && !nd.is_telemetry
  const posOf = (id: string): Pos | undefined => {
    const i = store.nodeIndex.get(id)
    return i !== undefined && !hidden(nodes[i]) ? nodePositions[i] : undefined
  }
  const line = (id: string, data: Seg[], color: RGBA, width: number, minPx = 1) => new LineLayer({
    id,
    data,
    getSourcePosition: (d: Seg) => d.source,
    getTargetPosition: (d: Seg) => d.target,
    getColor: color,
    getWidth: width,
    widthMinPixels: minPx,
    pickable: false,
  })

  // 1. Topology edges (all modes — lighter in grid/radial for cleaner look)
  if (store.showEdges) {
    const edgeData: Seg[] = []
    for (const [s, t] of edges) {
      const source = posOf(s), target = posOf(t)
      if (source && target) edgeData.push({ source, target })
    }
    if (edgeData.length > 0) layers.push(line('edges', edgeData, withAlpha(MAP.topology, 0.9 * 255 * ea), 1))

    // 1a. Attack links — grafted attacker → each victim, drawn between topology and mesh
    const attackData: Seg[] = []
    for (let i = 0; i < n; i++) {
      const nd = nodes[i]
      if (nd.state !== 'attacker' || nd.connected_peers.length === 0 || !nodePositions[i]) continue
      for (const v of nd.connected_peers) {
        const target = posOf(v)
        if (target) attackData.push({ source: nodePositions[i], target })
      }
    }
    if (attackData.length > 0) layers.push(line('attack-links', attackData, withAlpha(MAP.attackLink, MAP.attackLink[3] * ea), 1))

    // 1b. Mesh overlay — the live GossipSub mesh (honest pairs only; attacker pairs are attack links)
    const seen = new Set<string>()
    const meshData: Seg[] = []
    for (const [a, peers] of Object.entries(store.mesh)) {
      if (isAttackerId(a)) continue
      const source = posOf(a)
      if (!source) continue
      for (const b of peers) {
        if (isAttackerId(b)) continue
        const key = a < b ? `${a}|${b}` : `${b}|${a}`
        if (seen.has(key)) continue
        seen.add(key)
        const target = posOf(b)
        if (target) meshData.push({ source, target })
      }
    }
    if (meshData.length > 0) layers.push(line('mesh-edges', meshData, withAlpha(MAP.mesh, MAP.mesh[3] * la), 1.5))
  }

  // 2. Hover highlight edges (all modes)
  if (hoveredNode >= 0 && hoveredNode < n) {
    const hovId = nodes[hoveredNode].peer_id
    const hover = withAlpha(MAP.ringHover, MAP.ringHover[3] * 0.9)
    const hlEdgeData: Seg[] = []
    for (const [s, t] of edges) {
      if (s !== hovId && t !== hovId) continue
      const source = posOf(s), target = posOf(t)
      if (source && target) hlEdgeData.push({ source, target })
    }
    if (hlEdgeData.length > 0) layers.push(line('hover-edges', hlEdgeData, hover, 2, 2))

    // Peer ring outlines
    const peerPositions = nodes[hoveredNode].connected_peers.map(posOf).filter((p): p is Pos => p !== undefined)
    if (peerPositions.length > 0) {
      layers.push(ring('hover-peer-rings', {
        data: peerPositions,
        getPosition: (d: Pos) => d,
        getRadius: nodeRadius + 4,
        getLineColor: hover,
        lineWidthMinPixels: 1,
      }))
    }
  }

  // 3. Pulse rings
  if (pulses.length > 0) {
    const pulseData = pulses.filter(p => !hidden(nodes[p.nodeIdx])).map(p => ({
      position: nodePositions[p.nodeIdx],
      color: withAlpha(p.color, 56 * (1 - (now - p.startTime) / PULSE_RING_DURATION_MS)),
    }))
    layers.push(new ScatterplotLayer({
      id: 'pulses',
      data: pulseData,
      getPosition: (d: any) => d.position,
      getRadius: nodeRadius * 2.5,
      getFillColor: (d: any) => d.color,
      pickable: false,
      radiusUnits: 'common' as const,
      antialiasing: true,
    }))
  }

  // 3.5 Gossip message particles
  if (particles.length > 0) {
    const particleData = particles.map(p => {
      const age = now - p.startTime
      const progress = Math.min(1, age / PARTICLE_TRAVEL_MS)
      // Quadratic ease-out (netviz easing)
      const ease = 1 - (1 - progress) * (1 - progress)
      const src = nodePositions[p.fromIdx]
      const tgt = nodePositions[p.toIdx]
      if (!src || !tgt || hidden(nodes[p.fromIdx]) || hidden(nodes[p.toIdx])) return null
      // Dropped hops stall at 60% of the path and fade out over the last 400ms; delivered ones ride to the target
      const t = p.fizzle ? Math.min(ease, FIZZLE_AT) : ease
      const alpha = p.fizzle
        ? FIZZLE_ALPHA * Math.min(1, Math.max(0, (p.lifetime - age) / (p.lifetime - PARTICLE_TRAVEL_MS)))
        : 242 * (1 - progress * 0.5)
      return {
        position: bezierPoint(src, tgt, t),
        color: withAlpha(p.color, alpha),
        radius: nodeRadius * 0.3 * store.scale.particle * (p.fizzle ? 0.9 : 1),
      }
    }).filter(Boolean)

    if (particleData.length > 0) {
      layers.push(new ScatterplotLayer({
        id: 'particles',
        data: particleData,
        getPosition: (d: any) => d.position,
        getRadius: (d: any) => d.radius,
        getFillColor: (d: any) => d.color,
        radiusUnits: 'common' as const,
        radiusMinPixels: 1.9,
        radiusMaxPixels: 3.4,
        antialiasing: true,
        pickable: false,
      }))
    }
  }

  // 4. Node circles — pre-build data with resolved positions for reliability
  const nodeData = nodes.map((nd, i) => ({
    ...nd,
    _pos: nodePositions[i] ?? [0, 0] as Pos,
    _idx: i,
  })).filter(d => !hidden(d))
  type NodeDatum = (typeof nodeData)[number]

  // 4a. Attacker halo — grafted attackers only; a pruned one is drawn hollow instead
  const haloData = nodeData.filter(d => d.state === 'attacker' && d.connected_peers.length > 0)
  if (haloData.length > 0) {
    layers.push(ring('attacker-halos', {
      data: haloData,
      getPosition: (d: NodeDatum) => d._pos,
      getRadius: (d: NodeDatum) => radiusOf(d) * 1.7,
      getLineColor: withAlpha(STATE_COLORS.attacker, 140),
      lineWidthMinPixels: 1,
    }))
  }

  layers.push(new ScatterplotLayer({
    id: 'nodes',
    data: nodeData,
    getPosition: (d: NodeDatum) => d._pos,
    getRadius: radiusOf,
    getFillColor: (d: PeerNode) => nodeFillColor(d),
    getLineColor: (d: PeerNode) => nodeLineColor(d),
    getLineWidth: (d: PeerNode) => nodeLineWidth(d),
    stroked: true,
    filled: true,
    lineWidthUnits: 'pixels' as const,
    radiusUnits: 'common' as const,
    antialiasing: true,
    pickable: true,
    onClick: (info: any) => {
      if (info.object) {
        const idx = info.object._idx
        store.selectedNode = store.selectedNode === idx ? -1 : idx
        store.highlightPeers = []  // an event-row highlight belongs to the previous selection
        document.dispatchEvent(new CustomEvent('luminar:nodeselect'))
        renderLayers()
      }
    },
    onHover: (info: any) => {
      if (info.object) {
        store.hoveredNode = info.object._idx
        if (tooltipEl) showTooltip(tooltipEl, info.object as PeerNode, info.x, info.y)
      } else {
        store.hoveredNode = -1
        if (tooltipEl) tooltipEl.style.display = 'none'
      }
      renderLayers()
    },
    updateTriggers: {
      getFillColor: [stateKeys.join(',')],
      getRadius: [selectedNode],
      getPosition: [nodePositions],
    },
  }))

  // 4b. Telemetry node rings — green breathing outline to distinguish real peers
  const telemData = nodeData.filter((d: any) => d.is_telemetry || d.is_real)
  if (telemData.length > 0) {
    const breathe = 0.475 + 0.275 * Math.sin((2 * Math.PI * now) / 5600)  // .2 → .75
    layers.push(ring('telem-rings', {
      data: telemData,
      getPosition: (d: NodeDatum) => d._pos,
      getRadius: (d: NodeDatum) => radiusOf(d) * 1.6,
      getLineColor: withAlpha(MAP.ringTelemetry, breathe * 255),
      lineWidthMinPixels: 1.5,
    }))
  }

  // 5. Selection ring
  if (selectedNode >= 0 && selectedNode < n && nodePositions[selectedNode]) {
    layers.push(ring('selection-ring', {
      data: [nodePositions[selectedNode]],
      getPosition: (d: Pos) => d,
      getRadius: nodeRadius * 2,
      getLineColor: MAP.ringSelect,
      lineWidthMinPixels: 2,
    }))
  }

  // 6. Event-click highlight: lines from selected node to highlighted peers
  if (selectedNode >= 0 && store.highlightPeers.length > 0 && nodePositions[selectedNode]) {
    const fromPos = nodePositions[selectedNode]
    const targetPositions = store.highlightPeers.map(posOf).filter((p): p is Pos => p !== undefined)
    if (targetPositions.length > 0) {
      layers.push(line('event-highlight-edges', targetPositions.map(target => ({ source: fromPos, target })),
        withAlpha(MAP.ringHighlight, 161), 2.5, 2))
      layers.push(ring('event-highlight-rings', {
        data: targetPositions,
        getPosition: (d: Pos) => d,
        getRadius: nodeRadius * 1.8,
        getLineColor: withAlpha(MAP.ringHighlight, 230),
        lineWidthMinPixels: 1.5,
      }))
    }
  }

  // 7. Labels — attackers always, plus the selected and hovered node
  if (store.showLabels && fontsReady) {
    const labelData = nodeData.filter(d => d.state === 'attacker' || d._idx === selectedNode || d._idx === hoveredNode)
    if (labelData.length > 0) {
      layers.push(new TextLayer({
        id: 'labels',
        data: labelData,
        // anchor sits just right of the disc in world units so it tracks zoom without a re-render
        getPosition: (d: NodeDatum) => [d._pos[0] + radiusOf(d) * (d.state === 'attacker' ? 2 : 2.2), d._pos[1]],
        getPixelOffset: [3, 0],
        getText: (d: NodeDatum) => d.state === 'attacker' ? d.peer_id : shortName(d),
        getColor: (d: NodeDatum) => d.state !== 'attacker' ? MAP.fg : d.connected_peers.length === 0 ? MAP.pruned : MAP.dangerText,
        getSize: 10 * (store.stageTheme ? 1.2 : 1),
        sizeUnits: 'pixels' as const,
        getTextAnchor: 'start' as const,
        getAlignmentBaseline: 'center' as const,
        fontFamily: '"Geist Mono", "JetBrains Mono", monospace',
        fontWeight: 500,
        pickable: false,
      }))
    }
  }

  deck.setProps({ layers })
}

let animationFrame = 0

export function startAnimationLoop() {
  function tick() {
    if (pulses.length > 0 || particles.length > 0) {
      renderLayers()  // Re-render to update particle/pulse positions
    }
    animationFrame = requestAnimationFrame(tick)
  }
  animationFrame = requestAnimationFrame(tick)
}

function stopAnimationLoop() {
  cancelAnimationFrame(animationFrame)
}

/** Current deck view state (debug / e2e). */
export function getViewState(): unknown {
  const vm = (deck as any)?.viewManager
  return vm?.getViewports?.()[0] ? { ...vm.getViewports()[0] } : null
}

export function fitView() {
  if (!deck) return
  const positions = store.nodePositions
  if (positions.length === 0) return

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  if (store.layoutMode === 'geo') {
    ({ minX, minY, maxX, maxY } = WORLD_BOUNDS)  // the whole map, not just where the nodes are
  } else {
    for (let i = 0; i < positions.length; i++) {
      const [x, y] = positions[i]
      if (x < minX) minX = x; if (y < minY) minY = y
      if (x > maxX) maxX = x; if (y > maxY) maxY = y
    }
  }

  const pad = 80
  const dx = maxX - minX || 1
  const dy = maxY - minY || 1
  const el = (deck as any).canvas?.parentElement
  const W = el?.clientWidth ?? 800
  const H = el?.clientHeight ?? 600
  const zoom = Math.log2(Math.min((W - pad * 2) / dx, (H - pad * 2) / dy))

  deck.setProps({
    initialViewState: {
      target: [(minX + maxX) / 2, (minY + maxY) / 2, 0],
      zoom: Math.min(zoom, 4),
      transitionDuration: 500,
    } as any,
  })
}

// ── Tooltip ──

function el(tag: string, className: string, text?: string, color?: string): HTMLElement {
  const e = document.createElement(tag)
  e.className = className
  if (text !== undefined) e.textContent = text
  if (color) e.style.color = color
  return e
}

function row(parent: HTMLElement, label: string, value: string, valueClass = ''): void {
  const r = el('div', 'lm-tip-row')
  r.appendChild(el('span', '', label))
  r.appendChild(el('span', valueClass, value))
  parent.appendChild(r)
}

/** Fill and place the tooltip; the stylesheet owns its look (display:flex), inline display only hides it. */
function showTooltip(tip: HTMLElement, node: PeerNode, x: number, y: number): void {
  updateTooltipContent(tip, node)
  tip.style.display = ''
  const box = tip.parentElement
  const maxLeft = box ? box.clientWidth - tip.offsetWidth - 8 : Infinity
  const maxTop = box ? box.clientHeight - tip.offsetHeight - 8 : Infinity
  tip.style.left = Math.max(0, Math.min(x + 16, maxLeft)) + 'px'
  tip.style.top = Math.max(0, Math.min(y - 10, maxTop)) + 'px'
}

const shortId = (id: string) => id.length > 16 ? `${id.slice(0, 9)}…${id.slice(-4)}` : id
const signed = (v: number) => (v >= 0 ? '+' : '') + v.toFixed(2)

function updateTooltipContent(tip: HTMLElement, node: PeerNode): void {
  tip.textContent = ''
  const attacker = node.state === 'attacker'
  const pruned = attacker && node.connected_peers.length === 0
  const tone = pruned ? 'var(--lm-node-pruned)' : attacker ? 'var(--lm-danger-text)' : undefined

  const head = el('div', 'lm-tip-head')
  head.appendChild(el('span', 'lm-tip-name', shortName(node), tone))
  const badge = el('span', 'lm-tip-badge', pruned ? 'PRUNED' : node.state.toUpperCase(), tone ?? STATE_CSS[node.state])
  badge.dataset.state = pruned ? 'pruned' : node.state
  head.appendChild(badge)
  tip.appendChild(head)
  tip.appendChild(el('div', 'lm-tip-id', shortId(node.peer_id)))

  const traffic = `↑${node.messages_sent.toLocaleString()} · ↓${node.messages_received.toLocaleString()}`
  if (attacker) {
    row(tip, 'grafted into', `${node.connected_peers.length} meshes`)
    row(tip, 'score', signed(node.gossip_score), 'lm-danger-text')
    row(tip, 'sent · recv', traffic)
    if (node.connected_peers.length > 0) {
      const victims = node.connected_peers.map(id => {
        const i = store.nodeIndex.get(id)
        return i !== undefined ? shortName(store.nodes[i]) : id
      })
      tip.appendChild(el('div', 'lm-tip-peers', victims.join(' ')))
    }
    return
  }

  row(tip, 'peers', String(node.connected_peers.length))
  row(tip, 'score', signed(node.gossip_score), node.gossip_score < 0 ? 'lm-danger-text' : '')
  row(tip, 'sent · recv', traffic)
  const sybils = (store.mesh[node.peer_id] ?? node.connected_peers).filter(isAttackerId).length
  if (sybils > 0) row(tip, 'mesh', `${sybils} sybil graft${sybils === 1 ? '' : 's'}`, 'lm-danger-text')
}

export function destroyRenderer() {
  deck?.finalize()
  deck = null
}

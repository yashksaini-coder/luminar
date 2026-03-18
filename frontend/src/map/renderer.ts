import { Deck, OrthographicView } from '@deck.gl/core'
import { ScatterplotLayer, LineLayer } from '@deck.gl/layers'
import { store } from '../store'
import { chrome, STATE_COLORS, oklchToRgba, P, PULSE_RING_DURATION_MS } from '../palette'
import type { PeerNode } from '../types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let deck: any = null
let tooltipEl: HTMLElement | null = null

// Pulse tracking
interface Pulse {
  nodeIdx: number
  startTime: number
  color: [number, number, number, number]
}
const pulses: Pulse[] = []
let prevStates: string[] = []
let _nodeClickHandled = false

// Particle tracking (gossip message animations)
interface Particle {
  fromIdx: number
  toIdx: number
  startTime: number
  color: [number, number, number, number]
  lifetime: number  // ms
}

const particles: Particle[] = []
const PARTICLE_LIFETIME_MS = 1200
const PARTICLE_TRAVEL_MS = 800

export function spawnParticle(fromPeerId: string, toPeerId: string, color?: [number, number, number, number]) {
  if (!store.particlesEnabled) return
  if (particles.length > 300) return  // cap
  const fromIdx = store.nodeIndex.get(fromPeerId)
  const toIdx = store.nodeIndex.get(toPeerId)
  if (fromIdx === undefined || toIdx === undefined) return
  if (!store.nodePositions[fromIdx] || !store.nodePositions[toIdx]) return

  particles.push({
    fromIdx,
    toIdx,
    startTime: performance.now(),
    color: color ?? oklchToRgba(P.receiving, 180),
    lifetime: PARTICLE_LIFETIME_MS,
  })
}

export function initRenderer(canvas: HTMLCanvasElement, tooltip: HTMLElement) {
  tooltipEl = tooltip

  // Background click to deselect
  canvas.addEventListener('click', () => {
    // Delay check — deck.gl onClick fires synchronously before this
    setTimeout(() => {
      if (!_nodeClickHandled && store.selectedNode >= 0) {
        store.selectedNode = -1
        store.highlightPeers = []
        if (tooltipEl) tooltipEl.style.display = 'none'
        renderLayers()
      }
      _nodeClickHandled = false
    }, 0)
  })

  deck = new Deck({
    canvas,
    views: new OrthographicView({ flipY: false }) as any,
    initialViewState: { target: [0, 0, 0], zoom: 0 } as any,
    controller: true,
    layers: [],
    getCursor: ({ isHovering }: { isHovering: boolean }) => isHovering ? 'pointer' : 'grab',
    width: canvas.parentElement!.clientWidth,
    height: canvas.parentElement!.clientHeight,
  })
}

export function resizeRenderer(w: number, h: number) {
  deck?.setProps({ width: w, height: h })
}

export function renderLayers() {
  if (!deck) return

  const { nodes, edges, nodePositions, selectedNode, hoveredNode } = store
  const n = nodes.length
  if (n === 0 || nodePositions.length === 0) { deck.setProps({ layers: [] }); return }

  // Node radius scales with count; smaller in grid/radial for cleaner look
  const baseRadius = Math.max(3, Math.min(8, 200 / Math.sqrt(n)))
  const nodeRadius = store.layoutMode === 'force' ? baseRadius : baseRadius * 0.7
  const now = performance.now()

  // Cap arrays to prevent memory issues during high throughput
  if (pulses.length > 200) pulses.splice(0, pulses.length - 200)
  if (particles.length > 300) particles.splice(0, particles.length - 300)

  // Detect state changes for pulse animation
  if (prevStates.length === n) {
    for (let i = 0; i < n; i++) {
      if (nodes[i].state !== prevStates[i] && nodes[i].state !== 'idle') {
        pulses.push({
          nodeIdx: i,
          startTime: now,
          color: STATE_COLORS[nodes[i].state] ?? STATE_COLORS.idle,
        })
      }
    }
  }
  prevStates = nodes.map(nd => nd.state)

  // Prune expired pulses
  for (let i = pulses.length - 1; i >= 0; i--) {
    if (now - pulses[i].startTime > PULSE_RING_DURATION_MS) pulses.splice(i, 1)
  }

  // Prune expired particles
  for (let i = particles.length - 1; i >= 0; i--) {
    if (now - particles[i].startTime > particles[i].lifetime) particles.splice(i, 1)
  }

  const layers: any[] = []

  // Pre-resolve edge positions (like netviz — resolve at render time, not via accessor)
  const edgeData = edges.map(([s, t]) => {
    const si = store.nodeIndex.get(s)
    const ti = store.nodeIndex.get(t)
    return {
      source: si !== undefined && nodePositions[si] ? nodePositions[si] : null,
      target: ti !== undefined && nodePositions[ti] ? nodePositions[ti] : null,
    }
  }).filter(e => e.source && e.target) as { source: [number, number]; target: [number, number] }[]

  // 1. Topology edges (all modes — lighter in grid/radial for cleaner look)
  if (store.showEdges && edgeData.length > 0) {
    const edgeAlpha = store.layoutMode === 'force' ? 200 : 80
    layers.push(new LineLayer({
      id: 'edges',
      data: edgeData,
      getSourcePosition: (d: { source: [number, number] }) => d.source,
      getTargetPosition: (d: { target: [number, number] }) => d.target,
      getColor: [...chrome.border.rgba.slice(0, 3), edgeAlpha] as [number, number, number, number],
      getWidth: 1,
      widthMinPixels: 1,
      pickable: false,
    }))
  }

  // 2. Hover highlight edges (all modes)
  if (hoveredNode >= 0 && hoveredNode < n) {
    const hovId = nodes[hoveredNode].peer_id
    const hlEdgeData = edges
      .filter(([s, t]) => s === hovId || t === hovId)
      .map(([s, t]) => ({
        source: nodePositions[store.nodeIndex.get(s) ?? 0],
        target: nodePositions[store.nodeIndex.get(t) ?? 0],
      }))
      .filter(e => e.source && e.target) as { source: [number, number]; target: [number, number] }[]

    if (hlEdgeData.length > 0) {
      layers.push(new LineLayer({
        id: 'hover-edges',
        data: hlEdgeData,
        getSourcePosition: (d: { source: [number, number] }) => d.source,
        getTargetPosition: (d: { target: [number, number] }) => d.target,
        getColor: oklchToRgba(P.hover, 120),
        getWidth: 2,
        widthMinPixels: 2,
      }))
    }

    // Peer ring outlines
    const peerIds = nodes[hoveredNode].connected_peers
    const peerPositions = peerIds
      .map(id => {
        const idx = store.nodeIndex.get(id)
        return idx !== undefined ? nodePositions[idx] : undefined
      })
      .filter((p): p is [number, number] => p !== undefined)
    if (peerPositions.length > 0) {
      layers.push(new ScatterplotLayer({
        id: 'hover-peer-rings',
        data: peerPositions,
        getPosition: (d: [number, number]) => d,
        getRadius: nodeRadius + 4,
        getLineColor: oklchToRgba(P.hover, 140),
        stroked: true,
        filled: false,
        lineWidthMinPixels: 1.5,
        radiusUnits: 'common' as const,
        antialiasing: true,
        lineWidthUnits: 'pixels' as const,
      }))
    }
  }

  // 3. Pulse rings
  if (pulses.length > 0) {
    const pulseData = pulses.map(p => {
      const age = now - p.startTime
      const alpha = Math.floor(80 * (1 - age / PULSE_RING_DURATION_MS))
      return {
        position: nodePositions[p.nodeIdx],
        radius: nodeRadius * 2.5,
        color: [p.color[0], p.color[1], p.color[2], alpha] as [number, number, number, number],
      }
    })
    layers.push(new ScatterplotLayer({
      id: 'pulses',
      data: pulseData,
      getPosition: (d: any) => d.position,
      getRadius: (d: any) => d.radius,
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
      const src = store.nodePositions[p.fromIdx]
      const tgt = store.nodePositions[p.toIdx]
      if (!src || !tgt) return null
      const alpha = Math.floor(180 * (1 - progress * 0.5))
      return {
        position: [
          src[0] + (tgt[0] - src[0]) * ease,
          src[1] + (tgt[1] - src[1]) * ease,
        ] as [number, number],
        color: [p.color[0], p.color[1], p.color[2], alpha] as [number, number, number, number],
        radius: nodeRadius * 0.4,  // Small dots like netviz arc particles
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
        antialiasing: true,
        pickable: false,
      }))
    }
  }

  // 4. Node circles — pre-build data with resolved positions for reliability
  const nodeData = nodes.map((nd, i) => ({
    ...nd,
    _pos: nodePositions[i] ?? [0, 0] as [number, number],
    _idx: i,
  }))

  layers.push(new ScatterplotLayer({
    id: 'nodes',
    data: nodeData,
    getPosition: (d: any) => d._pos,
    getRadius: (d: any) =>
      d._idx === selectedNode ? nodeRadius * 1.5 : nodeRadius,
    getFillColor: (d: PeerNode) => STATE_COLORS[d.state] ?? STATE_COLORS.idle,
    radiusUnits: 'common' as const,
    antialiasing: true,
    pickable: true,
    onClick: (info: any) => {
      if (info.object) {
        _nodeClickHandled = true
        const idx = info.object._idx
        store.selectedNode = store.selectedNode === idx ? -1 : idx
        renderLayers()
      }
    },
    onHover: (info: any) => {
      if (info.object) {
        store.hoveredNode = info.object._idx
        if (tooltipEl) {
          tooltipEl.style.display = 'block'
          tooltipEl.style.left = (info.x + 12) + 'px'
          tooltipEl.style.top = (info.y - 8) + 'px'
          updateTooltipContent(tooltipEl, info.object as PeerNode)
        }
      } else {
        store.hoveredNode = -1
        if (tooltipEl) tooltipEl.style.display = 'none'
      }
      renderLayers()
    },
    updateTriggers: {
      getFillColor: [nodes.map(nd => nd.state).join(',')],
      getRadius: [selectedNode],
      getPosition: [nodePositions],
    },
  }))

  // 5. Selection ring
  if (selectedNode >= 0 && selectedNode < n && nodePositions[selectedNode]) {
    layers.push(new ScatterplotLayer({
      id: 'selection-ring',
      data: [nodePositions[selectedNode]],
      getPosition: (d: [number, number]) => d,
      getRadius: nodeRadius * 2,
      getFillColor: [0, 0, 0, 0],
      getLineColor: [255, 255, 255, 255],
      stroked: true,
      filled: false,
      lineWidthMinPixels: 2,
      radiusUnits: 'common' as const,
      antialiasing: true,
      lineWidthUnits: 'pixels' as const,
    }))
  }

  // 6. Event-click highlight: lines from selected node to highlighted peers
  if (selectedNode >= 0 && store.highlightPeers.length > 0 && nodePositions[selectedNode]) {
    const fromPos = nodePositions[selectedNode]
    const hlLineData = store.highlightPeers
      .map(peerId => {
        const idx = store.nodeIndex.get(peerId)
        if (idx === undefined || !nodePositions[idx]) return null
        return { source: fromPos, target: nodePositions[idx] }
      })
      .filter(Boolean) as { source: [number, number]; target: [number, number] }[]

    if (hlLineData.length > 0) {
      // Highlight lines (bright accent color)
      layers.push(new LineLayer({
        id: 'event-highlight-edges',
        data: hlLineData,
        getSourcePosition: (d: { source: [number, number] }) => d.source,
        getTargetPosition: (d: { target: [number, number] }) => d.target,
        getColor: oklchToRgba(P.receiving, 160),
        getWidth: 2.5,
        widthMinPixels: 2,
      }))

      // Target node rings
      const targetPositions = store.highlightPeers
        .map(id => {
          const idx = store.nodeIndex.get(id)
          return idx !== undefined ? nodePositions[idx] : undefined
        })
        .filter((p): p is [number, number] => p !== undefined)

      layers.push(new ScatterplotLayer({
        id: 'event-highlight-rings',
        data: targetPositions,
        getPosition: (d: [number, number]) => d,
        getRadius: nodeRadius * 1.8,
        getFillColor: [0, 0, 0, 0],
        getLineColor: oklchToRgba(P.receiving, 180),
        stroked: true,
        filled: false,
        lineWidthMinPixels: 1.5,
        radiusUnits: 'common' as const,
        antialiasing: true,
        lineWidthUnits: 'pixels' as const,
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

export function fitView() {
  if (!deck) return
  const positions = store.nodePositions
  if (positions.length === 0) return

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const [x, y] of positions) {
    if (x < minX) minX = x; if (y < minY) minY = y
    if (x > maxX) maxX = x; if (y > maxY) maxY = y
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

/** Build tooltip DOM — richer metrics for active states */
function updateTooltipContent(el: HTMLElement, node: PeerNode): void {
  el.textContent = ''

  const stateColor = STATE_COLORS[node.state] ?? STATE_COLORS.idle
  const rgbStr = `rgb(${stateColor[0]},${stateColor[1]},${stateColor[2]})`
  const isActive = node.state !== 'idle'

  // Header: peer name + colored state badge
  const header = document.createElement('div')
  header.style.cssText = 'display:flex;align-items:center;gap:6px;margin-bottom:2px'
  const name = document.createElement('b')
  name.textContent = `n${node.index}`
  const nameDetail = document.createElement('span')
  nameDetail.style.cssText = 'color:var(--text3);font-size:10px'
  nameDetail.textContent = node.peer_id
  const stateSpan = document.createElement('span')
  stateSpan.style.cssText = `color:${rgbStr};font-size:10px;font-weight:600`
  stateSpan.textContent = `[${node.state.charAt(0).toUpperCase() + node.state.slice(1)}]`
  header.appendChild(name)
  header.appendChild(nameDetail)
  header.appendChild(stateSpan)
  el.appendChild(header)

  // Summary line: peers · score
  const summary = document.createElement('div')
  summary.style.cssText = 'font-size:10px;color:var(--text2);margin-bottom:2px'
  const scoreColor = node.gossip_score > 0 ? 'oklch(0.75 0.14 155)' :
                     node.gossip_score < 0 ? 'oklch(0.65 0.20 25)' : 'var(--text3)'
  summary.innerHTML = ''
  summary.textContent = `${node.connected_peers.length} peers`
  const scorePart = document.createElement('span')
  scorePart.style.cssText = `color:${scoreColor};font-weight:600`
  scorePart.textContent = ` · ${node.gossip_score.toFixed(3)}`
  summary.appendChild(scorePart)
  el.appendChild(summary)

  // Traffic: ↑sent · ↓received
  const traffic = document.createElement('div')
  traffic.style.cssText = 'font-size:10px;margin-bottom:2px'
  const sentSpan = document.createElement('span')
  sentSpan.style.color = 'oklch(0.72 0.12 230)'
  sentSpan.textContent = `\u2191${node.messages_sent}`
  const recvSpan = document.createElement('span')
  recvSpan.style.color = 'oklch(0.75 0.14 155)'
  recvSpan.textContent = `\u2193${node.messages_received}`
  traffic.appendChild(sentSpan)
  traffic.appendChild(document.createTextNode(' \u00b7 '))
  traffic.appendChild(recvSpan)
  el.appendChild(traffic)

  // State-specific metrics
  if (isActive) {
    const sep = document.createElement('div')
    sep.style.cssText = 'height:1px;background:var(--border-subtle);margin:4px 0'
    el.appendChild(sep)

    const metrics = document.createElement('div')
    metrics.style.cssText = 'font-size:9px;color:var(--text2);display:flex;flex-direction:column;gap:1px'

    if (node.state === 'receiving' || node.state === 'decoded') {
      // Gossip activity metrics
      const ratio = node.messages_received > 0
        ? ((node.messages_received / Math.max(node.messages_sent + node.messages_received, 1)) * 100).toFixed(0)
        : '0'
      addMetricRow(metrics, 'Recv ratio', `${ratio}%`, 'oklch(0.75 0.14 155)')
      addMetricRow(metrics, 'Msg/peer', (node.messages_received / Math.max(node.connected_peers.length, 1)).toFixed(1), 'oklch(0.72 0.12 230)')
    }

    if (node.state === 'origin') {
      addMetricRow(metrics, 'Published', String(node.messages_sent), 'oklch(0.72 0.14 300)')
    }

    if (node.state === 'failed' || node.state === 'error') {
      addMetricRow(metrics, 'Status', node.state.toUpperCase(), 'oklch(0.65 0.20 25)')
    }

    // Score breakdown hint
    if (Math.abs(node.gossip_score) > 0.01) {
      const tier = node.gossip_score >= 5 ? 'Excellent' :
                   node.gossip_score >= 1 ? 'Good' :
                   node.gossip_score >= 0 ? 'Neutral' :
                   node.gossip_score >= -5 ? 'Poor' : 'Bad'
      addMetricRow(metrics, 'Rating', tier, scoreColor)
    }

    el.appendChild(metrics)
  }

  // Connected peers
  if (node.connected_peers.length > 0) {
    const peers = document.createElement('div')
    peers.style.cssText = 'font-size:9px;color:var(--text3);margin-top:3px;max-width:200px;word-break:break-all'
    const shown = node.connected_peers.slice(0, 6).map(p => p.replace('peer-', '#')).join(', ')
    const more = node.connected_peers.length > 6 ? ` +${node.connected_peers.length - 6}` : ''
    peers.textContent = shown + more
    el.appendChild(peers)
  }
}

function addMetricRow(parent: HTMLElement, label: string, value: string, color: string) {
  const row = document.createElement('div')
  row.style.cssText = 'display:flex;justify-content:space-between;gap:12px'
  const lbl = document.createElement('span')
  lbl.style.color = 'var(--text3)'
  lbl.textContent = label
  const val = document.createElement('span')
  val.style.cssText = `color:${color};font-weight:600;font-variant-numeric:tabular-nums`
  val.textContent = value
  row.appendChild(lbl)
  row.appendChild(val)
  parent.appendChild(row)
}

export function destroyRenderer() {
  deck?.finalize()
  deck = null
}

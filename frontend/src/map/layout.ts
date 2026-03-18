import { forceSimulation, forceLink, forceManyBody, forceCenter, forceCollide, type Simulation, type SimulationNodeDatum, type SimulationLinkDatum } from 'd3-force'
import type { LayoutMode, PeerNode } from '../types'

export interface LayoutResult {
  positions: [number, number][]
}

// ── Live d3-force simulation (Obsidian-like interactive physics) ─────

interface ForceNode extends SimulationNodeDatum {
  id: string
  x: number
  y: number
  fx?: number | null
  fy?: number | null
}

interface ForceLink extends SimulationLinkDatum<ForceNode> {
  source: string | ForceNode
  target: string | ForceNode
}

let liveSim: Simulation<ForceNode, ForceLink> | null = null
let liveNodes: ForceNode[] = []
let onTickCallback: ((positions: [number, number][]) => void) | null = null
let currentNodeCount = 0

/** Start or restart the live force simulation. Call once on topology change. */
export function startLiveForce(
  nodes: PeerNode[],
  edges: [string, string][],
  onTick: (positions: [number, number][]) => void,
) {
  // Stop any existing simulation
  if (liveSim) liveSim.stop()
  onTickCallback = onTick

  const n = nodes.length
  if (n === 0) { onTick([]); return }

  const baseDist = Math.max(40, 400 / Math.sqrt(n))
  const initRadius = Math.min(300, n * 6)

  // Reuse existing positions if node count matches (topology update without reset)
  const oldMap = new Map<string, ForceNode>()
  for (const fn of liveNodes) oldMap.set(fn.id, fn)

  liveNodes = nodes.map((nd, i) => {
    const existing = oldMap.get(nd.peer_id)
    return {
      id: nd.peer_id,
      x: existing?.x ?? initRadius * Math.cos((2 * Math.PI * i) / n),
      y: existing?.y ?? initRadius * Math.sin((2 * Math.PI * i) / n),
      fx: existing?.fx,
      fy: existing?.fy,
    }
  })
  currentNodeCount = n

  const links: ForceLink[] = edges.map(([s, t]) => ({ source: s, target: t }))

  liveSim = forceSimulation<ForceNode, ForceLink>(liveNodes)
    .force('link', forceLink<ForceNode, ForceLink>(links)
      .id(d => d.id)
      .strength(0.4)
      .distance(baseDist))
    .force('charge', forceManyBody<ForceNode>()
      .strength(-800)
      .distanceMax(baseDist * 6)
      .theta(0.9))
    .force('center', forceCenter(0, 0).strength(0.03))
    .force('collide', forceCollide<ForceNode>(baseDist * 0.25).iterations(2))
    .alphaDecay(0.01)        // Slow decay — keeps nodes slightly alive
    .velocityDecay(0.35)     // Springy feel like Obsidian
    .on('tick', () => {
      if (onTickCallback) {
        onTickCallback(liveNodes.map(fn => [fn.x, fn.y]))
      }
    })

  // Warm up with a quick burst so initial layout isn't chaotic
  liveSim.alpha(1)
  for (let i = 0; i < 80; i++) liveSim.tick()
  // Then let it continue running live
  liveSim.alpha(0.3).restart()
}

/** Stop the live simulation */
export function stopLiveForce() {
  if (liveSim) { liveSim.stop(); liveSim = null }
  liveNodes = []
  onTickCallback = null
}

/** Check if live sim is running */
export function isLiveForceActive(): boolean {
  return liveSim !== null
}

// ── Static layout computation (for Grid and Radial modes) ────────────

export function computeLayout(
  mode: LayoutMode,
  nodes: PeerNode[],
  _edges: [string, string][],
): LayoutResult {
  switch (mode) {
    case 'force': return { positions: [] }  // Force uses live sim, not static
    case 'grid': return layoutGrid(nodes)
    case 'radial': return layoutRadial(nodes, _edges)
  }
}

// ── Grid layout ───────────────────────────────────────────────────────
function layoutGrid(nodes: PeerNode[]): LayoutResult {
  const n = nodes.length
  if (n === 0) return { positions: [] }

  const stateOrder: Record<string, number> = {
    origin: 0, receiving: 1, decoded: 2, joining: 3,
    idle: 4, failed: 5, error: 6,
  }
  const sorted = nodes.map((nd, i) => ({ idx: i, order: stateOrder[nd.state] ?? 4 }))
    .sort((a, b) => a.order - b.order || a.idx - b.idx)

  const spacing = Math.max(14, Math.min(28, 600 / Math.sqrt(n)))
  const cols = Math.ceil(Math.sqrt(n * 1.3))
  const rowH = spacing * 0.866

  const positions: [number, number][] = new Array(n)
  const totalW = (cols - 1) * spacing
  const totalRows = Math.ceil(n / cols)
  const totalH = (totalRows - 1) * rowH

  for (let rank = 0; rank < sorted.length; rank++) {
    const row = Math.floor(rank / cols)
    const col = rank % cols
    const stagger = (row % 2 === 1) ? spacing * 0.5 : 0
    positions[sorted[rank].idx] = [
      col * spacing + stagger - totalW / 2,
      row * rowH - totalH / 2,
    ]
  }

  return { positions }
}

// ── Radial layout ─────────────────────────────────────────────────────
function layoutRadial(nodes: PeerNode[], edges: [string, string][]): LayoutResult {
  const n = nodes.length
  if (n === 0) return { positions: [] }

  const degree = new Map<string, number>()
  for (const nd of nodes) degree.set(nd.peer_id, 0)
  for (const [s, t] of edges) {
    degree.set(s, (degree.get(s) ?? 0) + 1)
    degree.set(t, (degree.get(t) ?? 0) + 1)
  }

  const sorted = nodes.map((nd, i) => ({ idx: i, deg: degree.get(nd.peer_id) ?? 0 }))
    .sort((a, b) => b.deg - a.deg)

  const baseRadius = Math.max(25, 120 / Math.sqrt(n))
  const ringGap = Math.max(18, 100 / Math.sqrt(n))

  const positions: [number, number][] = new Array(n)
  if (sorted.length > 0) positions[sorted[0].idx] = [0, 0]

  let placed = 1
  let ring = 1
  while (placed < n) {
    const radius = baseRadius + (ring - 1) * ringGap
    const circumference = 2 * Math.PI * radius
    const maxInRing = Math.max(6, Math.floor(circumference / (ringGap * 0.55)))
    const inThisRing = Math.min(maxInRing, n - placed)

    for (let i = 0; i < inThisRing; i++) {
      const angle = (2 * Math.PI * i) / inThisRing - Math.PI / 2
      positions[sorted[placed].idx] = [
        radius * Math.cos(angle),
        radius * Math.sin(angle),
      ]
      placed++
    }
    ring++
  }

  return { positions }
}

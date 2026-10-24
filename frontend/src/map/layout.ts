import { forceSimulation, forceLink, forceManyBody, forceCenter, forceCollide, forceRadial, type SimulationNodeDatum, type SimulationLinkDatum } from 'd3-force'
import type { LayoutMode, PeerNode } from '../types'

export interface LayoutResult {
  positions: [number, number][]
}

// ── One-shot d3-force layout ──────────────────────────────────────────
// The graph is laid out once and frozen: nothing drifts between frames. A topology change
// (new edge set) lays everything out from scratch; a node set change on the same topology
// (attackers appearing or leaving, feed on/off) pins every known node and only settles the
// new ones, so the mesh the audience is looking at never moves.

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
  weak?: boolean  // pruned attacker → last victim: keeps it beside the cluster, not in it
}

/** Edge list entry: [source, target, weak?] */
/** One provenance per view: Geo draws real observers only; Force and Radial draw the
 *  simulation only. Shared by the renderer, fitView and the layouts so hidden nodes never
 *  take part in physics, ring packing or the fit either. */
export function isSimPeer(nd: { is_real?: boolean; is_telemetry?: boolean }): boolean {
  return !nd.is_real && !nd.is_telemetry
}
export function isNodeVisible(mode: LayoutMode, nd: { is_real?: boolean; is_telemetry?: boolean } | undefined): boolean {
  if (!nd) return false
  return mode === 'geo' ? !isSimPeer(nd) : isSimPeer(nd)
}

/** Degrees → canvas units for the Geo layout; must match backend/live/mainnet.py GEO_SCALE. */
export const GEO_SCALE = 2.5

export type LayoutEdge = [string, string] | [string, string, true]

const placed = new Map<string, [number, number]>()  // last frozen position per peer id
let placedTopology = ''  // the edge-set key those positions were computed for

function layoutForce(allNodes: PeerNode[], edges: LayoutEdge[], topologyKey: string): [number, number][] {
  const full: [number, number][] = allNodes.map(() => [0, 0])
  // Only nodes drawn in Force take part: hidden ones get no charge, no slot, no centroid
  // weight, and are reported at the origin so the positions array stays index-aligned.
  const visibleIdx = allNodes.map((nd, i) => (isNodeVisible('force', nd) ? i : -1)).filter(i => i >= 0)
  const n = visibleIdx.length
  if (n === 0) return full

  const cold = topologyKey !== placedTopology
  if (cold) placed.clear()
  const visibleIds = new Set(visibleIdx.map(i => allNodes[i].peer_id))
  const links: ForceLink[] = edges
    .filter(([s, t]) => visibleIds.has(s) && visibleIds.has(t))
    .map(([s, t, weak]) => ({ source: s, target: t, weak: weak === true }))
  const baseDist = Math.max(40, 400 / Math.sqrt(n))
  const initRadius = Math.min(300, n * 6)

  // New nodes start beside their first linked neighbour (an attacker next to its victim),
  // else on a ring; known nodes start where they were and stay pinned there.
  const firstNeighbour = new Map<string, string>()
  for (const [s, t] of links.map(l => [l.source as string, l.target as string])) {
    if (!firstNeighbour.has(s)) firstNeighbour.set(s, t)
    if (!firstNeighbour.has(t)) firstNeighbour.set(t, s)
  }
  const nodes: ForceNode[] = visibleIdx.map((i, k) => {
    const id = allNodes[i].peer_id
    const known = placed.get(id)
    if (known) return { id, x: known[0], y: known[1], fx: known[0], fy: known[1] }
    const near = placed.get(firstNeighbour.get(id) ?? '')
    const a = (2 * Math.PI * k) / n
    return near
      ? { id, x: near[0] + baseDist * Math.cos(a), y: near[1] + baseDist * Math.sin(a) }
      : { id, x: initRadius * Math.cos(a), y: initRadius * Math.sin(a) }
  })

  const sim = forceSimulation<ForceNode, ForceLink>(nodes)
    .force('link', forceLink<ForceNode, ForceLink>(links)
      .id(d => d.id)
      .strength(l => l.weak ? 0.2 : 0.4)
      .distance(l => l.weak ? baseDist * 1.6 : baseDist))
    .force('charge', forceManyBody<ForceNode>()
      .strength(-800)
      .distanceMax(baseDist * 6)
      .theta(0.9))
    .force('center', forceCenter(0, 0).strength(0.03))
    // A node with no links has nothing holding it and charge flings it to the corner, which
    // makes the fit zoom out for one dot: keep isolated nodes on the cluster's rim instead.
    .force('rim', forceRadial<ForceNode>(initRadius, 0, 0).strength(d => firstNeighbour.has(d.id) ? 0 : 0.3))
    .force('collide', forceCollide<ForceNode>(baseDist * 0.25).iterations(2))
    .stop()
  // ponytail: synchronous ticks; ~50 ms at 50 nodes, about a second at 500 (cold only)
  const ticks = cold ? (n > 200 ? 150 : 300) : 60
  sim.alpha(cold ? 1 : 0.5)
  for (let i = 0; i < ticks; i++) sim.tick()

  placedTopology = topologyKey
  nodes.forEach((fn, k) => {
    placed.set(fn.id, [fn.x, fn.y])
    full[visibleIdx[k]] = [fn.x, fn.y]
  })
  return full
}

// ── Layout entry point ────────────────────────────────────────────────

export function computeLayout(
  mode: LayoutMode,
  nodes: PeerNode[],
  edges: LayoutEdge[],
  topologyKey = '',  // Force only: same key → known nodes stay where they are
): LayoutResult {
  switch (mode) {
    case 'force': return { positions: layoutForce(nodes, edges, topologyKey) }
    // Producers project y down (y = −lat·2.5); the orthographic view's y points up, so flip once here
    case 'geo': return { positions: nodes.map(n => [n.x, -n.y] as [number, number]) }
    case 'radial': return layoutRadial(nodes, edges)
  }
}

// ── Radial layout ─────────────────────────────────────────────────────
function layoutRadial(allNodes: PeerNode[], edges: LayoutEdge[]): LayoutResult {
  const visibleIdx = allNodes.map((nd, i) => (isNodeVisible('radial', nd) ? i : -1)).filter(i => i >= 0)
  const nodes = visibleIdx.map(i => allNodes[i])
  const n = nodes.length
  if (n === 0) return { positions: allNodes.map(() => [0, 0] as [number, number]) }

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
    // One node diameter (~11 units at 50 nodes) plus a gap per slot; 0.55 overlapped circles
    const maxInRing = Math.max(6, Math.floor(circumference / ringGap))
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

  const full: [number, number][] = allNodes.map(() => [0, 0])
  visibleIdx.forEach((orig, k) => { full[orig] = positions[k] })
  return { positions: full }
}

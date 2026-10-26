import { forceCenter, forceCollide, forceLink, forceManyBody, forceSimulation, type SimulationLinkDatum, type SimulationNodeDatum } from 'd3-force'
import { isSimPeer } from '@/lib/format'
import type { Edge, LayoutEdge, LayoutMode, PeerNode } from '@/lib/types'

export { isSimPeer } from '@/lib/format'

export interface LayoutResult {
  positions: [number, number][]  // index-aligned with nodes; hidden nodes at [0,0]
}

/** Degrees → canvas units for the Geo layout; must match backend/live/mainnet.py GEO_SCALE. */
export const GEO_SCALE = 2.5
export const WORLD_BOUNDS = { minX: -180 * GEO_SCALE, maxX: 180 * GEO_SCALE, minY: -58 * GEO_SCALE, maxY: 84 * GEO_SCALE }

/** One provenance per view: Geo draws real observers only; Force and Radial draw the simulation only. */
export function isNodeVisible(mode: LayoutMode, nd: { is_real?: boolean; is_telemetry?: boolean } | undefined): boolean {
  if (!nd) return false
  return mode === 'geo' ? !isSimPeer(nd) : isSimPeer(nd)
}

/** One key format for every site, so an edges frame followed by a same-topology snapshot recomputes once. */
export function edgesKey(edges: Edge[]): string {
  return edges.map(([s, t]) => `${s}-${t}`).sort().join(',')
}

/** Only nodes drawn in this view count (observers arriving per slot must not restart Force);
 *  keyed with their index because positions are index-aligned with nodes. */
export function topologyKey(mode: LayoutMode, nodes: PeerNode[], edges: Edge[]): string {
  const ids = nodes.map((n, i) => (isNodeVisible(mode, n) ? `${i}:${n.peer_id}` : '')).filter(Boolean).join(',')
  return `${ids}|${edgesKey(edges)}|${mode}`
}

/** Attackers are not in the topology edge list: link grafted ones to the meshes they sit in;
 *  a pruned one gets a weak tether to ≤2 last victims so it parks beside the cluster. */
export function attackerLayoutEdges(nodes: PeerNode[]): LayoutEdge[] {
  const out: LayoutEdge[] = []
  for (const n of nodes) {
    if (n.state !== 'attacker') continue
    const weak = n.connected_peers.length === 0
    for (const t of weak ? (n.last_targets ?? []).slice(0, 2) : n.connected_peers) {
      out.push(weak ? [n.peer_id, t, true] : [n.peer_id, t])
    }
  }
  return out
}

// ── One-shot d3-force layout ──────────────────────────────────────────
// Laid out once and frozen: a topology change lays everything out from scratch; a node set
// change on the same topology pins every known node and only settles the new ones.

interface ForceNode extends SimulationNodeDatum {
  id: string
  x: number
  y: number
}

interface ForceLink extends SimulationLinkDatum<ForceNode> {
  source: string | ForceNode
  target: string | ForceNode
  weak: boolean
}

const placed = new Map<string, [number, number]>()  // last frozen position per peer id
let placedTopology: string | null = null

export function resetLayoutMemory(): void {
  placed.clear()
  placedTopology = null
}

function layoutForce(allNodes: PeerNode[], edges: LayoutEdge[], key: string): [number, number][] {
  const full: [number, number][] = allNodes.map(() => [0, 0])
  const visibleIdx = allNodes.map((nd, i) => (isNodeVisible('force', nd) ? i : -1)).filter(i => i >= 0)
  const n = visibleIdx.length
  if (n === 0) return full

  // Cold when the edge set changed, or when most nodes are new (a node-count change can reach
  // us before its edges frame, or the reverse).
  const knownCount = visibleIdx.filter(i => placed.has(allNodes[i].peer_id)).length
  const cold = key !== placedTopology || knownCount * 2 < n
  if (cold) placed.clear()
  const visibleIds = new Set(visibleIdx.map(i => allNodes[i].peer_id))
  const links: ForceLink[] = edges
    .filter(([s, t]) => visibleIds.has(s) && visibleIds.has(t))
    .map(([s, t, weak]) => ({ source: s, target: t, weak: weak === true }))
  const baseDist = Math.max(40, 400 / Math.sqrt(n))
  const initRadius = Math.min(300, n * 6)

  const firstNeighbour = new Map<string, string>()
  for (const l of links) {
    const s = l.source as string, t = l.target as string
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

  const fresh = nodes.filter(nd => nd.fx == null).length
  if (fresh > 0 && links.length > 0) {
    const sim = forceSimulation<ForceNode, ForceLink>(nodes)
      .force('link', forceLink<ForceNode, ForceLink>(links)
        .id(d => d.id)
        .strength(l => (l.weak ? 0.2 : 0.4))
        .distance(l => (l.weak ? baseDist * 1.6 : baseDist)))
      .force('charge', forceManyBody<ForceNode>().strength(-800).distanceMax(baseDist * 6).theta(0.9))
      .force('center', forceCenter(0, 0).strength(0.03))
      .force('collide', forceCollide<ForceNode>(baseDist * 0.25).iterations(2))
      .stop()
    // ponytail: synchronous ticks; fine at the 200-node preset cap (cold only)
    const ticks = cold ? (n > 200 ? 150 : 300) : 60
    sim.alpha(cold ? 1 : 0.5)
    for (let i = 0; i < ticks; i++) sim.tick()
  }

  // Isolated newcomers would be flung to a corner by charge: park them just outside the cluster.
  let rim = 0
  for (const nd of nodes) if (firstNeighbour.has(nd.id) || nd.fx != null) rim = Math.max(rim, Math.hypot(nd.x, nd.y))
  rim = (rim || initRadius) + baseDist
  nodes.forEach((nd, k) => {
    if (nd.fx != null || firstNeighbour.has(nd.id)) return
    const a = (2 * Math.PI * k) / n
    nd.x = rim * Math.cos(a)
    nd.y = rim * Math.sin(a)
  })

  // Remember only the nodes still here, so a re-used id (sybil-0 after clear all) is new again.
  placedTopology = key
  placed.clear()
  nodes.forEach((fn, k) => {
    placed.set(fn.id, [fn.x, fn.y])
    full[visibleIdx[k]] = [fn.x, fn.y]
  })
  return full
}

function layoutRadial(allNodes: PeerNode[], edges: LayoutEdge[]): [number, number][] {
  const full: [number, number][] = allNodes.map(() => [0, 0])
  const visibleIdx = allNodes.map((nd, i) => (isNodeVisible('radial', nd) ? i : -1)).filter(i => i >= 0)
  const n = visibleIdx.length
  if (n === 0) return full

  const degree = new Map<string, number>()
  for (const [s, t] of edges) {
    degree.set(s, (degree.get(s) ?? 0) + 1)
    degree.set(t, (degree.get(t) ?? 0) + 1)
  }
  const sorted = [...visibleIdx].sort((a, b) => (degree.get(allNodes[b].peer_id) ?? 0) - (degree.get(allNodes[a].peer_id) ?? 0))

  const baseRadius = Math.max(25, 120 / Math.sqrt(n))
  const ringGap = Math.max(18, 100 / Math.sqrt(n))
  full[sorted[0]] = [0, 0]
  let done = 1
  for (let ring = 1; done < n; ring++) {
    const radius = baseRadius + (ring - 1) * ringGap
    const inThisRing = Math.min(Math.max(6, Math.floor((2 * Math.PI * radius) / ringGap)), n - done)
    for (let i = 0; i < inThisRing; i++, done++) {
      const angle = (2 * Math.PI * i) / inThisRing - Math.PI / 2
      full[sorted[done]] = [radius * Math.cos(angle), radius * Math.sin(angle)]
    }
  }
  return full
}

export function computeLayout(mode: LayoutMode, nodes: PeerNode[], edges: LayoutEdge[], topologyKey = ''): LayoutResult {
  switch (mode) {
    case 'force': return { positions: layoutForce(nodes, edges, topologyKey) }
    // Producers project y down (y = −lat·2.5); the orthographic view's y points up, so flip once here
    case 'geo': return { positions: nodes.map(n => (isNodeVisible('geo', n) ? [n.x, -n.y] : [0, 0])) }
    case 'radial': return { positions: layoutRadial(nodes, edges) }
  }
}

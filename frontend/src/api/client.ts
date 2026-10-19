import type { SimSnapshot, MetricsSnapshot, AppEvent, ScenarioDefinition, ActiveFault } from '../types'

// Dev: Vite proxy forwards /api → localhost:8000
// Prod: VITE_API_URL points to the deployed backend
const BASE: string = import.meta.env.VITE_API_URL ?? ''

/** Presenter token for a deploy with LUMINAR_ADMIN_TOKEN set; absent = viewer-only. */
export function adminToken(): string | null {
  try { return localStorage.getItem('luminar.token') } catch { return null }
}

async function get<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(BASE + path)
    if (!res.ok) return null
    return await res.json()
  } catch { return null }
}

async function post<T>(path: string, body?: unknown): Promise<T | null> {
  try {
    const headers: Record<string, string> = {}
    if (body != null) headers['Content-Type'] = 'application/json'
    const token = adminToken()
    if (token) headers['X-Luminar-Token'] = token
    const res = await fetch(BASE + path, {
      method: 'POST',
      headers,
      body: body != null ? JSON.stringify(body) : undefined,
    })
    if (!res.ok) return null
    return await res.json()
  } catch { return null }
}

/** Static assets bundled with the frontend (reels, manifests): served by the frontend
 *  origin, never by the API, so VITE_API_URL is deliberately NOT prepended. */
export async function getStatic<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(path)
    if (!res.ok) return null
    return await res.json()
  } catch { return null }
}

export async function getStaticText(path: string): Promise<string | null> {
  try {
    const res = await fetch(path)
    if (!res.ok) return null
    return await res.text()
  } catch { return null }
}

// Simulation
export const simSnapshot = () => get<SimSnapshot>('/api/sim/snapshot')
export const simPlay = () => post<{state: string}>('/api/sim/play')
export const simPause = () => post<{state: string}>('/api/sim/pause')
export const simReset = () => post<{state: string}>('/api/sim/reset')
export const simSpeed = (speed: number) => post<{speed: number}>('/api/sim/speed', { speed })
export const simSeek = (time: number) => post<{time: number}>('/api/sim/seek', { time })
export const simReconfigure = (n_nodes: number) => post<{n_nodes: number; edge_count: number}>('/api/sim/reconfigure', { n_nodes })

// Topology
export const topologyEdges = () => get<{edges: [string, string][]}>('/api/topology/edges')
export const topologyMetrics = () => get<{metrics: Record<string, unknown>}>('/api/topology/metrics')

// Metrics
export const metricsSnapshot = () => get<MetricsSnapshot>('/api/metrics/snapshot')

// Events
export const eventsRecent = (since = 0) => get<{events: AppEvent[]}>(`/api/events/recent?since=${since}`)

// Gossip
export const gossipMesh = () => get<{mesh: Record<string, string[]>}>('/api/gossip/mesh')
export const gossipScores = () => get<{scores: Record<string, number>}>('/api/gossip/scores')
export const gossipAnalytics = () => get<Record<string, unknown>>('/api/gossip/analytics')

// Faults
export const faultPartition = (group_a: string[], group_b: string[]) =>
  post<{ok: boolean; fault_id: string}>('/api/fault/partition', { group_a, group_b })
export const faultSybil = (n_attackers: number) =>
  post<{ok: boolean; fault_id: string}>('/api/fault/sybil', { n_attackers, target_topic: 'lumina/blocks/1.0' })
export const faultEclipse = (target_peer_id: string, n_attackers: number) =>
  post<{ok: boolean; fault_id: string}>('/api/fault/eclipse', { target_peer_id, n_attackers })
export const faultDrop = (peer_id: string) =>
  post<{ok: boolean; fault_id: string}>('/api/fault/drop', { peer_id })
export const faultClearAll = () =>
  post<{ok: boolean; cleared: number}>('/api/fault/clear-all')
export const faultActive = () =>
  get<{faults: ActiveFault[]}>('/api/fault/active')

// Live network
export const liveMainnet = (enabled: boolean) => post<{enabled: boolean}>('/api/live/mainnet', { enabled })

// Scenarios
export const scenariosList = () => get<{scenarios: ScenarioDefinition[]}>('/api/scenarios')
export const scenarioLaunch = (id: string, speed = 1) =>
  post<{status: string}>(`/api/scenarios/${encodeURIComponent(id)}/launch`, { speed })
export const scenarioActive = () =>
  get<{active: boolean; scenario: ScenarioDefinition | null}>('/api/scenarios/active')

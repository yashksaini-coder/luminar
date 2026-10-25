import type { Edge, MainnetStatus, ScenarioDefinition, SnapshotFrame, Toast } from '@/lib/types'

/** Build-time API origin; '' in the container and in dev (Next rewrites proxy /api to :8000). */
export const API_BASE: string = process.env.NEXT_PUBLIC_API_URL ?? ''

/** status 0 = network error / no response. */
export interface ApiResult<T> { ok: boolean; status: number; data: T | null }

export const TOKEN_KEY = 'luminar.token'

/** Presenter token for a deploy with LUMINAR_ADMIN_TOKEN set; absent = viewer-only. */
export function adminToken(): string | null {
  try { return localStorage.getItem(TOKEN_KEY) } catch { return null }
}

export function setAdminToken(token: string | null): void {
  try {
    if (token == null) localStorage.removeItem(TOKEN_KEY)
    else localStorage.setItem(TOKEN_KEY, token)
  } catch { /* storage blocked: stay viewer-only */ }
}

async function request<T>(path: string, init?: RequestInit): Promise<ApiResult<T>> {
  try {
    const res = await fetch(API_BASE + path, init)
    return { ok: res.ok, status: res.status, data: await res.json().catch(() => null) }
  } catch {
    return { ok: false, status: 0, data: null }
  }
}

export function get<T>(path: string): Promise<ApiResult<T>> {
  return request<T>(path)
}

export function post<T>(path: string, body?: unknown): Promise<ApiResult<T>> {
  const headers: Record<string, string> = {}
  if (body != null) headers['Content-Type'] = 'application/json'
  const token = adminToken()
  if (token) headers['X-Luminar-Token'] = token
  return request<T>(path, { method: 'POST', headers, body: body != null ? JSON.stringify(body) : undefined })
}

/** Static assets served by the frontend origin (reels, manifest, geo): API_BASE is NOT prepended. */
export async function getStatic<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(path)
    if (!res.ok) return null
    return await res.json()
  } catch { return null }
}

export function toastFor(r: ApiResult<unknown>, label: string): Pick<Toast, 'text' | 'kind'> {
  if (r.ok) return { text: `${label} injected`, kind: 'ok' }
  if (r.status === 0) return { text: 'backend offline', kind: 'fail' }
  return { text: `${label} failed · ${r.status}`, kind: 'fail' }
}

// Simulation (the snapshot response lacks `type`; cast)
export const simSnapshot = () => get<SnapshotFrame>('/api/sim/snapshot')
export const simPlay = () => post<{ state: string }>('/api/sim/play')
export const simPause = () => post<{ state: string }>('/api/sim/pause')
export const simReset = () => post<{ state: string }>('/api/sim/reset')
export const simSpeed = (speed: number) => post<{ speed: number }>('/api/sim/speed', { speed })
export const simReconfigure = (n_nodes: number) =>
  post<{ n_nodes: number; edge_count: number }>('/api/sim/reconfigure', { n_nodes })

// Topology
export const topologyEdges = () => get<{ edges: Edge[] }>('/api/topology/edges')

// Scenarios
export const scenariosList = () => get<{ scenarios: ScenarioDefinition[] }>('/api/scenarios')
export const scenarioLaunch = (id: string, speed = 1) =>
  post<{ status: string }>(`/api/scenarios/${encodeURIComponent(id)}/launch`, { speed })

// Faults
export const faultPartition = (group_a: string[], group_b: string[]) =>
  post<{ ok: boolean; fault_id: string }>('/api/fault/partition', { group_a, group_b })
export const faultSybil = (n_attackers: number) =>
  post<{ ok: boolean; fault_id: string }>('/api/fault/sybil', { n_attackers, target_topic: 'lumina/blocks/1.0' })
export const faultEclipse = (target_peer_id: string, n_attackers = 4) =>
  post<{ ok: boolean; fault_id: string }>('/api/fault/eclipse', { target_peer_id, n_attackers })
export const faultDrop = (peer_id: string) =>
  post<{ ok: boolean; fault_id: string }>('/api/fault/drop', { peer_id })
export const faultClearAll = () => post<{ ok: boolean; cleared: number }>('/api/fault/clear-all')

// Live network
export const liveMainnet = (enabled: boolean) => post<MainnetStatus>('/api/live/mainnet', { enabled })

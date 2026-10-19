import type { LayoutMode, SimState, PeerNode, AppEvent, ScenarioDefinition } from './types'

export interface AppStore {
  // Connection
  connected: boolean

  // Simulation state
  simState: SimState
  simTime: number
  simSpeed: number
  nodeCount: number
  observerCount: number
  eventCount: number

  // Nodes and edges
  nodes: PeerNode[]
  edges: [string, string][]
  nodePositions: [number, number][]  // immutable after layout
  nodeIndex: Map<string, number>  // peer_id -> array index
  mesh: Record<string, string[]>  // peer_id -> mesh peers (empty above 100 nodes)

  // Layout
  layoutMode: LayoutMode

  // Playback
  playing: boolean

  // Selection & interaction
  selectedNode: number  // -1 = none
  hoveredNode: number   // -1 = none
  highlightPeers: string[]  // peer IDs to highlight connections to (from event click)

  // Events
  events: AppEvent[]
  maxEvents: number

  // Scenarios
  scenarios: ScenarioDefinition[]
  activeScenario: { active: boolean; scenario: ScenarioDefinition | null; phase_idx?: number } | null

  // Reel playback (recorded frame stream replayed client-side; null = live)
  reel: { name: string; title: string; durationMs: number; durationSim?: number } | null
  mainnet: { enabled: boolean; slot?: number; block_root?: string; observers?: number; with_geo?: number; first_ms?: number | null; p50_ms?: number | null; max_ms?: number | null; first_client?: string; first_country?: string; lag_s?: number } | null
  droppedEvents: number

  // Metrics
  stateDistribution: Record<string, number>
  totalMessagesSent: number
  totalMessagesReceived: number
  eventCounts: Record<string, number>
  streamManager: { open: number; max: number; available: number }
  dhtCoordinator: { active: number; available: number }

  // Duration
  maxDuration: number  // simulation duration in seconds

  // Display settings
  particlesEnabled: boolean
  showLabels: boolean
  showEdges: boolean
  stageTheme: boolean
  hero: boolean
  scale: { node: number; particle: number; edgeAlpha: number }  // stage theme bumps these

  // Gossip analytics
  gossipAnalytics: {
    total_messages: number
    avg_delivery_ratio: number
    avg_propagation_ms: number
    avg_hops: number
    avg_duplicates?: number
    recent_delivery_ratio?: number
    delivery_ratios: { msg_id: string; ratio: number }[]
    latency_cdf: { percentile: number; latency_ms: number }[]
    mesh_stability: { avg_degree: number; min_degree: number; max_degree: number }
  } | null
  milestones: { label: string; time: number; color: string }[]
  beats: { label: string; time: number; color: string }[]  // narrator-derived, merged into milestones
}

/** Seconds the scrubber spans: the reel's length, else the active scenario's, else the preset. */
export function timelineTotal(): number {
  if (store.reel) return store.reel.durationSim ?? 0
  return store.activeScenario?.scenario?.duration || store.maxDuration
}

export const store: AppStore = {
  connected: false,
  simState: 'stopped',
  simTime: 0,
  simSpeed: 1,
  nodeCount: 0,
  observerCount: 0,
  eventCount: 0,
  nodes: [],
  edges: [],
  nodePositions: [],
  nodeIndex: new Map(),
  mesh: {},
  layoutMode: 'force',
  playing: false,
  selectedNode: -1,
  hoveredNode: -1,
  highlightPeers: [],
  events: [],
  maxEvents: 2000,
  scenarios: [],
  activeScenario: null,
  reel: null,
  mainnet: null,
  droppedEvents: 0,
  stateDistribution: {},
  totalMessagesSent: 0,
  totalMessagesReceived: 0,
  eventCounts: {},
  streamManager: { open: 0, max: 64, available: 64 },
  dhtCoordinator: { active: 0, available: 8 },
  particlesEnabled: true,
  showLabels: true,
  showEdges: true,
  stageTheme: false,
  hero: false,
  scale: { node: 1, particle: 1, edgeAlpha: 1 },
  maxDuration: 300,  // default 5 minutes
  gossipAnalytics: null,
  milestones: [],
  beats: [],
}

import type { LayoutMode, SimState, PeerNode, AppEvent, ScenarioDefinition } from './types'

export interface AppStore {
  // Connection
  connected: boolean

  // Simulation state
  simState: SimState
  simTime: number
  simSpeed: number
  nodeCount: number
  eventCount: number

  // Nodes and edges
  nodes: PeerNode[]
  edges: [string, string][]
  nodePositions: [number, number][]  // immutable after layout
  nodeIndex: Map<string, number>  // peer_id -> array index

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

  // Gossip analytics
  gossipAnalytics: {
    total_messages: number
    avg_delivery_ratio: number
    avg_propagation_ms: number
    avg_hops: number
    delivery_ratios: { msg_id: string; ratio: number }[]
    latency_cdf: { percentile: number; latency_ms: number }[]
    mesh_stability: { avg_degree: number; min_degree: number; max_degree: number }
  } | null
  milestones: { label: string; time: number; color: string }[]
}

export const store: AppStore = {
  connected: false,
  simState: 'stopped',
  simTime: 0,
  simSpeed: 1,
  nodeCount: 0,
  eventCount: 0,
  nodes: [],
  edges: [],
  nodePositions: [],
  nodeIndex: new Map(),
  layoutMode: 'force',
  playing: false,
  selectedNode: -1,
  hoveredNode: -1,
  highlightPeers: [],
  events: [],
  maxEvents: 2000,
  scenarios: [],
  stateDistribution: {},
  totalMessagesSent: 0,
  totalMessagesReceived: 0,
  eventCounts: {},
  streamManager: { open: 0, max: 64, available: 64 },
  dhtCoordinator: { active: 0, available: 8 },
  particlesEnabled: true,
  showLabels: true,
  showEdges: true,
  maxDuration: 300,  // default 5 minutes
  gossipAnalytics: null,
  milestones: [],
}

export type LayoutMode = 'force' | 'grid' | 'radial'
export type SimState = 'running' | 'paused' | 'stopped'
export type NodeState = 'idle' | 'origin' | 'receiving' | 'decoded' | 'error' | 'joining' | 'failed'

export interface PeerNode {
  peer_id: string
  index: number
  state: NodeState
  connected_peers: string[]
  x: number
  y: number
  messages_sent: number
  messages_received: number
  gossip_score: number
}

export interface AppEvent {
  at: number
  event_type: string
  category: string
  peer_id?: string
  from_peer?: string
  to_peer?: string
  msg_id?: string
  topic?: string
  hops?: number
  fault_type?: string
  target?: string
  reason?: string
  speed?: number
  state?: string
  [key: string]: unknown
}

export interface SimSnapshot {
  state: SimState
  time: number
  speed: number
  node_count: number
  event_count: number
  nodes: PeerNode[]
}

export interface MetricsSnapshot {
  node_count: number
  state_distribution: Record<string, number>
  total_messages_sent: number
  total_messages_received: number
  event_counts: Record<string, number>
  total_events: number
  stream_manager: { open: number; max: number; available: number }
  dht_coordinator: { active: number; available: number }
}

export interface ScenarioDefinition {
  id: string
  name: string
  description: string
  icon: string
  topology_type: string
  phases: { at: number; label: string; action: string }[]
  duration: number
}

export interface ActiveFault {
  id: string
  type: string
  [key: string]: unknown
}

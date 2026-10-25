export type LayoutMode = 'force' | 'radial' | 'geo'
export type SimState = 'running' | 'paused' | 'stopped'
export type NodeState = 'idle' | 'origin' | 'receiving' | 'decoded' | 'error' | 'joining' | 'failed' | 'attacker'
export type EventCategory = 'gossip' | 'connection' | 'stream' | 'dht' | 'fault' | 'health' | 'clock' | 'simulation' | 'live'

export interface PeerNode {                       // snapshot.nodes[] (engine.get_snapshot + _merge_real_peers)
  peer_id: string; index: number; state: NodeState
  connected_peers: string[]
  last_targets?: string[]                         // attackers only: victims at injection time
  is_real?: boolean; is_telemetry?: boolean
  client?: string; country?: string; city?: string; seen_ms?: number | null
  x: number; y: number
  messages_sent: number; messages_received: number; gossip_score: number
}

export type Edge = [string, string]
export type LayoutEdge = [string, string] | [string, string, true]   // third = weak tether

export interface AppEvent {                        // text frames; no `type` field (events/types.py to_dict)
  at: number; event_type: string; category: EventCategory
  peer_id?: string; from_peer?: string; to_peer?: string
  msg_id?: string; msg_ids?: string[]; topic?: string; hops?: number
  latency_ms?: number; via?: 'mesh' | 'iwant' | 'spam'; dropped?: boolean
  fault_type?: string; fault_id?: string; target?: string; params?: Record<string, unknown>; count?: number
  reason?: string; speed?: number; state?: string; label?: string; action?: string
  initiator?: string; score?: number
  slot?: number; block_root?: string; seen_ms?: number; client?: string; country?: string; first?: boolean
  [key: string]: unknown
}

export interface SnapshotFrame {
  type: 'snapshot'; state: SimState; time: number; speed: number
  node_count: number; event_count: number; nodes: PeerNode[]
  gossip?: { mesh_size?: number; mesh?: Record<string, string[]> }   // mesh is {} above 100 nodes
}
export interface MetricsFrame {
  type: 'metrics'; node_count: number; state_distribution: Record<string, number>
  total_messages_sent: number; total_messages_received: number
  event_counts: Record<string, number>; total_events: number
  stream_manager: { open: number; max: number; available: number }
  dht_coordinator: { active: number; available: number }
}
export interface CdfPoint { percentile: number; latency_ms: number }
export interface AnalyticsFrame {
  type: 'analytics'; total_messages: number; avg_delivery_ratio: number; avg_propagation_ms: number
  avg_hops: number; avg_duplicates?: number; recent_delivery_ratio?: number
  delivery_ratios: { msg_id: string; ratio: number }[]; latency_cdf: CdfPoint[]
  mesh_stability: { avg_degree?: number; min_degree?: number; max_degree?: number }   // {} before the first message
}
export interface TelemetryPeer { peer_id: string; node_name: string; network: string; last_seen: number; age_seconds: number; cpu: number; best_block: number }
export interface MainnetStatus {
  enabled: boolean; observers: number
  slot?: number; block_root?: string; rows?: number; with_geo?: number
  first_ms?: number | null; p50_ms?: number | null; max_ms?: number | null
  first_client?: string; first_country?: string; lag_s?: number; fetched_at?: number
}
export interface TelemetryStatusFrame { type: 'telemetry_status'; active: boolean; peer_count: number; peers: TelemetryPeer[]; mainnet?: MainnetStatus; otel?: unknown }
export interface EdgesFrame { type: 'edges'; edges: Edge[] }
export interface ScenarioPhase { at: number; label: string; action: string }
export interface ScenarioDefinition { id: string; name: string; description: string; icon: string; topology_type: string; phases: ScenarioPhase[]; duration: number }
export interface ScenarioStatus {
  active: boolean; scenario: ScenarioDefinition | null
  phase_idx?: number; total_phases?: number; next_phase_at?: number | null; next_phase_label?: string | null
  completed_phases?: string[]; all_phases_done?: boolean
}
export type ScenarioFrame = ScenarioStatus & { type: 'scenario' }
export interface GapFrame { type: 'gap'; dropped: number }
export type TypedFrame = SnapshotFrame | MetricsFrame | AnalyticsFrame | TelemetryStatusFrame | EdgesFrame | ScenarioFrame | GapFrame
export type WsFrame = TypedFrame | AppEvent
export function isTypedFrame(f: WsFrame): f is TypedFrame {
  return 'type' in f && typeof f.type === 'string'
}

export interface ReelMeta { name: string; title: string; file: string; nodes?: number; blurb?: string; real?: boolean }   // manifest.json entry
export type ReelManifest = ReelMeta[]
export interface ReelFrame { t: number; frame: WsFrame }       // one JSONL line
export interface ReelState { name: string; title: string; durationMs: number; durationSim: number }

export interface ActiveFault { id: string; type: string; [key: string]: unknown }   // FaultInjected.params typing

export interface Toast { id: number; text: string; kind: 'ok' | 'fail' | 'info'; at: number }
export type BeatKind = 'phase' | 'prune' | 'healed' | 'fault'
export interface Beat { label: string; time: number; kind: BeatKind }
export interface Caption { text: string; kind: 'phase' | 'narrator' | 'healed'; at: number; seq: number }  // seq restarts the drain bar
export interface Scale { node: number; particle: number; edgeAlpha: number }
export interface AnalyticsSample { t: number; delivery: number; propagationMs: number; hops: number; degree: number }  // sparkline sample
export type ScoreBand = 0 | 1 | 2 | 3
export type ConnectionPill = 'offline' | 'live' | 'reel'
export type RGBA = [number, number, number, number]

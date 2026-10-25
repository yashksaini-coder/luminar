import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'
import { isPruned, isSimPeer } from '@/lib/format'
import type {
  AnalyticsFrame, AnalyticsSample, AppEvent, Beat, Caption, ConnectionPill, Edge, EdgesFrame, GapFrame,
  LayoutMode, MainnetStatus, MetricsFrame, PeerNode, ReelState, Scale, ScenarioDefinition, ScenarioFrame,
  ScenarioStatus, SimState, SnapshotFrame, TelemetryStatusFrame, Toast,
} from '@/lib/types'

export const MAX_EVENTS = 2000
export const MAX_SAMPLES = 60
export const SCORE_HISTORY = 50
export const STAGE_SCALE: Scale = { node: 1.4, particle: 1.8, edgeAlpha: 1.6 }
export const BASE_SCALE: Scale = { node: 1, particle: 1, edgeAlpha: 1 }

type Narrator = { firstSybilPrunedAt: number | null; healStartAt: number | null; healedAnnounced: boolean }

export interface AppState {
  connected: boolean
  simState: SimState
  simTime: number
  simSpeed: number
  nodeCount: number
  eventCount: number
  playing: boolean
  nodes: PeerNode[]
  nodeById: ReadonlyMap<string, PeerNode>
  edges: Edge[]
  mesh: Record<string, string[]>
  layoutMode: LayoutMode
  geoAvailable: boolean
  layoutBeforeGeo: LayoutMode | null
  geoAutoDone: boolean
  selectedPeer: string | null
  hoveredPeer: string | null
  highlightPeers: string[]
  scoreHistory: { t: number; v: number }[]
  events: AppEvent[]
  droppedEvents: number
  activeFaults: number   // FaultInjected since the last FaultCleared; counted here, not from the events ring
  scenarios: ScenarioDefinition[]
  activeScenario: ScenarioStatus | null
  reel: ReelState | null
  reelLoad: { loaded: number; total: number } | null
  mainnet: MainnetStatus | null
  telemetry: { active: boolean; peerCount: number }
  stateDistribution: Record<string, number>
  totalMessagesSent: number
  totalMessagesReceived: number
  eventCounts: Record<string, number>
  streamManager: { open: number; max: number; available: number }
  dhtCoordinator: { active: number; available: number }
  gossipAnalytics: AnalyticsFrame | null
  analyticsHistory: AnalyticsSample[]
  beats: Beat[]
  caption: Caption | null
  phaseLabel: string
  invalidCount: number
  narrator: Narrator
  maxDuration: number
  durationStep: number
  particlesEnabled: boolean
  showLabels: boolean
  showEdges: boolean
  allLabels: boolean
  stageTheme: boolean
  hero: boolean
  scale: Scale
  toasts: Toast[]
  keyHelpOpen: boolean
}

export interface AppActions {
  // frame appliers: each is ONE set() carrying only the fields whose value changed
  applySnapshot(f: SnapshotFrame): void
  applyMetrics(f: MetricsFrame): void
  applyAnalytics(f: AnalyticsFrame): void
  applyTelemetryStatus(f: TelemetryStatusFrame): void
  applyEdges(f: EdgesFrame): void
  applyScenario(f: ScenarioFrame): void
  applyGap(f: GapFrame): void
  applyEvents(batch: AppEvent[]): void
  setConnected(v: boolean): void
  setPlaying(v: boolean): void
  selectPeer(id: string | null, highlight?: string[]): void
  hoverPeer(id: string | null): void
  setLayoutMode(mode: LayoutMode, opts?: { remember?: boolean }): void
  setDuration(maxDuration: number, step?: number): void
  extendDuration(): void
  setReel(r: ReelState | null): void
  setReelLoad(p: { loaded: number; total: number } | null): void
  setPref(key: 'stageTheme' | 'hero', value?: boolean): void
  setDisplay(p: Partial<Pick<AppState, 'particlesEnabled' | 'showLabels' | 'showEdges' | 'allLabels'>>): void
  pushToast(text: string, kind?: Toast['kind']): number
  dismissToast(id: number): void
  setKeyHelp(open: boolean): void
  setCaption(c: Omit<Caption, 'seq'> | null): void
  resetRun(): void
}
export type AppStore = AppState & AppActions

// Shared empties: resetting an already-empty field keeps its reference, so subscribers stay quiet.
const NONE: never[] = []
const NARRATOR_IDLE: Narrator = { firstSybilPrunedAt: null, healStartAt: null, healedAnnounced: false }

let toastId = 0
let captionSeq = 0
const caption = (text: string, kind: Caption['kind'], at: number): Caption => ({ text, kind, at, seq: ++captionSeq })

type Patch = Partial<AppState>
// Compares against the pre-batch state; a later write back to that value drops the earlier one from the patch.
function put<K extends keyof AppState>(s: AppState, p: Patch, k: K, v: AppState[K]) {
  if (Object.is(s[k], v)) delete p[k]
  else p[k] = v
}

function resetNarratorPatch(s: AppState, p: Patch) {
  put(s, p, 'beats', NONE)
  put(s, p, 'caption', null)
  put(s, p, 'phaseLabel', '')
  put(s, p, 'invalidCount', 0)
  put(s, p, 'narrator', NARRATOR_IDLE)
}

const initialState: AppState = {
  connected: false,
  simState: 'stopped', simTime: 0, simSpeed: 1, nodeCount: 0, eventCount: 0, playing: false,
  nodes: NONE, nodeById: new Map(), edges: NONE, mesh: {},
  layoutMode: 'force', geoAvailable: false, layoutBeforeGeo: null, geoAutoDone: false,
  selectedPeer: null, hoveredPeer: null, highlightPeers: NONE, scoreHistory: NONE,
  events: NONE, droppedEvents: 0, activeFaults: 0,
  scenarios: NONE, activeScenario: null, reel: null, reelLoad: null, mainnet: null,
  telemetry: { active: false, peerCount: 0 },
  stateDistribution: {}, totalMessagesSent: 0, totalMessagesReceived: 0, eventCounts: {},
  streamManager: { open: 0, max: 64, available: 64 }, dhtCoordinator: { active: 0, available: 8 },
  gossipAnalytics: null, analyticsHistory: NONE,
  beats: NONE, caption: null, phaseLabel: '', invalidCount: 0, narrator: NARRATOR_IDLE,
  maxDuration: 300, durationStep: 300,
  particlesEnabled: true, showLabels: true, showEdges: true, allLabels: false,
  stageTheme: false, hero: false, scale: BASE_SCALE,
  toasts: NONE, keyHelpOpen: false,
}

export const useStore = create<AppStore>()(subscribeWithSelector((set, get) => ({
  ...initialState,

  applySnapshot(f) {
    const s = get(), p: Patch = {}
    const nodeById = new Map(f.nodes.map(n => [n.peer_id, n]))
    p.nodes = f.nodes
    p.nodeById = nodeById
    p.mesh = f.gossip?.mesh ?? {}
    put(s, p, 'nodeCount', f.node_count)
    put(s, p, 'eventCount', f.event_count)
    put(s, p, 'simTime', f.time)
    put(s, p, 'geoAvailable', f.nodes.some(n => !isSimPeer(n)))
    if (!s.reel) {   // in reel mode playing belongs to replay.ts (A.0)
      put(s, p, 'simState', f.state)
      put(s, p, 'simSpeed', f.speed)
      put(s, p, 'playing', f.state === 'running')
    }
    if (s.selectedPeer) {
      const sel = nodeById.get(s.selectedPeer)
      if (!sel) {
        p.selectedPeer = null
        put(s, p, 'highlightPeers', NONE)
        put(s, p, 'scoreHistory', NONE)
      } else {
        p.scoreHistory = [...s.scoreHistory, { t: f.time, v: sel.gossip_score }].slice(-SCORE_HISTORY)
      }
    }
    set(p)
  },

  applyMetrics(f) {
    const s = get(), p: Patch = {}
    put(s, p, 'stateDistribution', f.state_distribution ?? s.stateDistribution)
    put(s, p, 'totalMessagesSent', f.total_messages_sent ?? s.totalMessagesSent)
    put(s, p, 'totalMessagesReceived', f.total_messages_received ?? s.totalMessagesReceived)
    put(s, p, 'eventCounts', f.event_counts ?? s.eventCounts)
    put(s, p, 'streamManager', f.stream_manager ?? s.streamManager)
    put(s, p, 'dhtCoordinator', f.dht_coordinator ?? s.dhtCoordinator)
    set(p)
  },

  applyAnalytics(f) {
    const s = get(), p: Patch = { gossipAnalytics: f }
    if (f.total_messages > 0) {
      const sample: AnalyticsSample = {
        t: s.simTime,
        delivery: f.recent_delivery_ratio ?? f.avg_delivery_ratio,
        propagationMs: f.avg_propagation_ms,
        hops: f.avg_hops,
        degree: f.mesh_stability.avg_degree ?? 0,
      }
      p.analyticsHistory = [...s.analyticsHistory, sample].slice(-MAX_SAMPLES)
    }
    const n = s.narrator
    if (n.healStartAt !== null && !n.healedAnnounced && (f.recent_delivery_ratio ?? 0) >= 0.95) {
      p.narrator = { ...n, healedAnnounced: true }
      p.caption = caption(`Mesh healed in ${Math.max(0, s.simTime - n.healStartAt).toFixed(1)}s`, 'healed', s.simTime)
      p.beats = [...s.beats, { label: 'Mesh healed', time: s.simTime, kind: 'healed' }]
    }
    set(p)
  },

  applyTelemetryStatus(f) {
    const s = get(), p: Patch = {}
    if (s.telemetry.active !== f.active || s.telemetry.peerCount !== f.peer_count) {
      p.telemetry = { active: f.active, peerCount: f.peer_count }
    }
    const mainnet = f.mainnet ?? null
    put(s, p, 'mainnet', mainnet)
    if (s.mainnet?.enabled && !mainnet?.enabled) put(s, p, 'geoAutoDone', false)   // feed-off re-arms auto-Geo
    set(p)
  },

  applyEdges(f) {
    set({ edges: f.edges })
  },

  applyScenario(f) {
    const s = get(), p: Patch = {}
    put(s, p, 'activeScenario', f.active ? f : null)
    const duration = f.scenario?.duration ?? 0
    if (f.active && duration > 0) put(s, p, 'maxDuration', duration)
    resetNarratorPatch(s, p)
    put(s, p, 'activeFaults', 0)   // sent only when the backend starts a fresh run (reset, launch, reconfigure): its faults are gone, and their FaultCleared never reaches the socket
    set(p)
  },

  applyGap(f) {
    set({ droppedEvents: get().droppedEvents + f.dropped })
  },

  applyEvents(batch) {
    if (!batch.length) return
    const s = get(), p: Patch = {}
    p.events = s.events.concat(batch).slice(-MAX_EVENTS)
    p.eventCount = s.eventCount + batch.length

    let nar = s.narrator, beats = s.beats, invalid = s.invalidCount, faults = s.activeFaults
    let nodes: PeerNode[] | null = null, byId: Map<string, PeerNode> | null = null
    for (const evt of batch) {
      switch (evt.event_type) {
        case 'ClockTick':
          put(s, p, 'simTime', evt.at)
          break
        case 'SimulationStateChanged':
          if (s.reel) break
          put(s, p, 'simState', evt.state as SimState)
          if (evt.speed !== undefined) put(s, p, 'simSpeed', evt.speed)
          put(s, p, 'playing', evt.state === 'running')
          break
        case 'BlockSeen': {
          if (!evt.peer_id || !s.nodeById.has(evt.peer_id)) break
          if (!nodes || !byId) {   // one copy per batch; nodeById points at the copies
            nodes = s.nodes.map(n => ({ ...n }))
            byId = new Map(nodes.map(n => [n.peer_id, n]))
          }
          if (evt.first) {
            for (const n of nodes) if (n.is_real) n.state = 'idle'   // new block: reset the wave
            if (s.layoutMode === 'geo') {
              p.caption = caption(`slot ${evt.slot} · block ${String(evt.block_root).slice(0, 10)}… · first seen ${evt.seen_ms} ms (${evt.client || '?'}, ${evt.country || '?'})`, 'narrator', evt.at)
            }
          }
          const node = byId.get(evt.peer_id)!
          node.state = evt.first ? 'origin' : 'decoded'
          node.seen_ms = evt.seen_ms
          break
        }
        case 'ScenarioPhaseFired': {
          const label = String(evt.label ?? '')
          p.phaseLabel = label
          p.caption = caption(label, 'phase', evt.at)
          beats = [...beats, { label, time: evt.at, kind: 'phase' }]
          break
        }
        case 'GossipPrune':
          if (nar.firstSybilPrunedAt === null && evt.to_peer?.startsWith('sybil-') && evt.reason === 'score') {
            nar = { ...nar, firstSybilPrunedAt: evt.at }
            p.caption = caption('First Sybil pruned by score', 'narrator', evt.at)
            beats = [...beats, { label: 'First Sybil pruned', time: evt.at, kind: 'prune' }]
          }
          break
        case 'GossipMessage':
          if (evt.msg_id?.startsWith('spam-')) invalid++
          break
        case 'FaultInjected':
          faults++
          beats = [...beats, { label: `${evt.fault_type ?? 'fault'} injected`, time: evt.at, kind: 'fault' }]
          break
        case 'FaultCleared':
          faults = 0
          beats = [...beats, { label: `${evt.fault_type ?? 'faults'} cleared`, time: evt.at, kind: 'fault' }]
          if (nar.healStartAt === null) nar = { ...nar, healStartAt: evt.at, healedAnnounced: false }
          break
      }
    }
    if (nodes && byId) { p.nodes = nodes; p.nodeById = byId }
    put(s, p, 'narrator', nar)
    put(s, p, 'beats', beats)
    put(s, p, 'invalidCount', invalid)
    put(s, p, 'activeFaults', faults)
    set(p)
  },

  setConnected: v => set({ connected: v }),
  setPlaying: v => set({ playing: v }),

  selectPeer(id, highlight = NONE) {
    const s = get(), p: Patch = { selectedPeer: id, highlightPeers: highlight }
    if (id !== s.selectedPeer) put(s, p, 'scoreHistory', NONE)
    set(p)
  },
  hoverPeer: id => set({ hoveredPeer: id }),

  setLayoutMode(mode, opts) {
    const s = get(), p: Patch = {}
    const next = mode === 'geo' && !s.geoAvailable ? 'force' : mode
    if (!opts?.remember) put(s, p, 'layoutBeforeGeo', null)   // R9: a manual pick forgets the layout auto-Geo remembered
    else if (s.layoutMode !== 'geo') p.layoutBeforeGeo = s.layoutMode
    p.layoutMode = next
    const sel = s.selectedPeer ? s.nodeById.get(s.selectedPeer) : undefined
    if (sel && (next === 'geo') === isSimPeer(sel)) {
      p.selectedPeer = null
      put(s, p, 'highlightPeers', NONE)
    }
    set(p)
  },

  setDuration(maxDuration, step) {
    set(step === undefined ? { maxDuration } : { maxDuration, durationStep: step })
  },
  extendDuration: () => set(s => ({ maxDuration: s.simTime + s.durationStep })),

  setReel: r => set({ reel: r }),
  setReelLoad: pr => set({ reelLoad: pr }),

  setPref(key, value) {
    const v = value ?? !get()[key]
    set(key === 'stageTheme' ? { stageTheme: v, scale: v ? STAGE_SCALE : BASE_SCALE } : { hero: v })
  },
  setDisplay: d => set(d),

  pushToast(text, kind = 'info') {
    const id = ++toastId
    set(s => ({ toasts: [...s.toasts, { id, text, kind, at: Date.now() }] }))
    return id
  },
  dismissToast: id => set(s => ({ toasts: s.toasts.filter(t => t.id !== id) })),
  setKeyHelp: open => set({ keyHelpOpen: open }),
  setCaption: c => set({ caption: c ? { ...c, seq: ++captionSeq } : null }),

  resetRun() {
    const s = get(), p: Patch = {}
    put(s, p, 'events', NONE)
    put(s, p, 'eventCount', 0)
    put(s, p, 'droppedEvents', 0)
    put(s, p, 'selectedPeer', null)
    put(s, p, 'highlightPeers', NONE)
    put(s, p, 'scoreHistory', NONE)
    resetNarratorPatch(s, p)
    put(s, p, 'analyticsHistory', NONE)
    put(s, p, 'simTime', 0)
    set(p)
  },
})))

// selectors: components never call useStore() without one
export const selectTimelineTotal = (s: AppState) => s.reel ? s.reel.durationSim : s.maxDuration
export const selectPill = (s: AppState): ConnectionPill => s.reel ? 'reel' : s.connected ? 'live' : 'offline'
export const selectSelectedNode = (s: AppState) => s.selectedPeer ? s.nodeById.get(s.selectedPeer) : undefined
export const selectHoveredNode = (s: AppState) => s.hoveredPeer ? s.nodeById.get(s.hoveredPeer) : undefined
export const selectAttackers = (s: AppState) => s.nodes.filter(n => n.state === 'attacker')   // use with useShallow
export const selectPrunedCount = (s: AppState) => s.nodes.reduce((k, n) => k + (isPruned(n) ? 1 : 0), 0)

/** stateDistribution (node-pool peers only) plus attacker/pruned taken from the snapshot nodes, the same
 *  source as selectAttackers, since synthetic attackers never reach the backend count; fresh object, read with useShallow (R2). */
export const selectStateCounts = (s: AppState): Record<string, number> => {
  const counts = { ...s.stateDistribution }
  delete counts.attacker
  let attacker = 0, pruned = 0
  for (const n of s.nodes) if (n.state === 'attacker') { if (isPruned(n)) pruned++; else attacker++ }
  if (attacker) counts.attacker = attacker
  if (pruned) counts.pruned = pruned
  return counts
}

export interface Kpis {
  delivery: number | null; propagationMs: number | null; hops: number | null
  degAvg: number | null; degMin: number | null; degMax: number | null
}
/** Flat primitives so useShallow compares them (R2); all null before the first message. */
export const selectKpis = (s: AppState): Kpis => {
  const ga = s.gossipAnalytics
  if (!ga || ga.total_messages <= 0) {
    return { delivery: null, propagationMs: null, hops: null, degAvg: null, degMin: null, degMax: null }
  }
  const ms = ga.mesh_stability, hasDeg = ms.avg_degree != null
  return {
    delivery: ga.recent_delivery_ratio ?? ga.avg_delivery_ratio,
    propagationMs: ga.avg_propagation_ms,
    hops: ga.avg_hops,
    degAvg: hasDeg ? ms.avg_degree! : null,
    degMin: hasDeg ? ms.min_degree ?? null : null,
    degMax: hasDeg ? ms.max_degree ?? null : null,
  }
}
export const selectHasMessages = (s: AppState) => (s.gossipAnalytics?.total_messages ?? 0) > 0
export const selectCanGeo = (s: AppState) => s.geoAvailable

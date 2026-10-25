/** Reel JSONL → frozen layout, snapshots, events and analytics keyed to sim time, for the video. */
import { isAttackerId } from '../../lib/format'
import type { AnalyticsFrame, AppEvent, EdgesFrame, NodeState, SnapshotFrame } from '../../lib/types'

export interface ReelNode { id: string; index: number; x: number; y: number; attacker: boolean; firstSeenT: number; lastSeenT: number }
export interface ReelSnapshot { time: number; states: Record<string, NodeState>; scores: Record<string, number>; connected: Record<string, string[]>; mesh: Record<string, string[]> }
export interface ReelMessage { at: number; from: string; to: string; latencyMs: number; via: 'mesh' | 'iwant' | 'spam'; hops: number; spam: boolean }
export interface ReelData {
  nodes: ReelNode[]; byId: Map<string, ReelNode>; edges: [string, string][]
  snapshots: ReelSnapshot[]; messages: ReelMessage[]
  grafts: { at: number; from: string; to: string }[]; prunes: { at: number; from: string; to: string; reason?: string }[]
  phases: { at: number; label: string }[]; faults: { at: number; type: string; target?: string; n?: number }[]; cleared: { at: number; type: string }[]
  analytics: { time: number; delivery: number; hops: number; propagationMs: number; total: number }[]
  durationSim: number
}

type Line = { t: number; frame: SnapshotFrame | AnalyticsFrame | EdgesFrame | AppEvent }

export function parseReel(text: string): ReelData {
  const d: ReelData = {
    nodes: [], byId: new Map(), edges: [], snapshots: [], messages: [], grafts: [], prunes: [],
    phases: [], faults: [], cleared: [], analytics: [], durationSim: 0,
  }
  const firstEventAt = new Map<string, number>()
  const noteEvent = (id: string | undefined, at: number) => {
    if (id && !(firstEventAt.get(id)! <= at)) firstEventAt.set(id, at)
  }
  let lastSnapTime = 0
  for (const raw of text.split('\n')) {
    let line: Line
    try { line = JSON.parse(raw) } catch { continue }
    const f = line?.frame
    if (!f || typeof f !== 'object') continue
    if ('type' in f && f.type === 'snapshot') {
      const s = f as SnapshotFrame
      const snap: ReelSnapshot = { time: s.time, states: {}, scores: {}, connected: {}, mesh: s.gossip?.mesh ?? {} }
      for (const n of s.nodes) {
        snap.states[n.peer_id] = n.state; snap.scores[n.peer_id] = n.gossip_score; snap.connected[n.peer_id] = n.connected_peers
        const known = d.byId.get(n.peer_id)
        if (known) known.lastSeenT = s.time
        else {
          const node: ReelNode = { id: n.peer_id, index: n.index, x: n.x, y: n.y, attacker: n.state === 'attacker' || isAttackerId(n.peer_id), firstSeenT: s.time, lastSeenT: s.time }
          d.nodes.push(node); d.byId.set(node.id, node)
        }
      }
      d.snapshots.push(snap); lastSnapTime = s.time
    } else if ('type' in f && f.type === 'edges') {
      d.edges = (f as EdgesFrame).edges
    } else if ('type' in f && f.type === 'analytics') {
      const a = f as AnalyticsFrame
      d.analytics.push({ time: lastSnapTime, delivery: a.recent_delivery_ratio ?? a.avg_delivery_ratio, hops: a.avg_hops, propagationMs: a.avg_propagation_ms, total: a.total_messages })
    } else if ('event_type' in f) {
      const e = f as AppEvent
      noteEvent(e.peer_id, e.at); noteEvent(e.from_peer, e.at); noteEvent(e.to_peer, e.at)
      const from = e.from_peer ?? '', to = e.to_peer ?? ''
      switch (e.event_type) {
        case 'GossipMessage':
          if (to !== '') d.messages.push({ at: e.at, from, to, latencyMs: e.latency_ms ?? 0, via: e.via ?? 'mesh', hops: e.hops ?? 0, spam: isAttackerId(from) })
          break
        case 'GossipGraft': d.grafts.push({ at: e.at, from, to }); break
        case 'GossipPrune': d.prunes.push({ at: e.at, from, to, reason: e.reason }); break
        // the clear_faults phase is carried by `cleared` (FaultCleared), not repeated as a phase
        case 'ScenarioPhaseFired': if (e.action !== 'clear_faults' && e.label) d.phases.push({ at: e.at, label: e.label }); break
        case 'FaultInjected': {
          const n = e.params?.n_attackers
          d.faults.push({ at: e.at, type: e.fault_type ?? '', target: e.target, n: typeof n === 'number' ? n : undefined })
          break
        }
        case 'FaultCleared': d.cleared.push({ at: e.at, type: e.fault_type ?? '' }); break
      }
    }
  }
  for (const n of d.nodes) {
    const at = firstEventAt.get(n.id)
    if (at !== undefined && at < n.firstSeenT) n.firstSeenT = at
  }
  const byAt = (a: { at: number }, b: { at: number }) => a.at - b.at
  const byTime = (a: { time: number }, b: { time: number }) => a.time - b.time
  for (const arr of [d.messages, d.grafts, d.prunes, d.phases, d.faults, d.cleared]) arr.sort(byAt)
  d.snapshots.sort(byTime); d.analytics.sort(byTime)
  d.durationSim = d.snapshots.at(-1)?.time ?? 0
  return d
}

function lastAtOrBefore<T extends { time: number }>(arr: T[], simTime: number, ok: (x: T) => boolean = () => true): T | null {
  for (let i = arr.length - 1; i >= 0; i--) if (arr[i].time <= simTime && ok(arr[i])) return arr[i]
  return null
}

export function snapshotAt(d: ReelData, simTime: number): ReelSnapshot {
  return lastAtOrBefore(d.snapshots, simTime) ?? d.snapshots[0]
}

export function analyticsAt(d: ReelData, simTime: number): ReelData['analytics'][number] | null {
  return lastAtOrBefore(d.analytics, simTime, a => a.total > 0)
}

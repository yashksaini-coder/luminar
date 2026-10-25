// Derives the landing readouts (lib/reel-stats.json) and the Fig. 1 plate frames
// (lib/plate-frames.json) from a recorded reel, so no landing number is typed in.
// Usage: node scripts/reel-stats.mjs [public/reels/sybil-eclipse.jsonl]   (A.21; no dependencies)
import { readFileSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

export const STAMP_MAX = 24
export const PLATE_MAX_BYTES = 80_000
const PLATE_FROM = 8
const PLATE_TO = 24
const PLATE_STEP = 0.5
const MAX_HOPS_PER_FRAME = 40
const STATE_CHAR = { idle: 'i', origin: 'o', receiving: 'r', decoded: 'd', joining: 'j', failed: 'f', error: 'e' }

const round1 = x => Math.round(x * 10) / 10
// Same thresholds as scoreBand in components/map/palette.ts (<0 · [0,2) · [2,6) · ≥6).
const band = s => (s < 0 ? 0 : s < 2 ? 1 : s < 6 ? 2 : 3)
const isHonest = id => id.startsWith('peer-')
const isPrunedSybil = n => n.peer_id.startsWith('sybil-') && n.connected_peers.length === 0

/** Parses reel lines into snapshots, typed frames and events, each stamped with sim time. */
function parse(lines) {
  const snapshots = []; const analytics = []; const events = []; let edges = null
  let simTime = 0
  for (const line of lines) {
    const f = JSON.parse(line).frame
    if (Array.isArray(f?.nodes) && typeof f.time === 'number') { simTime = f.time; snapshots.push(f) }
    else if (f?.type === 'analytics') analytics.push({ ...f, simT: simTime })
    else if (f?.type === 'edges') edges ??= f.edges
    else if (f?.event_type) events.push({ ...f, simT: f.at ?? simTime })
  }
  return { snapshots, analytics, events, edges: edges ?? [] }
}

export function computeStats(lines, reel = 'sybil-eclipse') {
  const { snapshots, analytics, events, edges } = parse(lines)
  const first = (pred) => events.find(pred)
  const sybilFault = first(e => e.event_type === 'FaultInjected' && e.fault_type === 'sybil')
  const eclipseFault = first(e => e.event_type === 'FaultInjected' && e.fault_type === 'eclipse')
  const scorePrune = first(e => e.event_type === 'GossipPrune' && e.reason === 'score' && String(e.to_peer).startsWith('sybil-'))
  const cleared = first(e => e.event_type === 'FaultCleared')
  const publish = first(e => e.event_type === 'GossipMessage')
  if (!snapshots.length || !sybilFault || !eclipseFault || !scorePrune || !cleared || !publish) throw new Error(`${reel}: missing a beat the landing needs`)

  const sybilAt = round1(sybilFault.simT)
  const firstScorePruneAt = round1(scorePrune.simT)
  const clearedAt = round1(cleared.simT)
  const firstPublishAt = round1(publish.simT)
  const healed = analytics.find(a => a.simT > cleared.simT && a.recent_delivery_ratio >= 0.95)
  const delivery = analytics.find(a => a.simT >= publish.simT && a.total_messages > 0)
  const lastT = Math.max(snapshots.at(-1).time, events.at(-1)?.simT ?? 0)
  const stats = {
    reel, simDurationS: round1(lastT),
    peers: snapshots[0].node_count, sybils: sybilFault.params.n_attackers,
    heartbeatsToPrune: Math.ceil(round1(scorePrune.simT - sybilFault.simT)),
    deliveryPct: delivery ? Math.round(delivery.recent_delivery_ratio * 100) : 0,
    firstPublishAt, sybilAt, firstScorePruneAt,
    eclipseAt: round1(eclipseFault.simT), eclipseTarget: eclipseFault.target,
    clearedAt, healedInS: healed ? round1(healed.simT - cleared.simT) : 0,
    avgHops: delivery ? round1(delivery.avg_hops) : 0,
    avgPropagationMs: delivery ? Math.round(delivery.avg_propagation_ms) : 0,
  }

  const honest = snapshots[0].nodes.filter(n => isHonest(n.peer_id))
  const indexOf = new Map(honest.map((n, i) => [n.peer_id, i]))
  const nodes = honest.map(n => ({ id: n.peer_id, x: round1(n.x), y: round1(n.y) }))
  const edgePairs = edges.map(([a, b]) => [indexOf.get(a), indexOf.get(b)]).filter(([a, b]) => a !== undefined && b !== undefined)

  const prunedSnap = snapshots.find(s => s.nodes.some(isPrunedSybil))
  const beats = [{ at: sybilFault.simT, stamp: `SYBIL FLOOD · T+${Math.floor(sybilFault.simT)}S` }]
  if (prunedSnap) beats.push({ at: prunedSnap.time, stamp: `${prunedSnap.nodes.filter(isPrunedSybil).length}/${stats.sybils} PRUNED · T+${Math.floor(prunedSnap.time)}S` })
  beats.push({ at: eclipseFault.simT, stamp: `ECLIPSE · N${indexOf.get(eclipseFault.target)} · T+${Math.floor(eclipseFault.simT)}S` })
  beats.push({ at: cleared.simT, stamp: `CLEARED · T+${Math.floor(cleared.simT)}S` })
  beats.sort((a, b) => a.at - b.at)

  const hops = events.filter(e => e.event_type === 'GossipMessage' && e.to_peer)
  const frames = []
  const bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity }
  const grow = (x, y) => { bounds.minX = Math.min(bounds.minX, x); bounds.minY = Math.min(bounds.minY, y); bounds.maxX = Math.max(bounds.maxX, x); bounds.maxY = Math.max(bounds.maxY, y) }
  for (const n of nodes) grow(n.x, n.y)
  let prevT = -Infinity
  for (let k = 0; PLATE_FROM + k * PLATE_STEP <= PLATE_TO; k++) {
    const t = PLATE_FROM + k * PLATE_STEP
    const snap = snapshots.findLast(s => s.time <= t + 1e-6) ?? snapshots[0]
    const byId = new Map(snap.nodes.map(n => [n.peer_id, n]))
    const s = honest.map(h => STATE_CHAR[byId.get(h.peer_id)?.state] ?? 'i').join('')
    const b = honest.map(h => band(byId.get(h.peer_id)?.gossip_score ?? 0)).join('')
    const attackers = snap.nodes.filter(n => n.state === 'attacker')
    const a = attackers.map(n => {
      grow(round1(n.x), round1(n.y))
      return { id: n.peer_id, x: round1(n.x), y: round1(n.y), p: isPrunedSybil(n), v: n.connected_peers.map(id => indexOf.get(id)).filter(i => i !== undefined) }
    })
    const attackerIdx = new Map(attackers.map((n, i) => [n.peer_id, -1 - i]))
    const windowHops = hops.filter(e => e.simT > prevT && e.simT <= t + 1e-6)
      .map(e => [indexOf.get(e.from_peer) ?? attackerIdx.get(e.from_peer), indexOf.get(e.to_peer)])
      .filter(([from, to]) => from !== undefined && to !== undefined)
    const stride = Math.max(1, windowHops.length / MAX_HOPS_PER_FRAME)
    const m = []
    for (let i = 0; i < windowHops.length && m.length < MAX_HOPS_PER_FRAME; i += stride) m.push(windowHops[Math.floor(i)])
    const sybilNodes = snap.nodes.filter(n => n.peer_id.startsWith('sybil-'))
    // A beat lands on its nearest frame (CLEARED at 24.1 s belongs to the T+24 frame).
    const stamp = beats.filter(bt => bt.at <= t + PLATE_STEP / 2).at(-1)?.stamp ?? ''
    frames.push({ t, s, b, a, m, r: { peers: honest.length, sybil: sybilNodes.length, pruned: sybilNodes.filter(isPrunedSybil).length }, stamp })
    prevT = t
  }
  const plate = { reel, from: PLATE_FROM, to: PLATE_TO, step: PLATE_STEP, nodes, edges: edgePairs, bounds, frames }
  return { stats, plate }
}

function main() {
  const here = dirname(fileURLToPath(import.meta.url))
  const reelPath = process.argv[2] ? resolve(process.argv[2]) : join(here, '../public/reels/sybil-eclipse.jsonl')
  const lines = readFileSync(reelPath, 'utf8').split('\n').filter(Boolean)
  const { stats, plate } = computeStats(lines, basename(reelPath, '.jsonl'))
  const plateJson = JSON.stringify(plate)
  const longStamp = plate.frames.find(f => f.stamp.length > STAMP_MAX)
  if (longStamp) { console.error(`stamp over ${STAMP_MAX} chars: "${longStamp.stamp}"`); process.exit(1) }
  if (plateJson.length >= PLATE_MAX_BYTES) { console.error(`plate-frames.json is ${plateJson.length} B, limit ${PLATE_MAX_BYTES}`); process.exit(1) }
  const statsJson = JSON.stringify(stats, null, 2) + '\n'
  for (const [name, body] of [['reel-stats.json', statsJson], ['plate-frames.json', plateJson + '\n']]) {
    const out = join(here, '../lib', name)
    writeFileSync(out, body)
    console.log(`${out} ${Buffer.byteLength(body)} B`)
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()

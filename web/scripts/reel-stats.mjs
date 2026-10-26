// Derives the landing readouts (lib/reel-stats.json) and the Fig. 1 plate frames
// (lib/plate-frames.json) from a recorded reel, so no landing number is typed in.
// Usage: node scripts/reel-stats.mjs [public/reels/sybil-eclipse.jsonl]   (A.21; no dependencies)
import { readFileSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

export const STAMP_MAX = 24
export const PLATE_MAX_BYTES = 80_000
export const CARDS_MAX_BYTES = 40_000
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

/** State chars, score bands, attackers and readout of one snapshot against a fixed honest-node index. */
function frameFields(snap, honest, indexOf) {
  const byId = new Map(snap.nodes.map(n => [n.peer_id, n]))
  const s = honest.map(h => STATE_CHAR[byId.get(h.peer_id)?.state] ?? 'i').join('')
  const b = honest.map(h => band(byId.get(h.peer_id)?.gossip_score ?? 0)).join('')
  const attackers = snap.nodes.filter(n => n.state === 'attacker')
  const a = attackers.map(n => ({ id: n.peer_id, x: round1(n.x), y: round1(n.y), p: isPrunedSybil(n), v: n.connected_peers.map(id => indexOf.get(id)).filter(i => i !== undefined) }))
  const sybilNodes = snap.nodes.filter(n => n.peer_id.startsWith('sybil-'))
  return { s, b, a, attackers, r: { peers: honest.length, sybil: sybilNodes.length, pruned: sybilNodes.filter(isPrunedSybil).length } }
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
    const { s, b, a, r, attackers } = frameFields(snap, honest, indexOf)
    for (const at of a) grow(at.x, at.y)
    const attackerIdx = new Map(attackers.map((n, i) => [n.peer_id, -1 - i]))
    const windowHops = hops.filter(e => e.simT > prevT && e.simT <= t + 1e-6)
      .map(e => [indexOf.get(e.from_peer) ?? attackerIdx.get(e.from_peer), indexOf.get(e.to_peer)])
      .filter(([from, to]) => from !== undefined && to !== undefined)
    const stride = Math.max(1, windowHops.length / MAX_HOPS_PER_FRAME)
    const m = []
    for (let i = 0; i < windowHops.length && m.length < MAX_HOPS_PER_FRAME; i += stride) m.push(windowHops[Math.floor(i)])
    // A beat lands on its nearest frame (CLEARED at 24.1 s belongs to the T+24 frame).
    const stamp = beats.filter(bt => bt.at <= t + PLATE_STEP / 2).at(-1)?.stamp ?? ''
    frames.push({ t, s, b, a, m, r, stamp })
    prevT = t
  }
  const plate = { reel, from: PLATE_FROM, to: PLATE_TO, step: PLATE_STEP, nodes, edges: edgePairs, bounds, frames }
  return { stats, plate }
}

/** Partition card numbers from the partition-heal reel: the scenario's split/clear phases, delivery while cut, time to heal. */
export function computePartition(lines) {
  const { snapshots, analytics } = parse(lines)
  const scenario = lines.map(l => JSON.parse(l).frame).find(f => f?.type === 'scenario' && f.scenario)?.scenario
  const phase = action => scenario?.phases.find(p => p.action === action)?.at
  const splitAt = phase('inject_partition'), clearedAt = phase('clear_faults')
  const cut = analytics.filter(a => a.simT > splitAt && a.simT <= clearedAt).at(-1)
  const healed = analytics.find(a => a.simT > clearedAt && a.recent_delivery_ratio >= 0.95)
  if (!snapshots.length || splitAt === undefined || clearedAt === undefined || !cut || !healed) throw new Error('partition-heal: missing a beat the landing needs')
  return { peers: snapshots[0].node_count, splitAt, clearedAt, cutDeliveryPct: Math.round(cut.recent_delivery_ratio * 100), healedInS: round1(healed.simT - clearedAt) }
}

/** One-frame PlateFrames for a reel card: the busiest real snapshot (geo) or the first at 30 % of the run. */
export function computeCard(lines, meta) {
  const snapshots = []; const edgesAt = []   // edgesAt[k] = latest edges frame before snapshot k (line order)
  let edges = []
  for (const line of lines) {
    const f = JSON.parse(line).frame
    if (Array.isArray(f?.nodes) && typeof f.time === 'number') { snapshots.push(f); edgesAt.push(edges) }
    else if (f?.type === 'edges') edges = f.edges
  }
  if (!snapshots.length) throw new Error(`${meta.name}: no snapshots`)
  const active = s => s.nodes.filter(n => n.state !== 'idle').length
  const at = meta.real
    ? snapshots.reduce((best, s, k) => (active(s) > active(snapshots[best]) ? k : best), 0)
    : Math.max(0, snapshots.findIndex(s => s.time >= 0.3 * snapshots.at(-1).time))
  const snap = snapshots[at]
  const honest = snap.nodes.filter(n => n.state !== 'attacker')
  const indexOf = new Map(honest.map((n, i) => [n.peer_id, i]))
  const nodes = honest.map(n => ({ id: n.peer_id, x: round1(n.x), y: round1(n.y) }))
  const edgePairs = edgesAt[at].map(([a, b]) => [indexOf.get(a), indexOf.get(b)]).filter(([a, b]) => a !== undefined && b !== undefined)
  const { s, b, a, r } = frameFields(snap, honest, indexOf)
  const bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity }
  for (const p of [...nodes, ...a]) { bounds.minX = Math.min(bounds.minX, p.x); bounds.minY = Math.min(bounds.minY, p.y); bounds.maxX = Math.max(bounds.maxX, p.x); bounds.maxY = Math.max(bounds.maxY, p.y) }
  const t = round1(snap.time)
  return { reel: meta.name, from: t, to: t, step: 0, ...(meta.real ? { geo: true } : {}), nodes, edges: edgePairs, bounds, frames: [{ t, s, b, a, m: [], r, stamp: '' }] }
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
  const partition = computePartition(readFileSync(join(here, '../public/reels/partition-heal.jsonl'), 'utf8').split('\n').filter(Boolean))
  const statsJson = JSON.stringify({ ...stats, partition }, null, 2) + '\n'
  for (const [name, body] of [['reel-stats.json', statsJson], ['plate-frames.json', plateJson + '\n']]) {
    const out = join(here, '../lib', name)
    writeFileSync(out, body)
    console.log(`${out} ${Buffer.byteLength(body)} B`)
  }
  const manifest = JSON.parse(readFileSync(join(here, '../public/reels/manifest.json'), 'utf8'))
  const cards = Object.fromEntries(manifest.map(m => [m.name, computeCard(readFileSync(join(here, '../public', m.file), 'utf8').split('\n').filter(Boolean), m)]))
  const cardsJson = JSON.stringify(cards) + '\n'
  if (cardsJson.length >= CARDS_MAX_BYTES) { console.error(`reel-cards.json is ${cardsJson.length} B, limit ${CARDS_MAX_BYTES}`); process.exit(1) }
  const cardsOut = join(here, '../lib/reel-cards.json')
  writeFileSync(cardsOut, cardsJson)
  console.log(`${cardsOut} ${Buffer.byteLength(cardsJson)} B`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()

/** Reel player: streams a recorded frame log (JSONL) and replays it client-side, so the booth runs with no backend. */

import { dispatchFrame, flushEvents } from '@/lib/api/dispatch'
import { useStore } from '@/lib/store'
import { isTypedFrame } from '@/lib/types'
import type { AnalyticsFrame, AppEvent, Beat, ReelFrame, ReelMeta, ScenarioFrame, ScenarioPhase, SnapshotFrame, WsFrame } from '@/lib/types'

export const REEL_TICK_MS = 50              // setInterval, survives background tabs
export const REEL_MIN_SPEED = 0.1
export const SEEK_STATE_TYPES = ['edges', 'scenario', 'telemetry_status', 'snapshot', 'metrics', 'analytics'] as const

const PROGRESS_MS = 100

let frames: ReelFrame[] = []
let cursor = 0          // next frame index to dispatch
let elapsed = 0         // reel-ms played so far (scaled by speed)
let lastTick = 0
let timer: ReturnType<typeof setInterval> | null = null
let playing = false
let speed = 1
let loadGen = 0         // bumped by every loadReel; an older load that sees a newer gen stops (R33)
let beats: Beat[] = []            // every beat a full play-through leaves in the store, known at load so the scrubber draws the whole track at T+0
let phases: ScenarioPhase[] = []  // the recorded scenario's phases (its frame lands ~100 ms after the first snapshot, so the store has none at T+0)

const typeOf = (f: WsFrame): string | null => isTypedFrame(f) ? f.type : null

export function reelLoaded(): boolean { return frames.length > 0 }
export function reelDurationMs(): number { return frames.length ? frames[frames.length - 1].t : 0 }
export function reelElapsedMs(): number { return elapsed }
export function reelPlaying(): boolean { return playing }
export function reelBeats(): Beat[] { return beats }
export function reelPhases(): ScenarioPhase[] { return phases }

/** What a full play-through leaves behind, from the frames alone: the beats store.applyEvents / applyAnalytics / applyScenario
 *  would accumulate, and the phases of the scenario frame that ends up active. */
export function scanReel(all: ReelFrame[]): { beats: Beat[]; phases: ScenarioPhase[] } {
  const out: Beat[] = []
  let ph: ScenarioPhase[] = []
  let time = 0, started = false, sybilPruned = false, healStart: number | null = null, healed = false
  for (const { frame } of all) {
    const type = typeOf(frame)
    if (type === 'snapshot') { time = (frame as SnapshotFrame).time; started = true; continue }   // events before the first snapshot are never played
    if (type === 'scenario') {   // resetNarratorPatch
      const f = frame as ScenarioFrame
      ph = (f.active && f.scenario?.phases) || []
      out.length = 0; sybilPruned = false; healStart = null; healed = false
      continue
    }
    if (type === 'analytics') {
      if (healStart !== null && !healed && ((frame as AnalyticsFrame).recent_delivery_ratio ?? 0) >= 0.95) { healed = true; out.push({ label: 'Mesh healed', time, kind: 'healed' }) }
      continue
    }
    if (type || !started) continue
    const evt = frame as AppEvent
    switch (evt.event_type) {
      case 'ClockTick': time = evt.at; break
      case 'ScenarioPhaseFired': out.push({ label: String(evt.label ?? ''), time: evt.at, kind: 'phase' }); break
      case 'GossipPrune':
        if (!sybilPruned && evt.to_peer?.startsWith('sybil-') && evt.reason === 'score') { sybilPruned = true; out.push({ label: 'First Sybil pruned', time: evt.at, kind: 'prune' }) }
        break
      case 'FaultInjected': out.push({ label: `${evt.fault_type ?? 'fault'} injected`, time: evt.at, kind: 'fault' }); break
      case 'FaultCleared':
        out.push({ label: `${evt.fault_type ?? 'faults'} cleared`, time: evt.at, kind: 'fault' })
        if (healStart === null) healStart = evt.at
        break
    }
  }
  return { beats: out, phases: ph }
}

export function parseReelChunk(text: string, carry: string): { frames: ReelFrame[]; carry: string } {
  const parts = (carry + text).split('\n')
  const tail = parts.pop() ?? ''
  const out: ReelFrame[] = []
  for (const line of parts) {
    if (!line) continue
    let v: unknown
    try { v = JSON.parse(line) } catch { continue }   // skip malformed line
    if (isFrameLine(v)) out.push(v as ReelFrame)
  }
  return { frames: out, carry: tail }
}

// R33: only objects carrying a string `type` or a `frame` key; null, numbers, arrays and the rest are dropped.
const isFrameLine = (v: unknown): boolean =>
  typeof v === 'object' && v !== null && !Array.isArray(v) && (typeof (v as { type?: unknown }).type === 'string' || 'frame' in v)

export async function loadReel(meta: ReelMeta, opts?: { signal?: AbortSignal }): Promise<boolean> {
  unloadReel()   // the previous reel's frames go before the fetch (R33)
  const gen = ++loadGen
  const stale = () => gen !== loadGen || !!opts?.signal?.aborted
  const s = useStore.getState()
  const parsed: ReelFrame[] = []
  let primed = false
  const latest: { edges?: WsFrame; scenario?: WsFrame } = {}
  const take = (batch: ReelFrame[]) => {
    for (const f of batch) {
      parsed.push(f)
      const type = typeOf(f.frame)
      if (type === 'edges' || type === 'scenario') latest[type] = f.frame
      if (type !== 'snapshot' || primed || stale()) continue
      primed = true   // priming: render the mesh before the rest of the file arrives
      if (latest.edges) dispatchFrame(latest.edges)
      if (latest.scenario) dispatchFrame(latest.scenario)
      dispatchFrame(f.frame)
      flushEvents()
    }
  }
  try {
    const res = await fetch(meta.file, { signal: opts?.signal })
    if (!res.ok || !res.body) return false
    const total = Number(res.headers.get('content-length')) || 0
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let carry = '', loaded = 0, lastReport = -Infinity
    for (;;) {
      const { done, value } = await reader.read()
      if (stale()) { void reader.cancel(); return false }
      if (done) break
      loaded += value.byteLength
      const now = Date.now()
      if (now - lastReport >= PROGRESS_MS) { s.setReelLoad({ loaded, total }); lastReport = now }
      const chunk = parseReelChunk(decoder.decode(value, { stream: true }), carry)
      carry = chunk.carry
      take(chunk.frames)
    }
    take(parseReelChunk(carry + decoder.decode() + '\n', '').frames)   // a line cut at EOF is malformed and skipped
  } catch {
    if (!stale()) s.setReelLoad(null)
    return false
  }
  if (stale()) return false
  if (parsed.length === 0) { s.setReelLoad(null); return false }
  frames = parsed
  ;({ beats, phases } = scanReel(parsed))
  const snaps = parsed.filter(f => typeOf(f.frame) === 'snapshot')
  s.setReel({
    name: meta.name, title: meta.title, durationMs: reelDurationMs(),
    durationSim: snaps.length ? (snaps[snaps.length - 1].frame as SnapshotFrame).time : 0,
  })
  s.resetRun()
  seekReel(snaps.length ? snaps[0].t : 0)
  s.setPlaying(false)
  s.setReelLoad(null)
  return true
}

export function playReel(): void {
  if (!frames.length || playing) return
  if (cursor >= frames.length) seekReel(0)
  playing = true
  useStore.getState().setPlaying(true)
  lastTick = performance.now()
  // setInterval, not rAF: rAF stalls in background windows; elapsed is wall-clock based, so a throttled tick catches up in a burst
  timer = setInterval(() => step(performance.now()), REEL_TICK_MS)
}

export function pauseReel(): void {
  const was = playing
  playing = false
  if (timer) clearInterval(timer)
  timer = null
  if (was) useStore.getState().setPlaying(false)
}

export function toggleReel(): void { if (playing) pauseReel(); else playReel() }

export function setReelSpeed(s: number): void { speed = Math.max(REEL_MIN_SPEED, s) }

/** Jump to a reel offset (ms): replays the last state frame of each type at or before it; events only within the tail. */
export function seekReel(ms: number, opts?: { eventTailMs?: number }): void {
  const tailMs = opts?.eventTailMs ?? 0
  const target = Math.max(0, Math.min(ms, reelDurationMs()))
  // Rebuild the time-dependent state from scratch, so a seek backwards cannot keep the log, chart samples,
  // narrator beats or counters of the later moment it left: clear the run, then replay every frame up to the
  // target in order. Typed frames go through dispatchFrame; events go straight into the store (no particle
  // subscribers), except the last `eventTailMs`, which play normally.
  const store = useStore.getState()
  const keep = { selectedPeer: store.selectedPeer, highlightPeers: store.highlightPeers }
  store.resetRun()
  useStore.setState({ activeFaults: 0 })
  let quiet: AppEvent[] = []
  const tail: WsFrame[] = []
  const settle = () => { if (quiet.length) { useStore.getState().applyEvents(quiet); quiet = [] } }
  let i = 0
  for (; i < frames.length && frames[i].t <= target; i++) {
    const { t, frame } = frames[i]
    if (typeOf(frame)) { settle(); dispatchFrame(frame) }
    else if (tailMs > 0 && t > target - tailMs) tail.push(frame)
    else quiet.push(frame as AppEvent)
  }
  settle()
  for (const f of tail) dispatchFrame(f)
  flushEvents()
  const after = useStore.getState()
  if (keep.selectedPeer && after.nodeById.has(keep.selectedPeer)) useStore.setState(keep)   // a seek keeps the inspected peer
  cursor = i
  elapsed = target
  lastTick = performance.now()
}

/** Half the ?t= precision (0.1 s): recorded times are float sums (12.8999…), so a rounded 12.9 still names that snapshot. */
const SEEK_SLACK_SEC = 0.05

/** Seek by simulation seconds (what the scrubber shows) rather than reel ms. */
export function seekReelToSimTime(sec: number): void {
  const hit = frames.find(f => typeOf(f.frame) === 'snapshot' && (f.frame as SnapshotFrame).time >= sec - SEEK_SLACK_SEC)
  seekReel(hit ? hit.t : reelDurationMs())
}

/** Pause and rewind; frames stay until the next loadReel. store.setReel(null) is the caller's job. */
export function stopReel(): void {
  pauseReel()
  cursor = 0
  elapsed = 0
}

export function unloadReel(): void {
  stopReel()
  frames = []
  beats = []
  phases = []
}

function step(now: number): void {
  if (!playing) return
  elapsed += (now - lastTick) * speed
  lastTick = now
  while (cursor < frames.length && frames[cursor].t <= elapsed) {
    const f = frames[cursor++].frame
    try { dispatchFrame(f) } catch (err) { console.error('[reel] frame skipped', typeOf(f) ?? (f as { event_type?: string }).event_type, err) }
  }
  flushEvents()
  if (cursor >= frames.length) {
    elapsed = reelDurationMs()   // the scrubber lands on the total
    pauseReel()
  }
}

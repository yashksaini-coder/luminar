/** Reel player: streams a recorded frame log (JSONL) and replays it client-side, so the booth runs with no backend. */

import { dispatchFrame, flushEvents } from '@/lib/api/dispatch'
import { useStore } from '@/lib/store'
import { isTypedFrame } from '@/lib/types'
import type { ReelFrame, ReelMeta, SnapshotFrame, WsFrame } from '@/lib/types'

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

const typeOf = (f: WsFrame): string | null => isTypedFrame(f) ? f.type : null

export function reelLoaded(): boolean { return frames.length > 0 }
export function reelDurationMs(): number { return frames.length ? frames[frames.length - 1].t : 0 }
export function reelElapsedMs(): number { return elapsed }
export function reelPlaying(): boolean { return playing }

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
  const last = new Map<string, WsFrame>()
  const tail: WsFrame[] = []
  let i = 0
  for (; i < frames.length && frames[i].t <= target; i++) {
    const { t, frame } = frames[i]
    const type = typeOf(frame)
    if (type) last.set(type, frame)
    else if (tailMs > 0 && t > target - tailMs) tail.push(frame)
  }
  for (const type of SEEK_STATE_TYPES) {
    const f = last.get(type)
    if (f) dispatchFrame(f)
  }
  for (const f of tail) dispatchFrame(f)
  flushEvents()
  cursor = i
  elapsed = target
  lastTick = performance.now()
}

/** Seek by simulation seconds (what the scrubber shows) rather than reel ms. */
/** Half the ?t= precision (0.1 s): recorded times are float sums (12.8999…), so a rounded 12.9 still names that snapshot. */
const SEEK_SLACK_SEC = 0.05

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

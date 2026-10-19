// Reel player — replays a recorded WebSocket frame stream (JSONL) client-side.
// No backend needed: the Devcon booth runs on this when Wi-Fi dies.
import { ws } from './websocket'
import { getStaticText } from './client'
import { store } from '../store'

export interface ReelFrame { t: number; frame: any }
export interface ReelMeta { name: string; title: string; file: string; nodes?: number; blurb?: string }

const TICK_MS = 50  // same cadence as the live WS batch
let frames: ReelFrame[] = []
let cursor = 0          // next frame index to dispatch
let elapsed = 0         // reel-ms played so far (scaled by speed)
let lastTick = 0
let timer: ReturnType<typeof setInterval> | null = null
let playing = false
let speed = 1
let onTick: (() => void) | null = null

export function reelLoaded(): boolean { return frames.length > 0 }
export function reelDurationMs(): number { return frames.length ? frames[frames.length - 1].t : 0 }
export function reelElapsedMs(): number { return elapsed }
export function reelPlaying(): boolean { return playing }

export async function loadReel(meta: ReelMeta, tick: () => void): Promise<boolean> {
  const text = await getStaticText(meta.file)
  if (text === null) return false
  const parsed: ReelFrame[] = []
  for (const line of text.split('\n')) {
    if (!line) continue
    try { parsed.push(JSON.parse(line)) } catch { /* skip malformed line */ }
  }
  if (parsed.length === 0) return false
  stopReel()
  frames = parsed
  onTick = tick
  const snaps = parsed.filter(f => f.frame?.type === 'snapshot')
  store.reel = {
    name: meta.name,
    title: meta.title,
    durationMs: reelDurationMs(),
    durationSim: snaps.length ? snaps[snaps.length - 1].frame.time : 0,
  }
  store.events = []
  store.droppedEvents = 0
  // Prime state: land on the first snapshot so the graph is visible before play
  seekReel(snaps.length ? snaps[0].t : 0)
  return true
}

export function playReel() {
  if (!frames.length || playing) return
  if (cursor >= frames.length) seekReel(0)
  playing = true
  lastTick = performance.now()
  // setInterval, not rAF: rAF stalls in occluded/background windows, and a booth laptop
  // alt-tabbing to Grafana must not freeze the reel. Elapsed time is wall-clock based,
  // so a throttled 1 Hz tick still dispatches the right frames in a burst.
  timer = setInterval(() => step(performance.now()), TICK_MS)
}

export function pauseReel() {
  playing = false
  if (timer) clearInterval(timer)
  timer = null
}

export function toggleReel() { playing ? pauseReel() : playReel() }

export function setReelSpeed(s: number) { speed = Math.max(0.1, s) }

/** Jump to a reel offset (ms). Replays the last state frames before t; skips events. */
export function seekReel(ms: number) {
  const target = Math.max(0, Math.min(ms, reelDurationMs()))
  let i = 0
  const last: Record<string, any> = {}
  while (i < frames.length && frames[i].t <= target) {
    const f = frames[i].frame
    if (f.type) last[f.type] = f          // edges / scenario / snapshot / metrics / analytics
    i++
  }
  for (const type of ['edges', 'scenario', 'snapshot', 'metrics', 'analytics']) {
    if (last[type]) ws.dispatch(last[type])
  }
  ws.flush()
  cursor = i
  elapsed = target
  lastTick = performance.now()
  onTick?.()
}

/** Seek by simulation seconds (what the scrubber shows) rather than reel ms. */
export function seekReelToSimTime(simSec: number) {
  const hit = frames.find(f => f.frame?.type === 'snapshot' && f.frame.time >= simSec)
  seekReel(hit ? hit.t : reelDurationMs())
}

export function stopReel() {
  pauseReel()
  frames = []
  cursor = 0
  elapsed = 0
  store.reel = null
}

function step(now: number) {
  if (!playing) return
  elapsed += (now - lastTick) * speed
  lastTick = now
  while (cursor < frames.length && frames[cursor].t <= elapsed) {
    const f = frames[cursor++].frame
    try { ws.dispatch(f) } catch (err) { console.error('[reel] frame skipped', f?.type ?? f?.event_type, err) }
  }
  ws.flush()
  onTick?.()
  if (cursor >= frames.length) { pauseReel(); store.playing = false; onTick?.() }
}

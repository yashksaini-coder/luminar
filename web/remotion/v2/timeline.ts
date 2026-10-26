/** LaunchV2 timeline: scene spans, the cuts the pixel dissolve runs on, and the soundtrack cue sheet read off the reel. */
import { TOY } from '../constants'
import type { ReelData } from '../reel/parse'

export const FPS = 30
export const W = 1920
export const H = 1080

export type V2Id = 'open' | 'title' | 'publish' | 'sybil' | 'pruned' | 'eclipse' | 'heal' | 'honesty' | 'end'

export interface V2Span {
  id: V2Id
  from: number
  durationInFrames: number
  /** Reel sim time (s) at the first frame and sim seconds per video second, for the mesh acts. */
  simOffset?: number
  speed?: number
}

export const SPANS: V2Span[] = [
  { id: 'open', from: 0, durationInFrames: 75 },
  { id: 'title', from: 75, durationInFrames: 120 },
  { id: 'publish', from: 195, durationInFrames: 210, simOffset: 5.4, speed: 0.65 },
  { id: 'sybil', from: 405, durationInFrames: 270, simOffset: 9.9, speed: 0.3 },
  { id: 'pruned', from: 675, durationInFrames: 105 },
  { id: 'eclipse', from: 780, durationInFrames: 225, simOffset: 16.0, speed: 1 },
  { id: 'heal', from: 1005, durationInFrames: 120, simOffset: 23.8, speed: 1 },
  { id: 'honesty', from: 1125, durationInFrames: 120 },
  { id: 'end', from: 1245, durationInFrames: 120 },
]

export const DURATION = SPANS.at(-1)!.from + SPANS.at(-1)!.durationInFrames

/** Every scene boundary; the pixel dissolve closes into each one and opens out of it. */
export const CUTS = SPANS.slice(1).map(s => s.from)

export const simTimeAt = (s: V2Span, local: number) => (s.simOffset ?? 0) + (local / FPS) * (s.speed ?? 1)

/** Absolute frame where sim time t plays inside a mesh span, or null when t falls outside it. */
export function frameAt(s: V2Span, t: number): number | null {
  if (s.simOffset === undefined) return null
  const local = Math.round(((t - s.simOffset) / (s.speed ?? 1)) * FPS)
  return local >= 0 && local < s.durationInFrames ? s.from + local : null
}

export type Sfx = 'tick' | 'blip' | 'sweep' | 'swell' | 'resolve'
export interface Cue { frame: number; sfx: Sfx }

/** Gap (s) that separates two message bursts, and the smallest burst that earns a blip. */
const BURST_GAP = 0.3
const BURST_MIN = 100
/** The swell file peaks 1.1 s in, so it starts that far ahead of the cut. */
const SWELL_LEAD = 33

/** Groups sorted times into runs whose neighbours sit within `gap`; returns each run's start and size. */
export function clusters(times: number[], gap: number): { at: number; n: number }[] {
  const out: { at: number; n: number; last: number }[] = []
  for (const t of times) {
    const c = out.at(-1)
    if (c && t - c.last <= gap) { c.n++; c.last = t } else out.push({ at: t, n: 1, last: t })
  }
  return out.map(({ at, n }) => ({ at, n }))
}

/** The cue sheet: a tick on every heartbeat, a blip per message burst and a down-sweep per prune round
 *  inside the mesh acts (all at the reel's own sim times), a swell into every cut, a resolve on the end card. */
export function cueSheet(d: ReelData): Cue[] {
  const cues: Cue[] = []
  const hb = TOY.heartbeatS
  // heartbeats share the phase of the first prune (prunes only happen on a heartbeat)
  const phase = ((d.prunes[0]?.at ?? 0) % hb + hb) % hb
  const bursts = clusters(d.messages.map(m => m.at), BURST_GAP).filter(b => b.n >= BURST_MIN)
  const prunes = clusters(d.prunes.map(p => p.at), 0.05)
  for (const s of SPANS) {
    if (s.simOffset === undefined) continue
    const end = simTimeAt(s, s.durationInFrames)
    for (let t = Math.ceil((s.simOffset - phase) / hb) * hb + phase; t < end; t += hb) push(frameAt(s, t), 'tick')
    for (const b of bursts) push(frameAt(s, b.at), 'blip')
    for (const p of prunes) push(frameAt(s, p.at), 'sweep')
  }
  for (const c of CUTS) push(c - SWELL_LEAD, 'swell')
  push(SPANS.at(-1)!.from + 6, 'resolve')
  return cues.sort((a, b) => a.frame - b.frame)

  function push(frame: number | null, sfx: Sfx) {
    if (frame !== null && frame >= 0) cues.push({ frame, sfx })
  }
}

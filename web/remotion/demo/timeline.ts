/** Demo timeline: script.json (the film's single source of truth) in frames, the cuts, the pixel-dissolve profile,
 *  the recorded-cursor interpolation, the music bed's gain curve and the SFX cue placement. Nothing here retypes a
 *  time or a number from the script; every value is derived. */
import * as copy from '@/lib/copy'
import raw from './script.json'

export interface Scene { id: string; at: number; dur: number; kind: 'card' | 'shot' }
export interface Caption { at: number; until: number; text: string }
export interface Cue { t: number; sound: string; db: number; why: string }
export interface Shot { reel: string; simFrom: number; speed: number; hero: boolean; click?: { at: number; peer: string } }
export interface Script {
  fps: number; width: number; height: number; bpm: number
  scenes: Scene[]
  shots: Record<string, Shot>
  landings: Record<string, number>
  captions: Caption[]
  vo: { at: number; text: string }[]
  airPockets: [number, number][]
  cues: Cue[]
}

/** `{NAME}` in a caption is lib/copy's NAME: the honesty sentences are written once, in that file, and the script carries
 *  a token (the repo's forbidden-phrase grep holds for the JSON too). An unknown token fails the load, never renders. */
export const expand = (text: string) => text.replace(/\{(\w+)\}/g, (_, k: string) => {
  const v = (copy as Record<string, unknown>)[k]
  if (typeof v !== 'string') throw new Error(`script.json: unknown copy token {${k}}`)
  return v
})
const RAW = raw as unknown as Script
export const SCRIPT: Script = { ...RAW, captions: RAW.captions.map(c => ({ ...c, text: expand(c.text) })) }
export const { fps: FPS, width: W, height: H } = SCRIPT
/** One beat of the cut grid (s). */
export const BEAT = 60 / SCRIPT.bpm
export const SCENES = SCRIPT.scenes
/** The frame contracts (film seconds), without the script's comment field. */
export const LANDINGS = Object.fromEntries(Object.entries(SCRIPT.landings).filter(([, v]) => typeof v === 'number')) as Record<string, number>
export const frameAt = (s: number) => Math.round(s * FPS)
/** The film's length (s) and in frames. */
export const FILM_END = SCENES.at(-1)!.at + SCENES.at(-1)!.dur
export const DURATION = frameAt(FILM_END)
/** Every scene boundary; the pixel dissolve closes into each one and opens out of it. */
export const CUTS = SCENES.slice(1).map(s => frameAt(s.at))

const EPS = 1e-6   // the script's sums (41.4 + 10.2) land a float ulp short of the grid
export const sceneAt = (t: number) => SCENES.find(s => t >= s.at - EPS && t < s.at + s.dur - EPS)
/** The captions that start inside a scene, on the film clock. */
export const captionsIn = (s: Scene) => SCRIPT.captions.filter(c => c.at >= s.at - EPS && c.at < s.at + s.dur - EPS)

/** Coverage of the dissolve at frame f: full on the two frames either side of each cut (the Sequence switch on the cut
 *  frame happens under it), rising over `half` frames before and gone `half` frames after. */
export function dissolveAt(f: number, half = 12): number {
  let p = 0
  for (const c of CUTS) p = Math.max(p, 1 - (Math.abs(f - c + 0.5) - 0.5) / half)
  return Math.min(1, Math.max(0, p))
}

/* ───────────────────────────── cursor (recorder events) ───────────────────────────── */

export interface CursorEvent { t: number; x: number; y: number; kind: 'move' | 'click' }
export interface CursorState { x: number; y: number; /** seconds since the latest click, or null before any click */ click: number | null }

/** The cursor at shot second t: linear between the recorded points, held on the last one; null before the first event
 *  (nothing recorded yet, nothing drawn). */
export function cursorAt(ev: CursorEvent[], t: number): CursorState | null {
  if (!ev.length || t < ev[0].t) return null
  let i = ev.findIndex(e => e.t > t)
  if (i === -1) i = ev.length
  const a = ev[i - 1], b = ev[i] as CursorEvent | undefined
  const k = b && b.t > a.t ? (t - a.t) / (b.t - a.t) : 0
  let click: CursorEvent | undefined
  for (const e of ev) if (e.kind === 'click' && e.t <= t) click = e
  return { x: a.x + (b ? (b.x - a.x) * k : 0), y: a.y + (b ? (b.y - a.y) * k : 0), click: click ? t - click.t : null }
}

/* ──────────────────────────────────── soundtrack ──────────────────────────────────── */

/** Bed gains: resting, under a voiceover line, the top of the outro swell; `edge` (s) is the duck's ramp. */
export const BED = { base: 0.7, dip: 0.45, swell: 1, edge: 0.15 } as const
const VO_MAX_S = 4

/** The windows the bed ducks under: each vo line from its start to the next line's start, at most 4 s. */
export const voWindows = (): [number, number][] =>
  SCRIPT.vo.map((l, i) => [l.at, Math.min(SCRIPT.vo[i + 1]?.at ?? Infinity, l.at + VO_MAX_S)])

/** Bed gain at film second t: base, dipped under each vo window (only when a voiceover is mixed, with a short ramp so the
 *  duck never clicks), rising to the swell across the outro air pocket. The pre-prune air pocket lives in the bed itself. */
export function bedVolume(t: number, vo: boolean): number {
  const [p0, p1] = SCRIPT.airPockets[1]
  if (t >= p0) return BED.base + (BED.swell - BED.base) * Math.min(1, (t - p0) / (p1 - p0))
  if (!vo) return BED.base
  let d = 0
  for (const [a, b] of voWindows()) d = Math.max(d, Math.min(1, (t - a + BED.edge) / BED.edge, (b + BED.edge - t) / BED.edge))
  return BED.base - (BED.base - BED.dip) * Math.max(0, d)
}

export interface Sound { file: string; hit: number; peakDb: number }
export interface PlacedCue extends Cue { from: number; file: string; gain: number }

/** Each cue's file placed so its measured hit lands on the cue frame, with the linear gain that makes the cue's dB
 *  its true output peak (1 dB under, the mixer's headroom). Cues whose sound is not in the table are dropped. */
export const placeCues = (sounds: Record<string, Sound>): PlacedCue[] =>
  SCRIPT.cues.flatMap(c => {
    const s = sounds[c.sound]
    return s ? [{ ...c, from: Math.round((c.t - s.hit) * FPS), file: s.file, gain: 10 ** ((c.db - s.peakDb - 1) / 20) }] : []
  })

/** Launch video timeline: per-orientation scene spans (storyboard tables) and frame ↔ sim-time maths (A.22, A.31). */
import type { Orientation } from './props'

export type SceneId =
  | 'cold-open' | 'title' | 'healthy' | 'sybils' | 'pruned' | 'eclipse'
  | 'heal' | 'same-names' | 'mainnet' | 'honesty' | 'end'

export interface SceneSpan {
  id: SceneId
  from: number
  durationInFrames: number
  /** Reel sim time (s) at the span's first frame. */
  simOffset?: number
  /** Sim seconds per video second. */
  speed?: number
}

export const FPS = 30

export const SIZE: Record<Orientation, { width: number; height: number; durationInFrames: number }> = {
  wide: { width: 1920, height: 1080, durationInFrames: 1710 },
  tall: { width: 1080, height: 1920, durationInFrames: 1440 },
}

export const SAFE_TALL = { top: 220, bottom: 320 }

export const timeline: Record<Orientation, SceneSpan[]> = {
  wide: [
    { id: 'cold-open', from: 0, durationInFrames: 75 },
    { id: 'title', from: 75, durationInFrames: 165 },
    { id: 'healthy', from: 240, durationInFrames: 240, simOffset: 4.0 },
    { id: 'sybils', from: 480, durationInFrames: 180, simOffset: 9.5 },
    { id: 'pruned', from: 660, durationInFrames: 180, simOffset: 11.4, speed: 0.6 },
    { id: 'eclipse', from: 840, durationInFrames: 270, simOffset: 15.5 },
    { id: 'heal', from: 1110, durationInFrames: 120, simOffset: 23.6 },
    { id: 'same-names', from: 1230, durationInFrames: 180 },
    { id: 'mainnet', from: 1410, durationInFrames: 90 },
    { id: 'honesty', from: 1500, durationInFrames: 90 },
    { id: 'end', from: 1590, durationInFrames: 120 },
  ],
  tall: [
    { id: 'cold-open', from: 0, durationInFrames: 75 },
    { id: 'title', from: 75, durationInFrames: 135 },
    { id: 'healthy', from: 210, durationInFrames: 210, simOffset: 4.0 },
    { id: 'sybils', from: 420, durationInFrames: 150, simOffset: 9.5 },
    { id: 'pruned', from: 570, durationInFrames: 180, simOffset: 11.4, speed: 0.6 },
    { id: 'eclipse', from: 750, durationInFrames: 240, simOffset: 15.5 },
    { id: 'heal', from: 990, durationInFrames: 120, simOffset: 23.6 },
    { id: 'same-names', from: 1110, durationInFrames: 120 },
    { id: 'honesty', from: 1230, durationInFrames: 90 },
    { id: 'end', from: 1320, durationInFrames: 120 },
  ],
}

export function sceneAt(o: Orientation, frame: number): SceneSpan | undefined {
  return timeline[o].find(s => frame >= s.from && frame < s.from + s.durationInFrames)
}

export function simTimeAt(span: SceneSpan, localFrame: number): number {
  return (span.simOffset ?? 0) + (localFrame / FPS) * (span.speed ?? 1)
}

export function frameForSimTime(span: SceneSpan, t: number): number {
  return span.from + Math.round(((t - (span.simOffset ?? 0)) / (span.speed ?? 1)) * FPS)
}

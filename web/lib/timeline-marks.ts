import type { Beat, BeatKind, ScenarioPhase } from '@/lib/types'

export interface Band { left: number; width: number; action: string; label: string; at: number }   // left/width as 0..1 fractions of total
export interface Tick { pos: number; time: number; label: string; kind: BeatKind }                // pos 0..1

/** One band per inject_* phase, running until the next clear_faults (else total). */
export function bandsFor(phases: ScenarioPhase[], total: number): Band[] {
  if (total <= 0) return []
  const clears = phases.filter(p => p.action === 'clear_faults').map(p => p.at)
  return phases.filter(p => p.action.startsWith('inject_')).map(p => {
    const end = Math.min(total, clears.find(c => c > p.at) ?? total)
    return { left: p.at / total, width: Math.max(0, end - p.at) / total, action: p.action, label: p.label, at: p.at }
  })
}

/** Phases as 'phase' ticks plus beats; a phase within 0.05 s of a beat is dropped (beat wins). */
export function ticksFor(beats: Beat[], phases: ScenarioPhase[], total: number): Tick[] {
  const phaseBeats: Beat[] = phases
    .filter(p => !beats.some(b => Math.abs(b.time - p.at) < 0.05))
    .map(p => ({ label: p.label, time: p.at, kind: 'phase' }))
  return [...beats, ...phaseBeats]
    .filter(b => b.time <= total)
    .sort((a, b) => a.time - b.time)
    .map(b => ({ pos: total > 0 ? b.time / total : 0, time: b.time, label: b.label, kind: b.kind }))
}

const WASH = { sybil: '--wash-sybil', eclipse: '--wash-eclipse', partition: '--wash-partition', latency: '--wash-latency' } as const

export function washVar(action: string): (typeof WASH)[keyof typeof WASH] {
  return WASH[action.replace(/^inject_/, '') as keyof typeof WASH] ?? WASH.partition
}

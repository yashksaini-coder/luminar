import { expect, test } from 'vitest'
import { bandsFor, ticksFor, washVar } from '@/lib/timeline-marks'
const phases = [
  { at: 10, label: 'Sybil attack: 5 attackers graft in', action: 'inject_sybil' },
  { at: 16, label: 'Eclipse on peer-10', action: 'inject_eclipse' },
  { at: 24, label: 'Faults cleared — mesh healing', action: 'clear_faults' },
]
test('bandsFor: one band per inject_* phase until the next clear_faults, fractions of total', () => {
  expect(bandsFor(phases, 60)).toEqual([
    { left: 10 / 60, width: 14 / 60, action: 'inject_sybil', label: 'Sybil attack: 5 attackers graft in', at: 10 },
    { left: 16 / 60, width: 8 / 60, action: 'inject_eclipse', label: 'Eclipse on peer-10', at: 16 },
  ])
  expect(bandsFor([{ at: 5, label: 'p', action: 'inject_partition' }], 20)).toEqual([{ left: 0.25, width: 0.75, action: 'inject_partition', label: 'p', at: 5 }])
  expect(bandsFor(phases, 0)).toEqual([])
})
test('ticksFor: phases + beats, deduped within 0.5 s (beat wins; a fired phase lands 0.1–0.2 s after its at), sorted, clipped to total', () => {
  const beats = [{ label: 'First Sybil pruned', time: 11.9, kind: 'prune' as const }, { label: 'Sybil attack: 5 attackers graft in', time: 10.2, kind: 'phase' as const }, { label: 'late', time: 99, kind: 'healed' as const }]
  const t = ticksFor(beats, phases, 60)
  expect(t.map(x => [x.time, x.kind])).toEqual([[10.2, 'phase'], [11.9, 'prune'], [16, 'phase'], [24, 'phase']])
  expect(t[1].pos).toBeCloseTo(11.9 / 60)
})
test('washVar maps inject_<x> to --wash-<x>', () => {
  expect(['inject_sybil', 'inject_eclipse', 'inject_partition', 'inject_latency', 'inject_drop'].map(washVar)).toEqual(['--wash-sybil', '--wash-eclipse', '--wash-partition', '--wash-latency', '--wash-partition'])
})

/** Timeline: spans tile both cuts exactly; frame ↔ sim-time maths lands on the storyboard's phase marks. */
import { expect, test } from 'vitest'
import { FPS, SAFE_TALL, SIZE, type SceneId, frameForSimTime, sceneAt, simTimeAt, timeline } from './timeline'

test('spans tile the composition exactly, in order, with no gaps', () => {
  for (const o of ['wide', 'tall'] as const) {
    const spans = timeline[o]; let cursor = 0
    for (const s of spans) { expect(s.from).toBe(cursor); cursor += s.durationInFrames }
    expect(cursor).toBe(SIZE[o].durationInFrames)
  }
  expect(timeline.wide.map(s => s.id)).toEqual(['cold-open','title','healthy','sybils','pruned','eclipse','heal','same-names','mainnet','honesty','end'])
  expect(timeline.tall.find(s => s.id === 'mainnet')).toBeUndefined()
})
test('frame ↔ sim time at the reel\'s phase marks', () => {
  const w = (id: SceneId) => timeline.wide.find(s => s.id === id)!
  expect(simTimeAt(w('pruned'), 25)).toBeCloseTo(11.9, 5)              // 0.6× slow motion
  expect(frameForSimTime(w('pruned'), 11.9)).toBe(685)                   // the storyboard's "≈ frame 685"
  expect(frameForSimTime(w('healthy'), 5.8)).toBe(294)
  expect(frameForSimTime(w('sybils'), 10.2)).toBe(501)
  expect(frameForSimTime(w('eclipse'), 16.2)).toBe(861)
  expect(frameForSimTime(w('eclipse'), 16.9)).toBe(882)
  expect(frameForSimTime(w('heal'), 24.1)).toBe(1125)
  const t = (id: SceneId) => timeline.tall.find(s => s.id === id)!
  expect(frameForSimTime(t('pruned'), 11.9)).toBe(595)
  expect(sceneAt('wide', 685)?.id).toBe('pruned'); expect(sceneAt('wide', 1710)).toBeUndefined()
  expect(SAFE_TALL).toEqual({ top: 220, bottom: 320 }); expect(FPS).toBe(30)
})

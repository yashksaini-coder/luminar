import { test, expect } from 'vitest'
import { isTypedFrame } from '@/lib/types'
test('events have no type field; typed frames do', () => {
  expect(isTypedFrame({ at: 1, event_type: 'ClockTick', category: 'clock' })).toBe(false)
  expect(isTypedFrame({ type: 'gap', dropped: 3 })).toBe(true)
})

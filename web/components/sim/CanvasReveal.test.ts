import { act, createElement as h } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, test, vi } from 'vitest'
import { REVEAL_STEP_MS, revealSteps } from '@/components/dither/dither'
import { snapWith } from '@/lib/fixtures'
import { useStore } from '@/lib/store'
import CanvasReveal from './CanvasReveal'

const reducedMotionMock = vi.hoisted(() => vi.fn(() => false))
vi.mock('@/lib/prefs', () => ({ reducedMotion: reducedMotionMock }))

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
test('mounts the overlay only on the 0 → n transition, removes it after the reveal, never under reduced motion', () => {
  vi.useFakeTimers(); const host = document.body.appendChild(document.createElement('div')); const root = createRoot(host)
  act(() => root.render(h(CanvasReveal))); expect(host.querySelector('[data-reveal]')).toBeNull()                // no nodes yet
  act(() => useStore.getState().applySnapshot(snapWith(['peer-0', 'peer-1']))); expect(host.querySelector('[data-reveal] canvas[data-dither]')).toBeTruthy()
  act(() => { vi.advanceTimersByTime(revealSteps(2).length * REVEAL_STEP_MS) }); expect(host.querySelector('[data-reveal]')).toBeNull()   // gone after the last step (R12)
  act(() => useStore.getState().applySnapshot(snapWith(['peer-0']))); expect(host.querySelector('[data-reveal]')).toBeNull() // a later snapshot does not re-trigger
  act(() => root.unmount())
  reducedMotionMock.mockReturnValue(true); useStore.setState(useStore.getInitialState(), true); const root2 = createRoot(host)
  act(() => root2.render(h(CanvasReveal))); act(() => useStore.getState().applySnapshot(snapWith(['peer-0']))); expect(host.querySelector('[data-reveal]')).toBeNull()
  act(() => root2.unmount()); vi.useRealTimers()
})

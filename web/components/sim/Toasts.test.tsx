import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import Toasts, { TOAST_MS } from '@/components/sim/Toasts'
import { useStore } from '@/lib/store'

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
let root: Root, host: HTMLDivElement
beforeEach(() => {
  vi.useFakeTimers()
  useStore.setState(useStore.getInitialState(), true)
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host)
  act(() => root.render(<Toasts />))
})
afterEach(() => { act(() => root.unmount()); host.remove(); vi.useRealTimers() })

test('a pushed toast renders in the polite status stack with its kind, then dismisses after TOAST_MS', () => {
  const stack = host.querySelector('[role="status"]')!; expect(stack.getAttribute('aria-live')).toBe('polite')
  act(() => { useStore.getState().pushToast('backend offline', 'fail') })
  const t = stack.querySelector('[data-kind="fail"]')!; expect(t.textContent).toBe('backend offline')
  act(() => { vi.advanceTimersByTime(TOAST_MS - 1) }); expect(stack.children).toHaveLength(1)
  act(() => { vi.advanceTimersByTime(1) }); expect(stack.children).toHaveLength(0); expect(useStore.getState().toasts).toEqual([])
})

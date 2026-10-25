import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, test } from 'vitest'
import Legend from '@/components/sim/Legend'
import { useStore } from '@/lib/store'

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
let root: Root, host: HTMLDivElement
beforeEach(() => {
  useStore.setState(useStore.getInitialState(), true)
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host)
  act(() => root.render(<Legend />))
})
afterEach(() => { act(() => root.unmount()); host.remove() })

// The T key (task 3.10) toggles through setPref('stageTheme'); the switch must follow the store, not keep its own state.
test('the Stage theme switch follows setPref toggles from outside the form', () => {
  act(() => host.querySelector<HTMLButtonElement>('button[aria-label="Settings"]')!.click())
  const stage = () => [...host.querySelectorAll<HTMLInputElement>('input[role=switch]')]
    .find(i => i.closest('label')!.textContent!.startsWith('Stage theme'))!
  expect(stage().checked).toBe(false)
  act(() => useStore.getState().setPref('stageTheme'))
  expect(stage().checked).toBe(true)
  act(() => useStore.getState().setPref('stageTheme'))
  expect(stage().checked).toBe(false)
})

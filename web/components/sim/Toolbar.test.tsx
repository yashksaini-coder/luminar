import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, test } from 'vitest'
import Toolbar from '@/components/sim/Toolbar'
import { useStore } from '@/lib/store'

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
let root: Root, host: HTMLDivElement
beforeEach(() => {
  useStore.setState(useStore.getInitialState(), true)
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host)
  act(() => root.render(<Toolbar onMenu={() => {}} menuOpen={false} />))
})
afterEach(() => { act(() => root.unmount()); host.remove() })
const q = (id: string) => host.querySelector(`[data-testid="${id}"]`)!

test('clock shows seconds under a minute and m:ss past it', () => {
  act(() => useStore.setState({ simTime: 12.34 })); expect(q('clock').textContent).toBe('T+ 12.3s')
  act(() => useStore.setState({ simTime: 62 })); expect(q('clock').textContent).toBe('T+ 1:02')
})
test('pill reads OFFLINE, LIVE, then REEL · title', () => {
  expect(q('pill').textContent).toBe('OFFLINE'); expect(q('pill').getAttribute('data-state')).toBe('offline')
  act(() => useStore.setState({ connected: true })); expect(q('pill').textContent).toBe('LIVE')
  act(() => useStore.setState({ reel: { name: 'r', title: 'Eclipse', durationMs: 1, durationSim: 1 } }))
  expect(q('pill').textContent).toBe('REEL · Eclipse'); expect(q('pill').getAttribute('data-state')).toBe('reel')
})

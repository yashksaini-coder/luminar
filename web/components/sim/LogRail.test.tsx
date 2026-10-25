import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, test } from 'vitest'
import LogRail from '@/components/sim/LogRail'
import { useStore } from '@/lib/store'
import type { AppEvent } from '@/lib/types'

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
const ev = (at: number) => ({ at, event_type: 'GossipMessage', category: 'gossip', peer_id: `peer-${at}` }) as AppEvent
const batch = (from: number, n: number) => Array.from({ length: n }, (_, i) => ev(from + i))
let root: Root, host: HTMLDivElement
beforeEach(() => {
  useStore.setState({ ...useStore.getInitialState(), events: batch(0, 500) }, true)
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host)
  act(() => root.render(<LogRail />))
})
afterEach(() => { act(() => root.unmount()); host.remove() })

test('paused, a batch that trims the 500-row cap leaves the rendered rows (and so the view) unchanged; following resumes them', () => {
  const list = host.querySelector('[role=button]')!.parentElement!
  Object.defineProperty(list, 'scrollHeight', { configurable: true, value: 500 * 22 })
  Object.defineProperty(list, 'clientHeight', { configurable: true, value: 400 })
  const first = () => list.querySelector('[role=button]')!.textContent
  list.scrollTop = 2000
  act(() => { list.dispatchEvent(new Event('scroll')) })
  expect(host.querySelector('header')!.textContent).toContain('paused')
  const before = first()
  act(() => { useStore.setState({ events: batch(600, 500) }) })   // every row turns over in one tick
  expect(first()).toBe(before)
  list.scrollTop = 500 * 22 - 400
  act(() => { list.dispatchEvent(new Event('scroll')) })
  expect(host.querySelector('header')!.textContent).toContain('following')
  expect(first()).toContain('600.00')
})

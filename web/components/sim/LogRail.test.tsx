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
  useStore.setState({ ...useStore.getInitialState(), connecting: false, events: batch(0, 500) }, true)
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

// T8 empty states: no category selected, and no matching row yet.
test('empty list text: None → "no categories selected · All restores them"; no events → "waiting for the first event"', () => {
  const list = () => host.querySelector('[role=button]')?.parentElement ?? host.querySelector('[class*=list]')!
  act(() => [...host.querySelectorAll('button')].find(b => b.textContent === 'None')!.click())
  expect(host.querySelectorAll('[role=button]').length).toBe(0)
  expect(list().textContent).toBe('no categories selected · All restores them')
  act(() => [...host.querySelectorAll('button')].find(b => b.textContent === 'All')!.click())
  expect(host.querySelectorAll('[role=button]').length).toBe(500)
  act(() => { useStore.setState({ events: [] }) })
  expect(list().textContent).toBe('waiting for the first event')
  // a recording seeked to T+0 has counted events it does not replay: say so instead of 'waiting'
  act(() => { useStore.setState({ reel: { name: 'r', title: 'R', durationMs: 1000, durationSim: 39.7 }, eventCount: 50 }) })
  expect(list().textContent).toBe('events before this moment are not replayed · press play')
})

// T8 (prod-09): until the first socket open/close the list is skeleton rows and the rail is aria-busy; a reel never opens a socket, so it is not busy.
test('booting: skeleton rows and aria-busy until the socket opens; a reel is never busy', () => {
  act(() => { useStore.setState({ connecting: true, events: [] }) })
  expect(host.querySelector('section')!.getAttribute('aria-busy')).toBe('true')
  expect(host.querySelectorAll('.skeleton').length).toBe(8); expect(host.textContent).not.toContain('waiting')
  act(() => { useStore.getState().setConnected(true) })
  expect(host.querySelector('section')!.hasAttribute('aria-busy')).toBe(false)
  expect(host.querySelectorAll('.skeleton').length).toBe(0); expect(host.textContent).toContain('waiting for the first event')
  act(() => { useStore.setState({ connecting: true, reel: { name: 'r', title: 'R', file: '/r.jsonl' } as never }) })
  expect(host.querySelectorAll('.skeleton').length).toBe(0)
})

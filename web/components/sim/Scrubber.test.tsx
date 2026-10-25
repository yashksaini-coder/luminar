import { readFileSync } from 'node:fs'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import Scrubber from '@/components/sim/Scrubber'
import { loadReel, playReel, REEL_TICK_MS, reelDurationMs, setReelSpeed, unloadReel } from '@/lib/api/replay'
import { useStore } from '@/lib/store'

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date', 'performance'] })
const reel = readFileSync('public/reels/sybil-eclipse.jsonl', 'utf8')   // vitest runs from web/
let root: Root, host: HTMLDivElement
beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(reel, { status: 200 })))
  useStore.setState(useStore.getInitialState(), true); unloadReel()
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host)
})
afterEach(() => { act(() => root.unmount()); host.remove(); unloadReel() })

const ticks = () => host.querySelectorAll('span[data-kind]').length

test('a reel shows its full tick track at T+0: as many ticks as a complete play-through leaves in the store (T9)', async () => {
  await act(() => loadReel({ name: 'sybil-eclipse', title: 'Sybil → Eclipse', file: '/reels/sybil-eclipse.jsonl' }))
  act(() => root.render(<Scrubber />))
  const atStart = ticks()
  expect(useStore.getState().simTime).toBe(0); expect(atStart).toBeGreaterThan(3); expect(host.querySelectorAll('span[title*="(T+"]').length).toBeGreaterThan(0)   // bands too
  setReelSpeed(1000)
  act(() => { playReel(); vi.advanceTimersByTime(REEL_TICK_MS * Math.ceil(reelDurationMs() / 1000 / REEL_TICK_MS) + REEL_TICK_MS) })
  expect(useStore.getState().playing).toBe(false)
  expect(ticks()).toBe(atStart); expect(useStore.getState().beats).toHaveLength(atStart)   // every scheduled phase folded into the beat it fired
})
test('live (no reel) keeps drawing the store beats as they arrive', () => {
  act(() => root.render(<Scrubber />))
  expect(ticks()).toBe(0)
  act(() => useStore.setState({ maxDuration: 60, beats: [{ label: 'sybil injected', time: 5, kind: 'fault' }] }))
  expect(ticks()).toBe(1)
})

import { test, expect, beforeEach, vi } from 'vitest'
import {
  loadReel, playReel, pauseReel, setReelSpeed, seekReel, seekReelToSimTime, stopReel, unloadReel,
  reelLoaded, reelDurationMs, reelElapsedMs, reelPlaying, parseReelChunk,
} from '@/lib/api/replay'
import { useStore } from '@/lib/store'
import { snapWith } from '@/lib/fixtures'

vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date', 'performance'] })

const meta = { name: 'r', title: 'R', file: '/reels/r.jsonl' }
const lines = [
  { t: 0, frame: { type: 'edges', edges: [['peer-0', 'peer-1']] } },
  { t: 452, frame: snapWith(['peer-0', 'peer-1'], { time: 0 }) },
  { t: 1000, frame: { at: 0.5, event_type: 'ClockTick', category: 'clock' } },
  { t: 2000, frame: snapWith(['peer-0', 'peer-1'], { time: 1.5, state: 'running', speed: 4 }) },
  { t: 2100, frame: { at: 1.6, event_type: 'GossipMessage', category: 'gossip', from_peer: 'peer-0', to_peer: 'peer-1', msg_id: 'msg-1' } },
].map(l => JSON.stringify(l)).join('\n') + '\n'

function streamedResponse(): Response {
  const enc = new TextEncoder()
  const bytes = enc.encode(lines)
  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      for (const part of [lines.slice(0, 70), lines.slice(70, 300), lines.slice(300)]) c.enqueue(enc.encode(part))
      c.close()
    },
  })
  return new Response(stream, { status: 200, headers: { 'content-length': String(bytes.length) } })
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => streamedResponse()))
  useStore.setState(useStore.getInitialState(), true)
  unloadReel()
})

test('parseReelChunk carries a partial line across chunks and skips malformed lines', () => {
  const a = parseReelChunk(lines.slice(0, 70), ''); const b = parseReelChunk(lines.slice(70), a.carry)
  expect(a.frames.length + b.frames.length).toBe(5); expect(b.carry).toBe('')
  expect(parseReelChunk('{"t":1,"frame":{"type":"gap","dropped":1}}\n{bad\n', '').frames).toHaveLength(1)
  expect(parseReelChunk('{"t":1,"fra', '').carry).toBe('{"t":1,"fra')
})
test('loadReel streams, primes on the first snapshot, seeks to it, reports progress, lands paused', async () => {
  const loads: unknown[] = []; const un = useStore.subscribe(s => loads.push(s.reelLoad))
  const ok = await loadReel(meta); un()
  expect(ok).toBe(true); expect(useStore.getState().reel).toEqual({ name: 'r', title: 'R', durationMs: 2100, durationSim: 1.5 })
  expect(useStore.getState().nodes).toHaveLength(2); expect(useStore.getState().edges).toEqual([['peer-0', 'peer-1']]); expect(useStore.getState().simTime).toBe(0)
  expect(useStore.getState().playing).toBe(false); expect(useStore.getState().simSpeed).toBe(1); expect(useStore.getState().reelLoad).toBeNull()
  expect(loads.some(l => l && (l as { loaded: number }).loaded > 0)).toBe(true); expect(reelLoaded()).toBe(true); expect(reelElapsedMs()).toBe(452)
})
test('loadReel returns false on a fetch failure or an empty file and leaves no reel', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 404 }))); expect(await loadReel(meta)).toBe(false)
  vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 200 }))); expect(await loadReel(meta)).toBe(false)
  expect(useStore.getState().reel).toBeNull(); expect(useStore.getState().reelLoad).toBeNull()
})
test('play dispatches by wall clock × speed, ignores recorded state, auto-pauses at the end', async () => {
  await loadReel(meta); setReelSpeed(2); playReel(); expect(reelPlaying()).toBe(true); expect(useStore.getState().playing).toBe(true)
  vi.advanceTimersByTime(1100)
  expect(useStore.getState().simTime).toBe(1.5); expect(useStore.getState().simSpeed).toBe(1); expect(useStore.getState().events.map(e => e.event_type)).toEqual(['ClockTick', 'GossipMessage'])
  expect(reelPlaying()).toBe(false); expect(useStore.getState().playing).toBe(false); expect(reelElapsedMs()).toBe(2100)
  playReel(); expect(reelElapsedMs()).toBe(0)   // from the end → seekReel(0) first
})
test('seek replays state frames in order, skips events, clamps, optional tail; speed floors at 0.1', async () => {
  await loadReel(meta); seekReelToSimTime(1.0); expect(useStore.getState().simTime).toBe(1.5); expect(useStore.getState().events).toHaveLength(0)
  seekReelToSimTime(99); expect(reelElapsedMs()).toBe(2100)
  seekReel(99_999); expect(reelElapsedMs()).toBe(2100); seekReel(-5); expect(reelElapsedMs()).toBe(0)
  seekReel(2100, { eventTailMs: 200 }); expect(useStore.getState().events.map(e => e.msg_id)).toEqual(['msg-1'])
  setReelSpeed(0.01); seekReel(0); playReel(); vi.advanceTimersByTime(50); expect(reelElapsedMs()).toBe(5); pauseReel()
})
test('stopReel keeps frames; unloadReel drops them', async () => {
  await loadReel(meta); playReel(); stopReel(); expect(reelPlaying()).toBe(false); expect(reelElapsedMs()).toBe(0); expect(reelLoaded()).toBe(true)
  unloadReel(); expect(reelLoaded()).toBe(false); expect(reelDurationMs()).toBe(0)
})
test('a file truncated mid-line at EOF loads with the frames before the cut (global review focus 2)', async () => {
  const cut = lines.trimEnd().slice(0, -12)                                   // the last line loses its tail and its newline
  vi.stubGlobal('fetch', vi.fn(async () => new Response(cut, { status: 200 })))
  expect(await loadReel(meta)).toBe(true); expect(useStore.getState().reel?.durationMs).toBe(2000); expect(reelLoaded()).toBe(true)
})

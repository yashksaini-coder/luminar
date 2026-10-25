import { test, expect, beforeEach, vi } from 'vitest'
import { ws, wsUrl } from '@/lib/api/websocket'
import { useStore } from '@/lib/store'

const sockets: FakeWebSocket[] = []

class FakeWebSocket {
  static CONNECTING = 0
  static OPEN = 1
  static CLOSING = 2
  static CLOSED = 3
  readyState = 0
  onopen: (() => void) | null = null
  onmessage: ((e: { data: unknown }) => void) | null = null
  onclose: (() => void) | null = null
  onerror: (() => void) | null = null
  constructor(public url: string) { sockets.push(this) }
  close() { this.readyState = 3; this.onclose?.() }
  open() { this.readyState = 1; this.onopen?.() }
  message(data: unknown) { this.onmessage?.({ data }) }
  closeFromServer() { this.readyState = 3; this.onclose?.() }
}

vi.stubGlobal('WebSocket', FakeWebSocket)
vi.useFakeTimers()

beforeEach(() => {
  ws.disconnect()
  sockets.length = 0
  useStore.setState(useStore.getInitialState(), true)
})

test('wsUrl', () => {
  expect(wsUrl({ protocol: 'http:', host: 'localhost:3000', port: '3000' })).toBe('ws://localhost:8000/ws/events')
  expect(wsUrl({ protocol: 'https:', host: 'luminar.onrender.com', port: '' })).toBe('wss://luminar.onrender.com/ws/events')
  expect(wsUrl({ protocol: 'http:', host: 'localhost:8080', port: '8080' })).toBe('ws://localhost:8080/ws/events')
})
test('reconnect backs off 1s ×2 to 10s and resets on open', () => {
  ws.connect(); expect(sockets).toHaveLength(1); sockets[0].closeFromServer()
  for (const d of [1000, 2000, 4000, 8000, 10000, 10000]) { vi.advanceTimersByTime(d - 1); const n = sockets.length; vi.advanceTimersByTime(1); expect(sockets.length).toBe(n + 1); sockets.at(-1)!.closeFromServer() }
  vi.advanceTimersByTime(10000); sockets.at(-1)!.open(); sockets.at(-1)!.closeFromServer(); vi.advanceTimersByTime(1000); expect(sockets).toHaveLength(9)
})
test('connect twice is a no-op; disconnect cancels a pending reconnect and reports offline', () => {
  ws.connect(); ws.connect(); expect(sockets).toHaveLength(1)
  sockets[0].open(); expect(ws.connected()).toBe(true); ws.connect(); expect(sockets).toHaveLength(1)
  sockets[0].closeFromServer(); ws.disconnect(); vi.advanceTimersByTime(60_000); expect(sockets).toHaveLength(1)
  expect(useStore.getState().connected).toBe(false); expect(ws.connected()).toBe(false)
})
test('StrictMode sequence connect→disconnect→connect leaves one live socket and no reconnect from the first', () => {
  ws.connect(); ws.disconnect(); ws.connect(); expect(sockets).toHaveLength(2); expect(sockets[0].readyState).toBe(3)
  sockets[0].onclose?.(); vi.advanceTimersByTime(60_000); expect(sockets).toHaveLength(2)
  sockets[1].open(); expect(useStore.getState().connected).toBe(true)
})
test('text frames batch for 50 ms; binary frames dispatch at once; superseded socket is ignored; close flushes', async () => {
  ws.connect(); sockets[0].open(); expect(useStore.getState().connected).toBe(true)
  sockets[0].message(JSON.stringify({ at: 1, event_type: 'ClockTick', category: 'clock' })); expect(useStore.getState().events).toHaveLength(0)
  vi.advanceTimersByTime(50); expect(useStore.getState().events).toHaveLength(1)
  sockets[0].message(new TextEncoder().encode(JSON.stringify({ type: 'gap', dropped: 4 })).buffer); expect(useStore.getState().droppedEvents).toBe(4)
  sockets[0].message(new Blob([JSON.stringify({ type: 'gap', dropped: 1 })])); await vi.waitFor(() => expect(useStore.getState().droppedEvents).toBe(5))
  sockets[0].message('not json'); expect(useStore.getState().events).toHaveLength(1)
  sockets[0].message(JSON.stringify({ at: 2, event_type: 'ClockTick', category: 'clock' })); sockets[0].closeFromServer(); expect(useStore.getState().events).toHaveLength(2)   // close flushes
  vi.advanceTimersByTime(1000); expect(sockets).toHaveLength(2)
  sockets[1].message(JSON.stringify({ type: 'gap', dropped: 9 })); expect(useStore.getState().droppedEvents).toBe(14)     // current socket: handlers live from construction
  sockets[0].message(JSON.stringify({ type: 'gap', dropped: 100 })); expect(useStore.getState().droppedEvents).toBe(14)   // superseded socket: ignored
})

/** The live /ws/events socket: one socket at a time, 50 ms event batching, reconnect backoff 1 s doubling to 10 s. */

import { API_BASE } from '@/lib/api/client'
import { dispatchFrame, flushEvents } from '@/lib/api/dispatch'
import { useStore } from '@/lib/store'
import type { WsFrame } from '@/lib/types'

export const BATCH_MS = 50
export const RECONNECT_MIN_MS = 1000
export const RECONNECT_MAX_MS = 10_000

export function wsUrl(loc: Pick<Location, 'protocol' | 'host' | 'port'> = location): string {
  if (API_BASE) return API_BASE.replace(/^http/, 'ws') + '/ws/events'
  if (loc.port === '3000') return (process.env.NEXT_PUBLIC_WS_URL ?? 'ws://localhost:8000') + '/ws/events'
  return `${loc.protocol === 'https:' ? 'wss:' : 'ws:'}//${loc.host}/ws/events`
}

function parse(text: string): void {
  let frame: WsFrame
  try { frame = JSON.parse(text) } catch { return }   // malformed frames are dropped
  dispatchFrame(frame)
}

class WSManager {
  private socket: WebSocket | null = null
  private batchTimer: ReturnType<typeof setInterval> | null = null
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private reconnectDelay = RECONNECT_MIN_MS
  private closed = false

  connect(): void {
    this.closed = false
    this.open()
  }

  disconnect(): void {
    this.closed = true
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null }
    this.stopBatchTimer()
    flushEvents()
    if (this.socket) { this.socket.close(); this.socket = null }
    useStore.getState().setConnected(false)
  }

  connected(): boolean {
    return this.socket?.readyState === WebSocket.OPEN
  }

  private stopBatchTimer(): void {
    if (this.batchTimer) { clearInterval(this.batchTimer); this.batchTimer = null }
  }

  private open(): void {
    // Single-socket invariant: no-op while a socket is connecting or open;
    // handlers of a superseded socket must not touch shared timers or status.
    if (this.socket && this.socket.readyState <= WebSocket.OPEN) return
    const sock = new WebSocket(wsUrl())
    this.socket = sock

    sock.onopen = () => {
      if (sock !== this.socket) return
      this.reconnectDelay = RECONNECT_MIN_MS
      useStore.getState().setConnected(true)
      this.batchTimer = setInterval(flushEvents, BATCH_MS)
    }

    sock.onmessage = (e: MessageEvent) => {
      if (sock !== this.socket) return
      if (typeof e.data === 'string') parse(e.data)
      else if (e.data instanceof Blob) e.data.text().then(parse, () => {})
      else parse(new TextDecoder().decode(e.data))   // ArrayBuffer; no instanceof, it fails across realms (jsdom)
    }

    sock.onclose = () => {
      if (sock !== this.socket) return
      useStore.getState().setConnected(false)
      this.stopBatchTimer()
      flushEvents()
      if (!this.closed) this.scheduleReconnect()
    }

    sock.onerror = () => { /* onclose follows onerror */ }
  }

  private scheduleReconnect(): void {
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.open()
    }, this.reconnectDelay)
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, RECONNECT_MAX_MS)
  }
}

export const ws = new WSManager()

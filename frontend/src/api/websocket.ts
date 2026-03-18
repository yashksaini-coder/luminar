import type { AppEvent } from '../types'

export type EventCallback = (events: AppEvent[]) => void
export type StatusCallback = (connected: boolean) => void
export type SnapshotCallback = (snap: any) => void
export type MetricsCallback = (metrics: any) => void
export type AnalyticsCallback = (analytics: any) => void

const BATCH_MS = 50
const MAX_RECONNECT = 10_000

class WSManager {
  private socket: WebSocket | null = null
  private batch: AppEvent[] = []
  private timer: ReturnType<typeof setInterval> | null = null
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private reconnectDelay = 1000
  private onBatch: EventCallback | null = null
  private onStatus: StatusCallback | null = null
  private onSnapshot: SnapshotCallback | null = null
  private onMetrics: MetricsCallback | null = null
  private onAnalytics: AnalyticsCallback | null = null
  private closed = false

  connect(
    onBatch: EventCallback,
    onStatus: StatusCallback,
    onSnapshot?: SnapshotCallback,
    onMetrics?: MetricsCallback,
    onAnalytics?: AnalyticsCallback,
  ) {
    this.onBatch = onBatch
    this.onStatus = onStatus
    this.onSnapshot = onSnapshot ?? null
    this.onMetrics = onMetrics ?? null
    this.onAnalytics = onAnalytics ?? null
    this.closed = false
    this.open()
  }

  disconnect() {
    this.closed = true
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null }
    if (this.timer) { clearInterval(this.timer); this.timer = null }
    this.flush()
    if (this.socket) { this.socket.close(); this.socket = null }
    this.onStatus?.(false)
  }

  private open() {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:'
    this.socket = new WebSocket(`${proto}//${location.host}/ws/events`)

    this.socket.onopen = () => {
      this.reconnectDelay = 1000
      this.onStatus?.(true)
      this.timer = setInterval(() => this.flush(), BATCH_MS)
    }

    this.socket.onmessage = (e: MessageEvent) => {
      if (typeof e.data === 'string') {
        // Text frame — regular event
        this.parseMessage(e.data)
      } else if (e.data instanceof Blob) {
        // Binary frame (Blob) — snapshot/metrics/analytics from orjson
        e.data.text().then(text => this.parseMessage(text)).catch(() => {})
      } else if (e.data instanceof ArrayBuffer) {
        // Binary frame (ArrayBuffer) — fallback
        this.parseMessage(new TextDecoder().decode(e.data))
      }
    }

    this.socket.onclose = () => {
      this.onStatus?.(false)
      if (this.timer) { clearInterval(this.timer); this.timer = null }
      this.flush()
      if (!this.closed) this.scheduleReconnect()
    }

    this.socket.onerror = () => { /* onclose fires after onerror */ }
  }

  private parseMessage(text: string) {
    try {
      const msg = JSON.parse(text)
      if (msg.type === 'snapshot') {
        this.onSnapshot?.(msg)
      } else if (msg.type === 'metrics') {
        this.onMetrics?.(msg)
      } else if (msg.type === 'analytics') {
        this.onAnalytics?.(msg)
      } else {
        this.batch.push(msg as AppEvent)
      }
    } catch { /* ignore malformed */ }
  }

  private flush() {
    if (this.batch.length === 0) return
    const b = this.batch
    this.batch = []
    this.onBatch?.(b)
  }

  private scheduleReconnect() {
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.open()
    }, this.reconnectDelay)
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, MAX_RECONNECT)
  }
}

export const ws = new WSManager()

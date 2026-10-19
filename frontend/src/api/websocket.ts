import type { AppEvent } from '../types'

export type EventCallback = (events: AppEvent[]) => void
export type StatusCallback = (connected: boolean) => void
export type SnapshotCallback = (snap: any) => void
export type MetricsCallback = (metrics: any) => void
export type AnalyticsCallback = (analytics: any) => void
export type TelemetryStatusCallback = (status: any) => void
export type FrameCallback = (frame: any) => void

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
  private onTelemetryStatus: TelemetryStatusCallback | null = null
  private closed = false
  /** Frames that are not events and not periodic: edges, scenario, gap */
  onFrame: Record<string, FrameCallback> = {}

  /** Register frame handlers. Needed by both the live socket and the offline reel player. */
  bind(
    onBatch: EventCallback,
    onStatus: StatusCallback,
    onSnapshot?: SnapshotCallback,
    onMetrics?: MetricsCallback,
    onAnalytics?: AnalyticsCallback,
    onTelemetryStatus?: TelemetryStatusCallback,
  ) {
    this.onBatch = onBatch
    this.onStatus = onStatus
    this.onSnapshot = onSnapshot ?? null
    this.onMetrics = onMetrics ?? null
    this.onAnalytics = onAnalytics ?? null
    this.onTelemetryStatus = onTelemetryStatus ?? null
  }

  /** Open the live socket using the handlers from bind(). */
  connect() {
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
    const apiUrl: string = import.meta.env.VITE_API_URL ?? ''
    const wsUrl = apiUrl
      ? apiUrl.replace(/^https/, 'wss').replace(/^http/, 'ws') + '/ws/events'
      : `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/ws/events`
    // Single-socket invariant: connect() while a socket is connecting/open is a no-op,
    // and handlers of a superseded socket must not touch shared timer/status/reconnect.
    if (this.socket && this.socket.readyState <= WebSocket.OPEN) return
    const sock = new WebSocket(wsUrl)
    this.socket = sock

    sock.onopen = () => {
      if (sock !== this.socket) return
      this.reconnectDelay = 1000
      this.onStatus?.(true)
      this.timer = setInterval(() => this.flush(), BATCH_MS)
    }

    sock.onmessage = (e: MessageEvent) => {
      if (sock !== this.socket) return
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

    sock.onclose = () => {
      if (sock !== this.socket) return
      this.onStatus?.(false)
      if (this.timer) { clearInterval(this.timer); this.timer = null }
      this.flush()
      if (!this.closed) this.scheduleReconnect()
    }

    sock.onerror = () => { /* onclose fires after onerror */ }
  }

  private parseMessage(text: string) {
    try {
      this.dispatch(JSON.parse(text))
    } catch { /* ignore malformed */ }
  }

  /** Route one decoded frame. Public so the reel player can feed recorded frames. */
  dispatch(msg: any) {
    if (msg.type === 'snapshot') {
      this.onSnapshot?.(msg)
    } else if (msg.type === 'metrics') {
      this.onMetrics?.(msg)
    } else if (msg.type === 'analytics') {
      this.onAnalytics?.(msg)
    } else if (msg.type === 'telemetry_status') {
      this.onTelemetryStatus?.(msg)
    } else if (msg.type && this.onFrame[msg.type]) {
      this.onFrame[msg.type](msg)
    } else if (!msg.type) {
      this.batch.push(msg as AppEvent)
    }
  }

  flush() {
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

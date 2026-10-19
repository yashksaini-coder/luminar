/**
 * Telemetry Panel — slide-in drawer showing live real peer data.
 *
 * Opened by clicking the #telemetry-badge in the toolbar.
 * Updated on every `telemetry_status` WS push (every 2s).
 */

let panelEl: HTMLElement | null = null
let peerListEl: HTMLElement | null = null
let feedEl: HTMLElement | null = null
let summaryEl: HTMLElement | null = null
let isOpen = false

export function initTelemetryPanel() {
  panelEl = document.getElementById('telemetry-panel')
  peerListEl = document.getElementById('tp-peer-list')
  feedEl = document.getElementById('tp-feed')
  summaryEl = document.getElementById('tp-summary')

  document.getElementById('tp-close')?.addEventListener('click', closeTelemetryPanel)
}

export function openTelemetryPanel() {
  isOpen = true
  panelEl?.classList.add('open')
}

export function closeTelemetryPanel() {
  isOpen = false
  panelEl?.classList.remove('open')
}

export function toggleTelemetryPanel() {
  if (isOpen) closeTelemetryPanel()
  else openTelemetryPanel()
}

/** Called on every telemetry_status WS message */
export function updateTelemetryPanel(status: {
  active: boolean
  peer_count: number
  peers: {
    peer_id: string
    node_name: string
    network: string
    last_seen: number
    age_seconds: number
    cpu: number
    best_block: number
  }[]
}) {
  if (!isOpen) return

  // ── Summary line ──
  if (summaryEl) {
    while (summaryEl.firstChild) summaryEl.removeChild(summaryEl.firstChild)
    if (status.active) {
      const b = document.createElement('b')
      b.textContent = `${status.peer_count} live peer${status.peer_count !== 1 ? 's' : ''}`
      summaryEl.append(b, ' reporting · ring on map breathes per check-in')
    } else {
      summaryEl.textContent = 'No peers connected — waiting for reports…'
    }
  }

  // ── Peer list (full rebuild — list is small, < 100 peers) ──
  if (peerListEl) {
    while (peerListEl.firstChild) peerListEl.removeChild(peerListEl.firstChild)
    for (const p of status.peers) {
      peerListEl.appendChild(buildPeerRow(p))
    }
    if (status.peers.length === 0) {
      const empty = document.createElement('div')
      empty.className = 'tp-empty'
      empty.textContent = 'Submit a payload to appear here'
      peerListEl.appendChild(empty)
    }
  }

  // ── Live feed: one row per status tick when active ──
  if (feedEl && status.active) {
    const now = Date.now()
    for (const p of status.peers) {
      appendFeedRow(p, now)
    }
    // Trim feed
    while (feedEl.children.length > 200) feedEl.removeChild(feedEl.firstChild!)
    requestAnimationFrame(() => { feedEl!.scrollTop = feedEl!.scrollHeight })
  }
}

function buildPeerRow(p: {
  peer_id: string
  node_name: string
  network: string
  age_seconds: number
  cpu: number
  best_block: number
}): HTMLElement {
  const row = document.createElement('div')
  row.className = 'tp-peer-row'

  // Name + network badge
  const header = document.createElement('div')
  header.className = 'tp-peer-header'

  const name = document.createElement('span')
  name.className = 'tp-peer-name'
  name.textContent = p.node_name || shortenId(p.peer_id)
  name.title = p.peer_id

  const net = document.createElement('span')
  net.className = 'tp-peer-net'
  net.textContent = p.network

  header.appendChild(name)
  header.appendChild(net)

  // Metrics row: cpu bar + block + age
  const meta = document.createElement('div')
  meta.className = 'tp-peer-meta'

  // CPU bar
  const cpuWrap = document.createElement('div')
  cpuWrap.className = 'tp-cpu-wrap'
  const cpuBar = document.createElement('div')
  cpuBar.className = 'tp-cpu-bar'
  cpuBar.style.width = Math.min(100, p.cpu) + '%'
  cpuWrap.appendChild(cpuBar)

  const cpuLabel = document.createElement('span')
  cpuLabel.className = 'tp-cpu-label'
  cpuLabel.textContent = p.cpu.toFixed(0) + '%'

  const block = document.createElement('span')
  block.className = 'tp-block'
  block.textContent = `#${p.best_block.toLocaleString()}`

  const age = document.createElement('span')
  age.className = 'tp-age'
  age.textContent = p.age_seconds < 60 ? `${Math.floor(p.age_seconds)}s` : `${Math.floor(p.age_seconds / 60)}m`
  age.toggleAttribute('data-stale', p.age_seconds > 30)

  meta.appendChild(cpuWrap)
  meta.appendChild(cpuLabel)
  meta.appendChild(block)
  meta.appendChild(age)

  row.appendChild(header)
  row.appendChild(meta)
  return row
}

function appendFeedRow(p: { peer_id: string; node_name: string; cpu: number; best_block: number }, now: number) {
  if (!feedEl) return
  const row = document.createElement('div')
  row.className = 'tp-feed-row'

  const ts = document.createElement('span')
  ts.className = 'tp-feed-ts'
  ts.textContent = new Date(now).toTimeString().slice(0, 8)

  const id = document.createElement('span')
  id.className = 'tp-feed-id'
  id.textContent = p.node_name || shortenId(p.peer_id)

  const detail = document.createElement('span')
  detail.className = 'tp-feed-detail'
  // Mock shows "score 0.97"; the status payload carries no score, so cpu is the nearest real field
  detail.textContent = `cpu ${p.cpu.toFixed(0)}%`

  row.appendChild(ts)
  row.appendChild(id)
  row.appendChild(detail)
  feedEl.appendChild(row)
}

function shortenId(id: string): string {
  if (id.length <= 16) return id
  return id.slice(0, 8) + '…' + id.slice(-4)
}


import { store } from '../store'
import { STATE_CSS } from '../palette'
import type { AppEvent } from '../types'

const TYPE_CODES: Record<string, { code: string; color: string }> = {
  GossipMessage:         { code: 'gm', color: 'oklch(0.75 0.14 155)' },
  GossipGraft:           { code: 'gf', color: 'oklch(0.72 0.12 230)' },
  GossipPrune:           { code: 'gp', color: 'oklch(0.72 0.14 60)' },
  GossipIHave:           { code: 'ih', color: 'oklch(0.72 0.12 230)' },
  GossipIWant:           { code: 'iw', color: 'oklch(0.72 0.12 230)' },
  PeerConnected:         { code: 'cn', color: 'oklch(0.70 0.08 250)' },
  PeerDisconnected:      { code: 'dc', color: 'oklch(0.65 0.20 25)' },
  StreamOpened:          { code: 'so', color: 'oklch(0.72 0.12 230)' },
  StreamClosed:          { code: 'sc', color: 'var(--text3)' },
  StreamTimeout:         { code: 'st', color: 'oklch(0.65 0.20 25)' },
  DHTQueryStarted:       { code: 'ds', color: 'oklch(0.65 0.10 280)' },
  DHTQueryCompleted:     { code: 'dd', color: 'oklch(0.65 0.10 280)' },
  DHTQueryFailed:        { code: 'df', color: 'oklch(0.65 0.20 25)' },
  FaultInjected:         { code: 'fi', color: 'oklch(0.65 0.20 25)' },
  FaultCleared:          { code: 'fc', color: 'oklch(0.75 0.14 155)' },
  NodeHealthSnapshot:    { code: 'hs', color: 'oklch(0.72 0.14 60)' },
}

const SCORE_HISTORY_MAX = 50
const scoreHistory: number[] = []

let drawerEl: HTMLElement | null = null
let evListEl: HTMLElement | null = null
let sparkCanvas: HTMLCanvasElement | null = null
let currentPeerId: string | null = null

function isPeerEvent(e: AppEvent, peerId: string): boolean {
  return e.peer_id === peerId || e.from_peer === peerId || e.to_peer === peerId
}

export function initPeerInspector() {
  drawerEl = document.getElementById('peer-inspector')
  evListEl = document.getElementById('pi-events')
  sparkCanvas = document.getElementById('pi-score-spark') as HTMLCanvasElement

  document.getElementById('pi-close')?.addEventListener('click', () => {
    store.selectedNode = -1
    store.highlightPeers = []
    closeDrawer()
    document.dispatchEvent(new CustomEvent('luminar:render'))
  })

  // Opened by luminar:nodeselect (dispatched from renderer onClick)
  document.addEventListener('luminar:nodeselect', () => {
    const idx = store.selectedNode
    if (idx < 0) { closeDrawer(); return }
    const node = store.nodes[idx]
    if (!node) { closeDrawer(); return }

    // New peer selected — reset event list and score history
    if (node.peer_id !== currentPeerId) {
      currentPeerId = node.peer_id
      scoreHistory.length = 0
      clearEventList()
      // Seed with buffered events already in store
      const past = store.events.filter(e => isPeerEvent(e, currentPeerId!)).slice(-100)
      renderEventRows(past)
    }

    openDrawer()
    refreshStats()
  })
}

function openDrawer() {
  drawerEl?.classList.add('open')
}

function closeDrawer() {
  currentPeerId = null
  scoreHistory.length = 0
  clearEventList()
  drawerEl?.classList.remove('open')
}

function clearEventList() {
  if (!evListEl) return
  while (evListEl.firstChild) evListEl.removeChild(evListEl.firstChild)
}

function refreshStats() {
  const idx = store.selectedNode
  if (idx < 0) return
  const node = store.nodes[idx]
  if (!node) return

  const nameEl = document.getElementById('pi-name')
  if (nameEl) nameEl.textContent = `n${node.index}`

  const idEl = document.getElementById('pi-peer-id')
  if (idEl) idEl.textContent = node.peer_id

  const stateEl = document.getElementById('pi-state')
  if (stateEl) {
    stateEl.textContent = node.state
    stateEl.style.color = STATE_CSS[node.state] ?? 'var(--text3)'
  }

  const scoreEl = document.getElementById('pi-score')
  if (scoreEl) {
    scoreEl.textContent = node.gossip_score.toFixed(3)
    scoreEl.style.color = node.gossip_score > 0 ? 'oklch(0.75 0.14 155)'
      : node.gossip_score < 0 ? 'oklch(0.65 0.20 25)' : 'var(--text3)'
  }

  const sentEl = document.getElementById('pi-sent')
  if (sentEl) sentEl.textContent = `↑${node.messages_sent}`

  const recvEl = document.getElementById('pi-recv')
  if (recvEl) recvEl.textContent = `↓${node.messages_received}`

  const countEl = document.getElementById('pi-peer-count')
  if (countEl) countEl.textContent = `${node.connected_peers.length} peers`

  // Connected peer chips
  const peersEl = document.getElementById('pi-peers')
  if (peersEl) {
    while (peersEl.firstChild) peersEl.removeChild(peersEl.firstChild)
    for (const peerId of node.connected_peers) {
      const chip = document.createElement('span')
      chip.className = 'pi-peer-chip'
      chip.textContent = '#' + peerId.replace('peer-', '')
      chip.title = peerId
      chip.addEventListener('click', () => {
        const i = store.nodeIndex.get(peerId)
        if (i !== undefined) {
          store.selectedNode = i
          // TODO(human): after selecting the new node, also pan the map camera to it
          document.dispatchEvent(new CustomEvent('luminar:nodeselect'))
          document.dispatchEvent(new CustomEvent('luminar:render'))
        }
      })
      peersEl.appendChild(chip)
    }
  }

  drawScoreSparkline()
}

function drawScoreSparkline() {
  if (!sparkCanvas || scoreHistory.length < 2) return
  const dpr = window.devicePixelRatio || 1
  const w = (sparkCanvas.parentElement?.clientWidth ?? 220) - 16
  const h = 38
  sparkCanvas.width = w * dpr
  sparkCanvas.height = h * dpr
  sparkCanvas.style.width = w + 'px'
  sparkCanvas.style.height = h + 'px'

  const ctx = sparkCanvas.getContext('2d')!
  ctx.scale(dpr, dpr)
  ctx.clearRect(0, 0, w, h)

  const min = Math.min(...scoreHistory, -0.5)
  const max = Math.max(...scoreHistory, 0.5)
  const range = max - min

  // Zero line
  const zeroY = h - ((0 - min) / range) * h
  ctx.beginPath()
  ctx.strokeStyle = 'rgba(255,255,255,0.07)'
  ctx.lineWidth = 1
  ctx.moveTo(0, zeroY)
  ctx.lineTo(w, zeroY)
  ctx.stroke()

  // Score line
  ctx.beginPath()
  ctx.lineWidth = 1.5
  ctx.lineJoin = 'round'
  for (let i = 0; i < scoreHistory.length; i++) {
    const x = (i / (scoreHistory.length - 1)) * w
    const y = h - ((scoreHistory[i] - min) / range) * h
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  const last = scoreHistory[scoreHistory.length - 1]
  ctx.strokeStyle = last > 0 ? 'oklch(0.75 0.14 155)'
    : last < 0 ? 'oklch(0.65 0.20 25)' : 'oklch(0.70 0.05 250)'
  ctx.stroke()
}

function renderEventRows(events: AppEvent[]) {
  if (!evListEl || !currentPeerId) return
  for (const evt of events) {
    const row = document.createElement('div')
    row.className = 'pi-ev-row'

    const ts = document.createElement('span')
    ts.className = 'pi-ev-ts'
    ts.textContent = (evt.at * 1000).toFixed(0) + 'ms'

    const typeInfo = TYPE_CODES[evt.event_type] ?? { code: '??', color: 'var(--text3)' }
    const type = document.createElement('span')
    type.className = 'pi-ev-type'
    type.textContent = typeInfo.code
    type.style.color = typeInfo.color

    const dir = document.createElement('span')
    dir.className = 'pi-ev-dir'
    dir.textContent = evt.from_peer === currentPeerId ? '↑'
      : evt.to_peer === currentPeerId ? '↓' : '·'

    const peer = document.createElement('span')
    peer.className = 'pi-ev-peer'
    const other = evt.from_peer === currentPeerId ? evt.to_peer : evt.from_peer
    peer.textContent = other ? '#' + other.replace('peer-', '') : ''

    row.appendChild(ts)
    row.appendChild(type)
    row.appendChild(dir)
    row.appendChild(peer)
    evListEl.appendChild(row)
  }

  // Trim to 200 visible entries
  while (evListEl.children.length > 200) evListEl.removeChild(evListEl.firstChild!)
  requestAnimationFrame(() => { evListEl!.scrollTop = evListEl!.scrollHeight })
}

/** Called from app.ts on every WS snapshot push */
export function refreshPeerInspector() {
  const idx = store.selectedNode
  if (idx < 0 || !drawerEl?.classList.contains('open')) return

  const node = store.nodes[idx]
  if (!node) return

  scoreHistory.push(node.gossip_score)
  if (scoreHistory.length > SCORE_HISTORY_MAX) scoreHistory.shift()

  refreshStats()
}

/** Called from app.ts on every WS event batch */
export function appendPeerInspectorEvents(events: AppEvent[]) {
  if (!currentPeerId || !drawerEl?.classList.contains('open')) return
  const relevant = events.filter(e => isPeerEvent(e, currentPeerId!))
  if (relevant.length === 0) return
  renderEventRows(relevant)
}

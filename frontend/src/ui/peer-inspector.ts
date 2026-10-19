import { store } from '../store'
import { shortName } from '../format'
import { cssVar, setupCanvas } from '../charts/sparkline'
import { TYPE_CODES, DEFAULT_TYPE, shortId } from './events-panel'
import type { AppEvent, PeerNode } from '../types'

const SCORE_HISTORY_MAX = 50
const SPARK_W = 268, SPARK_H = 56
const scoreHistory: { t: number; v: number }[] = []

let drawerEl: HTMLElement | null = null
let evListEl: HTMLElement | null = null
let sparkCanvas: HTMLCanvasElement | null = null
let axisEls: HTMLElement[] = []
let noteEl: HTMLElement | null = null
let currentPeerId: string | null = null

const isPeerEvent = (e: AppEvent, peerId: string) =>
  e.peer_id === peerId || e.from_peer === peerId || e.to_peer === peerId
/** Attacker pruned from every honest mesh: hollow dot, PRUNED badge, victims instead of peers. */
const isPruned = (n: PeerNode) => n.state === 'attacker' && n.connected_peers.length === 0

function span(cls: string, text = ''): HTMLSpanElement {
  const s = document.createElement('span')
  s.className = cls
  s.textContent = text
  return s
}

export function initPeerInspector() {
  drawerEl = document.getElementById('peer-inspector')
  evListEl = document.getElementById('pi-events')
  sparkCanvas = document.getElementById('pi-score-spark') as HTMLCanvasElement

  // Pieces the static markup does not carry: spark axis, section meta, pruned note
  const meta = drawerEl?.querySelector('.lm-sec-meta')
  // Mock labels the dominant P-component ("P4 invalid msgs"); the snapshot has no per-component score
  if (meta) meta.textContent = 'last 50 ticks'
  if (sparkCanvas?.parentElement) {
    const axis = document.createElement('div')
    axis.className = 'lm-axis'
    axisEls = [span(''), span('', '0 ─ ─'), span('')]
    axis.append(...axisEls)
    sparkCanvas.parentElement.appendChild(axis)
  }
  const peersEl = document.getElementById('pi-peers')
  if (peersEl?.parentElement) {
    noteEl = span('lm-pi-note', 'pruned from every honest mesh')
    noteEl.hidden = true
    peersEl.parentElement.appendChild(noteEl)
  }

  document.getElementById('pi-close')?.addEventListener('click', () => {
    store.selectedNode = -1
    store.highlightPeers = []
    closeDrawer()
    document.dispatchEvent(new CustomEvent('luminar:render'))
  })

  // Opened by luminar:nodeselect (dispatched from renderer onClick)
  document.addEventListener('luminar:nodeselect', () => {
    const node = store.nodes[store.selectedNode]
    if (!node) { closeDrawer(); return }
    if (node.peer_id !== currentPeerId) {
      currentPeerId = node.peer_id
      scoreHistory.length = 0
      clearEventList()
      renderEventRows(store.events.filter(e => isPeerEvent(e, currentPeerId!)).slice(-100))
    }
    drawerEl?.classList.add('open')
    refreshStats()
  })

  // Every deselect path (Escape, Reset, event-row toggle-off) ends in luminar:render
  document.addEventListener('luminar:render', () => {
    if (store.selectedNode < 0 && drawerEl?.classList.contains('open')) closeDrawer()
  })
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

function setText(id: string, text: string) {
  const el = document.getElementById(id)
  if (el) el.textContent = text
}

function peerChip(peerId: string, pruned: boolean): HTMLElement {
  const chip = span(pruned ? 'pi-peer-chip lm-pruned' : 'pi-peer-chip', shortId(peerId))
  chip.title = peerId
  if (!pruned) chip.addEventListener('click', () => {
    const i = store.nodeIndex.get(peerId)
    if (i === undefined) return
    store.selectedNode = i
    store.highlightPeers = []
    document.dispatchEvent(new CustomEvent('luminar:nodeselect'))
    document.dispatchEvent(new CustomEvent('luminar:render'))
  })
  return chip
}

function refreshStats() {
  const node = store.nodes[store.selectedNode]
  if (!node) return
  const pruned = isPruned(node)

  setText('pi-name', shortName(node))
  setText('pi-peer-id', node.peer_id)
  setText('pi-state', pruned ? 'pruned' : node.state)
  const dot = drawerEl?.querySelector<HTMLElement>('.lm-pi-dot')
  if (dot) {
    dot.style.background = pruned ? '' : `var(--lm-node-${node.state})`
    dot.toggleAttribute('data-pruned', pruned)
  }
  const badge = drawerEl?.querySelector<HTMLElement>('.lm-badge-attacker')
  if (badge) badge.hidden = node.state !== 'attacker'

  setText('pi-sent', String(node.messages_sent))
  setText('pi-recv', String(node.messages_received))
  setText('pi-peer-count', String(node.connected_peers.length))
  const scoreEl = document.getElementById('pi-score')
  if (scoreEl) {
    const v = node.gossip_score
    scoreEl.textContent = (v < 0 ? '−' : '') + Math.abs(v).toFixed(2)
    scoreEl.toggleAttribute('data-neg', v < 0)
    scoreEl.toggleAttribute('data-zero', v === 0)
  }

  const peersEl = document.getElementById('pi-peers')
  if (peersEl) {
    const title = peersEl.previousElementSibling
    if (title) title.textContent = `Connected peers · ${node.connected_peers.length}`
    while (peersEl.firstChild) peersEl.removeChild(peersEl.firstChild)
    // A pruned attacker lists the honest peers that pruned it (GossipPrune to_peer = this node)
    const ids = pruned
      ? [...new Set(store.events
          .filter(e => e.event_type === 'GossipPrune' && e.to_peer === node.peer_id && e.from_peer)
          .map(e => e.from_peer!))]
      : node.connected_peers
    for (const id of ids) peersEl.appendChild(peerChip(id, pruned))
  }
  if (noteEl) noteEl.hidden = !pruned

  drawScoreSparkline()
}

function drawScoreSparkline() {
  if (!sparkCanvas || scoreHistory.length < 2) return
  const ctx = setupCanvas(sparkCanvas, SPARK_W, SPARK_H)
  if (!ctx) return
  const vs = scoreHistory.map(p => p.v)
  const min = Math.min(...vs, -0.5)
  const max = Math.max(...vs, 0.5)
  // 1px inset so a flat line at the extreme (a pruned attacker's -20) is not half-clipped
  const y = (v: number) => 1 + (SPARK_H - 2) * (1 - (v - min) / (max - min))

  const zeroY = Math.round(y(0)) + 0.5
  ctx.setLineDash([2, 2])
  ctx.strokeStyle = cssVar('--lm-border-strong')
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(0, zeroY)
  ctx.lineTo(SPARK_W, zeroY)
  ctx.stroke()
  ctx.setLineDash([])

  const last = scoreHistory[scoreHistory.length - 1]
  ctx.strokeStyle = cssVar(last.v < 0 ? '--lm-danger' : '--lm-fg')
  ctx.lineWidth = 1.5
  ctx.lineJoin = 'round'
  ctx.beginPath()
  scoreHistory.forEach((p, i) => {
    const x = (i / (scoreHistory.length - 1)) * SPARK_W
    if (i === 0) ctx.moveTo(x, y(p.v))
    else ctx.lineTo(x, y(p.v))
  })
  ctx.stroke()

  if (axisEls.length === 3) {
    axisEls[0].textContent = `T+${scoreHistory[0].t.toFixed(1)}`
    axisEls[2].textContent = `T+${last.t.toFixed(1)}`
  }
}

/** Row detail: what happened, next to who it happened with. */
function rowDetail(evt: AppEvent): string {
  if (evt.event_type === 'GossipPrune') return evt.reason ?? ''
  if (evt.event_type === 'GossipIHave' || evt.event_type === 'GossipIWant') return `${(evt.msg_ids as string[] | undefined)?.length ?? 0} ids`
  if (evt.event_type === 'GossipMessage') return evt.msg_id?.startsWith('spam-') ? 'spam' : (evt.msg_id ?? '')
  return ''
}

function renderEventRows(events: AppEvent[]) {
  if (!evListEl || !currentPeerId) return
  for (const evt of events) {
    const row = document.createElement('div')
    row.className = 'pi-ev-row'
    const typeInfo = TYPE_CODES[evt.event_type] ?? DEFAULT_TYPE
    const type = span('pi-ev-type', typeInfo.code)
    type.style.color = typeInfo.color
    const dir = evt.from_peer === currentPeerId ? '↑' : evt.to_peer === currentPeerId ? '↓' : '·'
    const other = evt.from_peer === currentPeerId ? evt.to_peer : evt.from_peer
    const peer = [other ? shortId(other) : '', rowDetail(evt)].filter(Boolean).join(' · ')
    row.append(span('pi-ev-ts', evt.at.toFixed(2)), type, span('pi-ev-dir', dir), span('pi-ev-peer', peer))
    evListEl.appendChild(row)
  }
  while (evListEl.children.length > 200) evListEl.removeChild(evListEl.firstChild!)
  requestAnimationFrame(() => { evListEl!.scrollTop = evListEl!.scrollHeight })
}

/** Called from app.ts on every WS snapshot push */
export function refreshPeerInspector() {
  if (store.selectedNode < 0 || !drawerEl?.classList.contains('open')) return
  const node = store.nodes[store.selectedNode]
  if (!node) return
  scoreHistory.push({ t: store.simTime, v: node.gossip_score })
  if (scoreHistory.length > SCORE_HISTORY_MAX) scoreHistory.shift()
  refreshStats()
}

/** Called from app.ts on every WS event batch */
export function appendPeerInspectorEvents(events: AppEvent[]) {
  if (!currentPeerId || !drawerEl?.classList.contains('open')) return
  const relevant = events.filter(e => isPeerEvent(e, currentPeerId!))
  if (relevant.length) renderEventRows(relevant)
}

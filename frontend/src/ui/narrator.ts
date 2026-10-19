// Phase narrator — turns scenario phases and derived beats into things an audience can read:
// timeline wash bands, a caption card over the map, and the Hero ticker strip.
// Identical live and in reels because both feed the same handlers.
import { store } from '../store'
import type { AppEvent } from '../types'
import { formatTime } from '../format'

const ACTION_COLOR: Record<string, string> = {
  inject_sybil: 'oklch(0.62 0.24 15 / 0.35)',
  inject_eclipse: 'oklch(0.72 0.14 300 / 0.35)',
  inject_partition: 'oklch(0.72 0.14 60 / 0.35)',
  inject_drop: 'oklch(0.65 0.22 25 / 0.35)',
  inject_latency: 'oklch(0.75 0.14 85 / 0.35)',
}
const CAPTION_MS = 4000

let captionEl: HTMLElement
let captionTimer: ReturnType<typeof setTimeout> | null = null
let tickerEl: HTMLElement
let markersEl: HTMLElement
let phaseLabel = ''
let firstSybilPrunedAt: number | null = null
let healStartAt: number | null = null
let healedAnnounced = false
let invalidMsgs = 0

export function initNarrator() {
  captionEl = document.getElementById('caption')!
  tickerEl = document.getElementById('ticker')!
  markersEl = document.getElementById('tl-markers')!
}

export function resetNarrator() {
  phaseLabel = ''
  firstSybilPrunedAt = null
  healStartAt = null
  healedAnnounced = false
  invalidMsgs = 0
  store.beats = []
  while (markersEl.firstChild) markersEl.removeChild(markersEl.firstChild)
  renderTicker()
}

export function caption(text: string) {
  captionEl.textContent = text
  captionEl.classList.add('show')
  if (captionTimer) clearTimeout(captionTimer)
  captionTimer = setTimeout(() => captionEl.classList.remove('show'), CAPTION_MS)
}

/** Wash bands on the scrubber: one per inject_* phase, until the next clear_faults. */
export function renderBands() {
  while (markersEl.firstChild) markersEl.removeChild(markersEl.firstChild)
  const phases = store.activeScenario?.scenario?.phases ?? []
  const total = store.reel ? (store.reel.durationSim ?? 0) : store.maxDuration
  if (!phases.length || total <= 0) return
  phases.forEach((p, i) => {
    if (!p.action.startsWith('inject_')) return
    const end = phases.slice(i + 1).find(q => q.action === 'clear_faults')?.at ?? total
    const band = document.createElement('div')
    band.className = 'tl-band'
    band.style.left = `${(p.at / total) * 100}%`
    band.style.width = `${(Math.min(end, total) - p.at) / total * 100}%`
    band.style.background = ACTION_COLOR[p.action] ?? 'oklch(0.7 0.1 230 / 0.3)'
    band.title = `${p.label} (T+${p.at}s)`
    markersEl.appendChild(band)
  })
}

export function narratorOnScenario() {
  resetNarrator()
  renderBands()
}

export function narratorOnEvents(events: AppEvent[]) {
  for (const evt of events) {
    switch (evt.event_type) {
      case 'ScenarioPhaseFired':
        phaseLabel = String(evt.label ?? '')
        caption(phaseLabel)
        break
      case 'GossipPrune':
        if (firstSybilPrunedAt === null && evt.to_peer?.startsWith('sybil-') && evt.reason === 'score') {
          firstSybilPrunedAt = evt.at
          caption(`First Sybil pruned by score at T+${evt.at.toFixed(1)}s`)
          store.beats.push({ label: 'First Sybil pruned', time: evt.at, color: 'oklch(0.62 0.24 15)' })
        }
        break
      case 'GossipMessage':
        if (evt.msg_id?.startsWith('spam-')) invalidMsgs++
        break
      case 'FaultCleared':
        if (healStartAt === null) { healStartAt = evt.at; healedAnnounced = false }
        break
    }
  }
  renderTicker()
}

export function narratorOnAnalytics() {
  const ga = store.gossipAnalytics
  if (healStartAt !== null && !healedAnnounced && ga && (ga.recent_delivery_ratio ?? 0) >= 0.95) {
    healedAnnounced = true
    const n = Math.max(0, store.simTime - healStartAt)
    caption(`Mesh healed in ${n.toFixed(1)}s`)
    store.beats.push({ label: 'Mesh healed', time: store.simTime, color: 'oklch(0.78 0.16 155)' })
  }
  renderTicker()
}

export function renderTicker() {
  if (!tickerEl || !store.hero) return  // strip is display:none outside hero; skip the DOM churn
  const ga = store.gossipAnalytics
  const attackers = store.nodes.filter(n => n.state === 'attacker')
  const pruned = attackers.filter(n => n.connected_peers.length === 0).length
  // Before the first message, analytics arrive with zeros and an empty mesh_stability
  const has = !!ga && ga.total_messages > 0
  const delivery = has ? `${((ga.recent_delivery_ratio ?? ga.avg_delivery_ratio) * 100).toFixed(0)}%` : '—'
  const degree = has && ga.mesh_stability?.avg_degree != null ? ga.mesh_stability.avg_degree.toFixed(1) : '—'
  const hops = has ? ga.avg_hops.toFixed(1) : '—'
  const lat = has ? `${ga.avg_propagation_ms.toFixed(0)} ms` : '—'
  const cells: [string, string][] = [
    ['phase', phaseLabel || (store.activeScenario?.scenario?.name ?? 'free play')],
    ['delivery', delivery],
    ['mesh degree', degree],
    ['hops', hops],
    ['end-to-end', lat],
    ['attackers', attackers.length ? `${attackers.length} · ${pruned} pruned` : '0'],
    ['invalid msgs', String(invalidMsgs)],
    ['T', formatTime(store.simTime)],
  ]
  // Rebuild cheaply: 8 small spans
  while (tickerEl.firstChild) tickerEl.removeChild(tickerEl.firstChild)
  for (const [k, v] of cells) {
    const cell = document.createElement('span')
    cell.className = 'tk-cell'
    const key = document.createElement('span'); key.className = 'tk-key'; key.textContent = k
    const val = document.createElement('span'); val.className = 'tk-val'; val.textContent = v
    cell.append(key, val)
    tickerEl.appendChild(cell)
  }
}

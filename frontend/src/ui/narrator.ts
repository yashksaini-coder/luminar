// Phase narrator — turns scenario phases and derived beats into things an audience can read:
// timeline wash bands, a caption card over the map, and the Hero ticker strip.
// Identical live and in reels because both feed the same handlers.
import { store, timelineTotal } from '../store'
import type { AppEvent } from '../types'
import { formatTime } from '../format'

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

export type CaptionKind = 'phase' | 'narrator' | 'healed'

/** Caption card: "T+11.9s · NARRATOR" kicker + sentence; the drain bar restarts on every call. */
export function caption(text: string, kind: CaptionKind = 'narrator', at = store.simTime) {
  const kicker = captionEl.querySelector('.lm-cap-kicker')
  const body = captionEl.querySelector('.lm-cap-text')
  if (kicker && body) {
    kicker.textContent = `T+${at.toFixed(1)}s · ${kind === 'phase' ? 'PHASE' : 'NARRATOR'}`
    body.textContent = text
  } else {
    captionEl.textContent = text
  }
  captionEl.dataset.kind = kind
  captionEl.classList.remove('show')
  void captionEl.offsetWidth   // reflow so re-adding .show restarts the drain animation
  captionEl.classList.add('show')
  if (captionTimer) clearTimeout(captionTimer)
  captionTimer = setTimeout(() => captionEl.classList.remove('show'), CAPTION_MS)
}

/** Wash bands on the scrubber: one per inject_* phase, until the next clear_faults. */
export function renderBands() {
  while (markersEl.firstChild) markersEl.removeChild(markersEl.firstChild)
  const phases = store.activeScenario?.scenario?.phases ?? []
  const total = timelineTotal()
  if (!phases.length || total <= 0) return
  phases.forEach((p, i) => {
    if (!p.action.startsWith('inject_')) return
    const end = phases.slice(i + 1).find(q => q.action === 'clear_faults')?.at ?? total
    const band = document.createElement('div')
    band.className = 'tl-band'
    band.style.left = `${(p.at / total) * 100}%`
    band.style.width = `${(Math.min(end, total) - p.at) / total * 100}%`
    band.dataset.action = p.action  // colour comes from .tl-band[data-action] in CSS
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
        caption(phaseLabel, 'phase', evt.at)
        break
      case 'GossipPrune':
        if (firstSybilPrunedAt === null && evt.to_peer?.startsWith('sybil-') && evt.reason === 'score') {
          firstSybilPrunedAt = evt.at
          caption('First Sybil pruned by score', 'narrator', evt.at)
          store.beats.push({ label: 'First Sybil pruned', time: evt.at, color: 'var(--lm-danger)' })
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
    caption(`Mesh healed in ${n.toFixed(1)}s`, 'healed')
    store.beats.push({ label: 'Mesh healed', time: store.simTime, color: 'var(--lm-ok)' })
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
  // [key, value, danger] — CSS uppercases the key; red only when an attacker count is live
  const cells: [string, string, boolean?][] = [
    ['phase', phaseLabel || (store.activeScenario?.scenario?.name ?? 'free play')],
    ['delivery', delivery],
    ['mesh d', degree],
    ['hops', hops],
    ['e2e', lat],
    ['attackers', attackers.length ? `${attackers.length} · ${pruned} pruned` : '0', attackers.length > 0],
    ['invalid', String(invalidMsgs), invalidMsgs > 0],
    ['T', '+' + formatTime(store.simTime)],
  ]
  // Rebuild cheaply: 8 small spans
  while (tickerEl.firstChild) tickerEl.removeChild(tickerEl.firstChild)
  for (const [k, v, danger] of cells) {
    const cell = document.createElement('span')
    cell.className = 'tk-cell'
    if (danger) cell.dataset.danger = ''
    const key = document.createElement('span'); key.className = 'tk-key'; key.textContent = k
    const val = document.createElement('span'); val.className = 'tk-val'; val.textContent = v
    cell.append(key, val)
    tickerEl.appendChild(cell)
  }
}

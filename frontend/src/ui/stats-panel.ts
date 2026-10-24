import { store } from '../store'
import { formatNumber } from '../format'
import { drawCDF, cdfStats, fmtLatency } from '../charts/sparkline'

const STATES = ['idle', 'origin', 'receiving', 'decoded', 'joining', 'failed', 'error', 'attacker', 'pruned']
const CATS = ['gossip', 'connection', 'stream', 'dht', 'fault', 'health']
const KPIS: [string, string][] = [
  ['gossip-delivery', 'Delivery'],
  ['gossip-latency', 'Propagation'],
  ['gossip-hops', 'Avg hops'],
  ['gossip-mesh-size', 'Mesh degree'],
]

const els = new Map<string, HTMLElement>()

function h<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag)
  if (cls) e.className = cls
  if (text !== undefined) e.textContent = text
  return e
}

/** "1,284" under 10k, "61.9K" above. */
const fmtCount = (n: number) => (n < 10_000 ? n.toLocaleString('en-US') : formatNumber(n))

function addBarRow(parent: HTMLElement, label: string, key: string, cat?: string): void {
  const row = h('div', 'lm-barrow')
  if (cat) row.dataset.cat = cat
  const bar = h('div', 'lm-bar')
  const fill = h('span')
  bar.appendChild(fill)
  const value = h('span', 'value', '0')
  row.append(h('span', 'label', label), bar, value)
  parent.appendChild(row)
  els.set(key, value)
  els.set(`${key}-bar`, fill)
}

export function initStatsPanel() {
  const container = document.getElementById('stats-content')!
  while (container.firstChild) container.removeChild(container.firstChild)
  els.clear()

  // KPI tiles
  const kpis = h('div', 'lm-kpis')
  for (const [key, label] of KPIS) {
    const tile = h('div', 'lm-kpi')
    const val = h('span', 'lm-kpi-val')
    const num = h('span', 'lm-kpi-num value', '—')
    const unit = h('span', 'lm-kpi-unit')
    unit.hidden = true
    val.append(num, unit)
    if (key === 'gossip-delivery') {
      const dot = h('span', 'lm-kpi-dot')
      val.appendChild(dot)
      els.set('gossip-delivery-dot', dot)
    }
    tile.append(h('span', 'lm-label', label), val)
    kpis.appendChild(tile)
    els.set(key, num)
    els.set(`${key}-unit`, unit)
  }
  container.appendChild(kpis)

  // Node states: header count, stacked bar, 2-column grid
  const nodes = h('div', 'lm-sec lm-nodes')
  const head = h('div', 'lm-sec-head')
  const count = h('span', 'lm-sec-meta', '0')
  head.append(h('span', 'lm-label', 'Nodes'), count)
  els.set('node-count', count)
  const bar = h('div', 'lm-statebar')
  const grid = h('div', 'lm-stategrid')
  for (const state of STATES) {
    const seg = h('span', 'lm-seg')
    seg.style.background = state === 'pruned' ? 'var(--lm-fg3)' : `var(--lm-node-${state})`
    seg.style.display = 'none'
    bar.appendChild(seg)
    els.set(`seg-${state}`, seg)

    const row = h('div', 'lm-staterow')
    row.dataset.state = state
    const dot = h('span', 'nl-dot')
    dot.dataset.state = state
    if (state !== 'pruned') dot.style.background = `var(--lm-node-${state})`
    const value = h('span', 'value', '0')
    row.append(dot, h('span', 'label', state), value)
    grid.appendChild(row)
    els.set(`state-${state}`, value)
  }
  nodes.append(head, bar, grid)
  container.appendChild(nodes)

  // Messages
  const msgs = h('div', 'lm-sec lm-msgs')
  msgs.appendChild(h('div', 'lm-label', 'Messages'))
  for (const [key, label] of [['msg-sent', 'Sent'], ['msg-recv', 'Received'], ['total-events', 'Total events']]) {
    const row = h('div', 'stat-row')
    const value = h('span', 'value', '0')
    row.append(h('span', 'label', label), value)
    msgs.appendChild(row)
    els.set(key, value)
  }
  container.appendChild(msgs)

  // Delivery CDF
  const cdf = h('div', 'chart-wrap')
  const title = h('div', 'chart-title')
  const meta = h('span', 'lm-sec-meta')
  title.append(h('span', '', 'Delivery CDF'), meta)
  els.set('cdf-meta', meta)
  const canvas = h('canvas')
  canvas.id = 'cdf-chart'
  const axis = h('div', 'lm-axis')
  for (const k of ['cdf-min', 'cdf-mid', 'cdf-max']) {
    const s = h('span')
    axis.appendChild(s)
    els.set(k, s)
  }
  cdf.append(title, canvas, axis)
  container.appendChild(cdf)

  // Milestones (updateStatsPanel keeps children[0] as the title)
  const ms = h('div', 'stat-group')
  ms.id = 'milestones-section'
  ms.appendChild(h('div', 'lm-label', 'Milestones'))
  container.appendChild(ms)

  // Event categories
  const cats = h('div', 'lm-sec lm-cats')
  cats.appendChild(h('div', 'lm-label', 'Event categories'))
  for (const cat of CATS) addBarRow(cats, cat, `evt-${cat}`, cat)
  container.appendChild(cats)

  // Infrastructure
  const infra = h('div', 'lm-sec lm-infra')
  infra.appendChild(h('div', 'lm-label', 'Infrastructure'))
  addBarRow(infra, 'Streams', 'streams')
  const dht = h('div', 'lm-barrow')
  const segs = h('div', 'lm-segs')
  for (let i = 0; i < 8; i++) segs.appendChild(h('span'))
  const dhtVal = h('span', 'value', '0/8')
  dht.append(h('span', 'label', 'DHT'), segs, dhtVal)
  infra.appendChild(dht)
  els.set('dht', dhtVal)
  els.set('dht-segs', segs)
  container.appendChild(infra)
}

function setKpi(key: string, text: string | null, unit = '') {
  els.get(key)!.textContent = text ?? '—'
  const u = els.get(`${key}-unit`)!
  u.textContent = unit
  u.hidden = text === null || !unit
}

export function updateStatsPanel() {
  if (!els.size) return

  // Nodes: attackers pruned from every mesh move to their own row
  const pruned = store.nodes.filter(n => n.state === 'attacker' && n.connected_peers.length === 0).length
  const counts: Record<string, number> = { ...store.stateDistribution, pruned }
  counts.attacker = Math.max(0, (counts.attacker ?? 0) - pruned)
  els.get('node-count')!.textContent = String(store.nodeCount)
  for (const state of STATES) {
    const n = counts[state] ?? 0
    els.get(`state-${state}`)!.textContent = String(n)
    const seg = els.get(`seg-${state}`)!
    seg.style.flex = String(n)
    seg.style.display = n > 0 ? '' : 'none'
  }

  els.get('msg-sent')!.textContent = fmtCount(store.totalMessagesSent)
  els.get('msg-recv')!.textContent = fmtCount(store.totalMessagesReceived)
  els.get('total-events')!.textContent = fmtCount(store.eventCount)

  const total = store.eventCount || 1
  for (const cat of CATS) {
    const n = store.eventCounts[cat] ?? 0
    els.get(`evt-${cat}`)!.textContent = formatNumber(n)
    els.get(`evt-${cat}-bar`)!.style.width = n > 0 ? `${Math.max((n / total) * 100, 2)}%` : '0'
  }

  const { open, max } = store.streamManager
  els.get('streams')!.textContent = `${open}/${max}`
  els.get('streams-bar')!.style.width = `${max > 0 ? (open / max) * 100 : 0}%`
  const active = store.dhtCoordinator.active
  els.get('dht')!.textContent = `${active}/8`
  els.get('dht-segs')!.querySelectorAll('span').forEach((s, i) => s.classList.toggle('active', i < active))

  // Gossip KPIs — analytics arrive zeroed before the first message; show "—" until then
  const ga = store.gossipAnalytics
  const has = !!ga && ga.total_messages > 0
  const dot = els.get('gossip-delivery-dot')!
  if (has) {
    const pct = (ga.recent_delivery_ratio ?? ga.avg_delivery_ratio) * 100
    setKpi('gossip-delivery', pct.toFixed(1), '%')
    dot.toggleAttribute('data-ok', pct >= 95)
    dot.toggleAttribute('data-bad', pct < 50)
    setKpi('gossip-latency', ga.avg_propagation_ms.toFixed(0), 'ms')
    setKpi('gossip-hops', ga.avg_hops.toFixed(1))
    const m = ga.mesh_stability
    // Mock shows the target "D=6"; the app has no target-D field, so min–max degree is the honest unit
    setKpi('gossip-mesh-size', m?.avg_degree != null ? m.avg_degree.toFixed(1) : null,
      m?.avg_degree != null ? `${m.min_degree}–${m.max_degree}` : '')
  } else {
    for (const [key] of KPIS) setKpi(key, null)
    dot.removeAttribute('data-ok')
    dot.removeAttribute('data-bad')
  }

  const cdf = has ? ga.latency_cdf : []
  const canvas = document.getElementById('cdf-chart') as HTMLCanvasElement | null
  if (canvas && cdf?.length) {
    drawCDF(canvas, cdf, 224, 56)
    const { min, max, p50 } = cdfStats(cdf)
    els.get('cdf-meta')!.textContent = `p50 ${fmtLatency(p50)}`
    els.get('cdf-min')!.textContent = fmtLatency(min)
    els.get('cdf-mid')!.textContent = 'p50'
    els.get('cdf-max')!.textContent = fmtLatency(max)
  }

  // Milestones: narrator beats get the brighter label
  const msSection = document.getElementById('milestones-section')
  if (msSection) {
    while (msSection.children.length > 1) msSection.removeChild(msSection.lastChild!)
    for (const ms of store.milestones) {
      const row = h('div', 'stat-row milestone-row')
      row.classList.toggle('lm-beat', store.beats.includes(ms))
      const label = h('span', 'label')
      const dot = h('span', 'nl-dot')
      dot.style.background = ms.color
      label.append(dot, ms.label)
      row.append(label, h('span', 'value', ms.time.toFixed(3) + 's'))
      msSection.appendChild(row)
    }
  }
}

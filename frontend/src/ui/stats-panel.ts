import { store } from '../store'
import { STATE_CSS, chrome } from '../palette'
import { formatNumber } from '../format'
import { drawCDF } from '../charts/sparkline'

interface ValueEl { el: HTMLElement; key: string }
const valueEls: ValueEl[] = []

function findValue(key: string): HTMLElement | null {
  for (const { el, key: k } of valueEls) {
    if (k === key) return el
  }
  return null
}

export function initStatsPanel() {
  const container = document.getElementById('stats-content')!
  // Clear existing content safely
  while (container.firstChild) container.removeChild(container.firstChild)
  valueEls.length = 0

  // Network Nodes group
  const nodesGroup = addGroup(container, 'Network Nodes')
  addRow(nodesGroup, 'Total', '0', 'total')
  for (const state of ['idle', 'origin', 'receiving', 'decoded', 'failed', 'error']) {
    const color = STATE_CSS[state] ?? chrome.idle.css
    addRow(nodesGroup, state.charAt(0).toUpperCase() + state.slice(1), '0', `state-${state}`, color)
  }

  // Data group
  const dataGroup = addGroup(container, 'Messages')
  addRow(dataGroup, 'Sent', '0', 'msg-sent')
  addRow(dataGroup, 'Received', '0', 'msg-recv')
  addRow(dataGroup, 'Total Events', '0', 'total-events')

  // Gossip Analytics group
  const gossipGroup = addGroup(container, 'Gossip Analytics')
  addRow(gossipGroup, 'Delivery Ratio', '\u2014', 'gossip-delivery')
  addRow(gossipGroup, 'Propagation', '\u2014', 'gossip-latency')
  addRow(gossipGroup, 'Avg Hops', '\u2014', 'gossip-hops')
  addRow(gossipGroup, 'Mesh Size', '\u2014', 'gossip-mesh-size')

  // Delivery CDF chart
  const cdfWrap = document.createElement('div')
  cdfWrap.className = 'chart-wrap'
  const cdfTitle = document.createElement('div')
  cdfTitle.className = 'chart-title'
  cdfTitle.textContent = 'DELIVERY CDF'
  cdfWrap.appendChild(cdfTitle)
  const cdfCanvas = document.createElement('canvas')
  cdfCanvas.id = 'cdf-chart'
  cdfWrap.appendChild(cdfCanvas)
  container.appendChild(cdfWrap)

  // Milestones group
  const msGroup = document.createElement('div')
  msGroup.className = 'stat-group'
  msGroup.id = 'milestones-section'
  const msTitle = document.createElement('h3')
  msTitle.textContent = 'Milestones'
  msGroup.appendChild(msTitle)
  container.appendChild(msGroup)

  // Event categories group
  const evtGroup = addGroup(container, 'Event Categories')
  for (const cat of ['gossip', 'connection', 'stream', 'dht', 'fault', 'health']) {
    addRow(evtGroup, cat, '0', `evt-${cat}`)
  }

  // Infrastructure group
  const infraGroup = addGroup(container, 'Infrastructure')
  addRow(infraGroup, 'Streams Open', '0/64', 'streams')
  addRow(infraGroup, 'DHT Active', '0/8', 'dht')
}

export function updateStatsPanel() {
  for (const { el, key } of valueEls) {
    let val = ''
    if (key === 'total') val = String(store.nodeCount)
    else if (key.startsWith('state-')) val = String(store.stateDistribution[key.replace('state-', '')] ?? 0)
    else if (key === 'msg-sent') val = formatNumber(store.totalMessagesSent)
    else if (key === 'msg-recv') val = formatNumber(store.totalMessagesReceived)
    else if (key === 'total-events') val = formatNumber(store.eventCount)
    else if (key.startsWith('evt-')) val = formatNumber(store.eventCounts[key.replace('evt-', '')] ?? 0)
    else if (key === 'streams') val = `${store.streamManager.open}/${store.streamManager.max}`
    else if (key === 'dht') val = `${store.dhtCoordinator.active}/8`
    else continue  // skip gossip keys handled below
    el.textContent = val
  }

  // Update gossip analytics
  if (store.gossipAnalytics) {
    const ga = store.gossipAnalytics
    const deliveryEl = findValue('gossip-delivery')
    if (deliveryEl) {
      if (ga.avg_delivery_ratio != null) {
        const pct = ga.avg_delivery_ratio * 100
        deliveryEl.textContent = pct.toFixed(1) + '%'
        // Color based on threshold
        if (pct > 80) deliveryEl.style.color = 'var(--green)'
        else if (pct > 50) deliveryEl.style.color = 'oklch(0.75 0.14 95)'
        else deliveryEl.style.color = 'var(--red)'
      } else {
        deliveryEl.textContent = '\u2014'
        deliveryEl.style.color = ''
      }
    }
    const latencyEl = findValue('gossip-latency')
    if (latencyEl) {
      latencyEl.textContent = ga.avg_propagation_ms != null
        ? ga.avg_propagation_ms.toFixed(1) + 'ms' : '\u2014'
    }
    const hopsEl = findValue('gossip-hops')
    if (hopsEl) {
      hopsEl.textContent = ga.avg_hops != null
        ? ga.avg_hops.toFixed(1) : '\u2014'
    }
    const meshEl = findValue('gossip-mesh-size')
    if (meshEl) {
      meshEl.textContent = ga.mesh_stability
        ? String(Math.round(ga.mesh_stability.avg_degree)) : '\u2014'
    }

    // Update CDF chart
    const cdfCanvas = document.getElementById('cdf-chart') as HTMLCanvasElement
    if (cdfCanvas && ga.latency_cdf && ga.latency_cdf.length > 0) {
      const w = cdfCanvas.parentElement!.clientWidth - 16
      if (w > 0) drawCDF(cdfCanvas, ga.latency_cdf, w, 90)
    }
  }

  // Update milestones
  const msSection = document.getElementById('milestones-section')
  if (msSection && store.milestones.length > 0) {
    // Clear existing items (keep title h3)
    while (msSection.children.length > 1) msSection.removeChild(msSection.lastChild!)
    for (const ms of store.milestones) {
      const row = document.createElement('div')
      row.className = 'stat-row milestone-row'
      row.style.cursor = 'pointer'
      const label = document.createElement('span')
      label.className = 'label'
      const dot = document.createElement('span')
      dot.className = 'nl-dot'
      dot.style.background = ms.color
      dot.style.display = 'inline-block'
      dot.style.width = '6px'
      dot.style.height = '6px'
      dot.style.borderRadius = '50%'
      dot.style.marginRight = '5px'
      label.appendChild(dot)
      label.appendChild(document.createTextNode(ms.label))
      const value = document.createElement('span')
      value.className = 'value'
      value.textContent = ms.time.toFixed(3) + 's'
      row.appendChild(label)
      row.appendChild(value)
      msSection.appendChild(row)
    }
  }
}

function addGroup(parent: HTMLElement, title: string): HTMLElement {
  const group = document.createElement('div')
  group.className = 'stat-group'
  const h = document.createElement('h3')
  h.textContent = title
  group.appendChild(h)
  parent.appendChild(group)
  return group
}

function addRow(parent: HTMLElement, label: string, initial: string, key: string, dotColor?: string): void {
  const row = document.createElement('div')
  row.className = 'stat-row'

  const labelEl = document.createElement('span')
  labelEl.className = 'label'
  if (dotColor) {
    const dot = document.createElement('span')
    dot.className = 'nl-dot'
    dot.style.background = dotColor
    dot.style.display = 'inline-block'
    dot.style.width = '6px'
    dot.style.height = '6px'
    dot.style.borderRadius = '50%'
    dot.style.marginRight = '5px'
    labelEl.appendChild(dot)
    labelEl.appendChild(document.createTextNode(label))
  } else {
    labelEl.textContent = label
  }

  const valueEl = document.createElement('span')
  valueEl.className = 'value'
  valueEl.textContent = initial

  row.appendChild(labelEl)
  row.appendChild(valueEl)
  parent.appendChild(row)

  valueEls.push({ el: valueEl, key })
}

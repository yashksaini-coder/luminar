import './style.css'
import { store } from './store'
import * as api from './api/client'
import { ws } from './api/websocket'
import { initRenderer, resizeRenderer, renderLayers, fitView, spawnParticle, startAnimationLoop } from './map/renderer'
import { initOverlay, resizeOverlay } from './map/overlay'
import { computeLayout, startLiveForce, stopLiveForce } from './map/layout'
import { initStatsPanel, updateStatsPanel } from './ui/stats-panel'
import { initEventsPanel, appendEvents } from './ui/events-panel'
import { initPeerInspector, refreshPeerInspector, appendPeerInspectorEvents } from './ui/peer-inspector'
import { initPlayback, updatePlaybackUI } from './ui/playback'
import { initLegend } from './ui/legend'
import { initModeSwitcher } from './ui/mode-switcher'
import { initKeyboard } from './ui/keyboard'
import { formatTime } from './format'
import { oklchToRgba, P } from './palette'
import type { AppEvent } from './types'

// ── Topology fingerprint ──
let topoKey = ''

// ── Milestone computation ──
function computeMilestones() {
  const ms: { label: string; time: number; color: string }[] = []

  // Find first gossip message event
  const firstGossip = store.events.find(e => e.event_type === 'GossipMessage')
  if (firstGossip) ms.push({ label: 'First gossip message', time: firstGossip.at, color: 'oklch(0.72 0.12 230)' })

  // Find first fault
  const firstFault = store.events.find(e => e.event_type === 'FaultInjected')
  if (firstFault) ms.push({ label: 'First fault injected', time: firstFault.at, color: 'oklch(0.65 0.20 25)' })

  // Compute delivery milestones from analytics
  if (store.gossipAnalytics && store.gossipAnalytics.total_messages > 0) {
    ms.push({ label: `${store.gossipAnalytics.total_messages} messages`, time: store.simTime, color: 'oklch(0.75 0.14 155)' })
  }

  // Node state milestones
  const decoded = store.nodes.filter(n => n.state === 'decoded').length
  const receiving = store.nodes.filter(n => n.state === 'receiving').length
  if (decoded > 0) ms.push({ label: `${decoded} nodes decoded`, time: store.simTime, color: 'oklch(0.75 0.14 155)' })
  if (receiving > 0) ms.push({ label: `${receiving} nodes receiving`, time: store.simTime, color: 'oklch(0.72 0.12 230)' })

  store.milestones = ms
}

function recomputeLayout() {
  // Rebuild node index first (needed by both paths)
  store.nodeIndex.clear()
  for (let i = 0; i < store.nodes.length; i++) {
    store.nodeIndex.set(store.nodes[i].peer_id, i)
  }

  if (store.layoutMode === 'force') {
    // Live d3-force simulation with Obsidian-like interactive physics
    stopLiveForce()
    startLiveForce(store.nodes, store.edges, (positions) => {
      store.nodePositions = positions
      renderLayers()
    })
    // Initial fitView after warm-up settles
    setTimeout(() => fitView(), 200)
  } else {
    // Static layouts (grid, radial) — compute once, no physics
    stopLiveForce()
    const result = computeLayout(store.layoutMode, store.nodes, store.edges)
    store.nodePositions = result.positions
    renderLayers()
    requestAnimationFrame(() => fitView())
  }
}

async function fetchSnapshot() {
  const snap = await api.simSnapshot()
  if (!snap) return

  store.simState = snap.state
  store.simTime = snap.time
  store.simSpeed = snap.speed
  store.nodeCount = snap.node_count
  store.eventCount = snap.event_count
  store.nodes = snap.nodes
  store.playing = snap.state === 'running'

  // Auto-pause when duration limit is reached
  if (store.maxDuration > 0 && store.simTime >= store.maxDuration && store.playing) {
    await api.simPause()
    store.playing = false
    store.simState = 'paused'
  }

  const nodeIds = snap.nodes.map(n => n.peer_id).sort().join(',')
  const newTopoKey = `${nodeIds}|${store.layoutMode}`

  if (newTopoKey !== topoKey) {
    topoKey = newTopoKey
    recomputeLayout()
  } else {
    renderLayers()
  }

  updatePlaybackUI()
}

async function fetchEdges() {
  const result = await api.topologyEdges()
  if (!result) return
  store.edges = result.edges

  const edgeKey = result.edges.map(([s, t]) => `${s}-${t}`).sort().join(',')
  const fullKey = `${store.nodes.map(n => n.peer_id).sort().join(',')}|${edgeKey}|${store.layoutMode}`
  if (fullKey !== topoKey) {
    topoKey = fullKey
    recomputeLayout()
  }
}

async function fetchScenarios() {
  const result = await api.scenariosList()
  if (!result) return
  store.scenarios = result.scenarios
  buildScenarioDropdown()
}

function buildScenarioDropdown() {
  const dropdown = document.getElementById('scenario-dropdown')
  if (!dropdown) return
  while (dropdown.firstChild) dropdown.removeChild(dropdown.firstChild)
  for (const s of store.scenarios) {
    const btn = document.createElement('button')
    btn.className = 'dd-item'
    btn.textContent = `${s.icon} ${s.name}`
    btn.title = s.description
    btn.addEventListener('click', async () => {
      await api.scenarioLaunch(s.id, store.simSpeed)
      dropdown.style.display = 'none'
      await fetchSnapshot()
      await fetchEdges()
    })
    dropdown.appendChild(btn)
  }
}

// ── WebSocket event handler ──
function handleWsEvents(events: AppEvent[]) {
  // Safe concat — avoids stack overflow on large batches
  store.events = store.events.concat(events)
  if (store.events.length > store.maxEvents) {
    store.events = store.events.slice(-store.maxEvents)
  }
  store.eventCount += events.length

  for (const evt of events) {
    // Spawn particles for gossip messages — show message propagation
    if (evt.event_type === 'GossipMessage' && evt.from_peer) {
      const fromIdx = store.nodeIndex.get(evt.from_peer)
      const fromNode = fromIdx !== undefined ? store.nodes[fromIdx] : undefined
      if (fromNode) {
        // Send particles to 2 random connected peers (subtle, not flooding)
        const shuffled = fromNode.connected_peers.slice().sort(() => Math.random() - 0.5)
        const peers = shuffled.slice(0, 2)
        for (const peer of peers) {
          spawnParticle(evt.from_peer!, peer)
        }
      }
    }

    // Spawn particles for graft/prune (mesh changes)
    if ((evt.event_type === 'GossipGraft' || evt.event_type === 'GossipPrune') && evt.from_peer && evt.to_peer) {
      const color: [number, number, number, number] = evt.event_type === 'GossipGraft'
        ? oklchToRgba(P.decoded, 200)   // Green for graft
        : oklchToRgba(P.error, 200)     // Red for prune
      spawnParticle(evt.from_peer, evt.to_peer, color)
    }

    // Spawn particles for DHT queries
    if (evt.event_type === 'DHTQueryStarted' && evt.peer_id) {
      const dhtIdx = store.nodeIndex.get(evt.peer_id)
      const node = dhtIdx !== undefined ? store.nodes[dhtIdx] : undefined
      if (node && node.connected_peers.length > 0) {
        const target = node.connected_peers[Math.floor(Math.random() * node.connected_peers.length)]
        spawnParticle(evt.peer_id, target, oklchToRgba(P.routing, 200))
      }
    }

    // Fault events — spawn red particles to visualize the attack
    if (evt.event_type === 'FaultInjected') {
      const target = evt.target as string | undefined
      if (target) {
        const faultIdx = store.nodeIndex.get(target)
        const node = faultIdx !== undefined ? store.nodes[faultIdx] : undefined
        if (node) {
          // Red particles burst from affected node to its peers
          for (const peer of node.connected_peers.slice(0, 4)) {
            spawnParticle(target, peer, oklchToRgba(P.error, 220))
          }
        }
      }
    }

    if (evt.event_type === 'SimulationStateChanged') {
      if (evt.state) store.simState = evt.state as any
      if (evt.speed) store.simSpeed = evt.speed
      store.playing = store.simState === 'running'
    }
    if (evt.event_type === 'ClockTick' && evt.at != null) {
      store.simTime = evt.at
    }
  }

  // Auto-pause at duration limit
  if (store.maxDuration > 0 && store.simTime >= store.maxDuration && store.playing) {
    api.simPause()  // Fire and forget (no await in sync handler)
    store.playing = false
    store.simState = 'paused'
    updatePlaybackUI()
  }

  appendEvents(events)
  appendPeerInspectorEvents(events)

  const simTimeEl = document.getElementById('sim-time')
  if (simTimeEl) simTimeEl.textContent = formatTime(store.simTime)
}

// ── Dropdowns ──
function initDropdowns() {
  const scenarioBtn = document.getElementById('scenario-btn')
  const scenarioDD = document.getElementById('scenario-dropdown')
  const faultBtn = document.getElementById('fault-btn')
  const faultDD = document.getElementById('fault-dropdown')

  scenarioBtn?.addEventListener('click', () => {
    if (scenarioDD) scenarioDD.style.display = scenarioDD.style.display === 'none' ? 'block' : 'none'
    if (faultDD) faultDD.style.display = 'none'
  })

  faultBtn?.addEventListener('click', () => {
    if (faultDD) faultDD.style.display = faultDD.style.display === 'none' ? 'block' : 'none'
    if (scenarioDD) scenarioDD.style.display = 'none'
  })

  faultDD?.querySelectorAll('[data-fault]').forEach(btn => {
    btn.addEventListener('click', () => {
      const action = (btn as HTMLElement).dataset.fault!
      if (faultDD) faultDD.style.display = 'none'

      // Fire-and-forget — don't await, don't block UI
      switch (action) {
        case 'partition': {
          const peers = store.nodes.map(n => n.peer_id)
          const mid = Math.floor(peers.length / 2)
          api.faultPartition(peers.slice(0, mid), peers.slice(mid))
            .then(() => showFaultFlash('Network Partition injected'))
          break
        }
        case 'sybil':
          api.faultSybil(5)
            .then(() => showFaultFlash('Sybil Attack injected'))
          break
        case 'eclipse': {
          const t = store.selectedNode >= 0 ? store.nodes[store.selectedNode].peer_id : store.nodes[0]?.peer_id
          if (t) api.faultEclipse(t, 4)
            .then(() => showFaultFlash(`Eclipse on ${t}`))
          break
        }
        case 'drop': {
          const t = store.selectedNode >= 0 ? store.nodes[store.selectedNode].peer_id : null
          if (t) api.faultDrop(t)
            .then(() => showFaultFlash(`Dropped ${t}`))
          break
        }
        case 'clear-all':
          api.faultClearAll()
            .then(() => showFaultFlash('All faults cleared'))
          break
      }
    })
  })

  document.addEventListener('click', (e) => {
    if (scenarioDD && !(e.target as HTMLElement).closest('#scenario-picker')) scenarioDD.style.display = 'none'
    if (faultDD && !(e.target as HTMLElement).closest('#fault-picker')) faultDD.style.display = 'none'
  })
}

// ── WebSocket-pushed snapshot handler (replaces HTTP polling) ──
function handleWsSnapshot(snap: any) {
  store.simState = snap.state
  store.simTime = snap.time
  store.simSpeed = snap.speed
  store.nodeCount = snap.node_count
  store.eventCount = snap.event_count
  store.nodes = snap.nodes
  store.playing = snap.state === 'running'

  // Always rebuild nodeIndex when nodes update
  store.nodeIndex.clear()
  for (let i = 0; i < store.nodes.length; i++) {
    store.nodeIndex.set(store.nodes[i].peer_id, i)
  }

  // Auto-pause at duration limit
  if (store.maxDuration > 0 && store.simTime >= store.maxDuration && store.playing) {
    api.simPause()
    store.playing = false
    store.simState = 'paused'
  }

  // Check topology change
  const nodeIds = snap.nodes.map((n: any) => n.peer_id).sort().join(',')
  const newTopoKey = `${nodeIds}|${store.layoutMode}`
  if (newTopoKey !== topoKey) {
    topoKey = newTopoKey
    recomputeLayout()
  } else {
    renderLayers()
  }

  updatePlaybackUI()
  refreshPeerInspector()

  const simTimeEl = document.getElementById('sim-time')
  if (simTimeEl) simTimeEl.textContent = formatTime(store.simTime)
}

// ── WebSocket-pushed metrics handler ──
function handleWsMetrics(m: any) {
  store.stateDistribution = m.state_distribution ?? {}
  store.totalMessagesSent = m.total_messages_sent ?? 0
  store.totalMessagesReceived = m.total_messages_received ?? 0
  store.eventCounts = m.event_counts ?? {}
  store.streamManager = m.stream_manager ?? store.streamManager
  store.dhtCoordinator = m.dht_coordinator ?? store.dhtCoordinator
  updateStatsPanel()
}

// ── WebSocket-pushed analytics handler ──
function handleWsAnalytics(analytics: any) {
  store.gossipAnalytics = analytics
  updateStatsPanel()
}

// ── Fault flash notification ──
function showFaultFlash(message: string) {
  const existing = document.getElementById('fault-flash')
  if (existing) existing.remove()

  const flash = document.createElement('div')
  flash.id = 'fault-flash'
  flash.style.cssText = `
    position:absolute;top:50px;left:50%;transform:translateX(-50%);z-index:100;
    background:oklch(0.20 0.08 25/0.9);border:1px solid oklch(0.45 0.15 25/0.6);
    border-radius:4px;padding:8px 16px;font-size:12px;font-weight:600;
    color:oklch(0.65 0.20 25);pointer-events:none;font-family:var(--font);
    backdrop-filter:blur(8px);animation:fault-fade 2s ease-out forwards;
  `.replace(/\n/g, '')
  flash.textContent = message
  document.getElementById('map-container')?.appendChild(flash)

  setTimeout(() => flash.remove(), 2000)
}

// ── Preset handlers ──
function initPresets() {
  // Duration presets
  document.querySelectorAll('#duration-presets .preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const duration = parseInt((btn as HTMLElement).dataset.duration ?? '300', 10)
      store.maxDuration = duration
      // Update active state
      document.querySelectorAll('#duration-presets .preset-btn').forEach(b => b.classList.remove('active'))
      btn.classList.add('active')
    })
  })

  // Node count presets
  document.querySelectorAll('#node-presets .preset-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const n = parseInt((btn as HTMLElement).dataset.nodes ?? '20', 10)
      // Update active state
      document.querySelectorAll('#node-presets .preset-btn').forEach(b => b.classList.remove('active'))
      btn.classList.add('active')
      // Reconfigure backend
      topoKey = ''
      await api.simReconfigure(n)
      await fetchSnapshot()
      await fetchEdges()
    })
  })
}

// ── Connection status ──
function updateConnectionStatus(connected: boolean) {
  store.connected = connected
  const dot = document.getElementById('status-dot')
  const label = document.getElementById('status-label')
  if (dot) dot.className = connected ? 'dot-live' : 'dot-offline'
  if (label) label.textContent = connected ? 'LIVE' : 'OFFLINE'
}

// ── Resize ──
function handleResize() {
  const mapContainer = document.getElementById('map-container')
  if (!mapContainer) return
  resizeRenderer(mapContainer.clientWidth, mapContainer.clientHeight)
  resizeOverlay()
}

// ── Init ──
async function main() {
  // Initialize UI
  initStatsPanel()
  initEventsPanel()
  initPeerInspector()
  initPlayback()
  initLegend()
  initKeyboard()
  initDropdowns()
  initPresets()

  // Initialize renderer
  const deckCanvas = document.getElementById('deck-canvas') as HTMLCanvasElement
  const ringCanvas = document.getElementById('ring-canvas') as HTMLCanvasElement
  const tooltipEl = document.getElementById('tooltip')!
  initRenderer(deckCanvas, tooltipEl)
  initOverlay(ringCanvas)
  startAnimationLoop()
  handleResize()

  // Mode switcher
  initModeSwitcher(() => {
    topoKey = ''
    recomputeLayout()
  })

  // Keyboard events
  document.addEventListener('luminar:fitview', () => fitView())
  document.addEventListener('luminar:render', () => renderLayers())

  // Resize observer
  const mapContainer = document.getElementById('map-container')
  if (mapContainer) {
    new ResizeObserver(() => handleResize()).observe(mapContainer)
  }

  // Connect WebSocket with multiplexed handlers (snapshot, metrics, analytics pushed by server)
  ws.connect(
    handleWsEvents,
    updateConnectionStatus,
    handleWsSnapshot,
    handleWsMetrics,
    handleWsAnalytics,
  )

  // Initial data fetch (one-time, then WS takes over)
  await fetchSnapshot()
  await fetchEdges()
  await fetchScenarios()

  // Milestone computation runs on a light timer (no HTTP calls)
  const _milestoneInterval = setInterval(() => { computeMilestones() }, 2000)

  console.log('[luminar] P2P Network Monitor initialized — all data via WebSocket')
}

main().catch(console.error)

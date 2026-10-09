import './style.css'
import { store } from './store'
import * as api from './api/client'
import { ws } from './api/websocket'
import { loadReel, stopReel, type ReelMeta } from './api/replay'
import { initRenderer, resizeRenderer, renderLayers, fitView, spawnParticle, startAnimationLoop, getViewState } from './map/renderer'
import { initOverlay, resizeOverlay } from './map/overlay'
import { computeLayout, startLiveForce, stopLiveForce } from './map/layout'
import { initStatsPanel, updateStatsPanel } from './ui/stats-panel'
import { initEventsPanel, appendEvents } from './ui/events-panel'
import { initPeerInspector, refreshPeerInspector, appendPeerInspectorEvents } from './ui/peer-inspector'
import { initTelemetryPanel, toggleTelemetryPanel, updateTelemetryPanel } from './ui/telemetry-panel'
import { initPlayback, updatePlaybackUI } from './ui/playback'
import { initLegend } from './ui/legend'
import { initModeSwitcher } from './ui/mode-switcher'
import { initKeyboard } from './ui/keyboard'
import { initNarrator, narratorOnEvents, narratorOnAnalytics, narratorOnScenario, renderBands } from './ui/narrator'
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

  store.milestones = [...store.beats, ...ms]
}

function recomputeLayout() {
  // Rebuild node index first (needed by both paths)
  store.nodeIndex.clear()
  for (let i = 0; i < store.nodes.length; i++) {
    store.nodeIndex.set(store.nodes[i].peer_id, i)
  }

  // Attackers are not in the topology edge list; link them to the meshes they sit in
  // so the force layout places them next to their targets.
  const attackerLinks: [string, string][] = []
  for (const n of store.nodes) {
    if (n.state === 'attacker') for (const t of n.connected_peers) attackerLinks.push([n.peer_id, t])
  }
  const layoutEdges = attackerLinks.length ? [...store.edges, ...attackerLinks] : store.edges

  if (store.layoutMode === 'force') {
    // Live d3-force simulation with Obsidian-like interactive physics.
    // startLiveForce restarts in place and reuses positions for nodes it already knows;
    // calling stopLiveForce() first would wipe that memory and re-seed the whole graph.
    startLiveForce(store.nodes, layoutEdges, (positions) => {
      store.nodePositions = positions
      renderLayers()
    })
    // Initial fitView after warm-up settles
    setTimeout(() => fitView(), 200)
  } else {
    // Static layouts (grid, radial) — compute once, no physics
    stopLiveForce()
    const result = computeLayout(store.layoutMode, store.nodes, layoutEdges)
    store.nodePositions = result.positions
    renderLayers()
    requestAnimationFrame(() => fitView())
  }
}

// Debug / e2e handle (read-only use): window.__luminar.store, .fitView, .viewState()
;(window as any).__luminar = { store, fitView, viewState: getViewState }

async function fetchSnapshot() {
  const snap = await api.simSnapshot()
  if (!snap) return

  store.simState = snap.state
  store.simTime = snap.time
  store.simSpeed = snap.speed
  store.nodeCount = snap.node_count
  store.eventCount = snap.event_count
  store.nodes = snap.nodes
  store.mesh = snap.gossip?.mesh ?? {}
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
  narratorOnEvents(events)

  for (const evt of events) {
    // Spawn particles for gossip messages — show message propagation
    if (evt.event_type === 'GossipMessage' && evt.from_peer && evt.to_peer) {
      // One particle per real hop, sender → receiver. The origin publish (no to_peer)
      // draws nothing; its flood relays each carry their own event.
      const color = evt.from_peer.startsWith('sybil-') ? oklchToRgba(P.attacker, 220) : undefined
      spawnParticle(evt.from_peer, evt.to_peer, color, evt.dropped === true)
    }

    // Spawn particles for graft/prune (mesh changes)
    if ((evt.event_type === 'GossipGraft' || evt.event_type === 'GossipPrune') && evt.from_peer && evt.to_peer) {
      const color: [number, number, number, number] = evt.event_type === 'GossipGraft'
        ? oklchToRgba(P.decoded, 200)   // Green for graft
        : oklchToRgba(P.error, 200)     // Red for prune
      spawnParticle(evt.from_peer, evt.to_peer, color)
    }

    // Spawn particles for DHT queries
    const initiator = evt.initiator as string | undefined
    if (evt.event_type === 'DHTQueryStarted' && initiator) {
      const dhtIdx = store.nodeIndex.get(initiator)
      const node = dhtIdx !== undefined ? store.nodes[dhtIdx] : undefined
      if (node && node.connected_peers.length > 0) {
        const target = node.connected_peers[Math.floor(Math.random() * node.connected_peers.length)]
        spawnParticle(initiator, target, oklchToRgba(P.routing, 200))
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

// ── Non-periodic WS frames: edges, scenario, gap ──
function handleWsEdges(frame: { edges: [string, string][] }) {
  store.edges = frame.edges
  const edgeKey = frame.edges.map(([s, t]) => `${s}-${t}`).sort().join(',')
  const fullKey = `${store.nodes.map(n => n.peer_id).sort().join(',')}|${edgeKey}|${store.layoutMode}`
  if (fullKey !== topoKey) {
    topoKey = fullKey
    recomputeLayout()
  }
}

function handleWsScenario(frame: any) {
  store.activeScenario = frame.active ? frame : null
  narratorOnScenario()
}

// ── Presentation prefs: stage theme + hero layout (keys t/h, legend, URL, localStorage) ──
function applyPrefs() {
  if (store.stageTheme) document.documentElement.setAttribute('data-theme', 'stage')
  else document.documentElement.removeAttribute('data-theme')
  document.getElementById('app')!.classList.toggle('hero', store.hero)
  store.scale = store.stageTheme
    ? { node: 1.4, particle: 1.8, edgeAlpha: 1.6 }
    : { node: 1, particle: 1, edgeAlpha: 1 }
  const url = new URL(location.href)
  store.stageTheme ? url.searchParams.set('theme', 'stage') : url.searchParams.delete('theme')
  store.hero ? url.searchParams.set('hero', '1') : url.searchParams.delete('hero')
  history.replaceState(null, '', url)
  try { localStorage.setItem('luminar.prefs', JSON.stringify({ stageTheme: store.stageTheme, hero: store.hero })) } catch { /* private mode */ }
  handleResize()
  renderBands()
  renderLayers()
}

function loadPrefs() {
  try {
    const saved = JSON.parse(localStorage.getItem('luminar.prefs') ?? '{}')
    store.stageTheme = !!saved.stageTheme
    store.hero = !!saved.hero
  } catch { /* ignore */ }
  const q = new URLSearchParams(location.search)
  if (q.has('theme')) store.stageTheme = q.get('theme') === 'stage'
  if (q.has('hero')) store.hero = q.get('hero') === '1'
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) store.particlesEnabled = false
  document.addEventListener('luminar:pref', (e: Event) => {
    const key = (e as CustomEvent<'stageTheme' | 'hero'>).detail
    store[key] = !store[key]
    applyPrefs()
  })
  applyPrefs()
}

function handleWsGap(frame: { dropped: number }) {
  store.droppedEvents += frame.dropped
}

// ── Reels (recorded runs replayed client-side; backend not needed) ──
let reelManifest: ReelMeta[] = []

async function fetchReels() {
  try {
    const res = await fetch('/reels/manifest.json')
    if (!res.ok) return
    reelManifest = await res.json()
  } catch { return }
  const dd = document.getElementById('reel-dropdown')
  if (!dd) return
  while (dd.firstChild) dd.removeChild(dd.firstChild)
  reelManifest.forEach((r, i) => {
    const btn = document.createElement('button')
    btn.className = 'dd-item'
    btn.textContent = `${i + 1}  ${r.title}`
    btn.title = r.blurb ?? ''
    btn.addEventListener('click', () => { dd.style.display = 'none'; enterReel(r) })
    dd.appendChild(btn)
  })
  const div = document.createElement('div'); div.className = 'dd-divider'; dd.appendChild(div)
  const live = document.createElement('button')
  live.className = 'dd-item'
  live.textContent = '0  Back to live'
  live.addEventListener('click', () => { dd.style.display = 'none'; exitReel() })
  dd.appendChild(live)
}

async function enterReel(meta: ReelMeta) {
  ws.disconnect()
  topoKey = ''
  store.playing = false
  const ok = await loadReel(meta, () => { updatePlaybackUI(); renderLayers() })
  if (!ok) { exitReel(); return }
  updateConnectionStatus(false)
  const url = new URL(location.href)
  url.searchParams.set('reel', meta.name)
  history.replaceState(null, '', url)
}

function exitReel() {
  stopReel()
  topoKey = ''
  const url = new URL(location.href)
  url.searchParams.delete('reel')
  history.replaceState(null, '', url)
  ws.connect()
}

// ── Dropdowns ──
function initDropdowns() {
  const scenarioBtn = document.getElementById('scenario-btn')
  const scenarioDD = document.getElementById('scenario-dropdown')
  const faultBtn = document.getElementById('fault-btn')
  const faultDD = document.getElementById('fault-dropdown')
  const reelBtn = document.getElementById('reel-btn')
  const reelDD = document.getElementById('reel-dropdown')
  const all = [scenarioDD, faultDD, reelDD]
  const toggle = (dd: HTMLElement | null) => {
    for (const other of all) if (other && other !== dd) other.style.display = 'none'
    if (dd) dd.style.display = dd.style.display === 'none' ? 'block' : 'none'
  }

  scenarioBtn?.addEventListener('click', () => toggle(scenarioDD))
  faultBtn?.addEventListener('click', () => toggle(faultDD))
  reelBtn?.addEventListener('click', () => toggle(reelDD))
  document.addEventListener('luminar:reel', (e: Event) => {
    const i = (e as CustomEvent<number>).detail
    if (i < 0) exitReel()
    else if (reelManifest[i]) enterReel(reelManifest[i])
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
  store.mesh = snap.gossip?.mesh ?? {}
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
  narratorOnAnalytics()
}

// ── WebSocket-pushed telemetry status handler ──
function handleWsTelemetryStatus(status: any) {
  const badge = document.getElementById('telemetry-badge') as HTMLButtonElement | null
  if (!badge) return
  badge.style.display = status.active ? 'inline-flex' : 'none'
  const countEl = document.getElementById('telem-count')
  if (countEl) countEl.textContent = String(status.peer_count)
  updateTelemetryPanel(status)
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
  if (store.reel) {
    if (dot) dot.className = 'dot-reel'
    if (label) label.textContent = `REEL · ${store.reel.title}`
    return
  }
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
  initTelemetryPanel()
  initPlayback()
  initLegend()
  initKeyboard()
  initDropdowns()
  initPresets()

  // Telemetry badge click → toggle panel
  document.getElementById('telemetry-badge')?.addEventListener('click', toggleTelemetryPanel)

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

  initNarrator()
  loadPrefs()
  ws.bind(
    handleWsEvents,
    updateConnectionStatus,
    handleWsSnapshot,
    handleWsMetrics,
    handleWsAnalytics,
    handleWsTelemetryStatus,
  )
  ws.onFrame.edges = handleWsEdges
  ws.onFrame.scenario = handleWsScenario
  ws.onFrame.gap = handleWsGap

  await fetchReels()
  const reelParam = new URLSearchParams(location.search).get('reel')
  const reelMeta = reelParam ? reelManifest.find(r => r.name === reelParam) : undefined
  if (reelMeta) {
    // Offline path: no backend needed at all
    await loadReel(reelMeta, () => { updatePlaybackUI(); renderLayers() })
    updateConnectionStatus(false)
  } else {
    // Live: multiplexed WS (snapshot, metrics, analytics pushed by server)
    ws.connect()

    // Initial data fetch (one-time, then WS takes over)
    await fetchSnapshot()
    await fetchEdges()
  }
  await fetchScenarios()

  // Milestone computation runs on a light timer (no HTTP calls)
  const _milestoneInterval = setInterval(() => { computeMilestones() }, 2000)

  console.log('[luminar] P2P Network Monitor initialized — all data via WebSocket')
}

main().catch(console.error)

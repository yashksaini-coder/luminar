import './style.css'
import { store } from './store'
import * as api from './api/client'
import { ws } from './api/websocket'
import { loadReel, stopReel, reelPlaying, seekReelToSimTime, type ReelMeta } from './api/replay'
import { initRenderer, resizeRenderer, renderLayers, fitView, spawnParticle, startAnimationLoop, getViewState } from './map/renderer'
import { initOverlay, resizeOverlay } from './map/overlay'
import { computeLayout, startLiveForce, stopLiveForce, isNodeVisible, isSimPeer, type LayoutEdge } from './map/layout'
import { initStatsPanel, updateStatsPanel } from './ui/stats-panel'
import { initEventsPanel, appendEvents } from './ui/events-panel'
import { initPeerInspector, refreshPeerInspector, appendPeerInspectorEvents } from './ui/peer-inspector'
import { initTelemetryPanel, toggleTelemetryPanel, updateTelemetryPanel } from './ui/telemetry-panel'
import { initPlayback, updatePlaybackUI } from './ui/playback'
import { initLegend } from './ui/legend'
import { initModeSwitcher } from './ui/mode-switcher'
import { initKeyboard } from './ui/keyboard'
import { initNarrator, narratorOnEvents, narratorOnAnalytics, narratorOnScenario, renderBands, renderTicker, caption } from './ui/narrator'
import { formatTime } from './format'
import type { AppEvent, LayoutMode } from './types'

// ── Topology fingerprint ──
let topoKey = ''
/** One key format for every site, so an edges frame followed by a same-topology snapshot recomputes once. */
function currentTopoKey(): string {
  // Only nodes drawn in this view count (observers arriving per slot must not restart Force),
  // keyed with their index because nodePositions is index-aligned with store.nodes
  const ids = store.nodes.map((n, i) => isNodeVisible(store.layoutMode, n) ? `${i}:${n.peer_id}` : '').filter(Boolean).join(',')
  const edges = store.edges.map(([s, t]) => `${s}-${t}`).sort().join(',')
  return `${ids}|${edges}|${store.layoutMode}`
}

// ── Milestone computation ──
function computeMilestones() {
  const ms: { label: string; time: number; color: string }[] = []

  // Find first gossip message event
  const firstGossip = store.events.find(e => e.event_type === 'GossipMessage')
  if (firstGossip) ms.push({ label: 'First gossip message', time: firstGossip.at, color: 'var(--lm-fg2)' })

  // Find first fault
  const firstFault = store.events.find(e => e.event_type === 'FaultInjected')
  if (firstFault) ms.push({ label: 'First fault injected', time: firstFault.at, color: 'var(--lm-danger)' })

  // Compute delivery milestones from analytics
  if (store.gossipAnalytics && store.gossipAnalytics.total_messages > 0) {
    ms.push({ label: `${store.gossipAnalytics.total_messages} messages`, time: store.simTime, color: 'var(--lm-fg2)' })
  }

  // Node state milestones
  const decoded = store.nodes.filter(n => n.state === 'decoded').length
  const receiving = store.nodes.filter(n => n.state === 'receiving').length
  if (decoded > 0) ms.push({ label: `${decoded} nodes decoded`, time: store.simTime, color: 'var(--lm-ok)' })
  if (receiving > 0) ms.push({ label: `${receiving} nodes receiving`, time: store.simTime, color: 'var(--lm-node-receiving)' })

  store.milestones = [...store.beats, ...ms]
}

let fitTimers: ReturnType<typeof setTimeout>[] = []

function recomputeLayout() {
  for (const t of fitTimers) clearTimeout(t)  // a pending Force fit must not land on another layout
  // Rebuild node index first (needed by both paths)
  store.nodeIndex.clear()
  for (let i = 0; i < store.nodes.length; i++) {
    store.nodeIndex.set(store.nodes[i].peer_id, i)
  }

  // Attackers are not in the topology edge list; link them to the meshes they sit in
  // so the force layout places them next to their targets.
  // Pruned attackers have no mesh links left; a weak tether to their last victims keeps them
  // parked beside the cluster (as in the design) instead of drifting off to infinity.
  const attackerLinks: LayoutEdge[] = []
  for (const n of store.nodes) {
    if (n.state !== 'attacker') continue
    const weak = n.connected_peers.length === 0
    for (const t of weak ? (n.last_targets ?? []).slice(0, 2) : n.connected_peers) {
      attackerLinks.push(weak ? [n.peer_id, t, true] : [n.peer_id, t])
    }
  }
  const layoutEdges: LayoutEdge[] = [...store.edges, ...attackerLinks]
    .filter(([s, t]) => store.nodeIndex.has(s) && store.nodeIndex.has(t))

  if (store.layoutMode === 'force') {
    // Live d3-force simulation with Obsidian-like interactive physics.
    // startLiveForce restarts in place and reuses positions for nodes it already knows;
    // calling stopLiveForce() first would wipe that memory and re-seed the whole graph.
    startLiveForce(store.nodes, layoutEdges, (positions) => {
      store.nodePositions = positions
      renderLayers()
    })
    // Initial fitView after warm-up settles
    // Fit once after the warm-up and again once the live sim has settled (it keeps expanding
    // for ~1 s after a cold start), so a layout switch never leaves the graph half framed.
    fitTimers = [setTimeout(() => fitView(), 200), setTimeout(() => fitView(), 1400)]
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

/** Nodes preset active state follows the real count (Render boots 20, DigitalOcean 50). */
function syncNodePreset(n: number) {
  document.querySelectorAll<HTMLElement>('#node-presets .preset-btn').forEach(b => {
    b.classList.toggle('active', Number(b.dataset.nodes) === n)
  })
}

/** Reel mode: menus must not fire requests at a possibly-absent backend. */
function reelGuard(): boolean {
  if (!store.reel) return false
  showFaultFlash('Press 0 to leave the reel first')
  return true
}

async function fetchSnapshot() {
  const snap = await api.simSnapshot()
  if (snap) handleWsSnapshot(snap)
}

async function fetchEdges() {
  const result = await api.topologyEdges()
  if (!result) return
  store.edges = result.edges

  const fullKey = currentTopoKey()
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
    btn.className = 'dd-item lm-dd-col'
    btn.classList.toggle('active', store.activeScenario?.scenario?.id === s.id)
    const row = document.createElement('span'); row.className = 'lm-dd-row'
    const name = document.createElement('span'); name.className = 'lm-dd-name'; name.textContent = s.name
    const aside = document.createElement('span'); aside.className = 'lm-dd-aside'; aside.textContent = `${s.duration}s`
    row.append(name, aside)
    const meta = document.createElement('span'); meta.className = 'lm-dd-meta'; meta.textContent = s.description
    btn.append(row, meta)
    btn.addEventListener('click', async () => {
      setDropdown(dropdown, false)
      if (reelGuard()) return
      leaveGeoForSim()
      await api.scenarioLaunch(s.id, store.simSpeed)
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

  // Real-network arrivals: light the observer up now rather than at the next snapshot
  for (const evt of events) {
    if (evt.event_type !== 'BlockSeen' || !evt.peer_id) continue
    const idx = store.nodeIndex.get(evt.peer_id)
    if (idx === undefined) continue
    if (evt.first) {
      for (const n of store.nodes) if (n.is_real) n.state = 'idle'  // new block: reset the wave
      // Narrate real blocks only where the observers are drawn; in Force/Radial the ticker and log carry them
      if (store.layoutMode === 'geo') caption(`slot ${evt.slot} · block ${String(evt.block_root).slice(0, 10)}… · first seen ${evt.seen_ms} ms (${evt.client || '?'}, ${evt.country || '?'})`)
    }
    store.nodes[idx].state = evt.first ? 'origin' : 'decoded'
    store.nodes[idx].seen_ms = evt.seen_ms as number
  }

  for (const evt of events) {
    // Spawn particles for gossip messages — show message propagation
    if (evt.event_type === 'GossipMessage' && evt.from_peer && evt.to_peer) {
      // One particle per real hop, sender → receiver. The origin publish (no to_peer)
      // draws nothing; its flood relays each carry their own event.
      spawnParticle(evt.from_peer, evt.to_peer, evt.from_peer.startsWith('sybil-') ? 'sybil' : undefined, evt.dropped === true)
    }

    // Spawn particles for graft/prune (mesh changes)
    if ((evt.event_type === 'GossipGraft' || evt.event_type === 'GossipPrune') && evt.from_peer && evt.to_peer) {
      spawnParticle(evt.from_peer, evt.to_peer, evt.event_type === 'GossipGraft' ? 'graft' : 'prune')
    }

    // Spawn particles for DHT queries
    const initiator = evt.initiator as string | undefined
    if (evt.event_type === 'DHTQueryStarted' && initiator) {
      const dhtIdx = store.nodeIndex.get(initiator)
      const node = dhtIdx !== undefined ? store.nodes[dhtIdx] : undefined
      if (node && node.connected_peers.length > 0) {
        const target = node.connected_peers[Math.floor(Math.random() * node.connected_peers.length)]
        spawnParticle(initiator, target, 'dht')
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
            spawnParticle(target, peer, 'fault')
          }
        }
      }
    }

    if (evt.event_type === 'SimulationStateChanged' && !store.reel) {
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
  const fullKey = currentTopoKey()
  if (fullKey !== topoKey) {
    topoKey = fullKey
    recomputeLayout()
  }
}

function handleWsScenario(frame: any) {
  store.activeScenario = frame.active ? frame : null
  buildScenarioDropdown()
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
  renderTicker()
  renderLayers()
  document.dispatchEvent(new CustomEvent('luminar:prefs-applied'))
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
  const manifest = await api.getStatic<ReelMeta[]>('/reels/manifest.json')
  if (!manifest) return
  reelManifest = manifest
  const dd = document.getElementById('reel-dropdown')
  if (!dd) return
  while (dd.firstChild) dd.removeChild(dd.firstChild)
  reelManifest.forEach((r, i) => {
    const btn = document.createElement('button')
    btn.className = 'dd-item'
    btn.dataset.reel = r.name
    const kbd = document.createElement('span'); kbd.className = 'lm-kbd'; kbd.textContent = String(i + 1)
    const name = document.createElement('span'); name.className = 'lm-dd-name'; name.textContent = r.title
    btn.append(kbd, name)
    btn.title = r.blurb ?? ''
    btn.addEventListener('click', () => { setDropdown(dd, false); enterReel(r) })
    dd.appendChild(btn)
  })
  const div = document.createElement('div'); div.className = 'dd-divider'; dd.appendChild(div)
  const live = document.createElement('button')
  live.className = 'dd-item lm-dd-live'
  const kbd0 = document.createElement('span'); kbd0.className = 'lm-kbd'; kbd0.textContent = '0'
  const liveName = document.createElement('span'); liveName.className = 'lm-dd-name'; liveName.textContent = 'Back to live'
  live.append(kbd0, liveName)
  live.addEventListener('click', () => { setDropdown(dd, false); exitReel() })
  dd.appendChild(live)
}

/** #app.reel dims the live-only controls; the reel dropdown marks the playing row. */
function syncReelChrome() {
  document.getElementById('app')?.classList.toggle('reel', !!store.reel)
  document.querySelectorAll<HTMLElement>('#reel-dropdown [data-reel]').forEach(b =>
    b.classList.toggle('active', b.dataset.reel === store.reel?.name))
}

function setDropdown(dd: HTMLElement | null, visible: boolean) {
  if (!dd) return
  dd.style.display = visible ? 'block' : 'none'
  dd.parentElement?.classList.toggle('open', visible)   // .dd-wrap.open drives the trigger + caret
}

async function enterReel(meta: ReelMeta) {
  ws.disconnect()
  applyMainnetStatus(null)  // the reel brings its own status (real reels) or none (sim reels)
  topoKey = ''
  store.playing = false
  const ok = await loadReel(meta, () => { updatePlaybackUI(); renderLayers() })
  if (!ok) { exitReel(); return }
  syncReelChrome()
  updateConnectionStatus(false)
  const url = new URL(location.href)
  url.searchParams.set('reel', meta.name)
  history.replaceState(null, '', url)
}

function exitReel() {
  stopReel()
  syncReelChrome()
  applyMainnetStatus(null)  // a real reel's recorded status must not outlive it
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
    for (const other of all) if (other !== dd) setDropdown(other, false)
    if (dd) setDropdown(dd, dd.style.display === 'none')
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
      setDropdown(faultDD, false)
      if (reelGuard()) return
      leaveGeoForSim()

      // Fire-and-forget — don't await, don't block UI
      switch (action) {
        case 'partition': {
          const peers = store.nodes.filter(isSimPeer).map(n => n.peer_id)
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
          const sel = store.nodes[store.selectedNode]
          const t = sel && isSimPeer(sel) ? sel.peer_id : store.nodes.find(isSimPeer)?.peer_id
          if (t) api.faultEclipse(t, 4)
            .then(() => showFaultFlash(`Eclipse on ${t}`))
          break
        }
        case 'drop': {
          const sel = store.nodes[store.selectedNode]
          const t = sel && isSimPeer(sel) ? sel.peer_id : null
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
    if (!(e.target as HTMLElement).closest('.dd-wrap')) for (const dd of all) setDropdown(dd, false)
  })
}

// ── WebSocket-pushed snapshot handler (replaces HTTP polling) ──
function handleWsSnapshot(snap: any) {
  if (!store.reel) {  // a reel's recorded state/speed describe the recording, not the player
    store.simState = snap.state
    store.simSpeed = snap.speed
  }
  store.simTime = snap.time
  store.nodeCount = snap.node_count
  syncNodePreset(snap.node_count)
  store.eventCount = snap.event_count
  // Selection is remembered by id from the store itself, so every site that clears or sets
  // store.selectedNode (Escape, inspector close, event row, Reset) is honoured on the next frame
  const selectedPeerId = store.selectedNode >= 0 ? store.nodes[store.selectedNode]?.peer_id ?? null : null
  store.nodes = snap.nodes
  store.mesh = snap.gossip?.mesh ?? {}
  // In reel mode the recorded state says nothing about the player; a seek replays a
  // 'running' snapshot while paused and would invert the play/pause toggle.
  store.playing = store.reel ? reelPlaying() : snap.state === 'running'

  // Always rebuild nodeIndex when nodes update
  store.nodeIndex.clear()
  for (let i = 0; i < store.nodes.length; i++) {
    store.nodeIndex.set(store.nodes[i].peer_id, i)
  }
  // Re-resolve the selection by id; drop it if the node is gone
  const resolved = selectedPeerId ? store.nodeIndex.get(selectedPeerId) : undefined
  if (store.selectedNode !== (resolved ?? -1)) {
    store.selectedNode = resolved ?? -1
    if (resolved === undefined) { store.highlightPeers = []; document.dispatchEvent(new CustomEvent('luminar:nodeselect')) }
  }
  // Geo availability follows the node set; the feed auto-selects Geo once observers exist
  maybeAutoGeo()
  updateGeoAvailability()

  // Auto-pause at duration limit (live only)
  if (!store.reel && store.maxDuration > 0 && store.simTime >= store.maxDuration && store.playing) {
    api.simPause()
    store.playing = false
    store.simState = 'paused'
  }

  // Check topology change
  const newTopoKey = currentTopoKey()
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
  applyMainnetStatus(status?.mainnet)
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
  flash.textContent = message
  document.getElementById('map-container')?.appendChild(flash)

  setTimeout(() => flash.remove(), 2000)
}

// ── Preset handlers ──
function initPresets() {
  // Duration presets
  document.querySelectorAll('#duration-presets .preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (reelGuard()) return
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
      if (reelGuard()) return
      leaveGeoForSim()
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
// ── Live mainnet feed (ethPandaOps arrival data) ──
function applyMainnetStatus(m: any) {
  const was = store.mainnet?.enabled ?? false
  store.mainnet = m ?? null
  const on = !!m?.enabled
  document.getElementById('mainnet-badge')?.classList.toggle('active', on)
  const prov = document.getElementById('provenance')
  if (prov) {
    prov.style.display = on ? 'block' : 'none'
    if (on) {
      prov.textContent = ''
      const k = document.createElement('span'); k.className = 'prov-k'; k.textContent = store.reel ? 'RECORDED MAINNET' : 'LIVE MAINNET'
      const v = document.createElement('span'); v.className = 'prov-v'
      const where = store.layoutMode === 'geo' ? '' : ' · shown on the Geo layout'
      v.textContent = `slot ${m.slot ?? '…'} · ${store.reel ? 'recorded' : `T−${m.lag_s ?? 156}s`} · ${m.with_geo ?? m.observers ?? 0} observers${where} · arrival at observer nodes, not mesh paths · data: ethPandaOps (CC BY 4.0)`
      prov.append(k, v)
    }
  }
  if (on && !was) maybeAutoGeo()
  if (!on && was) { geoAutoDone = false; updateGeoAvailability() }
  renderTicker()
}

function setLayoutMode(mode: LayoutMode) {
  if (mode === 'geo' && !hasRealNodes()) mode = 'force'  // Geo is for real observers only
  document.querySelectorAll<HTMLButtonElement>('.mode-tab').forEach(t => t.classList.toggle('active', t.dataset.mode === mode))
  store.layoutMode = mode
  // A node that is not drawn in this view cannot stay selected (no ghost ring, no inspector)
  if (store.selectedNode >= 0 && !isNodeVisible(mode, store.nodes[store.selectedNode])) {
    store.selectedNode = -1
    store.highlightPeers = []
    document.dispatchEvent(new CustomEvent('luminar:nodeselect'))
  }
  recomputeLayout()
  topoKey = currentTopoKey()  // already laid out: the next snapshot must not recompute again
  if (store.mainnet?.enabled) applyMainnetStatus(store.mainnet)
}

/** Placed nodes (mainnet observers, real-trace reel, telemetry peers) are the only ones with coordinates. */
function hasRealNodes(): boolean {
  return store.nodes.some(n => !isSimPeer(n))
}

let layoutBeforeGeo: LayoutMode | null = null
let geoAutoDone = false  // the feed auto-selects Geo once per feed-on, never on later snapshots

/** The feed picks Geo once, as soon as observers exist; a manual pick afterwards wins. */
function maybeAutoGeo() {
  if (!store.mainnet?.enabled || !hasRealNodes() || geoAutoDone) return
  geoAutoDone = true
  if (store.layoutMode !== 'geo') { layoutBeforeGeo = store.layoutMode; setLayoutMode('geo') }
}

/** Called whenever the node set or the feed changes: Geo is offered only while real
 *  observers exist, and leaving that state restores the layout the user had before. */
function updateGeoAvailability() {
  const real = hasRealNodes()
  const tab = document.querySelector<HTMLButtonElement>('.mode-tab[data-mode="geo"]')
  if (tab) {
    tab.disabled = !real
    tab.title = real ? 'Place real observers by latitude/longitude' : 'Geo needs real observers (turn MAINNET on or open a real reel)'
  }
  if (!real && store.layoutMode === 'geo') {
    const back = layoutBeforeGeo ?? 'force'
    layoutBeforeGeo = null
    setLayoutMode(back)
  }
}

/** The simulation is invisible in Geo; a simulated action switches back so it can be seen. */
function leaveGeoForSim() {
  if (store.layoutMode !== 'geo') return
  const back = layoutBeforeGeo ?? 'force'
  layoutBeforeGeo = null
  setLayoutMode(back)
  showFaultFlash('Geo shows real observers only — switched to ' + back)
}

async function toggleMainnet() {
  if (store.reel) { showFaultFlash('Press 0 to leave the reel first'); return }
  const res = await api.liveMainnet(!(store.mainnet?.enabled))
  if (!res) { showFaultFlash('Backend offline'); return }
  applyMainnetStatus(res)
}

// ── URL moments: ?t= (paused sim seconds, reels only) and ?peer= ──
function syncUrlMoment() {
  const url = new URL(location.href)
  const sel = store.selectedNode >= 0 ? store.nodes[store.selectedNode]?.peer_id : undefined
  if (sel) url.searchParams.set('peer', sel); else url.searchParams.delete('peer')
  if (store.reel && !store.playing) url.searchParams.set('t', store.simTime.toFixed(1)); else url.searchParams.delete('t')
  if (url.href !== location.href) history.replaceState(null, '', url)
}

async function shareMoment() {
  syncUrlMoment()
  try { await navigator.clipboard.writeText(location.href); showFaultFlash('Link copied') }
  catch { window.prompt('Copy this link', location.href) }
}

function applyUrlMoment() {
  const q = new URLSearchParams(location.search)
  const t = Number(q.get('t'))
  if (store.reel && q.has('t') && Number.isFinite(t)) seekReelToSimTime(t)
  const peer = q.get('peer')
  if (peer) {
    const idx = store.nodeIndex.get(peer)
    if (idx !== undefined) { store.selectedNode = idx; document.dispatchEvent(new CustomEvent('luminar:nodeselect')); renderLayers() }
  }
}

async function main() {
  // Initialize UI
  initStatsPanel()
  initEventsPanel()
  initPeerInspector()
  initTelemetryPanel()
  initPlayback()
  initKeyboard()
  initDropdowns()
  initPresets()

  // Telemetry badge click → toggle panel
  document.getElementById('telemetry-badge')?.addEventListener('click', toggleTelemetryPanel)
  document.getElementById('mainnet-badge')?.addEventListener('click', () => { void toggleMainnet() })
  document.addEventListener('luminar:share', () => { void shareMoment() })
  document.addEventListener('luminar:sim-action', leaveGeoForSim)
  document.addEventListener('luminar:nodeselect', syncUrlMoment)
  setInterval(syncUrlMoment, 1000)

  // Initialize renderer
  const deckCanvas = document.getElementById('deck-canvas') as HTMLCanvasElement
  const ringCanvas = document.getElementById('ring-canvas') as HTMLCanvasElement
  const tooltipEl = document.getElementById('tooltip')!
  initRenderer(deckCanvas, tooltipEl)
  initOverlay(ringCanvas)
  startAnimationLoop()
  handleResize()

  // Mode switcher
  initModeSwitcher((mode) => {
    layoutBeforeGeo = null  // a manual pick replaces the remembered layout
    setLayoutMode(mode)
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
  initLegend()  // after loadPrefs: the settings toggles are built from the restored prefs
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
  // Offline path: no backend needed at all. A reel that fails to load falls back to live.
  if (reelMeta && await loadReel(reelMeta, () => { updatePlaybackUI(); renderLayers() })) {
    applyUrlMoment()
    updateConnectionStatus(false)
  } else {
    // Live: multiplexed WS (snapshot, metrics, analytics pushed by server)
    ws.connect()

    // Initial data fetch (one-time, then WS takes over)
    await fetchSnapshot()
    await fetchEdges()
    applyUrlMoment()
  }
  await fetchScenarios()

  // Milestone computation runs on a light timer (no HTTP calls)
  const _milestoneInterval = setInterval(() => { computeMilestones() }, 2000)

  console.log('[luminar] P2P Network Monitor initialized — all data via WebSocket')
}

main().catch(console.error)

// ── State ──────────────────────────────────────────────────────────
const state = {
  sim:  { state: 'paused', time: 0, speed: 1, node_count: 0, edge_count: 0, event_count: 0 },
  nodes: new Map(),
  edges: [],
  events: [],
  filterCat: null,
  selectedNodeId: null,
  contextNodeId: null, // Node targeted by right-click
  selectedSpeed: 1,
  drawerOpen: false,
  activeTab: 'dashboard',
  scenarios: [],
  activeScenario: null,
  runningScenario: null,
  activePhaseIdx: -1,
  // Cumulative protocol event counters
  evtCounts: {
    GossipMessage: 0, GossipIHave: 0, GossipIWant: 0,
    GossipGraft: 0, GossipPrune: 0,
    DHTQueryStarted: 0, DHTQueryCompleted: 0,
    FaultInjected: 0, SemaphoreBlocked: 0,
    PeerConnected: 0,
  },
};

// ── WebSocket ───────────────────────────────────────────────────────
let wsReconnectTimer = null;

function connectWS() {
  const ws = new WebSocket(`ws://${location.host}/ws/events`);
  ws.onopen  = () => { clearTimeout(wsReconnectTimer); setStatusDot('live'); setStatusLabel('LIVE'); };
  ws.onclose = () => {
    setStatusDot('offline'); setStatusLabel('OFFLINE');
    wsReconnectTimer = setTimeout(connectWS, 2000);
  };
  ws.onerror = () => ws.close();

  ws.onmessage = (msg) => {
    try {
      const evt = JSON.parse(msg.data);
      if (evt.event_type in state.evtCounts) state.evtCounts[evt.event_type]++;

      switch (evt.event_type) {
        case 'SimulationStateChanged': break;
        case 'PeerConnected': graph.pulseNode(evt.peer_id, 'join'); break;
        case 'GossipGraft':
          graph.flashEdge(evt.from_peer, evt.to_peer, 'var(--cyan)', 600);
          graph.pulseNode(evt.from_peer, 'gossip');
          graph.pulseNode(evt.to_peer,   'gossip');
          break;
        case 'GossipPrune':
          graph.flashEdge(evt.from_peer, evt.to_peer, 'var(--orange)', 400);
          break;
        case 'GossipMessage':
          graph.spawnParticle(evt);
          break;
        case 'DHTQueryStarted':
          graph.pulseNode(evt.initiator, 'dht');
          break;
        case 'DHTQueryCompleted':
          graph.spawnParticle({ from_peer: evt.initiator ?? evt.target, to_peer: evt.target, event_type: 'DHTQueryCompleted' });
          graph.pulseNode(evt.target, 'dht');
          break;
        case 'SemaphoreBlocked':
          graph.pulseNode(evt.peer_id, 'warn');
          break;
        case 'FaultInjected':
          graph.pulseNode(evt.peer_id, 'fault');
          break;
      }
      pushEvent(evt);
    } catch (_) {}
  };
}

// ── DOM helpers ─────────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const $$ = sel => document.querySelectorAll(sel);

function setStatusDot(cls) {
  const d = $('hdr-status-dot');
  if (d) d.className = 'status-dot ' + cls;
}
function setStatusLabel(txt) {
  const el = $('hdr-status-label');
  if (el) el.textContent = txt;
}
function set(id, val) {
  const el = $(id);
  if (el) el.textContent = val;
}

// ── API helpers ──────────────────────────────────────────────────────
async function api(path, opts = {}) {
  const r = await fetch(path, opts);
  if (!r.ok) throw new Error(`API ${path} → ${r.status}`);
  return r.json();
}

// ── Sim state ────────────────────────────────────────────────────────
async function fetchSnapshot() {
  const d = await api('/api/sim/snapshot');
  Object.assign(state.sim, d);
  if (Array.isArray(d.nodes) && d.nodes.length > 0) {
    state.nodes = new Map(d.nodes.map(n => [n.peer_id, n]));
    graph.updateNodes(state.nodes, state.edges);
    updateNetworkNodes();
  }
  const ni = $('nodes-input');
  if (ni && !ni.disabled) ni.value = d.node_count ?? ni.value;
  updateTopbar();
  updateScrubber();
  updateStatusStrip();
  updatePlayBtn();
  updateLeftSidebar();
}

async function fetchNodes() {
  const d = await api('/api/nodes');
  const nodeList = Array.isArray(d.nodes ?? d) ? (d.nodes ?? d) : Object.values(d.nodes ?? d);
  state.nodes = new Map(nodeList.map(n => [n.peer_id, n]));
  graph.updateNodes(state.nodes, state.edges);
  updateNetworkNodes();
}

async function fetchEdges() {
  const d = await api('/api/topology/edges');
  state.edges = d.edges;
  graph.updateNodes(state.nodes, state.edges);
}

// ── UI Updates ───────────────────────────────────────────────────────
function updateTopbar() {
  const s = state.sim;
  set('hdr-node-count',  s.node_count  ?? 0);
  set('hdr-event-count', s.event_count ?? 0);
  set('hdr-time', (s.time ?? 0).toFixed(2) + 's');
}

function updateStatusStrip() {
  const strip = $('status-strip');
  if (strip) strip.className = state.sim.state === 'running' ? 'running' : state.sim.state === 'paused' ? 'paused' : '';
  setStatusDot(state.sim.state === 'running' ? 'live' : state.sim.state === 'paused' ? 'paused' : 'stopped');
}

function updatePlayBtn() {
  const btn = $('btn-play');
  if (!btn) return;
  if (state.sim.state === 'running') {
    btn.textContent = '⏸ PAUSE'; btn.classList.add('active');
  } else {
    btn.textContent = '▶ START'; btn.classList.remove('active');
  }
}

function updateNetworkNodes() {
  const nodes = Array.from(state.nodes.values());
  set('mn-total', nodes.length);
  const sm = {};
  for (const n of nodes) sm[n.state] = (sm[n.state] ?? 0) + 1;
  ['decoded','receiving','origin','failed','idle'].forEach(s => set('mn-' + s, sm[s] ?? 0));
}

function updateLeftSidebar() {
  const s = state.sim;
  set('gm-mesh', s.gossip?.mesh_size ?? 0);

  const nodes = Array.from(state.nodes.values());
  const totalSent = nodes.reduce((acc, n) => acc + (n.messages_sent ?? 0), 0);
  const totalRecv = nodes.reduce((acc, n) => acc + (n.messages_received ?? 0), 0);
  set('dc-sent', totalSent);
  set('dc-recv', totalRecv);
  set('dc-gossip', state.evtCounts.GossipMessage);
  set('dc-ihave',  state.evtCounts.GossipIHave);
  set('dc-dht',    state.evtCounts.DHTQueryStarted);
  
  const bytes = state.evtCounts.GossipMessage * 512;
  set('dc-bytes', bytes > 1048576 ? (bytes / 1048576).toFixed(2) + ' MB' : bytes > 1024 ? (bytes / 1024).toFixed(1) + ' KB' : bytes + ' B');

  set('gm-grafts',    state.evtCounts.GossipGraft);
  set('gm-prunes',    state.evtCounts.GossipPrune);
  set('gm-semaphore', state.evtCounts.SemaphoreBlocked);
}

// ── Scrubber ─────────────────────────────────────────────────────────
function updateScrubber() {
  const maxT = Math.max(120, Math.ceil(state.sim.time / 30) * 30 + 30);
  const pct  = (state.sim.time / maxT) * 100;
  const fill = $('scrub-fill'), head = $('scrub-head'), lbl = $('scrub-time-lbl');
  if (fill) fill.style.width = pct + '%';
  if (head) head.style.left  = pct + '%';
  if (lbl)  lbl.textContent  = state.sim.time.toFixed(2) + 's / ' + maxT + 's';
  const stateEl = $('scrub-state');
  if (stateEl) {
    const icons = { running: '● LIVE', paused: '⏸ PAUSED', stopped: '■ STOPPED' };
    stateEl.textContent = icons[state.sim.state] ?? '■';
    stateEl.style.color = state.sim.state === 'running' ? 'var(--green)' :
                          state.sim.state === 'paused'  ? 'var(--amber)' : 'var(--text-muted)';
  }
}

function initScrubber() {
  const track = $('scrub-track');
  if (!track) return;
  track.addEventListener('click', e => {
    const rect = track.getBoundingClientRect();
    const pct  = (e.clientX - rect.left) / rect.width;
    const maxT = Math.max(120, Math.ceil(state.sim.time / 30) * 30 + 30);
    api('/api/sim/seek', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ time: pct * maxT }),
    }).then(fetchSnapshot);
  });
}

// ── Playback & Config ────────────────────────────────────────────────
async function doPlay() {
  if (state.sim.state === 'running') await api('/api/sim/pause', { method: 'POST' });
  else await api('/api/sim/play', { method: 'POST' });
  await fetchSnapshot();
}

async function doReset() {
  await api('/api/sim/reset', { method: 'POST' });
  state.events = [];
  for (const k in state.evtCounts) state.evtCounts[k] = 0;
  renderEventTable();
  await fetchSnapshot();
  await fetchEdges();
}

async function applyNodeCount() {
  const input = $('nodes-input');
  if (!input) return;
  const n = parseInt(input.value, 10);
  try {
    await api('/api/sim/reconfigure', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ n_nodes: n }),
    });
    await doReset();
  } catch (e) { console.error(e); }
}

async function setSpeed(v) {
  state.sim.speed = v;
  await api('/api/sim/speed', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ speed: v }),
  });
}

// ── Fault Injection ──────────────────────────────────────────────────
async function injectFault(type, peerId = null) {
  console.log(`Injecting ${type} on ${peerId || 'network'}`);
  try {
    switch (type) {
      case 'drop':
        if (!peerId) {
          alert('Please select a node to drop traffic');
          return;
        }
        await api('/api/fault/drop', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ peer_id: peerId }),
        });
        if (peerId) graph.pulseNode(peerId, 'fault');
        break;
      case 'partition':
        // Would need node selection UI, for now inject default partition
        await api('/api/fault/partition', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ group_a: [], group_b: [] }),
        });
        break;
      case 'sybil':
        await api('/api/fault/sybil', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ n_attackers: 5, target_topic: "lumina/blocks/1.0" }),
        });
        break;
      case 'eclipse':
        // Would need target node selection UI
        await api('/api/fault/eclipse', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ target_peer_id: "", n_attackers: 4 }),
        });
        break;
      default:
        console.warn('Unknown fault type:', type);
    }
  } catch (e) { console.error('Fault injection failed:', e); }
}

// ── Tabs & Navigation ────────────────────────────────────────────────
function switchTab(tab) {
  state.activeTab = tab;
  $$('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
  $$('.tab-view').forEach(v => v.classList.toggle('active', v.id === 'view-' + tab));
}

function toggleDrawer(force) {
  state.drawerOpen = force !== undefined ? !!force : !state.drawerOpen;
  const drawer = $('scenario-drawer');
  if (drawer) drawer.classList.toggle('open', state.drawerOpen);
}

// ── Event Log ────────────────────────────────────────────────────────
const MAX_EVENTS = 500;
function pushEvent(evt) {
  state.events.unshift(evt);
  if (state.events.length > MAX_EVENTS) state.events.length = MAX_EVENTS;
  renderEventTable();
  updateTopbar();
}

function renderEventTable() {
  const list = $('event-list');
  if (!list) return;
  const filtered = state.filterCat ? state.events.filter(e => e.category === state.filterCat) : state.events;

  const shortType = t => {
    const map = {
      PeerConnected: 'peer connected', GossipMessage: 'gossip msg', GossipGraft: 'mesh graft',
      GossipPrune: 'mesh prune', DHTQueryStarted: 'dht query', DHTQueryCompleted: 'dht done',
      FaultInjected: 'fault injected', SemaphoreBlocked: 'blocked',
    };
    return map[t] || (t || '').toLowerCase();
  };

  list.innerHTML = filtered.slice(0, 100).map(evt => {
    const nodeId = (evt.peer_id ?? evt.from_peer ?? evt.initiator ?? '').slice(-4);
    return `<div class="evt-row cat-${evt.category ?? ''}" onclick="selectNode('${evt.peer_id || evt.from_peer || evt.initiator}')">
      <span class="evt-time">${(evt.at ?? 0).toFixed(2)}s</span>
      <span class="evt-node">${nodeId ? 'p-' + nodeId : '—'}</span>
      <span class="evt-type">${shortType(evt.event_type)}</span>
    </div>`;
  }).join('');
}

function setFilter(cat) {
  state.filterCat = cat;
  $$('.filter-btn').forEach(b => b.classList.toggle('active', b.dataset.cat == cat));
  renderEventTable();
}

// ── Rates & Sparklines ──────────────────────────────────────────────
const sparkData = { throughput: [], eventRate: [] };
let lastEvtCount = 0, lastMsgCount = 0;

function updateRates() {
  const curEvt = state.events.length;
  const curMsg = state.evtCounts.GossipMessage;
  const evtRate = (curEvt - lastEvtCount) * 2;
  const msgRate = (curMsg - lastMsgCount) * 2;
  lastEvtCount = curEvt; lastMsgCount = curMsg;

  sparkData.throughput.push(msgRate);
  sparkData.eventRate.push(evtRate);
  if (sparkData.throughput.length > 40) sparkData.throughput.shift();
  if (sparkData.eventRate.length  > 40) sparkData.eventRate.shift();

  set('metric-throughput', msgRate.toFixed(1));
  set('metric-evt-rate',   evtRate.toFixed(1));
  drawSpark('spark-throughput', sparkData.throughput, '#0ea5e9');
  drawSpark('spark-eventrate',  sparkData.eventRate,  '#10b981');
}

function drawSpark(id, data, color) {
  const canvas = $(id); if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const W = canvas.width = canvas.offsetWidth, H = canvas.height = canvas.offsetHeight;
  if (!W || !H || data.length < 2) return;
  ctx.clearRect(0,0,W,H);
  const max = Math.max(...data, 1);
  ctx.beginPath();
  data.forEach((v, i) => {
    const x = i * (W / (data.length - 1)), y = H - (v / max) * H * 0.85;
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.stroke();
  ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.fillStyle = color + '20'; ctx.fill();
}

// ── Scenarios ────────────────────────────────────────────────────────
async function fetchScenarios() {
  try {
    const d = await api('/api/scenarios');
    state.scenarios = d.scenarios ?? [];
    const container = $('scenario-cards');
    if (container) {
      container.innerHTML = state.scenarios.map(s => `
        <div class="scenario-card ${s.id === state.activeScenario?.id ? 'selected' : ''}" onclick="selectScenario('${s.id}')">
          <div style="display:flex;align-items:center;gap:8px">
            <span class="scenario-icon">${s.icon || '◈'}</span>
            <span class="scenario-name">${s.name}</span>
          </div>
          <div class="scenario-desc">${s.description}</div>
          <div class="scenario-meta">Duration: ${s.duration}s | Topology: ${s.topology_type}</div>
        </div>`).join('');
    }
  } catch (e) {
    console.error('Failed to fetch scenarios:', e);
  }
}

function selectScenario(id) {
  state.activeScenario = state.scenarios.find(s => s.id === id);
  fetchScenarios();
}

async function launchScenario() {
  if (!state.activeScenario) return;
  try {
    const d = await api(`/api/scenarios/${state.activeScenario.id}/launch`, { method: 'POST' });
    console.log('Scenario launched:', d);
    toggleDrawer(false);
    await fetchSnapshot();
  } catch (e) {
    console.error('Failed to launch scenario:', e);
  }
}

async function fetchActiveScenario() {
  try {
    const d = await api('/api/scenarios/active');
    if (d.active && d.scenario) {
      state.runningScenario = d;
      updateScenarioIndicator(d);
    } else {
      state.runningScenario = null;
      updateScenarioIndicator(null);
    }
  } catch (e) {
    // Fail silently — not critical if this endpoint is slow
  }
}

function updateScenarioIndicator(scenarioStatus) {
  const indicator = $('scenario-indicator');
  if (!indicator) return;
  
  if (!scenarioStatus || !scenarioStatus.active) {
    indicator.style.display = 'none';
    return;
  }
  
  const scenario = scenarioStatus.scenario;
  const nextPhase = scenarioStatus.next_phase_label;
  const allDone = scenarioStatus.all_phases_done;
  
  const nameBadge = $('scenario-indicator .scenario-name-badge');
  const phaseText = $('scenario-indicator .phase-text');
  
  if (nameBadge) {
    nameBadge.textContent = scenario.name || 'Scenario';
  }
  
  if (phaseText) {
    if (allDone) {
      phaseText.textContent = '✓ All phases done';
    } else if (nextPhase) {
      const nextTime = scenarioStatus.next_phase_at ?? 0;
      phaseText.textContent = `T+${nextTime.toFixed(1)}s: ${nextPhase}`;
    } else {
      phaseText.textContent = 'Awaiting phases...';
    }
  }
  
  indicator.style.display = 'flex';
}

// ── Node Inspector ───────────────────────────────────────────────────
function selectNode(id) {
  state.selectedNodeId = id;
  graph.updateVisuals();
  if (!id) { $('node-inspector').classList.remove('visible'); return; }
  
  const node = state.nodes.get(id);
  const panel = $('node-inspector');
  if (!node || !panel) return;

  const peerChips = (node.connected_peers ?? []).map(p => 
    `<span class="peer-chip" onclick="selectNode('${p}')">${p.slice(-6)}</span>`
  ).join('');

  panel.innerHTML = `
    <div class="insp-id-box">
      <span class="insp-peer-id">${id.slice(0,12)}…</span>
      <span class="insp-state" style="color:var(--${node.state === 'decoded' ? 'green' : node.state === 'receiving' ? 'blue' : 'text-muted'})">${node.state}</span>
    </div>
    <div class="insp-grid">
      <div class="insp-metric"><div class="insp-label">Peers</div><div class="insp-value">${(node.connected_peers ?? []).length}</div></div>
      <div class="insp-metric"><div class="insp-label">Messages Sent</div><div class="insp-value">${node.messages_sent ?? 0}</div></div>
      <div class="insp-metric"><div class="insp-label">Messages Recv</div><div class="insp-value">${node.messages_received ?? 0}</div></div>
      <div class="insp-metric"><div class="insp-label">Gossip Score</div><div class="insp-value">${(node.gossip_score ?? 0).toFixed(3)}</div></div>
      <div class="insp-metric" style="grid-column: span 2">
        <div class="insp-label">Connections</div>
        <div class="peer-chips">${peerChips || 'none'}</div>
      </div>
    </div>`;
  panel.classList.add('visible');
}

// ── Graph Component ──────────────────────────────────────────────────
const graph = (() => {
  const COLORS = { idle:'#334155', origin:'#0ea5e9', decoded:'#10b981', receiving:'#3b82f6', failed:'#ef4444', error:'#a855f7' };
  let svg, rootG, linkG, particleG, nodeG, simulation, nodesMap = new Map(), particles = [];

  function init() {
    const area = $('graph-area'); if (!area) return;
    svg = d3.select('#graph-svg');
    const zoom = d3.zoom().scaleExtent([0.1, 10]).on('zoom', e => rootG.attr('transform', e.transform));
    svg.call(zoom);
    rootG = svg.append('g');
    linkG = rootG.append('g'); particleG = rootG.append('g'); nodeG = rootG.append('g');

    simulation = d3.forceSimulation()
      .force('link', d3.forceLink().id(d => d.id).distance(70))
      .force('charge', d3.forceManyBody().strength(-150))
      .force('center', d3.forceCenter(area.clientWidth/2, area.clientHeight/2))
      .on('tick', () => {
        linkG.selectAll('line').attr('x1', d => d.source.x).attr('y1', d => d.source.y).attr('x2', d => d.target.x).attr('y2', d => d.target.y);
        nodeG.selectAll('circle').attr('cx', d => d.x).attr('cy', d => d.y);
      });

    svg.on('click', () => { selectNode(null); hideContextMenu(); });
    animParticles();
  }

  function updateNodes(nodesIn, edgesIn) {
    if (!simulation) return;
    const d3Nodes = Array.from(nodesIn.values()).map(n => {
      const ex = nodesMap.get(n.peer_id);
      return { id: n.peer_id, ...n, x: ex?.x, y: ex?.y };
    });
    nodesMap = new Map(d3Nodes.map(n => [n.id, n]));
    const d3Links = edgesIn.map(([s, t]) => ({ source: s, target: t })).filter(l => nodesMap.has(l.source) && nodesMap.has(l.target));

    const ln = linkG.selectAll('line').data(d3Links, d => `${d.source}<>${d.target}`);
    ln.exit().remove();
    ln.enter().append('line').attr('stroke', 'rgba(255,255,255,0.05)').attr('stroke-width', 1);

    const nd = nodeG.selectAll('circle').data(d3Nodes, d => d.id);
    nd.exit().remove();
    nd.enter().append('circle').attr('r', 5).attr('cursor', 'pointer')
      .on('click', (e, d) => { e.stopPropagation(); selectNode(d.id); hideContextMenu(); })
      .on('contextmenu', (e, d) => { e.preventDefault(); showContextMenu(e.pageX, e.pageY, d.id); })
      .call(d3.drag().on('start', dragstarted).on('drag', dragged).on('end', dragended));

    updateVisuals();
    simulation.nodes(d3Nodes); simulation.force('link').links(d3Links);
    simulation.alpha(0.3).restart();
  }

  function updateVisuals() {
    nodeG.selectAll('circle')
      .attr('fill', d => COLORS[d.state] || COLORS.idle)
      .attr('stroke', d => d.id === state.selectedNodeId ? 'var(--cyan)' : 'none')
      .attr('stroke-width', 2)
      .attr('opacity', d => state.selectedNodeId ? (d.id === state.selectedNodeId ? 1 : 0.3) : 1);
  }

  function showContextMenu(x, y, id) {
    state.contextNodeId = id;
    const menu = $('node-context-menu');
    menu.style.display = 'block'; menu.style.left = x + 'px'; menu.style.top = y + 'px';
  }
  function hideContextMenu() { $('node-context-menu').style.display = 'none'; }

  function spawnParticle(evt) {
    const s = nodesMap.get(evt.from_peer || evt.peer_id), t = nodesMap.get(evt.to_peer);
    if (s && t) particles.push({ s, t, p: 0, c: evt.event_type === 'GossipMessage' ? 'var(--green)' : 'var(--purple)' });
  }

  function animParticles() {
    const loop = () => {
      particles = particles.filter(p => (p.p += 0.02) < 1);
      const ps = particleG.selectAll('circle').data(particles);
      ps.exit().remove();
      ps.enter().append('circle').attr('r', 2).attr('fill', d => d.c);
      particleG.selectAll('circle').attr('cx', d => d.s.x + (d.t.x - d.s.x) * d.p).attr('cy', d => d.s.y + (d.t.y - d.s.y) * d.p).attr('opacity', d => 1 - d.p);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  function pulseNode(id, type) {
    const n = nodesMap.get(id); if (!n) return;
    nodeG.append('circle').attr('cx', n.x).attr('cy', n.y).attr('r', 5).attr('fill', 'none').attr('stroke', 'var(--cyan)').attr('stroke-width', 2)
      .transition().duration(800).attr('r', 25).attr('opacity', 0).remove();
  }

  function dragstarted(e, d) { if (!e.active) simulation.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; }
  function dragged(e, d) { d.fx = e.x; d.fy = e.y; }
  function dragended(e, d) { if (!e.active) simulation.alphaTarget(0); d.fx = null; d.fy = null; }

  return { init, updateNodes, updateVisuals, pulseNode, spawnParticle, fitView: () => svg.transition().call(zoom.transform, d3.zoomIdentity) };
})();

// ── Boot ─────────────────────────────────────────────────────────────
window.doPlay = doPlay; window.doReset = doReset; window.setSpeed = setSpeed;
window.applyNodeCount = applyNodeCount; window.toggleDrawer = toggleDrawer;
window.launchScenario = launchScenario; window.selectScenario = selectScenario;
window.setFilter = setFilter; window.switchTab = switchTab; window.selectNode = selectNode;
window.injectFault = injectFault; window.setGlobalLatency = setGlobalLatency;
window.graph = graph;

document.addEventListener('DOMContentLoaded', () => {
  graph.init(); initScrubber();
  fetchSnapshot(); fetchNodes(); fetchEdges(); fetchScenarios();
  connectWS(); 
  setInterval(() => { 
    fetchSnapshot(); updateRates(); fetchActiveScenario(); 
  }, 500);  // Faster polling for scenario progress (was 1000ms)
});

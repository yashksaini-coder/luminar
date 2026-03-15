# 5. Frontend Design

## 5.1 Technology Choices

| Technology | Version | Purpose |
|------------|---------|---------|
| Angular | 19 | Component framework (standalone components, signals) |
| TypeScript | 5.x | Type-safe JavaScript |
| D3.js | v7 | Force-directed graph visualization |
| ECharts | v5 | Metrics charts (bar, line, area, sparkline) |
| ngx-echarts | Latest | Angular ECharts integration |
| Angular CDK | 19 | Virtual scrolling for event log |
| Tailwind CSS | 4 | Utility-first CSS framework |
| JetBrains Mono | — | Monospace font for data displays |

### Why Angular 19 with Signals?

Angular 19 introduced **signals** as a reactive primitive, replacing the need for state management libraries like NgRx for simple to moderate state. Lumina manages ~15 signals across 10 services — simple enough that NgRx would add unnecessary complexity.

**Signals vs NgRx comparison for this project:**
| Aspect | Signals | NgRx |
|--------|---------|------|
| Boilerplate | Minimal (just `signal()`) | Actions, reducers, selectors, effects |
| State count | 15 pieces — ideal for signals | Overkill for 15 pieces |
| Learning curve | Low | High |
| Devtools | Browser console | Redux DevTools |
| Performance | Fine-grained reactivity | Store-wide change detection |

## 5.2 Application Shell

### Root Layout (`app.component.ts`)

The application uses a CSS Grid layout with 5 rows:

```
┌─────────────────────────────────────────────────┐
│  Status Strip (2px) — colored by sim state      │
├─────────────────────────────────────────────────┤
│  Header — controls, counters, export            │
├─────────────────────────────────────────────────┤
│  Tab Bar — Dashboard | Gossip | Topo | Fault |  │
├─────────────────────────────────────────────────┤
│                                                 │
│            Router Outlet (1fr)                   │
│         (feature components render here)        │
│                                                 │
├─────────────────────────────────────────────────┤
│  Scrubber — timeline, density bars, playhead    │
└─────────────────────────────────────────────────┘
```

```css
:host {
  display: grid;
  grid-template-rows: 2px auto 36px 1fr 32px;
  height: 100vh;
}
```

### Header Component

Displays simulation controls and status:

```
┌─●──────┬───────────┬──────────────────┬──────┬──────┬───────┐
│ status │ 20 nodes  │  ▶  ⏸  ⏹  1×  │ 45.2s│Export│ Load  │
│  dot   │ 1.2k evts │                  │      │  ▼  │       │
└────────┴───────────┴──────────────────┴──────┴──────┴───────┘
```

- **Status dot**: Green pulse (running), amber static (paused), gray (stopped)
- **Counters**: Live node count and event count from signals
- **Controls**: Play, Pause, Reset buttons; speed selector (0.5×–10×)
- **Time**: Current simulation time in monospace font
- **Export**: Dropdown — Snapshot (JSON), Events (JSONL), Events (JSON)
- **Load**: File input for importing events

### Tab Bar Component

Five navigation tabs with route highlighting:

```
◈ Dashboard  │  ⚡ Gossip  │  ◇ Topology  │  ⚠ Fault  │  → Trace
```

Uses `routerLinkActive` for cyan underline on active tab.

### Scrubber Component

Timeline bar at the bottom with event density visualization:

```
┌────────────────────────────────────────────────────────────┐
│ ● REC │ ██▁▃█▅▂▇▃▅██▁▃▂▅▇███▂▃│▁▅▇                │ 45.2s │
│       │                        ◆                    │/ 120s │
└────────────────────────────────────────────────────────────┘
         ▲ density bars (canvas)  ▲ playhead (cyan)
```

- **Density bars**: 60-bucket histogram drawn on canvas, showing event concentration over time
- **Playhead**: Cyan marker at current time position
- **Drag to seek**: Mouse drag calls `sim.seek(time)` for timeline scrubbing
- **State indicator**: `● REC` (running), `⏸ PAUSED`, `■ STOP`

## 5.3 Service Architecture

### State Flow Diagram

```
                        WebSocket (binary)
                             │
                     ┌───────┴────────┐
                     │ WebSocketService│
                     │  connected: sig │
                     └───┬────┬───┬───┘
                         │    │   │
            ┌────────────┘    │   └─────────────┐
            ▼                 ▼                  ▼
   ┌─────────────┐   ┌──────────────┐   ┌────────────┐
   │  Simulation  │   │    Node      │   │   Event    │
   │   Service    │   │   Service    │   │  Service   │
   │              │   │              │   │            │
   │ state: sig   │   │ nodes: sig   │   │ events: sig│
   │ time: sig    │   │ edges: sig   │   │ filter: sig│
   │ speed: sig   │   │ selected: sig│   │            │
   │ connected:sig│   │              │   │ 10k ring   │
   └──────────────┘   └──────────────┘   └────────────┘
            │
   ┌────────┴─────────┬──────────────┬──────────────┐
   ▼                  ▼              ▼              ▼
┌────────┐    ┌──────────┐   ┌──────────┐   ┌──────────┐
│ Gossip │    │ Topology │   │  Fault   │   │  Trace   │
│Service │    │ Service  │   │ Service  │   │ Service  │
│        │    │          │   │          │   │          │
│mesh:sig│    │type: sig │   │active:sig│   │traces:sig│
│scores  │    │preview   │   │lastError │   │selected  │
│analyti │    │metrics   │   │          │   │detail    │
└────────┘    └──────────┘   └──────────┘   └──────────┘
```

### WebSocket Service — Event Processing Pipeline

```typescript
// 1. Connect
const url = `${proto}//${location.host}/ws/events`;
this.ws = new WebSocket(url);
this.ws.binaryType = 'arraybuffer';

// 2. Receive binary → decode → parse
this.ws.onmessage = (msg) => {
  let data: SimEvent;
  if (msg.data instanceof ArrayBuffer) {
    data = JSON.parse(new TextDecoder().decode(msg.data));
  } else {
    data = JSON.parse(msg.data);
  }

  // 3. Route to services
  this.processEvent(data);  // → sim + node state updates
  this.batch.push(data);     // → 50ms batch to event log
};

// 4. Batch flush every 50ms
setInterval(() => {
  if (this.batch.length > 0) {
    const b = this.batch.splice(0);
    this.zone.run(() => this.events.addBatch(b));
  }
}, 50);
```

### Node Service — Polling Strategy

```typescript
startPolling() {
  this.zone.runOutsideAngular(() => {
    // Poll every 500ms (outside Angular zone for performance)
    interval(500).subscribe(() => {
      this.http.get<PeerNode[]>('/api/nodes').subscribe(nodes => {
        this.zone.run(() => {
          const map = new Map<string, PeerNode>();
          nodes.forEach(n => map.set(n.peer_id, n));
          this.nodes.set(map);
        });
      });
    });
  });
}
```

**Why poll instead of WebSocket?** Individual node state (connected peers list, message counts) changes frequently but is only needed at display refresh rate. Polling at 500ms is simpler and avoids flooding the event stream with node-specific updates.

## 5.4 Feature Components

### Dashboard — Network Graph (`network-graph.component.ts`)

The most complex component — a D3.js force-directed graph rendered outside Angular's change detection.

#### Architecture

```
Angular Component
│
├── ngAfterViewInit()
│   ├── Create SVG with D3
│   ├── Create force simulation
│   │   ├── d3.forceLink() — edges as springs
│   │   ├── d3.forceManyBody() — node repulsion
│   │   └── d3.forceCenter() — center gravity
│   ├── Create zoom behavior
│   └── Start RAF (requestAnimationFrame) loop
│
├── effect(() => { ... }, { injector })
│   ├── Watch nodes signal → update D3 node data
│   └── Watch edges signal → update D3 link data
│
└── RAF loop (runs at 60fps outside Angular zone)
    ├── Update node positions from simulation
    ├── Update node colors from state
    ├── Animate message particles
    └── Render to SVG
```

#### Node Coloring

| State | Color | Meaning |
|-------|-------|---------|
| idle | `#8b949e` (gray) | Connected but inactive |
| origin | `#00d4ff` (cyan) | Publishing a message |
| receiving | `#4299e1` (blue) | Receiving a message |
| decoded | `#39ff14` (green) | Successfully decoded |
| error | `#bf40bf` (purple) | Stream error/timeout |
| joining | `#ffb700` (amber) | Joining network |
| failed | `#ff3b3b` (red) | Crashed/dropped |

#### Particle Animation

When a GossipMessage event arrives, a particle is spawned on the corresponding edge:

```typescript
// Spawn particle on edge
const particle = {
  edge: [fromNode, toNode],
  progress: 0,       // 0 to 1
  speed: 0.02,       // Progress per frame
  color: '#00d4ff',
};

// Animate in RAF loop
particles.forEach(p => {
  p.progress += p.speed;
  const x = lerp(p.edge[0].x, p.edge[1].x, p.progress);
  const y = lerp(p.edge[0].y, p.edge[1].y, p.progress);
  ctx.fillStyle = p.color;
  ctx.beginPath();
  ctx.arc(x, y, 3, 0, Math.PI * 2);
  ctx.fill();
});
```

#### D3 + Angular Integration Pattern

D3 must own the SVG DOM (for force simulation). Angular must not touch SVG internals. The bridge uses:

1. **`runOutsideAngular()`** — RAF loop and D3 simulation run outside Angular zone (no unnecessary change detection)
2. **`effect()` with explicit `Injector`** — Watches Angular signals and triggers D3 data updates
3. **`zone.run()`** — Only enters Angular zone for signal reads/writes

```typescript
// In ngAfterViewInit (runs outside constructor injection context)
effect(() => {
  const nodeList = this.nodeService.nodeList();
  // Update D3 node data
  this.updateNodes(nodeList);
}, { injector: this.injector });  // Explicit injector required
```

### Dashboard — Event Log (`event-log.component.ts`)

Virtual scrolling event list using Angular CDK:

```html
<cdk-virtual-scroll-viewport itemSize="24" class="h-full">
  <div *cdkVirtualFor="let event of filteredEvents()" class="event-row">
    <span class="dot" [style.background]="categoryColor(event)"></span>
    <span class="time mono">{{ event.at | number:'1.2-2' }}</span>
    <span class="type">{{ event.event_type }}</span>
    <span class="id mono">{{ event.peer_id || event.from_peer }}</span>
  </div>
</cdk-virtual-scroll-viewport>
```

**Features:**
- **Virtual scrolling**: Only renders visible rows (24px each), handles 10k+ events
- **Category filtering**: Buttons for All, Connection, Stream, DHT, Gossip, Fault, Health
- **Auto-scroll**: Sticks to bottom when new events arrive
- **Jump to latest**: Button appears when user scrolls up
- **Flash animation**: New rows flash briefly (cyan highlight → transparent)

### Dashboard — Metrics Panel (`metrics-panel.component.ts`)

ECharts sparkline charts for real-time metrics:

```typescript
// Throughput sparkline configuration
throughputOptions = {
  xAxis: { show: false, data: timeLabels },
  yAxis: { show: false },
  series: [{
    type: 'line',
    data: throughputValues,
    areaStyle: { color: 'rgba(0, 212, 255, 0.1)' },
    lineStyle: { color: '#00d4ff', width: 1 },
    smooth: true,
  }],
  grid: { top: 0, right: 0, bottom: 0, left: 0 },
};
```

### Gossip Feature (`gossip.component.ts`)

GossipSub analytics with three chart types:

1. **Peer Scores Bar Chart**: Horizontal bars showing each peer's total score
2. **Message Propagation Area Chart**: Time-series of delivery counts
3. **Latency CDF Line Chart**: Cumulative distribution of propagation latency

### Topology Feature (`topology.component.ts`)

Interactive topology generator:

```
┌─────────────┐  ┌───────────────────────────────────────────────┐
│ Topology     │  │  Parameters                                   │
│ Types        │  │  ┌──────────┐ ┌──────────┐ ┌──────────┐      │
│              │  │  │ Nodes: 20│ │ p: 0.15  │ │ m: 2     │      │
│ ● random     │  │  └──────────┘ └──────────┘ └──────────┘      │
│ ○ scale_free │  │                                               │
│ ○ small_world│  │  [ PREVIEW ]  [ APPLY ]                       │
│ ○ clustered  │  │                                               │
│ ○ ring       │  ├───────────────────────────────────────────────┤
│ ○ star       │  │  Metrics                                      │
│ ○ tree       │  │  Nodes: 20   Edges: 27   Density: 0.142      │
│ ○ complete   │  │  Clustering: 0.43  Diameter: 4                │
│              │  │  Avg Path: 2.3  Connectivity: 0.89            │
│              │  ├───────────────────────────────────────────────┤
│              │  │  Degree Distribution                           │
│              │  │  ▇▅▃▂▁▁                                       │
│              │  │  1 2 3 4 5 6 (degree)                          │
└─────────────┘  └───────────────────────────────────────────────┘
```

### Fault Feature (`fault.component.ts`)

Dynamic form that changes based on selected fault type:

| Fault Type | Form Fields |
|------------|-------------|
| Latency | Peer A, Peer B, Latency (ms), Jitter (ms) |
| Partition | Group A (comma-separated), Group B (comma-separated) |
| Drop | Peer ID |
| Sybil | Number of attackers, Target topic |
| Eclipse | Target peer ID, Number of attackers |

### Trace Feature (`trace.component.ts`)

Message propagation trace viewer:

```
┌─────────────┐  ┌───────────────────────────────────────────────┐
│ Overview     │  │  Trace Detail                                  │
│ Messages: 42 │  │                                               │
│ Avg deliv: 18│  │  Origin: peer-07    Topic: lumina-topic       │
│ Avg hops: 3.2│  │  Delivered: 18/20   Total hops: 54           │
│              │  │                                               │
│ Recent       │  │  Hop Table                                    │
│ ─────────── │  │  ┌────┬──────────┬─────────┬────────┐         │
│ msg-a1b2    │  │  │Hop │  Peer    │Latency  │ Time   │         │
│  3 hops → 18│  │  ├────┼──────────┼─────────┼────────┤         │
│ msg-c3d4    │  │  │ 1  │ peer-03  │  12ms   │ 0.42s  │         │
│  2 hops → 20│  │  │ 2  │ peer-11  │  45ms   │ 0.87s  │         │
│ msg-e5f6    │  │  │ 3  │ peer-19  │   8ms   │ 1.12s  │         │
│  4 hops → 15│  │  └────┴──────────┴─────────┴────────┘         │
└─────────────┘  └───────────────────────────────────────────────┘
```

## 5.5 Bloomberg Dark Theme

### Design Philosophy

The UI is inspired by Bloomberg Terminal and NOC (Network Operations Center) displays:

- **Dark base** (`#08090d`): Reduces eye strain during extended monitoring
- **Cyan accent** (`#00d4ff`): High contrast on dark background, evokes "tech" aesthetic
- **Sharp corners**: No border-radius — industrial, professional feel
- **Glass panels**: `backdrop-filter: blur()` with low-opacity backgrounds
- **Monospace data**: JetBrains Mono with `font-variant-numeric: tabular-nums` for aligned columns

### CSS Custom Properties

```css
:root {
  /* Backgrounds (darkest to lightest) */
  --bg-base:    #08090d;
  --bg-card:    #0e1117;
  --bg-panel:   #121620;
  --bg-surface: #181d28;
  --bg-hover:   #1e2433;

  /* Accent Colors */
  --cyan:   #00d4ff;    /* Primary accent */
  --amber:  #ffb700;    /* Warning */
  --red:    #ff3b3b;    /* Error/danger */
  --green:  #39ff14;    /* Success */
  --purple: #bf40bf;    /* Secondary */
  --blue:   #4299e1;    /* Info */

  /* Text */
  --text-primary:   #e6edf3;
  --text-secondary: #8b949e;
  --text-muted:     #484f58;

  /* Typography */
  --font-mono: 'JetBrains Mono', monospace;
  --font-sans: 'Inter', sans-serif;
}
```

### Animations

| Animation | Duration | Purpose |
|-----------|----------|---------|
| `pulse-dot` | 2s infinite | Status indicator pulse (running state) |
| `row-flash` | 0.6s ease-out | New event log entry highlight |
| `glow-pulse` | 2s infinite | Selected node glow effect |
| `status-sweep` | 2s infinite | Header status strip gradient sweep |

## 5.6 Routing

```typescript
export const routes: Routes = [
  { path: '', component: MainDashboardComponent },
  { path: 'gossip', loadComponent: () =>
      import('./features/gossip/gossip.component').then(m => m.GossipComponent) },
  { path: 'topology', loadComponent: () =>
      import('./features/topology/topology.component').then(m => m.TopologyComponent) },
  { path: 'fault', loadComponent: () =>
      import('./features/fault/fault.component').then(m => m.FaultComponent) },
  { path: 'trace', loadComponent: () =>
      import('./features/trace/trace.component').then(m => m.TraceComponent) },
];
```

**Lazy loading**: Only the dashboard loads eagerly. Gossip, Topology, Fault, and Trace are lazy-loaded on navigation, reducing initial bundle size.

### Bundle Analysis

| Chunk | Size | Contents |
|-------|------|----------|
| main.js | 92.6 KB | Core app + dashboard |
| polyfills.js | 89.8 KB | Browser polyfills |
| styles.css | 21.3 KB | Tailwind + theme |
| fault-component | 31.8 KB | Fault injection feature |
| topology-component | 25.6 KB | Topology feature |
| gossip-component | 20.9 KB | Gossip feature |
| trace-component | 19.1 KB | Trace feature |
| **Total** | **~207 KB initial** | Well under 2MB budget |

## 5.7 Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Space` | Toggle play/pause |
| `+` / `=` | Increase speed |
| `-` | Decrease speed |
| `R` | Reset simulation |

Implemented in `KeyboardService` with global `keydown` listener, respecting input focus (shortcuts disabled when typing in form fields).

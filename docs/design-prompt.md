# Luminar — design brief for Claude Design

## What this is
Luminar is a real-time simulator of libp2p GossipSub v1.1, the peer-to-peer protocol under
Ethereum's beacon chain. It runs 20 to 500 simulated peers, lets you inject attacks (Sybil,
Eclipse, partition, drop, latency), and shows the mesh react: messages ripple across the
graph, attackers get scored and pruned, the mesh heals. It will be demoed on stage and at a
booth at Devcon 8 (Ethereum, Mumbai, 3–6 Nov 2026), and runs as a public web app.

Design the product UI for this app. The current build is a dark, monospace "network
operations" dashboard; it works but reads as generic. I want a distinctive, confident
visual system that still feels like an engineering instrument, not a marketing site.

## Audience
Protocol engineers (Lighthouse, Prysm, ProbeLab, EF researchers), Ethereum developers at a
conference, and people watching from row 10 of a talk. Two viewing distances matter: a
laptop at arm's length, and a projector across a room.

## Screens and layout (keep this information architecture)
1. **Main screen**, three columns: left statistics panel (node state counts, messages,
   gossip analytics, a delivery-CDF chart, milestones, event categories, infrastructure
   gauges); centre WebGL network map; right event log (dense rows: time, peer, 2-letter
   event code, detail; category filter chips).
2. **Toolbar** across the top: brand, connection status (OFFLINE / LIVE / REEL · title),
   Scenarios dropdown, Reels dropdown, Inject Fault dropdown, Duration presets
   (1m 2m 5m 10m), Nodes presets (20 50 100 200 500), sim clock, GitHub link.
3. **Timeline bar** floating at the bottom of the map: reset, play/pause, scrubber with
   coloured "wash bands" marking scenario phases, current/total time, speed presets
   (0.5x to 10x).
4. **Map overlays**: layout switcher (Force / Grid / Radial), legend with a settings gear
   (toggles: particles, labels, edges, stage theme, hero layout), tooltip on hover, a
   4-second caption card for narrated moments ("First Sybil pruned by score at T+11.9s").
5. **Peer inspector**, a right-side drawer over the event log: name, state badge, peer id,
   sent/received/score metrics, score-history sparkline, connected-peer chips, live events.
6. **Telemetry panel**, a left slide-in listing real peers reporting in, with a curl hint.
7. **Hero layout** (stage mode): side panels hidden, map full width, a bottom ticker strip
   with phase, delivery %, mesh degree, hops, end-to-end latency, attacker and invalid
   message counts.
8. **Stage theme**: everything ~30% larger with higher-contrast secondary text, readable
   from the back of a room.

## The network map is the hero; design its visual language
- Node fill encodes state: idle, origin (just published), receiving, decoded, joining,
  failed, error, attacker (Sybil / Eclipse). A pruned attacker turns grey: this is the
  on-screen proof that peer scoring worked, make it legible at a glance.
- Two kinds of edge: faint physical topology links, and the brighter live GossipSub mesh
  overlay on top. They must be distinguishable without a legend.
- Message particles travel sender-to-receiver along a slightly bowed path; dropped hops
  stall at 60% and fade. Pulse discs on state change. Rings: selected (white), hovered
  peers, real telemetry peers (breathing), event-highlight targets.
- Three layouts: force-directed (organic), grid (sorted by state), radial (hubs centred).
- Up to 500 nodes on screen; density and colour must survive that.

## Tone
Precise, calm, a little severe. Think flight-deck instrument, oscilloscope, Bloomberg
terminal at night, not neon cyberpunk. Red is reserved for attackers and failures. One
accent colour for "the live mesh". Numbers tabular. No gradients for decoration.

## Hard constraints (the implementation is already built, design must map onto it)
- Vanilla TypeScript + plain DOM + CSS, no React/Vue. Deliver tokens as CSS custom
  properties (OKLCH colours welcome), component styles as plain CSS classes.
- Dark mode only for now; a light theme is optional and must not drive the design.
- Monospace UI font is a must (currently JetBrains Mono, self-hosted). Pick a pairing
  only if it adds something.
- The map is a deck.gl WebGL canvas; everything on it is drawn from data, so specify
  colours/sizes per state and per layer, not as images.
- Must work at 1280×720 (projector), 1440×900 and 1920×1080; phone is out of scope.
- Keyboard-driven: Space, f, Esc, 0–3, t, h. Show shortcut hints where it helps.
- Accessibility: visible focus rings, ≥4.5:1 for all secondary text in stage theme,
  reduced-motion respected (particles off).

## Deliverables
1. Design tokens: colour (chrome + 8 node states + edge/mesh/particle), type scale,
   spacing, radii, elevation, motion durations.
2. The main screen in normal and stage/hero modes, with a Sybil attack in progress.
3. Component sheet: toolbar + dropdowns, preset button groups, timeline bar with wash
   bands, legend/settings, inspector drawer, event-log rows and filter chips, caption
   card, ticker strip, tooltip, status pill (offline/live/reel).
4. Map legend and the node-state palette as a swatch sheet with the pruned-attacker rule.
5. One "attract" frame for the booth: the map alone with a one-line call to action.

## Tech stack (for reference)
**Frontend**: TypeScript 5.7, Vite 6, vanilla DOM (no framework), deck.gl 9.2 + luma.gl 9.1
(WebGL map), d3-force 3 (layout), culori 4 (OKLCH colour math), @fontsource/jetbrains-mono
(bundled), Canvas 2D for sparklines/charts, CSS custom properties, single global store
object, one multiplexed WebSocket at 20 Hz, offline "reels" (recorded frame streams
replayed client-side).
**Backend**: Python 3.12, FastAPI + uvicorn (asyncio) for HTTP/WS, Trio for the simulation
loop on a background thread, NetworkX + NumPy (topology generators), pydantic v2, orjson.
GossipSub v1.1 model with P1–P4 peer scoring, fault injector, scenario runner, telemetry
ingest for real peers, OpenTelemetry export (OTLP/JSON traces to Jaeger, Prometheus
`/metrics` with Lighthouse's metric names).
**Tooling / ops**: uv, ruff, pytest-trio (117 tests), tsc, GitHub Actions CI, single
Docker image (Render free tier, DigitalOcean App Platform), laptop observability stack via
docker compose (Jaeger 2.22, Prometheus 3.5, Grafana 12 with a provisioned dashboard).

## Reference material in the repo
`docs/ui.md` (complete UI reference with layer order, colours and every control),
`assets/ui-main-*.jpeg` (current UI screenshots), `frontend/src/style.css` and
`frontend/src/palette.ts` (current tokens), `frontend/index.html` (current DOM).

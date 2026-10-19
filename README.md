# Luminar

> Real-time P2P network simulator with live visualization of GossipSub, DHT, and fault injection.

<p align="center">
  <img src="https://skillicons.dev/icons?i=python,fastapi,typescript,vite,d3,docker&theme=dark" alt="Tech Stack" />
</p>

<p align="center">
  <img src="https://img.shields.io/badge/python-3.12+-3776AB?logo=python&logoColor=white" alt="Python" />
  <img src="https://img.shields.io/badge/TypeScript-5.7+-3178C6?logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/license-MIT-green" alt="License" />
</p>

## Overview

Luminar simulates **py-libp2p peers** running GossipSub v1.1, DHT, and stream protocols — making internal protocol state visible in real time. Instead of deploying dozens of real nodes, spin up a local simulation and watch gossip propagation, peer scoring, and fault tolerance in a single dashboard.

### Features

- **Real-time WebGL visualization** — deck.gl network graph with live node states and message particle animations
- **GossipSub v1.1** — P1-P4 peer scoring, mesh management (GRAFT/PRUNE), IHAVE/IWANT, message traces
- **Fault injection** — Partition, Sybil, Eclipse, Drop — watch degradation and recovery
- **Live analytics** — Delivery CDF, gossip metrics, peer scores, millisecond event log
- **Interactive layouts** — Force (d3-force with Obsidian-like physics), Radial, Geo (world map for real observers)
- **Single WebSocket** — Events, snapshots, metrics, analytics multiplexed at 20Hz

## Quick Start

```bash
git clone https://github.com/yashksaini-coder/luminar
cd luminar

make install   # Install Python + Node dependencies
make dev       # Start backend (:8000) + frontend (:5173)
```

Open **http://localhost:5173** — click Play and watch the network come alive.

## Architecture

**Frontend** (`:5173`) — TypeScript · deck.gl (WebGL) · d3-force · Canvas 2D · Vite

**Backend** (`:8000`) — Python 3.12 · FastAPI · Trio · NetworkX

| Backend Module | Purpose |
|---------------|---------|
| `simulation/` | Engine, Clock (play/pause/seek/speed), NodePool (2-500 peers) |
| `gossip/` | GossipSub v1.1, P1-P4 scoring, message traces, delivery analytics |
| `fault/` | Latency, partition, sybil, eclipse, drop injection |
| `topology/` | 8 generators (random, scale-free, small-world, ring, star, tree, complete, clustered) |
| `events/` | EventBus with 500K ring buffer, 18 typed event classes |
| `concurrency/` | StreamManager (sem=64), DHTQueryCoordinator (sem=8) |
| `scenarios/` | Pre-built experiments with timed phase sequences |

## Usage

| Control | Options |
|---------|---------|
| **Speed** | 0.5x · 1x · 2x · 3x · 5x · 10x |
| **Duration** | 1m · 2m · 5m · 10m (auto-pause) |
| **Nodes** | 20 · 50 · 100 · 200 · 500 |
| **Layout** | Force · Radial · Geo |
| **Keyboard** | `Space` play/pause · `f` fit view · `Esc` deselect |

### Fault Injection

| Fault | Effect |
|-------|--------|
| **Partition** | Splits network, blocks cross-group messages |
| **Sybil** | Injects fake peers that spam the mesh |
| **Eclipse** | Isolates target peer with attacker connections |
| **Drop** | Removes a peer entirely |

### API

Swagger UI at **http://localhost:8000/docs**. Key endpoints:

```
POST /api/sim/play                    Start simulation
POST /api/sim/reconfigure             Change node count
POST /api/fault/partition             Inject network partition
GET  /api/gossip/analytics            Delivery ratios, latency CDF
GET  /api/scenarios                   List scripted scenarios
POST /api/scenarios/{id}/launch       Launch one; GET /api/scenarios/active
GET  /metrics                         Prometheus text (Lighthouse gossipsub_* names)
GET  /api/otel/status                 OTLP trace-export status
WS   /ws/events                       Multiplexed event stream (20Hz)
WS   /ws/events?record=<name>         Also record a reel (only with LUMINAR_ALLOW_RECORD=1)
```

### Live mainnet block wave

Click **MAINNET** in the toolbar (or start the backend with `LUMINAR_MAINNET_FEED=1`) and
the map switches to the **Geo** layout and shows the real network: every 12 s the block of
a slot that started ~2.5 min ago lights up ~150 real observer nodes in the order they saw
it, with the first sighting, p50 and spread in the narrator and ticker. Data: ethPandaOps'
public arrival data (Xatu, CC BY 4.0). It is arrival at observer nodes, not gossip mesh
paths, and the API is undocumented infrastructure; the feed polls once per slot and
degrades to "no data". An offline twin for the booth:

```bash
uv run python scripts/mainnet_to_reel.py --slots 8 --out mainnet-block-wave
```

writes a reel of eight real slots and registers it in the Reels menu.

### Reels (offline replay)

A reel is a recorded WebSocket frame stream replayed client-side, so a demo works with
no backend and no Wi-Fi. Open **Reels** in the toolbar, press `1`–`3`, or load one by URL (add `&t=12.5&peer=sybil-0` to land on a paused moment; `s` copies the current one):
`http://localhost:5173/?reel=sybil-eclipse`. `0` returns to live.

Record a new one against a backend started with `LUMINAR_ALLOW_RECORD=1` (recording is off by
default; never enable it on a public deploy). The pool is reconfigured, the scenario launched
at 1x, and the file validated for dropped events:

```bash
uv run python scripts/record_reel.py record sybil-eclipse demo_sybil_eclipse --nodes 50 --duration 40 --min-score-prunes 1
uv run python scripts/record_reel.py check frontend/public/reels/sybil-eclipse.jsonl
```

Shipped reels live in `frontend/public/reels/` with their `manifest.json`.

## Development

```bash
make install     # Install all dependencies
make dev         # Start backend + frontend
make test        # Run backend tests
make lint        # Ruff linter
make typecheck   # TypeScript check
make build       # Production frontend build
make check       # All checks (lint + test + typecheck + build)
make clean       # Remove build artifacts
```

## Documentation

| Doc | Content |
|-----|---------|
| [`docs/architecture.md`](docs/architecture.md) | System design, threading model, data flow |
| [`docs/backend.md`](docs/backend.md) | Backend modules, simulation engine, event system |
| [`docs/protocols.md`](docs/protocols.md) | GossipSub v1.1, DHT, peer scoring algorithms |
| [`docs/deployment.md`](docs/deployment.md) | Docker, environment variables, production setup |


## 💖 Support

If you find this project helpful, please consider:

<div align="center">

[![Buy Me A Coffee](https://img.shields.io/badge/Buy%20Me%20A%20Coffee-Support-yellow?style=for-the-badge&logo=buy-me-a-coffee)](https://buymeacoffee.com/yashksaini)
[![PayPal](https://img.shields.io/badge/PayPal-Donate-blue?style=for-the-badge&logo=paypal)](https://paypal.me/yashksaini)
[![GitHub Sponsors](https://img.shields.io/badge/GitHub%20Sponsors-Support-pink?style=for-the-badge&logo=github)](https://github.com/sponsors/yashksaini-coder)
    
**⭐ Star this repository** | **🐛 Report a bug** | **💡 Request a feature**

</div>

---

<div align="center">

Made with ❤️ by [Your Name](https://github.com/username)

[![Yash K. Saini](https://img.shields.io/badge/Portfolio-Visit-blue?style=flat&logo=google-chrome)](https://www.yashksaini.systems/)
[![LinkedIn](https://img.shields.io/badge/LinkedIn-Follow-blue?style=flat&logo=linkedin)](https://www.linkedin.com/in/yashksaini/)
[![Twitter](https://img.shields.io/badge/Twitter-Follow-blue?style=flat&logo=twitter)](https://x.com/0xCracked_dev)
[![GitHub](https://img.shields.io/badge/GitHub-Follow-black?style=flat&logo=github)](https://github.com/yashksaini-coder)

</div>
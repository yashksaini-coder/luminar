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
- **Interactive layouts** — Force (d3-force with Obsidian-like physics), Grid, Radial
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

**Backend** (`:8000`) — Python 3.12 · FastAPI · Trio · py-libp2p · NetworkX

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
| **Layout** | Force · Grid · Radial |
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
POST /api/sim/play              Start simulation
POST /api/sim/reconfigure       Change node count
POST /api/fault/partition       Inject network partition
GET  /api/gossip/analytics      Delivery ratios, latency CDF
WS   /ws/events                 Multiplexed event stream (20Hz)
```

## Development

```bash
make install     # Install all dependencies
make dev         # Start backend + frontend
make test        # Run 62 backend tests
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
| [`docs/api.md`](docs/api.md) | REST + WebSocket API reference |
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
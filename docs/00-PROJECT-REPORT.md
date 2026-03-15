# Lumina P2P Network Operations Simulator

## Project Case Report — Final Examination Documentation

---

**Project Title:** Lumina — Local-First, Replay-Capable P2P Network Simulator with Real-Time NOC-Style Visualization

**Domain:** Distributed Systems, Peer-to-Peer Networking, Network Operations

**Tech Stack:** Python 3.12 (FastAPI, Trio, py-libp2p, NetworkX) + Angular 19 (D3.js, ECharts, Tailwind CSS 4)

---

## Table of Contents

| # | Document | Description |
|---|----------|-------------|
| 1 | [01-INTRODUCTION.md](01-INTRODUCTION.md) | Problem statement, objectives, scope, motivation |
| 2 | [02-LITERATURE-REVIEW.md](02-LITERATURE-REVIEW.md) | Background on P2P protocols, GossipSub, DHT, libp2p |
| 3 | [03-SYSTEM-ARCHITECTURE.md](03-SYSTEM-ARCHITECTURE.md) | High-level architecture, component diagram, data flow |
| 4 | [04-BACKEND-DESIGN.md](04-BACKEND-DESIGN.md) | Backend modules: simulation engine, events, concurrency, gossip, topology, faults |
| 5 | [05-FRONTEND-DESIGN.md](05-FRONTEND-DESIGN.md) | Angular 19 frontend: services, components, visualization, theme |
| 6 | [06-API-REFERENCE.md](06-API-REFERENCE.md) | Complete REST + WebSocket API documentation |
| 7 | [07-ALGORITHMS-AND-PROTOCOLS.md](07-ALGORITHMS-AND-PROTOCOLS.md) | GossipSub v1.1, peer scoring, DHT queries, fault injection |
| 8 | [08-TESTING-STRATEGY.md](08-TESTING-STRATEGY.md) | Testing methodology, test cases, stress tests |
| 9 | [09-DEPLOYMENT-GUIDE.md](09-DEPLOYMENT-GUIDE.md) | Installation, Docker, configuration, start script |
| 10 | [10-RESULTS-AND-ANALYSIS.md](10-RESULTS-AND-ANALYSIS.md) | Outcomes, performance, screenshots, observations |
| 11 | [11-CONCLUSION.md](11-CONCLUSION.md) | Summary, learnings, future work, references |

---

## Quick Start

```bash
# Clone and install
git clone <repo-url> && cd P2P-NOPS-Simulator
uv sync                              # Python dependencies
cd frontend-ng && npm install && cd ..  # Frontend dependencies

# Run
./start.sh                           # Backend :8000 + Frontend :4200
./start.sh --nodes 50                # Custom node count

# Or Docker
docker-compose up
```

**Access:** http://localhost:4200

---

*Each document in this series is self-contained and can be read independently. Start with the Introduction for an overview, or jump to any specific section as needed.*

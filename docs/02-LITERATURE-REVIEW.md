# 2. Literature Review & Background

## 2.1 Peer-to-Peer Networking

Peer-to-peer (P2P) networks are distributed systems where participants (peers) communicate directly without a central server. Unlike client-server architectures, P2P networks are:

- **Decentralized**: No single point of failure or control
- **Self-organizing**: Peers join and leave dynamically; the network adapts
- **Scalable**: Adding peers increases capacity rather than load

### Historical Context
| Generation | Era | Examples | Innovation |
|-----------|-----|----------|------------|
| 1st | 1999–2001 | Napster | Central directory, P2P transfer |
| 2nd | 2001–2004 | Gnutella, BitTorrent | Fully decentralized, DHT |
| 3rd | 2014–present | IPFS, Ethereum, Filecoin | Modular protocols (libp2p) |

## 2.2 libp2p — Modular P2P Framework

libp2p is a modular networking stack extracted from IPFS and now used by Ethereum 2.0, Polkadot, and Filecoin. It provides:

- **Transport**: TCP, QUIC, WebSocket, WebRTC
- **Security**: TLS 1.3, Noise Protocol
- **Multiplexing**: mplex, yamux (multiple logical streams over one connection)
- **Discovery**: mDNS (local), Kademlia DHT (global), bootstrap nodes
- **Pub/Sub**: FloodSub, GossipSub (optimized gossip protocol)

### Why libp2p matters for this project
Lumina simulates py-libp2p (Python implementation) to make these internal protocol layers visible. Each simulated peer has a peer ID, maintains connections, opens streams, participates in DHT queries, and subscribes to GossipSub topics.

## 2.3 GossipSub v1.1

GossipSub is the publish-subscribe protocol used by Ethereum 2.0 for block and attestation propagation. It combines **eager push** (mesh overlay) with **lazy pull** (gossip about message IDs) for bandwidth efficiency.

### Core Concepts

**Mesh Overlay**: Each peer maintains a mesh of D peers (default D=6) per topic. Messages are eagerly forwarded to mesh peers.

**Gossip**: Peers periodically send IHAVE messages (message IDs they've seen) to D_LAZY random peers outside the mesh. Recipients can request missing messages with IWANT.

**Heartbeat**: Every 1 second, each peer:
1. Checks mesh degree: if below D_LOW (4), sends GRAFT to add peers; if above D_HIGH (8), sends PRUNE to remove peers
2. Gossips IHAVE to D_LAZY (6) random peers
3. Decays peer scores

### Mesh Operations
```
GRAFT: "Add me to your mesh for topic X"
  → Sent when mesh degree drops below D_LOW
  → Rejected if sender's score < threshold

PRUNE: "Remove me from your mesh for topic X"
  → Sent when mesh degree exceeds D_HIGH
  → Includes backoff timer to prevent immediate re-grafting
```

### Protocol Parameters (used in Lumina)
| Parameter | Value | Description |
|-----------|-------|-------------|
| D | 6 | Target mesh degree |
| D_LOW | 4 | Minimum mesh degree (triggers GRAFT) |
| D_HIGH | 8 | Maximum mesh degree (triggers PRUNE) |
| D_LAZY | 6 | Number of gossip (IHAVE) peers |
| Heartbeat interval | 1s | Mesh maintenance frequency |

## 2.4 Peer Scoring (GossipSub v1.1)

GossipSub v1.1 introduced a peer scoring system to defend against attacks. Each peer computes a score for every other peer based on four parameters:

### Score Parameters

**P1 — Time in Mesh**: Rewards peers that maintain stable mesh connections.
```
P1 = min(time_in_mesh / quantum, cap) × weight
```
- Weight: +0.5, Cap: 10.0
- Incentivizes long-lived connections

**P2 — First Message Deliveries**: Rewards peers that deliver messages before anyone else.
```
P2 = first_deliveries × weight (decayed each heartbeat × 0.9)
```
- Weight: +1.0
- Incentivizes fast, unique content delivery

**P3 — Mesh Message Delivery Ratio**: Penalizes peers that don't forward enough messages.
```
P3 = weight × (delivery_ratio < threshold ? -1 : 0)
```
- Weight: -1.0, Threshold: 0.5
- Activates after 5 seconds in mesh
- Penalizes free-riders

**P4 — Invalid Messages**: Heavily penalizes peers that send invalid/corrupt messages.
```
P4 = invalid_count × weight (decayed each heartbeat × 0.5)
```
- Weight: -10.0
- Primary defense against malicious peers

### Score Thresholds
- **GRAFT threshold** (-5.0): Peers below this score cannot graft into mesh
- **PRUNE threshold** (-10.0): Peers below this are actively pruned from mesh

## 2.5 Distributed Hash Tables (Kademlia)

Kademlia DHT is used for peer discovery in libp2p. Key concepts:

- **XOR distance**: Distance between two peer IDs = XOR of their hashes
- **k-buckets**: Each peer maintains routing tables organized by distance
- **Lookup**: Iterative queries to progressively closer peers
- **Complexity**: O(log n) hops to find any peer in network of n peers

### DHT Challenges (addressed by Lumina)
1. **Query hangs**: find_peer can block indefinitely if target is unreachable
2. **Resource exhaustion**: Parallel queries can overwhelm semaphores
3. **Timeout cascading**: One slow query blocks subsequent queries

Lumina's DHTQueryCoordinator addresses all three with semaphore-bounded parallelism, per-query timeouts, and exponential backoff with jitter.

## 2.6 Network Topology Models

The structure of a P2P network significantly affects protocol performance. Lumina supports 8 topology models from graph theory:

| Topology | Model | Key Property | Real-World Analogue |
|----------|-------|--------------|-------------------|
| Random (Erdős–Rényi) | G(n,p) | Uniform connectivity | Internet backbone |
| Scale-Free (Barabási–Albert) | Preferential attachment | Hub nodes, power-law degree | Social networks, WWW |
| Small-World (Watts–Strogatz) | Rewired ring | Short paths + clustering | Human social networks |
| Clustered (Stochastic Block) | Block model | Community structure | Organization networks |
| Ring | Circular | Regular, predictable | Token ring networks |
| Star | Hub-spoke | Single point of failure | Client-server hybrid |
| Tree | Hierarchical | No cycles | DNS hierarchy |
| Complete | K_n | Maximum redundancy | Small coordination groups |

### Why topology matters
- **Scale-free networks** are resilient to random failures but vulnerable to targeted hub attacks
- **Small-world networks** achieve fast propagation (short average path length) with local clustering
- **Clustered networks** demonstrate how partitions affect cross-group communication

## 2.7 Fault Injection & Chaos Engineering

Chaos engineering (pioneered by Netflix's Chaos Monkey) involves deliberately introducing failures to test system resilience. Lumina implements five fault types relevant to P2P networks:

| Fault | Description | P2P Impact |
|-------|-------------|------------|
| Latency | Add delay between peers | Increased propagation time, score degradation |
| Partition | Split network into groups | Message isolation, mesh fragmentation |
| Drop | Crash a peer | Reduced redundancy, mesh rebalancing |
| Sybil | Inject fake peers | Mesh pollution, score manipulation |
| Eclipse | Isolate peer via attackers | Complete information control over target |

## 2.8 Related Work

| Tool | Focus | Limitation (addressed by Lumina) |
|------|-------|----------------------------------|
| PeerSim | Large-scale P2P simulation | No real-time visualization, Java-only |
| Shadow | Network simulation with real code | Heavy (needs Linux kernel), no web UI |
| Testground | libp2p testing at scale | Requires Docker cluster, no single-machine |
| ns-3 | General network simulation | Low-level, steep learning curve |
| **Lumina** | **Protocol visualization + fault injection** | **Single-machine, web UI, event sourcing** |

Lumina fills the gap between heavyweight simulation frameworks and simple protocol demos by providing an interactive, visual, single-machine simulator with production-grade frontend.

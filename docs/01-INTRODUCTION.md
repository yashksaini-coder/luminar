# 1. Introduction

## 1.1 Problem Statement

Peer-to-peer (P2P) networking protocols such as GossipSub, Kademlia DHT, and libp2p stream multiplexing are foundational to modern decentralized systems — powering Ethereum 2.0 consensus, IPFS file distribution, and Filecoin storage markets. However, these protocols operate at scale with complex emergent behaviors that are:

- **Invisible**: Internal state (mesh topology, peer scores, message propagation paths) is hidden inside running nodes
- **Hard to reproduce**: Real P2P networks require dozens of machines; local testing is impractical
- **Difficult to debug**: Race conditions, resource exhaustion, and partition behavior are non-deterministic
- **Under-documented**: Students and researchers lack interactive tools to explore protocol mechanics

There exists a gap between theoretical understanding of P2P protocols and practical, hands-on exploration of their behavior under controlled conditions.

## 1.2 Objectives

Lumina P2P Simulator addresses these challenges with the following objectives:

1. **Simulate realistic P2P behavior** — Model py-libp2p peers with DHT queries, GossipSub messaging, stream management, and peer scoring in a single-machine environment
2. **Make protocol state visible** — Provide a real-time NOC (Network Operations Center) style dashboard showing topology, message flow, peer scores, and event streams
3. **Enable fault injection** — Allow users to inject network partitions, latency, node crashes, Sybil attacks, and eclipse attacks to study protocol resilience
4. **Support replay and scrubbing** — Record all events for post-hoc analysis with timeline scrubbing
5. **Provide topology experimentation** — Let users generate and apply different network topologies (random, scale-free, small-world, clustered) and observe how protocol behavior changes

## 1.3 Scope

### In Scope
- Simulation of 10–200 P2P nodes on a single machine
- GossipSub v1.1 message propagation with peer scoring (P1–P4)
- Kademlia-style DHT queries with timeout, retry, and backoff
- Stream multiplexing with semaphore-bounded concurrency
- 8 topology types (random, scale-free, small-world, clustered, ring, star, tree, complete)
- 5 fault injection types (latency, partition, drop, sybil, eclipse)
- Real-time web dashboard with force-directed graph visualization
- Event sourcing with JSONL export/import for replay
- REST API + WebSocket for programmatic access

### Out of Scope
- Actual network I/O between machines (all communication is in-process)
- Blockchain consensus mechanisms (Lumina focuses on the networking layer)
- Mobile or native desktop clients
- Production deployment as a monitoring tool

## 1.4 Motivation

This project was motivated by the difficulty of understanding P2P protocol behavior through documentation alone. Key motivating scenarios:

- **Educational**: A student reading the GossipSub spec cannot easily see how mesh rebalancing works, how peer scores decay, or how message propagation changes under partition. Lumina makes this visual and interactive.
- **Research**: Researchers studying network resilience need to inject faults (partitions, Sybil attacks) and measure propagation latency, delivery ratio, and score distributions. Lumina provides these metrics in real-time.
- **Development**: Developers building on libp2p need to understand concurrency limits (stream semaphores, DHT parallelism) and how their choices affect performance. Lumina visualizes resource utilization.

## 1.5 Key Contributions

1. **Event-sourced simulation architecture** — All state is derived from a typed event stream, enabling replay, scrubbing, and export
2. **Two-semaphore concurrency model** — Separate rate limiting for streams (libp2p layer) and DHT queries (application layer) prevents resource starvation
3. **Real-time force-directed visualization** — D3.js graph with animated message particles, node state coloring, and heatmap overlays
4. **Comprehensive fault injection** — Five attack types with real-time visualization of their network-wide effects
5. **Bloomberg-inspired dark theme** — Professional NOC-style interface designed for extended monitoring sessions

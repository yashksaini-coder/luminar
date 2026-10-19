# Luminar as a live-network lens — research note (2026-10-19)

How the Solana Consensus Lab (SCL) earns "interactive, paper-faithful, side by side", what
Luminar already has, what is missing, and how to turn Luminar into a tool that shows a
*real* network's activity next to the simulated one. Sources: SCL at commit `107d958`,
Luminar branch `feat/redesign`, and the live-data survey below (every external claim was
fetched on 2026-10-19; unverified items are marked).

## 1. Why SCL's claim works: one chain, six links

| Link | SCL device | What it buys |
|---|---|---|
| 1 | Seeded discrete-event engine, total event order `(at, seq)`, integer µs time, whole sim serialisable; determinism is a property test over every builtin scenario | Same scenario + seed ⇒ byte-identical trace in CLI and browser |
| 2 | Everything observable is one `TraceEvent` union; UI, CLI, metrics and tests consume only it | "The animation cannot lie about the protocol"; every number in copy is the same number |
| 3 | A designated hero object (tx 0) with 8 fixed stages emitted by both protocols; UI shows first-time-reached per stage and latency from inclusion | A narrative spine the audience follows; comparable across protocols |
| 4 | One display clock draining two time-indexed event buffers; the clock stalls rather than skips; backward seek = re-simulate to t | Honest compare mode, scrub both ways, step one event |
| 5 | Declarative triggers that clamp the display clock on the exact event; lessons = predict → run → reveal with live numbers in the copy | The strongest stage device; "at 451 ms" is exact |
| 6 | URL moments (`seed`, `t` while paused, node, lesson step), a "how faithful is it" table in four places, prerendered guide pages | QR to a microsecond; reviewers can tell modelled from simplified |

Links 2 to 6 are cheap only because link 1 exists. Luminar has link 2 (typed events on one
bus with sinks), a partial 6 (reel/theme/hero URL params, the honesty line), and none of
1, 3, 4, 5.

**Luminar is not deterministic** and this is the root constraint: module-level `random`
in the engine, node pool, injector and DHT coordinator; `uuid4` fault ids; a wall-clock
`SimulationClock` that ticks after `trio.sleep`; relays that really sleep; a scenario
runner that polls every 200 ms. Smallest fix (about 1.5 days): one `random.Random(seed)`
on the engine threaded into every consumer, counters instead of uuids, and
`trio.testing.MockClock` for the headless recorder/CLI/tests (keep the wall clock for the
live demo). Even then trio shuffles equal-time wakeups, so either stamp events with a
per-run `seq` and compare sets per `at`, or set trio's private deterministic-scheduling
flag. Until that lands, keep saying "reproducible recordings", never "identical runs".

**What Luminar already does better than SCL**: adversaries that exist and are visible
(synthetic attackers, P4 spam, score-reason PRUNE, silent eclipse); observability out
(OTLP/JSON to Jaeger, Prometheus under Lighthouse names, Grafana stack); telemetry in;
frame-exact offline reels; 500-node scale; live fault injection by hand; the phase
narrator. SCL has no attack lab and no observability.

## 2. The live-network opportunity, and the one thing it changes

SCL's hero object is imaginary: a transaction in a 25-validator model. Luminar's hero
object can be **real**: a mainnet beacon block is one GossipSub message on one topic,
once every 12 s, and its arrival is publicly observed at about 150 nodes worldwide. So the
side-by-side Luminar can offer is not "protocol A vs protocol B" but **predicted vs
observed**: the simulator's wave for a block of that size on the left, the real network's
arrival wave for the same `block_root` on the right, on one stage timeline (first seen →
50 % → 95 % of observers → the 4 s attestation deadline).

That framing survives the community's two hard warnings:
- Vantage-point bias dominates every real-data post (Hermes got itself PRUNEd for not
  validating; ProbeLab could not separate client speed from where each client timestamps).
  So label whose view it is, and never merge sim and real into one graph. Solana's own
  Alpenglow page does exactly this: live mainnet cubes, modelled counterfactual, a note.
- Real gossip is aggregate-dominated (over 90 % of unique messages are attestation
  aggregates; Xatu ingests about 1.35 M events/min). Per-message animation of the raw feed
  is impossible at 20 Hz; the community's live idiom is heatmaps and CDFs. But `beacon_block`
  alone is one message per slot, which Luminar's particle system handles trivially.

## 3. What data exists (verified 2026-10-19)

| Source | What you get | Latency | Cost | Per-message hops? |
|---|---|---|---|---|
| ethPandaOps CBT API `fct_block_first_seen_by_node` (behind lab.ethpandaops.io) | ~150 rows per slot: hashed node id, client, lat/lon, `seen_slot_start_diff` ms, source (`block_gossip` event or `libp2p_gossipsub_beacon_block`) | ~2 min after slot start | HTTP, no key; **undocumented, no ToS or rate limit published** | No: arrival time per observer |
| Xatu public Parquet (`data.ethpandaops.io/xatu/mainnet/...`) | `libp2p_gossipsub_beacon_block` (322 K rows/day, 46 sentries, 5 K remote peers with sender id), `libp2p_deliver_message`, `libp2p_duplicate_message` (14 M rows/day), `libp2p_graft/prune`, `libp2p_rpc_meta_control_ihave/iwant/idontwant`, `libp2p_connected` with remote geo | < 1 day | free, no key, DuckDB over HTTP | **One hop** (remote peer → sentry) per delivery and duplicate |
| Hermes (ProbeLab, Apache-2.0/MIT) self-run | Every gossipsub tracer event around one node incl. scores, GRAFT/PRUNE, IHAVE/IWANT/IDONTWANT, as JSON/S3 Parquet/Kinesis | live | needs a synced **Prysm** plus Hermes on a box | One hop around Hermes; full control plane |
| Beacon node events SSE (`/eth/v1/events?topics=head,block,block_gossip`) | real slot clock, block roots, this node's arrival | live | a node, or `lodestar-mainnet.chainsafe.io` (**ToS unverified**) | No |
| Client Prometheus | Lighthouse emits all 7 `gossipsub_*` names Luminar already uses; Prysm shares `gossipsub_mesh_peer_counts` only | scrape | a node | Aggregates |
| go-libp2p-pubsub remote tracer `/libp2p/pubsub/tracer/1.0.0` | protobuf batches | live | only from go-libp2p apps you run; **no Ethereum client emits it** | One hop |
| Calibration: ethPandaOps "Block size vs propagation" (May 2026) | per-size dispersion lookup table "intended for simulators": p50 104 ms at 9 KB → 348 ms at 238 KB; p99 427 to 1,248 ms | static | free | n/a |

**OpenTelemetry verdict.** No consensus client exposes OTLP traces or metrics (unverified
negative after searching Lighthouse, Prysm, Teku, Lodestar, Nimbus docs); only Hermes
traces its own internals. So "Luminar shows OpenTelemetry data of a live network" cannot
be literally true today. What is true and worth saying: Luminar *emits* OpenTelemetry
(every simulated message is a Jaeger trace; `/metrics` uses the names a real Lighthouse
emits, so one Grafana dashboard carries a sim row and a node row), and it can *ingest*
the live network through the public arrival data above. Keep the planned OTLP receiver as
a sink for operators who bridge Prometheus through a collector; do not build a demo on it.

**Prior art check.** ProbeLab's dashboards and ethPandaOps' Lab show arrival CDFs,
heatmaps and a "live slot" view fed by the same CBT API. Ethshadow, sigp's testground and
the JVM simulator run real or modelled nodes under simulation with Grafana output. No
project found renders simulated and live gossip propagation side by side, and no paper
found compares a gossipsub simulation quantitatively against mainnet traces. That gap is
Luminar's.

## 4. Proposal: three modes, one timeline, one honesty rule

- **Simulate** (today): the mesh under attack, OTel out.
- **Replay**: reels, now of two kinds. Simulated reels (today) and **real-trace reels**
  converted from Xatu Parquet: one slot's `beacon_block` deliveries and duplicates around
  the 46 EF sentries, drawn on a geo layout, provenance badge "recorded by ethPandaOps
  sentries, one hop each, CC BY 4.0". Same player, same scrubber, same narrator.
- **Live**: a poller tails the CBT API every slot and streams `mainnet_block_arrivals`
  frames over the existing WebSocket; observer nodes on a geo layout light up in arrival
  order from the first sighting; the ticker reads "block 0xe82a… seen by 148 nodes, first
  at 2,720 ms (teku, Finland), p50 3,273 ms". Honest label: "T minus 2 minutes, observer
  arrival, not mesh paths". A snapshot of one day of slots ships as a reel so the booth
  works with no Wi-Fi.
- **Compare**: left pane simulated wave for a block of the observed size on a calibrated
  `eth-mainnet-mesh` preset (D 8, heartbeat 0.7 s, per-edge latency from the continent
  table, dispersion matched to the ethPandaOps lookup), right pane the observed wave;
  shared stage timeline measured from first sighting, as the ethPandaOps study does, not
  from slot start. Two panes, two colours, provenance on each. Never one merged graph.

The honesty rule, in one line for every screen: *simulation = same mechanism, calibrated
or toy constants (stated); real = what these observers saw, one hop each.*

## 5. Plan against Devcon 8 (3 to 6 Nov), one developer

| # | Item | Days | Why first |
|---|---|---|---|
| 1 | Reel seek fidelity: stamp frames with sim time, replay events between the last snapshot and `t`, URL `t` and `peer` params (roadmap F7) | 1 | Makes "Back" and QR-to-moment real on reels without touching the engine |
| 2 | `scripts/xatu_to_reel.py`: one mainnet slot from Xatu Parquet → reel with a geo layout mode and provenance badge | 1.5 | A real block on the canvas, fully offline, zero backend risk |
| 3 | Live mode: CBT poller → WS frame → geo layout + ticker; day-of-slots reel as fallback | 1.5 | The booth hook: "this block arrived two minutes ago" |
| 4 | Faithfulness table in `docs/protocols.md` and on screen (D 6 vs 8, heartbeat 1 vs 0.7 s, −10 vs −4000/−8000/−16000, P1–P4 only, uniform 5–50 ms latency, no signatures, IWANT at heartbeat granularity, eclipse invisible to scoring) | 0.25 | The talk needs it; reviewers will ask |
| 5 | Lesson on the Sybil reel with declarative triggers (roadmap F11) | 2 | Only if 1–4 are done by 27 Oct |

Post-Devcon, in order: seeded RNG + MockClock headless CLI (`sim_cli.py run/sweep`),
which also makes the test suite run in virtual time and enables property tests over seeds
("a spammer is pruned by every honest mesh within 2 heartbeats", "partition ⇒ no
cross-group mesh hop"); hero-message stages (`published → first relay → 2/3 delivered →
fully delivered → IWANT pull seen`); the calibrated preset and the Compare pane; a
Hermes sink if you ever run a Prysm (highest authenticity: a real 500-peer mesh with real
scores and PRUNEs); a `/reels/<name>.html` static page per reel.

## 6. Risks

- The CBT API is undocumented infrastructure: it may change, be gated or rate-limited.
  Mitigation: the Parquet replay is the fallback for everything live; ask ethPandaOps.
- Public SSE endpoints have no stated terms; Devcon Wi-Fi is unreliable. Mitigation:
  everything live has a recorded twin.
- Apples and oranges in Compare: sim counts mesh hops, real data counts observer arrival
  after builder release. Mitigation: measure both from first sighting; say so on screen.
- Numbers will be contested (the duplicates thread shows how). Mitigation: cite the
  dataset and the day; never claim mainnet fidelity for the simulator.

## 7. Sources

Hermes blog and repo (probelab.io, github.com/probe-lab/hermes); Xatu overview
(notes.ethereum.org/@ethpandaops/xatu-overview), xatu-data schema and public Parquet
(github.com/ethpandaops/xatu-data, data.ethpandaops.io); CBT API discovered from
lab.ethpandaops.io; ethPandaOps "Block size vs propagation" (investigations.ethpandaops.io,
2026-05); ProbeLab ethresear.ch threads on propagation latency, GRAFT/PRUNE dynamics,
duplicates, IHAVE/IWANT; go-libp2p-pubsub `tracer.go` and `pb/trace.proto`; Lighthouse
and Prysm metrics sources; Solana Alpenglow page (solana.com/alpenglow) for the labelled
live-plus-model pattern; TON Catchain visualiser for the itemised disclaimer pattern;
deterministic simulation testing posts (Antithesis, TigerBeetle); Ethshadow, sigp
gossipsub-testground, ethp2p sim.

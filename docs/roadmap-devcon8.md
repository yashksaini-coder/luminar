# Luminar — Devcon 8 roadmap (2026-10-09 → 2026-11-06)

> ## Act today — FOSSASIA Open Source Hub call for speakers closes **2026-10-10 23:59 IST** (tomorrow)
>
> Submit at **https://eventyay.com/fossasia/osh2026/cfp**. Session types offered: **Lightning Talk (5 min), Workshop (45 min), Ask Me Anything (20 min), Onchain Quiz (20 min)**. There is no 20-min talk slot.
>
> **Recommended submission:** a 45-min hands-on **Workshop — "Break the mesh: a live GossipSub attack lab"** (attendees open the reel on their phones, then eclipse/Sybil a live mesh and watch peer scoring react). **Fallback:** a 5-min Lightning Talk ("Luminar: watching P2P attacks happen live"). Contacts: office@fossasia.org, Telegram @hpdang (forum topic 8950).

> **Status (2026-10-09, branch `feat/devcon8`):** must tier shipped — F1 scoring that bites,
> F2 honest propagation, F3 reels (three 50-node reels), F4 stage theme + hero, F5 OTel-out
> (OTLP/JSON → Jaeger, Prometheus `/metrics`, compose stack + Grafana dashboard, smoke OK),
> F6 phase narrator. 87 backend tests. Remaining: F7 share key/toast (reel/theme/hero URL
> params are already live), F8 OTel-in, F9 Jaeger deep link, F10 eth-mainnet-mesh preset,
> F11 booth mode, F12 Playwright smoke. Deferred deliberately: role-token refactor of the
> duplicated colour tables; OTLP badge in the toolbar; gzip for reels.

Verified against commit `a2d8a76` on 2026-10-09; external facts re-verified the same day by a second pass (see §11). All paths relative to `/home/yks/Projects/luminar`. Base proposal: **Stage-Demo First** (favoured by 2 of 3 judges), with grafts from the Ethereum-credibility, Observability and Lessons proposals and the fatal flaws the judges named removed. Effort estimates are full-day equivalents for one developer.

Budget assumption: Devcon 8 is **3–6 Nov 2026, Jio World Centre, Mumbai** (verified: devcon.org, EF blog). From today that is 3.5 weeks. Assuming ~4 working days/week, that is **~14 build days + 1 week of recording and rehearsal**. The must tier below is **12.75 days** (up from 11.5 after the verifier pass; see §9 for how it fits). Everything else is conditional on a checkpoint on **Wed 22 Oct**.

---

## 1. Positioning

Luminar is a live, fault-injectable simulator of libp2p GossipSub v1.1 — the protocol Ethereum's consensus layer uses to spread blocks and attestations between beacon nodes. It runs a py-libp2p-shaped mesh (GRAFT/PRUNE, IHAVE/IWANT, P1–P4 peer scoring) in a trio backend, renders it in WebGL at 20 Hz, and lets you break it on purpose: Sybil floods, eclipse attacks, partitions, latency and drops, on 8 topology generators, with scenarios that fire timed phases. Hermes and Xatu tell the Ethereum community what happened on mainnet; ProbeLab's dashboards tell them the aggregate shape; Shadow and Testground runs are headless. Luminar is the only tool in this space where a person can watch the mesh react to an attack, see the score that caused a PRUNE, and replay the exact moment on their phone. With this roadmap it also speaks OpenTelemetry: every simulated message becomes a standard trace, and mesh/score metrics are exported under the names and labels **Lighthouse (rust-libp2p) emits** — `gossipsub_mesh_peer_counts`, `gossipsub_mesh_peer_churn_events`, `gossipsub_score_per_mesh`. Prysm shares `gossipsub_mesh_peer_counts` only (the rest is `p2p_pubsub_*`); Teku ships the same family (mesh peer counts, churn, inclusion, recv counts — not score) behind the experimental `--Xmetrics-additional-categories=LIBP2P_GOSSIP` flag as of PR #11368. A real beacon node's metrics can enter the same canvas.

The honesty line (judge-mandated, non-negotiable in talk copy): Luminar models the **same mechanism** as a beacon node — P1–P4 of the v1.1 score function, mesh maintenance, gossip — with toy constants (D=6, heartbeat 1 s, prune at −10, topic `lumina/blocks/1.0`). It does not run Lighthouse's parameters (D=8, 0.7 s, thresholds −4000/−8000/−16000, P5–P7). Say "the same mechanism", never "the same scoring your beacon node runs". Say "reproducible recordings", never "identical runs" (the sim is unseeded; `grep -rn "random.seed\|Random(" backend` returns nothing; trio sleeps are wall-clock). Say "the metric names Lighthouse emits", never "the names every client emits". And say out loud that scoring **cannot see a silent eclipse** — only the P3 deficit, capped at −0.25 — so eclipse recovery needs the fault to clear; that is the real lesson of the second beat.

**One-line pitch:** *Hermes and Xatu tell you what Ethereum's gossip layer did; Luminar lets you break it on purpose, watch peer scoring prune the attacker, and land the whole thing in the same Grafana and Jaeger your beacon node uses — under the metric names Lighthouse already emits.*

---

## 2. The 90-second demo story

Runs from a **reel** (recorded WebSocket frames replayed client-side from static files; no backend, no Wi-Fi). Live engine is the encore. Pause the reel before any alt-tab (rAF throttling). The reel is recorded from a dedicated `demo-sybil-eclipse` scenario (50-node random mesh, p=0.2; phases at **T+10 sybil, T+16 eclipse, T+24 clear**) so the beats land inside a 30 s recording at 1×. Attackers are drawn because feature 1 adds them to the snapshot as synthetic nodes; their ids are deterministic (`sybil-0..4`, `eclipse-0..2`) so the URL and the script survive re-records.

| t | On screen | Line |
|---|---|---|
| 0–8 s | Hero layout, stage theme, reel `sybil-eclipse` paused at T+0 on a 50-node random mesh. | "This is the p2p layer under Ethereum's beacon chain: libp2p GossipSub. Luminar runs the same mechanism — mesh, gossip, peer scoring — and lets you break it on purpose." |
| 8–18 s | Play. peer-3 publishes; particles travel sender→receiver along mesh edges, a 4-hop wave. Ticker: `delivery 100% · 4 hops · 190 ms mesh end-to-end`. | "Every node got it in four hops. Now let's attack." |
| 18–24 s | T+10, caption "Sybil attack: 5 attackers graft in". Five red nodes appear next to their targets; GRAFT flashes; red spam particles leave the attackers every heartbeat. Ticker: `invalid msgs` and `duplicates` climb (delivery barely moves — say so if asked: Sybils flood, they do not block). | "Five Sybils just grafted into honest meshes and are flooding invalid messages." |
| 24–30 s | Pause at T+12.5. Click `sybil-0`. Inspector score sparkline (or P1–P4 bar if feature 10 ships) steps −10 → −15. PRUNE fires from every honest peer, `reason=score` in the log; mesh-edge overlay to the Sybils disappears; their rings go grey. Caption "Pruned by score in 2 heartbeats". | "P4, the invalid-message penalty: −10 per heartbeat of spam. Two heartbeats and every honest peer has pruned them. Nobody coordinated that." |
| 30–44 s | Play. T+16 caption "Eclipse on peer-10": its mesh edges swap to three silent attackers; **mesh** delivery to it stops; gossip pull (IHAVE/IWANT) keeps it alive at a heartbeat's delay — ticker shows its latency jump to ~1 s. Its score bar shows nothing: eclipse peers send nothing invalid, only the P3 deficit, capped at −0.25. T+24 "Faults cleared": re-grafts, windowed delivery back to 100 %, caption "Healed in N s" (N read live from the first analytics tick ≥ 0.95 after `FaultCleared`). | "Scoring caught the loud attack. It cannot see a silent one — peer-10 is still alive only because gossip pulls around the mesh. Eclipse resistance is a topology problem, not a scoring problem. That is why this matters." |
| 44–70 s | Pause reel. Alt-tab to Grafana (laptop docker compose; full-res screenshots as fallback). Row "Luminar sim": `gossipsub_mesh_peer_counts` dip and recovery, `gossipsub_mesh_peer_churn_events{reason="BadScore"}` step, scenario phase annotations. Jaeger: one trace for `msg-41` of this run, a span tree origin→every receiver. | "Luminar exports OpenTelemetry. These are the metric names and labels Lighthouse already emits — Prysm shares the mesh-count one, Teku has the family behind a flag — so a real node goes on the next row of the same dashboard." |
| 70–82 s | Back to Luminar, `s`: toast "Link copied". Slide shows the QR: `?reel=sybil-eclipse&t=12.5&peer=sybil-0&theme=stage&hero=1`. | "That exact moment is on your phone now. Come break it yourself at the Resilient Networks Hub." |

Fallback at any step: reel is static files served by Vite; if backend or Wi-Fi dies nothing on screen changes.

---

## 3. Feature roadmap

| # | Feature | Why | What to build (summary) | Files touched | Days | Priority | Week |
|---|---|---|---|---|---|---|---|
| 1 | Scoring that bites: P4 reachable, attackers as drawable nodes, `GossipPrune.reason`, `ScenarioPhaseFired`, demo scenario, two demo-killer one-liners | Attackers score exactly 0 today; floor is −0.25; PRUNE at −10 is unreachable; **attackers are not PeerNodes, so nothing red can be drawn, clicked or be a particle endpoint**; WS goes silent after scenario launch; DHT particles never spawn | Heartbeat spam pre-pass → `on_invalid_message` (sybil only; eclipse stays silent); synthetic attacker nodes in the snapshot + d3 links; deterministic attacker ids; `reason` via `to_prune` dict; phase event via injector bus; `demo-sybil-eclipse` scenario; `last_event_count` resync; `evt.initiator` | `backend/gossip/engine.py`, `backend/fault/injector.py`, `backend/events/types.py`, `backend/scenarios/runner.py`, `backend/scenarios/library.py`, `backend/simulation/engine.py`, `backend/main.py`, `frontend/src/app.ts`, `frontend/src/store.ts`, `frontend/src/palette.ts`, `frontend/src/map/renderer.ts`, `tests/test_fault_injector.py` | 2.25 | must | 1 |
| 2 | Honest propagation: sender-correct hops, mesh end-to-end latency, duplicate count, dropped hops, mesh overlay, bezier/fizzle particles | `GossipMessage.from_peer` is the receiver; `propagation_latency_ms` is a sum of hops; duplicates vanish silently; dropped relays vanish; mesh changes never reach the canvas | `to_peer`/`dropped` on `GossipMessage`; `from`/`via` in hop record; `max(time)-created_at` over mesh hops; `duplicates` counter; mesh map in snapshot; particle math | `backend/gossip/engine.py`, `backend/events/types.py`, `backend/simulation/engine.py`, `frontend/src/app.ts`, `frontend/src/map/renderer.ts`, `tests/test_gossip_engine.py` | 2 | must | 1–2 |
| 3 | Reels: record at the WS layer, replay client-side | Only honest route to identical, offline playback; makes the booth work with no backend | `?record=<name>` on `/ws/events` → JSONL (full delta + gap frames); `launch_scenario` honours pool size and refreshes `_initial_edges`; `edges` frame on change; `frontend/src/api/replay.ts` rAF scheduler into `parseMessage`; Reels dropdown; 3 shipped reels | `backend/main.py`, `backend/scenarios/library.py`, `frontend/src/api/websocket.ts`, `frontend/src/api/replay.ts` (new), `frontend/src/ui/playback.ts`, `frontend/index.html`, `frontend/public/reels/` | 3 | must | 2 |
| 4 | Stage theme + Hero layout + role tokens | `--text3` is 2.7:1 at 9–12 px mono; unreadable from row 10 | `:root[data-theme=stage]`, `#app.hero`, ticker strip, `store.scale` read by renderer, tokens replacing duplicated OKLCH tables | `frontend/src/style.css`, `frontend/src/palette.ts`, `frontend/src/ui/ticker.ts` (new), `frontend/src/ui/legend.ts`, `frontend/src/ui/keyboard.ts`, `frontend/src/map/renderer.ts`, `frontend/src/ui/events-panel.ts`, `frontend/src/ui/peer-inspector.ts` | 1.5 | must | 2–3 |
| 5 | OTel-out: `EventBus.sinks`, OTLP/JSON traces to Jaeger, `/metrics` Prometheus text with Lighthouse label names, `/api/otel/status`, compose stack with provisioned Grafana | The user's explicit ask; the beat that turns a toy into a tool; zero new Python deps | sink → deque → daemon thread → `urllib` POST `/v1/traces`; `run_id`-scoped trace ids; counter dict → `/metrics` text; compose with Jaeger 2.22.0 + Prometheus + Grafana | `backend/events/bus.py`, `backend/gossip/engine.py`, `backend/otel/exporter.py` (new), `backend/otel/metrics.py` (new), `backend/main.py`, `deploy/otel/*` (new), `tests/test_otel_exporter.py` (new), `tests/test_metrics_text.py` (new) | 3 | must | 3 |
| 6 | Phase narrator: timeline fault bands + captions + derived beats | Audience can't read event codes; `#tl-markers` exists empty; phases already reach `store.scenarios` | `frontend/src/ui/narrator.ts`; bands from `phases[].at`; captions on `ScenarioPhaseFired`; "first Sybil pruned at T+X", "healed in N s" on a **windowed** delivery ratio | `frontend/src/ui/narrator.ts` (new), `backend/gossip/engine.py`, `frontend/src/app.ts`, `frontend/src/style.css` | 1 | must | 3–4 |
| 7 | URL state + Share | QR on the closing slide; booth takeaway; cheapest SCL borrow | `frontend/src/url.ts`: parse-before-connect, 250 ms debounced `replaceState`, `t` only while paused, peer by id; `s` key + toast | `frontend/src/url.ts` (new), `frontend/src/app.ts`, `frontend/src/ui/playback.ts`, `frontend/src/ui/mode-switcher.ts`, `frontend/src/ui/legend.ts`, `frontend/src/map/renderer.ts` | 1 | should | 4 |
| 8 | OTel-in: `POST /v1/metrics` (OTLP/JSON) → `TelemetryManager`, `fake_beacon_node.py`, collector `bridge` profile | "Real node in" beat without depending on a synced client or Wi-Fi | JSON walk → `TelemetryPayload`; `ingest` under `run_in_executor`; stdlib fake beacon with `--chaos` | `backend/telemetry/otlp.py` (new), `backend/telemetry/manager.py`, `backend/main.py`, `scripts/fake_beacon_node.py` (new), `deploy/otel/collector.yaml`, `tests/test_otlp_in.py` (new) | 1.5 | should | 4 |
| 9 | "Open in Jaeger" deep link + `trace_id` on `/api/trace/{msg_id}` | In-app proof the export is real; trace_id is derived so it matches the exporter | `trace_id` (run-scoped) in trace dict; event-log row for non-spam `GossipMessage` gets a link; `VITE_JAEGER_URL` | `backend/gossip/engine.py` (`MessageTrace.to_dict`), `backend/otel/exporter.py`, `frontend/src/ui/events-panel.ts`, `frontend/src/api/client.ts` | 0.5 | should | 4 |
| 10 | `eth-mainnet-mesh` preset (D/D_low/D_high/D_lazy/heartbeat only) + P1–P4 score bar with −5/−10 lines | Lets the talk say "here is what changes at mainnet mesh size" honestly; the bar makes the prune look earned | `GossipEngine` instance fields instead of module constants; `profile` on reconfigure; `score_breakdown` on snapshot for attackers + selected peer; inline SVG bar | `backend/gossip/engine.py`, `backend/gossip/profiles.py` (new), `backend/simulation/node_pool.py`, `backend/main.py`, `frontend/src/ui/peer-inspector.ts`, `frontend/src/ui/ticker.ts` | 1.5 | should | 4 |
| 11 | Booth mode: attract loop + one guided lesson over the sybil reel + `tests/test_lesson_contract.py` | A 4-day hub booth needs a walk-up hook; predict→run→reveal is the best audience device in the proposals; reels make Back a seek | 60 s idle loop; `frontend/src/ui/lesson.ts` with one lesson object; triggers on reel events; headless trio test asserting the stop events occur | `frontend/src/ui/lesson.ts` (new), `frontend/src/app.ts`, `frontend/src/style.css`, `tests/test_lesson_contract.py` (new) | 3 | could | 4 (only if 1–7 done by 24 Oct) |
| 12 | Playwright reel smoke spec | Only regression guard for the demo path | One spec: load reel, play 5 s, assert zero console errors, opt-in screenshot | `frontend/e2e/reel.spec.ts` (new), `frontend/package.json` | 0.5 | could | 4 |

Must total: **12.75 days** (F1 2.25 + F2 2 + F3 3 + F4 1.5 + F5 3 + F6 1). Should: 4.5. Could: 3.5.

### 3.1 Scoring that bites (must, 2.25 d)

- **Attackers become nodes (≈0.75 d, verifier blocker).** Today `NodePool` only creates `peer-{i}` (`backend/simulation/node_pool.py:195-202`) and `get_all_status()` returns only those (`:211-212`); `inject_sybil`/`inject_eclipse` add ids only to `gossip._seen`, `_subscriptions`, `_mesh` (`backend/fault/injector.py:360-362`, `:422-424`). So the snapshot never contains an attacker, `store.nodeIndex` (`frontend/src/app.ts:300-303`) never knows them, and `spawnParticle` returns early for unknown ids (`frontend/src/map/renderer.ts:37-39`). Fix: `SimulationEngine.get_snapshot` (`backend/simulation/engine.py:171-184`) appends a synthetic node for every id in `fault_injector.get_active_faults()` (`sybil_ids`/`attacker_ids`) with `state: "attacker"`, `gossip_score` from `scorer`, `connected_peers` = honest meshes containing it (from the feature 2 mesh map), and a position seeded next to its first target. Frontend: `attacker` added to `STATE_COLORS` and `PeerNode.state`; attacker→target mesh edges are included in the d3-force links so they get placed; `handleWsSnapshot` keeps `topoKey` stable when attackers appear/disappear (or recomputes layout once per fault change, not per snapshot).
- **Deterministic attacker ids.** Today ids are `sybil-{fault_id}-{i}` with `fault_id = fault-{uuid4().hex[:8]}` (`injector.py:263`, `:351`, `:403`), so `sybil-0` never exists and the QR URL would change on every re-record. Use `sybil-0..n` / `eclipse-0..n`, reset per fault; nothing keys on the uuid prefix except `clear_fault`, which uses the stored id lists.
- `backend/gossip/engine.py:306` — the heartbeat currently `continue`s for ids starting `sybil-`/`eclipse-`. Replace with a misbehaviour **pre-pass that runs before the per-peer prune loop** (`:304-336`): for each **sybil** attacker, call `self.scorer.on_invalid_message(topic, attacker)` **once per attacker per heartbeat** (the scorer is one global tracker, `backend/gossip/scoring.py:70-71`, `:99-102`; calling it per honest-peer pair would give a fanout-4 Sybil −40 in one heartbeat and break the "two heartbeats" line), then separately emit one `GossipMessage(at, topic, from_peer=attacker, to_peer=honest, msg_id=f"spam-{n}", hops=0)` per (attacker, honest-mesh-member) pair so red particles leave the attacker. With `invalid_message_weight=-10`, `invalid_message_decay=0.5` (`scoring.py:16-36`), P4 is −10 after heartbeat 1 (not `< -10`), −15 after heartbeat 2, and the prune step (`engine.py:316`, `score < SCORE_THRESHOLD_PRUNE`) removes it from every honest mesh. P1 (+0.5/s after `on_graft`, `scoring.py:117-118`) does not change the heartbeat-2 outcome. **Eclipse ids are exempt**: they stay silent, score only the P3 deficit (floor −0.25), and are removed only by `clear_faults` — that is the story in §2 and the honesty line.
- `backend/fault/injector.py` `inject_sybil`/`inject_eclipse`: for each honest target that receives an attacker in its mesh, call `self.gossip.scorer.on_graft(topic, attacker_id, clock.time)` and emit `GossipGraft(from_peer=target, to_peer=attacker_id, topic)` so the GRAFT is visible. Keep attacker ids in `_subscriptions` so `clear_fault` still cleans up.
- `backend/events/types.py:191` `GossipPrune`: add `reason: str = "overflow"` (frozen dataclass default keeps the 8 engine tests green). Score-pruned and overflow-pruned peers are currently merged into one `to_prune` set before the emit loop (`engine.py:313-336`), so change it to `to_prune: dict[str, str]` (prunee → reason) and emit `reason=to_prune[prunee]`. Surfaces in `events-panel.ts` detail column and feeds the churn counter in feature 5 (mapped to Lighthouse's `BadScore`/`Excess`).
- `backend/events/types.py`: new `ScenarioPhaseFired(scenario_id, phase_idx, label, action)` (category `simulation`), emitted in `ScenarioRunner._execute_phase` (`backend/scenarios/runner.py:99`) before the action runs. `ScenarioRunner` holds no bus (`runner.py:31-34`; `run()` receives only `clock` and `fault_injector`), so emit via `fault_injector._event_bus`, the pattern the injector already uses. Drives captions (6), timeline bands, Grafana annotations and trace-sampling boost (5).
- `backend/scenarios/library.py`: add `demo-sybil-eclipse` — random p=0.2, phases `inject_sybil` at T+10 (5 attackers), `inject_eclipse` on `peer-10` at T+16 (3 attackers), `clear_faults` at T+24. The shipped `sybil_eclipse` (`library.py:75-76`) keeps its T+40 clear for the live encore. Topology size comes from the pool at launch (feature 3).
- `backend/main.py:160`: `if current_count < last_event_count: last_event_count = 0` before the delta. Without this, nothing reaches the client after a scenario launch clears the bus.
- `frontend/src/app.ts:179`: read `evt.initiator` for `DHTQueryStarted` (field name per `types.py:133`), not `evt.peer_id`.
- `frontend/src/palette.ts`: add `attacker` colour; renderer colours `state === "attacker"` red, grey ring once absent from all honest meshes (mesh map from feature 2).
- Test: `tests/test_fault_injector.py::test_sybil_pruned_by_score` — 20 honest + 5 sybils, run exactly 2 heartbeats, assert every sybil score `< SCORE_THRESHOLD_PRUNE`, absent from all honest meshes, a `GossipPrune(reason="score")` in the ring, and that after 1 heartbeat none is pruned yet (pins the "two heartbeats" arithmetic). Add `test_eclipse_stays_until_clear`: eclipse attackers remain in `peer-10`'s mesh after 3 heartbeats and leave on `clear_fault`. Check the existing 11 injector tests for assertions that sybils persist; adjust heartbeat counts, do not weaken the prune.

### 3.2 Honest propagation (must, 2 d)

- `backend/events/types.py:222` `GossipMessage`: add `to_peer: str = ""`, `dropped: bool = False`. Defaults keep all 62 tests and old reels working.
- `backend/gossip/engine.py:281`: emit `from_peer=<sender>, to_peer=<receiver>`. At the drop/partition early return (`:237-243`) emit `GossipMessage(..., to_peer, dropped=True)` before returning.
- `MessageTrace.add_hop` (`engine.py:56-67`): record `from` (None at origin) and `via: "mesh" | "iwant"`. IWANT fulfilment hops are stamped with the heartbeat's `sim_time` and `latency_ms=0` (`engine.py:408`), so a naive max would jump to ~1 s whenever any non-mesh neighbour pulled the message — common on a 50-node random graph. `propagation_latency_ms()` (`:76`) therefore becomes `max(h["time"] for mesh hops) - created_at` in ms, reported as **mesh end-to-end**; `propagation_incl_gossip_ms` keeps the all-hops max for the inspector. Keep the old sum as `work_ms` if anything reads it (nothing in the frontend does). `MessageTrace` gains `duplicates: int`, incremented at the dedup early return (`:245-249`); `get_analytics()` adds `avg_duplicates` and a windowed `recent_delivery_ratio` (mean of the last 20 entries of `delivery_ratios`, which already exist at `engine.py:490-493`; ≈5 lines) because `avg_delivery_ratio` is a lifetime mean over up to 5000 traces (`:452`, `:470-471`) and cannot move inside a 60 s reel.
- Snapshot: `SimulationEngine.get_snapshot` (`backend/simulation/engine.py:171-184`) adds `gossip.mesh: {peer_id: [peer_ids]}` from `GossipEngine.get_mesh_state`. At 50 nodes × D=6 that is ~300 ids every 500 ms; cap the map to nodes ≤ 100 (empty dict above) to protect the 500-node preset.
- Frontend `app.ts:157-168`: if `evt.to_peer`, spawn `from_peer → to_peer`; else keep the random-neighbour fallback. Particle path = quadratic bezier bowed left of travel (~15 lines, no library); `dropped` particles travel to 60 % then fade (`renderer.ts` particle struct gains `fizzle`). Particle cap 300 → 600. New `mesh-edges` LineLayer from `store.mesh` drawn brighter than topology edges, gated by `store.showEdges`.
- Tests: update `tests/test_gossip_engine.py` assertions on relay event fields; add one asserting `propagation_latency_ms == max mesh-hop time − created_at` (an IWANT hop does not raise it) and `duplicates` counts each extra arrival once.

### 3.3 Reels (must, 3 d)

- Backend (1 d): `websocket_events` (`backend/main.py:135`) accepts `?record=<name>`; `name` must match `^[a-z0-9-]{1,40}$` (it is used as a path; otherwise `record` is ignored). When set, appends `{"t": wall_ms_since_connect, "kind": "text"|"bytes", "frame": <parsed>}` to `recordings/<name>.jsonl` for every frame sent. **While recording, send the full event delta** instead of the newest-200-per-50-ms cap (`main.py:163-164`) — a heartbeat emits all GRAFT/PRUNE/IHAVE/IWANT events synchronously inside one call (`gossip/engine.py:293-388`) and a 50-node flood piles several hops into one tick, so the cap can silently drop the first `GossipPrune(reason="score")`; if anything is ever cut, write a `{"type": "gap", "dropped": n}` frame. Three launch fixes that reels need and the live UI also benefits from: (a) `launch_scenario` (`main.py:740-744`) always builds the scenario topology at `n_nodes=20`, so with a 50-node pool peers 20–49 have no edges yet still subscribe and publish and `get_analytics` divides by all 50 (`gossip/engine.py:455-456`, `:470`) — delivery would cap at 40 %; use `n_nodes=engine.node_pool.node_count` and derive the partition groups (hard-coded `peer-0..9` vs `peer-10..19` at `backend/scenarios/library.py:7-8`, `:55`) from the node count at launch. (b) `launch_scenario` wires the new topology (`main.py:748`) but never assigns `_initial_edges` (only `_build_simulation` `:86` and `topology_apply` `:357` do), so `/api/topology/edges` (`:625-628`) and the frontend's `fetchEdges()` on launch (`frontend/src/app.ts:139-140`, `:107-118`) draw the boot topology — one line: `global _initial_edges; _initial_edges = edges`. (c) In the WS loop keep `last_edges_id = id(_initial_edges)` and emit an `{"type": "edges", "edges": [...]}` frame whenever it changes (live clients too; `parseMessage` routes it to `store.edges` + `recomputeLayout()`); the recording therefore starts with an `edges` frame and gets a fresh one after each launch.
- Frontend (2 d): `frontend/src/api/replay.ts` exporting `startReel(url, speed)`, `pauseReel()`, `seekReel(t)`; a rAF scheduler dispatches frames whose `t*speed` has elapsed into `ws.parseMessage` (make it public in `websocket.ts`) and `edges` frames straight into `store.edges` + `recomputeLayout()`; a `gap` frame shows a small "n events dropped" marker on the timeline. `playback.ts`: when `store.reel` is set, play/pause/speed/seek drive the reel, scrubber maps to reel duration. Toolbar "Reels" dropdown from `frontend/public/reels/manifest.json`; keys 1–3 load reels. Reels shipped: `healthy-publish`, `sybil-eclipse` (from `demo-sybil-eclipse`), `partition-heal`, all recorded at 50 nodes.
- README: recording procedure (reconfigure to 50 nodes, open `/ws/events?record=<name>`, launch scenario, wait, copy file) and a validation step: `scripts/check_reel.py <file>` counts `GossipPrune(reason="score")` and `FaultCleared` frames and fails if fewer than the scenario expects. Not built: server-side replay, seeding.

### 3.4 Stage theme + Hero layout (must, 1.5 d)

- `frontend/src/style.css`: role tokens on `:root` with Luminar's own OKLCH values (`--surface-1/2/3`, `--ink/--ink-2/--muted`, `--good/--warn/--critical`, `--c-gossip/--c-dht/--c-fault/--c-conn`); replace the hard-coded tables in `events-panel.ts:5-47`, `peer-inspector.ts:5-22`, `stats-panel.ts:101-103`, `app.ts:29-44` with one `palette.ts` map. `color-scheme: dark`; 4-line `:focus-visible` ring; `prefers-reduced-motion` → `store.particlesEnabled = false` (the field is `particlesEnabled`, `frontend/src/store.ts:49`, `:92`; read by `renderer.ts:35` and `legend.ts:60`).
- `:root[data-theme=stage]`: base 16 px, `--muted` ≥ 4.5:1, brighter borders, `store.scale = {node: 1.6, particle: 2, edgeAlpha: 2}` read at `renderer.ts:92` and `:244`.
- `#app.hero`: hide `#stats-panel` and `#event-log`; map fills width; bottom ticker (`frontend/src/ui/ticker.ts`, ~80 lines) showing phase label, windowed delivery %, mesh degree, invalid-message count, pruned-attacker count from `store.gossipAnalytics`/`store.mesh`.
- Legend gear toggles "Stage theme" / "Hero layout"; keys `t`/`h`; persisted in `localStorage` and URL (7). Keep JetBrains Mono (just bigger). Not built: light theme, responsive breakpoints.

### 3.5 OTel-out (must, 3 d) — see §4 for the full design

- `backend/events/bus.py:51` `emit`: add `self.sinks: list[Callable[[BaseEvent], None]]`, call each inside `try/except` (count exceptions, never raise into the sim).
- `GossipEngine` gains `run_id: str` (uuid4 hex, new on construction, on `clock.reset()` and on scenario launch). `msg_id` is `msg-{self._msg_counter}` on the engine (`gossip/engine.py:125`, `:184-185`) and restarts at `msg-1` on every `/api/sim/reconfigure` (new engine, `main.py:76`) and backend restart; Jaeger groups by trace id only, so without `run_id` in the hash a rehearsal week against one Jaeger merges every run's `msg-41` into one tangle.
- `backend/otel/metrics.py`: a plain counter/gauge dict updated by the sink in O(1) per event; `GET /metrics` renders Prometheus text (stdlib, ~80 lines) **with Lighthouse's label names and values** (§4.3) so the bridge-row queries are literally the same. Prometheus scrapes Luminar exactly like a beacon node. This sidesteps both hand-encoded OTLP histograms and the collector's `add_metric_suffixes` renaming (judge 2's flaw) — metrics never travel as OTLP out of Luminar.
- `backend/otel/exporter.py`: `OtlpTraceExporter(endpoint)` — sink appends to a `deque(maxlen=20000)`, daemon thread flushes every 1 s via `urllib.request` POST `<endpoint>/v1/traces` as OTLP/JSON, retry on 429/502/503/504, drop otherwise and count. Enabled only when `OTEL_EXPORTER_OTLP_ENDPOINT` (or `LUMINAR_OTLP_ENDPOINT`) is set. Attached in `_build_simulation` (`main.py:72`) so reconfigure re-attaches; `t0_wall_ns` and `run_id` re-anchored on `clock.reset()` and scenario launch; flushed in `lifespan` shutdown (`main.py:106`).
- `GET /api/otel/status`: `{enabled, endpoint, run_id, spans_emitted, spans_dropped, sink_errors, last_flush_ms, last_status}`; also merged into the `telemetry_status` WS frame so the toolbar shows an "OTLP ●" badge.
- `deploy/otel/docker-compose.yml`, `prometheus.yml`, `grafana/provisioning/{datasources,dashboards}`, `grafana/dashboards/luminar-gossipsub.json`. `make otel-up`, `make otel-smoke`: `/api/sim/play` only unpauses the clock (`main.py:214-219`) and peers publish after a random 5–15 sim-second wait (`node_pool.py:267-269`), so the smoke unpauses, then **polls `GET /api/trace/recent?limit=1` until non-empty (≤ 20 s)**, takes the first sampled `trace_id` (`LUMINAR_OTLP_TRACE_PCT`), waits 2 s for the flush, and asserts `GET http://localhost:16686/api/v3/traces/<trace_id>` (the stable, OTLP-shaped API; port-16686 `/api/traces` is documented as internal and subject to change) returns ≥ 2 spans. The smoke is the round-trip test the judges asked for; it is not in CI.
- Tests (no network): `tests/test_otel_exporter.py` pushes 3 events through the sink with `urlopen` stubbed, asserts the OTLP/JSON shape (hex ids, `*UnixNano` as strings, `kind`/`status.code` as ints, `resourceSpans[0].resource.attributes`, `scopeSpans[0].scope.name`, `messaging.operation.name` present), and asserts that a reconfigure re-attaches the sink, re-anchors `t0_wall_ns` and changes `run_id` (so the same `msg_id` yields a different `trace_id`). `tests/test_metrics_text.py`: httpx `ASGITransport` does not run the lifespan, so `engine`/`fault_injector` stay `None` (`main.py:38-40`, `:105-118`) — the test calls `_build_simulation(5)` directly (no thread), pushes a `GossipGraft` through `engine.event_bus.emit` under `trio.run`, then renders the text via the same function the route uses and asserts `gossipsub_mesh_peer_inclusion_events{hash="lumina/blocks/1.0",reason="Random"}` incremented; `/metrics` itself returns counters-only text when `engine is None`.

### 3.6 Phase narrator (must, 1 d)

- `ScenarioDefinition.to_dict()` (`backend/scenarios/types.py:32`) already sends `phases[].at/label/action`; keep it so.
- `frontend/src/ui/narrator.ts`: (a) on scenario launch or reel load, render into `#tl-markers` (`index.html:160`, CSS `style.css:669`) one wash band per `inject_*` phase from `at` to the next `clear_faults`, coloured by action, labelled; (b) on `ScenarioPhaseFired`, show a 4 s caption card top-centre (CSS class, not inline `cssText`; replaces `showFaultFlash`'s position); (c) derived beats: first `GossipPrune` with `to_peer` prefix `sybil-` → "First Sybil pruned at T+Xs"; Sybil-phase intensity keyed to `invalid_messages`/P4 and `duplicates` from the analytics tick — **not** delivery, which barely moves because Sybils flood rather than block (flood publish still reaches hop-1 neighbours, `engine.py:210-214`, `:362`); first `FaultCleared` followed by `recent_delivery_ratio ≥ 0.95` (the windowed figure from §3.2, never the lifetime mean) on an analytics tick → "Mesh healed in Ns". Captions also render in the Hero ticker. Identical live and in reels because both go through `handleWsEvents`.

### 3.7 URL state + Share (should, 1 d)

`frontend/src/url.ts` (~90 lines, own code): format/parse `reel, scenario, n, speed, t (paused only, 0.1 s), peer (peer_id), theme, hero, panel`. 250 ms debounced `history.replaceState` from the mutation sites (`playback.ts`, `mode-switcher.ts`, `legend.ts`, `renderer.ts:276-278`, `app.ts` reel/scenario launch). Boot in `main()` (`app.ts:423`) before `ws.connect`: if `reel` → start reel driver, seek `t`, select `peer`, apply `theme`/`hero`; else if `scenario` → `scenarioLaunch` then `simSeek`. `s` key + toolbar button → `navigator.clipboard.writeText` with `window.prompt` fallback + 2 s toast. `peer=sybil-0` works because attacker ids are deterministic (§3.1).

### 3.8 OTel-in (should, 1.5 d)

`backend/telemetry/otlp.py` router: `POST /v1/metrics` accepts `application/json` (gzip via stdlib), 415 with hint for `application/x-protobuf`, responds `{}` with the request's content type, `partialSuccess` for resources without identity. Peer id = resource attr `luminar.peer.id` → `service.instance.id` → `host.name` (ids matching `^peer-\d+$` stay rejected: `_SIM_ID_RE` at `backend/telemetry/manager.py:21`, applied at `:94`). One dict maps metric names onto `TelemetryPayload` (`backend/telemetry/models.py:16-33`): `process_cpu_seconds_total` rate → `cpu`, `process_resident_memory_bytes` → `mem_mb`, `libp2p_peers`/`p2p_peer_count` → `open_streams` (**label it "peers" in the panel, not "mesh"** — judge 2's mislabel flaw), `beacon_head_state_slot` **and** `beacon_head_slot` → `best_block`, `beacon_head_state_finalized_epoch` **and** `beacon_finalized_epoch` → `finalized_block` (Lighthouse's primary names are the `_state_` spellings; the short ones are its interop variants and Prysm's); everything else under `extra` (`extra="allow"`), including `gossipsub_mesh_peer_counts` shown verbatim in the telemetry panel as "mesh (reported)". `/v1/traces`, `/v1/logs` ack `{}` only. Move `TelemetryManager.ingest`'s `trio.from_thread.run` (`manager.py:134`) under `loop.run_in_executor` like the fault routes (`main.py:412-426`). `CORSMiddleware` already allows `*`. `scripts/fake_beacon_node.py` (stdlib `http.server`) serves Lighthouse-shaped `/metrics` with `--chaos`; the collector `bridge` profile scrapes it, or a real Lighthouse at `host.docker.internal:5054` (default `--metrics` port, verified in the Lighthouse book; Prysm 8080, Nimbus `--metrics-port=8008`), and forwards via `otlphttp` `encoding: json` to Luminar. Test: `tests/test_otlp_in.py` with a hand-written OTLP/JSON payload (gzip and plain) → peer appears in `get_status()`; protobuf → 415.

### 3.9 Open in Jaeger (should, 0.5 d)

`MessageTrace.to_dict()` adds `trace_id` = the exporter's derivation (`hashlib.md5(f"{run_id}|{msg_id}").hexdigest()[:32]`, shared helper in `backend/otel/exporter.py`, `run_id` from the engine). `events-panel.ts` row for `GossipMessage` gets a small "trace" link to `${import.meta.env.VITE_JAEGER_URL ?? 'http://localhost:16686'}/trace/${trace_id}` — **skipped for `msg_id` starting `spam-`**, because spam creates no `MessageTrace` (only `publish` does, `gossip/engine.py:188-195`) and `/api/trace/spam-7` returns `{error: "trace not found"}` (`main.py:619-622`). Because the scenario-phase boost samples 100 % for 5 s after any phase, attack-window messages are always present in Jaeger.

### 3.10 eth-mainnet-mesh preset + score bar (should, 1.5 d)

- `backend/gossip/profiles.py`: `MeshProfile(d, d_low, d_high, d_lazy, heartbeat_s)` with `luminar-default` (6/4/8/6/1.0, remains default) and `eth-mainnet-mesh` (8/6/12/6/0.7, per the Ethereum p2p-interface spec). `GossipEngine` reads `self.profile` instead of module constants (`engine.py:31-35`); the heartbeat sleep at `backend/simulation/node_pool.py:198` (`await trio.sleep(1.0 / max(self._clock.speed, 0.1))`) reads `profile.heartbeat_s`. `POST /api/sim/reconfigure {n_nodes, profile}`; `GET /api/profiles`. **Scope guard:** no thresholds, no P5–P7, no topic renames. Talk copy: "mesh parameters from the Ethereum spec; scoring weights are Luminar's toy constants". Shipping Lighthouse's −4000/−8000/−16000 without the topic weights that make them reachable is worse than not claiming them (judge 3) — post-Devcon.
- Score bar: `PeerScoreTracker.get_score_breakdown` (`scoring.py:148-179`) included as `score_breakdown` on the snapshot node dict for attacker ids (now synthetic nodes, §3.1) and the selected peer only (so reels carry it). `peer-inspector.ts`: 120×24 inline SVG stacked bar, P1/P2 right, P3/P4 left, rules at 0/−5/−10; also in the Hero ticker for the selected peer. On an eclipsed peer's attackers it shows only the P3 sliver — that is the point.

### 3.11 Booth mode (could, 3 d)

Attract loop: 60 s idle timer in `app.ts` cycles the three reels in Hero mode with a "Tap any node to eclipse it" hint (tap → `faultEclipse` if live, select if reel). One lesson in `frontend/src/ui/lesson.ts` over `sybil-eclipse`: step 1 at `t=10` asks "Within how many heartbeats will the Sybils be pruned?" (1 / 2 / 5 / never → 2); step 2 trigger `GossipPrune` with `to_peer` prefix `sybil-` reveals the P4 arithmetic read from `score_breakdown`; step 3 asks "Will scoring prune the eclipse attackers?" (yes in 2 HB / yes eventually / never → never; reveal: P3 cap −0.25, fault clears at T+24). Triggers evaluated in `handleWsEvents`, pause the reel driver; Back = `seekReel(previousStop)`. 340 px left column replacing `#stats-panel` while open; native `<dialog>` for the picker. `tests/test_lesson_contract.py`: headless trio run of `demo-sybil-eclipse` asserting the first `GossipPrune(reason="score")` occurs within the scenario duration and before the eclipse phase, and that no eclipse attacker is pruned before `clear_faults`, so lesson copy and sim cannot drift. Presenter taps the wrong answer on purpose; the room votes.

### 3.12 Playwright reel smoke (could, 0.5 d)

`frontend/e2e/reel.spec.ts`: open `/?reel=sybil-eclipse&hero=1&theme=stage`, play 5 s, assert `pageerror` and console errors are `[]`; screenshot written only with `UPDATE_SCREENSHOTS=1`. Runs before every reel re-record.

---

## 4. OpenTelemetry architecture

### 4.1 Decisions

| Decision | Choice | Why |
|---|---|---|
| Transport | OTLP/HTTP, **JSON encoding only**, both directions. No gRPC, no port 4317, no protobuf. | Render does not support gRPC over external connections (verified, community.render.com/t/grpc-on-web-service/2470); grpcio is ~5 MB for nothing; JSON is spec-compliant and orjson is already a dependency. |
| Out: traces | Hand-encoded OTLP/JSON spans, stdlib `urllib`, daemon thread. | Span JSON is small and flat; a test asserts the shape; `make otel-smoke` round-trips through Jaeger. |
| Out: metrics | **Prometheus text `/metrics`**, hand-written, Lighthouse label scheme, scraped by Prometheus. No OTLP metrics out. | Removes the histogram/temporality hand-encoding risk and the collector's `add_metric_suffixes` renaming (both judge-flagged). It is what every CL operator's dashboard already expects. |
| In | `POST /v1/metrics` OTLP/JSON → `TelemetryManager`. `/v1/traces`, `/v1/logs` ack `{}`. | Fits the existing registry, 60 s TTL and snapshot merge; zero deps. |
| Python packages | **None added.** | Keep the Render image and the 62-test path untouched. |
| Deferred option | `opentelemetry-sdk==1.45.1`, `opentelemetry-exporter-otlp-proto-http==1.45.1`, `opentelemetry-proto==1.45.1`, `protobuf==7.36.2` (all verified on PyPI 2026-10-09, released 2026-10-06 / 2026-09-17) behind a `luminar[otel]` extra, only if a protobuf sender or SDK-native metrics are ever required. | Pin the whole 1.45.x / 0.66b1 train if added. |
| Dependency hygiene | Remove `aiofiles` and `trio-websocket` from `pyproject.toml` (no imports in `backend/` or `tests/`). **Keep `numpy` and `scipy`.** Run `uv lock` after editing (the Dockerfile uses `uv sync --no-dev --frozen`, `Dockerfile:21`) and add a boot smoke (`curl /api/sim/snapshot`) to `docs/demo-checklist.md`. | numpy and scipy are transitive runtime needs that networkx does not declare: `TopologyManager.graph_layout` calls `nx.spring_layout` (`backend/topology/manager.py:92`), which imports numpy and, for ≥ 500 nodes, scipy (`networkx/drawing/layout.py:587`, `:628-634`, `:739-740`); `compute_metrics` calls `nx.algebraic_connectivity` (`manager.py:146`), which needs scipy. `_build_simulation` runs `graph_layout` inside `lifespan` (`main.py:87`, `:110`), so dropping numpy breaks boot on Render and dropping scipy breaks the 500-node preset (`frontend/index.html:67`, clamp at `main.py:248`). |

### 4.2 Endpoints

| Endpoint | Direction | Format | Notes |
|---|---|---|---|
| `GET /metrics` | out (pull) | Prometheus text 0.0.4 | Scraped every 5 s by the compose Prometheus. No `peer_id` labels. Counters-only when the engine is not built. |
| `GET /api/otel/status` | out (status) | JSON | `enabled, endpoint, run_id, spans_emitted, spans_dropped, sink_errors, last_flush_ms, last_status`. |
| `POST <OTEL_EXPORTER_OTLP_ENDPOINT>/v1/traces` | out (push) | OTLP/JSON, `Content-Type: application/json` | Default target Jaeger 2.22.0 at `http://localhost:4318` (accepts OTLP Protobuf or OTLP JSON on 4318, per the Jaeger APIs page). 1 s batches, ≤ 1024 spans each. |
| `POST /v1/metrics` | in | OTLP/JSON, gzip accepted, 415 for protobuf | → `TelemetryManager.ingest`. Response `{}` with echoed content type. |
| `POST /v1/traces`, `POST /v1/logs` | in | OTLP/JSON | Ack `{}` only; counted in status. |
| `GET /api/trace/{msg_id}` | existing | JSON | Gains `trace_id` (run-scoped), `from`/`via` per hop, `duplicates`. |
| `GET /ws/events?record=<name>` | existing + reels | — | Recording switch (feature 3); `name` matches `^[a-z0-9-]{1,40}$`. |

### 4.3 Span and metric mapping

Resource (every batch): `service.name=luminar-sim`, `service.version`, `luminar.clock=simulated`, `luminar.topology`, `luminar.scenario`, `luminar.n_nodes`, `luminar.run=<run_id>`.

Span attributes follow the messaging semconv's Required set: `messaging.system=gossipsub` (custom value, allowed), `messaging.operation.name=publish|forward|iwant`, `messaging.operation.type=send|process`, `messaging.destination.name=<topic>`, `messaging.message.id`. Span names stay `gossipsub.publish` / `gossipsub.forward` / `gossipsub.iwant` rather than the semconv's SHOULD-form `publish lumina/blocks/1.0`; the deviation is documented in `backend/otel/exporter.py` so a reviewer does not read it as ignorance.

| Luminar source | OTel signal | Name / attributes |
|---|---|---|
| `GossipMessage` hops=0 (origin, `engine.py:206`) | span, root | `gossipsub.publish`; semconv set above + `luminar.peer.id`, `luminar.hop=0` |
| `GossipMessage` relay with `to_peer` (`engine.py:281`) | span, child of sender's span for same `msg_id` | `gossipsub.forward`; above + `luminar.from_peer`, `luminar.to_peer`, `luminar.hop`, `luminar.latency_ms`; `start = end − latency_ms` |
| `GossipMessage dropped=True` | span, status `ERROR` | `gossipsub.forward` + `luminar.dropped=true`, `luminar.reason=partition\|drop` |
| `GossipMessage` from `_process_iwants` (`engine.py:409`) | span with a **link** to the message's root | `gossipsub.iwant` |
| Duplicate arrival (dedup return `engine.py:245`) | attribute, not a span | `gossipsub.duplicates=<n>` on the receiver's forward span (bounded volume; judge 4's "attackers marked duplicate" conflation avoided) |
| `ScenarioPhaseFired` | span event on a per-run `scenario.<id>` span + Prometheus info metric `luminar_scenario_phase{scenario,label,action} 1` | Grafana annotations query the info metric (no Loki needed) |
| `FaultInjected`/`FaultCleared` by `fault_id` | span | `fault.<type>` |
| `GossipGraft` | counter | `gossipsub_mesh_peer_inclusion_events{hash=<topic>,reason=Random\|Subscribed\|Fanout\|Outbound}` — Lighthouse's `InclusionLabel`; initial subscribe → `Subscribed`, maintenance and attacker grafts → `Random` |
| `GossipPrune` | counter | `gossipsub_mesh_peer_churn_events{hash=<topic>,reason=BadScore\|Excess\|Prune\|Dc\|Unsub}` — Lighthouse's `ChurnLabel`; Luminar maps `score→BadScore`, `overflow→Excess`, `fault→Dc` |
| `GossipMessage` | counters | `gossipsub_topic_msg_recv_counts{hash}`, `gossipsub_topic_msg_published{hash}`, `luminar_duplicate_messages_total{topic}`, `luminar_invalid_messages_total{topic}` (the spam) |
| `GossipIHave`/`GossipIWant` | counters | `gossipsub_topic_iwant_msgs{hash}`, `luminar_ihave_msgs{topic}` |
| `get_mesh_state` (every scrape) | gauges | `gossipsub_mesh_peer_counts{topic_hash=<topic>,supports_partial="false"}` (avg) — Lighthouse's `MeshPeerLabel`; `luminar_mesh_peer_counts_min/max{topic}` |
| `scorer.get_all_scores` (every scrape) | histogram | `gossipsub_score_per_mesh_bucket{hash,le=-20,-10,-5,-1,0,2,5,10,+Inf}`, `_sum`, `_count`. Lighthouse's buckets are `[-16000,-8000,-4000,-2000,-1000,0,1,10,100]`, so sim and node histograms **never share a heatmap panel**; axis label in Grafana: "Luminar score (toy constants)" |
| score bands | gauge | `luminar_peers_by_score_band{band=pruned\|below_graft\|negative\|zero\|positive}` — Luminar's bands, **not** Teku's proposed names (issue #11391), because the thresholds differ |
| `get_analytics` | gauges | `luminar_delivery_ratio` (lifetime), `luminar_recent_delivery_ratio` (last 20), `luminar_propagation_ms` (mesh end-to-end, after feature 2), `luminar_avg_hops`, `luminar_duplicates_per_msg` |
| clock | gauge | `luminar_sim_time_seconds`, `luminar_speed` |
| telemetry registry | gauge | `luminar_telemetry_peers{source=json\|otlp}` |

Ids: `trace_id = md5(run_id + "|" + msg_id).hexdigest()[:32]`, `span_id = md5(run_id + "|" + msg_id + "|" + from_peer + ">" + to_peer).hexdigest()[:16]`, parent = the sender's own inbound span id. `from_peer` is in the span id because several senders attempt the same partitioned receiver (`engine.py:242-243` runs before dedup), so `msg_id|to_peer` alone collides for `dropped=True` spans. Deterministic per run, so `/api/trace/{msg_id}` and the exporter agree and re-exports within a run are idempotent. Per-message span map capped at 5000 entries (mirrors `MAX_TRACES`).

Timestamps: `unixNano = t0_wall_ns + at * 1e9`; `t0_wall_ns` and `run_id` captured together on `clock.reset()` and scenario launch so two runs do not interleave in Jaeger. Documented: at 5× speed trees compress 5× on a wall axis; demo at 1×.

### 4.4 Sampling and cardinality rules

- Traces: consistent per message, `int(md5(run_id|msg_id)[:8], 16) % 100 < LUMINAR_OTLP_TRACE_PCT` (default 5). **Forced to 100 % for 5 s after any `ScenarioPhaseFired`** so every attack-window message is traced. Spam messages (`spam-*`) are sampled at the same rule but capped at 50 spans per attacker per phase.
- Export queue `deque(maxlen=20000)`; overflow drops oldest and increments `spans_dropped`.
- Metrics: **never** `peer_id` or `msg_id` as a label. Labels on the `gossipsub_*` family are Lighthouse's (`hash`, `topic_hash`, `supports_partial`, `reason`); on `luminar_*` they are `topic`, `reason`, `band`, `source`, `type`. Max label-set count at 500 nodes: < 50.
- `/metrics` cost: O(nodes) per scrape (mesh/score pass) + O(1) counters; replaces nothing in the existing `MetricsCollector`, which stays for the WS `metrics` frame.

### 4.5 docker-compose stack (`deploy/otel/`, laptop only, never on Render)

```yaml
services:
  jaeger:
    image: cr.jaegertracing.io/jaegertracing/jaeger:2.22.0  # the version the Jaeger docs pin; registry tag list needs auth, so 'latest' was never confirmed
    ports: ["16686:16686", "4318:4318"]                      # UI, OTLP/HTTP (Protobuf or JSON, per Jaeger APIs page)
  prometheus:
    image: prom/prometheus:latest
    volumes: ["./prometheus.yml:/etc/prometheus/prometheus.yml:ro"]
    ports: ["9090:9090"]
    extra_hosts: ["host.docker.internal:host-gateway"]       # scrapes host:8000/metrics every 5s
  grafana:
    image: grafana/grafana:latest
    ports: ["3000:3000"]
    environment: [GF_AUTH_ANONYMOUS_ENABLED=true, GF_AUTH_ANONYMOUS_ORG_ROLE=Admin]
    volumes: ["./grafana/provisioning:/etc/grafana/provisioning:ro", "./grafana/dashboards:/var/lib/grafana/dashboards:ro"]
  otel-collector:                                            # feature 8 only
    profiles: ["bridge"]
    image: otel/opentelemetry-collector-contrib:latest
    volumes: ["./collector.yaml:/etc/otel/config.yaml:ro"]
    command: ["--config=/etc/otel/config.yaml"]
    extra_hosts: ["host.docker.internal:host-gateway"]
  fake-beacon:                                               # feature 8 only
    profiles: ["bridge"]
    build: { context: ../.., dockerfile: deploy/otel/fake-beacon.Dockerfile }
    command: ["python", "scripts/fake_beacon_node.py", "--port", "5054", "--chaos"]
```

`collector.yaml` (bridge): `receivers.prometheus` scraping `fake-beacon:5054` (or `host.docker.internal:5054` for a real Lighthouse started with `--metrics`) with `metric_relabel_configs` keep `(gossipsub_.*|libp2p_.*|beacon_head_state_slot|beacon_head_slot|beacon_head_state_finalized_epoch|beacon_finalized_epoch|process_.*)`; `exporters.otlphttp/luminar` `endpoint: http://host.docker.internal:8000`, `encoding: json` (key and value verified in the otlphttp exporter README; default is `proto`); pipeline `metrics: prometheus → batch → otlphttp/luminar`. Luminar runs on the host with `OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318`. Pre-pull all images before travel; pin the remaining `latest` tags by digest once pulled.

### 4.6 What to show in Grafana and Jaeger during the demo

Grafana dashboard `luminar-gossipsub.json`, two rows. Because Luminar emits Lighthouse's label names, the sim-row queries (`job="luminar"`) and the bridge-row queries (`job="beacon"`) are the same text with a different `job`; a Teku node labels by "topic shape" and would need its own panel variants.

1. **Mesh peers per topic** (`gossipsub_mesh_peer_counts`) — dips when Sybils are pruned, recovers at clear.
2. **Churn by reason** (`rate(gossipsub_mesh_peer_churn_events[30s])` stacked by `reason`) — `BadScore` spike at T+10–12 s.
3. **Score distribution** — **two** heatmap panels, one per row (`gossipsub_score_per_mesh_bucket` with Luminar's buckets vs the node's), because the bucket sets differ and one shared panel or `histogram_quantile` across rows would be meaningless; sim left tail appears during the Sybil phase (reachable after feature 1: floor −15).
4. **Delivery ratio / mesh end-to-end propagation ms** (`luminar_recent_delivery_ratio`, `luminar_propagation_ms`).
5. Annotations from `luminar_scenario_phase` info metric: "sybil", "eclipse", "clear".
6. (bridge) **Beacon node** row: `gossipsub_mesh_peer_counts`, `libp2p_peers`, `beacon_head_state_slot` from the fake/real node, labelled "reported by node".

**Do not overlay sim and real on one axis.** Judge-verified flaw: Luminar's scores live on −20..+10, Lighthouse's on −16000..+100. Rows share names, labels and shape, not numbers; the Grafana panel titles say so.

Jaeger: search `service=luminar-sim`, tag `messaging.message.id=msg-41` plus `luminar.run=<run_id>` (or follow the "trace" link from the event log). One trace, root `gossipsub.publish`, forward spans parented sender→receiver, one `ERROR` span if the partition reel is used. Take full-resolution screenshots of both during rehearsal week; they are the fallback.

### 4.7 asyncio/trio bridging note

- Every event passes through `EventBus.emit` (`bus.py:51`) **on the trio thread**. The sink does one `deque.append` and a few dict increments — no I/O, no allocation beyond the event reference. Exceptions are caught and counted.
- A daemon thread (`threading.Thread(daemon=True)`) drains the deque every 1 s, encodes with orjson and POSTs with `urllib.request` (blocking is fine there). Neither the trio loop nor the asyncio loop waits on it.
- `/metrics` runs on the asyncio thread and reads the counter dict and engine state unlocked, the same convention the existing REST handlers use for `get_mesh_state`/`get_all_scores` (GIL-protected dict/list reads; a `RuntimeError` from concurrent mutation is caught and the scrape returns the previous values).
- No `contextvars`, no `trace.use_span`: the sim is tick-driven, spans are built explicitly with derived ids and explicit start/end times. No OTel SDK threads exist because the SDK is not installed.
- `_build_simulation` (`main.py:72`) creates a fresh `EventBus` on reconfigure; the exporter is re-attached there and `t0_wall_ns`/`run_id` re-anchored; a test guards this.
- `TelemetryManager.ingest` (`manager.py:134`) currently blocks the asyncio loop on `trio.from_thread.run`; feature 8 moves it under `run_in_executor` before any collector posts every 5 s.

---

## 5. Solana Consensus Lab design adoption

Surveyed at SCL commit `a4f809c4` (Apache-2.0, React 18 + zustand + PixiJS). Nothing is droppable into vanilla TS + deck.gl; everything below is a pattern re-implemented with Luminar's own values and code.

**Take:**
- **Role tokens** (`--surface-1/2/3`, `--ink/-2/--muted`, `--border/-strong`, `--good/--warn/--critical`, categorical `--c-*`), `color-scheme: dark`, the 4-line `:focus-visible` ring, `prefers-reduced-motion`, `tabular-nums`, 11–12 px tracked uppercase headers → feature 4. Keep Luminar's OKLCH values, `--radius 3px` and JetBrains Mono.
- **IA**: left column as a mode (lesson), right as inspector; the *lesson | map | inspector* grid → feature 11. Hero layout is Luminar's own addition.
- **Timeline**: static fault wash bands built once per scenario, playhead separate, pointer-down pauses and seeks → feature 6 into the existing `#tl-markers`; the drag-lock fix for the scrubber-fights-snapshot bug (`playback.ts:43-48` vs `:91-95`) comes with it.
- **Lessons pattern**: predict → run → reveal phase machine, step dots, question card with `data-correct` colouring, Back as a *seek* — only possible in Luminar over reels, which is why reels ship first → feature 11. Triggers compiled to predicates over Luminar's 21 typed events.
- **URL state**: parse-before-connect, 250 ms debounced `replaceState`, `t` only while paused, node by stable id, Share → clipboard → `window.prompt` fallback → toast → feature 7.
- **Particle details**: left-of-travel bezier so A→B and B→A do not overlap; fizzle-at-60 % for dropped messages → feature 2.
- **TallyBar with threshold lines** → the P1–P4 score bar → feature 10.
- **e2e practice**: Playwright spec per contract, console-error assertion, screenshots captured always but written opt-in (`UPDATE_SCREENSHOTS=1`) → feature 12.
- **Engineering practice**: CHANGELOG by day with reasons; a "modelling decisions that look like bugs but are not" section in `CLAUDE.md` (single omniscient score observer, simulated-time span clocks, sybils scored via P4 not P3, eclipse attackers deliberately unscored, synthetic attacker nodes in the snapshot, snapshot mesh map capped at 100 nodes); comments that record measured thresholds.

**Re-implement in vanilla TS (never port React):** `narrator.ts`, `url.ts`, `lesson.ts`, `ticker.ts`, the score bar SVG, the reel driver. Native `<dialog>` instead of `Modal.tsx`; native `title` instead of the `data-tip` tooltip.

**Not taken:** React/zustand/PixiJS/bun; the brand mark, favicon and gradient (SCL's identity); compare/split view (one engine, singleton renderer — the sequential "ghost run" is post-Devcon); ring-by-region layout; sans-serif body switch; custom-JSON scenario modal; GitHub star chip.

**Attribution:** because only patterns and token *names* are reused with different values and new code, Apache-2.0 §4 imposes no obligation (SCL ships no NOTICE file, so §4(d) is moot). Add to `README.md`: *"UI patterns (role tokens, timeline bands, lesson flow, URL state) inspired by [Solana Consensus Lab](https://github.com/AkashJana18/solana-consensus-lab) (Apache-2.0)."* If any file ends up transliterated near-verbatim (candidates: `url/state.ts` compress helpers, `lessons/markdown.ts`), add `THIRD_PARTY_LICENSES.md` containing the Apache-2.0 text and this header in the file: `// Portions derived from Solana Consensus Lab (https://github.com/AkashJana18/solana-consensus-lab), Apache-2.0, Copyright 2026 Solana Consensus Lab contributors. Modified.` Never copy `Brand.tsx`, `favicon.svg`, `og.png`.

---

## 6. Cut list and post-Devcon backlog

**Explicitly not before Devcon**
- Seeded live determinism (unseeded global `random`, wall-clock trio sleeps; reels replace it). Never promise "same seed, same run".
- Full v1.1 scoring (P3b, P5–P7, caps, topic weights) and Lighthouse thresholds (−4000/−8000/−16000); gossip/publish/graylist semantics; per-observer scoring. The mesh-param preset in feature 10 is the only fidelity item.
- Ethereum CL topic set, 64 attnets, column subnets, slot clock (collides with the 200-events-per-50 ms WS cap; 11 hard-coded topic sites).
- IDONTWANT (v1.2), v1.3 extensions, the **proposed** v1.4 PREAMBLE/IMRECEIVING (arXiv 2505.17337, under review, not a merged spec version), v2.0 IANNOUNCE/INEED (libp2p/specs PR #653), PeerDAS, partial messages, EIP-8411 (Draft, chunked payload gossip), D/D_lazy sweep UI.
- Hermes/Xatu importer; the `POST /api/import/events` echo stub was removed and returns with the importer. (The 0.5 d `pb.TraceEvent` exporter vocabulary is post-Devcon too.)
- OTLP protobuf decoding, gRPC, OTel SDK, FastAPI auto-instrumentation, logs/Loki, collector on Render.
- Compare/split view, second deck.gl instance, embedded Grafana, new side panels beyond the ticker/lesson column.
- Responsive/mobile layout, light theme, full a11y pass (only focus ring, aria-labels on new buttons, contrast fix).
- Frontend unit-test suite, ESLint/Prettier; only the one Playwright smoke spec.
- Long tail of known defects (events_since bisect, wire_topology races, DHT hops semantics, docs drift) except the ones on the demo path.
- Any Render work beyond keeping the container building.

**After Devcon (in the order the P2P Networking Hub conversations will ask for)**
1. `eth-mainnet` scoring profile transcribed from Lighthouse `gossipsub_scoring_parameters.rs` at a named commit, with threshold semantics in the engine (3.5 d).
2. Adversarial injectors: `mesh_deadbeat`, `invalid_publisher`, `ihave_spam`, `prune_backoff` — the last sends malformed/oversized PRUNE backoff values; CVE-2026-34219 (rust libp2p-gossipsub, `backoff_time + slack` integer overflow → panic, fixed in 0.49.4) is the motivation, not something a Python simulator reproduces (2 d).
3. IDONTWANT + duplicate accounting with the arrival+latency race window (2 d).
4. Seeded `random.Random` threaded through engine/pool/injector/topology + headless experiment runner + `POST /api/experiments` for the Lean-Gossip D/D_lazy table (3.5 d).
5. `GET /api/export/events?format=libp2p-trace` + Hermes JSONL importer with replay (3 d).
6. Server-side `?topics=` WS filter and snapshot delta encoding for 500 nodes.
7. Ghost A/B sparklines (sequential rerun) and scenario JSON (`to_dict` keeping params, `POST /api/scenarios/launch-custom`).
8. Optional `luminar[otel]` SDK extra with OTLP metrics if a hosted backend (Grafana Cloud / SigNoz `ingest.in.signoz.cloud`) is wanted.

---

## 7. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Must tier (12.75 d) leaves 1.25 d of slack in a 14-day budget; 1.5× slip is normal. | Build strictly in order 1→6; after feature 3 the demo is already reel-safe; **feature freeze end of Mon 27 Oct**; at the Wed 22 Oct checkpoint, if F1–F3 are not merged, F6 drops to "should" (captions only stay inside F1's `ScenarioPhaseFired` + a 20-line toast) and the shoulds are not started. |
| Feature 1 changes attacker behaviour; some of the 11 injector / 8 engine tests may assert sybils persist. | Run the suite before and after; adjust heartbeat counts in tests, never weaken the prune. `reason`, `to_peer` and `dropped` have defaults. |
| Attacker nodes are synthetic snapshot entries, not pool members: a layout recompute per snapshot would make the mesh jitter. | Recompute d3-force once per fault change (keyed on the active-fault id set), not per snapshot; `test_sybil_pruned_by_score` also asserts the snapshot carries the five attacker entries. |
| Dropping dependencies breaks boot (numpy) or the 500-node preset (scipy). | Only `aiofiles` and `trio-websocket` go; `uv lock`; boot smoke `curl /api/sim/snapshot` in the checklist and after every Render deploy. |
| Hand-encoded OTLP/JSON spans rejected silently by Jaeger. | Metrics never travel as OTLP (Prometheus text instead). Spans are tested for shape and round-tripped by `make otel-smoke` against Jaeger's `/api/v3/traces/{id}` in week 3, before any screenshot is taken. |
| "Same Grafana panel" semantic mismatch (−20..+10 vs −16000..+100), and label mismatch leaving the bridge row empty. | Separate rows and two score heatmaps; Lighthouse label names/values emitted from Luminar; "same names and shape, not numbers" in the script. |
| WS drops > 200 events per 50 ms tick with no gap marker. | Recording sends the full delta and writes `gap` frames; `scripts/check_reel.py` counts expected prune/clear events before a reel is shipped. |
| Trace ids merge across runs in Jaeger during rehearsal week. | `run_id` in every trace/span id; `luminar.run` resource attribute for search; `/api/otel/status` shows the current `run_id`. |
| Reel timing uses rAF; background tabs throttle. | Pause before alt-tab (in the script); Hero ticker shows "PAUSED" so it is obvious. |
| Docker/Grafana/Jaeger fail on stage. | Full-res screenshots in the deck; rehearse the switch; images pre-pulled, Jaeger pinned to 2.22.0, the rest pinned by digest. |
| Venue Wi-Fi and Render cold starts. | Reels are static files served by Vite on the laptop; QR points at the Render URL only if it is up (warm it 5 min before); fonts self-hosted (replace the Google Fonts link in `index.html:7-9` with a local JetBrains Mono — 0.1 d in week 4). |
| Hub slot unconfirmed: Luminar appears in topic 8789 only as Yash's own 23 Sep reply, not on the organizer-authored programme. | **Owner action today:** email partner@libp2p.io to confirm the slot and format (stage vs booth). Booth-first reorders feature 11 above 7. |
| Protocol-fidelity challenge from a Lighthouse/ProbeLab engineer in the room. | Script says "same mechanism, toy constants" and "scoring cannot see a silent eclipse"; feature 10's preset + the post-Devcon list on a roadmap slide; never claim Lighthouse thresholds; never say "every client emits these names". |
| Frontend has no tests; a reel re-record can break silently. | Feature 12 smoke spec before each re-record; manual rehearsal checklist in `docs/demo-checklist.md`. |
| Scope creep toward hot topics (PeerDAS, IDONTWANT, Lean Gossip). | They are the roadmap slide, not build items; cut list is the defence. |

---

## 8. Submission and visibility checklist

| Channel | Status (2026-10-09) | Deadline | Verified? | Action |
|---|---|---|---|---|
| **Open Source Hub (FOSSASIA) Call for Speakers** | **Open; closes tomorrow.** Formats: Lightning Talk 5 min, Workshop 45 min, AMA 20 min, Onchain Quiz 20 min (no 20-min talk). | **2026-10-10 23:59 IST** | V (eventyay.com/fossasia/osh2026/cfp; forum 8950) | **Submit today**: 45-min Workshop "Break the mesh" (fallback: 5-min Lightning Talk). Contacts office@fossasia.org, Telegram @hpdang. |
| Devcon 8 speaker CFP (Lightning/Talk/Workshop; Core Protocol, Permissionless Networks, Security tracks) | **Closed** 12 Aug 2026 (the devcon.org homepage still says "open" — stale) | — | V (devcon.org/en/speaker-applications) | None; no late wave announced. |
| Community Hubs RFP-13 | **Closed**; 14 hubs selected 9 Sep | — | V (forum 8657, 9191) | — |
| **Resilient Networks Hub** (announced under that name in topic 9191; thread 8789 retitled "Resilient Networking Hub", Yash Saini named organizer; Luminar proposed by Yash in a 23 Sep reply, **not on the organizer-authored programme**) | Selected; Luminar's slot and format **unconfirmed** | Organizer sync "to be scheduled by Devcon" (unverified) | V (forum 9191, 8789) | Email partner@libp2p.io now: confirm slot, format, screen size, Wi-Fi. |
| **P2P Networking Hub** (ProbeLab + EF Research; Day 2 gossipsub/PeerDAS/network health, Day 4 Sybil/eclipse) | Selected; no public call for sessions ("concrete schedule finalized after acceptance") | None posted | V (forum 8748) | Reply on the thread / contact ProbeLab with the OTel + Sybil demo; ask for a 10-min slot on Day 2 or 4. |
| ETHGlobal Mumbai hackathon, Continuity tracks ("Extend Open Source", "Ship a Feature": documented pre-existing work required) | Open. Start date (Nov 5–7) only from third-party aggregators; the main event page returned HTTP 500 again today. | **Sat Nov 7 09:00 IST** (verified on the official details page) | V (ethglobal.com/events/mumbai/info/details) | Register; submit the OTel + reels work as the documented delta; 4-min demo video = the 90-second story + Grafana. |
| Devcon Impact Program (free booth for FOSS) | **Unknown — ask.** Supporters page: rolling review, reply within 15 days; the 14 Jul tickets blog said applications run through 6 Aug. | — | V (devcon.org/en/supporters/) | One email to supporters@devcon.org; record the answer. |
| Pragma Mumbai, ETHIndia @ Devcon (Nov 4) | No public CFP | — | P | Skip unless invited. |
| libp2p Core Fund (2026 priority: GossipSub research + network simulation) | No open call page; same people as the hub | — | V (libp2p.io/blog/2025-report) | Raise in the hub sync; follow up after Devcon with the roadmap slide. |
| EF ESP | Open applications paused; Office Hours available; no active wishlist/RFP | — | V | Book Office Hours post-Devcon with the Devcon demo link. |
| Octant epoch 13 | Opens 14 Oct; privacy-focused | 14 Oct | V | Weak fit; skip. |
| Gitcoin GG25 | Not announced | — | V | Watch. |
| DEV/MLH challenges via devrelay | **Blocked**: `devrelay login` not connected | — | — | Owner runs `devrelay login`; then check `get_challenges` for a Devcon/ETHGlobal-aligned challenge. |

Deck/booth artefacts to produce in week 4: QR to the reel URL, two Grafana + one Jaeger screenshots, 90-second fallback video, roadmap slide (post-Devcon list), "same mechanism, toy constants / scoring cannot see a silent eclipse" disclaimer slide.

---

## 9. Week-by-week schedule

Must tier is **12.75 d against the 14-day build budget** — it fits, with 1.25 d of slack, all of it in week 4. Weeks 1–3 hold 12 build days; the last 0.75 d of F6 lands on Mon 27 Oct, so the must freeze stays at the end of Mon 27 Oct and shoulds start Tue 28. Nothing is moved out of "must"; the fallback if the Wed 22 checkpoint slips is named in the table.

| Week | Dates | Build (cumulative must days) | Milestone / non-code |
|---|---|---|---|
| 1 | Thu 9 – Sun 12 Oct | F1 scoring bites + attacker nodes + demo scenario + one-liners (2.25 d); F2 honest propagation begun (1.75 of 2 d). **(4.0)** | **Thu 9 / before Fri 10 23:59 IST: submit the FOSSASIA Open Source Hub workshop proposal** (see the callout at the top). Email partner@libp2p.io (slot); email supporters@devcon.org; register ETHGlobal Mumbai. Drop `aiofiles`/`trio-websocket`, `uv lock`, boot smoke. |
| 2 | Mon 13 – Sun 19 Oct | Finish F2 (0.25 d); F3 reels incl. launch/edges/gap fixes (3 d); F4 stage theme + hero begun (0.75 of 1.5 d). **(8.0)** | By Sun 19: a 50-node reel plays offline with sender-correct particles, red attacker nodes and a Sybil prune by score. |
| 3 | Mon 20 – Sun 26 Oct | Finish F4 (0.75 d); F5 OTel-out + `/metrics` + compose + `make otel-smoke` (3 d); F6 narrator begun (0.25 of 1 d). **(12.0)** **Checkpoint Wed 22 Oct**: F1–F3 merged and F4 under way → on plan; otherwise F6 drops to "should" (captions only) and no shoulds are started. | By Fri 24: Grafana shows the dip-and-recovery from a live run with `BadScore` churn; Jaeger shows a run-scoped span tree. Take first screenshots. |
| 4 | Mon 27 Oct – Sun 2 Nov | Finish F6 (0.75 d) on Mon 27. **(12.75; must freeze end of Mon 27 Oct.)** 1.25 d slack, then shoulds in order F7 → F9 → F8 → F10 only on days that are otherwise free; F11/F12 only if everything else is done. | Re-record the three reels at 50 nodes on Tue 28 (after `scripts/check_reel.py` passes); self-host font; Playwright smoke if F12; rehearse ×5 with alt-tab; record fallback video; deck + QR; pre-pull Docker images (Jaeger pinned 2.22.0, rest by digest); `docs/demo-checklist.md` incl. boot smoke; warm the Render URL procedure. |
| Devcon | Mon 3 – Fri 6 Nov | No builds. | Hub demo/booth; ETHGlobal submission by **Sat Nov 7 09:00 IST**; collect contacts for the post-Devcon backlog. |

---

## 10. Sources

Research dossier (verified 2026-10-09 unless marked):
- Devcon 8 dates/venue/tickets: https://devcon.org/en/ · https://blog.ethereum.org/2025/12/23/devcon-mumbai · https://blog.ethereum.org/2026/07/14/devcon8-tickets
- Speaker applications (closed): https://devcon.org/en/speaker-applications/ · https://cfp.devcon.org/devcon8/
- Community hubs RFP and selection: https://forum.devcon.org/t/rfp-13-devcon-8-india-community-hubs-closed/8657 · https://forum.devcon.org/t/announcing-the-devcon-8-india-community-hubs/9191
- Resilient Networks Hub thread (Luminar proposed by Yash in a reply): https://forum.devcon.org/t/devcon-8-india-open-networks-observability-trillion-security-hub/8789
- P2P Networking Hub: https://forum.devcon.org/t/devcon-8-india-p2p-networking-hub/8748
- Open Source Hub CfS (closes 2026-10-10 23:59 IST): https://eventyay.com/fossasia/osh2026/cfp · https://forum.devcon.org/t/devcon-8-india-open-source-hub-proposal/8950
- ETHGlobal Mumbai: https://ethglobal.com/events/mumbai (HTTP 500 on 9 Oct) · https://ethglobal.com/events/mumbai/info/details (deadline verified)
- Supporters/Impact: https://devcon.org/en/supporters/
- Ethereum p2p context: https://github.com/ethereum/pm/issues/2262 · https://ethresear.ch/t/number-duplicate-messages-in-ethereums-gossipsub-network/19921 · https://probelab.io/ethereum/gossipsub/ · https://doi.org/10.1145/3809481.3812610 (Lean Gossip) · https://advisories.gitlab.com/pkg/cargo/libp2p-gossipsub/CVE-2026-34219/ · https://ethpandaops.io/posts/fusaka-bandwidth-estimation/ · gossipsub v1.4 proposal: https://arxiv.org/abs/2505.17337 · v2.0: https://github.com/libp2p/specs/pull/653
- OTLP spec 1.11: https://opentelemetry.io/docs/specs/otlp/ · messaging semconv: https://opentelemetry.io/docs/specs/semconv/messaging/messaging-spans/ · cardinality: https://opentelemetry.io/blog/2026/cardinality-limits-in-opentelemetry/
- PyPI (versions): https://pypi.org/pypi/opentelemetry-sdk/1.45.1/json · https://pypi.org/pypi/opentelemetry-proto/json · https://pypi.org/pypi/protobuf/7.36.2/json · https://pypi.org/project/otlp-json/
- Jaeger v2 (APIs page: 4318 accepts OTLP Protobuf or JSON; `/api/v3/traces/{id}` stable, port-16686 `/api/*` internal; docs pin 2.22.0): https://www.jaegertracing.io/docs/latest/architecture/apis/ · https://www.jaegertracing.io/docs/latest/getting-started/ · https://github.com/jaegertracing/jaeger/blob/main/docker-compose/monitor/docker-compose.yml
- Collector otlphttp exporter (`encoding: proto|json`) / prometheus receiver: https://github.com/open-telemetry/opentelemetry-collector/blob/main/exporter/otlphttpexporter/README.md · https://github.com/open-telemetry/opentelemetry-collector/tree/v0.158.0/receiver/otlpreceiver · https://www.dash0.com/guides/opentelemetry-prometheus-receiver · https://grafana.com/blog/how-to-collect-prometheus-metrics-with-the-opentelemetry-collector-and-grafana/
- rust-libp2p gossipsub metrics (Lighthouse names, labels and buckets): https://github.com/libp2p/rust-libp2p/blob/master/protocols/gossipsub/src/metrics.rs · Lighthouse `beacon_node/lighthouse_network/src/service/mod.rs` (`sub_registry_with_prefix("gossipsub")`) · Lighthouse `beacon_chain/src/metrics.rs` (`beacon_head_state_slot`, interop variants) · Lighthouse metrics port: https://lighthouse-book.sigmaprime.io/advanced_metrics.html
- Prysm metrics (`gossipsub_mesh_peer_counts`, `gossipsub_topic_msg_sent_bytes`, rest `p2p_pubsub_*`): https://raw.githubusercontent.com/prysmaticlabs/prysm/develop/beacon-chain/p2p/monitoring.go · Teku LIBP2P_GOSSIP (experimental category): https://github.com/Consensys/teku/pull/11368 · https://github.com/Consensys/teku/issues/11391 · js-libp2p-gossipsub: https://github.com/ChainSafe/js-libp2p-gossipsub/blob/master/src/metrics.ts · nim-libp2p `gossipsub.nim` · py-libp2p v0.8.0: https://github.com/libp2p/py-libp2p/releases/tag/v0.8.0
- Hermes / Xatu: https://github.com/probe-lab/hermes · https://github.com/ethpandaops/xatu · https://ethresear.ch/t/hermes-a-monitoring-light-node-for-ethereums-gossipsub-network/20639
- Render free tier and gRPC: https://render.com/articles/platforms-with-a-real-free-tier-for-developers-in-2026 · https://community.render.com/t/grpc-on-web-service/2470
- trio context semantics: https://trio.readthedocs.io/en/stable/reference-core.html
- SCL: https://github.com/AkashJana18/solana-consensus-lab (commit `a4f809c4`, Apache-2.0, no NOTICE file)
- Funding: https://esp.ethereum.foundation/applicants/wishlist · https://libp2p.io/blog/2025-report/ · https://octant.build/
- Live-demo practice: https://marcusnoble.co.uk/2025-04-30-my-tips-on-giving-technical-talks/ · https://lornajane.net/posts/2017/live-demo-risks-and-rewards

Still unverified: Luminar's slot/format at the Resilient Networks Hub and whether an organizer sync is scheduled; ETHGlobal Mumbai start date (Nov 5–7 from third parties only); Devcon Impact Program open/closed; Jaeger UI `/trace/{id}` deep-link path and Grafana `GF_AUTH_ANONYMOUS_*` env names (standard, not checked); ProbeLab "weekly reports" wording (the gossipsub page is a dashboard — wording changed above); Shadow/Testground characterisation.

---

## 11. Revision notes

What the two verifier passes changed (all applied above):

- Added the "Act today" callout: FOSSASIA Open Source Hub CfS closes 2026-10-10 23:59 IST; formats are 5-min lightning / 45-min workshop / 20-min AMA / 20-min quiz; recommended 45-min workshop with 5-min lightning fallback (§8 row, §9 week 1).
- F1: attackers were never snapshot nodes (`node_pool.py:195-212`, `injector.py:360-362/422-424`, `renderer.ts:37-39`), so nothing red could be drawn or clicked; added synthetic attacker nodes + d3 links (+0.75 d → 2.25 d).
- F1: attacker ids made deterministic (`sybil-0..n`) because real ids carry a uuid fault prefix (`injector.py:263/351/403`); `sybil-0` never existed.
- F1: eclipse attackers exempted from the spam/P4 step so the eclipse is silent and heals at `clear_faults`; demo rows 30–44 s rewritten ("mesh delivery stops; gossip pull keeps it alive"), new `demo-sybil-eclipse` scenario with phases at 10/16/24 s.
- F1: spam step specified as one `on_invalid_message` per attacker per heartbeat as a pre-pass (global scorer, `scoring.py:70-71`); `to_prune` becomes a dict so `reason` is known at emit; `ScenarioPhaseFired` emitted via `fault_injector._event_bus` (runner has no bus); test pins the two-heartbeat count.
- F2: end-to-end latency excludes IWANT hops (`latency_ms=0`, `engine.py:408`) and is reported as "mesh end-to-end"; added windowed `recent_delivery_ratio` because the lifetime mean cannot move inside a reel; narrator "healed" and ticker beats rekeyed (Sybil beat on invalid/duplicates, not delivery).
- F3: `launch_scenario` hard-codes `n_nodes=20` and partition groups `peer-0..19` (`main.py:740-744`, `library.py:7-8/55`) and never refreshes `_initial_edges` (`main.py:748`); recording now sends the full delta with `gap` frames; `record` name sanitised; demo copy changed from "scale-free" to "random" (+0.5 d → 3 d, per the verifier's combined estimate).
- F5: trace/span ids now include `run_id` (msg counter restarts per reconfigure/restart, `engine.py:125/184-185`) and `from_peer` (dropped-span collisions); smoke polls `/api/trace/recent` instead of assuming `/api/sim/play` publishes, and queries Jaeger's stable `/api/v3/traces/{id}`; Jaeger pinned to 2.22.0; metrics test builds the sim directly because `ASGITransport` skips the lifespan; semconv `messaging.operation.name/type` added and the span-name deviation documented.
- Metrics: Luminar now emits Lighthouse's label names and values (`hash`/`topic_hash`/`supports_partial`, `BadScore|Excess|Prune|Dc|Unsub`, `Random|Subscribed|Fanout|Outbound`) so bridge-row queries are not silently empty; score histogram gets two heatmap panels because bucket sets differ.
- Positioning/pitch/demo line corrected: only Lighthouse emits all three metric names; Prysm only `gossipsub_mesh_peer_counts`; Teku behind the experimental `LIBP2P_GOSSIP` flag and without `score_per_mesh`.
- Dependency hygiene: originally kept `numpy`/`scipy` for `nx.spring_layout` / `algebraic_connectivity`; the 2026-10-19 review replaced the layout with `nx.circular_layout` (positions are unused by the frontend) and dropped `algebraic_connectivity`, so `scipy` was removed; `numpy` stays (networkx layouts import it).
- F8: map both `beacon_head_state_slot`/`beacon_head_slot` and `beacon_head_state_finalized_epoch`/`beacon_finalized_epoch`; Lighthouse 5054 / Prysm 8080 / Nimbus 8008 ports now verified.
- F9: no Jaeger link for `spam-*` message ids (no `MessageTrace` exists for them).
- Line citations fixed: `node_pool.py:382` → `:198`; `manager.py:167` → `:134`; `manager.py:54` → `:21`/`:94`. `store.showParticles` → `store.particlesEnabled`.
- Removed `[P]`/"inferred" tags now verified: collector `encoding: json`, Jaeger OTLP/JSON on 4318, Render external gRPC, hub == topic 8789; kept only "slot/format unconfirmed".
- §8: hub row says Luminar was proposed by Yash in a reply and is not on the organizer programme; ETHGlobal deadline Sat Nov 7 09:00 IST marked verified (start date still third-party); Impact Program status "unknown — ask" instead of "likely closed".
- §6: `prune_backoff` injector reworded (CVE-2026-34219 is an integer-overflow crash, cited as motivation only); "v1.4 PREAMBLE" marked as proposed; "Waggle" dropped (not findable).
- §9: must total 12.75 d vs 14-day budget restated with cumulative days per week; checkpoint fallback (F6 → should) made explicit; nothing had to leave the must tier.

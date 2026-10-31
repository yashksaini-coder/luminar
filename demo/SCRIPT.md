# Luminar demo — script (step 1)

51.6 s · 1920×1080 · 30 fps · 100 BPM grid (0.6 s), every cut on a beat. Footage is the real UI
(web/out) stepped frame-by-frame by demo/record.mjs; the libp2p Day art bookends it. All numbers are
the sybil-eclipse recording's own (web/lib/reel-stats.json), nothing rounded up.

## Scene table

| # | Scene | In | Dur | Source | The one claim |
|---|---|---|---|---|---|
| 1 | Cold open | 0.0 | 4.8 | libp2p Day art + Luminar wordmark + py-libp2p mark | Peer scoring keeps gossip alive under attack; nobody has watched it work. |
| 2 | The mesh | 4.8 | 9.0 | shot `mesh`: T+5.4→9.9 at 0.5×, hero ticker | Fifty peers, one publish, every hop drawn. |
| 3 | Sybil flood → pruned | 13.8 | 7.8 | shot `sybil`: T+9.7→13.6 at 0.5× | P4 scores the spam; two heartbeats later all five are pruned. The one big hit lands at 19.2 (T+12.4, "5 · 5 pruned"). |
| 4 | The quiet attack | 21.6 | 7.8 | shot `eclipse`: T+15.8→23.6 at 1×, rails up, cursor clicks peer-10 | Four silent attackers eclipse peer-10; nothing invalid, so scoring never fires. The limit, on screen. |
| 5 | Heal | 29.4 | 6.0 | shot `heal`: T+23.4→29.4 at 1× | Faults cleared; the mesh re-grafts in 1.4 s; delivery back to 100 %. |
| 6 | Real network | 35.4 | 6.0 | shot `mainnet`: Geo layout, the slot-15466394 block wave at 0.5× (T+11.35→14.35) | Real mainnet block arrivals at 138 observer nodes (ethPandaOps, CC BY 4.0). |
| 7 | Honesty + stamp | 41.4 | 10.2 | libp2p Day art, cube, repo URL | Same mechanism, toy constants. Break it yourself. |

Arc: problem (1) → drop (2) → magic (3) → interaction (4) → proof (5, 6) → brand (7).

## Voiceover (deadpan; timecodes are line starts)

```
[00:00.0]  Peer scoring is what keeps gossip alive under attack.
[00:02.4]  Nobody has watched it work.
[00:04.8]  Luminar. Fifty simulated peers. GossipSub one point one.
[00:08.4]  One publish. Every hop. Drawn.
[00:13.8]  Five Sybils graft in, and flood.
[00:16.8]  P4 scores the spam. Two heartbeats.
[00:19.2]  Pruned. Nobody coordinated it.
[00:21.6]  Now the quiet attack. Four silent peers eclipse node ten.
[00:25.2]  Nothing invalid. Scoring never fires. That is the limit, on screen.
[00:29.4]  Clear the faults. The mesh re-grafts in one point four seconds.
[00:35.4]  And the real network. Mainnet blocks, arriving at a hundred and thirty-eight observers.
[00:41.4]  Same mechanism. Toy constants.
[00:44.4]  Break it yourself.
```

Air pockets: 18.6–19.2 (the beat before the prune lands: no voice, music drops to the bass);
46.2–51.6 (no voice: music swell and resolve under the repo URL).

## On-screen captions (burned master; the clean master has none)

| At | Until | Text |
|---|---|---|
| 0.6 | 4.6 | Luminar · GossipSub v1.1, run live, broken on purpose |
| 5.4 | 9.0 | 50 peers · one publish · every hop drawn |
| 15.0 | 18.4 | five Sybils graft in and flood |
| 19.2 | 21.4 | pruned by score · two heartbeats · nobody coordinated it |
| 22.8 | 26.0 | four silent attackers eclipse peer-10 |
| 26.0 | 29.2 | nothing invalid, so P4 never fires · only P3, floored at −0.25 |
| 30.2 | 35.2 | faults cleared · mesh healed in 1.4 s · delivery 100 % |
| 36.0 | 41.2 | real mainnet · slot 15466394 · 138 observers, in the order they saw the block (the app's own provenance box carries the arrival/ethPandaOps line) |
| 41.8 | 46.0 | same mechanism, toy constants · D 6, heartbeat 1 s, prune at −10 |
| 46.2 | 51.6 | github.com/yashksaini-coder/luminar |

## Sound (≈9 cues; one per story turn)

| t | sound | dB | why |
|---|---|---|---|
| 0.6 | stamp | −11 | wordmark stamps |
| 4.8 | dissolve | −13 | the one dissolve that sounds (the rest are silent) |
| 5.6 | blip | −14 | first publish (establishes the message sound, then silence) |
| 15.0 | thud | −12 | Sybils graft in |
| 19.2 | big-hit | −8 | PRUNED, the thesis moment |
| 22.8 | tap | −14 | click on peer-10 |
| 31.5 | resolve | −12 | mesh healed |
| 36.7 | swell | −13 | the block wave |
| 44.4 | stamp | −10 | "Break it yourself" |

Music: synthesized bed, 100 BPM, no drum kit; mood follows the scenes (warm → tension → release →
hollow → bright → wide → swell). demo/make-music.mjs renders it; a generator prompt is in demo/MUSIC-PROMPT.md
for a produced track later.

## Sync notes (frame contracts)

- "Pruned." lands on the frame the ticker flips to "5 · 5 pruned" (video 19.2, T+12.4); the big hit sits on that frame.
- The peer-10 click (22.8) is the only cursor in the film; the inspector must be open by 23.4.
- "Mesh healed in 1.4s" narrator card appears at 31.5 (T+25.5); the resolve chord lands on it.
- Silence from 46.2 to the end; music resolves with the last frame.

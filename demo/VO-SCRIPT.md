# Luminar, 51.6s demo, voiceover script

Read deadpan, unhurried; timecodes are line START times on the film clock.

```
[00:00.0]  Peer scoring is what keeps gossip alive under attack.
[00:03.4]  Nobody has watched it work.
[00:06.0]  Luminar. Fifty simulated peers. GossipSub one point one.
[00:09.4]  One publish. Every hop. Drawn.
[00:13.8]  Five Sybils graft in, and flood.
[00:16.5]  P4 scores the spam. Two heartbeats.
[00:19.2]  Pruned. Nobody coordinated it.
[00:21.6]  Now the quiet attack. Four silent peers eclipse node ten.
[00:25.6]  Nothing invalid. Scoring never fires. That is the limit, on screen.
[00:30.2]  Clear the faults. The mesh re-grafts in one point four seconds.
[00:35.4]  And the real network. Mainnet blocks, arriving at a hundred and thirty-eight observers.
[00:41.4]  Same mechanism. Toy constants.
[00:44.4]  Break it yourself.
```

Sync notes (never pasted): "Pruned." lands on the frame the ticker flips to "5 · 5 pruned" (00:19.2);
no voice from 00:18.6 to 00:19.2 (the beat before the prune lands) and from 00:46.2 to the end.
After generating, run `node retime-vo.mjs <file>` to cut the read at its silences and place each line on its timecode.

## Paste-ready block (MiniMax tags; paste unedited)

```
{neutral}Peer scoring is what keeps gossip alive under attack.{/neutral}<#0.2#>{neutral}Nobody has watched it work.{/neutral}<#0.7#>{neutral}Luminar. Fifty simulated peers. GossipSub one point one.{/neutral}<#0.3#>{fluent}One publish. Every hop. Drawn.{/fluent}<#2.4#>{neutral}Five Sybils graft in, and flood.{/neutral}<#0.4#>{neutral}P4 scores the spam. Two heartbeats.{/neutral}<#0.4#>(breath){fluent}Pruned. Nobody coordinated it.{/fluent}<#0.9#>{neutral}Now the quiet attack. Four silent peers eclipse node ten.{/neutral}<#0.2#>{neutral}Nothing invalid. Scoring never fires. That is the limit, on screen.{/neutral}<#0.3#>{neutral}Clear the faults. The mesh re-grafts in one point four seconds.{/neutral}<#1.0#>{neutral}And the real network. Mainnet blocks, arriving at a hundred and thirty-eight observers.{/neutral}<#1.0#>{neutral}Same mechanism. Toy constants.{/neutral}<#1.5#>(breath){fluent}Break it yourself.{/fluent}
```

ElevenLabs instead: generate line by line with previousText/nextText, stability 0.55, style 0.2, speed 1.0; then retime.

# Demo pipeline progress

Read first in every session; resume from the last open question.

| Step | Status | Artifacts |
|---|---|---|
| 1 Script | done, approved 2026-10-31 (light bookends on the libp2p Day art) | demo/SCRIPT.md, web/remotion/demo/script.json (source of truth) |
| 2 Standalone UI | done (the static export is the standalone UI) | web/out via `npm run build`; demo/serve.mjs |
| 3 Composition | done, reviewed (one fix round: PROVENANCE tokenised) | web/remotion/demo/ (Remotion, id `Demo`; `cd web && npm run studio`) |
| 4 Record | done: 5 clips, landings verified (prune 19.2, click 22.8, wave 36.7) | demo/record.mjs, demo/shots.mjs, demo/encode.mjs → web/public/demo/shots/*.mp4 + *.json |
| 5 Captions + VO | done: ElevenLabs read (Jesse, 2026-10-31) retimed at 1.08× onto the clock, placed starts written back to script.json vo[].at; source kept at web/public/demo/audio/vo-source.mp3 (gitignored) | demo/captions.mjs → demo/out/demo.srt/.vtt; demo/vo-script.mjs → demo/VO-SCRIPT.md; demo/retime-vo.mjs → web/public/demo/audio/vo-final.wav |
| 6 Sound | done, reviewed (8 cues measured: peak −1 dBFS, hit offsets in sounds.json) | demo/make-sfx.sh → web/public/demo/audio/sfx/*.wav + sounds.json; cues in script.json |
| 7 Music | done, reviewed (bed 51.600 s, −18.4 LUFS, −3.0 dBTP, pocket 7.5 dB under the release) | demo/make-music.mjs → web/public/demo/audio/bed.wav, demo/MUSIC-PROMPT.md |
| 8 Assemble | done 2026-10-31: masters at −13.9 LUFS / −1.0 dBTP, peaks verified at every cue | web/video-out/demo-16x9.mp4, demo-16x9-captions.mp4, demo-16x9-1080p.mp4, demo.srt, demo.vtt (`node finish.mjs`) |

Open question: owner's listen of the draft/masters; optional VO (demo/VO-SCRIPT.md) and produced music (demo/MUSIC-PROMPT.md) hand-ins; commit.

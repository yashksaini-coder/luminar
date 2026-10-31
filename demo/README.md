# Luminar demo film

A 51.6 s screencast of the real UI, scored and captioned, built deterministically from a clean checkout:
no screen recording, no third-party audio. Progress and the next open question live in `PROGRESS.md`;
the story in `SCRIPT.md`; every time and number in `web/remotion/demo/script.json` (the one source of truth).

```
make demo-record   # web/out → demo/out/frames/<shot>/f*.png → web/public/demo/shots/<shot>.mp4 (+ .json cursor path)
make demo-draft    # 540p draft with sound → demo/out/render/draft.mp4
make demo-render   # SFX + bed, then both masters + review copy + SRT/VTT → web/video-out/
```

## How it works

1. **Footage** — `record.mjs` serves `web/out` (`serve.mjs`), opens a reel page in headless Chromium under
   Playwright's fake clock, seeks with the app's own scrubber, presses the app's own Play, and then advances the
   clock one frame at a time (`clock.runFor(1000/30)`) between screenshots. The reel replay (`setInterval` +
   `performance.now`), particles and deck.gl (`requestAnimationFrame`) all run on that clock, so a slow frame
   costs render time, never a dropped frame. `shots.mjs` lists the shots (reel moment, speed, timed clicks);
   `skipFrames` trims a clip so a landing sits on the 100 BPM grid when the seek can only hit a snapshot.
   Clicks are real: the pointer glides to the peer's projected position and clicks it; the path is written to
   `<shot>.json` for the composition's cursor overlay.
2. **Composition** — Remotion `Demo` in `web/remotion/demo/` (`cd web && npx remotion studio`): the clips as
   `<OffthreadVideo>`, light bookends on the libp2p Day art, caption stamps (`captions` prop; the clean master
   has none), a Bayer pixel dissolve on every cut, the cursor overlay, and the soundtrack cued from `script.json`.
3. **Sound** — `make-sfx.sh` synthesizes the cue sounds with ffmpeg and measures each file's peak and hit offset
   into `web/public/demo/audio/sounds.json`; `make-music.mjs` renders the 100 BPM bed whose mood follows the
   scenes (`MUSIC-PROMPT.md` has the generator prompt if you want a produced track instead).
4. **Captions and voice** — `captions.mjs` projects the caption table to SRT/VTT; `vo-script.mjs` writes
   `VO-SCRIPT.md` with the paste-ready tagged block; `retime-vo.mjs vo.mp3` cuts a generated read at its
   silences and places every line on its timecode, then `node finish.mjs --vo demo/audio/vo-final.wav`.
5. **Assemble** — `finish.mjs` renders both masters, masters the soundtrack to −14 LUFS / −1 dBTP once and
   remuxes it onto both, writes the 1080p review copy and the sidecars, and verifies peaks at the cue times.

Generated files (`demo/out/`, `web/public/demo/shots/`, `demo/node_modules/`) are gitignored.

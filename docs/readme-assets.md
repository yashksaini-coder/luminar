# README assets

Everything under `assets/readme/` is reproducible from a running `make dev` at 1440×840 and the
HTML sources in `assets/readme/src/` (they load Geist from the vendored woff2 files in
`assets/readme/fonts/`, OFL-1.1, from `@fontsource/geist` and `@fontsource/geist-mono` 5.3.0).

The screen captures are taken from the static export (`make build`, then serve `web/out`) in headless
Chromium at 1440×840, device scale 1; the GIFs are real-time screencasts of the recordings.

| file | how |
|---|---|
| `banner.png` 2560×800 | open `src/banner.html` in Chrome at 1280×400, device scale 2, screenshot; `magick -colors 255 PNG8:` to shrink |
| `social-preview.png` 1280×640 | `src/banner-social.html` at 1280×640, scale 1; upload under repo Settings → Social preview |
| `loud-vs-quiet.png` 1600×900 | `src/figure-loud-quiet.html` at 1600×900, scale 1 |
| `landing.png` | `/` |
| `demo-sybil-eclipse.gif` | `/reels/sybil-eclipse/?theme=stage&hero=1&t=8`, press Space, screencast 21 s, encode at `fps=10,scale=760` with the palette line below |
| `mainnet-wave.gif` | `/reels/mainnet-block-wave/?theme=stage&hero=1`, press Space, screencast 16 s, `fps=8,scale=760` |
| `ui-main.png` | `/reels/sybil-eclipse/?t=13&peer=peer-7`, press `f` |
| `ui-radial.png` | `/reels/sybil-eclipse/?t=13`, Radial tab |
| `globe.png` | `/figure/?press=Post@300,Heartbeat@1500,Sybil@2500,Heartbeat@4000`, at 6.2 s |
| `stage-hero.png` | `/reels/sybil-eclipse/?theme=stage&hero=1&t=12.4` |
| `grafana.png` | `make otel-up`, backend with `OTEL_EXPORTER_OTLP_ENDPOINT`, run `demo_sybil_eclipse`, then `http://127.0.0.1:3000/d/luminar-gossipsub?kiosk&from=now-4m&to=now` |
| `jaeger.png` | `make otel-smoke` prints the trace URL |

GIF encode (two-pass palette, no dither, diff-rect frames keep the static map cheap):

```bash
ffmpeg -ss 9.5 -t 20 -i rec.mp4 \
  -vf "setpts=0.8*PTS,fps=8,scale=720:-1:flags=lanczos,split[q][r];[q]palettegen=max_colors=96:stats_mode=diff[p];[r][p]paletteuse=dither=none:diff_mode=rectangle" \
  assets/readme/demo-sybil-eclipse.gif
```

Targets: GIFs under 5 MB (GitHub renders them inline but caches through camo), PNGs under 300 KB,
captions in the alt text as full sentences describing what the frame shows.

#!/usr/bin/env bash
# Synthesizes the launch-video soundtrack (no third-party audio) into public/audio/ with ffmpeg only.
# Run from web/: scripts/make-sfx.sh. Mono 48 kHz 16-bit WAVs; levels are set again in LaunchV2's <Audio volume>.
set -euo pipefail
out="$(dirname "$0")/../public/audio"
mkdir -p "$out"
sr=48000
gen() { ffmpeg -hide_banner -loglevel error -y "$@"; }

# Low drone bed: A1 + E2 + A2, each breathing on its own slow LFO, low-passed, 48 s with soft ends.
# 16 kHz is plenty under a 420 Hz low-pass and keeps the 48 s file at 1.5 MB in public/.
gen -f lavfi -i "aevalsrc='0.28*sin(2*PI*55*t)*(0.7+0.3*sin(2*PI*0.11*t))+0.155*sin(2*PI*82.41*t)*(0.6+0.4*sin(2*PI*0.07*t+1))+0.07*sin(2*PI*110.3*t)*(0.5+0.5*sin(2*PI*0.05*t+2))':s=16000:d=48" \
  -af "lowpass=f=420,afade=t=in:d=2,afade=t=out:st=45:d=3" -c:a pcm_s16le "$out/drone.wav"

# Heartbeat tick: a 1.8 kHz ping that dies in ~30 ms.
gen -f lavfi -i "aevalsrc='0.6*sin(2*PI*1800*t)*exp(-90*t)':s=$sr:d=0.06" -c:a pcm_s16le "$out/tick.wav"

# Message burst blip: a fifth (880 + 1320 Hz), fast decay.
gen -f lavfi -i "aevalsrc='0.4*(sin(2*PI*880*t)+0.5*sin(2*PI*1320*t))*exp(-30*t)*min(1\,t*400)':s=$sr:d=0.2" -c:a pcm_s16le "$out/blip.wav"

# Prune down-sweep: a linear chirp 900 -> 110 Hz over 0.7 s.
gen -f lavfi -i "aevalsrc='0.6*sin(2*PI*(900*t-790*t*t/1.4))*exp(-3.5*t)*min(1\,t*200)':s=$sr:d=0.7" -c:a pcm_s16le "$out/sweep.wav"

# Transition swell: pink noise, low-passed, rising into the cut then gone.
gen -f lavfi -i "anoisesrc=c=pink:a=0.5:d=1.4:r=$sr:s=7" \
  -af "lowpass=f=1200,afade=t=in:d=1.1:curve=exp,afade=t=out:st=1.1:d=0.3" -c:a pcm_s16le "$out/swell.wav"

# End-card resolve: an A major triad that blooms and fades over 4 s.
gen -f lavfi -i "aevalsrc='0.12*(sin(2*PI*220*t)+sin(2*PI*277.18*t)+sin(2*PI*329.63*t))*exp(-0.8*t)*min(1\,t*20)':s=$sr:d=4" \
  -af "lowpass=f=2000" -c:a pcm_s16le "$out/resolve.wav"

ls -l "$out"

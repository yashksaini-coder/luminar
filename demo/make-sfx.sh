#!/usr/bin/env bash
# Synthesizes the demo's sound effects with ffmpeg only (no third-party audio), one file per sound
# name that web/remotion/demo/script.json cues, into web/public/demo/audio/sfx/<name>.wav
# (mono 48 kHz 16-bit, peak -1 dBFS). Then measures each file and writes
# web/public/demo/audio/sounds.json: { name: { file, hit, peakDb } } where `hit` is the first
# 5 ms window whose peak is within 3 dB of the file peak, so a player starting the file at
# cue.t - hit lands the impact on the cue. Run: demo/make-sfx.sh
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
audio="$root/web/public/demo/audio"
out="$audio/sfx"
mkdir -p "$out"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
sr=48000
gen() { ffmpeg -hide_banner -loglevel error -y "$@"; }
src() { printf -- "-f lavfi -i aevalsrc=%s:s=%s:d=%s" "$1" "$sr" "$2"; }
noise='(2*random(0)-1)'

# Each sound renders raw into $tmp, then norm() peak-normalizes it to -1 dBFS into $out.
norm() {
  local max
  max=$(ffmpeg -i "$tmp/$1.wav" -af volumedetect -f null - 2>&1 | sed -n 's/.*max_volume: \([-0-9.]*\) dB.*/\1/p')
  gen -i "$tmp/$1.wav" -af "volume=$(awk -v m="$max" 'BEGIN { printf "%.3f", -1 - m }')dB" \
    -ar $sr -ac 1 -c:a pcm_s16le "$out/$1.wav"
}

# stamp: felt/rubber impact. A 93->62 Hz thump with a fast decay under a band-passed noise click, 120 ms.
gen -f lavfi -i "aevalsrc='sin(2*PI*(62*t+0.7*(1-exp(-45*t))))*exp(-28*t)*min(1\,t*3000)':s=$sr:d=0.12" \
    -f lavfi -i "aevalsrc='$noise*exp(-180*t)':s=$sr:d=0.12" \
    -filter_complex "[1]bandpass=f=2400:w=1800[c];[0][c]amix=inputs=2:normalize=0:weights='1 0.6',afade=t=out:st=0.10:d=0.02" \
    -c:a pcm_s16le "$tmp/stamp.wav"

# dissolve: 0.5 s of pink noise under a low-pass that opens 150 -> 9 kHz; no tonal content.
printf "0.0-0.5 [expr] lowpass f 'lerp(150,9000,TI*TI)'\n" > "$tmp/dissolve.cmd"
gen -f lavfi -i "anoisesrc=c=pink:r=$sr:d=0.5:s=11" \
    -af "asendcmd=f=$tmp/dissolve.cmd,lowpass=f=150,afade=t=in:d=0.4:curve=cub,afade=t=out:st=0.44:d=0.06" \
    -c:a pcm_s16le "$tmp/dissolve.wav"

# blip: the softest plastic tick, a 1.5 kHz damped sine, 40 ms.
gen -f lavfi -i "aevalsrc='sin(2*PI*1500*t)*exp(-110*t)*min(1\,t*4000)':s=$sr:d=0.04" \
    -af "afade=t=out:st=0.035:d=0.005" -c:a pcm_s16le "$tmp/blip.wav"

# thud: heavier than stamp. A detuned 50/51.5 Hz pair, 250 ms, with a low knock.
gen -f lavfi -i "aevalsrc='(sin(2*PI*(50*t+0.6*(1-exp(-30*t))))+sin(2*PI*(51.5*t+0.6*(1-exp(-30*t)))))*0.5*exp(-13*t)*min(1\,t*2000)':s=$sr:d=0.25" \
    -f lavfi -i "aevalsrc='$noise*exp(-70*t)':s=$sr:d=0.25" \
    -filter_complex "[1]bandpass=f=350:w=300[k];[0][k]amix=inputs=2:normalize=0:weights='1 0.35',lowpass=f=900,afade=t=out:st=0.22:d=0.03" \
    -c:a pcm_s16le "$tmp/thud.wav"

# big-hit: the one big one. Sub thump (72 -> 42 Hz) + mid impact + a short bright transient, 600 ms with the sub's tail.
gen -f lavfi -i "aevalsrc='sin(2*PI*(42*t+1.2*(1-exp(-25*t))))*exp(-5.5*t)*min(1\,t*2000)':s=$sr:d=0.6" \
    -f lavfi -i "aevalsrc='$noise*exp(-35*t)':s=$sr:d=0.6" \
    -f lavfi -i "aevalsrc='$noise*exp(-220*t)':s=$sr:d=0.6" \
    -filter_complex "[1]bandpass=f=500:w=500[m];[2]highpass=f=4000[b];[0][m][b]amix=inputs=3:normalize=0:weights='1 0.7 0.5',afade=t=out:st=0.52:d=0.08" \
    -c:a pcm_s16le "$tmp/big-hit.wav"

# tap: clean plastic click, 25 ms. Band-passed noise burst with a 2.6 kHz tick.
gen -f lavfi -i "aevalsrc='$noise*exp(-350*t)':s=$sr:d=0.025" \
    -f lavfi -i "aevalsrc='sin(2*PI*2600*t)*exp(-250*t)*min(1\,t*8000)':s=$sr:d=0.025" \
    -filter_complex "[0]bandpass=f=3500:w=2500[n];[n][1]amix=inputs=2:normalize=0:weights='1 0.5',afade=t=out:st=0.02:d=0.005" \
    -c:a pcm_s16le "$tmp/tap.wav"

# resolve: warm two-note rise, Eb4 then Bb4 (a perfect fifth) 180 ms later, sines with 2nd/3rd harmonics, 900 ms.
note='(sin(2*PI*F*t)+0.4*sin(2*PI*2*F*t)+0.2*sin(2*PI*3*F*t))*exp(-2.6*t)*min(1\,t*80)'
gen -f lavfi -i "aevalsrc='${note//F/311.13}':s=$sr:d=0.9" \
    -f lavfi -i "aevalsrc='${note//F/466.16}':s=$sr:d=0.72" \
    -filter_complex "[1]adelay=180:all=1[b];[0][b]amix=inputs=2:normalize=0:weights='0.8 1',lowpass=f=3000,afade=t=out:st=0.65:d=0.25" \
    -c:a pcm_s16le "$tmp/resolve.wav"

# swell: 1.2 s. Pink noise under an opening low-pass plus a low Eb pad, soft peak at ~0.85 s then release.
printf "0.0-0.85 [expr] lowpass f 'lerp(300,2600,TI)'\n" > "$tmp/swell.cmd"
gen -f lavfi -i "anoisesrc=c=pink:r=$sr:d=1.2:s=5" \
    -f lavfi -i "aevalsrc='0.5*(sin(2*PI*77.78*t)+sin(2*PI*116.54*t)+0.6*sin(2*PI*155.56*t))':s=$sr:d=1.2" \
    -filter_complex "[0]asendcmd=f=$tmp/swell.cmd,lowpass=f=300[n];[n][1]amix=inputs=2:normalize=0:weights='0.6 1',afade=t=in:d=0.85:curve=cub,afade=t=out:st=0.85:d=0.35:curve=qsin" \
    -c:a pcm_s16le "$tmp/swell.wav"

# Normalize, measure, write sounds.json (file paths relative to web/public for Remotion's staticFile).
measurements=""
for f in "$tmp"/*.wav; do
  name="$(basename "$f" .wav)"
  norm "$name"
  peak=$(ffmpeg -i "$out/$name.wav" -af volumedetect -f null - 2>&1 | sed -n 's/.*max_volume: \([-0-9.]*\) dB.*/\1/p')
  hit=$(cd "$out" && ffprobe -v error -f lavfi -i "amovie=$name.wav,asetnsamples=240,astats=metadata=1:reset=1" \
    -show_entries frame=pts_time:frame_tags=lavfi.astats.Overall.Peak_level -of csv=p=0 \
    | awk -F, -v p="$peak" 'h == "" && $2 + 0 >= p - 3 { h = $1 } END { print h }')
  measurements+="$name $hit $peak"$'\n'
  echo "$name: peak ${peak} dBFS, hit at ${hit} s"
done

printf '%s' "$measurements" | node -e '
  const fs = require("fs");
  const rows = fs.readFileSync(0, "utf8").trim().split("\n").map(l => l.split(" "));
  const sounds = Object.fromEntries(rows.map(([name, hit, peak]) =>
    [name, { file: `demo/audio/sfx/${name}.wav`, hit: +(+hit).toFixed(3), peakDb: +peak }]));
  const script = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
  const missing = [...new Set(script.cues.map(c => c.sound))].filter(s => !sounds[s]);
  if (missing.length) { console.error("no file for cued sound(s): " + missing.join(", ")); process.exit(1); }
  fs.writeFileSync(process.argv[2], JSON.stringify(sounds, null, 2) + "\n");
' "$root/web/remotion/demo/script.json" "$audio/sounds.json"
ls -l "$out" "$audio/sounds.json"

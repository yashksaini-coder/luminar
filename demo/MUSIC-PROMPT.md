# Music bed: generator prompt and swap-in

The shipped bed is synthesized by `demo/make-music.mjs` (no third-party audio) from
`web/remotion/demo/script.json`: 100 BPM, the film's exact length, chords on the beat grid, the
air pocket 18.6–19.2 cut to the sub bass and the release on 19.2. A produced track can replace it;
paste the prompt below into the generator, then follow the swap-in steps. The film is 51.6 s
(last scene end in script.json), so ask for about 60 s and trim.

## Paste-ready prompt

```
Soft electric piano, a warm analog pad with a slow low-pass filter, a round sub bass and a faint
high shimmer. 100 BPM, 4/4, in E-flat major, chords change on the bar. No drum kit, no snare, no
claps, no hi-hats, no percussion of any kind, no vocals. Starts immediately at the full
arrangement with no intro build. Mood arc: calm and airy, then warm and hopeful, a short stretch
of minor tension that resolves into a bright major chord, then quiet and hollow, then bright
again, then wide and spacious, ending on a slow swell that rings out and decays to silence.
About 60 seconds. Background bed under a spoken voiceover.
```

## Swap a produced track in

The film's composition applies the final gain and the ducking under the voice, so the bed file
only has to be the right length, at the right level, with the voice band carved out.

1. Find the arrival point by measurement, not by ear. Scan mean volume in 4 s windows, then in
   0.5 s windows around the jump; the first window at the track's steady level is the trim point
   (call it `ARRIVE`, e.g. `2.5`):

   ```sh
   for t in 0 4 8 12 16 20 24; do
     ffmpeg -ss $t -t 4 -i track.mp3 -af volumedetect -f null - 2>&1 | grep mean_volume
   done
   for t in 0 0.5 1 1.5 2 2.5 3 3.5; do   # around the jump
     ffmpeg -ss $t -t 0.5 -i track.mp3 -af volumedetect -f null - 2>&1 | grep mean_volume
   done
   ```

2. Trim to the film length from `ARRIVE`, carve the voice body (250 Hz) and presence (2.8 kHz),
   fade 0.2 s in at the cut and 2.5 s out finishing with the picture, and measure the result.
   `51.6` is the film length and `49.1` is `51.6 - 2.5`; both follow script.json's last scene end.

   ```sh
   ffmpeg -y -ss $ARRIVE -t 51.6 -i track.mp3 \
     -af "equalizer=f=250:t=q:w=1.0:g=-3,equalizer=f=2800:t=q:w=1.1:g=-4.5,afade=t=in:d=0.2,afade=t=out:st=49.1:d=2.5" \
     -ar 48000 -ac 2 -c:a pcm_s16le /tmp/bed-trim.wav
   ffmpeg -i /tmp/bed-trim.wav -af loudnorm=print_format=summary -f null - 2>&1 | grep -E "Input Integrated|Input True Peak"
   ```

3. Level it to about -18 LUFS integrated with true peaks at or below -3 dBTP: the gain is
   `-18 - <Input Integrated>`, capped at `-3 - <Input True Peak>`. Apply it as a plain volume
   change (not single-pass loudnorm, which rewrites the dynamics) and write the bed:

   ```sh
   ffmpeg -y -i /tmp/bed-trim.wav -af "volume=<gain>dB" -c:a pcm_s16le web/public/demo/audio/bed.wav
   ```

4. Verify what the synthesized bed is verified on: `ffprobe -show_entries format=duration` reads
   51.600000, `volumedetect` max_volume is at or below -3 dB, and the last 0.1 s
   (`ffmpeg -ss 51.5 -t 0.1 -i bed.wav -af astats -f null -`) is below -60 dBFS RMS.

A produced track will not carry the authored air pocket (sub bass only, 18.6–19.2) or the release
chord exactly on 19.2; only the composition's ducking marks those. If that moment matters, keep
the synthesized bed.

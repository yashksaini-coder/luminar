#!/usr/bin/env node
// Synthesizes the demo's music bed (no third-party audio, no dependencies): a small additive synth
// that writes web/public/demo/audio/bed.wav, 16-bit stereo 48 kHz, exactly the film's length.
// Every time comes from web/remotion/demo/script.json (bpm, scenes, airPockets); nothing is retyped.
// Instruments: pad (two detuned band-limited saws through a 24 dB/oct low-pass with a slow
// envelope), electric-piano voice (sine + 2nd/3rd/5th partials, ~1.2 s exponential decay), sub
// bass (sine an octave below the chord root, short envelope) and a shimmer (high partials with a
// slow tremolo, mainnet only). A dotted-eighth feedback delay and a Schroeder reverb sit on sends.
// The bed is then measured with ffmpeg's loudnorm and scaled to about -18 LUFS integrated with
// peaks at or below -3 dBFS; the composition applies the final gain. Run: node demo/make-music.mjs
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const script = JSON.parse(readFileSync(join(root, 'web/remotion/demo/script.json'), 'utf8'))
const OUT = join(root, 'web/public/demo/audio/bed.wav')
const TARGET_LUFS = -18
const PEAK_CEILING_DB = -3

const SR = 48000
const BEAT = 60 / script.bpm
const BAR = 4 * BEAT
const S = Object.fromEntries(script.scenes.map(s => [s.id, s]))
const endOf = s => s.at + s.dur
const LEN = endOf(S.end)
const [[pocketIn, release], [swellAt]] = script.airPockets
const N = Math.round(LEN * SR)
const TAU = 2 * Math.PI
const midi = m => 440 * 2 ** ((m - 69) / 12)

// Buses (float, stereo): dry non-sub, sub, delay send (mono) and reverb send.
const dryL = new Float64Array(N), dryR = new Float64Array(N)
const subBus = new Float64Array(N)
const dlySend = new Float64Array(N)
const revL = new Float64Array(N), revR = new Float64Array(N)

// ---- instruments ---------------------------------------------------------------------------

// Band-limited saw wavetables keyed by harmonic count (sum of sin(h x)/h), 4096 points.
const tables = new Map()
function saw(H) {
  if (!tables.has(H)) {
    const t = new Float64Array(4097)
    for (let i = 0; i < 4096; i++) {
      let v = 0
      for (let h = 1; h <= H; h++) v += Math.sin(TAU * h * i / 4096) / h
      t[i] = v * 0.6
    }
    t[4096] = t[0]
    tables.set(H, t)
  }
  return tables.get(H)
}

// RBJ low-pass biquad, 12 dB/oct; the pad cascades two.
function biquad() {
  let b0 = 1, b1 = 0, b2 = 0, a1 = 0, a2 = 0, z1 = 0, z2 = 0
  return {
    set(fc, q = 0.8) {
      const w = TAU * Math.min(fc, SR * 0.45) / SR, c = Math.cos(w), al = Math.sin(w) / (2 * q), a0 = 1 + al
      b0 = (1 - c) / 2 / a0; b1 = (1 - c) / a0; b2 = b0; a1 = -2 * c / a0; a2 = (1 - al) / a0
    },
    run(x) { const y = b0 * x + z1; z1 = b1 * x - a1 * y + z2; z2 = b2 * x - a2 * y; return y },
  }
}

const smooth = x => (x = Math.max(0, Math.min(1, x)), x * x * (3 - 2 * x))

/** Pad chord from t0 for dur seconds (plus release). level/levelTo and cutFrom/cutTo ramp over `rise`. */
function pad(t0, dur, notes, o) {
  const { level = 0.5, levelTo = level, attack = 0.4, release: rel = 0.6, cutFrom = 800, cutTo = 1600,
    rise = 1, detune = 7, width = 0.6, reverb = 0.35 } = o
  const n = Math.round((dur + rel) * SR), i0 = Math.round(t0 * SR)
  const L = new Float64Array(n), R = new Float64Array(n)
  for (const m of notes) {
    const f = midi(m), H = Math.max(2, Math.min(32, Math.floor(7000 / f)))
    const tbl = saw(H)
    for (const [cents, pan] of [[-detune, -width], [detune, width]]) {
      const inc = f * 2 ** (cents / 1200) / SR * 4096
      const gl = Math.cos((pan + 1) * Math.PI / 4), gr = Math.sin((pan + 1) * Math.PI / 4)
      let ph = (m * 37 % 4096)
      for (let i = 0; i < n; i++) {
        const k = ph | 0, fr = ph - k, v = tbl[k] + (tbl[k + 1] - tbl[k]) * fr
        L[i] += v * gl; R[i] += v * gr
        ph += inc; if (ph >= 4096) ph -= 4096
      }
    }
  }
  const fl = [biquad(), biquad()], fr = [biquad(), biquad()]
  for (let i = 0; i < n; i++) {
    const t = i / SR
    if (i % 32 === 0) {
      const fc = cutFrom + (cutTo - cutFrom) * smooth(t / rise)
      for (const f of [...fl, ...fr]) f.set(fc)
    }
    const env = (t < attack ? smooth(t / attack) : 1) * (t > dur ? 0.5 * (1 + Math.cos(Math.PI * Math.min(1, (t - dur) / rel))) : 1)
    const g = env * (level + (levelTo - level) * smooth(t / rise)) / notes.length
    const l = fr[1].run(fr[0].run(L[i])) * g, r = fl[1].run(fl[0].run(R[i])) * g
    const j = i0 + i; if (j >= N) break
    dryL[j] += l; dryR[j] += r; revL[j] += l * reverb; revR[j] += r * reverb
  }
}

/** Electric-piano note. decay = seconds to about -20 dB; partials decay faster the higher they sit. */
function ep(t0, notes, vel, { decay = 1.2, pan = 0, delay = 0.25, reverb = 0.3 } = {}) {
  const tau = decay / 2.3
  const partials = [[1, 1], [2, 0.45], [3, 0.22], [5, 0.08]]
  const n = Math.round(Math.min(decay * 2.2, LEN - t0) * SR), i0 = Math.round(t0 * SR)
  notes.forEach((m, k) => {
    const f = midi(m), p = pan + (k - (notes.length - 1) / 2) * 0.12
    const gl = Math.cos((p + 1) * Math.PI / 4), gr = Math.sin((p + 1) * Math.PI / 4)
    for (let i = 0; i < n; i++) {
      const t = i / SR, j = i0 + i
      let v = 0
      for (const [h, a] of partials) v += a * Math.sin(TAU * f * h * t) * Math.exp(-t / (tau / h ** 0.6))
      v *= vel * 0.35 / Math.sqrt(notes.length) * Math.min(1, t / 0.004)
      dryL[j] += v * gl; dryR[j] += v * gr
      dlySend[j] += v * delay; revL[j] += v * gl * reverb; revR[j] += v * gr * reverb
    }
  })
}

/** Light 8th-note arpeggio through `notes` (up then down), short EP voice. */
function arp(t0, t1, notes, vel = 0.2) {
  const seq = [...notes, ...notes.slice(1, -1).reverse()]
  let k = 0
  for (let t = t0; t < t1 - 1e-9; t += BEAT / 2, k++) ep(t, [seq[k % seq.length]], vel, { decay: 0.5, pan: (k % 2 ? 0.35 : -0.35), delay: 0.5, reverb: 0.2 })
}

/** Sub bass: sine an octave below `root` (MIDI), short envelope (exp decay `tau`). Dry only. */
function sub(t0, root, { tau = 0.25, level = 0.8 } = {}) {
  const f = midi(root - 12), n = Math.round(Math.min(tau * 7, LEN - t0) * SR), i0 = Math.round(t0 * SR)
  for (let i = 0; i < n; i++) {
    const t = i / SR
    subBus[i0 + i] += level * Math.sin(TAU * f * t) * Math.exp(-t / tau) * Math.min(1, t / 0.006)
  }
}

/** Shimmer: high sine partials of each note with a slow tremolo, wide, into the reverb. */
function shimmer(t0, dur, notes, { level = 0.12, attack = 1.2, release: rel = 1.5, reverb = 0.9 } = {}) {
  const n = Math.round((dur + rel) * SR), i0 = Math.round(t0 * SR)
  notes.forEach((m, k) => {
    const f = midi(m)
    ;[6, 8, 12].forEach((h, q) => {
      const fh = f * h; if (fh > 5000) return
      const pan = ((k + q) % 2 ? 0.8 : -0.8), rate = 3.6 + 0.35 * ((k * 3 + q) % 4), phase = (k + q) * 1.3
      const gl = Math.cos((pan + 1) * Math.PI / 4), gr = Math.sin((pan + 1) * Math.PI / 4)
      for (let i = 0; i < n; i++) {
        const t = i / SR, j = i0 + i; if (j >= N) break
        const env = (t < attack ? smooth(t / attack) : 1) * (t > dur ? 0.5 * (1 + Math.cos(Math.PI * Math.min(1, (t - dur) / rel))) : 1)
        const trem = 0.7 + 0.3 * Math.sin(TAU * rate * t + phase)
        const v = level * env * trem * Math.sin(TAU * fh * t) / (h / 6) / notes.length
        dryL[j] += v * gl * 0.5; dryR[j] += v * gr * 0.5; revL[j] += v * gl * reverb; revR[j] += v * gr * reverb
      }
    })
  })
}

// ---- the score ------------------------------------------------------------------------------
// Voicings (MIDI). The first note is the chord root the sub plays an octave below.
const CH = {
  EbAir: [51, 58, 62, 67],       // Eb Bb D G: open and airy
  Ebmaj7: [51, 55, 58, 62],
  BbOverD: [50, 53, 58, 62],
  Cm7: [48, 51, 55, 58],
  Abmaj7: [44, 48, 51, 55],
  CmRub: [48, 51, 55, 56, 60],   // C minor with Ab against the G: the minor-second rub
  EbBig: [39, 51, 55, 58, 63, 67],
  Abmaj7sus2: [44, 46, 51, 55],
  Fmadd9: [41, 44, 48, 55],
  Bb: [46, 50, 53, 58],
  Eb: [51, 55, 58, 63],
  EbWide: [51, 58, 67, 74],
  AbWide: [44, 51, 55, 60, 67],
  Cm9: [48, 55, 58, 62],
  Ab: [44, 48, 51, 55, 60],
  EbFinal: [51, 55, 58, 63, 67, 70, 75], // Eb with the octave doubled
}
const top = (c, k = 3) => c.slice(-k)
const upper = c => top(c).map(m => m + 12)

// open: sparse airy pad, a slow sub pulse once a bar.
pad(S.open.at, S.open.dur, CH.EbAir, { level: 0.32, attack: 1.6, release: 1.0, cutFrom: 500, cutTo: 1400, rise: 4, reverb: 0.6 })
for (let t = S.open.at; t < S.mesh.at - 1e-9; t += BAR) sub(t, CH.EbAir[0], { tau: 0.5, level: 0.6 })

// mesh: warm major, one chord a bar, EP on beats 1 and 3, light 8th-note arpeggio.
const meshChords = [CH.Ebmaj7, CH.BbOverD, CH.Cm7, CH.Abmaj7]
meshChords.forEach((c, k) => {
  const t = S.mesh.at + k * BAR, dur = Math.min(BAR, S.sybil.at - t)
  if (dur <= 0) return
  pad(t, dur, c, { level: 0.5, attack: 0.3, release: 0.5, cutFrom: 900, cutTo: 1600, rise: 1, reverb: 0.3 })
  ep(t, top(c), 0.45); if (dur > 2 * BEAT) ep(t + 2 * BEAT, top(c), 0.35)
  sub(t, c[0], { tau: 0.3 })
  arp(t, t + dur, upper(c))
})

// sybil: C minor, sub on every beat, pad filter opening across the section; the pocket is sub only.
pad(S.sybil.at, pocketIn - S.sybil.at, CH.CmRub, { level: 0.55, attack: 0.5, release: 0.05, cutFrom: 250, cutTo: 2800, rise: pocketIn - S.sybil.at, reverb: 0.25 })
for (let t = S.sybil.at; t < release - 1e-9; t += BEAT) sub(t, CH.CmRub[0], { tau: 0.18, level: 0.42 })
for (let t = S.sybil.at; t < pocketIn - 1e-9; t += BAR) ep(t, CH.CmRub.slice(0, 3), 0.4)
// the release: a full Eb major with the EP and pad together, exactly on the beat the prune lands.
pad(release, S.eclipse.at - release, CH.EbBig, { level: 0.9, attack: 0.02, release: 1.2, cutFrom: 2600, cutTo: 1200, rise: 2, reverb: 0.4 })
ep(release, CH.EbBig.slice(1), 0.8)
sub(release, CH.EbBig[1], { tau: 0.4, level: 1 })

// eclipse: hollow and quiet, two long suspended chords, no arpeggio.
const eclipseChords = [[CH.Abmaj7sus2, S.eclipse.at, S.eclipse.at + 2 * BAR], [CH.Fmadd9, S.eclipse.at + 2 * BAR, endOf(S.eclipse)]]
for (const [c, t0, t1] of eclipseChords) {
  pad(t0, t1 - t0, c, { level: 0.26, attack: 1.2, release: 1.0, cutFrom: 500, cutTo: 800, rise: 3, reverb: 0.5 })
  sub(t0, c[0], { tau: 0.5, level: 0.55 })
}

// heal: bright, Bb then Eb, arpeggio back, EP on beats 1 and 3.
const healChords = [[CH.Bb, S.heal.at, S.heal.at + BAR], [CH.Eb, S.heal.at + BAR, endOf(S.heal)]]
for (const [c, t0, t1] of healChords) {
  pad(t0, t1 - t0, c, { level: 0.5, attack: 0.3, release: 0.6, cutFrom: 1200, cutTo: 2200, rise: 1, reverb: 0.35 })
  for (let t = t0; t < t1 - 1e-9; t += BAR) { ep(t, top(c), 0.45); if (t + 2 * BEAT < t1) ep(t + 2 * BEAT, top(c), 0.35); sub(t, c[0], { tau: 0.3 }) }
  arp(t0, t1, upper(c))
}

// mainnet: wide pad plus shimmer, spacious.
const mainChords = [[CH.EbWide, S.mainnet.at], [CH.AbWide, S.mainnet.at + BAR], [CH.Cm9, S.mainnet.at + 2 * BAR]]
mainChords.forEach(([c, t0], k) => {
  const t1 = mainChords[k + 1]?.[1] ?? endOf(S.mainnet)
  pad(t0, t1 - t0, c, { level: 0.5, attack: 0.8, release: 1.2, cutFrom: 1500, cutTo: 2600, rise: 1.5, detune: 12, width: 1, reverb: 0.6 })
  shimmer(t0, t1 - t0, top(c), {})
  sub(t0, c[0], { tau: 0.5, level: 0.7 })
})

// end: Ab, then the Eb swell from the air pocket: level rises, filter opens, octave doubled, rings out to the last frame.
pad(S.end.at, swellAt - S.end.at, CH.Ab, { level: 0.45, attack: 0.5, release: 0.8, cutFrom: 1000, cutTo: 1400, rise: 2, reverb: 0.45 })
ep(S.end.at, top(CH.Ab), 0.4)
for (let t = S.end.at; t < swellAt - 1e-9; t += BAR) sub(t, CH.Ab[0], { tau: 0.4, level: 0.7 })
const ring = LEN - swellAt, crest = ring - BAR
pad(swellAt, ring, CH.EbFinal, { level: 0.45, levelTo: 1.25, attack: 0.3, release: 0.01, cutFrom: 900, cutTo: 3200, rise: crest, width: 0.9, reverb: 0.5 })
ep(swellAt, CH.Eb, 0.15)
ep(swellAt + crest, CH.EbFinal, 0.4)
sub(swellAt, CH.Eb[0], { tau: 0.6, level: 0.3 })
sub(swellAt + crest, CH.Eb[0], { tau: 0.9, level: 0.6 })

// ---- effects and mix -----------------------------------------------------------------------

// Feedback delay: dotted eighth, two audible repeats, low-passed in the loop. Returns the repeats only.
function delay(x) {
  const D = Math.round(0.75 * BEAT * SR), fb = 0.42, a = Math.exp(-TAU * 2500 / SR)
  const line = new Float64Array(N), out = new Float64Array(N)
  let lp = 0
  for (let i = 0; i < N; i++) {
    const back = i >= D ? line[i - D] : 0
    lp = a * lp + (1 - a) * back
    line[i] = x[i] + fb * lp
    out[i] = lp
  }
  return out
}

// Schroeder reverb: four parallel damped combs into two series allpasses; the right channel's combs sit 23 samples longer.
function reverb(x, offset) {
  const combs = [1695, 1760, 1623, 1548].map(len => ({ buf: new Float64Array(len + offset), i: 0, lp: 0 }))
  const aps = [245, 605].map(len => ({ buf: new Float64Array(len), i: 0 }))
  const out = new Float64Array(N), fbk = 0.84, damp = 0.25
  for (let n = 0; n < N; n++) {
    let y = 0
    for (const c of combs) {
      const r = c.buf[c.i]
      c.lp = (1 - damp) * r + damp * c.lp
      c.buf[c.i] = x[n] + fbk * c.lp
      c.i = (c.i + 1) % c.buf.length
      y += r
    }
    y *= 0.25
    for (const a of aps) {
      const r = a.buf[a.i], v = y + 0.5 * r
      a.buf[a.i] = v
      a.i = (a.i + 1) % a.buf.length
      y = r - 0.5 * v
    }
    out[n] = y
  }
  return out
}

// The air pocket gate: everything but the sub is cut between pocketIn and release, 6 ms ramps.
function gate(t) {
  const r = 0.006
  if (t >= pocketIn - r && t < pocketIn) return 0.5 * (1 + Math.cos(Math.PI * (t - (pocketIn - r)) / r))
  if (t >= pocketIn && t < release) return 0
  if (t >= release && t < release + r) return 0.5 * (1 - Math.cos(Math.PI * (t - release) / r))
  return 1
}
for (let i = 0; i < N; i++) {
  const g = gate(i / SR)
  if (g < 1) { dryL[i] *= g; dryR[i] *= g; dlySend[i] *= g; revL[i] *= g; revR[i] *= g }
}
const dly = delay(dlySend)
for (let i = 0; i < N; i++) { revL[i] += dly[i] * 0.3; revR[i] += dly[i] * 0.3 }
const wetL = reverb(revL, 0), wetR = reverb(revR, 23)

const mixL = new Float64Array(N), mixR = new Float64Array(N)
const fadeIn = 0.2, ringOut = BAR
for (let i = 0; i < N; i++) {
  const t = i / SR, g = gate(t)
  let m = 1
  if (t < fadeIn) m *= t / fadeIn
  if (t > LEN - ringOut) m *= (1 - (t - (LEN - ringOut)) / ringOut) ** 2.5
  mixL[i] = (dryL[i] + (dly[i] * 0.35 + wetL[i] * 0.45) * g + subBus[i]) * m
  mixR[i] = (dryR[i] + (dly[i] * 0.35 + wetR[i] * 0.45) * g + subBus[i]) * m
}

// ---- level and output ----------------------------------------------------------------------

function wav(L, R, gain) {
  const buf = Buffer.alloc(44 + N * 4)
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + N * 4, 4); buf.write('WAVE', 8)
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22)
  buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34)
  buf.write('data', 36); buf.writeUInt32LE(N * 4, 40)
  for (let i = 0; i < N; i++) {
    buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, L[i] * gain)) * 32767), 44 + i * 4)
    buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, R[i] * gain)) * 32767), 46 + i * 4)
  }
  return buf
}

let peak = 0
for (let i = 0; i < N; i++) peak = Math.max(peak, Math.abs(mixL[i]), Math.abs(mixR[i]))
const pre = OUT + '.pre.wav'
writeFileSync(pre, wav(mixL, mixR, 0.5 / peak))
const probe = spawnSync('ffmpeg', ['-nostats', '-i', pre, '-af', 'loudnorm=print_format=json', '-f', 'null', '-'], { encoding: 'utf8' })
unlinkSync(pre)
const m = JSON.parse(probe.stderr.slice(probe.stderr.lastIndexOf('{'), probe.stderr.lastIndexOf('}') + 1))
const gainDb = Math.min(TARGET_LUFS - +m.input_i, PEAK_CEILING_DB - +m.input_tp)
writeFileSync(OUT, wav(mixL, mixR, 0.5 / peak * 10 ** (gainDb / 20)))

const samples = (readFileSync(OUT).length - 44) / 4
if (samples !== N) throw new Error(`wrote ${samples} frames, expected ${N}`)
console.log(`${OUT}: ${N} frames = ${LEN.toFixed(3)} s at ${SR} Hz, ${script.bpm} BPM`)
console.log(`pre-gain measure: ${m.input_i} LUFS, true peak ${m.input_tp} dBTP; applied ${gainDb.toFixed(2)} dB` +
  ` -> about ${(+m.input_i + gainDb).toFixed(1)} LUFS, true peak ${(+m.input_tp + gainDb).toFixed(1)} dBTP`)

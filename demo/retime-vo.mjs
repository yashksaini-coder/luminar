// Retimes a generated voiceover onto the authored clock (script.json vo timecodes).
// TTS tools compress pause tags, so a raw read drifts off the picture by mid-film: cut the file at its
// silences and place every line on its timecode instead of nudging the whole clip.
//   node retime-vo.mjs vo.mp3 [--tempo 1.08] [--gap 0.2] [--noise -32dB] [--min 0.18] [--write-script]
// Writes web/public/demo/audio/vo-final.wav (the composition's `vo` prop: "demo/audio/vo-final.wav").
// A read usually has more speech segments than lines (a breath after "Luminar."), so the segments are grouped
// into consecutive runs, one per line, by the alignment that best matches each line's expected length (its word
// count at the read's own pace) and prefers cutting at the longer gaps. Lines are then placed in order: on their
// timecode when the previous line has ended, else `gap` after it; a line marked `anchor` in script.json keeps its
// timecode and the line before it starts early enough to clear it. --tempo speeds the whole read first (1.08 is
// below audibility; a slow read is a pacing problem). --write-script stores the placed starts back into
// script.json vo[].at, so the composition's ducking and VO-SCRIPT.md describe the film as mixed.
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const arg = (name, dflt) => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : dflt }
const SRC = process.argv[2]
if (!SRC || SRC.startsWith('--')) throw new Error('usage: node retime-vo.mjs vo.mp3 [--tempo 1.08] [--gap 0.2] [--write-script]')
const SCRIPT_PATH = join(HERE, '..', 'web', 'remotion', 'demo', 'script.json')
const script = JSON.parse(readFileSync(SCRIPT_PATH, 'utf8'))
const DURATION = script.scenes.at(-1).at + script.scenes.at(-1).dur
const OUT = join(HERE, '..', 'web', 'public', 'demo', 'audio', 'vo-final.wav')
const lines = script.vo
const TEMPO = Number(arg('--tempo', 1)), GAP = Number(arg('--gap', 0.2))

// Tempo first (on a WAV copy), so every time below is on the read we actually cut.
let src = SRC
if (TEMPO !== 1) {
  src = join(mkdtempSync(join(tmpdir(), 'vo-')), 'tempo.wav')
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', SRC, '-af', `atempo=${TEMPO}`, '-ar', '48000', src])
}

// Speech segments: from each silence_end to the next silence_start.
const det = spawnSync('ffmpeg', ['-i', src, '-af', `silencedetect=noise=${arg('--noise', '-32dB')}:d=${arg('--min', '0.18')}`, '-f', 'null', '-']).stderr.toString()
const total = Number(execFileSync('ffprobe', ['-v', 'quiet', '-show_entries', 'format=duration', '-of', 'csv=p=0', src]).toString())
const starts = [...det.matchAll(/silence_start: ([\d.]+)/g)].map(m => Number(m[1]))
const ends = [...det.matchAll(/silence_end: ([\d.]+)/g)].map(m => Number(m[1]))
const segs = []
let cursor = starts[0] !== undefined && starts[0] < 0.05 ? (ends[0] ?? 0) : 0
for (let i = 0; i < starts.length; i++) {
  if (starts[i] > cursor + 0.05) segs.push([cursor, starts[i]])
  cursor = ends[i] ?? total
}
if (cursor < total - 0.05) segs.push([cursor, total])
if (segs.length < lines.length) throw new Error(`${segs.length} speech segments for ${lines.length} lines; lower --min or raise --noise`)

// Expected read length per line: its word share of the file's total speech time (the read's own pace).
const words = t => t.split(/\s+/).filter(Boolean).length
const speech = segs.reduce((s, [a, b]) => s + (b - a), 0)
const totalWords = lines.reduce((s, l) => s + words(l.text), 0)
const expect = lines.map(l => (words(l.text) / totalWords) * speech)
const gapBefore = i => (i === 0 ? 0 : segs[i][0] - segs[i - 1][1])
const dur = (k, i) => segs[i - 1][1] - segs[k][0]   // segments k..i-1 as one run
// dp[j][i]: best cost placing lines 0..j-1 on segments 0..i-1; a run's cost is its squared length error, relative,
// minus a bonus for starting at a long gap (the big authored pauses survive compression in rank order).
const GAP_BONUS = 1.5
const M = segs.length, N = lines.length
const dp = Array.from({ length: N + 1 }, () => new Array(M + 1).fill(Infinity))
const back = Array.from({ length: N + 1 }, () => new Array(M + 1).fill(-1))
dp[0][0] = 0
for (let j = 1; j <= N; j++) {
  for (let i = j; i <= M; i++) {
    for (let k = j - 1; k < i; k++) {
      if (dp[j - 1][k] === Infinity) continue
      const e = expect[j - 1]
      const cost = dp[j - 1][k] + ((dur(k, i) - e) ** 2) / e - GAP_BONUS * gapBefore(k)
      if (cost < dp[j][i]) { dp[j][i] = cost; back[j][i] = k }
    }
  }
}
const runs = []
for (let j = N, i = M; j > 0; j--) { const k = back[j][i]; runs.unshift([segs[k][0], segs[i - 1][1]]); i = k }

// Placement: forward, never before the authored timecode; a line before an anchor is pulled early enough to clear it.
const len = runs.map(([a, b]) => b - a)
const at = lines.map(l => l.at)
for (let i = 0; i < N; i++) {
  const prevEnd = i ? at[i - 1] + len[i - 1] + GAP : 0
  at[i] = Math.max(lines[i].at, prevEnd)
  const next = lines[i + 1]
  if (next?.anchor && at[i] + len[i] + GAP > next.at) {
    at[i] = Math.max(prevEnd, next.at - GAP - len[i])
    if (at[i] + len[i] + GAP > next.at + 1e-6) console.warn(`line ${i + 1} cannot clear the anchor at ${next.at}s even starting at ${at[i].toFixed(2)}s; raise --tempo`)
  }
}

const PRE = 0.08, POST = 0.06   // padding into the surrounding silences
const chains = [], mixIns = []
runs.forEach(([a, b], i) => {
  const s = Math.max(0, a - PRE), e = Math.min(total, b + POST), ms = Math.round(at[i] * 1000)
  const drift = at[i] - lines[i].at
  console.log(`${String(i + 1).padStart(2)}  ${a.toFixed(2)}–${b.toFixed(2)} (${len[i].toFixed(2)}s, expected ${expect[i].toFixed(2)}s)  →  ${at[i].toFixed(2)}s${drift ? ` (${drift > 0 ? '+' : ''}${drift.toFixed(2)})` : ''}${lines[i].anchor ? ' anchor' : ''}  ${lines[i].text}`)
  chains.push(`[0]atrim=${s.toFixed(3)}:${e.toFixed(3)},asetpts=PTS-STARTPTS,adelay=${ms}|${ms}[v${i}]`)
  mixIns.push(`[v${i}]`)
})
const graph = chains.join(';') + `;${mixIns.join('')}amix=inputs=${runs.length}:duration=longest:normalize=0,apad=whole_dur=${DURATION},atrim=0:${DURATION},alimiter=limit=0.95[o]`
execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', src, '-filter_complex', graph, '-map', '[o]', '-ar', '48000', OUT], { stdio: 'inherit' })
const last = at[N - 1] + len[N - 1]
console.log(`retimed → ${OUT} (${runs.length} lines; last word ends ${last.toFixed(2)}s, film ${DURATION}s); render with --vo demo/audio/vo-final.wav`)
if (process.argv.includes('--write-script')) {
  const placed = at.map(t => Math.round(t * 100) / 100)
  const text = readFileSync(SCRIPT_PATH, 'utf8').replace(/("vo": \[)([\s\S]*?)(\n  \])/, (m, open, body, close) => {
    let i = 0
    return open + body.replace(/"at": [\d.]+/g, () => `"at": ${placed[i++]}`) + close
  })
  writeFileSync(SCRIPT_PATH, text)
  console.log(`script.json vo[].at updated to the placed starts (${placed.join(', ')})`)
}

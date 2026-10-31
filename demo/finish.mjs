// Step 8, assemble: renders the Demo composition twice (captions burned, clean), masters the soundtrack to
// -14 LUFS / -1 dBTP in two passes, remuxes it onto both masters, writes a 1080p review copy and the
// caption sidecars next to them, then verifies audio peaks at the cue times in the files themselves.
//   node finish.mjs            → web/video-out/demo-16x9.mp4, demo-16x9-captions.mp4, demo-16x9-1080p.mp4, demo.srt/.vtt
//   node finish.mjs --draft    → demo/out/render/draft.mp4 (960×540, captions, quick) for a listen
//   node finish.mjs --vo demo/audio/vo-final.wav   (a retimed voiceover; the bed ducks under its lines)
import { execFileSync, spawnSync } from 'node:child_process'
import { copyFileSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const WEB = join(HERE, '..', 'web')
const OUT = join(HERE, 'out', 'render')
const DEST = join(WEB, 'video-out')
const arg = (name, dflt) => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : dflt }
const DRAFT = process.argv.includes('--draft')
const vo = arg('--vo', null)
mkdirSync(OUT, { recursive: true }); mkdirSync(DEST, { recursive: true })
const script = JSON.parse(readFileSync(join(WEB, 'remotion', 'demo', 'script.json'), 'utf8'))
const run = (cmd, args, cwd) => execFileSync(cmd, args, { cwd, stdio: 'inherit' })
const ffmpeg = args => run('ffmpeg', ['-y', '-v', 'error', ...args])
const probe = (file, what) => execFileSync('ffprobe', ['-v', 'quiet', '-show_entries', what, '-of', 'csv=p=0', file]).toString().trim()

function render(file, props, extra = []) {
  run('npx', ['remotion', 'render', 'Demo', file, '--props', JSON.stringify({ captions: true, audio: true, vo, ...props }),
    '--codec', 'h264', '--crf', DRAFT ? '23' : '14', '--x264-preset', DRAFT ? 'veryfast' : 'slow', '--audio-codec', 'aac', '--audio-bitrate', '256k', ...extra], WEB)
}

if (DRAFT) {
  const draft = join(OUT, 'draft.mp4')
  render(draft, {}, ['--scale', '0.5'])
  console.log(`draft → ${draft} (${probe(draft, 'format=duration')}s)`)
  process.exit(0)
}

const captions = join(OUT, 'demo-captions-raw.mp4'), clean = join(OUT, 'demo-clean-raw.mp4')
render(captions, { captions: true })
render(clean, { captions: false })

// Master the soundtrack once (two-pass loudnorm on the clean render), then remux it onto both pictures.
const measured = JSON.parse(/\{[\s\S]*\}/.exec(spawnSync('ffmpeg', ['-i', clean, '-af', 'loudnorm=I=-14:TP=-1:LRA=11:print_format=json', '-f', 'null', '-']).stderr.toString())[0])
const ln = `loudnorm=I=-14:TP=-1:LRA=11:measured_I=${measured.input_i}:measured_TP=${measured.input_tp}:measured_LRA=${measured.input_lra}:measured_thresh=${measured.input_thresh}:offset=${measured.target_offset}:linear=true:print_format=summary`
const audio = join(OUT, 'soundtrack.m4a')
ffmpeg(['-i', clean, '-vn', '-af', ln, '-ar', '48000', '-c:a', 'aac', '-b:a', '256k', audio])
console.log(`soundtrack: in ${measured.input_i} LUFS / ${measured.input_tp} dBTP → mastered ${audio}`)
const outClean = join(DEST, 'demo-16x9.mp4'), outCap = join(DEST, 'demo-16x9-captions.mp4'), out1080 = join(DEST, 'demo-16x9-1080p.mp4')
for (const [src, dst] of [[clean, outClean], [captions, outCap]]) ffmpeg(['-i', src, '-i', audio, '-map', '0:v', '-map', '1:a', '-c', 'copy', '-movflags', '+faststart', dst])
// Review copy (~3.5 Mbps) from the captions master: chats and review links.
ffmpeg(['-i', outCap, '-c:v', 'libx264', '-preset', 'slow', '-b:v', '3300k', '-maxrate', '3800k', '-bufsize', '7600k', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', out1080])
run('node', [join(HERE, 'captions.mjs')])
copyFileSync(join(HERE, 'out', 'demo.srt'), join(DEST, 'demo.srt'))
copyFileSync(join(HERE, 'out', 'demo.vtt'), join(DEST, 'demo.vtt'))

// Verify in the file, not the editor: loudness of the final, and peaks at every cue time vs. the quiet pockets.
const final = spawnSync('ffmpeg', ['-i', outClean, '-af', 'loudnorm=I=-14:TP=-1:LRA=11:print_format=summary', '-f', 'null', '-']).stderr.toString()
console.log(final.split('\n').filter(l => /Input Integrated|Input True Peak/.test(l)).join('\n'))
const peakAt = (t, len = 0.4) => /max_volume: (-?[\d.]+)/.exec(spawnSync('ffmpeg', ['-ss', String(t), '-t', String(len), '-i', outClean, '-af', 'volumedetect', '-f', 'null', '-']).stderr.toString())?.[1]
for (const c of script.cues) console.log(`cue ${String(c.t).padStart(5)}s ${c.sound.padEnd(9)} peak ${peakAt(c.t - 0.05)} dB  (${c.why})`)
for (const [a, b] of script.airPockets) console.log(`pocket ${a}–${b}s peak ${peakAt(a, b - a)} dB`)
console.log(`\nmasters → ${outClean} (${probe(outClean, 'format=duration')}s), ${outCap}, ${out1080}; sidecars demo.srt/.vtt`)

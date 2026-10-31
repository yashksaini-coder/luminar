// Encodes each recorded shot (out/frames/<id>/f*.png) into a visually lossless clip the composition plays:
// web/public/demo/shots/<id>.mp4 (H.264 CRF 12, yuv420p, 30 fps) and copies the cursor sidecar next to it.
//   node encode.mjs [--shot mesh,sybil]
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { SHOTS } from './shots.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const DEST = join(HERE, '..', 'web', 'public', 'demo', 'shots')
const arg = (name, dflt) => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : dflt }
const wanted = arg('--shot', 'all')
mkdirSync(DEST, { recursive: true })

for (const shot of SHOTS) {
  if (wanted !== 'all' && !wanted.split(',').includes(shot.id)) continue
  const dir = join(HERE, 'out', 'frames', shot.id)
  const side = join(HERE, 'out', 'frames', `${shot.id}.json`)
  if (!existsSync(dir) || !existsSync(side)) { console.error(`${shot.id}: not recorded yet`); continue }
  const n = readdirSync(dir).filter(f => /^f\d{5}\.png$/.test(f)).length
  const want = Math.round(shot.seconds * 30)
  if (n !== want) { console.error(`${shot.id}: ${n} frames on disk, expected ${want}; re-run record.mjs`); continue }
  // skipFrames: the clip starts that many frames into the recording (the recorder can only seek to a snapshot).
  const skip = shot.skipFrames ?? 0
  const keep = n - skip
  const out = join(DEST, `${shot.id}.mp4`)
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-framerate', '30', '-start_number', String(skip), '-i', join(dir, 'f%05d.png'), '-frames:v', String(keep),
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '12', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out], { stdio: 'inherit' })
  // The sidecar's cursor times move with the trim so they stay on the clip's clock.
  const meta = JSON.parse(readFileSync(side, 'utf8'))
  const shift = skip / 30
  writeFileSync(join(DEST, `${shot.id}.json`), JSON.stringify({ ...meta, seconds: keep / 30, simFrom: meta.simFrom + shift * meta.speed, skipFrames: skip,
    cursor: meta.cursor.map(c => ({ ...c, t: c.t - shift })).filter(c => c.t >= 0) }, null, 2))
  const dur = execFileSync('ffprobe', ['-v', 'quiet', '-show_entries', 'format=duration', '-of', 'csv=p=0', out]).toString().trim()
  console.log(`${shot.id}: ${n} frames → ${out} (${Number(dur).toFixed(2)}s)`)
}

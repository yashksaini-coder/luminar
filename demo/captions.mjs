// Caption sidecars are a projection of the composition's caption table, never a transcription:
// web/remotion/demo/script.json → out/demo.srt + out/demo.vtt (same cue times as the burned master).
//   node captions.mjs [--shift 5.2333]   (shift: seconds to add when an intro is prepended, see 08-assemble)
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as copy from '../web/lib/copy.ts'

const HERE = dirname(fileURLToPath(import.meta.url))
const arg = (name, dflt) => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : dflt }
const shift = Number(arg('--shift', 0))
const script = JSON.parse(readFileSync(join(HERE, '..', 'web', 'remotion', 'demo', 'script.json'), 'utf8'))
// {NAME} in a caption is web/lib/copy.ts NAME (the honesty sentences are written once, there; Node strips the types).
const expand = t => t.replace(/\{(\w+)\}/g, (_, k) => { if (typeof copy[k] !== 'string') throw new Error(`unknown copy token {${k}}`); return copy[k] })

export const stamp = (sec, sep) => {
  const ms = Math.round(sec * 1000)
  const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000), s = Math.floor((ms % 60000) / 1000)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}${sep}${String(ms % 1000).padStart(3, '0')}`
}
// Sentence case for the sidecar (the burned card is lowercase mono by design; platform CC should read as prose).
const sentence = t => t.charAt(0).toUpperCase() + t.slice(1)

const srt = script.captions.map((c, i) => `${i + 1}\n${stamp(c.at + shift, ',')} --> ${stamp(c.until + shift, ',')}\n${sentence(expand(c.text))}\n`).join('\n')
const vtt = 'WEBVTT\n\n' + script.captions.map(c => `${stamp(c.at + shift, '.')} --> ${stamp(c.until + shift, '.')}\n${sentence(expand(c.text))}\n`).join('\n')
mkdirSync(join(HERE, 'out'), { recursive: true })
writeFileSync(join(HERE, 'out', 'demo.srt'), srt)
writeFileSync(join(HERE, 'out', 'demo.vtt'), vtt)
console.log(`${script.captions.length} cues → demo/out/demo.srt, demo/out/demo.vtt${shift ? ` (shifted +${shift}s)` : ''}`)

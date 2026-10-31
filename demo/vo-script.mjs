// Writes VO-SCRIPT.md from script.json: the timecoded lines (with sync notes) and ONE paste-ready tagged block
// for the voice tool (MiniMax tag set: {neutral}/{fluent} per fragment, <#s#> pauses computed from the timecodes).
// Pauses: a line is estimated at 2.6 words per second (deadpan read); the pause before the next line is whatever
// is left until its timecode. retime-vo.mjs places the generated read back on the authored timecodes afterwards.
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const script = JSON.parse(readFileSync(join(HERE, '..', 'web', 'remotion', 'demo', 'script.json'), 'utf8'))
const film = script.scenes.at(-1).at + script.scenes.at(-1).dur
const WPS = 2.6
const tc = s => `${String(Math.floor(s / 60)).padStart(2, '0')}:${(s % 60).toFixed(1).padStart(4, '0')}`
const words = t => t.split(/\s+/).filter(Boolean).length
// Lines that ride motion read {fluent}; claims read {neutral}. The two hammer lines get a breath before them.
const FLUENT = new Set([3, 6, 12])
const BREATH = new Set([6, 12])

const lines = script.vo.map((l, i) => `[${tc(l.at)}]  ${l.text}`).join('\n')
const block = script.vo.map((l, i) => {
  const next = script.vo[i + 1]
  const read = words(l.text) / WPS
  const pause = next ? Math.max(0.2, next.at - l.at - read) : 0
  const tag = FLUENT.has(i) ? 'fluent' : 'neutral'
  return `${BREATH.has(i) ? '(breath)' : ''}{${tag}}${l.text}{/${tag}}${next ? `<#${pause.toFixed(1)}#>` : ''}`
}).join('')
const [pocket, outro] = script.airPockets

const md = `# Luminar, ${film.toFixed(1)}s demo, voiceover script

Read deadpan, unhurried; timecodes are line START times on the film clock.

\`\`\`
${lines}
\`\`\`

Sync notes (never pasted): "Pruned." lands on the frame the ticker flips to "5 · 5 pruned" (${tc(script.landings.allPruned)});
no voice from ${tc(pocket[0])} to ${tc(pocket[1])} (the beat before the prune lands) and from ${tc(outro[0])} to the end.
After generating, run \`node retime-vo.mjs <file>\` to cut the read at its silences and place each line on its timecode.

## Paste-ready block (MiniMax tags; paste unedited)

\`\`\`
${block}
\`\`\`

ElevenLabs instead: generate line by line with previousText/nextText, stability 0.55, style 0.2, speed 1.0; then retime.
`
writeFileSync(join(HERE, 'VO-SCRIPT.md'), md)
console.log(`${script.vo.length} lines → demo/VO-SCRIPT.md`)

/** The demo script's invariants (scene grid, captions, cues, landings) and the pure helpers the composition runs on. */
import { expect, test } from 'vitest'
import { PROVENANCE } from '@/lib/copy'
import raw from './script.json'
import { BEAT, BED, CUTS, DURATION, FPS, LANDINGS, SCENES, SCRIPT, bedVolume, cursorAt, dissolveAt, expand, placeCues, sceneAt, voWindows, type CursorEvent } from './timeline'

const onGrid = (t: number) => Math.abs(t / BEAT - Math.round(t / BEAT)) < 1e-6
const end = SCENES.at(-1)!.at + SCENES.at(-1)!.dur

test('scenes are contiguous from 0, every boundary on the 0.6 s grid, and the film is the last scene end', () => {
  expect(SCENES[0].at).toBe(0)
  SCENES.slice(1).forEach((s, i) => expect(s.at).toBeCloseTo(SCENES[i].at + SCENES[i].dur, 6))
  for (const s of SCENES) { expect(onGrid(s.at)).toBe(true); expect(onGrid(s.at + s.dur)).toBe(true) }
  expect(DURATION).toBe(Math.round(end * FPS))
  expect(CUTS).toHaveLength(SCENES.length - 1)
})

test('captions lie inside the film and inside one scene each', () => {
  for (const c of SCRIPT.captions) {
    expect(c.at).toBeLessThan(c.until)
    expect(c.at).toBeGreaterThanOrEqual(0); expect(c.until).toBeLessThanOrEqual(end + 1e-6)
    const s = sceneAt(c.at)!
    expect(s).toBeDefined()
    expect(c.until).toBeLessThanOrEqual(s.at + s.dur + 1e-6)
  }
})

test('copy tokens expand from lib/copy and every caption is fully expanded on load', () => {
  expect(expand('a · {MECHANISM}')).toBe('a · Same mechanism, toy constants.')
  expect(expand('{PROVENANCE}')).toBe(PROVENANCE)
  expect(() => expand('{NOPE}')).toThrow('{NOPE}')
  for (const c of SCRIPT.captions) expect(c.text).not.toMatch(/\{\w+\}/)
  expect(raw.captions.length).toBe(SCRIPT.captions.length)
})

test('cues are inside the film and never within 0.3 s of each other', () => {
  const ts = SCRIPT.cues.map(c => c.t).sort((a, b) => a - b)
  for (const t of ts) { expect(t).toBeGreaterThanOrEqual(0); expect(t).toBeLessThan(end) }
  ts.slice(1).forEach((t, i) => expect(t - ts[i]).toBeGreaterThanOrEqual(0.3))
})

test('every landing sits inside a footage scene, and the prune lands on a caption', () => {
  for (const t of Object.values(LANDINGS)) expect(sceneAt(t)?.kind).toBe('shot')
  expect(SCRIPT.captions.some(c => c.at === SCRIPT.landings.allPruned)).toBe(true)
})

test('the dissolve fully covers the two frames either side of every cut and is gone 13 frames before / 12 after', () => {
  for (const c of CUTS) {
    expect(dissolveAt(c - 1)).toBe(1); expect(dissolveAt(c)).toBe(1)
    expect(dissolveAt(c - 13)).toBe(0); expect(dissolveAt(c + 12)).toBe(0)
    expect(dissolveAt(c - 7)).toBeCloseTo(0.5, 6)
  }
})

test('cursor: hidden before the first event, linear between points, held after the last, click age from the click', () => {
  const ev: CursorEvent[] = [
    { t: 1, x: 0, y: 0, kind: 'move' }, { t: 2, x: 100, y: 50, kind: 'move' }, { t: 2.5, x: 100, y: 50, kind: 'click' },
  ]
  expect(cursorAt([], 5)).toBeNull()
  expect(cursorAt(ev, 0.5)).toBeNull()
  expect(cursorAt(ev, 1)).toEqual({ x: 0, y: 0, click: null })
  expect(cursorAt(ev, 1.5)).toEqual({ x: 50, y: 25, click: null })
  expect(cursorAt(ev, 2.5)).toEqual({ x: 100, y: 50, click: 0 })
  expect(cursorAt(ev, 4)).toEqual({ x: 100, y: 50, click: 1.5 })
})

test('bed: base without a voice, ducked under vo lines with a voice, the pre-prune pocket untouched, the outro swells to 1', () => {
  const [[pocketA], [outroA, outroB]] = SCRIPT.airPockets
  const mid = (SCRIPT.vo[0].at + voWindows()[0][1]) / 2
  expect(bedVolume(mid, false)).toBe(BED.base)
  expect(bedVolume(mid, true)).toBeCloseTo(BED.dip, 6)
  expect(bedVolume(SCRIPT.vo[0].at - BED.edge - 0.01, true)).toBe(BED.base)
  expect(bedVolume(pocketA + 0.1, false)).toBe(BED.base)
  expect(bedVolume(outroA, true)).toBeCloseTo(BED.base, 6)
  expect(bedVolume((outroA + outroB) / 2, true)).toBeCloseTo((BED.base + BED.swell) / 2, 6)
  expect(bedVolume(outroB, false)).toBe(BED.swell)
  for (const [a, b] of voWindows()) expect(b - a).toBeLessThanOrEqual(4 + 1e-9)
})

test('cues: the file starts its hit early so the hit lands on the cue, gain makes the cue dB the output peak 1 dB under', () => {
  const placed = placeCues({ stamp: { file: 'demo/audio/sfx/stamp.wav', hit: 0.2, peakDb: -3 } })
  const stamps = SCRIPT.cues.filter(c => c.sound === 'stamp')
  expect(placed).toHaveLength(stamps.length)
  expect(placed[0].from).toBe(Math.round((stamps[0].t - 0.2) * FPS))
  expect(20 * Math.log10(placed[0].gain)).toBeCloseTo(stamps[0].db - -3 - 1, 6)
  expect(placeCues({})).toEqual([])
})

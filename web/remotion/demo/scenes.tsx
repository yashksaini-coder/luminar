/** Demo scenes: the two light bookends on the libp2p Day art (open, end), the footage scenes (the real UI filmed by
 *  demo/record.mjs, full frame) and what sits over them: caption stamps in the app's narrator-card language, the one
 *  PRUNED stamp, and the recorded cursor as a reticle. Every time comes from script.json via timeline.ts; every string
 *  from the script's caption table or lib/copy. Nothing fades: everything stamps, slides or snaps. */
import { useEffect, useState, type CSSProperties, type JSX, type ReactNode } from 'react'
import { AbsoluteFill, Img, OffthreadVideo, continueRender, delayRender, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion'
import { MECHANISM, REPO_URL } from '@/lib/copy'
import Stamp from '@/components/dither/Stamp'
import { HONESTY_ROWS } from '../scenes/copy'
import { G, Mono } from '../v2/fx'
import { H, SCENES, SCRIPT, W, captionsIn, cursorAt, frameAt, type Caption, type CursorEvent, type Scene } from './timeline'

const INK = '#141416'
const INK_HAIR = 'rgba(20,20,22,0.22)'
const PITCH = 'rgb(11,11,13)'
const NO_OVERSHOOT = { damping: 200 } as const

/* ───────────────────────────────── public files ───────────────────────────────── */

/** Reads a public file once per mount and holds the render until it answers. `null` when it is not there (logged), so a
 *  clip the recorder has not written yet, or a table the sound lane has not produced, degrades visibly instead of
 *  failing the render. 'exists' asks for one byte and keeps only the status. */
function useStatic(url: string, kind: 'exists' | 'json'): unknown {
  const [v, setV] = useState<unknown>()
  useEffect(() => {
    const handle = delayRender(url)
    let live = true
    fetch(url, kind === 'exists' ? { headers: { Range: 'bytes=0-0' } } : undefined)
      .then(r => {
        if (!r.ok) { console.warn(`demo: missing ${url}`); return null }
        return kind === 'json' ? r.json() : true
      }, () => null)
      .then(x => { if (live) setV(x); continueRender(handle) })
    return () => { live = false; continueRender(handle) }
  }, [url, kind])
  return v
}
const useExists = (url: string) => useStatic(url, 'exists') === true
const useJson = <T,>(url: string) => useStatic(url, 'json') as T | null | undefined

/* ──────────────────────────────── the light bookends ──────────────────────────────── */

/** The libp2p Day art, cover-scaled (1600×900 is the frame's own ratio), with the py-libp2p mark top-right; its white
 *  ground multiplies away on the cream. */
function Art({ children }: { children: ReactNode }): JSX.Element {
  return (
    <AbsoluteFill style={{ background: '#f9f8f3', overflow: 'hidden' }}>
      <Img src={staticFile('demo/brand/slide-bg.jpg')} style={{ position: 'absolute', left: 0, top: 0, width: W, height: H, objectFit: 'cover' }} />
      <Img src={staticFile('demo/brand/py-libp2p.jpg')} style={{ position: 'absolute', right: G, top: 160, width: 96, height: 96, mixBlendMode: 'multiply', filter: 'brightness(1.04)' }} />
      <div style={{ position: 'absolute', left: G, top: 176 }}>
        <Mono px={20} color={INK} style={{ opacity: 0.6, letterSpacing: '0.18em' }}>libp2p · Devcon 8</Mono>
      </div>
      {children}
    </AbsoluteFill>
  )
}

/** A block that slides onto the card over `frames` and lands exactly on `at` (spring, no overshoot); absent before. */
function Slide({ at, frames = 12, from = [0, 24], style, children }: { at: number; frames?: number; from?: [number, number]; style?: CSSProperties; children: ReactNode }): JSX.Element | null {
  const f = useCurrentFrame()
  const { fps } = useVideoConfig()
  if (f < at - frames) return null
  const s = spring({ frame: f - (at - frames), fps, config: NO_OVERSHOOT, durationInFrames: frames })
  return <div style={{ translate: `${from[0] * (1 - s)}px ${from[1] * (1 - s)}px`, ...style }}>{children}</div>
}

/** The plate stamp pressing down onto the frame, centred on (x, y): visible from `fall` frames before `at`, scaling
 *  1.4 → 1 on a spring that lands exactly on `at` (the frame its cue hits), gone from `until`. */
function Press({ at, until = Infinity, fall = 6, x, y, px, tilt, flame, children }: { at: number; until?: number; fall?: number; x: number; y: number; px: number; tilt: number; flame?: boolean; children: string }): JSX.Element | null {
  const f = useCurrentFrame()
  const { fps } = useVideoConfig()
  if (f < at - fall || f >= until) return null
  const s = spring({ frame: f - (at - fall), fps, config: NO_OVERSHOOT, durationInFrames: fall })
  return (
    <div style={{ position: 'absolute', left: x, top: y, translate: '-50% -50%', scale: String(1.4 - 0.4 * s), '--t-stamp': `${px}px` } as CSSProperties}>
      <Stamp tilt={tilt} flame={flame}>{children}</Stamp>
    </div>
  )
}

/** Open card: the wordmark presses down onto the paper and lands on the script's first caption beat (the stamp cue);
 *  that caption is the sub-line, sliding out under it on the same frame. */
export function Open(): JSX.Element {
  const f = useCurrentFrame()
  const { fps } = useVideoConfig()
  const open = SCENES[0]
  const [sub] = captionsIn(open)
  const land = frameAt(sub.at - open.at)
  // The press runs from frame 0 so the first frame (the poster) already carries the name, hovering at 1.35 before it lands.
  const s = spring({ frame: f, fps, config: NO_OVERSHOOT, durationInFrames: land })
  return (
    <Art>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 28, paddingBottom: 40 }}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 236, lineHeight: 1, color: INK, letterSpacing: '-0.01em', scale: String(1.35 - 0.35 * s) }}>
          Luminar
        </div>
        <Slide at={land + 8} frames={8} from={[0, -18]}>
          <Mono px={28} color={INK} style={{ textTransform: 'none', letterSpacing: '0.04em' }}>{sub.text}</Mono>
        </Slide>
      </div>
    </Art>
  )
}

/** End card: the honesty headline and table (Luminar beside Lighthouse) on the caption beat, the BREAK IT YOURSELF stamp
 *  on its cue, the repo URL large on the last caption; the art's cube stays clear bottom-right. */
export function End(): JSX.Element {
  const end = SCENES.at(-1)!
  const [table, repo] = captionsIn(end)
  const local = (t: number) => frameAt(t - end.at)
  const stampAt = SCRIPT.cues.find(c => c.sound === 'stamp' && c.t >= end.at)?.t ?? table.at
  const cols = ['', 'Luminar', 'Lighthouse']
  const cell = (i: number): CSSProperties => ({ padding: '16px 28px', display: 'flex', alignItems: 'center', borderLeft: i ? `1px solid ${INK_HAIR}` : undefined })
  return (
    <Art>
      <div style={{ position: 'absolute', left: G, top: 214 }}>
        <Slide at={local(table.at)} from={[-32, 0]}>
          <h1 style={{ margin: 0, fontFamily: 'var(--font-display)', fontWeight: 400, fontSize: 112, lineHeight: 1, color: INK, whiteSpace: 'nowrap' }}>{MECHANISM}</h1>
        </Slide>
      </div>
      <div style={{ position: 'absolute', left: G, top: 372 }}>
        <Slide at={local(table.at) + 10} frames={10} from={[0, 20]} style={{ display: 'grid', gridTemplateColumns: '300px 260px 560px', borderTop: `1px solid ${INK_HAIR}` }}>
          {cols.map((h, i) => (
            <div key={i} style={{ ...cell(i), borderBottom: `1px solid ${INK_HAIR}`, padding: '12px 28px' }}>
              <Mono px={18} color={INK} style={{ opacity: i === 1 ? 1 : 0.55, letterSpacing: '0.16em' }}>{h}</Mono>
            </div>
          ))}
          {HONESTY_ROWS.map((row, r) => row.map((text, i) => (
            <div key={`${r}${i}`} style={{ ...cell(i), borderBottom: `1px solid ${INK_HAIR}`, overflow: 'hidden' }}>
              <Slide at={local(table.at) + 16 + 5 * r} frames={10} from={[-24, 0]}>
                <Mono px={i === 0 ? 20 : 28} color={INK} style={{ textTransform: i === 0 ? 'uppercase' : 'none', letterSpacing: i === 0 ? '0.12em' : '0', opacity: i === 2 ? 0.6 : 1, whiteSpace: 'nowrap' }}>{text}</Mono>
              </Slide>
            </div>
          )))}
        </Slide>
      </div>
      <div style={{ position: 'absolute', left: G, top: 790 }}>
        <Slide at={local(repo.at)} from={[-40, 0]}>
          <Mono px={60} color={INK} style={{ textTransform: 'none', letterSpacing: '0', whiteSpace: 'nowrap' }}>{REPO_URL}</Mono>
        </Slide>
      </div>
      <Press at={local(stampAt)} x={W / 2 + 580} y={H / 2 - 20} px={48} tilt={3} flame>BREAK IT YOURSELF</Press>
    </Art>
  )
}

/* ─────────────────────────────────── footage ─────────────────────────────────── */

/** Where a scene's caption card sits: top-left, clear of the app's narrator card (bottom-left), command strip (bottom
 *  centre) and hero ticker (bottom band). Shots with the rails up start right of the left rail instead of over its
 *  readouts; the mainnet shot's card drops under the app's provenance box and runs on one line above the map's observers. */
interface CaptionBox { x: number; y: number; w: number }
const CAPTION_BOX: Record<string, CaptionBox> = { mainnet: { x: G, y: 160, w: 1480 } }
const captionBox = (s: Scene): CaptionBox => CAPTION_BOX[s.id] ?? (SCRIPT.shots[s.id]?.hero === false ? { x: 296, y: 112, w: 1040 } : { x: G, y: 112, w: 1040 })

/** One footage scene: the recorder's clip full frame (it is exactly the scene long and starts on its first frame), then
 *  the overlays. A clip that is not on disk yet renders a labelled placeholder so the gap is visible, never silent. */
export function Footage({ scene, index, captions }: { scene: Scene; index: number; captions: boolean }): JSX.Element {
  const src = staticFile(`demo/shots/${scene.id}.mp4`)
  const have = useExists(src)
  const box = captionBox(scene)
  const pruneScene = SCENES.find(s => SCRIPT.landings.allPruned >= s.at && SCRIPT.landings.allPruned < s.at + s.dur)
  return (
    <AbsoluteFill style={{ background: PITCH }}>
      {have
        ? <OffthreadVideo src={src} style={{ position: 'absolute', left: 0, top: 0, width: W, height: H }} />
        : <div style={{ position: 'absolute', left: G, bottom: G }}><Mono px={18} color="var(--flame)">footage missing · demo/shots/{scene.id}.mp4</Mono></div>}
      {captions && captionsIn(scene).map(c => <CaptionStamp key={c.at} c={c} scene={scene} kicker={`${String(index).padStart(2, '0')} / ${scene.id}`} box={box} />)}
      {scene === pruneScene && <PrunedStamp scene={scene} />}
      {SCRIPT.shots[scene.id]?.click && <CursorOverlay id={scene.id} />}
    </AbsoluteFill>
  )
}

/** The narrator card, sized for the film: mono kicker over the sentence in the display italic on a pitch plate with a
 *  hairline, the app's drain bar running from `at` to `until`. Slides and scales in on a spring, snaps out on `until`. */
function CaptionStamp({ c, scene, kicker, box }: { c: Caption; scene: Scene; kicker: string; box: CaptionBox }): JSX.Element | null {
  const f = useCurrentFrame()
  const { fps } = useVideoConfig()
  const at = frameAt(c.at - scene.at), until = frameAt(c.until - scene.at)
  if (f < at || f >= until) return null
  const s = spring({ frame: f - at, fps, config: NO_OVERSHOOT, durationInFrames: 10 })
  return (
    <div style={{ position: 'absolute', left: box.x, top: box.y, maxWidth: box.w, background: PITCH, border: '1px solid var(--hair-strong)', transformOrigin: 'left center', translate: `${-40 * (1 - s)}px 0`, scale: String(0.92 + 0.08 * s) }}>
      <div style={{ padding: '14px 24px 0' }}><Mono px={18} color="var(--fg-2)">{kicker}</Mono></div>
      <p style={{ margin: 0, padding: '6px 24px 18px', fontFamily: 'var(--font-display)', fontStyle: 'italic', fontWeight: 400, fontSize: 40, lineHeight: 1.15, color: 'var(--fg)' }}>{c.text}</p>
      <div style={{ height: 2, background: 'var(--fg-2)', width: `${(100 * (until - f)) / (until - at)}%` }} />
    </div>
  )
}

/** The thesis moment: PRUNED presses down centre-right and lands on the allPruned frame (the ticker flips to "5 · 5
 *  pruned" in the bottom band, left uncovered, and the big hit sits on it), gone when its caption ends. */
function PrunedStamp({ scene }: { scene: Scene }): JSX.Element {
  const at = SCRIPT.landings.allPruned
  const until = SCRIPT.captions.find(c => c.at === at)?.until ?? scene.at + scene.dur
  return <Press at={frameAt(at - scene.at)} until={frameAt(until - scene.at)} x={W / 2 + 430} y={H / 2 - 60} px={56} tilt={-2} flame>PRUNED</Press>
}

/** The recorder's pointer path as a reticle: ring, four ticks and a centre dot in paper, the ring in flame with a
 *  10-frame ripple on a click. Drawn only while the shot has a recorded point under it. */
function CursorOverlay({ id }: { id: string }): JSX.Element | null {
  const f = useCurrentFrame()
  const { fps } = useVideoConfig()
  const rec = useJson<{ cursor: CursorEvent[] }>(staticFile(`demo/shots/${id}.json`))
  const c = rec ? cursorAt(rec.cursor, f / fps) : null
  if (!c) return null
  const r = 16, tick = 10, gap = 5, size = 96, o = size / 2
  const k = c.click === null ? null : c.click * fps < 10 ? (c.click * fps) / 10 : null
  const ring = k === null ? 'var(--paper-0)' : 'var(--flame)'
  return (
    <svg width={size} height={size} style={{ position: 'absolute', left: c.x - o, top: c.y - o }} aria-hidden="true">
      <circle cx={o} cy={o} r={r} fill="none" stroke={ring} strokeWidth={1.5} />
      <circle cx={o} cy={o} r={1.75} fill="var(--paper-0)" />
      {[0, 90, 180, 270].map(a => <line key={a} x1={o + r + gap} y1={o} x2={o + r + gap + tick} y2={o} stroke="var(--paper-0)" strokeWidth={1.5} transform={`rotate(${a} ${o} ${o})`} />)}
      {k !== null && <circle cx={o} cy={o} r={r + 26 * k} fill="none" stroke="var(--flame)" strokeWidth={2.5 * (1 - k) + 0.5} />}
    </svg>
  )
}

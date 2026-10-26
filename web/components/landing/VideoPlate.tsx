'use client'
// Showcase film (spec v2 §6). A 16:9 plate between the grid rails: the clean poster with a large centred
// play control (pulsing square ring). Pressing play is the user gesture that starts the film WITH sound
// (never autoplay, never muted autoplay); the poster then dissolves into the video through a Bayer
// threshold that spreads out from the play button (≈500 ms, signal-tinted leading edge). A mono control bar
// follows: play/pause, a seek rail, the m:ss time readout and a visible mute toggle. Reduced motion skips
// the dissolve; a video that fails to load disables play and points at the recording instead.
import { type CSSProperties, useEffect, useRef, useState } from 'react'
import { bayer, coverRect } from '@/components/dither/dither'
import { reducedMotion } from '@/lib/prefs'
import stats from '@/lib/reel-stats.json'
import { reelHref } from '@/lib/reels'
import SectionHead from './SectionHead'
import s from './sections.module.css'
import styles from './VideoPlate.module.css'

export const SRC = '/video/launch-16x9.mp4'
export const DISSOLVE_MS = 520
const CELL = 12   // CSS px per dissolve cell
const EDGE = 0.05   // width of the signal-tinted band running ahead of the clear

/** 0…1 order in which a cell clears: its Bayer 8×8 rank, pulled outward from the centre (the play button). */
export function dissolveAt(x: number, y: number, cols: number, rows: number): number {
  const dx = (x + 0.5) / cols - 0.5, dy = ((y + 0.5) / rows - 0.5) * (rows / cols)
  const d = Math.min(1, Math.hypot(dx, dy) / Math.hypot(0.5, 0.5 * (rows / cols)))
  return 0.55 * bayer(x, y) + 0.45 * d
}

export const clock = (t: number) => (Number.isFinite(t) && t > 0 ? `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}` : '0:00')

type Phase = 'poster' | 'dissolve' | 'video'

// pixel glyphs: crisp rects on an 11 px grid
const Play = () => <svg viewBox="0 0 11 11" aria-hidden="true">{[0, 1, 2, 3, 4, 5].map(x => <rect key={x} x={x + 2} y={x} width="1" height={11 - 2 * x} />)}</svg>
const Pause = () => <svg viewBox="0 0 11 11" aria-hidden="true"><rect x="2" y="1" width="2.5" height="9" /><rect x="6.5" y="1" width="2.5" height="9" /></svg>
const Speaker = ({ off }: { off: boolean }) => (
  <svg viewBox="0 0 11 11" aria-hidden="true">
    <rect x="0" y="4" width="2" height="3" /><rect x="2" y="3" width="1" height="5" /><rect x="3" y="2" width="1" height="7" /><rect x="4" y="1" width="1" height="9" />
    {off
      ? <><rect x="7" y="3" width="1" height="1" /><rect x="10" y="3" width="1" height="1" /><rect x="8" y="4" width="2" height="1" /><rect x="8.5" y="5" width="1" height="1" /><rect x="8" y="6" width="2" height="1" /><rect x="7" y="7" width="1" height="1" /><rect x="10" y="7" width="1" height="1" /></>
      : <><rect x="6.5" y="4" width="1" height="3" /><rect x="8" y="3" width="1" height="1" /><rect x="8.5" y="4" width="1" height="3" /><rect x="8" y="7" width="1" height="1" /><rect x="10" y="2" width="1" height="7" /></>}
  </svg>
)

export default function VideoPlate() {
  const video = useRef<HTMLVideoElement>(null), poster = useRef<HTMLImageElement>(null), veil = useRef<HTMLCanvasElement>(null)
  const [phase, setPhase] = useState<Phase>('poster')
  const [paused, setPaused] = useState(true), [ended, setEnded] = useState(false)
  const [muted, setMuted] = useState(false), [time, setTime] = useState(0), [dur, setDur] = useState(0)
  const [missing, setMissing] = useState(false)

  // metadata (or an error) can land before hydration attaches the handlers: read the element once on mount
  useEffect(() => {
    const v = video.current
    if (!v) return
    if (v.error) setMissing(true)
    else if (v.readyState >= 1 && Number.isFinite(v.duration)) setDur(v.duration)
  }, [])

  // the dissolve: snapshot the poster into the canvas, then clear it cell by cell in threshold order
  useEffect(() => {
    if (phase !== 'dissolve') return
    const c = veil.current, img = poster.current, ctx = c?.getContext('2d')
    if (!c || !img || !ctx || !img.naturalWidth) { setPhase('video'); return }
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    c.width = Math.round(c.clientWidth * dpr); c.height = Math.round(c.clientHeight * dpr)
    ctx.drawImage(img, ...coverRect(img.naturalWidth, img.naturalHeight, c.width, c.height, 0.5, 0.5), 0, 0, c.width, c.height)
    const px = CELL * dpr, cols = Math.ceil(c.width / px), rows = Math.ceil(c.height / px)
    const order = new Float32Array(cols * rows)
    for (let i = 0; i < order.length; i++) order[i] = dissolveAt(i % cols, Math.floor(i / cols), cols, rows)
    ctx.fillStyle = getComputedStyle(c).getPropertyValue('--signal').trim() || '#4ddcdc'
    let raf = 0, t0 = 0
    const tick = (now: number) => {
      t0 ||= now
      const p = Math.min(1, (now - t0) / DISSOLVE_MS) * (1 + EDGE)
      for (let i = 0; i < order.length; i++) {
        const x = (i % cols) * px, y = Math.floor(i / cols) * px
        if (order[i] < p - EDGE) ctx.clearRect(x, y, px, px)
        else if (order[i] < p) ctx.fillRect(x, y, px, px)
      }
      if (p < 1 + EDGE) raf = requestAnimationFrame(tick); else setPhase('video')
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [phase])

  const play = () => {
    const v = video.current
    if (!v || missing) return
    v.muted = muted   // the press is the gesture: sound is on unless the viewer muted it
    v.play()?.catch(() => setPhase('poster'))
    if (phase === 'poster') setPhase(reducedMotion() ? 'video' : 'dissolve')
  }
  const toggle = () => { const v = video.current; if (v && !v.paused) v.pause(); else play() }
  const mute = () => { const v = video.current; if (v) v.muted = !v.muted; setMuted(m => !m) }

  const started = phase !== 'poster'
  const label = ended ? 'Replay the film' : started ? 'Resume the film' : 'Play the launch film with sound'
  return (
    <section id="film" className={styles.section} aria-labelledby="film-h">
      <SectionHead id="film-h" kicker="Film"
        title="One attack, start to heal"
        lead={`The Sybil recording, cut with sound: a publish, ${stats.sybils} Sybils grafted and pruned in ${stats.heartbeatsToPrune} heartbeats, an eclipse on ${stats.eclipseTarget}, then the heal.`} />
      <div className={s.row} data-grid="" data-reveal="">
        <div className={s.body}>
          <figure className={styles.figure} data-k="card" style={{ '--i': 0 } as CSSProperties}>
            <div className={styles.plate} data-phase={phase}>
              <video ref={video} className={styles.video} src={SRC} preload="metadata" playsInline aria-label="Launch film"
                onPlay={() => { setPaused(false); setEnded(false) }} onPause={() => setPaused(true)} onEnded={() => setEnded(true)}
                onTimeUpdate={e => setTime(e.currentTarget.currentTime)} onDurationChange={e => setDur(e.currentTarget.duration)}
                onVolumeChange={e => setMuted(e.currentTarget.muted)} onError={() => setMissing(true)} />
              {/* eslint-disable-next-line @next/next/no-img-element -- static export: next/image optimisation is off */}
              <img ref={poster} className={styles.poster} src="/video/poster.png" alt="" width={1920} height={1080} loading="lazy" decoding="async" hidden={started} />
              {phase === 'dissolve' && <canvas ref={veil} className={styles.veil} aria-hidden="true" />}
              {phase === 'video' && !paused && <button type="button" className={styles.hit} tabIndex={-1} aria-label="Pause the film" onClick={toggle} />}
              {(!started || paused) && phase !== 'dissolve' && (
                <button type="button" className={styles.cover} aria-label={label} aria-disabled={missing || undefined} onClick={play} data-started={started || undefined}>
                  {!missing && <>
                    <span className={styles.play}><Play /></span>
                    <span className={styles.hint}>{ended ? 'Replay' : started ? 'Resume' : 'Play film'}{dur > 0 && <><i aria-hidden="true">·</i>{clock(dur)}</>}<i aria-hidden="true">·</i>{muted ? 'muted' : 'sound on'}</span>
                  </>}
                </button>
              )}
              {missing && <p className={styles.note}>The film could not load. <a href={reelHref('sybil-eclipse')}>Watch the recording instead ›</a></p>}
            </div>
            <div className={styles.bar}>
              <button type="button" className={styles.btn} onClick={toggle} disabled={missing} aria-label={paused ? 'Play' : 'Pause'}>{paused ? <Play /> : <Pause />}</button>
              <input className={styles.seek} type="range" min={0} max={dur || 1} step={0.1} value={Math.min(time, dur || 1)} disabled={!started || !dur}
                aria-label="Seek" aria-valuetext={`${clock(time)} of ${clock(dur)}`} style={{ '--p': dur ? time / dur : 0 } as CSSProperties}
                onChange={e => { const v = video.current; if (v) v.currentTime = +e.currentTarget.value }} />
              <p className={styles.time}><span>{clock(time)}</span> / {clock(dur)}</p>
              <button type="button" className={`${styles.btn} ${styles.mute}`} onClick={mute} aria-pressed={muted} aria-label="Mute">
                <Speaker off={muted} /><span>Mute</span>
              </button>
            </div>
            <figcaption className={styles.caption}><span>Fig. 3</span>One publish, {stats.sybils} Sybils, one eclipse, one heal. The sound plays only once you press play.</figcaption>
          </figure>
        </div>
      </div>
    </section>
  )
}

'use client'

import { useState } from 'react'
import { seekTo } from '@/lib/actions'
import { reelBeats, reelPhases } from '@/lib/api/replay'
import { SCRUB_LIVE } from '@/lib/copy'
import { formatTime } from '@/lib/format'
import { selectTimelineTotal, useStore } from '@/lib/store'
import { bandsFor, ticksFor, washVar } from '@/lib/timeline-marks'
import s from './CommandStrip.module.css'

const pct = (f: number) => `${Math.min(1, Math.max(0, f)) * 100}%`
const NO_PHASES: never[] = []

export default function Scrubber() {
  const simTime = useStore(st => st.simTime)
  const total = useStore(selectTimelineTotal)
  const reel = useStore(st => st.reel !== null)
  const liveBeats = useStore(st => st.beats)
  const livePhases = useStore(st => st.activeScenario?.scenario?.phases ?? NO_PHASES)
  const beats = reel ? reelBeats() : liveBeats       // a reel's beats and phases are pre-scanned at load, so the
  const phases = reel ? reelPhases() : livePhases    // whole track (bands and ticks) is drawn at T+0
  const [hover, setHover] = useState<number | null>(null)   // hovered fraction 0..1, null hides the bubble
  const frac = total > 0 ? simTime / total : 0

  const hoverAt = (e: React.PointerEvent<HTMLInputElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    setHover(r.width > 0 ? Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)) : frac)
  }

  return (
    <div className={s.track}>
      {bandsFor(phases, total).map(b => (
        <span key={`${b.action}-${b.at}`} className={s.band} title={`${b.label} (T+${b.at}s)`}
          style={{ left: pct(b.left), width: pct(b.width), background: `var(${washVar(b.action)})` }} />
      ))}
      {ticksFor(beats, phases, total).map((t, i) => (
        <span key={i} className={s.tick} data-kind={t.kind} title={`${t.label} · T+${t.time.toFixed(1)}s`} style={{ left: pct(t.pos) }} />
      ))}
      <span className={s.fill} style={{ width: pct(frac) }} />
      <span className={s.head} style={{ left: pct(frac) }} />
      <input type="range" className={s.range} min={0} max={1000} value={Math.round(Math.min(1, frac) * 1000)}
        aria-label="timeline" aria-valuetext={formatTime(simTime)} aria-disabled={!reel || undefined} title={reel ? undefined : SCRUB_LIVE}
        onChange={e => { if (reel) seekTo(Number(e.currentTarget.value) / 1000 * total) }}
        onPointerEnter={hoverAt} onPointerMove={hoverAt} onPointerLeave={() => setHover(null)}
        onFocus={() => setHover(frac)} onBlur={() => setHover(null)} />
      {hover !== null && <output className={s.bubble} style={{ left: pct(hover) }}>{formatTime(hover * total)}</output>}
    </div>
  )
}

'use client'

import { reset, setSpeed, togglePlay } from '@/lib/actions'
import { formatTime } from '@/lib/format'
import { KBD_HINT } from '@/lib/keys'
import { selectTimelineTotal, useStore } from '@/lib/store'
import type { ReelManifest } from '@/lib/types'
import s from './CommandStrip.module.css'
import Scrubber from './Scrubber'

const SPEEDS = [[0.5, '.5×'], [1, '1×'], [2, '2×'], [3, '3×'], [5, '5×'], [10, '10×']] as const

// manifest and onDrawer are consumed by the menus (Task 3.3) and the Stats / Log buttons (Task 3.11)
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export default function CommandStrip(_props: { manifest: ReelManifest; onDrawer: (d: 'stats' | 'log') => void }) {
  const playing = useStore(st => st.playing)
  const simSpeed = useStore(st => st.simSpeed)
  const simTime = useStore(st => st.simTime)
  const total = useStore(selectTimelineTotal)
  return (
    <div className={s.strip}>
      <button type="button" className={s.btn} aria-label="Reset (R)" title="Reset · R" onClick={() => void reset()}>⟲</button>
      <button type="button" className={s.btn} aria-label={playing ? 'Pause (Space)' : 'Play (Space)'} aria-pressed={playing} onClick={() => void togglePlay()}>
        {playing ? '❚❚' : '▶'}
      </button>
      <Scrubber />
      <span className={s.time}>{formatTime(simTime)} / {formatTime(total)}</span>
      <span role="group" aria-label="Speed" className={s.speeds}>
        {SPEEDS.map(([v, label]) => (
          <button key={v} type="button" className={s.speed} aria-pressed={simSpeed === v} onClick={() => void setSpeed(v)}>{label}</button>
        ))}
      </span>
      <div className={s.menus} />
      <div className={`${s.kbd} kbdHint`}>{KBD_HINT}</div>
    </div>
  )
}

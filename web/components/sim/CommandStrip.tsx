'use client'

import { reset, setSpeed, togglePlay } from '@/lib/actions'
import { formatTime } from '@/lib/format'
import { KBD_HINT } from '@/lib/keys'
import { selectTimelineTotal, useStore } from '@/lib/store'
import type { ReelManifest } from '@/lib/types'
import s from './CommandStrip.module.css'
import { FaultMenu, ReelsMenu, ScenariosMenu } from './Menus'
import Scrubber from './Scrubber'

const SPEEDS = [[0.5, '.5×'], [1, '1×'], [2, '2×'], [3, '3×'], [5, '5×'], [10, '10×']] as const

type Drawer = 'stats' | 'log'

export default function CommandStrip({ manifest, drawer, onDrawer }: {
  manifest: ReelManifest; drawer: Drawer | null; onDrawer: (d: Drawer) => void
}) {
  const playing = useStore(st => st.playing)
  const simSpeed = useStore(st => st.simSpeed)
  const simTime = useStore(st => st.simTime)
  const total = useStore(selectTimelineTotal)
  return (
    <div className={s.strip}>
      <div className={s.row}>
        <button type="button" className={s.btn} aria-label="Reset (R)" title="Reset · R" onClick={() => void reset()}>⟲</button>
        <button type="button" className={s.btn} aria-label={playing ? 'Pause (Space)' : 'Play (Space)'} aria-pressed={playing} onClick={() => void togglePlay()}>
          {playing ? '❚❚' : '▶'}
        </button>
        <Scrubber />
        <span className={s.time}>{formatTime(simTime)} / {formatTime(total)}</span>
      </div>
      <div className={s.row}>
        <span role="group" aria-label="Speed" className={s.speeds}>
          {SPEEDS.map(([v, label]) => (
            <button key={v} type="button" className={s.speed} aria-pressed={simSpeed === v} onClick={() => void setSpeed(v)}>{label}</button>
          ))}
        </span>
        <button type="button" className={`${s.btn} ${s.drawerBtn}`} data-hero-hide aria-controls="rail-stats" aria-expanded={drawer === 'stats'} onClick={() => onDrawer('stats')}>Stats</button>
        <button type="button" className={`${s.btn} ${s.drawerBtn}`} data-hero-hide aria-controls="rail-log" aria-expanded={drawer === 'log'} onClick={() => onDrawer('log')}>Log</button>
        <div className={s.menus}>
          <ScenariosMenu />
          <ReelsMenu manifest={manifest} />
          <FaultMenu />
        </div>
      </div>
      <div className={`${s.kbd} kbdHint`} data-hero-hide>{KBD_HINT}</div>
    </div>
  )
}

import { formatTime } from '@/lib/format'
import { selectPill, useStore } from '@/lib/store'
import styles from './Toolbar.module.css'

function Pill() {
  const pill = useStore(selectPill)
  const title = useStore(s => s.reel?.title ?? '')
  return (
    <span data-testid="pill" data-state={pill} className={styles.pill}>
      {pill === 'live' && <i aria-hidden className={styles.dot} />}
      {pill === 'reel' && <i aria-hidden className={styles.square} />}
      {pill === 'offline' ? 'OFFLINE' : pill === 'live' ? 'LIVE' : `REEL · ${title}`}
    </span>
  )
}

function Clock() {
  const t = useStore(s => s.simTime)
  return <time data-testid="clock" className={styles.clock}>{'T+' + formatTime(t)}</time>
}

export default function Toolbar() {
  return (
    <header className={styles.bar}>
      <span className={styles.brand}>
        LUMINAR <span className={styles.sub}>gossipsub v1.1</span>
      </span>
      <Pill />
      <Clock />
    </header>
  )
}

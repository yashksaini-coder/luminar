// The readout strip under Fig. 1: four numbers from the sybil-eclipse recording (lib/reel-stats.json).
// dt precedes dd in the DOM (valid <dl>); CSS puts the number on top.
import { RECORDING_NOT_RUN } from '@/lib/copy'
import stats from '@/lib/reel-stats.json'
import styles from './Readouts.module.css'

const CELLS: [string, string][] = [
  [String(stats.peers), 'peers in the recording'],
  [String(stats.sybils), `Sybils grafted at T+${stats.sybilAt}s`],
  [String(stats.heartbeatsToPrune), 'heartbeats from graft to first prune'],
  [`${stats.deliveryPct}%`, RECORDING_NOT_RUN],
]

export default function Readouts() {
  return (
    <dl className={styles.readouts}>
      {CELLS.map(([n, label]) => (
        <div key={label} className={styles.cell}><dt><em>{label}</em></dt><dd>{n}</dd></div>
      ))}
    </dl>
  )
}

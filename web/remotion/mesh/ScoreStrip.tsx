/** One peer's gossip_score as a mono label and a bar toward −20, with the toy prune line; flat adds why P4 never fires. Never dithered. */
import type { JSX } from 'react'
import { ECLIPSE_WHY } from '../../lib/copy'
import { signed } from '../../lib/format'
import { TOY } from '../constants'
import { focusPanel } from '../layers/focus'
import type { Orientation } from '../props'
import type { ReelData } from '../reel/parse'
import { scoreAt } from './readouts'

const FLOOR = -20

export function ScoreStrip({ data, peer, simTime, orientation, width, flat }: {
  data: ReelData; peer: string; simTime: number; orientation: Orientation; width: number; flat?: boolean
}): JSX.Element {
  const score = scoreAt(data, peer, simTime)
  const wide = orientation === 'wide'
  const [label, bar, small] = wide ? [22, 10, 14] : [32, 16, 22]
  const barW = score === null ? 0 : (Math.min(Math.abs(score), -FLOOR) / -FLOOR) * width
  const pruneX = (TOY.pruneThreshold / FLOOR) * width
  return (
    <div style={{ position: 'relative', ...focusPanel(24), width, minHeight: wide ? 60 : 140, fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums', color: 'var(--paper-0)' }}>
      <div style={{ fontSize: label, fontWeight: 500, whiteSpace: 'pre' }}>{`${peer}  ${score === null ? '—' : signed(score)}`}</div>
      <div style={{ position: 'relative', height: bar, marginTop: 6, marginBottom: small + 8 }}>
        <div style={{ position: 'absolute', left: 0, top: 0, height: bar, width: barW, background: score !== null && score < 0 ? 'var(--flame)' : 'var(--paper-1)' }} />
        <div style={{ position: 'absolute', left: pruneX, top: -4, bottom: -4, borderLeft: '1px dotted var(--paper-1)' }} />
        <div style={{ position: 'absolute', left: pruneX + 6, top: bar + 4, fontSize: small, lineHeight: 1, color: 'var(--paper-1)' }}>{`prune ${TOY.pruneThreshold}`}</div>
      </div>
      {flat && <div style={{ fontSize: small, marginTop: 4, color: 'var(--paper-1)' }}>{ECLIPSE_WHY}</div>}
    </div>
  )
}

/** Live readout of delivery, hops and latency from the reel's analytics: one line bottom-left (wide), a 3-line stack top-left (tall). */
import type { CSSProperties, JSX } from 'react'
import type { Orientation } from '../props'
import type { ReelData } from '../reel/parse'
import { SAFE_TALL } from '../timeline'
import { fmtTicker, healedInS, invalidCountAt, tickerAt } from './readouts'

const MONO: CSSProperties = { fontFamily: 'var(--font-mono)', fontWeight: 500, fontSize: 28, fontVariantNumeric: 'tabular-nums', color: 'var(--paper-0)' }
const EDGE = 64

export function Ticker({ data, simTime, orientation, invalid, healed, style }: {
  data: ReelData; simTime: number; orientation: Orientation; invalid?: boolean; healed?: boolean; style?: CSSProperties
}): JSX.Element {
  const items = fmtTicker(tickerAt(data, simTime), {
    invalid: invalid ? invalidCountAt(data, simTime) : undefined,
    healedIn: healed ? healedInS(data) : undefined,
  })
  const wide = orientation === 'wide'
  const place: CSSProperties = wide ? { left: EDGE, bottom: EDGE, whiteSpace: 'pre' } : { left: EDGE, top: SAFE_TALL.top, display: 'flex', flexDirection: 'column' }
  return (
    <div style={{ position: 'absolute', ...MONO, ...place, ...style }}>
      {items.map((s, i) => (
        <span key={s} style={s.startsWith('invalid') ? { color: 'var(--flame)' } : undefined}>
          {wide && i > 0 ? ' · ' : ''}{s}
        </span>
      ))}
    </div>
  )
}

/** Launch video: waits for the self-hosted fonts, then one named Sequence per timeline span (placeholder = scene id). */
import { useEffect, useState, type FC } from 'react'
import { AbsoluteFill, Sequence, continueRender, delayRender } from 'remotion'
import type { LaunchProps } from './props'
import { timeline } from './timeline'

export const Launch: FC<LaunchProps> = ({ orientation }) => {
  const [handle] = useState(() => delayRender('fonts'))

  useEffect(() => {
    document.fonts.ready.then(() => continueRender(handle))
  }, [handle])

  return (
    <AbsoluteFill style={{ background: 'var(--bg)' }}>
      {timeline[orientation].map(span => (
        <Sequence key={span.id} from={span.from} durationInFrames={span.durationInFrames} name={span.id}>
          <AbsoluteFill
            style={{
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--fg)',
              fontFamily: 'var(--font-mono)',
              fontSize: 48,
            }}
          >
            {span.id}
          </AbsoluteFill>
        </Sequence>
      ))}
    </AbsoluteFill>
  )
}

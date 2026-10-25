/** Launch video skeleton: waits for the self-hosted fonts, then one placeholder sequence until Task 6.2's timeline. */
import { useEffect, useState, type FC } from 'react'
import { AbsoluteFill, Sequence, continueRender, delayRender, useVideoConfig } from 'remotion'
import type { LaunchProps } from './props'

// Props are unused until Task 6.2 wires the timeline; the FC type keeps the A.22 contract.
export const Launch: FC<LaunchProps> = () => {
  const [handle] = useState(() => delayRender('fonts'))
  const { id, durationInFrames } = useVideoConfig()

  useEffect(() => {
    document.fonts.ready.then(() => continueRender(handle))
  }, [handle])

  return (
    <AbsoluteFill style={{ background: 'var(--bg)' }}>
      <Sequence from={0} durationInFrames={durationInFrames}>
        <AbsoluteFill
          style={{
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--fg)',
            fontFamily: 'var(--font-mono)',
            fontSize: 48,
          }}
        >
          {id}
        </AbsoluteFill>
      </Sequence>
    </AbsoluteFill>
  )
}

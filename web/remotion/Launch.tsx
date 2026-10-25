/** Launch video: waits for the self-hosted fonts and the reel, then one named Sequence per timeline span. */
import { useEffect, useState, type FC } from 'react'
import { AbsoluteFill, Sequence, continueRender, delayRender } from 'remotion'
import type { LaunchProps } from './props'
import { useReel } from './reel/useReel'
import ColdOpen from './scenes/01-ColdOpen'
import Title from './scenes/02-Title'
import type { SceneProps } from './scenes/types'
import { timeline, type SceneId } from './timeline'

const Placeholder: FC<SceneProps> = ({ span }) => (
  <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', color: 'var(--fg)', fontFamily: 'var(--font-mono)', fontSize: 48 }}>
    {span.id}
  </AbsoluteFill>
)

const SCENES: Record<SceneId, FC<SceneProps>> = {
  'cold-open': ColdOpen,
  title: Title,
  healthy: Placeholder,
  sybils: Placeholder,
  pruned: Placeholder,
  eclipse: Placeholder,
  heal: Placeholder,
  'same-names': Placeholder,
  mainnet: Placeholder,
  honesty: Placeholder,
  end: Placeholder,
}

export const Launch: FC<LaunchProps> = props => {
  const { orientation } = props
  const [handle] = useState(() => delayRender('fonts'))
  const data = useReel(props.reel)

  useEffect(() => {
    document.fonts.ready.then(() => continueRender(handle))
  }, [handle])

  return (
    <AbsoluteFill style={{ background: 'var(--bg)' }}>
      {data && timeline[orientation].map(span => {
        const Scene = SCENES[span.id]
        return (
          <Sequence key={span.id} from={span.from} durationInFrames={span.durationInFrames} name={span.id}>
            <Scene data={data} orientation={orientation} span={span} />
          </Sequence>
        )
      })}
    </AbsoluteFill>
  )
}

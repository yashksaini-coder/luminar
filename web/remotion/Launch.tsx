/** Launch video: waits for the self-hosted fonts and the reel, then one named Sequence per timeline span. */
import { useEffect, useState, type FC } from 'react'
import { AbsoluteFill, Sequence, continueRender, delayRender } from 'remotion'
import type { LaunchProps } from './props'
import { useReel } from './reel/useReel'
import ColdOpen from './scenes/01-ColdOpen'
import Title from './scenes/02-Title'
import Healthy from './scenes/03-Healthy'
import Sybils from './scenes/04-Sybils'
import Pruned from './scenes/05-Pruned'
import Eclipse from './scenes/06-Eclipse'
import Heal from './scenes/07-Heal'
import SameNames from './scenes/08-SameNames'
import Mainnet from './scenes/09-Mainnet'
import Honesty from './scenes/10-Honesty'
import End from './scenes/11-End'
import type { SceneProps } from './scenes/types'
import { timeline, type SceneId } from './timeline'

const SCENES: Record<SceneId, FC<SceneProps>> = {
  'cold-open': ColdOpen,
  title: Title,
  healthy: Healthy,
  sybils: Sybils,
  pruned: Pruned,
  eclipse: Eclipse,
  heal: Heal,
  'same-names': SameNames,
  mainnet: Mainnet,
  honesty: Honesty,
  end: End,
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
            <Scene data={data} orientation={orientation} span={span} repoUrl={props.repoUrl} />
          </Sequence>
        )
      })}
    </AbsoluteFill>
  )
}

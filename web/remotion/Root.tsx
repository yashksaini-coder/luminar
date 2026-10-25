/** Remotion root: the two launch cuts (A.22). */
import { Composition } from 'remotion'
import { Launch } from './Launch'
import { LAUNCH_DEFAULTS, launchSchema } from './props'

export function Root() {
  return (
    <>
      <Composition
        id="LaunchWide"
        component={Launch}
        width={1920}
        height={1080}
        fps={30}
        durationInFrames={1710}
        schema={launchSchema}
        defaultProps={{ orientation: 'wide', ...LAUNCH_DEFAULTS }}
      />
      <Composition
        id="LaunchTall"
        component={Launch}
        width={1080}
        height={1920}
        fps={30}
        durationInFrames={1440}
        schema={launchSchema}
        defaultProps={{ orientation: 'tall', ...LAUNCH_DEFAULTS }}
      />
    </>
  )
}

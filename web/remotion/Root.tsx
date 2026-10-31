/** Remotion root: Demo (the demo film, web/remotion/demo), LaunchV2 (the landing video, `npm run video`) and the two original launch cuts (A.22), kept for reference. */
import { Composition } from 'remotion'
import { DEMO_DEFAULTS, Demo, demoSchema } from './demo/Demo'
import { DURATION as DEMO_DURATION, FPS as DEMO_FPS, H as DEMO_H, W as DEMO_W } from './demo/timeline'
import { Launch } from './Launch'
import { LAUNCH_DEFAULTS, launchSchema } from './props'
import { LAUNCH_V2_DEFAULTS, LaunchV2, launchV2Schema } from './v2/LaunchV2'
import { DURATION, FPS, H, W } from './v2/timeline'

export function Root() {
  return (
    <>
      <Composition
        id="Demo"
        component={Demo}
        width={DEMO_W}
        height={DEMO_H}
        fps={DEMO_FPS}
        durationInFrames={DEMO_DURATION}
        schema={demoSchema}
        defaultProps={DEMO_DEFAULTS}
      />
      <Composition
        id="LaunchV2"
        component={LaunchV2}
        width={W}
        height={H}
        fps={FPS}
        durationInFrames={DURATION}
        schema={launchV2Schema}
        defaultProps={LAUNCH_V2_DEFAULTS}
      />
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

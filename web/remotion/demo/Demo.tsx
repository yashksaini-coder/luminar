/** Demo (1920×1080, 30 fps, the length of script.json): the Luminar demo film. One Sequence per script scene, the
 *  Bayer pixel dissolve over everything on every cut, and the soundtrack: the music bed with its ducking curve, the
 *  voiceover stem when one is passed, and the SFX cues placed so each file's measured hit lands on its cue. */
import { useEffect, useState, type FC, type JSX } from 'react'
import { AbsoluteFill, Audio, Sequence, continueRender, delayRender, staticFile, useCurrentFrame } from 'remotion'
import { z } from 'zod'
import { BayerCover } from '../v2/fx'
import { End, Footage, Open } from './scenes'
import { FPS, SCENES, bedVolume, dissolveAt, frameAt, placeCues, type Sound } from './timeline'

export const demoSchema = z.object({
  /** Burn the caption stamps (the captions master); false is the clean master for sidecar subtitles. */
  captions: z.boolean(),
  audio: z.boolean(),
  /** A staticFile path to the retimed voiceover WAV, or null for no voice. */
  vo: z.string().nullable(),
})
export type DemoProps = z.infer<typeof demoSchema>
export const DEMO_DEFAULTS: DemoProps = { captions: true, audio: true, vo: null }

const BED = 'demo/audio/bed.wav'
const SOUNDS = 'demo/audio/sounds.json'
/** Frames a cue's file is given to ring out. */
const CUE_LEN = 5 * FPS

/** The full-frame Bayer dissolve, read off the script's cuts. */
function Dissolve(): JSX.Element {
  return <BayerCover p={dissolveAt(useCurrentFrame())} />
}

/** Fetches the sound table once; null while loading or when the sound lane has not produced it yet. */
function useSounds(): Record<string, Sound> | null {
  const [sounds, setSounds] = useState<Record<string, Sound> | null>(null)
  useEffect(() => {
    const handle = delayRender('sounds.json')
    let live = true
    fetch(staticFile(SOUNDS)).then(r => (r.ok ? r.json() : (console.warn(`demo: missing ${SOUNDS}`), null)), () => null)
      .then(s => { if (live) setSounds(s); continueRender(handle) })
    return () => { live = false; continueRender(handle) }
  }, [])
  return sounds
}

function Soundtrack({ vo }: { vo: string | null }): JSX.Element {
  const sounds = useSounds()
  return (
    <>
      <Audio src={staticFile(BED)} volume={f => bedVolume(f / FPS, vo !== null)} />
      {vo && <Audio src={staticFile(vo)} />}
      {sounds && placeCues(sounds).map(c => (
        <Sequence key={c.t} from={c.from} durationInFrames={CUE_LEN} name={`${c.sound} · ${c.why}`} layout="none">
          <Audio src={staticFile(c.file)} volume={c.gain} />
        </Sequence>
      ))}
    </>
  )
}

export const Demo: FC<DemoProps> = ({ captions, audio, vo }) => {
  const [handle] = useState(() => delayRender('fonts'))
  useEffect(() => { document.fonts.ready.then(() => continueRender(handle)) }, [handle])
  return (
    <AbsoluteFill style={{ background: 'rgb(11,11,13)', overflow: 'hidden' }}>
      {SCENES.map((s, i) => (
        <Sequence key={s.id} from={frameAt(s.at)} durationInFrames={frameAt(s.at + s.dur) - frameAt(s.at)} name={s.id}>
          {s.kind === 'card' ? (i === 0 ? <Open /> : <End />) : <Footage scene={s} index={i} captions={captions} />}
        </Sequence>
      ))}
      <Dissolve />
      {audio && <Soundtrack vo={vo} />}
    </AbsoluteFill>
  )
}

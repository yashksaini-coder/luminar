/** LaunchV2 (1920×1080, 30 fps, ~45 s): the landing-v2 language on video. Scenes in a persistent hairline grid with +
 *  marks and a mono HUD, Bayer pixel dissolves on every cut, and a synthesized soundtrack cued off the reel. */
import { useEffect, useMemo, useState, type FC, type JSX } from 'react'
import { AbsoluteFill, Audio, Sequence, continueRender, delayRender, interpolate, staticFile, useCurrentFrame } from 'remotion'
import { z } from 'zod'
import { REPO_URL } from '../../lib/copy'
import { TOY } from '../constants'
import { useReel } from '../reel/useReel'
import type { ReelData } from '../reel/parse'
import { G, Mono, PixelDissolve, Plus, Rule } from './fx'
import { End, Eclipse, Heal, Honesty, Open, Publish, Pruned, Sybil, Title, type V2SceneProps } from './scenes'
import { DURATION, FPS, H, SPANS, W, cueSheet, simTimeAt, type Sfx, type V2Id } from './timeline'

export const launchV2Schema = z.object({ reel: z.string(), repoUrl: z.string() })
export type LaunchV2Props = z.infer<typeof launchV2Schema>
export const LAUNCH_V2_DEFAULTS: LaunchV2Props = { reel: 'reels/sybil-eclipse.jsonl', repoUrl: REPO_URL }

const SCENES: Record<V2Id, FC<V2SceneProps>> = {
  open: Open, title: Title, publish: Publish, sybil: Sybil, pruned: Pruned, eclipse: Eclipse, heal: Heal, honesty: Honesty, end: End,
}

/** Mix levels per cue (linear gain on the WAVs from scripts/make-sfx.sh). */
const LEVEL: Record<Sfx, number> = { tick: 0.5, blip: 0.55, sweep: 1, swell: 0.85, resolve: 1 }
const LEN: Record<Sfx, number> = { tick: 3, blip: 8, sweep: 24, swell: 45, resolve: 120 }

const NAV: { label: string; ids: V2Id[]; tone: string }[] = [
  { label: 'Publish', ids: ['publish'], tone: 'var(--signal)' },
  { label: 'Attack', ids: ['sybil'], tone: 'var(--flame)' },
  { label: 'Prune', ids: ['pruned'], tone: 'var(--signal)' },
  { label: 'Eclipse', ids: ['eclipse'], tone: 'var(--flame)' },
  { label: 'Heal', ids: ['heal'], tone: 'var(--signal)' },
]

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

/** The persistent frame: grid lines drawn in over the first second, + marks, top nav band and bottom status band. */
function Frame({ data }: { data: ReelData }): JSX.Element {
  const f = useCurrentFrame()
  const span = SPANS.find(s => f >= s.from && f < s.from + s.durationInFrames) ?? SPANS[0]
  const sim = span.simOffset !== undefined ? simTimeAt(span, f - span.from) : null
  // the Sybil act turns into the prune beat at the first score prune
  const active: V2Id = span.id === 'sybil' && sim !== null && sim >= (data.prunes[0]?.at ?? Infinity) ? 'pruned' : span.id
  const marks = interpolate(f, [16, 30], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  const band = { position: 'absolute', left: G, right: G, height: G, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 24px', opacity: marks } as const
  return (
    <>
      <Rule x={0} y={G} len={W} /><Rule x={0} y={H - G} len={W} at={4} />
      <Rule x={G} y={0} len={H} vertical at={2} /><Rule x={W - G} y={0} len={H} vertical at={6} />
      {[[G, G], [W - G, G], [G, H - G], [W - G, H - G]].map(([x, y]) => <Plus key={`${x},${y}`} x={x} y={y} opacity={marks} />)}
      <div style={{ ...band, top: 0 }}>
        <Mono px={18} color="var(--fg)" style={{ letterSpacing: '0.24em' }}>Luminar</Mono>
        <div style={{ display: 'flex', gap: 44 }}>
          {NAV.map(n => {
            const on = n.ids.includes(active)
            return <Mono key={n.label} px={16} color={on ? n.tone : 'var(--fg-3)'}><span style={{ opacity: 0.6 }}>/</span>&nbsp;&nbsp;{n.label}</Mono>
          })}
        </div>
        <Mono px={16} color={sim === null ? 'var(--fg-3)' : 'var(--fg)'} style={{ minWidth: 150, textAlign: 'right' }}>{sim === null ? 'reel · sybil-eclipse' : `T+${sim.toFixed(1)} s`}</Mono>
      </div>
      <div style={{ ...band, bottom: 0 }}>
        <Mono px={14}>{data.nodes.filter(n => !n.attacker).length} peers · D = {TOY.d} · heartbeat {TOY.heartbeatS.toFixed(1)} s · GossipSub v1.1</Mono>
        <Mono px={14}>Reproducible recording · {clock(f / FPS)} / {clock(DURATION / FPS)}</Mono>
      </div>
    </>
  )
}

/** Drone bed under everything, then one Sequence per cue from the reel-derived cue sheet. */
function Soundtrack({ data }: { data: ReelData }): JSX.Element {
  const cues = useMemo(() => cueSheet(data), [data])
  return (
    <>
      <Audio src={staticFile('audio/drone.wav')} volume={f => interpolate(f, [0, 45, DURATION - 60, DURATION], [0, 0.85, 0.85, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })} />
      {cues.map((c, i) => (
        <Sequence key={i} from={c.frame} durationInFrames={LEN[c.sfx]} name={c.sfx} layout="none">
          <Audio src={staticFile(`audio/${c.sfx}.wav`)} volume={LEVEL[c.sfx]} />
        </Sequence>
      ))}
    </>
  )
}

export const LaunchV2: FC<LaunchV2Props> = props => {
  const [handle] = useState(() => delayRender('fonts'))
  const data = useReel(props.reel)
  useEffect(() => { document.fonts.ready.then(() => continueRender(handle)) }, [handle])
  return (
    <AbsoluteFill style={{ background: 'var(--bg)', overflow: 'hidden' }}>
      {data && (
        <>
          {SPANS.map(s => {
            const Scene = SCENES[s.id]
            return (
              <Sequence key={s.id} from={s.from} durationInFrames={s.durationInFrames} name={s.id}>
                <Scene data={data} span={s} repoUrl={props.repoUrl} />
              </Sequence>
            )
          })}
          <PixelDissolve />
          <Frame data={data} />
          <Soundtrack data={data} />
        </>
      )}
    </AbsoluteFill>
  )
}

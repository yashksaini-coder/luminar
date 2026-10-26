/** LaunchV2 scenes: the open, three halftone statement cards, four mesh acts (publish → Sybil graft → prune → eclipse → heal)
 *  in a split grid cell, the honesty table and the end card. Every number is read off the reel or the engine constants. */
import { useMemo, type CSSProperties, type JSX, type ReactNode } from 'react'
import { Easing, interpolate, useCurrentFrame } from 'remotion'
import { ECLIPSE_WHY, MECHANISM } from '@/lib/copy'
import { TOY } from '../constants'
import { attackersAt } from '../mesh/attackers'
import { Mesh } from '../mesh/Mesh'
import { healedInS, invalidCountAt, scoreAt, tickerAt } from '../mesh/readouts'
import { lerpCamera, type Box, type Camera } from '../mesh/view'
import type { ReelData } from '../reel/parse'
import { HONESTY_ROWS } from '../scenes/copy'
import { Headline } from '../type/Headline'
import { BayerCover, Chip, Cursor, FLAME, G, HAIR, Halftone, Hatch, Mono, PAPER, Plus, Rule, SIGNAL, SPLIT, Stat } from './fx'
import { H, W, frameAt, shownScoreAt, simTimeAt, type V2Span } from './timeline'

export interface V2SceneProps { data: ReelData; span: V2Span; repoUrl: string }

const CLAMP = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const
const minus = (v: number, digits = 1) => (v < 0 ? '−' : '+') + Math.abs(v).toFixed(digits)
const pct = (d: ReelData, t: number) => { const k = tickerAt(d, t); return k ? `${Math.round(k.delivery * 100)}%` : '—' }
const honestCount = (d: ReelData) => d.nodes.filter(n => !n.attacker).length
const sybilFault = (d: ReelData) => d.faults.find(f => f.type === 'sybil')
const eclipseFault = (d: ReelData) => d.faults.find(f => f.type === 'eclipse')
const firstPrune = (d: ReelData) => d.prunes[0]?.at ?? Infinity

/** A line that fades up 16 px from frame `at`. */
function Rise({ at, children, style }: { at: number; children: ReactNode; style?: CSSProperties }): JSX.Element {
  const f = useCurrentFrame()
  const t = interpolate(f, [at, at + 14], [0, 1], { ...CLAMP, easing: Easing.out(Easing.cubic) })
  return <div style={{ opacity: t, transform: `translateY(${16 * (1 - t)}px)`, ...style }}>{children}</div>
}

/* ───────────────────────────── statement cards ───────────────────────────── */

/** Inside the grid frame, so the HUD bands stay clean pitch. */
const INNER = { width: W - 2 * G - 2, height: H - 2 * G - 2 }
const INNER_AT = { left: G + 1, top: G + 1 }

function Statement({ tint, kicker, lines, sub, px = 132 }: { tint: readonly [number, number, number]; kicker: ReactNode; lines: string[]; sub: ReactNode; px?: number }): JSX.Element {
  return (
    <>
      <Halftone {...INNER} tint={tint} quiet={{ cx: 0.5, cy: 0.5, rx: 0.42, ry: 0.4 }} style={{ ...INNER_AT, opacity: 0.85 }} />
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', gap: 40 }}>
        <Rise at={0}>{kicker}</Rise>
        <Headline lines={lines} px={px} italicLast at={6} stagger={8} />
        <Rise at={24}>{sub}</Rise>
      </div>
    </>
  )
}

export function Title({ data }: V2SceneProps): JSX.Element {
  return (
    <Statement
      tint={SIGNAL}
      kicker={<Chip tone="paper">GossipSub v1.1 simulator<Cursor /></Chip>}
      lines={['Watch a peer-to-peer network', 'defend itself.']}
      sub={<Mono px={22}>{honestCount(data)} peers · {sybilFault(data)?.n ?? 0} Sybils · one eclipse · one heal</Mono>}
    />
  )
}

export function Pruned({ data }: V2SceneProps): JSX.Element {
  const n = sybilFault(data)?.n ?? 0
  const hb = heartbeatsBetween(data, sybilFault(data)?.at ?? 0, firstPrune(data))
  return (
    <Statement
      tint={FLAME}
      kicker={<Chip tone="flame">P4 · invalid-message penalty</Chip>}
      lines={[`${word(n, true)} Sybils.`, `Pruned in ${word(hb)} heartbeats.`]}
      sub={<Mono px={22}>Every honest peer pruned them on its own · nobody coordinated it</Mono>}
    />
  )
}

const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine']
const word = (n: number, cap = false) => { const w = WORDS[n] ?? String(n); return cap ? w[0].toUpperCase() + w.slice(1) : w }

/** Heartbeat phase (s): prunes only happen on a heartbeat, so the first prune pins it. */
const hbPhase = (d: ReelData) => { const hb = TOY.heartbeatS; return ((firstPrune(d) % hb) + hb) % hb }

/** Heartbeats that fire in (a, b]. */
function heartbeatsBetween(d: ReelData, a: number, b: number): number {
  const hb = TOY.heartbeatS, ph = hbPhase(d)
  return Math.max(0, Math.floor((b - ph) / hb + 1e-6) - Math.floor((a - ph) / hb + 1e-6))
}

export function Honesty(): JSX.Element {
  const f = useCurrentFrame()
  const col = (i: number) => ({ padding: '22px 32px', display: 'flex', alignItems: 'center', borderLeft: i ? `1px solid ${HAIR}` : undefined })
  return (
    <>
      <Halftone {...INNER} tint={PAPER} pitch={18} quiet={{ cx: 0.5, cy: 0.5, rx: 0.5, ry: 0.48 }} style={{ ...INNER_AT, opacity: 0.35 }} speed={0.6} />
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 56 }}>
        <Headline lines={[MECHANISM]} px={104} at={0} />
        <div style={{ display: 'grid', gridTemplateColumns: '320px 260px 520px', border: `1px solid ${HAIR}`, background: 'rgb(11,11,13)' }}>
          {['', 'Luminar', 'Lighthouse'].map((h, i) => (
            <div key={h} style={{ ...col(i), borderBottom: `1px solid ${HAIR}` }}><Mono px={16} color={i === 1 ? 'var(--signal)' : 'var(--fg-3)'}>{h}</Mono></div>
          ))}
          {HONESTY_ROWS.map((row, r) => row.map((cell, i) => {
            const t = interpolate(f, [18 + 8 * r, 30 + 8 * r], [0, 1], CLAMP)
            return (
              <div key={`${r}${i}`} style={{ ...col(i), opacity: t, borderBottom: r < HONESTY_ROWS.length - 1 ? `1px solid ${HAIR}` : undefined }}>
                {i === 0
                  ? <Mono px={18}>{cell}</Mono>
                  : <span style={{ fontFamily: 'var(--font-ui)', fontWeight: 500, fontSize: 34, fontVariantNumeric: 'tabular-nums', color: i === 1 ? 'var(--fg)' : 'var(--fg-2)' }}>{cell}</span>}
              </div>
            )
          }))}
        </div>
      </div>
    </>
  )
}

export function End({ repoUrl }: V2SceneProps): JSX.Element {
  return (
    <>
      <Halftone {...INNER} tint={SIGNAL} quiet={{ cx: 0.5, cy: 0.5, rx: 0.4, ry: 0.42 }} style={{ ...INNER_AT, opacity: 0.7 }} speed={0.8} />
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 36, textAlign: 'center' }}>
        <Rise at={4}>
          <div style={{ fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 56, letterSpacing: '0.32em', marginRight: '-0.32em', color: 'var(--fg)' }}>LUMINAR</div>
        </Rise>
        <Headline lines={['Watch a network', 'defend itself.']} px={140} italicLast at={12} stagger={8} />
        <Rise at={34}>
          <div style={{ display: 'flex', alignItems: 'stretch', border: '1px solid rgba(242,242,239,0.4)' }}>
            <span style={{ padding: '18px 26px', background: 'var(--signal)', color: 'var(--on-signal)', fontFamily: 'var(--font-mono)', fontWeight: 600, fontSize: 22, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Open source · MIT</span>
            <span style={{ padding: '18px 26px', fontFamily: 'var(--font-mono)', fontWeight: 500, fontSize: 22, color: 'var(--fg)' }}>{repoUrl}<Cursor /></span>
          </div>
        </Rise>
      </div>
    </>
  )
}

/* ───────────────────────────────── the open ──────────────────────────────── */

const FULL: Box = { x: G + 1, y: G + 1, w: W - 2 * G - 2, h: H - 2 * G - 2 }

export function Open({ data }: V2SceneProps): JSX.Element {
  const f = useCurrentFrame()
  const word = 'LUMINAR'
  const typed = Math.round(interpolate(f, [20, 44], [0, word.length], CLAMP))
  const cam = useMemo<Camera>(() => ({ scale: 1.25 }), [])
  return (
    <>
      <Mesh data={data} box={FULL} camera={{ scale: cam.scale - 0.15 * (f / 75) }} simTime={2 + f / 30} cell={4} showAttackers={false} style={{ intensity: 0.9 }} />
      <BayerCover p={interpolate(f, [8, 44], [1, 0], CLAMP)} cell={40} />
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 28 }}>
        <div style={{ background: 'rgb(11,11,13)', border: `1px solid ${HAIR}`, padding: '28px 48px', fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 120, letterSpacing: '0.28em', marginRight: '-0.28em', color: 'var(--fg)', minWidth: 760, textAlign: 'center', opacity: f >= 18 ? 1 : 0 }}>
          {word.slice(0, typed)}<Cursor />
        </div>
        <Rise at={46}><Chip tone="signal">Recording · sybil-eclipse · {honestCount(data)} peers</Chip></Rise>
      </div>
    </>
  )
}

/* ──────────────────────────────── mesh acts ──────────────────────────────── */

const MESH: Box = { x: SPLIT + 1, y: G + 1, w: W - G - SPLIT - 2, h: H - 2 * G - 2 }
const STATS_Y = 744
const PAD = 56

interface Beat { num: string; name: string; tone: 'signal' | 'flame'; title: string[]; body: string; at: number }

/** The split cell: hatched left panel (beat number, serif title, body, 2×2 stats on a grid) beside the dithered mesh. */
function Act({ data, span, camera, beat, chip, stats, extra }: {
  data: ReelData; span: V2Span; camera: Camera; beat: Beat; chip: { tone: 'signal' | 'flame'; text: string }
  stats: [string, ReactNode, ('flame' | 'signal')?][]; extra?: ReactNode
}): JSX.Element {
  const f = useCurrentFrame()
  const simTime = simTimeAt(span, f)
  const hb = TOY.heartbeatS
  const phase = hbPhase(data)
  const lit = Math.floor(((((simTime - phase) % hb) + hb) % hb) / hb * 16) + 1
  const cellW = (SPLIT - G) / 2, cellH = (H - G - STATS_Y) / 2
  return (
    <>
      <Mesh data={data} box={MESH} camera={camera} simTime={simTime} cell={3} />
      <div style={{ position: 'absolute', left: MESH.x + 32, top: MESH.y + 32 }}>
        <Chip tone={chip.tone}>{chip.text}</Chip>
      </div>
      <div style={{ position: 'absolute', right: G + 32, top: MESH.y + 32, display: 'flex', alignItems: 'center', gap: 14, background: 'rgb(11,11,13)', padding: '10px 14px', border: `1px solid ${HAIR}` }}>
        <Mono px={14}>Heartbeat</Mono>
        <div style={{ display: 'flex', gap: 3 }}>
          {Array.from({ length: 16 }, (_, i) => <div key={i} style={{ width: 3, height: 18, background: i < lit ? 'var(--signal)' : 'rgba(77,220,220,0.18)' }} />)}
        </div>
      </div>
      <div style={{ position: 'absolute', left: G + 1, top: G + 1, width: SPLIT - G - 1, height: H - 2 * G - 1, background: 'rgb(11,11,13)' }} />
      <Hatch x={G + 1} y={G + 1} w={SPLIT - G - 1} h={STATS_Y - G - 1} />
      <div key={beat.at} style={{ position: 'absolute', left: G + PAD, top: G + PAD, width: SPLIT - G - 2 * PAD, display: 'flex', flexDirection: 'column', gap: 28 }}>
        <Rise at={beat.at}>
          <span style={{ background: 'rgb(11,11,13)', padding: '6px 10px', border: `1px solid ${HAIR}` }}>
            <Mono px={18} color={`var(--${beat.tone})`}>{beat.num} / {beat.name}</Mono>
          </span>
        </Rise>
        <div style={{ background: 'rgb(11,11,13)' }}>
          <Headline lines={beat.title} px={68} at={beat.at + 4} stagger={6} italicLast={beat.title.length > 1} />
        </div>
        <Rise at={beat.at + 18}>
          <p style={{ margin: 0, fontFamily: 'var(--font-ui)', fontSize: 24, lineHeight: 1.45, color: 'var(--fg-2)', background: 'rgb(11,11,13)' }}>{beat.body}</p>
        </Rise>
        {extra}
      </div>
      <Rule x={G} y={STATS_Y} len={SPLIT - G} />
      <Rule x={G + cellW} y={STATS_Y} len={H - G - STATS_Y} vertical />
      <Rule x={G} y={STATS_Y + cellH} len={SPLIT - G} />
      <Plus x={G + cellW} y={STATS_Y} /><Plus x={G + cellW} y={STATS_Y + cellH} /><Plus x={G + cellW} y={H - G} />
      <Plus x={G} y={STATS_Y} /><Plus x={SPLIT} y={STATS_Y} /><Plus x={G} y={STATS_Y + cellH} /><Plus x={SPLIT} y={STATS_Y + cellH} />
      {stats.map(([label, value, tone], i) => (
        <Stat key={label} label={label} value={value} tone={tone}
          style={{ position: 'absolute', left: G + (i % 2) * cellW + 32, top: STATS_Y + Math.floor(i / 2) * cellH + 26 }} />
      ))}
    </>
  )
}

export function Publish({ data, span }: V2SceneProps): JSX.Element {
  const f = useCurrentFrame()
  const t = simTimeAt(span, f)
  const k = tickerAt(data, t)
  const camera = { scale: interpolate(f, [0, span.durationInFrames], [1, 1.06]) }
  return (
    <Act data={data} span={span} camera={camera}
      beat={{ num: '01', name: 'Publish', tone: 'signal', title: ['One message,', `${honestCount(data)} peers.`], body: 'A flood publish crosses the GossipSub mesh: each peer forwards to its mesh links and gossips the rest.', at: 0 }}
      chip={{ tone: 'signal', text: 'All peers gossiping' }}
      stats={[['Peers', honestCount(data)], ['Delivery', pct(data, t)], ['Avg hops', k ? k.hops.toFixed(1) : '—'], ['Propagation', k ? `${Math.round(k.ms)} ms` : '—']]}
    />
  )
}

/** Pixel score bar: one cell per point toward −20, flame below zero, the toy prune line marked at −10. */
function ScoreCells({ score, label }: { score: number | null; label: string }): JSX.Element {
  const filled = score === null ? 0 : Math.round(Math.min(Math.abs(score), 20))
  const prune = Math.abs(TOY.pruneThreshold)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, background: 'rgb(11,11,13)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <Mono px={16}>{label}</Mono>
        <Mono px={16} color={score !== null && score < 0 ? 'var(--flame)' : 'var(--fg)'}>{score === null ? '—' : minus(score, 2)}</Mono>
      </div>
      <div style={{ display: 'flex', gap: 4, position: 'relative' }}>
        {Array.from({ length: 20 }, (_, i) => (
          <div key={i} style={{ width: 22, height: 22, background: i < filled ? (score! < 0 ? 'var(--flame)' : 'var(--paper-0)') : 'rgba(242,242,239,0.08)' }} />
        ))}
        <div style={{ position: 'absolute', left: prune * 26 - 3, top: -6, bottom: -6, width: 2, background: 'var(--paper-0)' }} />
      </div>
      <Mono px={14}>prune line {minus(TOY.pruneThreshold, 0)}</Mono>
    </div>
  )
}

export function Sybil({ data, span }: V2SceneProps): JSX.Element {
  const f = useCurrentFrame()
  const t = simTimeAt(span, f)
  const fault = sybilFault(data)
  const pruneAt = firstPrune(data)
  const pruned = t >= pruneAt
  const densest = useMemo(
    () => attackersAt(data, 11).reduce<{ id?: string; n: number }>((b, a) => (a.victims.length > b.n ? { id: a.id, n: a.victims.length } : b), { n: -1 }).id,
    [data],
  )
  const camera = lerpCamera({ scale: 1.05 }, { scale: 1.2, focus: densest }, interpolate(f, [0, 90], [0, 1], { ...CLAMP, easing: Easing.inOut(Easing.cubic) }))
  const pruneFrame = (frameAt(span, pruneAt) ?? span.from) - span.from
  const hb = heartbeatsBetween(data, fault?.at ?? 0, Math.min(t, pruneAt))
  const beat: Beat = pruned
    ? { num: '03', name: 'Prune', tone: 'signal', title: ['Pruned in', `${word(hb)} heartbeats.`], body: 'P4 charges every invalid message. Their scores fall through the prune line and each honest peer drops them on its own.', at: pruneFrame }
    : { num: '02', name: 'Sybil graft', tone: 'flame', title: [`${word(fault?.n ?? 0, true)} Sybils`, 'graft in.'], body: 'They push into the mesh and flood it with invalid messages. Watch the score fall.', at: 0 }
  return (
    <Act data={data} span={span} camera={camera} beat={beat}
      chip={pruned ? { tone: 'signal', text: 'Sybils pruned · mesh intact' } : t >= (fault?.at ?? 0) ? { tone: 'flame', text: `Sybil attack · ${fault?.n} attackers` } : { tone: 'signal', text: 'All peers gossiping' }}
      stats={[['Sybils', fault?.n ?? 0, 'flame'], ['Invalid msgs', invalidCountAt(data, t), 'flame'], ['Heartbeats', hb, pruned ? 'signal' : undefined], ['Delivery', pct(data, t)]]}
      extra={<Rise at={30}><ScoreCells score={shownScoreAt(data, 'sybil-0', t)} label={pruned ? 'sybil-0 score · after the prune heartbeat' : 'sybil-0 score'} /></Rise>}
    />
  )
}

export function Eclipse({ data, span }: V2SceneProps): JSX.Element {
  const f = useCurrentFrame()
  const t = simTimeAt(span, f)
  const fault = eclipseFault(data)
  const target = fault?.target ?? ''
  const n = data.nodes.filter(x => x.id.startsWith('eclipse-')).length
  const camera = lerpCamera({ scale: 1.1 }, { scale: 1.45, focus: target }, interpolate(f, [0, 60], [0, 1], { ...CLAMP, easing: Easing.out(Easing.cubic) }))
  return (
    <Act data={data} span={span} camera={camera}
      beat={{ num: '04', name: 'Eclipse', tone: 'flame', title: [`${word(n, true)} silent attackers`, `surround ${target}.`], body: `Scoring can't see this: ${ECLIPSE_WHY}.`, at: 0 }}
      chip={t >= (fault?.at ?? 0) ? { tone: 'flame', text: `Eclipse on ${target} · scoring blind` } : { tone: 'signal', text: 'All peers gossiping' }}
      stats={[['Target', target], ['Attackers', n, 'flame'], ['eclipse-0 score', (() => { const s = scoreAt(data, 'eclipse-0', t); return s === null ? '—' : minus(s, 2) })()], ['Delivery', pct(data, t)]]}
    />
  )
}

export function Heal({ data, span }: V2SceneProps): JSX.Element {
  const f = useCurrentFrame()
  const t = simTimeAt(span, f)
  const cleared = data.cleared[0]?.at ?? Infinity
  const healed = healedInS(data)
  const done = healed !== null && t >= cleared + healed
  const k = tickerAt(data, t)
  const camera = lerpCamera({ scale: 1.45, focus: eclipseFault(data)?.target }, { scale: 1 }, interpolate(f, [0, 60], [0, 1], { ...CLAMP, easing: Easing.inOut(Easing.cubic) }))
  return (
    <Act data={data} span={span} camera={camera}
      beat={{ num: '05', name: 'Heal', tone: 'signal', title: ['Faults cleared.', 'The mesh heals.'], body: 'Attackers drop away, honest peers re-graft, and delivery comes back without anyone stepping in.', at: 0 }}
      chip={done ? { tone: 'signal', text: 'All peers gossiping' } : { tone: 'signal', text: 'Faults cleared · re-grafting' }}
      stats={[['Healed in', done ? `${healed!.toFixed(1)} s` : '—', 'signal'], ['Delivery', pct(data, t)], ['Avg hops', k ? k.hops.toFixed(1) : '—'], ['Heartbeat', `${TOY.heartbeatS.toFixed(1)} s`]]}
    />
  )
}

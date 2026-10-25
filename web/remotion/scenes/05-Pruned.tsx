/** Scene 5 (0.6×): sybil-0's score strip falls past the prune line; the first PRUNE at T+11.9 erases every honest→Sybil edge. */
import { useMemo } from 'react'
import { useCurrentFrame } from 'remotion'
import { Mesh } from '../mesh/Mesh'
import { ScoreStrip } from '../mesh/ScoreStrip'
import { makeProjector, type Camera } from '../mesh/view'
import { frameForSimTime, simTimeAt } from '../timeline'
import { Fig } from '../type/Fig'
import { StampIn } from '../type/StampIn'
import { FIG, FIG_N, STAMP, STAMP_TILT } from './copy'
import { LAYOUT } from './layout'
import type { SceneProps } from './types'

const PEER = 'sybil-0'
const CAMERA: Camera = { scale: 1.15, focus: PEER }
/** Tall: the strip leaves the node, so a 2 px flame ring marks which peer it reads. */
const RING_R = 18
/** Wide: the strip hangs this far below the node (the camera scales about sybil-0, it does not centre it). */
const STRIP_DROP = 24

export default function Pruned({ data, orientation, span }: SceneProps) {
  const f = useCurrentFrame()
  const l = LAYOUT.pruned[orientation]
  const s = l.strip!
  const simTime = simTimeAt(span, f)
  const p = useMemo(() => makeProjector(data, l.mesh!, CAMERA), [data, l.mesh])
  const node = data.byId.get(PEER)
  const [nx, ny] = node ? p(node.x, node.y) : [0, 0]
  const tall = orientation === 'tall'
  const stripPos = tall || !node ? { left: s.x, top: s.y } : { left: Math.max(0, nx - s.w / 2), top: ny + STRIP_DROP }
  return (
    <>
      <Mesh data={data} box={l.mesh!} camera={CAMERA} simTime={simTime} cell={l.cell}
        cursor={f >= 20 ? { peer: PEER, click: f === 40 } : undefined} />
      {tall && node && (
        <div style={{ position: 'absolute', left: nx - RING_R, top: ny - RING_R, width: 2 * RING_R, height: 2 * RING_R, borderRadius: '50%', border: '2px solid var(--flame)', boxSizing: 'border-box' }} />
      )}
      <div style={{ position: 'absolute', ...stripPos }}>
        <ScoreStrip data={data} peer={PEER} simTime={simTime} orientation={orientation} width={s.w} />
      </div>
      <StampIn tilt={STAMP_TILT.pruned} anchor={l.stamp.anchor} inset={l.stamp.inset} at={frameForSimTime(span, 11.9) - span.from}>{STAMP.pruned}</StampIn>
      <Fig n={FIG_N.pruned!} orientation={orientation} box={l.caption!} at={90}>{FIG.pruned!}</Fig>
    </>
  )
}

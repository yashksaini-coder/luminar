/** Mesh footage: the dithered paper layer, then flat siblings above it (attackers, optional cursor reticle), on one projector. */
import { useCallback, useMemo, type JSX } from 'react'
import { Reticle } from '../../components/dither/Reticle'
import { Dither } from '../layers/Dither'
import type { ReelData } from '../reel/parse'
import { Attackers } from './Attackers'
import { DEFAULT_MESH_STYLE, drawMesh, type MeshStyle } from './drawMesh'
import { makeProjector, type Box, type Camera } from './view'

const RETICLE = 14

export function Mesh({ data, box, camera, simTime, cell = 3, style, showAttackers = true, cursor }: {
  data: ReelData; box: Box; camera: Camera; simTime: number; cell?: number; style?: Partial<MeshStyle>
  showAttackers?: boolean; cursor?: { peer: string; click?: boolean }
}): JSX.Element {
  const p = useMemo(() => makeProjector(data, box, camera), [data, box, camera])
  const s = { ...DEFAULT_MESH_STYLE, ...style }
  const { nodeR, edgeAlpha, meshAlpha, intensity, field } = s
  const draw = useCallback((ctx: CanvasRenderingContext2D) => {
    ctx.translate(-box.x, -box.y)
    drawMesh(ctx, data, p, simTime, { nodeR, edgeAlpha, meshAlpha, intensity, field }, { attackers: showAttackers })
  }, [box.x, box.y, data, p, simTime, nodeR, edgeAlpha, meshAlpha, intensity, field, showAttackers])
  const target = cursor && data.byId.get(cursor.peer)
  const [cx, cy] = target ? p(target.x, target.y) : [0, 0]

  return (
    <>
      <Dither width={box.w} height={box.h} cell={cell} draw={draw} style={{ position: 'absolute', left: box.x, top: box.y }} />
      {showAttackers && <Attackers data={data} p={p} simTime={simTime} box={box} />}
      {target && (
        <div style={{ position: 'absolute', left: cx - RETICLE / 2, top: cy - RETICLE / 2, lineHeight: 0, filter: cursor.click ? 'invert(1)' : undefined }}>
          <Reticle size={RETICLE} />
        </div>
      )}
    </>
  )
}

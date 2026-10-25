/** Per-scene, per-orientation layout tables; every tall box sits inside the Reels/Shorts safe area (tested). */
import type { Box } from '../mesh/view'
import type { Orientation } from '../props'
import type { SceneId } from '../timeline'

export type Anchor = 'tl' | 'tr' | 'bl' | 'br' | 'c'

export interface SceneLayout {
  mesh?: Box
  /** Inset from the anchored corner in px; for 'c' an offset from the centre. */
  stamp: { anchor: Anchor; inset: [number, number] }
  caption?: Box
  readout?: Box
  strip?: Box
  headlinePx?: number
  monoPx?: number
  cell: number
}

const W_MESH: Box = { x: 0, y: 0, w: 1920, h: 1080 }
const W_CAPTION: Box = { x: 1180, y: 940, w: 700, h: 100 }
const W_READOUT: Box = { x: 64, y: 980, w: 900, h: 60 }
const W_STRIP: Box = { x: 750, y: 700, w: 420, h: 60 }   // under the centred focus node (camera puts it at the box centre)
const W_STAMP: SceneLayout['stamp'] = { anchor: 'tr', inset: [96, 96] }

// Tall: the 1000 px square centred between SAFE_TALL.top (220) and 1920 − SAFE_TALL.bottom (1600).
const T_MESH: Box = { x: 40, y: 460, w: 1000, h: 1000 }
const T_CAPTION: Box = { x: 60, y: 1500, w: 960, h: 100 }
const T_CAPTION_HIGH: Box = { x: 60, y: 360, w: 960, h: 100 }   // scenes whose strip takes the band below the square
const T_READOUT: Box = { x: 60, y: 240, w: 960, h: 120 }
const T_STRIP: Box = { x: 40, y: 1460, w: 1000, h: 140 }
const T_STAMP: SceneLayout['stamp'] = { anchor: 'tr', inset: [60, 380] }
const T_STAMP_LOW: SceneLayout['stamp'] = { anchor: 'tr', inset: [60, 480] }   // inside the square's top-right, clear of T_CAPTION_HIGH

const wide = (l: Partial<SceneLayout> = {}): SceneLayout => ({ stamp: W_STAMP, headlinePx: 96, monoPx: 28, cell: 3, ...l })
const tall = (l: Partial<SceneLayout> = {}): SceneLayout => ({ stamp: T_STAMP, headlinePx: 72, monoPx: 36, cell: 3, ...l })

export const LAYOUT: Record<SceneId, Record<Orientation, SceneLayout>> = {
  'cold-open': { wide: wide({ mesh: W_MESH, stamp: { anchor: 'c', inset: [0, 0] } }), tall: tall({ mesh: T_MESH, stamp: { anchor: 'c', inset: [0, 0] } }) },
  title: { wide: wide({ caption: W_CAPTION }), tall: tall({ caption: T_CAPTION }) },
  healthy: { wide: wide({ mesh: W_MESH, caption: W_CAPTION, readout: W_READOUT }), tall: tall({ mesh: T_MESH, caption: T_CAPTION, readout: T_READOUT }) },
  sybils: { wide: wide({ mesh: W_MESH, readout: W_READOUT }), tall: tall({ mesh: T_MESH, readout: T_READOUT }) },
  pruned: {
    wide: wide({ mesh: W_MESH, caption: W_CAPTION, readout: W_READOUT, strip: W_STRIP }),
    tall: tall({ mesh: T_MESH, caption: T_CAPTION_HIGH, readout: T_READOUT, strip: T_STRIP, stamp: T_STAMP_LOW }),
  },
  eclipse: {
    wide: wide({ mesh: W_MESH, caption: W_CAPTION, readout: W_READOUT, strip: W_STRIP }),
    tall: tall({ mesh: T_MESH, caption: T_CAPTION_HIGH, readout: T_READOUT, strip: T_STRIP, stamp: T_STAMP_LOW }),
  },
  heal: { wide: wide({ mesh: W_MESH, caption: W_CAPTION, readout: W_READOUT }), tall: tall({ mesh: T_MESH, caption: T_CAPTION, readout: T_READOUT }) },
  'same-names': { wide: wide({ caption: W_CAPTION }), tall: tall({ mesh: { x: 40, y: 560, w: 1000, h: 600 }, caption: T_CAPTION }) },
  mainnet: { wide: wide({ caption: W_CAPTION }), tall: tall({ caption: T_CAPTION }) },
  honesty: { wide: wide({ headlinePx: 56, stamp: { anchor: 'c', inset: [0, 300] } }), tall: tall({ headlinePx: 44, monoPx: 44, stamp: { anchor: 'c', inset: [0, 400] } }) },
  end: {
    wide: wide({ mesh: W_MESH, headlinePx: 160, stamp: { anchor: 'tr', inset: [96, 96] } }),
    tall: tall({ mesh: T_MESH, headlinePx: 120, monoPx: 40, stamp: { anchor: 'tr', inset: [60, 260] } }),
  },
}

/** Every Box in a layout (for the safe-zone test). */
export function boxes(l: SceneLayout): Box[] {
  return [l.mesh, l.caption, l.readout, l.strip].filter((b): b is Box => b !== undefined)
}

/** Plate bounds at the max 24-char label and the 14 px stamp face, padded for the tilt. */
const STAMP_PLATE = { w: 420, h: 60 }

/** The stamp's on-screen box (for the overlap test). */
export function stampBox(l: SceneLayout, frame: { width: number; height: number }): Box {
  const { anchor, inset: [dx, dy] } = l.stamp
  const { w, h } = STAMP_PLATE
  if (anchor === 'c') return { x: frame.width / 2 + dx - w / 2, y: frame.height / 2 + dy - h / 2, w, h }
  return { x: anchor[1] === 'l' ? dx : frame.width - dx - w, y: anchor[0] === 't' ? dy : frame.height - dy - h, w, h }
}

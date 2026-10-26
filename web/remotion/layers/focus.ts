/** Focus backdrop for text over the mesh: a feathered pitch panel that dims the network behind the words only,
 *  so captions, tickers and titles read without the dither showing through them. */
import type { CSSProperties } from 'react'

const PITCH_DIM = 'rgba(11,11,13,0.84)'

/** Style for the element that wraps a text block; `pad` is how far the soft edge reaches past the text (px). */
export function focusPanel(pad = 24): CSSProperties {
  return { background: PITCH_DIM, boxShadow: `0 0 ${2 * pad}px ${pad}px ${PITCH_DIM}`, borderRadius: pad }
}

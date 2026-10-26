/** LaunchV2 visual language: the hairline grid with + registration marks, the halftone dot field, the Bayer pixel
 *  dissolve between scenes, mono chips and stat cells with a blinking cursor. Every canvas is a pure function of the frame. */
import { useLayoutEffect, useRef, type CSSProperties, type JSX, type ReactNode } from 'react'
import { Easing, interpolate, useCurrentFrame } from 'remotion'
import { bayer } from '../../components/dither/dither'
import { CUTS, H, W } from './timeline'

export const G = 64            // outer gutter: the frame's grid lines sit this far in
export const SPLIT = 704       // the mesh acts' left cell ends here
export const HAIR = 'rgba(242,242,239,0.16)'
export const SIGNAL = [77, 220, 220] as const
export const FLAME = [255, 90, 44] as const
export const PAPER = [242, 242, 239] as const
export type RGB = readonly [number, number, number]
const CLAMP = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const

const MONO: CSSProperties = { fontFamily: 'var(--font-mono)', fontWeight: 500, fontVariantNumeric: 'tabular-nums', letterSpacing: '0.06em', textTransform: 'uppercase' }

/** The blinking underscore after a value: 15 frames on, 15 off. */
export function Cursor({ color = 'var(--signal)' }: { color?: string }): JSX.Element {
  const f = useCurrentFrame()
  return <span style={{ color, opacity: Math.floor(f / 15) % 2 === 0 ? 1 : 0 }}>_</span>
}

export function Mono({ px = 18, color = 'var(--fg-3)', style, children }: { px?: number; color?: string; style?: CSSProperties; children: ReactNode }): JSX.Element {
  return <span style={{ ...MONO, fontSize: px, color, ...style }}>{children}</span>
}

/** Boxed mono status chip (Axiom's "ALL SYSTEMS OPERATIONAL"): tinted text on a 12 % wash with a 1 px rule. */
export function Chip({ tone, children, style }: { tone: 'signal' | 'flame' | 'paper'; children: ReactNode; style?: CSSProperties }): JSX.Element {
  const c = tone === 'signal' ? SIGNAL : tone === 'flame' ? FLAME : PAPER
  return (
    <div style={{ ...MONO, fontSize: 18, color: `rgb(${c})`, background: `rgb(${c.map((v, i) => Math.round(0.88 * [11, 11, 13][i] + 0.12 * v))})`, border: `1px solid rgba(${c},0.45)`, padding: '10px 16px', display: 'inline-flex', gap: 10, alignItems: 'center', whiteSpace: 'nowrap', ...style }}>
      {children}
    </div>
  )
}

/** One stat cell: small dim label over a large mono value with the blinking cursor. */
export function Stat({ label, value, tone, style }: { label: string; value: ReactNode; tone?: 'flame' | 'signal'; style?: CSSProperties }): JSX.Element {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, ...style }}>
      <Mono px={16}>{label}</Mono>
      <span style={{ fontFamily: 'var(--font-ui)', fontWeight: 500, fontSize: 48, lineHeight: 1, fontVariantNumeric: 'tabular-nums', color: tone ? `var(--${tone})` : 'var(--fg)', whiteSpace: 'nowrap' }}>
        {value}<Cursor color={tone ? `var(--${tone})` : 'var(--fg-3)'} />
      </span>
    </div>
  )
}

/** A + registration mark centred on (x, y). */
export function Plus({ x, y, opacity = 1 }: { x: number; y: number; opacity?: number }): JSX.Element {
  const a = 9
  return (
    <svg width={2 * a + 1} height={2 * a + 1} style={{ position: 'absolute', left: x - a, top: y - a, opacity }} aria-hidden="true">
      <path d={`M${a + 0.5} 0V${2 * a + 1}M0 ${a + 0.5}H${2 * a + 1}`} stroke="rgba(242,242,239,0.7)" strokeWidth={1} />
    </svg>
  )
}

/** A hairline that draws in from its start over `[at, at + 24]` frames. */
export function Rule({ x, y, len, vertical, at = 0 }: { x: number; y: number; len: number; vertical?: boolean; at?: number }): JSX.Element {
  const f = useCurrentFrame()
  const t = interpolate(f, [at, at + 24], [0, 1], { ...CLAMP, easing: Easing.out(Easing.cubic) })
  const size = vertical ? { width: 1, height: len * t } : { width: len * t, height: 1 }
  return <div style={{ position: 'absolute', left: x, top: y, background: HAIR, ...size }} />
}

/** Draws on a canvas once per frame (and whenever `deps` change). */
function useFrameCanvas(draw: (ctx: CanvasRenderingContext2D) => void, deps: unknown[]) {
  const ref = useRef<HTMLCanvasElement>(null)
  const frame = useCurrentFrame()
  useLayoutEffect(() => {
    const ctx = ref.current?.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height)
    draw(ctx)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frame, ...deps])
  return ref
}

/** Halftone dot field (Lighthouse / Cotool): dot radius follows a slow travelling interference field; dots shrink
 *  inside the `quiet` ellipse (fractions of the box) so a statement set there reads on clean pitch. */
export function Halftone({ width = W, height = H, tint, pitch = 16, quiet, speed = 1, style }: {
  width?: number; height?: number; tint: RGB; pitch?: number; quiet?: { cx: number; cy: number; rx: number; ry: number }; speed?: number; style?: CSSProperties
}): JSX.Element {
  const f = useCurrentFrame()
  const t = (f / 30) * speed
  const ref = useFrameCanvas(ctx => {
    ctx.fillStyle = `rgb(${tint})`
    const rMax = pitch * 0.46
    for (let y = pitch / 2; y < height; y += pitch) {
      for (let x = pitch / 2; x < width; x += pitch) {
        let v = 0.5 + 0.28 * Math.sin(x * 0.0042 + t * 0.7) * Math.cos(y * 0.0061 - t * 0.45) + 0.22 * Math.sin((x + 1.6 * y) * 0.0023 - t * 0.9)
        if (quiet) {
          const dx = (x / width - quiet.cx) / quiet.rx, dy = (y / height - quiet.cy) / quiet.ry
          v *= Math.min(1, Math.max(0, Math.hypot(dx, dy) - 0.7) / 0.6)
        }
        const r = rMax * v * v
        if (r < 0.6) continue
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill()
      }
    }
  }, [t, tint, pitch, width, height, quiet?.cx, quiet?.cy, quiet?.rx, quiet?.ry])
  return <canvas ref={ref} width={width} height={height} style={{ position: 'absolute', left: 0, top: 0, ...style }} aria-hidden="true" />
}


/** Coverage of the dissolve at frame f: rises to 1 into each cut over `half` frames and falls away after it. */
export function dissolveAt(f: number, half = 12): number {
  let p = 0
  for (const c of CUTS) p = Math.max(p, 1 - Math.abs(f - c + 0.5) / half)
  return Math.max(0, p)
}

/** Pitch cells over everything whose Bayer threshold is below `p`; the leading edge (newest level) flashes signal. */
export function BayerCover({ p, cell = 40 }: { p: number; cell?: number }): JSX.Element {
  const ref = useFrameCanvas(ctx => {
    if (p <= 0) return
    for (let y = 0; y * cell < H; y++) {
      for (let x = 0; x * cell < W; x++) {
        const v = bayer(x, y)
        if (v >= p) continue
        ctx.fillStyle = v > p - 1 / 64 ? `rgb(${SIGNAL})` : 'rgb(11,11,13)'   // one Bayer level: the newest cells flash
        ctx.fillRect(x * cell, y * cell, cell, cell)
      }
    }
  }, [p, cell])
  return <canvas ref={ref} width={W} height={H} style={{ position: 'absolute', left: 0, top: 0 }} aria-hidden="true" />
}

/** The full-frame dissolve through the 8×8 Bayer matrix into and out of every cut. */
export function PixelDissolve(): JSX.Element {
  return <BayerCover p={dissolveAt(useCurrentFrame())} />
}

/** A 45° hairline hatch (Axiom's hero cell), drawn as an SVG pattern rather than a CSS gradient. */
export function Hatch({ x, y, w, h }: { x: number; y: number; w: number; h: number }): JSX.Element {
  return (
    <svg width={w} height={h} style={{ position: 'absolute', left: x, top: y }} aria-hidden="true">
      <defs>
        <pattern id="v2hatch" width={14} height={14} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1={0} y1={0} x2={0} y2={14} stroke="rgba(242,242,239,0.06)" strokeWidth={1} />
        </pattern>
      </defs>
      <rect width={w} height={h} fill="url(#v2hatch)" />
    </svg>
  )
}

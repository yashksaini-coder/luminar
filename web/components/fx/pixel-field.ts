// Pure pixel-field renderers (landing v2 "Shared engine"). Each preset maps (t, cols, rows) to one tone
// per cell: 0 off, 1 body, 2 accent, 3 hot. Dither presets threshold a 0..1 field with the 8×8 Bayer
// matrix from components/dither/dither.ts; dot presets (halftone, scatter) keep the coverage in `v` and
// PixelField draws circles whose radius follows it. Same inputs, same output: no Math.random, no clock.
import { bayer } from '@/components/dither/dither'

export const PRESETS = ['sphere', 'swirl', 'rays', 'rings', 'split', 'halftone', 'scatter', 'tree'] as const
export type Preset = (typeof PRESETS)[number]
/** Presets drawn as round dots sized by `v` instead of Bayer squares. */
export const DOT_PRESETS: readonly Preset[] = ['halftone', 'scatter']

export interface FieldOpts {
  /** coverage multiplier, 0..2 (1 = as designed) */
  density?: number
  /** sphere: how many network nodes ride the surface */
  nodes?: number
}
export interface Field { cols: number; rows: number; tone: Uint8Array; v: Float32Array }

/** ease-in-out cubic ≈ --io; the landing count-ups share it. */
export const easeCount = (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2)

/** Deterministic hash of a cell → [0, 1). */
export function hash(x: number, y: number): number {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263)) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n)

/** Sum of sines: a smooth, cheap, deterministic "noise" field in ~[0, 1]. */
function waves(x: number, y: number, t: number): number {
  return 0.5 + 0.22 * Math.sin(x * 1.7 + t * 0.9) * Math.cos(y * 1.3 - t * 0.6)
    + 0.16 * Math.sin((x + y) * 2.3 - t * 1.1) + 0.12 * Math.cos(Math.hypot(x - 0.6, y + 0.4) * 3.1 - t * 0.8)
}

// ---- sphere: a rotating shaded globe with a k-nearest-neighbour network riding its surface ----

type Vec = [number, number, number]
interface Net { pts: Vec[]; edges: [number, number][]; hop: number[]; maxHop: number }
const nets = new Map<number, Net>()

/** Fibonacci sphere, 3 nearest neighbours each, hop distance from node 0 (the publisher). Memoised per n. */
export function network(n: number): Net {
  const hit = nets.get(n)
  if (hit) return hit
  const pts: Vec[] = []
  const g = Math.PI * (3 - Math.sqrt(5))
  for (let i = 0; i < n; i++) {
    const y = 1 - (2 * (i + 0.5)) / n, r = Math.sqrt(1 - y * y), a = i * g
    pts.push([Math.cos(a) * r, y, Math.sin(a) * r])
  }
  const key = new Set<string>(), edges: [number, number][] = [], adj: number[][] = pts.map(() => [])
  pts.forEach((p, i) => {
    const near = pts.map((q, j) => [j, (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2] as const)
      .filter(([j]) => j !== i).sort((a, b) => a[1] - b[1]).slice(0, 3)
    for (const [j] of near) {
      const k = i < j ? `${i}-${j}` : `${j}-${i}`
      if (key.has(k)) continue
      key.add(k); edges.push([i, j]); adj[i].push(j); adj[j].push(i)
    }
  })
  const hop = pts.map(() => -1); hop[0] = 0
  for (const q = [0]; q.length;) { const i = q.shift()!; for (const j of adj[i]) if (hop[j] < 0) { hop[j] = hop[i] + 1; q.push(j) } }
  const net = { pts, edges, hop, maxHop: Math.max(...hop) }
  nets.set(n, net)
  return net
}

const TILT = 0.38
const LIGHT: Vec = (() => { const l: Vec = [-0.55, 0.62, 0.56], m = Math.hypot(...l); return [l[0] / m, l[1] / m, l[2] / m] })()
const WAVE_S = 4.2   // one publish crosses the globe, then the next one starts

function rotate(p: Vec, a: number): Vec {
  const c = Math.cos(a), s = Math.sin(a), x = p[0] * c + p[2] * s, z = -p[0] * s + p[2] * c
  const ct = Math.cos(TILT), st = Math.sin(TILT)
  return [x, p[1] * ct - z * st, p[1] * st + z * ct]
}

interface Body { v: Float32Array; tone: Uint8Array; ring: Int32Array; ringA: Float32Array }
const bodies = new Map<string, Body>()

/** The shaded globe is lit in view space, so it never changes while the network turns: memoise per size. */
function body(cols: number, rows: number, density: number): Body {
  const key = `${cols}x${rows}x${density}`, hit = bodies.get(key)
  if (hit) return hit
  const cx = cols / 2, cy = rows / 2, R = Math.min(cols, rows) * 0.42
  const v = new Float32Array(cols * rows), tone = new Uint8Array(cols * rows), ring: number[] = [], ringA: number[] = []
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    const px = (x + 0.5 - cx) / R, py = (cy - y - 0.5) / R, d2 = px * px + py * py, i = y * cols + x
    if (d2 > 1) {   // the orbit ring just outside the limb: remember its cells, animate them per frame
      const r = Math.sqrt(d2)
      if (r > 1.12 && r < 1.17 && hash(x, y) < 0.8) { ring.push(i); ringA.push(Math.atan2(py, px)) }
      continue
    }
    const lam = Math.max(0, px * LIGHT[0] + py * LIGHT[1] + Math.sqrt(1 - d2) * LIGHT[2])
    v[i] = clamp01((0.06 + 0.8 * lam ** 1.35) * density)
    if (v[i] > bayer(x, y)) tone[i] = 1
  }
  const out = { v, tone, ring: Int32Array.from(ring), ringA: Float32Array.from(ringA) }
  if (bodies.size > 16) bodies.clear()   // resizes only; a handful of sizes per page
  bodies.set(key, out)
  return out
}

function sphere(f: Field, t: number, density: number, n: number) {
  const { cols, rows, tone } = f
  const cx = cols / 2, cy = rows / 2, R = Math.min(cols, rows) * 0.42
  const b = body(cols, rows, density)
  f.v.set(b.v); tone.set(b.tone)
  for (let k = 0; k < b.ring.length; k++) if (Math.sin((b.ringA[k] - t * 0.15) * 24) > 0.55) tone[b.ring[k]] = 1   // turning the other way
  const net = network(n), a = t * 0.22
  const proj = net.pts.map(p => rotate(p, a))
  const front = ((t % WAVE_S) / WAVE_S) * (net.maxHop + 2)
  const put = (x: number, y: number, k: number) => {
    if (x >= 0 && y >= 0 && x < cols && y < rows) { const i = y * cols + x; if (tone[i] < k) tone[i] = k }
  }
  const plot = (p: Vec, k: number) => {   // back hemisphere: hidden behind the globe
    if (p[2] >= 0.05) put(Math.floor(cx + p[0] * R), Math.floor(cy - p[1] * R), k)
  }
  for (const [i, j] of net.edges) {
    const A = proj[i], B = proj[j]
    const hot = front - Math.max(net.hop[i], net.hop[j]) > 0 && front - Math.max(net.hop[i], net.hop[j]) < 1.2
    const steps = Math.ceil(Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2]) * R * 1.4) + 1
    for (let s = 0; s <= steps; s++) {   // great-circle arc: lerp, then back onto the surface
      const u = s / steps, q: Vec = [A[0] + (B[0] - A[0]) * u, A[1] + (B[1] - A[1]) * u, A[2] + (B[2] - A[2]) * u]
      const m = Math.hypot(...q) || 1
      plot([q[0] / m, q[1] / m, q[2] / m], hot ? 3 : 2)
    }
  }
  proj.forEach((p, i) => {   // nodes: a 2×2 block, hot while the publish wave passes them
    if (p[2] < 0.05) return
    const k = Math.abs(front - net.hop[i] - 0.5) < 0.6 ? 3 : 2
    const x = Math.floor(cx + p[0] * R), y = Math.floor(cy - p[1] * R)
    put(x, y, k); put(x - 1, y, k); put(x, y - 1, k); put(x - 1, y - 1, k)
  })
}

// ---- flat fields: polar coordinates around the centre, unit = half the short side ----

const polars = new Map<string, { r: Float32Array; a: Float32Array; x: Float32Array; y: Float32Array }>()
/** Polar coordinates of every cell, unit = half the short side; memoised per size. */
function polar(cols: number, rows: number) {
  const key = `${cols}x${rows}`, hit = polars.get(key)
  if (hit) return hit
  const n = cols * rows, s = Math.min(cols, rows) / 2, out = { r: new Float32Array(n), a: new Float32Array(n), x: new Float32Array(n), y: new Float32Array(n) }
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    const i = y * cols + x, ux = (x + 0.5 - cols / 2) / s, uy = (y + 0.5 - rows / 2) / s
    out.x[i] = ux; out.y[i] = uy; out.r[i] = Math.hypot(ux, uy); out.a[i] = Math.atan2(uy, ux)
  }
  if (polars.size > 16) polars.clear()
  polars.set(key, out)
  return out
}

interface Flat { v: (t: number) => (r: number, a: number, x: number, y: number) => number; hot: (t: number, r: number, x: number) => boolean }
const FLAT: Record<Exclude<Preset, 'sphere' | 'scatter' | 'halftone' | 'tree'>, Flat> = {
  // spiral arms winding into the centre (pink swirl card)
  swirl: { v: t => (r, a) => 0.5 + 0.5 * Math.sin(6 * a + 5 * Math.log(r + 0.08) + t * 1.2), hot: (_, r) => r < 0.16 },
  // eight rays converging, bands travelling inward along them (Sybils closing on a peer)
  rays: {
    v: t => (r, a) => Math.max(0, Math.cos(8 * a + t * 0.12)) ** 1.6 * (0.55 + 0.45 * Math.sin(r * 14 + t * 2.4)) + (r < 0.14 ? 0.9 : 0),
    hot: (_, r) => r < 0.22,
  },
  // concentric rings closing on a centre (an eclipse)
  rings: { v: t => r => (r < 0.18 ? 0.85 : 0.5 + 0.5 * Math.sin(r * 18 + t * 2)), hot: (_, r) => r < 0.18 },
  // a field split by a vertical gap that breathes (a partition)
  split: {
    v: t => {
      const gap = 0.16 + 0.08 * Math.sin(t * 0.9)
      return (_r, _a, x, y) => (Math.abs(x) < gap ? 0 : waves(x * 1.2 + Math.sign(x) * t * 0.05, y * 1.2, t) * 0.9 + 0.05)
    },
    hot: (t, _, x) => Math.abs(x) < 0.23 + 0.08 * Math.sin(t * 0.9),
  },
}

function flat(f: Field, t: number, density: number, def: Flat) {
  const { cols, rows, tone } = f, p = polar(cols, rows), fn = def.v(t)
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    const i = y * cols + x, v = clamp01(fn(p.r[i], p.a[i], p.x[i], p.y[i]) * density)
    f.v[i] = v
    if (v > bayer(x, y)) tone[i] = def.hot(t, p.r[i], p.x[i]) ? 2 : 1
  }
}

function halftone(f: Field, t: number, density: number) {
  const { cols, rows } = f, s = Math.max(cols, rows) / 4
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    const v = clamp01((waves(x / s, y / s, t * 0.6) - 0.25) * 1.4 * density), i = y * cols + x
    f.v[i] = v
    if (v > 0.08) f.tone[i] = v > 0.82 ? 2 : 1
  }
}

/** Cotool cloud: an orderly grid in the top right dissolving into loose dots; the front drifts slowly. */
function scatter(f: Field, t: number, density: number) {
  const { cols, rows } = f
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    const d = (x / cols) * 0.9 + (1 - y / rows) * 0.7 + 0.08 * Math.sin(t * 0.5 + y * 0.3)   // 0 bottom-left … 1.6 top-right
    const p = clamp01((d - 0.55) * 1.3 * density), i = y * cols + x
    if (hash(x, y) < p) { f.v[i] = 1; f.tone[i] = d > 1.15 ? 2 : 1 }
  }
}

/** Offset of a scatter dot inside its cell, in cells (-0.5..0.5), looser where the grid has dissolved. */
export function jitter(x: number, y: number, cols: number, rows: number): [number, number] {
  const loose = clamp01(1.2 - ((x / cols) * 0.9 + (1 - y / rows) * 0.7))
  return [(hash(x, y + 7919) - 0.5) * loose * 1.6, (hash(x + 104729, y) - 0.5) * loose * 1.6]
}

/** Renders one frame of `preset` at time `t` (seconds) on a cols×rows grid. Pure. */
export function renderField(preset: Preset, t: number, cols: number, rows: number, opts: FieldOpts = {}): Field {
  const { density = 1, nodes = 50 } = opts
  const f: Field = { cols, rows, tone: new Uint8Array(cols * rows), v: new Float32Array(cols * rows) }
  if (preset === 'sphere') sphere(f, t, density, nodes)
  else if (preset === 'halftone') halftone(f, t, density)
  else if (preset === 'scatter') scatter(f, t, density)
  else if (preset === 'tree') tree(f, t, density)
  else flat(f, t, density, FLAT[preset])
  return f
}

// ---- tree (footer lane): one publish fanning out hop by hop, a dithered crown of peers at the tips ----
// The Framer footer's point-cloud tree, read as gossip: a trunk from the publisher, three branches per
// hop for four hops, the crown is the peers that received it. The wave climbs one hop at a time.

const TREE_HOPS = 4
interface Tree { segs: Float32Array; hop: Uint8Array; tips: Float32Array; crown: Float32Array }
const trees = new Map<string, Tree>()

/** Branch geometry and the crown's static coverage, memoised per size (deterministic: hash, no random). */
export function treeShape(cols: number, rows: number): Tree {
  const key = `${cols}x${rows}`, hit = trees.get(key)
  if (hit) return hit
  const U = Math.min(cols * 1.1, rows), segs: number[] = [], hop: number[] = [], tips: number[] = []
  const grow = (x: number, y: number, ang: number, len: number, h: number) => {
    const ex = x + Math.sin(ang) * len, ey = y - Math.cos(ang) * len
    segs.push(x, y, ex, ey); hop.push(h)
    if (h >= 1) tips.push(ex, ey, h)
    if (h === TREE_HOPS) return
    const spread = [0.7, 0.56, 0.46, 0.4][h]
    for (let k = -1; k <= 1; k++) grow(ex, ey, ang * 0.6 + k * spread + (hash(segs.length, h) - 0.5) * 0.28, len * 0.72, h + 1)
  }
  grow(cols / 2, rows - 1, 0.04, U * 0.26, 0)
  const crown = new Float32Array(cols * rows)
  for (let k = 0; k < tips.length; k += 3) {   // a soft disc of peers round every branch tip, larger at the edge
    const tx = tips[k], ty = tips[k + 1], R = U * (tips[k + 2] === TREE_HOPS ? 0.085 : 0.06)
    for (let y = Math.max(0, Math.floor(ty - R)); y <= Math.min(rows - 1, Math.ceil(ty + R)); y++)
      for (let x = Math.max(0, Math.floor(tx - R)); x <= Math.min(cols - 1, Math.ceil(tx + R)); x++) {
        const d = Math.hypot(x + 0.5 - tx, y + 0.5 - ty) / R, i = y * cols + x
        if (d < 1) crown[i] = Math.max(crown[i], (1 - d) ** 0.7)
      }
  }
  const out = { segs: Float32Array.from(segs), hop: Uint8Array.from(hop), tips: Float32Array.from(tips), crown }
  if (trees.size > 16) trees.clear()
  trees.set(key, out)
  return out
}

function tree(f: Field, t: number, density: number) {
  const { cols, rows, tone } = f, sh = treeShape(cols, rows), s = Math.max(cols, rows) / 3
  for (let i = 0; i < sh.crown.length; i++) {   // the crown shimmers: a slow field over the static cover
    if (!sh.crown[i]) continue
    const x = i % cols, y = (i - x) / cols
    const v = clamp01(sh.crown[i] * (0.45 + 0.7 * waves(x / s, y / s, t * 0.5)) * density)
    f.v[i] = v
    if (v > bayer(x, y)) tone[i] = 1
  }
  const front = ((t % WAVE_S) / WAVE_S) * (TREE_HOPS + 2)
  const put = (x: number, y: number, k: number) => {
    if (x >= 0 && y >= 0 && x < cols && y < rows) { const i = y * cols + x; if (tone[i] < k) tone[i] = k }
  }
  for (let n = 0; n < sh.hop.length; n++) {   // branches: accent; the stretch the message is crossing: hot
    const x0 = sh.segs[n * 4], y0 = sh.segs[n * 4 + 1], x1 = sh.segs[n * 4 + 2], y1 = sh.segs[n * 4 + 3]
    const at = front - sh.hop[n], steps = Math.ceil(Math.hypot(x1 - x0, y1 - y0)) + 1
    for (let k = 0; k <= steps; k++) {
      const u = k / steps
      put(Math.floor(x0 + (x1 - x0) * u), Math.floor(y0 + (y1 - y0) * u), u <= at && at - u < 1.1 ? 3 : 2)
    }
  }
  for (let k = 0; k < sh.tips.length; k += 3) {   // a tip flashes as the message lands on it
    if (Math.abs(front - sh.tips[k + 2] - 0.5) > 0.5) continue
    const x = Math.floor(sh.tips[k]), y = Math.floor(sh.tips[k + 1])
    put(x, y, 3); put(x - 1, y, 3); put(x, y - 1, 3); put(x - 1, y - 1, 3)
  }
}

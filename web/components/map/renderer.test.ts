import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { type GlyphId, HALO_OUTER } from '@/components/map/atlas'

const { FakeDeck, buildAtlasMock, reducedMotionMock } = vi.hoisted(() => {
  type Props = Record<string, any>   // eslint-disable-line @typescript-eslint/no-explicit-any
  class FakeDeck {
    static instances: FakeDeck[] = []
    props: Props
    setPropsCalls: Props[] = []
    finalize = vi.fn()
    constructor(props: Props) { this.props = props; FakeDeck.instances.push(this) }
    setProps(p: Props) { this.setPropsCalls.push(p); Object.assign(this.props, p) }
    lastLayer(id: string) {
      const call = this.setPropsCalls.filter(p => p.layers).at(-1)
      return call?.layers.find((l: { id: string }) => l.id === id)
    }
  }
  const buildAtlasMock = vi.fn()
  const reducedMotionMock = vi.fn(() => false)
  return { FakeDeck, buildAtlasMock, reducedMotionMock }
})

vi.mock('@/lib/api/client', () => ({ getStatic: vi.fn(async () => ({ features: [{ geometry: { type: 'Polygon', coordinates: [[[0, 0], [10, 0], [10, 10], [0, 0]]] } }, { geometry: { type: 'Polygon', coordinates: [[[0, -63], [10, -70], [20, -90], [0, -63]]] } }] })) }))   // second ring: Antarctica, wholly south of WORLD_BOUNDS
vi.mock('@deck.gl/core', async (importOriginal) => ({ ...await importOriginal<object>(), Deck: FakeDeck }))
vi.mock('@/lib/prefs', async (importOriginal) => ({ ...await importOriginal<object>(), reducedMotion: reducedMotionMock }))
vi.mock('@/components/map/atlas', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/components/map/atlas')>()
  const ids: GlyphId[] = ['disc', 'idle', 'origin', 'decoded', 'observer', 'joining', 'failed', 'error', 'attacker', 'pruned', 'reticle', 'square', 'squareTrail', 'halo-0', 'halo-1', 'halo-2', 'halo-3']
  buildAtlasMock.mockImplementation((opts: { cellPx: number }) => ({
    image: document.createElement('canvas'),
    mapping: Object.fromEntries(ids.map(id => [id, { x: 0, y: 0, width: 8, height: 8, mask: false }])),
    nodePx: 8, cellPx: opts.cellPx,   // the real cell, so stage (3 px) reaches the layers
  }))
  return { ...real, buildAtlas: buildAtlasMock }
})

import { _deepEqual } from '@deck.gl/core'
import { RETICLE_CURSOR } from '@/components/dither/Reticle'
import { GEO_SCALE, resetLayoutMemory, WORLD_BOUNDS } from '@/components/map/layout'
import { nodeRadiusPx } from '@/components/map/geometry'
import { PAL } from '@/components/map/palette'
import { destroyRenderer, fitView, fontsReadyForTest, initRenderer, layerIds, resizeRenderer, spawnParticle, visiblePositions } from '@/components/map/renderer'
import { getStatic } from '@/lib/api/client'
import { dispatchFrame, flushEvents } from '@/lib/api/dispatch'
import { peers, ring, snapWith } from '@/lib/fixtures'
import { monoFamily } from '@/lib/fonts'
import { useStore } from '@/lib/store'
import type { PeerNode } from '@/lib/types'

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame'] })   // real performance.mark/measure
  FakeDeck.instances = []
  useStore.setState(useStore.getInitialState(), true)
  reducedMotionMock.mockReturnValue(false)
  vi.mocked(getStatic).mockClear()
  const st = document.documentElement.style
  st.setProperty('--font-mono', '"__IBM_Plex_Mono_test", monospace')
  // distinct label colours so getColor assertions are not grey == grey
  st.setProperty('--paper-0', '#eeeeee'); st.setProperty('--paper-2', '#999999'); st.setProperty('--paper-3', '#555555'); st.setProperty('--flame', '#ff5a2c')
  resetLayoutMemory()
  destroyRenderer()
})
afterEach(() => {
  destroyRenderer()
  delete document.documentElement.dataset.stage
  vi.useRealTimers()
})

const mount = () => { const c = document.createElement('canvas'); const p = document.createElement('div'); p.appendChild(c); document.body.appendChild(p); initRenderer(c, null); return c }
const flush = () => { vi.advanceTimersByTime(20) }   // one rAF (fake timers drive requestAnimationFrame)

test('init is StrictMode-safe and destroy is idempotent', () => {
  mount(); mount(); expect(FakeDeck.instances).toHaveLength(2); expect(FakeDeck.instances[0].finalize).toHaveBeenCalledTimes(1)
  destroyRenderer(); destroyRenderer(); expect(FakeDeck.instances[1].finalize).toHaveBeenCalledTimes(1)
  useStore.getState().applySnapshot(snapWith(['peer-0'])); flush(); expect(FakeDeck.instances[1].setPropsCalls.filter(p => p.layers)).toHaveLength(0)   // no render after destroy
})

test('deck is created with an OrthographicView, controller, reticle cursor, and empty-click deselects', () => {
  mount(); const d = FakeDeck.instances[0]
  expect(d.props.views.constructor.name).toBe('OrthographicView')
  expect(d.props.controller).toBe(true); expect(d.props.getCursor({ isHovering: false })).toBe(RETICLE_CURSOR); expect(d.props.getCursor({ isHovering: true })).toBe('pointer')
  useStore.getState().selectPeer('peer-1'); d.props.onClick({ picked: false }); expect(useStore.getState().selectedPeer).toBeNull()
})

test('snapshot + edges lay out once and emit the pinned layer order with nodes pickable', () => {
  mount(); useStore.getState().applyEdges({ type: 'edges', edges: ring(10) }); useStore.getState().applySnapshot(snapWith(peers(10).map(p => p.peer_id))); flush()
  const ids = layerIds(); expect(ids).toEqual(['edges', 'attack-links', 'mesh-edges', 'nodes'].filter(id => ids.includes(id)))   // subset of LAYER_IDS, in LAYER_IDS order
  expect(ids).toContain('nodes'); expect(ids).toContain('edges'); expect(ids.indexOf('edges')).toBeLessThan(ids.indexOf('nodes'))
  const nodes = FakeDeck.instances[0].lastLayer('nodes'); expect(nodes.props.pickable).toBe(true); expect(nodes.props.sizeUnits).toBe('pixels'); expect(nodes.props.data).toHaveLength(10)
  expect([...visiblePositions().keys()]).toHaveLength(10); expect([...visiblePositions().values()].every(([x, y]) => Number.isFinite(x) && Number.isFinite(y))).toBe(true)
  expect(performance.getEntriesByName('layout').length).toBeGreaterThanOrEqual(1)
})

test('state-only snapshots never relayout; a changed edge set relayouts once', () => {
  mount(); useStore.getState().applyEdges({ type: 'edges', edges: ring(10) }); useStore.getState().applySnapshot(snapWith(peers(10).map(p => p.peer_id))); flush()
  const before = performance.getEntriesByName('layout').length; const pos = [...visiblePositions().values()]
  useStore.getState().applySnapshot({ ...snapWith(peers(10).map(p => p.peer_id)), nodes: peers(10).map(p => ({ ...p, state: 'decoded' as const })) }); flush()
  expect(performance.getEntriesByName('layout').length).toBe(before); expect([...visiblePositions().values()]).toEqual(pos)
  useStore.getState().applyEdges({ type: 'edges', edges: ring(10).slice(1) }); flush(); expect(performance.getEntriesByName('layout').length).toBe(before + 1)
})

test('an attacker arriving on the same edge set relayouts warm: every honest peer keeps its position', () => {
  const ids = peers(20).map(p => p.peer_id)
  mount(); useStore.getState().applyEdges({ type: 'edges', edges: ring(20) }); useStore.getState().applySnapshot(snapWith(ids)); flush()
  const before = visiblePositions()
  const snap = snapWith(ids); snap.nodes.push({ ...snap.nodes[0], peer_id: 'sybil-0', index: 20, state: 'attacker', connected_peers: ['peer-3'] })
  useStore.getState().applySnapshot(snap); flush()
  const after = visiblePositions(); expect(after.has('sybil-0')).toBe(true)
  for (const id of ids) expect(after.get(id)).toEqual(before.get(id))
})

test('showEdges off removes edges; mesh pairs are deduped and honest-only', () => {
  mount(); useStore.getState().applyEdges({ type: 'edges', edges: ring(6) })
  useStore.getState().applySnapshot({ ...snapWith([...peers(6).map(p => p.peer_id), 'sybil-0']), gossip: { mesh: { 'peer-0': ['peer-1', 'sybil-0'], 'peer-1': ['peer-0'] } } }); flush()
  expect(FakeDeck.instances[0].lastLayer('mesh-edges').props.data).toHaveLength(1)
  useStore.getState().setDisplay({ showEdges: false }); flush(); expect(layerIds()).not.toContain('edges'); expect(layerIds()).not.toContain('mesh-edges')
})

test('geo draws only real nodes; empty visible set yields no layers and fitView is a no-op', () => {
  mount(); useStore.getState().applySnapshot(snapWith(peers(5).map(p => p.peer_id))); useStore.getState().setLayoutMode('geo'); flush()   // no real nodes → store keeps force
  useStore.setState({ geoAvailable: true }); useStore.getState().setLayoutMode('geo'); flush()
  expect(layerIds()).toEqual([]); const calls = FakeDeck.instances[0].setPropsCalls.length; fitView(); expect(FakeDeck.instances[0].setPropsCalls.length).toBe(calls)
  useStore.getState().applySnapshot({ ...snapWith(['obs-1']), nodes: [{ ...peers(1)[0], peer_id: 'obs-1', is_real: true, x: 10, y: -25 }] }); flush()
  expect(FakeDeck.instances[0].lastLayer('nodes').props.data).toHaveLength(1)
  fitView(); const vs = FakeDeck.instances[0].setPropsCalls.at(-1)!.initialViewState; expect(vs.target).toEqual([0, (WORLD_BOUNDS.minY + WORLD_BOUNDS.maxY) / 2 + 44 / 2 ** vs.zoom, 0])   // lifted half the 88 px strip band; expect(vs.zoom).toBeLessThanOrEqual(4); expect(vs.transitionDuration).toBe(500)
})

test('fitView pads 80 px (plus the strip band at the bottom), caps zoom at 4 and is called on the rAF after a relayout', () => {
  const c = mount(); Object.defineProperty(c.parentElement!, 'clientWidth', { value: 800 }); Object.defineProperty(c.parentElement!, 'clientHeight', { value: 600 }); resizeRenderer(800, 600)
  useStore.getState().applyEdges({ type: 'edges', edges: ring(2) }); useStore.getState().applySnapshot(snapWith(['peer-0', 'peer-1'])); flush()
  expect(FakeDeck.instances[0].setPropsCalls.filter(p => p.initialViewState)).toHaveLength(0); flush()   // the fit waits for the rAF after the relayout
  const [[x0, y0], [x1, y1]] = [...visiblePositions().values()]   // two linked nodes sit max(40, 400/√2) ≈ 283 apart, so this fit is padding-bound
  const fit = FakeDeck.instances[0].setPropsCalls.filter(p => p.initialViewState).at(-1)!.initialViewState
  expect(fit.zoom).toBeCloseTo(Math.log2(Math.min((800 - 160) / (Math.abs(x1 - x0) || 1), (600 - 160 - 88) / (Math.abs(y1 - y0) || 1))))   // bottom pad clears the strip
  expect(fit.target[0]).toBe((x0 + x1) / 2); expect(fit.target[1]).toBeCloseTo((y0 + y1) / 2 + 44 / 2 ** fit.zoom)
  useStore.getState().applyEdges({ type: 'edges', edges: [] }); useStore.getState().applySnapshot(snapWith(['peer-0'])); flush(); flush()
  const vs = FakeDeck.instances[0].setPropsCalls.filter(p => p.initialViewState).at(-1)!.initialViewState; expect(vs.zoom).toBe(4)   // one node → zero bbox → capped
  fitView(); const [prev, last] = FakeDeck.instances[0].setPropsCalls.filter(p => p.initialViewState).slice(-2).map(p => p.initialViewState)
  // deck 9.4 Deck.setProps (dist/lib/deck.js:347-351) skips an initialViewState that _deepEqual(…, 3) matches, so a refit after a pan must not match the last fit
  expect(_deepEqual(prev, last, 3)).toBe(false); expect(_deepEqual({ ...prev, fitSeq: 0 }, { ...last, fitSeq: 0 }, 3)).toBe(true)
})

test('a 0×0 field never produces a NaN view state; the pending fit runs on the next real resize (global review focus 4)', () => {
  mount(); resizeRenderer(0, 0); useStore.getState().applyEdges({ type: 'edges', edges: ring(3) }); useStore.getState().applySnapshot(snapWith(peers(3).map(p => p.peer_id))); flush(); flush()
  for (const c of FakeDeck.instances[0].setPropsCalls.filter(p => p.initialViewState)) { expect(Number.isFinite(c.initialViewState.zoom)).toBe(true); expect(c.initialViewState.target.every(Number.isFinite)).toBe(true) }
  const before = FakeDeck.instances[0].setPropsCalls.filter(p => p.initialViewState).length
  resizeRenderer(800, 600); flush(); expect(FakeDeck.instances[0].setPropsCalls.filter(p => p.initialViewState).length).toBe(before + 1)
})

test('atlas is rebuilt when data-stage flips or the node-count bucket changes', () => {
  mount(); useStore.getState().applySnapshot(snapWith(peers(20).map(p => p.peer_id))); flush(); const n0 = buildAtlasMock.mock.calls.length
  useStore.getState().applySnapshot(snapWith(peers(20).map(p => p.peer_id))); flush(); expect(buildAtlasMock.mock.calls.length).toBe(n0)
  useStore.getState().setPref('stageTheme', true); document.documentElement.dataset.stage = '1'; flush(); expect(buildAtlasMock.mock.calls.length).toBe(n0 + 1)
  useStore.getState().applySnapshot(snapWith(peers(200).map(p => p.peer_id))); flush(); expect(buildAtlasMock.mock.calls.length).toBe(n0 + 1)   // radius clamps at 8 px for every n ≤ 625
  useStore.getState().applySnapshot(snapWith(peers(700).map(p => p.peer_id))); flush(); expect(buildAtlasMock.mock.calls.length).toBe(n0 + 2)   // 200/√700 < 8: the bucket changed
})

const grafted: PeerNode = { ...peers(1)[0], peer_id: 'sybil-0', index: 50, state: 'attacker', connected_peers: ['peer-1', 'peer-2'], gossip_score: -0.3 }
const pruned: PeerNode = { ...grafted, peer_id: 'sybil-1', connected_peers: [], last_targets: ['peer-3'] }

test('glyphs per state; halos only on participating honest peers, band from gossip_score', () => {
  mount(); const nodes = [...peers(6).map((p, i) => ({ ...p, state: (['idle', 'origin', 'receiving', 'decoded', 'joining', 'failed'] as const)[i], gossip_score: [0, 1, 3, 7, 0, 0][i] })), grafted, pruned]
  useStore.getState().applyEdges({ type: 'edges', edges: ring(6) }); useStore.getState().applySnapshot({ ...snapWith(nodes.map(n => n.peer_id)), nodes }); flush()
  const nl = FakeDeck.instances[0].lastLayer('nodes'); expect(nl.props.data.map((d: PeerNode) => nl.props.getIcon(d))).toEqual(['idle', 'origin', 'disc', 'decoded', 'joining', 'failed', 'attacker', 'pruned'])
  const halos = FakeDeck.instances[0].lastLayer('halos'); expect(halos.props.data.map((d: PeerNode) => d.peer_id)).toEqual(['peer-1', 'peer-2', 'peer-3'])   // origin, receiving, decoded; never idle/joining/failed/attacker
  expect(halos.props.data.map((d: PeerNode) => halos.props.getIcon(d))).toEqual(['halo-1', 'halo-2', 'halo-3']); expect(halos.props.pickable).toBe(false)
  // drawn 1:1 from the atlas, so nearest sampling keeps the 2 px cells square at a fractional screen position (linear smeared them ~65 % into the next row)
  expect(halos.props.textureParameters).toMatchObject({ minFilter: 'nearest', magFilter: 'nearest', mipmapFilter: 'nearest' })
  expect(layerIds().indexOf('halos')).toBeLessThan(layerIds().indexOf('nodes'))
})
test('negative score → flame halo-0; attack links dashed 4/3 from grafted attackers to each victim; pruned has none', () => {
  mount(); const nodes = [...peers(4).map(p => ({ ...p, state: 'receiving' as const, gossip_score: -0.25 })), grafted, pruned]
  useStore.getState().applyEdges({ type: 'edges', edges: ring(4) }); useStore.getState().applySnapshot({ ...snapWith(nodes.map(n => n.peer_id)), nodes }); flush()
  const halos = FakeDeck.instances[0].lastLayer('halos'); expect(halos.props.data.every((d: PeerNode) => halos.props.getIcon(d) === 'halo-0')).toBe(true)
  const al = FakeDeck.instances[0].lastLayer('attack-links'); expect(al.props.data).toHaveLength(2); expect(al.props.getDashArray).toEqual([4, 3]); expect(al.props.widthUnits).toBe('pixels')
  expect(layerIds().indexOf('attack-links')).toBeGreaterThan(layerIds().indexOf('edges')); expect(layerIds().indexOf('attack-links')).toBeLessThan(layerIds().indexOf('mesh-edges') === -1 ? 99 : layerIds().indexOf('mesh-edges'))
})
test('attack-links and labels exist empty before any attacker at 200 nodes, so their shaders link at mount and not on the Sybil arrival frame', () => {
  // a fresh Chrome profile spent ~620 ms + ~210 ms in getProgramParameter (link status) on the first arrival frame when these layers were created then
  mount(); fontsReadyForTest(true); useStore.getState().applyEdges({ type: 'edges', edges: ring(200) }); useStore.getState().applySnapshot(snapWith(peers(200).map(p => p.peer_id))); flush()
  expect(FakeDeck.instances[0].lastLayer('attack-links').props.data).toEqual([])
  expect(FakeDeck.instances[0].lastLayer('labels').props.data).toEqual([])
})
test('edges, mesh-edges and nodes keep their data identity across animating frames when the topology is unchanged, so deck does not re-tessellate and re-upload them per frame', () => {
  // at 200 nodes the per-frame rebuild of ~1 600 dashed paths held a 1440×900 DPR 1.5 burst at 37 fps; with the identity kept it runs at 60
  const ids = peers(10).map(p => p.peer_id)
  mount(); useStore.getState().applyEdges({ type: 'edges', edges: ring(10) }); useStore.getState().applySnapshot(snapWith(ids, { gossip: { mesh: { 'peer-0': ['peer-1', 'peer-2'], 'peer-1': ['peer-0'] } } })); flush()
  spawnParticle('peer-0', 'peer-1'); flush()
  const first = (id: string) => FakeDeck.instances[0].lastLayer(id).props.data
  const e1 = first('edges'), m1 = first('mesh-edges'), n1 = first('nodes'); expect(e1).toHaveLength(10); expect(m1).toHaveLength(2)
  vi.advanceTimersByTime(100); flush()   // another animating frame: the particle is still alive
  expect(FakeDeck.instances[0].setPropsCalls.filter(p => p.layers).length).toBeGreaterThanOrEqual(3)
  expect(first('edges')).toBe(e1); expect(first('mesh-edges')).toBe(m1); expect(first('nodes')).toBe(n1)
  // a new edge set from the store is a new array
  useStore.getState().applyEdges({ type: 'edges', edges: ring(10).slice(0, 8) }); flush(); expect(first('edges')).not.toBe(e1); expect(first('edges')).toHaveLength(8)
  expect(first('nodes')).not.toBe(n1)   // same nodes, new positions: deck only re-reads getPosition on a new data array
})
test('selection draws the reticle at 2 r and ×1.5 size; hover draws 2 px edges and r+4 rings; event highlight lines + rings', () => {
  mount(); useStore.getState().applyEdges({ type: 'edges', edges: ring(5) }); useStore.getState().applySnapshot(snapWith(peers(5).map(p => p.peer_id))); flush()
  useStore.getState().selectPeer('peer-0', ['peer-2', 'peer-3']); useStore.getState().hoverPeer('peer-1'); flush()
  const nl = FakeDeck.instances[0].lastLayer('nodes'); const d0 = nl.props.data.find((d: PeerNode) => d.peer_id === 'peer-0'); const d4 = nl.props.data.find((d: PeerNode) => d.peer_id === 'peer-4')
  expect(nl.props.getSize(d0) / nl.props.getSize(d4)).toBeCloseTo(1.5)
  const ret = FakeDeck.instances[0].lastLayer('reticle'); expect(ret.props.data).toHaveLength(1); expect(ret.props.getIcon(ret.props.data[0])).toBe('reticle')
  expect(FakeDeck.instances[0].lastLayer('hover-edges').props.data).toHaveLength(2); expect(FakeDeck.instances[0].lastLayer('hover-edges').props.getWidth).toBe(2)
  expect(FakeDeck.instances[0].lastLayer('hover-peer-rings').props.data).toHaveLength(2); expect(FakeDeck.instances[0].lastLayer('hover-peer-rings').props.getRadius).toBe(nodeRadiusPx(5, 'force', 1) + 4)
  expect(FakeDeck.instances[0].lastLayer('event-highlight-edges').props.data).toHaveLength(2); expect(FakeDeck.instances[0].lastLayer('event-highlight-rings').props.data).toHaveLength(2)
  useStore.getState().selectPeer(null); flush(); expect(layerIds()).not.toContain('reticle'); expect(layerIds()).not.toContain('event-highlight-edges')
})
test('observer rings breathe .2→.75 and are static at .5 under reduced motion', () => {
  mount(); const obs = { ...peers(1)[0], peer_id: 'obs-1', is_real: true, x: 1, y: 1 }; useStore.setState({ geoAvailable: true }); useStore.getState().setLayoutMode('geo')
  useStore.getState().applySnapshot({ ...snapWith(['obs-1']), nodes: [obs] }); flush()
  const r1 = FakeDeck.instances[0].lastLayer('observer-rings'); expect(r1.props.data).toHaveLength(1); const a1 = r1.props.getLineColor[3]
  vi.advanceTimersByTime(1400); flush(); expect(FakeDeck.instances[0].lastLayer('observer-rings').props.getLineColor[3]).not.toBe(a1)
  reducedMotionMock.mockReturnValue(true); destroyRenderer(); mount(); useStore.getState().applySnapshot({ ...snapWith(['obs-1']), nodes: [obs] }); flush()
  expect(FakeDeck.instances[1].lastLayer('observer-rings').props.getLineColor[3]).toBe(Math.round(0.5 * 255))
})
test('labels: attackers always (raw id, flame / paper-2 when pruned per R6), selected + hovered as nN, all labels when ≤ 50 visible, none when showLabels off or fonts not ready', () => {
  mount(); const nodes = [...peers(3), grafted, pruned]; useStore.getState().applyEdges({ type: 'edges', edges: ring(3) }); useStore.getState().applySnapshot({ ...snapWith(nodes.map(n => n.peer_id)), nodes }); flush()
  expect(layerIds()).not.toContain('labels')   // fonts not ready yet
  fontsReadyForTest(true); flush()
  let L = FakeDeck.instances[0].lastLayer('labels'); expect(L.props.data.map((d: PeerNode) => L.props.getText(d))).toEqual(['sybil-0', 'sybil-1']); expect(L.props.fontFamily).toBe(monoFamily()); expect(L.props.fontWeight).toBe(500); expect(L.props.getSize).toBe(10)
  expect(L.props.getColor(grafted)).toEqual(PAL.flame); expect(L.props.getColor(pruned)).toEqual(PAL.paper2); expect(PAL.paper2).not.toEqual(PAL.flame)
  useStore.getState().selectPeer('peer-0'); useStore.getState().hoverPeer('peer-2'); flush(); L = FakeDeck.instances[0].lastLayer('labels'); expect(L.props.data.map((d: PeerNode) => L.props.getText(d)).sort()).toEqual(['n0', 'n2', 'sybil-0', 'sybil-1'])
  useStore.getState().setDisplay({ allLabels: true }); flush(); expect(FakeDeck.instances[0].lastLayer('labels').props.data).toHaveLength(5)
  useStore.getState().applySnapshot(snapWith(peers(60).map(p => p.peer_id))); flush(); expect(FakeDeck.instances[0].lastLayer('labels')?.props.data.length ?? 0).toBeLessThanOrEqual(2)   // > 50 visible: all-labels ignored
  useStore.getState().setPref('stageTheme', true); flush(); expect(FakeDeck.instances[0].lastLayer('labels')?.props.getSize ?? 12).toBe(12)
  useStore.getState().setDisplay({ showLabels: false }); flush(); expect(layerIds()).not.toContain('labels')
})
test('labels start past what surrounds the glyph: the reticle (2 r + 4 px ticks) when selected, the halo (1.7 r) when it has one, else the glyph', () => {
  mount(); fontsReadyForTest(true); const nodes = peers(5).map((p, i) => ({ ...p, state: (i === 1 ? 'receiving' : 'idle') as PeerNode['state'] }))
  useStore.getState().applyEdges({ type: 'edges', edges: ring(5) }); useStore.getState().applySnapshot({ ...snapWith(nodes.map(n => n.peer_id)), nodes })
  useStore.getState().selectPeer('peer-0'); useStore.getState().setDisplay({ allLabels: true }); flush()
  const L = FakeDeck.instances[0].lastLayer('labels'); const r = nodeRadiusPx(5, 'force', 1); const by = (id: string) => L.props.data.find((d: PeerNode) => d.peer_id === id)
  expect(L.props.getPixelOffset(by('peer-0'))).toEqual([2 * r + 4 + 3, 0]); expect(L.props.getPixelOffset(by('peer-1'))).toEqual([HALO_OUTER * r + 3, 0]); expect(L.props.getPixelOffset(by('peer-2'))).toEqual([r + 3, 0])
})

test('spawnParticle: cap 600, unknown/hidden peers no-op, disabled no-op; particles layer uses the square glyph and spam gets the trail', () => {
  mount(); useStore.getState().applyEdges({ type: 'edges', edges: ring(10) }); useStore.getState().applySnapshot(snapWith(peers(10).map(p => p.peer_id))); flush()
  spawnParticle('peer-0', 'nope'); flush(); expect(layerIds()).not.toContain('particles')
  for (let i = 0; i < 700; i++) spawnParticle('peer-0', 'peer-1'); spawnParticle('sybil-x', 'peer-1'); flush()
  const P = FakeDeck.instances[0].lastLayer('particles'); expect(P.props.data.length).toBeLessThanOrEqual(600); expect(P.props.getIcon(P.props.data[0])).toBe('square'); expect(P.props.sizeUnits).toBe('pixels'); expect(P.props.pickable).toBe(false)
  vi.advanceTimersByTime(1300); flush()   // the capped 600 expire, so the spam particle below is not refused by the cap
  useStore.getState().applySnapshot({ ...snapWith([...peers(10).map(p => p.peer_id), 'sybil-0']), nodes: [...peers(10), grafted] }); flush(); spawnParticle('sybil-0', 'peer-1', 'spam'); flush()
  const P2 = FakeDeck.instances[0].lastLayer('particles'); const spam = P2.props.data.at(-1); expect(P2.props.getIcon(spam)).toBe('squareTrail'); expect(P2.props.getColor(spam).slice(0, 3)).toEqual(PAL.particleSpam.slice(0, 3))
  useStore.getState().setDisplay({ particlesEnabled: false }); spawnParticle('peer-0', 'peer-1'); // no throw, no push
  vi.advanceTimersByTime(1300); flush(); expect(layerIds()).not.toContain('particles')   // all expired
})
test('particle size is the base 2 px cell × 2 × scale.particle: 4 px, 7.2 px on stage (×1.8, not compounded with the stage cell)', () => {
  mount(); useStore.getState().applyEdges({ type: 'edges', edges: ring(4) }); useStore.getState().applySnapshot(snapWith(peers(4).map(p => p.peer_id))); flush()
  spawnParticle('peer-0', 'peer-1'); flush(); expect(FakeDeck.instances[0].lastLayer('particles').props.getSize).toBe(4)
  useStore.getState().setPref('stageTheme', true); spawnParticle('peer-0', 'peer-1'); flush(); expect(FakeDeck.instances[0].lastLayer('particles').props.getSize).toBeCloseTo(7.2)
})
test('a particle whose endpoint leaves the visible set is dropped, not drawn at [0,0]', () => {
  mount(); useStore.getState().applyEdges({ type: 'edges', edges: ring(10) }); useStore.getState().applySnapshot(snapWith(peers(10).map(p => p.peer_id))); flush()
  spawnParticle('peer-0', 'peer-9'); useStore.getState().applySnapshot(snapWith(peers(5).map(p => p.peer_id))); flush()
  const P = FakeDeck.instances[0].lastLayer('particles'); expect(P?.props.data.length ?? 0).toBe(0)
})
test('event subscription spawns from the batch; pulses on state change to non-idle incl. graft↔prune flip; both off under reduced motion', () => {
  mount(); useStore.getState().applyEdges({ type: 'edges', edges: ring(4) }); useStore.getState().applySnapshot(snapWith(peers(4).map(p => p.peer_id))); flush()
  dispatchFrame({ at: 1, event_type: 'GossipMessage', category: 'gossip', from_peer: 'peer-0', to_peer: 'peer-1', msg_id: 'm' }); flushEvents(); flush(); expect(FakeDeck.instances[0].lastLayer('particles').props.data).toHaveLength(1)
  useStore.getState().applySnapshot({ ...snapWith(peers(4).map(p => p.peer_id)), nodes: peers(4).map((p, i) => ({ ...p, state: i === 0 ? 'decoded' : 'idle' })) }); flush()
  const pulses = FakeDeck.instances[0].lastLayer('pulses'); expect(pulses.props.data).toHaveLength(1); expect(pulses.props.getRadius).toBeCloseTo(nodeRadiusPx(4, 'force', 1) * 2.5); expect(pulses.props.data[0].color[3]).toBeLessThanOrEqual(56)
  useStore.getState().applySnapshot({ ...snapWith([...peers(4).map(p => p.peer_id), 'sybil-0']), nodes: [...peers(4), grafted] }); flush(); useStore.getState().applySnapshot({ ...snapWith([...peers(4).map(p => p.peer_id), 'sybil-0']), nodes: [...peers(4), { ...grafted, connected_peers: [] }] }); flush()
  expect(FakeDeck.instances[0].lastLayer('pulses').props.data.some((d: any) => d.id === 'sybil-0')).toBe(true)   // eslint-disable-line @typescript-eslint/no-explicit-any
  vi.advanceTimersByTime(900); flush(); expect(layerIds()).not.toContain('pulses')
  reducedMotionMock.mockReturnValue(true); destroyRenderer(); mount(); useStore.getState().applySnapshot(snapWith(peers(4).map(p => p.peer_id))); flush()
  useStore.getState().applySnapshot({ ...snapWith(peers(4).map(p => p.peer_id)), nodes: peers(4).map(p => ({ ...p, state: 'decoded' as const })) }); flush(); expect(layerIds()).not.toContain('pulses')
})

test('geo loads land once, crops Antarctica and draws it under everything with the checker fill', async () => {
  mount(); useStore.setState({ geoAvailable: true }); useStore.getState().setLayoutMode('geo'); useStore.getState().applySnapshot({ ...snapWith(['obs-1']), nodes: [{ ...peers(1)[0], peer_id: 'obs-1', is_real: true, x: 10, y: -25 }] }); flush(); await Promise.resolve(); flush()
  expect(getStatic).toHaveBeenCalledTimes(1); expect(getStatic).toHaveBeenCalledWith('/geo/land-110m.json')
  expect(layerIds()[0]).toBe('world-land'); const land = FakeDeck.instances[0].lastLayer('world-land')
  expect(land.props.data).toHaveLength(1); expect(land.props.getPolygon(land.props.data[0])[1]).toEqual([10 * GEO_SCALE, 0]); expect(land.props.extensions.some((e: any) => e.constructor.extensionName === 'FillStyleExtension')).toBe(true); expect(land.props.fillPatternMask).toBe(true); expect(land.props.pickable).toBe(false); expect(land.props.textureParameters).toMatchObject({ minFilter: 'nearest', magFilter: 'nearest', mipmapFilter: 'nearest' })   // eslint-disable-line @typescript-eslint/no-explicit-any
  useStore.getState().setLayoutMode('force'); flush(); expect(layerIds()).not.toContain('world-land'); useStore.getState().setLayoutMode('geo'); flush(); expect(getStatic).toHaveBeenCalledTimes(1)
})

test('land checker stays one texel per CSS px at a fractional zoom (deck rounds pixel units to the nearest zoom level)', async () => {
  mount(); useStore.setState({ geoAvailable: true }); useStore.getState().setLayoutMode('geo'); useStore.getState().applySnapshot({ ...snapWith(['obs-1']), nodes: [{ ...peers(1)[0], peer_id: 'obs-1', is_real: true, x: 10, y: -25 }] }); flush(); await Promise.resolve(); flush()
  const texelPx = (z: number) => FakeDeck.instances[0].lastLayer('world-land').props.getFillPatternScale * 2 ** -Math.round(z) * 2 ** z
  FakeDeck.instances[0].props.onViewStateChange({ viewState: { target: [0, 0, 0], zoom: -0.28 } }); flush(); expect(texelPx(-0.28)).toBeCloseTo(1)
  FakeDeck.instances[0].props.onViewStateChange({ viewState: { target: [0, 0, 0], zoom: 1.7 } }); flush(); expect(texelPx(1.7)).toBeCloseTo(1)
  fitView({ durationMs: 0 }); flush(); const z = FakeDeck.instances[0].setPropsCalls.filter(p => p.initialViewState).at(-1)!.initialViewState.zoom; expect(texelPx(z)).toBeCloseTo(1)
})

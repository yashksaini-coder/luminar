import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import type { GlyphId } from '@/components/map/atlas'

const { FakeDeck, buildAtlasMock } = vi.hoisted(() => {
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
  return { FakeDeck, buildAtlasMock }
})

vi.mock('@deck.gl/core', async (importOriginal) => ({ ...await importOriginal<object>(), Deck: FakeDeck }))
vi.mock('@/components/map/atlas', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/components/map/atlas')>()
  const ids: GlyphId[] = ['disc', 'idle', 'origin', 'decoded', 'observer', 'joining', 'failed', 'error', 'attacker', 'pruned', 'reticle', 'square', 'squareTrail', 'halo-0', 'halo-1', 'halo-2', 'halo-3']
  buildAtlasMock.mockImplementation(() => ({
    image: document.createElement('canvas'),
    mapping: Object.fromEntries(ids.map(id => [id, { x: 0, y: 0, width: 8, height: 8, mask: false }])),
    nodePx: 8, cellPx: 2,
  }))
  return { ...real, buildAtlas: buildAtlasMock }
})

import { RETICLE_CURSOR } from '@/components/dither/Reticle'
import { resetLayoutMemory, WORLD_BOUNDS } from '@/components/map/layout'
import { destroyRenderer, fitView, initRenderer, layerIds, resizeRenderer, visiblePositions } from '@/components/map/renderer'
import { peers, ring, snapWith } from '@/lib/fixtures'
import { useStore } from '@/lib/store'

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame'] })   // real performance.mark/measure
  FakeDeck.instances = []
  useStore.setState(useStore.getInitialState(), true)
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
  const ids = layerIds(); expect(ids).toEqual(['edges', 'mesh-edges', 'nodes'].filter(id => ids.includes(id)))   // subset of LAYER_IDS, in LAYER_IDS order
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
  fitView(); const vs = FakeDeck.instances[0].setPropsCalls.at(-1)!.initialViewState; expect(vs.target).toEqual([0, (WORLD_BOUNDS.minY + WORLD_BOUNDS.maxY) / 2, 0]); expect(vs.zoom).toBeLessThanOrEqual(4); expect(vs.transitionDuration).toBe(500)
})

test('fitView pads 80 px, caps zoom at 4 and is called on the rAF after a relayout', () => {
  const c = mount(); Object.defineProperty(c.parentElement!, 'clientWidth', { value: 800 }); Object.defineProperty(c.parentElement!, 'clientHeight', { value: 600 }); resizeRenderer(800, 600)
  useStore.getState().applyEdges({ type: 'edges', edges: ring(2) }); useStore.getState().applySnapshot(snapWith(['peer-0', 'peer-1'])); flush()
  expect(FakeDeck.instances[0].setPropsCalls.filter(p => p.initialViewState)).toHaveLength(0); flush()   // the fit waits for the rAF after the relayout
  const [[x0, y0], [x1, y1]] = [...visiblePositions().values()]   // two linked nodes sit max(40, 400/√2) ≈ 283 apart, so this fit is padding-bound
  const fit = FakeDeck.instances[0].setPropsCalls.filter(p => p.initialViewState).at(-1)!.initialViewState
  expect(fit.zoom).toBeCloseTo(Math.log2(Math.min((800 - 160) / (Math.abs(x1 - x0) || 1), (600 - 160) / (Math.abs(y1 - y0) || 1))))
  expect(fit.target).toEqual([(x0 + x1) / 2, (y0 + y1) / 2, 0])
  useStore.getState().applyEdges({ type: 'edges', edges: [] }); useStore.getState().applySnapshot(snapWith(['peer-0'])); flush(); flush()
  const vs = FakeDeck.instances[0].setPropsCalls.filter(p => p.initialViewState).at(-1)!.initialViewState; expect(vs.zoom).toBe(4)   // one node → zero bbox → capped
  fitView(); const [prev, last] = FakeDeck.instances[0].setPropsCalls.filter(p => p.initialViewState).slice(-2).map(p => p.initialViewState)
  expect(last).not.toEqual(prev)   // deck drops a deep-equal initialViewState, so a refit after a pan must differ from the last fit
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

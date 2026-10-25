import { test, expect, beforeEach, vi } from 'vitest'
import * as client from '@/lib/api/client'
import { loadReel, seekReelToSimTime, toggleReel, unloadReel } from '@/lib/api/replay'
import { ws } from '@/lib/api/websocket'
import { REEL_MANIFEST } from '@/lib/reels'
import { resetTopology, fitView } from '@/components/map/renderer'
import { selectPill, useStore } from '@/lib/store'
import { peerNode, snapWith } from '@/lib/fixtures'
import { dispatchFrame } from '@/lib/api/dispatch'
import {
  applyUrlMoment, autoPauseIfDue, bootSim, enterReel, initAutoGeo, initUrlMoment, shareMoment, teardownSim, injectFault, launchScenario, maybeAutoGeo, runKey, setNodePreset, syncUrlMoment, toggleMainnet, togglePlay,
} from '@/lib/actions'

// Every request function becomes a bare vi.fn(); toastFor stays real so the toast text is the real one.
vi.mock('@/lib/api/client', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/api/client')>()
  return Object.fromEntries(Object.entries(real).map(([k, v]) => [k, typeof v === 'function' && k !== 'toastFor' ? vi.fn() : v]))
})
vi.mock('@/lib/api/websocket')
vi.mock('@/lib/api/replay')
let positions = new Map<string, [number, number]>()
vi.mock('@/components/map/renderer', () => ({ visiblePositions: () => positions, resetTopology: vi.fn(), fitView: vi.fn() }))

const api = vi.mocked(client)
const meta = REEL_MANIFEST[0]

beforeEach(() => {
  vi.clearAllMocks()
  vi.unstubAllGlobals()
  useStore.setState(useStore.getInitialState(), true)
  localStorage.clear()
  positions = new Map()
})

test('injectFault toasts from {ok}; reel guard refuses', async () => {
  api.faultSybil.mockResolvedValue({ ok: false, status: 403, data: null }); await injectFault('sybil', { n: 5 })
  expect(useStore.getState().toasts.at(-1)?.text).toBe('Sybil ×5 failed · 403')
  useStore.setState({ reel: { name: 'r', title: 'R', durationMs: 1, durationSim: 1 } }); await injectFault('clear-all')
  expect(useStore.getState().toasts.at(-1)?.text).toBe('Press 0 to leave the reel first'); expect(api.faultClearAll).not.toHaveBeenCalled()
})
test('in a reel, launchScenario, setNodePreset and toggleMainnet toast the guard and call no API', async () => {
  useStore.setState({ reel: { name: 'r', title: 'R', durationMs: 1, durationSim: 1 } })
  for (const act of [() => launchScenario('demo'), () => setNodePreset(100), () => toggleMainnet()]) {
    await act(); expect(useStore.getState().toasts.at(-1)?.text).toBe('Press 0 to leave the reel first')
  }
  expect(api.scenarioLaunch).not.toHaveBeenCalled(); expect(api.simReconfigure).not.toHaveBeenCalled(); expect(api.liveMainnet).not.toHaveBeenCalled()
})
test('partition splits visible sim peers by median x', async () => {
  positions = new Map([['peer-0', [-10, 0]], ['peer-1', [-5, 0]], ['peer-2', [5, 0]], ['peer-3', [10, 0]]]); useStore.getState().applySnapshot(snapWith(['peer-0', 'peer-1', 'peer-2', 'peer-3']))
  api.faultPartition.mockResolvedValue({ ok: true, status: 200, data: null }); await injectFault('partition')
  expect(api.faultPartition).toHaveBeenCalledWith(['peer-0', 'peer-1'], ['peer-2', 'peer-3'])
})
test('eclipse and drop need a selected sim peer', async () => {
  await injectFault('eclipse'); expect(api.faultEclipse).not.toHaveBeenCalled()
  useStore.getState().applySnapshot({ ...snapWith([]), nodes: [peerNode('obs-1', 0, { is_real: true })] }); useStore.getState().selectPeer('obs-1'); await injectFault('drop'); expect(api.faultDrop).not.toHaveBeenCalled()
  useStore.getState().applySnapshot(snapWith(['peer-7'])); useStore.getState().selectPeer('peer-7'); api.faultEclipse.mockResolvedValue({ ok: true, status: 200, data: null }); await injectFault('eclipse')
  expect(api.faultEclipse).toHaveBeenCalledWith('peer-7', 4); expect(useStore.getState().toasts.at(-1)?.text).toBe('Eclipse on n7 injected')
})
test('togglePlay at the limit extends maxDuration by durationStep before POST play; reel mode toggles the player', async () => {
  useStore.setState({ simTime: 300, maxDuration: 300, durationStep: 120, playing: false }); api.simPlay.mockResolvedValue({ ok: true, status: 200, data: null })
  await togglePlay(); expect(useStore.getState().maxDuration).toBe(420); expect(api.simPlay).toHaveBeenCalled()
  useStore.setState({ reel: { name: 'r', title: 'R', durationMs: 1, durationSim: 1 } }); await togglePlay(); expect(toggleReel).toHaveBeenCalled(); expect(api.simPlay).toHaveBeenCalledTimes(1)
})
test('autoPauseIfDue pauses live at the limit, never in reels', () => {
  api.simPause.mockResolvedValue({ ok: true, status: 200, data: null })
  useStore.setState({ playing: true, simTime: 60.1, maxDuration: 60 }); autoPauseIfDue(); expect(api.simPause).toHaveBeenCalledTimes(1); expect(useStore.getState().playing).toBe(false)
  useStore.setState({ playing: true, simTime: 60.1, maxDuration: 60, reel: { name: 'r', title: 'R', durationMs: 1, durationSim: 1 } }); autoPauseIfDue(); expect(api.simPause).toHaveBeenCalledTimes(1)
})
test('leaveGeoForSim restores the remembered layout and toasts; setNodePreset and launchScenario go through reelGuard → leaveGeoForSim → fetchTopology', async () => {
  useStore.setState({ geoAvailable: true, layoutMode: 'geo', layoutBeforeGeo: 'radial' }); api.simReconfigure.mockResolvedValue({ ok: true, status: 200, data: { n_nodes: 50, edge_count: 1 } })
  api.simSnapshot.mockResolvedValue({ ok: true, status: 200, data: snapWith(['peer-0']) }); api.topologyEdges.mockResolvedValue({ ok: true, status: 200, data: { edges: [] } })
  await setNodePreset(50); expect(useStore.getState().layoutMode).toBe('radial'); expect(useStore.getState().toasts.at(-1)?.text).toBe('Geo shows real observers only — switched to radial')
  expect(resetTopology).toHaveBeenCalled(); expect(api.simSnapshot).toHaveBeenCalled(); expect(api.topologyEdges).toHaveBeenCalled()
  api.scenarioLaunch.mockResolvedValue({ ok: false, status: 0, data: null }); await launchScenario('demo'); expect(useStore.getState().toasts.at(-1)?.text).toBe('backend offline')
})
test('toggleMainnet posts the inverse and stores the status; fail → backend offline', async () => {
  api.liveMainnet.mockResolvedValue({ ok: true, status: 200, data: { enabled: true, observers: 3 } as never }); await toggleMainnet(); expect(api.liveMainnet).toHaveBeenCalledWith(true); expect(useStore.getState().mainnet?.enabled).toBe(true)
  api.liveMainnet.mockResolvedValue({ ok: false, status: 0, data: null }); await toggleMainnet(); expect(api.liveMainnet).toHaveBeenLastCalledWith(false); expect(useStore.getState().toasts.at(-1)?.text).toBe('backend offline')
})
test('toggleMainnet on → off → on re-arms auto-Geo from the POST response alone', async () => {
  useStore.setState({ geoAvailable: true, layoutMode: 'radial' })
  api.liveMainnet.mockResolvedValue({ ok: true, status: 200, data: { enabled: true, observers: 3 } as never }); await toggleMainnet(); expect(useStore.getState().layoutMode).toBe('geo')
  api.liveMainnet.mockResolvedValue({ ok: true, status: 200, data: { enabled: false, observers: 0 } as never }); await toggleMainnet(); expect(useStore.getState().geoAutoDone).toBe(false)
  useStore.getState().setLayoutMode('radial')
  api.liveMainnet.mockResolvedValue({ ok: true, status: 200, data: { enabled: true, observers: 3 } as never }); await toggleMainnet(); expect(useStore.getState().layoutMode).toBe('geo')
})
test('toggleMainnet: a non-zero failure status names the status, not offline (R19)', async () => {
  api.liveMainnet.mockResolvedValue({ ok: false, status: 403, data: null }); await toggleMainnet()
  expect(useStore.getState().toasts.at(-1)?.text).toBe('MAINNET failed · 403')
  api.liveMainnet.mockResolvedValue({ ok: true, status: 200, data: null }); await toggleMainnet()   // a 2xx with a non-JSON body (SPA fallback) is not "injected"
  expect(useStore.getState().toasts.at(-1)).toMatchObject({ text: 'MAINNET failed · 200', kind: 'fail' }); expect(useStore.getState().mainnet).toBeNull()
})
test('runKey dispatch table', () => {
  useStore.getState().applySnapshot(snapWith(['peer-0'])); useStore.getState().selectPeer('peer-0'); useStore.getState().setKeyHelp(true)
  runKey('escape'); expect(useStore.getState().selectedPeer).toBeNull(); expect(useStore.getState().keyHelpOpen).toBe(false)
  runKey('toggleKeyHelp'); expect(useStore.getState().keyHelpOpen).toBe(true)
  runKey('fitView'); expect(fitView).toHaveBeenCalled()
  runKey('toggleStage'); expect(useStore.getState().stageTheme).toBe(true); runKey('toggleHero'); expect(useStore.getState().hero).toBe(true)
})
test('syncUrlMoment writes ?peer always and ?t only while a reel is paused', () => {
  history.replaceState(null, '', '/reels/r/'); useStore.getState().applySnapshot(snapWith(['peer-3'])); useStore.getState().selectPeer('peer-3'); syncUrlMoment(); expect(location.search).toBe('?peer=peer-3')
  useStore.setState({ reel: { name: 'r', title: 'R', durationMs: 1, durationSim: 1 }, playing: false, simTime: 12.4 }); syncUrlMoment(); expect(location.search).toBe('?peer=peer-3&t=12.4')
  useStore.setState({ playing: true }); syncUrlMoment(); expect(location.search).toBe('?peer=peer-3')
})
test('auto-Geo happens once per feed-on', () => {
  useStore.setState({ geoAvailable: true }); useStore.getState().applyTelemetryStatus({ type: 'telemetry_status', active: false, peer_count: 0, peers: [], mainnet: { enabled: true, observers: 3 } }); maybeAutoGeo()
  expect(useStore.getState().layoutMode).toBe('geo'); expect(useStore.getState().geoAutoDone).toBe(true)
  useStore.getState().setLayoutMode('force'); maybeAutoGeo(); expect(useStore.getState().layoutMode).toBe('force')
  useStore.getState().applyTelemetryStatus({ type: 'telemetry_status', active: false, peer_count: 0, peers: [], mainnet: { enabled: false, observers: 0 } }); expect(useStore.getState().geoAutoDone).toBe(false)
})
test('initAutoGeo picks Geo when the feed is on and real observers arrive, until unsubscribed', () => {
  const stop = initAutoGeo()
  useStore.setState({ mainnet: { enabled: true, observers: 3 } }); expect(useStore.getState().layoutMode).toBe('force')   // no observers yet
  useStore.setState({ geoAvailable: true }); expect(useStore.getState().layoutMode).toBe('geo'); expect(useStore.getState().layoutBeforeGeo).toBe('force')
  stop(); useStore.setState({ geoAvailable: false, mainnet: null, layoutMode: 'force', geoAutoDone: false })
  useStore.setState({ geoAvailable: true, mainnet: { enabled: true, observers: 3 } }); expect(useStore.getState().layoutMode).toBe('force')
})
test('enterReel sets a provisional reel before the file loads, so the pill reads REEL and the guards hold', async () => {
  let during: ReturnType<typeof selectPill> | null = null; let seenSignal: AbortSignal | undefined
  vi.mocked(loadReel).mockImplementation(async (_m, opts) => { seenSignal = opts?.signal; during = selectPill(useStore.getState()); return true })
  await enterReel(meta)
  expect(during).toBe('reel'); expect(seenSignal).toBeInstanceOf(AbortSignal); expect(ws.disconnect).toHaveBeenCalled()
  expect(useStore.getState().reel).toMatchObject({ name: 'sybil-eclipse', title: 'Sybil → Eclipse' })
})
test('teardownSim aborts a pending load and the aborted load does not exitReel', async () => {
  vi.mocked(loadReel).mockImplementation(async (_m, opts) => new Promise(res => opts!.signal!.addEventListener('abort', () => res(false))))
  const p = bootSim({ reel: meta, search: '' }); teardownSim(); await p
  expect(unloadReel).toHaveBeenCalled(); expect(ws.connect).not.toHaveBeenCalled(); expect(location.pathname).not.toBe('/sim/')
})
test('bootSim in reel mode never opens the socket or calls the API, and applies the moment after load', async () => {
  vi.mocked(loadReel).mockImplementation(async () => { useStore.getState().applySnapshot(snapWith(['peer-0', 'sybil-0'])); return true })
  await bootSim({ reel: meta, search: '?t=12.4&peer=sybil-0' })
  expect(ws.connect).not.toHaveBeenCalled(); expect(api.scenariosList).not.toHaveBeenCalled(); expect(api.simSnapshot).not.toHaveBeenCalled()
  expect(seekReelToSimTime).toHaveBeenCalledWith(12.4); expect(useStore.getState().selectedPeer).toBe('sybil-0')
})
test('bootSim live connects, fetches topology and scenarios, applies ?peer', async () => {
  api.simSnapshot.mockResolvedValue({ ok: true, status: 200, data: snapWith(['peer-0']) }); api.topologyEdges.mockResolvedValue({ ok: true, status: 200, data: { edges: [] } }); api.scenariosList.mockResolvedValue({ ok: true, status: 200, data: { scenarios: [] } })
  await bootSim({ reel: null, search: '?peer=peer-0' })
  expect(ws.connect).toHaveBeenCalledTimes(1); expect(api.scenariosList).toHaveBeenCalled(); expect(useStore.getState().selectedPeer).toBe('peer-0'); expect(loadReel).not.toHaveBeenCalled()
})
test('bootSim live with the backend down: no throw, defaults kept, pill OFFLINE, no toast, socket still asked to connect (global review focus 1)', async () => {
  const down = { ok: false, status: 0, data: null }; api.simSnapshot.mockResolvedValue(down); api.topologyEdges.mockResolvedValue(down); api.scenariosList.mockResolvedValue(down)
  await expect(bootSim({ reel: null, search: '' })).resolves.toBeUndefined()
  expect(ws.connect).toHaveBeenCalledTimes(1); expect(useStore.getState().nodes).toEqual([]); expect(useStore.getState().scenarios).toEqual([]); expect(useStore.getState().toasts).toEqual([]); expect(selectPill(useStore.getState())).toBe('offline')
})
test('runKey reel N navigates to the reel route carrying theme/hero; past the last reel is a no-op; 0 leaves a reel page for /sim/', () => {
  const assign = vi.fn(); vi.stubGlobal('location', { ...location, pathname: '/reels/sybil-eclipse/', search: '?theme=stage&t=3', assign })
  runKey('reel', 3); expect(assign).toHaveBeenCalledWith('/reels/mainnet-block-wave/?theme=stage')
  runKey('reel', 4); expect(assign).toHaveBeenCalledTimes(1)
  runKey('backToLive'); expect(assign).toHaveBeenLastCalledWith('/sim/?theme=stage')
})
test('runKey 0 on a live page with no reel is a no-op: topology, mainnet and socket untouched', () => {
  vi.stubGlobal('location', { ...location, pathname: '/sim/', search: '', assign: vi.fn() })
  const mainnet = { slot: 1 } as unknown as ReturnType<typeof useStore.getState>['mainnet']
  useStore.setState({ mainnet })
  runKey('backToLive')
  expect(resetTopology).not.toHaveBeenCalled(); expect(ws.connect).not.toHaveBeenCalled(); expect(useStore.getState().mainnet).toBe(mainnet)
})
test('StrictMode boot, teardown, boot on a reel page: the first load aborts quietly, the second lands (no redirect)', async () => {
  const assign = vi.fn(); vi.stubGlobal('location', { ...location, pathname: `/reels/${meta.name}/`, search: '?t=2', assign })
  vi.mocked(loadReel).mockImplementation(async (_m, opts) => { await Promise.resolve(); return !opts?.signal?.aborted })
  const first = bootSim({ reel: meta, search: '?t=2' }); teardownSim(); const second = bootSim({ reel: meta, search: '?t=2' })
  await Promise.all([first, second])
  expect(vi.mocked(loadReel).mock.calls[0][1]?.signal?.aborted).toBe(true)
  expect(assign).not.toHaveBeenCalled(); expect(useStore.getState().reel?.name).toBe(meta.name); expect(seekReelToSimTime).toHaveBeenCalledTimes(1)
})

test('applyUrlMoment seeks before selecting, so a peer that appears after the seek is selectable', () => {
  useStore.setState({ reel: { name: 'r', title: 'R', durationMs: 1, durationSim: 1 } })
  vi.mocked(seekReelToSimTime).mockImplementation(() => useStore.getState().applySnapshot(snapWith(['peer-0', 'sybil-0'])))
  applyUrlMoment(new URLSearchParams('t=12.4&peer=sybil-0'))
  expect(seekReelToSimTime).toHaveBeenCalledWith(12.4); expect(useStore.getState().selectedPeer).toBe('sybil-0')
})
test('syncUrlMoment writes ?t only while a reel is paused and keeps theme/hero', () => {
  history.replaceState(null, '', '/reels/sybil-eclipse/?theme=stage&hero=1')
  useStore.setState({ reel: { name: 'r', title: 'R', durationMs: 1, durationSim: 1 }, playing: false }); useStore.getState().applySnapshot(snapWith(['sybil-0'], { time: 12.4 })); useStore.getState().selectPeer('sybil-0')
  syncUrlMoment(); expect(location.search).toBe('?theme=stage&hero=1&peer=sybil-0&t=12.4')
  useStore.setState({ playing: true }); syncUrlMoment(); expect(location.search).toBe('?theme=stage&hero=1&peer=sybil-0')
  useStore.setState({ reel: null, playing: false }); syncUrlMoment(); expect(location.search).not.toContain('t=')
})
test('initUrlMoment mirrors selection and pause changes to the URL', () => {
  history.replaceState(null, '', '/reels/sybil-eclipse/'); const off = initUrlMoment()
  useStore.getState().applySnapshot(snapWith(['peer-3'])); useStore.getState().selectPeer('peer-3'); expect(location.search).toBe('?peer=peer-3')
  useStore.getState().selectPeer(null); expect(location.search).toBe(''); off()
})
test('shareMoment copies the current href and toasts Link copied', async () => {
  const writeText = vi.fn(async () => {}); vi.stubGlobal('navigator', { clipboard: { writeText } })
  await shareMoment(); expect(writeText).toHaveBeenCalledWith(location.href); expect(useStore.getState().toasts.at(-1)?.text).toBe('Link copied')
})
test('without navigator.clipboard (http on the venue LAN) shareMoment prompts with the href and still toasts; an unknown ?peer= is ignored (global review focus 5)', async () => {
  vi.stubGlobal('navigator', {}); const prompt = vi.fn(); vi.stubGlobal('prompt', prompt)
  await shareMoment(); expect(prompt).toHaveBeenCalledWith('Copy this link', location.href); expect(useStore.getState().toasts.at(-1)?.text).toBe('Link copied')
  useStore.getState().applySnapshot(snapWith(['peer-0'])); expect(() => applyUrlMoment(new URLSearchParams('peer=ghost'))).not.toThrow(); expect(useStore.getState().selectedPeer).toBeNull()
})
test('initAutoGeo waits for observers, switches to geo once, and re-arms when the feed goes off', () => {
  const off = initAutoGeo()
  const obs = { peer_id: 'obs-1', index: 0, state: 'idle' as const, connected_peers: [], is_real: true, x: 10, y: -25, messages_sent: 0, messages_received: 0, gossip_score: 0 }
  dispatchFrame({ type: 'telemetry_status', active: false, peer_count: 0, peers: [], mainnet: { enabled: true, observers: 138, slot: 15466393 } })
  expect(useStore.getState().layoutMode).toBe('force')                        // no observers yet
  dispatchFrame({ ...snapWith([]), type: 'snapshot', nodes: [obs] }); expect(useStore.getState().layoutMode).toBe('geo'); expect(useStore.getState().layoutBeforeGeo).toBe('force')
  useStore.getState().setLayoutMode('radial'); dispatchFrame({ ...snapWith([]), type: 'snapshot', nodes: [obs] }); expect(useStore.getState().layoutMode).toBe('radial')   // once per feed-on
  dispatchFrame({ type: 'telemetry_status', active: false, peer_count: 0, peers: [], mainnet: { enabled: false, observers: 0 } })
  dispatchFrame({ type: 'telemetry_status', active: false, peer_count: 0, peers: [], mainnet: { enabled: true, observers: 138 } }); expect(useStore.getState().layoutMode).toBe('geo'); off()
})

import { test, expect, beforeEach, vi } from 'vitest'
import * as client from '@/lib/api/client'
import { toggleReel } from '@/lib/api/replay'
import { resetTopology, fitView } from '@/components/map/renderer'
import { useStore } from '@/lib/store'
import { peerNode, snapWith } from '@/lib/fixtures'
import {
  autoPauseIfDue, injectFault, launchScenario, runKey, setNodePreset, syncUrlMoment, toggleMainnet, togglePlay,
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

beforeEach(() => {
  vi.clearAllMocks()
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

/** Store actions: what the toolbar, menus and keys do (the old app's luminar:* events, as functions). */

import { shallow } from 'zustand/shallow'
import { fitView, resetTopology, visiblePositions } from '@/components/map/renderer'
import * as api from '@/lib/api/client'
import type { ApiResult } from '@/lib/api/client'
import { loadReel, pauseReel, seekReelToSimTime, setReelSpeed, toggleReel, unloadReel } from '@/lib/api/replay'
import { ws } from '@/lib/api/websocket'
import { geoOnly, REEL_GUARD } from '@/lib/copy'
import { isSimPeer, shortId } from '@/lib/format'
import type { KeyAction } from '@/lib/keys'
import { carryParams, liveHref, REEL_MANIFEST, reelHref } from '@/lib/reels'
import { useStore } from '@/lib/store'
import type { ReelManifest, ReelMeta } from '@/lib/types'

const S = () => useStore.getState()

function toast(r: ApiResult<unknown>, label: string): void {
  const t = api.toastFor(r, label)
  S().pushToast(t.text, t.kind)
}

/** Transport controls say nothing on success (the pill and clock show it) and toast only a failure (B9: inline, never silent). */
const failToast = (r: ApiResult<unknown>, label: string): void => { if (!r.ok) toast(r, label) }

/** In a reel, sim actions are refused with a hint; true means "stop here". */
export function reelGuard(): boolean {
  if (!S().reel) return false
  S().pushToast(REEL_GUARD, 'info')
  return true
}

/** The simulation is invisible in Geo; a simulated action switches back so it can be seen. */
export function leaveGeoForSim(): void {
  const s = S()
  if (s.layoutMode !== 'geo') return
  const back = s.layoutBeforeGeo === 'radial' ? 'radial' : 'force'
  s.setLayoutMode(back)
  s.pushToast(geoOnly(back), 'info')
}

/** Edges land before the snapshot, so the one layout that follows sees both halves. Silent on failure (the pill says it). */
export async function fetchTopology(): Promise<void> {
  const [snap, edges] = await Promise.all([api.simSnapshot(), api.topologyEdges()])
  if (edges.ok && edges.data) S().applyEdges({ type: 'edges', edges: edges.data.edges })
  if (snap.ok && snap.data) S().applySnapshot({ ...snap.data, type: 'snapshot' })
}

export async function fetchScenarios(): Promise<void> {
  const r = await api.scenariosList()
  if (r.ok && r.data) useStore.setState({ scenarios: r.data.scenarios })
}

export async function togglePlay(): Promise<void> {
  const s = S()
  if (s.reel) { toggleReel(); return }   // the player sets store.playing itself (A.0)
  if (s.playing) {
    s.setPlaying(false)
    const r = await api.simPause()
    failToast(r, 'Pause')
    if (!r.ok) S().setPlaying(true)   // the backend is still running: put the button back
    return
  }
  // Play at the limit means "one more period", so the sim still pauses at the total the timeline shows.
  if (s.maxDuration > 0 && s.simTime >= s.maxDuration) s.extendDuration()
  s.setPlaying(true)
  const r = await api.simPlay()
  failToast(r, 'Play')
  if (!r.ok) S().setPlaying(false)   // nothing started (offline, 403 without the admin token): the button must not claim it did
}

export async function reset(): Promise<void> {
  const s = S()
  if (s.reel) {   // t=0 holds only the edges frame; the first snapshot is what repaints the map
    pauseReel()
    seekReelToSimTime(0)
    s.setPlaying(false)
    return
  }
  leaveGeoForSim()
  s.resetRun()
  s.setPlaying(false)
  useStore.setState({ simState: 'stopped' })
  failToast(await api.simReset(), 'Reset')
}

export async function setSpeed(speed: number): Promise<void> {
  useStore.setState({ simSpeed: speed })
  if (S().reel) setReelSpeed(speed)
  else failToast(await api.simSpeed(speed), `Speed ×${speed}`)
}

/** Reels only; the live scrubber is disabled (spec §6.2). */
// A seek rebuilds the store from the recording's start (replay.ts), so a scrubber drag that fires on every
// pointer move coalesces to one seek per animation frame, taking the latest position.
let pendingSeek: number | null = null
export function seekTo(simSec: number): void {
  if (!S().reel) return
  if (typeof requestAnimationFrame === 'undefined') { seekReelToSimTime(simSec); return }
  const first = pendingSeek === null
  pendingSeek = simSec
  if (first) requestAnimationFrame(() => { const t = pendingSeek; pendingSeek = null; if (t !== null && S().reel) seekReelToSimTime(t) })
}

export function autoPauseIfDue(): void {
  const s = S()
  if (s.reel || !s.playing || s.maxDuration <= 0 || s.simTime < s.maxDuration) return
  void api.simPause()
  s.setPlaying(false)
}

export async function launchScenario(id: string): Promise<void> {
  if (reelGuard()) return
  leaveGeoForSim()
  const r = await api.scenarioLaunch(id, S().simSpeed)
  if (!r.ok) { toast(r, 'Scenario'); return }
  await fetchTopology()
}

export type FaultKind = 'partition' | 'sybil' | 'eclipse' | 'drop' | 'clear-all'

function selectedSimPeer(): string | null {
  const s = S()
  const node = s.selectedPeer ? s.nodeById.get(s.selectedPeer) : undefined
  return node && isSimPeer(node) ? node.peer_id : null
}

/** Visible sim peers left of the median x vs the rest (spec §6.2). */
function partitionGroups(): [string[], string[]] {
  const byId = S().nodeById
  const ids = [...visiblePositions()]
    .filter(([id]) => { const n = byId.get(id); return n !== undefined && isSimPeer(n) })
    .sort((a, b) => a[1][0] - b[1][0])
    .map(([id]) => id)
  const mid = Math.floor(ids.length / 2)
  return [ids.slice(0, mid), ids.slice(mid)]
}

export async function injectFault(kind: FaultKind, opts?: { n?: number }): Promise<void> {
  if (reelGuard()) return
  const target = kind === 'eclipse' || kind === 'drop' ? selectedSimPeer() : null
  if ((kind === 'eclipse' || kind === 'drop') && !target) return
  leaveGeoForSim()
  switch (kind) {
    case 'partition': return toast(await api.faultPartition(...partitionGroups()), 'Partition')
    case 'sybil': {
      const n = Math.min(10, Math.max(1, Math.round(opts?.n ?? 5)))
      return toast(await api.faultSybil(n), `Sybil ×${n}`)
    }
    case 'eclipse': return toast(await api.faultEclipse(target!, 4), `Eclipse on ${shortId(target!)}`)
    case 'drop': return toast(await api.faultDrop(target!), `Drop ${shortId(target!)}`)
    case 'clear-all': return toast(await api.faultClearAll(), 'Clear all')
  }
}

export async function setNodePreset(n: 20 | 50 | 100 | 200): Promise<void> {
  if (reelGuard()) return
  leaveGeoForSim()
  const r = await api.simReconfigure(n)
  if (!r.ok) { toast(r, `${n} nodes`); return }
  resetTopology()
  await fetchTopology()
}

export function setDurationPreset(sec: 60 | 120 | 300 | 600): void {
  if (reelGuard()) return
  S().setDuration(sec, sec)
}

export async function toggleMainnet(): Promise<void> {
  if (reelGuard()) return
  const r = await api.liveMainnet(!S().mainnet?.enabled)
  if (!r.ok || !r.data) { toast(r.ok ? { ...r, ok: false } : r, 'MAINNET'); return }   // R19: status 0 → offline, else the status; a 2xx without a body is a failure too
  const wasOn = S().mainnet?.enabled
  useStore.setState(wasOn && !r.data.enabled ? { mainnet: r.data, geoAutoDone: false } : { mainnet: r.data })   // feed-off re-arms auto-Geo, as applyTelemetryStatus does
  maybeAutoGeo()
}

export function maybeAutoGeo(): void {
  const s = S()
  if (!s.mainnet?.enabled || !s.geoAvailable || s.geoAutoDone) return
  s.setLayoutMode('geo', { remember: true })
  useStore.setState({ geoAutoDone: true })
}

/** The one auto-Geo trigger (A.0): feed on + real observers present → maybeAutoGeo(). Returns the unsubscribe. */
export function initAutoGeo(): () => void {
  return useStore.subscribe(
    s => [s.mainnet?.enabled ?? false, s.geoAvailable] as const,
    ([on, geo]) => { if (on && geo) maybeAutoGeo() },
    { equalityFn: shallow },
  )
}

let loadAbort: AbortController | null = null

export async function enterReel(meta: ReelMeta): Promise<boolean> {
  ws.disconnect()
  useStore.setState({ mainnet: null })   // the reel brings its own status (real reels) or none
  resetTopology()
  S().setReel({ name: meta.name, title: meta.title, durationMs: 0, durationSim: 0 })   // provisional: pill reads REEL, guards hold while loading
  loadAbort?.abort()
  const ctl = new AbortController(); loadAbort = ctl
  const ok = await loadReel(meta, { signal: ctl.signal })
  if (!ok && !ctl.signal.aborted) exitReel()   // an aborted load was torn down on purpose
  return ok
}

export function exitReel(): void {
  loadAbort?.abort()
  unloadReel()
  S().setReel(null)
  useStore.setState({ mainnet: null })   // a real reel's recorded status must not outlive it
  resetTopology()
  if (location.pathname.startsWith('/reels/')) location.assign(liveHref(carryParams(location.search, ['theme', 'hero'])))
  else ws.connect()
}

export function openReel(name: string): void {
  location.assign(reelHref(name, carryParams(location.search, ['theme', 'hero'])))
}

export interface BootOpts { reel: ReelMeta | null; search: string }

/** Reel: no socket, no API. Live: socket, topology, then the moment; failed fetches stay silent (the pill says OFFLINE). */
export async function bootSim({ reel, search }: BootOpts): Promise<void> {
  if (reel) {
    if (await enterReel(reel)) applyUrlMoment(new URLSearchParams(search))
    return
  }
  ws.connect()
  await fetchTopology()
  applyUrlMoment(new URLSearchParams(search))
  void fetchScenarios()
}

export function teardownSim(): void {
  loadAbort?.abort()
  ws.disconnect()
  unloadReel()
  useStore.setState({ reel: null, reelLoad: null })   // an aborted load leaves enterReel's provisional reel and its progress behind
}

export async function shareMoment(): Promise<void> {
  syncUrlMoment()
  try {
    if (!navigator.clipboard?.writeText) throw new Error('no clipboard')
    await navigator.clipboard.writeText(location.href)
  } catch {
    window.prompt('Copy this link', location.href)
  }
  S().pushToast('Link copied', 'ok')
}

/** ?peer= always; ?t= only while a reel is paused. */
export function syncUrlMoment(): void {
  const s = S()
  const url = new URL(location.href)
  if (s.selectedPeer) url.searchParams.set('peer', s.selectedPeer)
  else url.searchParams.delete('peer')
  if (s.reel && !s.playing) url.searchParams.set('t', s.simTime.toFixed(1))
  else url.searchParams.delete('t')
  // Next's patched replaceState turns null into {} and copies __NA + the router tree over (verified 16.4.3, back/forward walk).
  if (url.href !== location.href) history.replaceState(null, '', url)
}

/** Mirrors selection and play/pause to ?peer/?t; returns the unsubscribe. */
export function initUrlMoment(): () => void {
  return useStore.subscribe(s => [s.selectedPeer, s.playing] as const, syncUrlMoment, { equalityFn: shallow })
}

export function applyUrlMoment(q: URLSearchParams): void {
  const t = Number(q.get('t'))
  if (S().reel && q.has('t') && Number.isFinite(t)) seekReelToSimTime(t)
  const peer = q.get('peer')
  if (peer && S().nodeById.has(peer)) S().selectPeer(peer)
}

export function runKey(action: KeyAction, arg?: number, manifest: ReelManifest = REEL_MANIFEST): void {
  const s = S()
  switch (action) {
    case 'togglePlay': void togglePlay(); break
    case 'fitView': fitView(); break
    case 'escape': s.selectPeer(null); s.setKeyHelp(false); break
    case 'reel': { const meta = manifest[arg ?? -1]; if (meta) openReel(meta.name); break }   // no-op past the last
    case 'backToLive': if (s.reel || location.pathname.startsWith('/reels/')) exitReel(); break   // live stays put
    case 'share': void shareMoment(); break
    case 'toggleStage': s.setPref('stageTheme'); break
    case 'toggleHero': s.setPref('hero'); break
    case 'reset': void reset(); break
    case 'toggleKeyHelp': s.setKeyHelp(!s.keyHelpOpen); break
  }
}

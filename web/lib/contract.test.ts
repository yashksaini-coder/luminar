/** Contract smoke: every public name of plan A.2–A.15, A.19, A.21, A.26–A.30 still resolves. A rename fails here first. */

import { expect, test } from 'vitest'
import * as types from '@/lib/types'
import * as format from '@/lib/format'
import * as copy from '@/lib/copy'
import * as keys from '@/lib/keys'
import * as eventCodes from '@/lib/event-codes'
import * as client from '@/lib/api/client'
import * as dispatch from '@/lib/api/dispatch'
import * as websocket from '@/lib/api/websocket'
import * as replay from '@/lib/api/replay'
import * as store from '@/lib/store'
import * as actions from '@/lib/actions'
import * as prefs from '@/lib/prefs'
import * as fonts from '@/lib/fonts'
import * as fixtures from '@/lib/fixtures'
import * as timelineMarks from '@/lib/timeline-marks'
import * as menuKeys from '@/lib/menu-keys'
import * as faultItems from '@/lib/fault-items'
import * as logFilter from '@/lib/log-filter'
import * as inspectorPeers from '@/lib/inspector-peers'
import * as spark from '@/lib/spark'
import * as reels from '@/lib/reels'
import * as ticker from '@/lib/ticker'
import * as layout from '@/components/map/layout'
import * as palette from '@/components/map/palette'
import * as geometry from '@/components/map/geometry'
import * as atlas from '@/components/map/atlas'
import * as renderer from '@/components/map/renderer'
import * as dither from '@/components/dither/dither'
import * as reelStats from '@/scripts/reel-stats.mjs'

type Kind = 'function' | 'object' | 'string' | 'number'
const F = 'function', O = 'object', S = 'string', N = 'number'

const CONTRACT: [string, Record<string, unknown>, Record<string, Kind>][] = [
  ['lib/types', types, { isTypedFrame: F }],
  ['lib/format', format, {
    formatTime: F, formatNumber: F, fmtCount: F, fmtLatency: F, signed: F, shortName: F, shortId: F,
    isAttackerId: F, isPruned: F, isSimPeer: F, cdfStats: F,
  }],
  ['lib/copy', copy, {
    MECHANISM: S, RECORDINGS: S, RECORDING_NOT_RUN: S, ARRIVAL: S, PROVENANCE: S, MESH_HIDDEN: S, SCRUB_LIVE: S,
    ECLIPSE_WHY: S, SAME_NAMES: S, REEL_GUARD: S, geoOnly: F, FIG1: S, FIG2: S, FIG3: S, EVENT_LINE: S,
    REPO_URL: S, FORBIDDEN: O,
  }],
  ['lib/keys', keys, { KEY_BINDINGS: O, KBD_HINT: S, isTypingTarget: F, actionForKey: F }],
  ['lib/event-codes', eventCodes, {
    TYPE_CODES: O, DEFAULT_TYPE: O, FILTER_GROUPS: O, DEFAULT_OFF: O, formatNode: F, buildDetail: F, inspectorDetail: F,
  }],
  ['lib/api/client', client, {
    API_BASE: S, TOKEN_KEY: S, adminToken: F, setAdminToken: F, get: F, post: F, getStatic: F, toastFor: F,
    simSnapshot: F, simPlay: F, simPause: F, simReset: F, simSpeed: F, simReconfigure: F, topologyEdges: F,
    scenariosList: F, scenarioLaunch: F, faultPartition: F, faultSybil: F, faultEclipse: F, faultDrop: F,
    faultClearAll: F, liveMainnet: F,
  }],
  ['lib/api/dispatch', dispatch, { dispatchFrame: F, flushEvents: F, subscribeEvents: F, pendingEventCount: F }],
  ['lib/api/websocket', websocket, { BATCH_MS: N, RECONNECT_MIN_MS: N, RECONNECT_MAX_MS: N, wsUrl: F, ws: O }],
  ['lib/api/replay', replay, {
    REEL_TICK_MS: N, REEL_MIN_SPEED: N, SEEK_STATE_TYPES: O, loadReel: F, playReel: F, pauseReel: F, toggleReel: F,
    setReelSpeed: F, seekReel: F, seekReelToSimTime: F, stopReel: F, unloadReel: F, reelLoaded: F, parseReelChunk: F,
  }],
  ['lib/store', store, {
    MAX_EVENTS: N, MAX_SAMPLES: N, SCORE_HISTORY: N, STAGE_SCALE: O, BASE_SCALE: O, useStore: F,
    selectTimelineTotal: F, selectPill: F, selectSelectedNode: F, selectHoveredNode: F, selectAttackers: F,
    selectPrunedCount: F, selectStateCounts: F, selectKpis: F, selectHasMessages: F, selectCanGeo: F,
  }],
  ['lib/actions', actions, {
    reelGuard: F, leaveGeoForSim: F, fetchTopology: F, fetchScenarios: F, togglePlay: F, reset: F, setSpeed: F,
    seekTo: F, autoPauseIfDue: F, launchScenario: F, injectFault: F, setNodePreset: F, setDurationPreset: F,
    toggleMainnet: F, maybeAutoGeo: F, enterReel: F, exitReel: F, shareMoment: F, syncUrlMoment: F,
    applyUrlMoment: F, runKey: F, bootSim: F, teardownSim: F, openReel: F, initUrlMoment: F, initAutoGeo: F,
  }],
  ['lib/prefs', prefs, {
    PREFS_KEY: S, loadPrefs: F, persistPrefs: F, applyDomPrefs: F, initPrefs: F, reducedMotion: F,
  }],
  ['lib/fonts', fonts, { monoFamily: F }],
  ['lib/fixtures', fixtures, { peerNode: F, snapWith: F, peers: F, ring: F }],
  ['lib/timeline-marks', timelineMarks, { bandsFor: F, ticksFor: F, washVar: F }],
  ['lib/menu-keys', menuKeys, { nextMenuIndex: F }],
  ['lib/fault-items', faultItems, { faultItems: F }],
  ['lib/log-filter', logFilter, { initialFilters: F, toggleFilter: F, visibleRows: F, rowClick: F }],
  ['lib/inspector-peers', inspectorPeers, { meshPeers: F, prunedBy: F, peerEvents: F, direction: F }],
  ['lib/spark', spark, { scoreDomain: F, sparkPoints: F }],
  ['lib/reels', reels, {
    REEL_MANIFEST: O, CARRY_KEYS: O, reelHref: F, liveHref: F, carryParams: F, redirectTarget: F, loadLabel: F,
  }],
  ['lib/ticker', ticker, { tickerCells: F }],
  ['components/map/layout', layout, {
    GEO_SCALE: N, WORLD_BOUNDS: O, isSimPeer: F, isNodeVisible: F, computeLayout: F, attackerLayoutEdges: F,
    edgesKey: F, topologyKey: F, resetLayoutMemory: F,
  }],
  ['components/map/palette', palette, {
    PALETTE_TOKENS: O, PAL: O, cssToRgba: F, refreshPalette: F, BAND_DENSITY: O, scoreBand: F,
    PARTICLE_KEY: O, withAlpha: F,
  }],
  ['components/map/geometry', geometry, {
    nodeRadiusPx: F, glyphScale: F, bezierPoint: F, PARTICLE_TRAVEL_MS: N, PARTICLE_LIFETIME_MS: N,
    PARTICLE_CAP: N, PULSE_CAP: N, PULSE_MS: N, FIZZLE_AT: N, FIZZLE_ALPHA: N, particleFrame: F,
    pulseAlpha: F, breathe: F, OBSERVER_STATIC_ALPHA: N,
  }],
  ['components/map/atlas', atlas, {
    atlasLayout: F, haloCells: F, HALO_OUTER: N, HALO_INNER: N, glyphFor: F, atlasKey: F,
  }],
  ['components/map/renderer', renderer, { LAYER_IDS: O, layerIds: F, particlesFor: F, markDirty: F }],
  ['components/dither/dither', dither, {
    BAYER8: O, bayer: F, luma601: F, applyContrast: F, DITHER_CONTRAST: N, REVEAL_STEPS: O, REVEAL_STEP_MS: N,
    LOUPE_PX: N, PAPER: O, PITCH: O, FLAME: O, ditherImageData: F, revealSteps: F, coverRect: F,
    drawDither: F, drawLoupe: F,
  }],
  ['scripts/reel-stats', reelStats, {
    computeStats: F, computeCard: F, STAMP_MAX: N, PLATE_MAX_BYTES: N, CARDS_MAX_BYTES: N,
  }],
]

for (const [path, mod, names] of CONTRACT) {
  test(`${path} exports its contract names`, () => {
    for (const [name, kind] of Object.entries(names)) expect(typeof mod[name], `${path}.${name}`).toBe(kind)
  })
}

test('fixed-size contract tables', () => {
  expect(Object.keys(keys.KEY_BINDINGS)).toHaveLength(18)
  expect(renderer.LAYER_IDS).toHaveLength(15)
  expect(palette.BAND_DENSITY).toEqual([0.12, 0.35, 0.65, 1])
})

// A.28's activeFaultCount(events) moved to store state in ee7bf42 (task 3.3 review): the
// Clear-all count (spec "shows active count") survives the events ring rolling over.
test('A.28 active-fault count lives in store state, not fault-items', () => {
  expect('activeFaultCount' in faultItems).toBe(false)
  expect(store.useStore.getState().activeFaults).toBe(0)
})

export const MECHANISM = 'Same mechanism, toy constants.'
export const RECORDINGS = 'reproducible recordings'                                   // plural form for blurbs
export const RECORDING_NOT_RUN = 'reproducible recording, not an identical run'       // readout 4 sub-caption
export const ARRIVAL = 'arrival at observer nodes, ~2.5 min behind'
export const PROVENANCE = 'arrival at observer nodes, not mesh paths · data: ethPandaOps (CC BY 4.0)'
export const MESH_HIDDEN = 'gossip mesh · hidden above 100 peers (backend sends none)'
export const SCRUB_LIVE = 'scrubbing rewinds recordings only; the live clock cannot rewind'
export const ECLIPSE_WHY = 'silent attackers send nothing invalid, so P4 never fires; only the P3 deficit, floored at −0.25'
export const SAME_NAMES = 'the metric names Lighthouse emits'
export const REEL_GUARD = 'Press 0 to leave the reel first'
export const geoOnly = (back: 'force' | 'radial') => `Geo shows real observers only — switched to ${back}`
export const FIG1 = 'Fifty peers, five Sybils grafted at once. P4 scoring prunes them in two heartbeats.'
export const FIG2 = 'Same mechanism, toy constants.'
export const FIG3 = 'Fifty-seven seconds: one publish, five Sybils, one eclipse, one heal.'
export const EVENT_LINE = 'Devcon 8 · Mumbai · 3–6 Nov 2026'
export const REPO_URL = 'github.com/yashksaini-coder/luminar'
/** Phrases that may appear nowhere but this file (spec §4.10 grep). */
export const FORBIDDEN = ['identical run', "beacon node's scoring", 'the scoring your beacon node runs', 'mesh path'] as const

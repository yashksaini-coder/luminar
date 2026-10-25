/** Every string the launch video shows, once (honesty lines imported from lib/copy.ts, never retyped). */
import { ARRIVAL, MECHANISM, PROVENANCE, SAME_NAMES } from '@/lib/copy'
import { LIGHTHOUSE, TOY } from '../constants'
import type { Orientation } from '../props'
import type { SceneId } from '../timeline'

/** Line 2 (wide) / line 3 (tall) renders italic. */
export const HEADLINE: Record<Orientation, string[]> = {
  wide: ['libp2p GossipSub v1.1.', 'Run live. Broken on purpose.'],
  tall: ['libp2p GossipSub v1.1.', 'Run live.', 'Broken on purpose.'],
}

export const STAMP: Record<SceneId, string> = {
  'cold-open': 'LUMINAR',
  title: '',
  healthy: 'FLOOD PUBLISH',
  sybils: 'FIVE SYBILS',
  pruned: 'PRUNED BY SCORE',
  eclipse: 'SCORING CANNOT SEE THIS',
  heal: 'HEALED',
  'same-names': 'OPENTELEMETRY OUT',
  mainnet: '',
  honesty: 'TOY CONSTANTS',
  end: 'BREAK IT YOURSELF',
}

export const STAMP_TILT: Record<SceneId, number> = {
  'cold-open': 3, title: 0, healthy: -2, sybils: 3, pruned: -2, eclipse: 3,
  heal: -2, 'same-names': 3, mainnet: 0, honesty: -2, end: 3,
}

export const FIG: Partial<Record<SceneId, string>> = {
  title: 'Fifty peers, a mesh, and a scoring loop you can push past the prune threshold.',
  healthy: `One publish, every peer, in four hops. ${MECHANISM}`,
  pruned: 'P4, the invalid-message penalty: −10 per heartbeat of spam. One heartbeat later every honest peer had pruned them; nobody coordinated it.',
  eclipse: 'Four silent attackers. No invalid messages, so no P4. Only a P3 deficit, floored at −0.25. The mesh never reacts; peer-10 lives on gossip pulls, a heartbeat late.',
  heal: 'Faults cleared; the mesh re-grafts and delivery is back within two heartbeats.',
  'same-names': `Seven of ${SAME_NAMES}, so the same dashboard queries work on both. Not the same numbers.`,
  mainnet: `Real mainnet: one slot's block, ${ARRIVAL}. ${PROVENANCE}`,
}

export const FIG_N: Partial<Record<SceneId, number>> = {
  title: 1, healthy: 2, pruned: 3, eclipse: 4, heal: 5, 'same-names': 6, mainnet: 7,
}

const minus = (n: number) => String(n).replace('-', '−')

export const HONESTY_ROWS: [label: string, luminar: string, lighthouse: string][] = [
  ['D', String(TOY.d), String(LIGHTHOUSE.d)],
  ['prune threshold', minus(TOY.pruneThreshold), LIGHTHOUSE.thresholds],
  ['heartbeat', `${TOY.heartbeatS} s`, `${LIGHTHOUSE.heartbeatS} s`],
  ['score', TOY.terms, LIGHTHOUSE.terms],
]

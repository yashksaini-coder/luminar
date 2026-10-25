/** The fault menu's rows, with disabled + reason derived from state; the active fault count. */

import type { FaultKind } from '@/lib/actions'
import { isSimPeer, shortName } from '@/lib/format'
import type { AppState } from '@/lib/store'
import type { AppEvent } from '@/lib/types'

export interface FaultItem { kind: FaultKind; label: string; aside: string; disabled: boolean; reason?: string }

/** FaultInjected rows after the last FaultCleared. */
export function activeFaultCount(events: AppEvent[]): number {
  let n = 0
  for (const e of events) {
    if (e.event_type === 'FaultCleared') n = 0
    else if (e.event_type === 'FaultInjected') n++
  }
  return n
}

export function faultItems(s: Pick<AppState, 'selectedPeer' | 'nodeById' | 'events'>, sybilN: number): FaultItem[] {
  const node = s.selectedPeer ? s.nodeById.get(s.selectedPeer) : undefined
  const target = node && isSimPeer(node) ? shortName(node) : null
  const targeted = (kind: FaultKind, label: string): FaultItem =>
    target ? { kind, label, aside: target, disabled: false } : { kind, label, aside: '', disabled: true, reason: 'select a peer first' }
  const active = activeFaultCount(s.events)
  return [
    { kind: 'partition', label: 'Partition', aside: 'split by layout side', disabled: false },
    { kind: 'sybil', label: 'Sybil attack', aside: `${sybilN} peers`, disabled: false },
    targeted('eclipse', 'Eclipse attack'),
    targeted('drop', 'Drop peer'),
    { kind: 'clear-all', label: 'Clear all faults', aside: `${active} active`, disabled: active === 0 },
  ]
}

/** Hero lower-third: eight broadcast cells derived from the store (port of the pre-overhaul ui/narrator.ts renderTicker, git tag pre-overhaul). */
import { formatTime } from '@/lib/format'
import { type AppState, selectAttackers, selectHasMessages, selectPrunedCount } from '@/lib/store'

export interface TickerCell { key: string; value: string; danger?: boolean }

export function tickerCells(s: AppState): TickerCell[] {
  const ga = s.gossipAnalytics
  const has = selectHasMessages(s) && !!ga
  const n = selectAttackers(s).length
  const pruned = selectPrunedCount(s)
  const deg = ga?.mesh_stability?.avg_degree
  const cells: TickerCell[] = [
    { key: 'phase', value: s.phaseLabel || (s.activeScenario?.scenario?.name ?? 'free play') },
    { key: 'delivery', value: has ? `${Math.round((ga.recent_delivery_ratio ?? ga.avg_delivery_ratio) * 100)}%` : '—' },
    { key: 'mesh d', value: has && deg != null ? deg.toFixed(1) : '—' },
    { key: 'hops', value: has ? ga.avg_hops.toFixed(1) : '—' },
    { key: 'e2e', value: has ? `${ga.avg_propagation_ms.toFixed(0)} ms` : '—' },
    { key: 'attackers', value: n ? `${n} · ${pruned} pruned` : '0', danger: n > 0 },
    { key: 'invalid', value: String(s.invalidCount), danger: s.invalidCount > 0 },
    { key: 'T+', value: formatTime(s.simTime) },
  ]
  const m = s.mainnet
  if (m?.enabled && s.layoutMode === 'geo') {
    // Geo + mainnet shows real observers only: the simulated mesh's delivery/degree/hops/latency and its attacker and
    // invalid counts say nothing about that map, so the arrival readout replaces all six (and fits the bar at 1440 px).
    cells.splice(1, 6,
      { key: 'slot', value: String(m.slot ?? '—') },
      { key: 'first seen', value: m.first_ms != null ? `${m.first_ms} ms · ${m.first_client || '?'}` : '—' },
      { key: 'p50', value: m.p50_ms != null ? `${m.p50_ms} ms` : '—' },
      { key: 'observers', value: String(m.with_geo ?? m.observers ?? 0) },
    )
  }
  return cells
}

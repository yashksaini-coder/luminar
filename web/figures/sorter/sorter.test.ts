import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from 'vitest'

const html = readFileSync(join(__dirname, '../../public/figures/sorter.html'), 'utf8')
test('built sorter is self-contained and names the Must buttons, stats and labels', () => {
  expect(html).not.toMatch(/<script\s+src=/); expect(html).not.toMatch(/fonts\.googleapis|fontshare|https?:\/\/cdn/)
  for (const s of ['Post', 'Heartbeat', 'Bolt on a Sybil', 'mesh 6/6 (toy)', 'score port-3', 'delivered', 'IWANT pulls', 'beat', 'SORTER No. 6',
                   'CAM SHAFT (1 s)', 'P1 WINDER', 'P2 TOKENS', 'P3 COUNTERWEIGHT', 'P4 SLUG', 'TRIP LEVER -10', 'LOCK ARM -5', 'TICKET PUNCH (IHAVE)', 'PULL VALVE (IWANT)', 'SPLITTER (FLOOD)',
                   'nothing in the history yet', "turn:'full'", 'Bolt on a Sybil@']) expect(html).toContain(s)
  expect(html).not.toMatch(/Lower the hood|Slide the bulkhead/)       // buttons 4–5 deferred (spec §13.4)
  expect(html).not.toMatch(/beacon node|identical run/i)
})

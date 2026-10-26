import { readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from 'vitest'

const path = join(__dirname, '../../public/figures/globe.html')
const html = readFileSync(path, 'utf8')
test('built globe is self-contained and names the buttons, stats and labels', () => {
  expect(html).not.toMatch(/<script\s+src=/); expect(html).not.toMatch(/fonts\.googleapis|fontshare|https?:\/\/cdn/)
  for (const s of ['Post', 'Heartbeat', 'Sybil', 'Eclipse', 'Partition', 'Heal', 'mesh 12 · D 3 (toy)', 'delivered', 'beat', 'RELAY GLOBE No. 1',
                   'MESH ARC (D 3)', 'SCORE DIAL -20..+5', 'PRUNE -10', 'GRAFT BAR -5', 'FLOOD (8 HOPS)', 'SYBIL (SPAM)', 'ECLIPSE (SILENT)', 'PARTITION',
                   "turn:'full'", 'Mumbai', 'Tokyo']) expect(html).toContain(s)
  expect(html).not.toMatch(/beacon node|identical run/i)
  expect(statSync(path).size).toBeLessThan(400 * 1024)
})

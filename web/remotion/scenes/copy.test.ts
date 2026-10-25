import { expect, test } from 'vitest'
import { ARRIVAL, FORBIDDEN, PROVENANCE } from '@/lib/copy'
import { FIG, HEADLINE, HONESTY_ROWS, STAMP } from './copy'

test('stamps ≤ 24 chars, copy clean, honesty rows from constants', () => {
  for (const s of Object.values(STAMP)) expect(s.length).toBeLessThanOrEqual(24)
  const all = [...Object.values(STAMP), ...Object.values(FIG), ...HEADLINE.wide, ...HEADLINE.tall, ...HONESTY_ROWS.flat()].join('\n')
  for (const f of FORBIDDEN) if (!PROVENANCE.includes(f)) expect(all).not.toContain(f)    // 'mesh path' reaches the video only inside the imported PROVENANCE
  expect(FIG.mainnet).not.toMatch(/propagation|identical/i); expect(FIG.mainnet).toContain(ARRIVAL); expect(FIG.mainnet).toContain(PROVENANCE)
  expect(HEADLINE.tall).toHaveLength(3); expect(HONESTY_ROWS).toEqual([['D', '6', '8'], ['prune threshold', '−10', '−4000 / −8000 / −16000'], ['heartbeat', '1 s', '0.7 s'], ['score', 'P1–P4', 'P1–P7']])
})

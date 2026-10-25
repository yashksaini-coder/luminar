import { test, expect } from 'vitest'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { FORBIDDEN, PROVENANCE, MECHANISM, RECORDING_NOT_RUN, ARRIVAL, REEL_GUARD, geoOnly } from '@/lib/copy'
test('honesty sentences are verbatim', () => {
  expect(MECHANISM).toBe('Same mechanism, toy constants.')
  expect(PROVENANCE).toBe('arrival at observer nodes, not mesh paths · data: ethPandaOps (CC BY 4.0)')
  expect(ARRIVAL).toBe('arrival at observer nodes, ~2.5 min behind')
  expect(RECORDING_NOT_RUN).toBe('reproducible recording, not an identical run')
  expect(REEL_GUARD).toBe('Press 0 to leave the reel first')
  expect(geoOnly('radial')).toBe('Geo shows real observers only — switched to radial')
})
test('forbidden phrases appear only in lib/copy.ts', () => {
  const hits: string[] = []
  let scanned = 0
  const walk = (d: string) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) { if (!/node_modules|^out$|\.next/.test(f)) walk(p) } else if (/\.(tsx?|mjs|css|json)$/.test(f) && !p.endsWith('lib/copy.ts') && !p.endsWith('copy.test.ts')) { scanned++; const s = readFileSync(p, 'utf8').toLowerCase(); for (const w of FORBIDDEN) if (s.includes(w.toLowerCase())) hits.push(`${p}: ${w}`) } } }
  for (const d of ['app', 'components', 'lib', 'remotion']) { const dir = join(__dirname, '..', d); if (existsSync(dir)) walk(dir) }
  expect(scanned).toBeGreaterThan(0)
  expect(hits).toEqual([])
})

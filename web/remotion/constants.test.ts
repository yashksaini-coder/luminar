/** The honesty card cannot drift from the engine. */
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { SERIES, TOY } from './constants'

test('toy constants match backend/gossip/engine.py and the seven series exist in the backend', () => {
  const eng = readFileSync(join(__dirname, '../../backend/gossip/engine.py'), 'utf8')
  expect(eng).toMatch(new RegExp(`^D = ${TOY.d}\\b`, 'm')); expect(eng).toMatch(new RegExp(`^SCORE_THRESHOLD_PRUNE = ${TOY.pruneThreshold}\\.0`, 'm')); expect(eng).toMatch(new RegExp(`^HEARTBEAT_INTERVAL = ${TOY.heartbeatS.toFixed(1)}`, 'm'))
  const backend = execSync('grep -rho "gossipsub_[a-z_]*" ../backend', { encoding: 'utf8' })
  for (const s of SERIES) expect(backend).toContain(s)
  expect(SERIES).toHaveLength(7)
})

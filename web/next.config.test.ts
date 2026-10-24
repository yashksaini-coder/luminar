import { test, expect } from 'vitest'
import config from './next.config'

test('export settings the FastAPI mount depends on', () => {
  const c = config('phase-production-build')
  expect(c.output).toBe('export')
  expect(c.trailingSlash).toBe(true)
  expect(c.images?.unoptimized).toBe(true)
  expect(c.rewrites).toBeUndefined()
})

test('dev proxies /api to :8000 and nothing else', async () => {
  const c = config('phase-development-server')
  expect(await c.rewrites!()).toEqual([
    { source: '/api/:path*', destination: 'http://localhost:8000/api/:path*' },
  ])
})

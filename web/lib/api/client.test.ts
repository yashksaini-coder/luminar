import { test, expect, vi, afterEach } from 'vitest'
import { faultSybil, simPlay, faultClearAll, toastFor, get, setAdminToken, adminToken, TOKEN_KEY } from '@/lib/api/client'
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); localStorage.clear() })
const init = (m: ReturnType<typeof vi.fn>) => m.mock.calls[0][1] as RequestInit & { headers: Record<string, string> }

test('post returns ok/status/data and sets headers', async () => {
  setAdminToken('secret'); expect(adminToken()).toBe('secret'); expect(localStorage.getItem(TOKEN_KEY)).toBe('secret')
  const fetchMock = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ ok: true, fault_id: 'f1' }), { status: 200 })); vi.stubGlobal('fetch', fetchMock)
  expect(await faultSybil(5)).toEqual({ ok: true, status: 200, data: { ok: true, fault_id: 'f1' } })
  expect(fetchMock.mock.calls[0][0]).toBe('/api/fault/sybil')
  expect(init(fetchMock).method).toBe('POST'); expect(init(fetchMock).headers['X-Luminar-Token']).toBe('secret'); expect(init(fetchMock).headers['Content-Type']).toBe('application/json')
  expect(JSON.parse(init(fetchMock).body as string)).toEqual({ n_attackers: 5, target_topic: 'lumina/blocks/1.0' })
})
test('post without body sends no Content-Type; without token sends no token header', async () => {
  setAdminToken(null); expect(adminToken()).toBeNull()
  const fetchMock = vi.fn<typeof fetch>(async () => new Response('{"state":"running"}', { status: 200 })); vi.stubGlobal('fetch', fetchMock)
  expect(await simPlay()).toEqual({ ok: true, status: 200, data: { state: 'running' } })
  expect(init(fetchMock).headers['Content-Type']).toBeUndefined(); expect(init(fetchMock).headers['X-Luminar-Token']).toBeUndefined(); expect(init(fetchMock).body).toBeUndefined()
})
test('403, non-JSON and network error never throw', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{"detail":"X-Luminar-Token required"}', { status: 403 })))
  expect(await faultClearAll()).toEqual({ ok: false, status: 403, data: { detail: 'X-Luminar-Token required' } })
  vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>bad gateway</html>', { status: 502 })))
  expect(await faultClearAll()).toEqual({ ok: false, status: 502, data: null })
  vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch') }))
  expect(await faultClearAll()).toEqual({ ok: false, status: 0, data: null })
  expect(await get('/api/scenarios')).toEqual({ ok: false, status: 0, data: null })
})
test('toastFor', () => {
  expect(toastFor({ ok: true, status: 200, data: null }, 'Sybil ×5')).toEqual({ text: 'Sybil ×5 injected', kind: 'ok' })
  expect(toastFor({ ok: false, status: 403, data: null }, 'Sybil ×5')).toEqual({ text: 'Sybil ×5 failed · 403', kind: 'fail' })
  expect(toastFor({ ok: false, status: 0, data: null }, 'Sybil ×5')).toEqual({ text: 'backend offline', kind: 'fail' })
})
test('get prepends API_BASE; getStatic does not', async () => {
  vi.stubEnv('NEXT_PUBLIC_API_URL', 'https://api.example'); vi.resetModules()
  const c = await import('@/lib/api/client')
  const fetchMock = vi.fn<typeof fetch>(async () => new Response('[]', { status: 200 })); vi.stubGlobal('fetch', fetchMock)
  await c.scenariosList(); await c.getStatic('/reels/manifest.json')
  expect(fetchMock.mock.calls.map(x => x[0])).toEqual(['https://api.example/api/scenarios', '/reels/manifest.json'])
})

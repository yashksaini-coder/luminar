// The reel manifest, bundled at build time: one source for the reel pages, the redirect, keys 1–9 and the landing Nav,
// plus the reel/live hrefs and the URL params a jump between them carries (A.29).
import manifest from '@/public/reels/manifest.json'
import type { ReelManifest } from './types'

export const REEL_MANIFEST: ReelManifest = manifest
export const CARRY_KEYS = ['theme', 'hero', 't', 'peer'] as const

const withQuery = (path: string, q?: URLSearchParams) => (q && q.size ? `${path}?${q}` : path)

export function reelHref(name: string, q?: URLSearchParams): string { return withQuery(`/reels/${name}/`, q) }
export function liveHref(q?: URLSearchParams): string { return withQuery('/sim/', q) }

/** Keeps `keys` from `search` in the order of `keys`, drops the rest. */
export function carryParams(search: string, keys: readonly string[] = CARRY_KEYS): URLSearchParams {
  const from = new URLSearchParams(search), out = new URLSearchParams()
  for (const k of keys) { const v = from.get(k); if (v !== null) out.set(k, v) }
  return out
}

/** `?reel=<known name>` → that reel's page with the carried params; otherwise null. */
export function redirectTarget(search: string, names: readonly string[] = REEL_MANIFEST.map(r => r.name)): string | null {
  const name = new URLSearchParams(search).get('reel')
  return name && names.includes(name) ? reelHref(name, carryParams(search)) : null
}

const mb = (bytes: number) => (bytes / 1e6).toFixed(1)
export function loadLabel(p: { loaded: number; total: number } | null): string {
  if (!p) return ''
  if (!p.total) return `${mb(p.loaded)} MB`
  return `${mb(p.loaded)} / ${mb(p.total)} MB · ${Math.round((p.loaded / p.total) * 100)}%`
}

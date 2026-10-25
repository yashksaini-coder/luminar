/** Stage/hero preferences: localStorage, overridden by the URL, mirrored back to both and to <html data-*>. */

import { shallow } from 'zustand/shallow'
import { useStore } from '@/lib/store'

export const PREFS_KEY = 'luminar.prefs'
export interface Prefs { stageTheme: boolean; hero: boolean }

function stored(): Partial<Prefs> {
  try { return JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}') ?? {} } catch { return {} }
}

/** localStorage first, URL wins (?theme=stage, ?hero=1). */
export function loadPrefs(search: URLSearchParams): Prefs {
  const s = stored()
  return {
    stageTheme: search.has('theme') ? search.get('theme') === 'stage' : s.stageTheme === true,
    hero: search.has('hero') ? search.get('hero') === '1' : s.hero === true,
  }
}

/** Writes localStorage and edits only the theme/hero keys of the current query. */
export function persistPrefs(p: Prefs): void {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify({ stageTheme: p.stageTheme, hero: p.hero })) } catch { /* storage blocked */ }
  const url = new URL(location.href)
  if (p.stageTheme) url.searchParams.set('theme', 'stage'); else url.searchParams.delete('theme')
  if (p.hero) url.searchParams.set('hero', '1'); else url.searchParams.delete('hero')
  if (url.href !== location.href) history.replaceState(history.state, '', url)
}

export function applyDomPrefs(p: Prefs): void {
  const ds = document.documentElement.dataset
  if (p.stageTheme) ds.stage = '1'; else delete ds.stage
  if (p.hero) ds.hero = '1'; else delete ds.hero
}

export function reducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
}

/** Loads, applies and persists once, then mirrors every store change; returns the unsubscribe. */
export function initPrefs(): () => void {
  const p = loadPrefs(new URLSearchParams(location.search))
  const s = useStore.getState()
  s.setPref('stageTheme', p.stageTheme)
  s.setPref('hero', p.hero)
  if (reducedMotion()) s.setDisplay({ particlesEnabled: false })   // before anything subscribes (A.0)
  persistPrefs(p)
  applyDomPrefs(p)
  return useStore.subscribe(
    st => [st.stageTheme, st.hero] as const,
    ([stageTheme, hero]) => { persistPrefs({ stageTheme, hero }); applyDomPrefs({ stageTheme, hero }) },
    { equalityFn: shallow },
  )
}

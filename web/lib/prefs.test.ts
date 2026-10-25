import { test, expect, beforeEach, vi } from 'vitest'
import { useStore } from '@/lib/store'
import { applyDomPrefs, initPrefs, loadPrefs, persistPrefs, reducedMotion } from '@/lib/prefs'

beforeEach(() => {
  useStore.setState(useStore.getInitialState(), true)
  localStorage.clear()
})

test('URL wins over localStorage; persist mirrors URL and data attributes', () => {
  localStorage.setItem('luminar.prefs', JSON.stringify({ stageTheme: true, hero: true }))
  expect(loadPrefs(new URLSearchParams('theme=off'))).toEqual({ stageTheme: false, hero: true })
  expect(loadPrefs(new URLSearchParams('theme=stage&hero=1'))).toEqual({ stageTheme: true, hero: true })
  history.replaceState(null, '', '/sim/'); persistPrefs({ stageTheme: true, hero: false }); expect(location.search).toContain('theme=stage'); expect(location.search).not.toContain('hero=')
  expect(JSON.parse(localStorage.getItem('luminar.prefs')!)).toEqual({ stageTheme: true, hero: false })
  applyDomPrefs({ stageTheme: true, hero: true }); expect(document.documentElement.dataset.stage).toBe('1'); expect(document.documentElement.dataset.hero).toBe('1')
  applyDomPrefs({ stageTheme: false, hero: false }); expect(document.documentElement.dataset.stage).toBeUndefined()
})
test('persistPrefs edits only theme and hero; every other param survives', () => {
  history.replaceState(null, '', '/sim/?peer=peer-3&theme=stage&hero=1'); persistPrefs({ stageTheme: false, hero: false })
  expect(location.search).toBe('?peer=peer-3')
})
test('reducedMotion reads matchMedia and is false without a window; initPrefs forces particles off under reduced motion before anything subscribes', () => {
  vi.stubGlobal('matchMedia', () => ({ matches: false })); expect(reducedMotion()).toBe(false)
  vi.stubGlobal('matchMedia', () => ({ matches: true })); expect(reducedMotion()).toBe(true)
  const off = initPrefs(); expect(useStore.getState().particlesEnabled).toBe(false); off()        // global review focus 3
  vi.stubGlobal('matchMedia', () => ({ matches: false })); useStore.setState(useStore.getInitialState(), true)
  const off2 = initPrefs(); expect(useStore.getState().particlesEnabled).toBe(true); off2(); vi.unstubAllGlobals()
})
test('initPrefs applies the URL to the store and mirrors later store changes to the DOM', () => {
  history.replaceState(null, '', '/sim/?theme=stage'); const off = initPrefs()
  expect(useStore.getState().stageTheme).toBe(true); expect(document.documentElement.dataset.stage).toBe('1')
  useStore.getState().setPref('hero', true); expect(document.documentElement.dataset.hero).toBe('1'); expect(location.search).toContain('hero=1')
  off(); useStore.getState().setPref('hero', false); expect(document.documentElement.dataset.hero).toBe('1')
})
test('persistPrefs keeps ?t and ?peer', () => {
  history.replaceState(null, '', '/reels/sybil-eclipse/?t=12.4&peer=sybil-0')
  persistPrefs({ stageTheme: true, hero: false }); expect(location.search).toBe('?t=12.4&peer=sybil-0&theme=stage')
  persistPrefs({ stageTheme: false, hero: true }); expect(location.search).toBe('?t=12.4&peer=sybil-0&hero=1')
})

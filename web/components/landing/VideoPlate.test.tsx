import { act, createElement as h } from 'react'
import { createRoot } from 'react-dom/client'
import { renderToStaticMarkup as r } from 'react-dom/server'
import { afterEach, expect, test, vi } from 'vitest'
import VideoPlate from './VideoPlate'

afterEach(() => { vi.unstubAllEnvs(); document.body.innerHTML = '' })

test('server markup: the wrapper is a reveal section, the plate a card, the caption rises after it; no error note', () => {
  const m = r(h(VideoPlate))
  expect(m).toMatch(/^<div class="[^"]*" data-reveal=""/); expect(m).toMatch(/<div[^>]*class="plate [^"]*"[^>]*data-k="card"/); expect(m).toMatch(/<figcaption data-k="up" style="--i:1"/)
  expect(m).not.toContain('could not load'); expect(m).not.toContain('aria-disabled')
})
test('a video error in production renders the note with the reel link and disables the poster button', () => {
  vi.stubEnv('NODE_ENV', 'production')
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  Object.defineProperty(HTMLImageElement.prototype, 'decode', { configurable: true, value: () => new Promise(() => {}) })   // jsdom has no decode(); keep the skeleton
  const host = document.body.appendChild(document.createElement('div')); const root = createRoot(host)
  act(() => root.render(h(VideoPlate)))
  const play = vi.fn(() => Promise.resolve()); Object.defineProperty(HTMLMediaElement.prototype, 'play', { configurable: true, value: play })
  act(() => { host.querySelector('video')!.dispatchEvent(new Event('error')) })
  const note = host.querySelector('p')!; expect(note.textContent).toBe('The video could not load. Watch the recording instead ›')
  expect(note.querySelector('a')!.getAttribute('href')).toBe('/reels/sybil-eclipse/')
  const btn = host.querySelector('button')!; expect(btn.getAttribute('aria-disabled')).toBe('true'); expect(btn.textContent).not.toContain('Play')
  act(() => { btn.click() }); expect(play).not.toHaveBeenCalled()
  act(() => root.unmount())
})

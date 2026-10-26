import { act, createElement as h } from 'react'
import { createRoot } from 'react-dom/client'
import { renderToStaticMarkup as r } from 'react-dom/server'
import { afterEach, expect, test, vi } from 'vitest'
import VideoPlate, { clock, dissolveAt, SRC } from './VideoPlate'

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); document.body.innerHTML = '' })

test('server markup: grid rows, native video with no autoplay or muted, metadata preload, poster, play control, bar, Fig. 3', () => {
  const m = r(h(VideoPlate)); const d = new DOMParser().parseFromString(m, 'text/html')
  expect(d.querySelector('section#film')!.getAttribute('aria-labelledby')).toBe('film-h')
  expect(d.querySelectorAll('[data-grid]')).toHaveLength(2)
  const v = d.querySelector('video')!
  expect(v.getAttribute('src')).toBe(SRC); expect(v.getAttribute('preload')).toBe('metadata'); expect(v.hasAttribute('playsinline')).toBe(true)
  expect(m).not.toMatch(/autoplay|muted=""|controls=""/)
  expect(d.querySelector('img')!.getAttribute('src')).toBe('/video/poster.png')
  expect(d.querySelector('button[aria-label="Play the launch film with sound"]')).not.toBeNull()
  expect(d.querySelector('button[aria-label="Mute"]')!.getAttribute('aria-pressed')).toBe('false')
  expect(d.querySelector('input[type="range"]')!.hasAttribute('disabled')).toBe(true)
  expect(d.querySelector('figcaption')!.textContent).toContain('Fig. 3')
  expect(m).not.toMatch(/Devcon|Mumbai|\$ |curl|git clone/i)
})

test('dissolve order covers 0…1, clears the centre before the corners on average', () => {
  const cols = 40, rows = 23, all: number[] = []
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) all.push(dissolveAt(x, y, cols, rows))
  expect(Math.min(...all)).toBeGreaterThanOrEqual(0); expect(Math.max(...all)).toBeLessThanOrEqual(1)
  const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length
  const centre = [], corner = []
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { centre.push(dissolveAt(16 + x, 8 + y, cols, rows)); corner.push(dissolveAt(x, y, cols, rows)) }
  expect(avg(centre)).toBeLessThan(avg(corner))
})

test('clock formats m:ss and tolerates NaN', () => {
  expect(clock(0)).toBe('0:00'); expect(clock(NaN)).toBe('0:00'); expect(clock(7.9)).toBe('0:07'); expect(clock(57)).toBe('0:57'); expect(clock(125)).toBe('2:05')
})

function mount(reduce: boolean) {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  vi.stubGlobal('matchMedia', () => ({ matches: reduce, addEventListener() {}, removeEventListener() {} }))
  const play = vi.fn(function (this: HTMLMediaElement) { this.dispatchEvent(new Event('play')); return Promise.resolve() })
  Object.defineProperty(HTMLMediaElement.prototype, 'play', { configurable: true, value: play })
  Object.defineProperty(HTMLMediaElement.prototype, 'pause', { configurable: true, value: function (this: HTMLMediaElement) { this.dispatchEvent(new Event('pause')) } })
  const host = document.body.appendChild(document.createElement('div')); const root = createRoot(host)
  act(() => root.render(h(VideoPlate)))
  return { host, root, play }
}

test('press play: the gesture starts the video unmuted, the poster hides; reduced motion skips the dissolve; mute toggles', () => {
  const { host, root, play } = mount(true)
  const v = host.querySelector('video')!
  act(() => { host.querySelector<HTMLButtonElement>('button[aria-label="Play the launch film with sound"]')!.click() })
  expect(play).toHaveBeenCalledTimes(1); expect(v.muted).toBe(false)
  expect(host.querySelector('img')!.hidden).toBe(true); expect(host.querySelector('canvas')).toBeNull()
  expect(host.querySelector('[data-phase]')!.getAttribute('data-phase')).toBe('video')
  expect(host.querySelector('button[aria-label="Pause"]')).not.toBeNull()
  const mute = host.querySelector<HTMLButtonElement>('button[aria-label="Mute"]')!
  act(() => { mute.click() }); expect(v.muted).toBe(true); expect(mute.getAttribute('aria-pressed')).toBe('true')
  act(() => root.unmount())
})

test('with motion the poster dissolves cell by cell through a canvas, then the video shows', () => {
  vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance'] })
  const ctx = { drawImage: vi.fn(), clearRect: vi.fn(), fillRect: vi.fn(), fillStyle: '' }
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as unknown as CanvasRenderingContext2D)
  vi.spyOn(HTMLImageElement.prototype, 'naturalWidth', 'get').mockReturnValue(1920)
  vi.spyOn(HTMLImageElement.prototype, 'naturalHeight', 'get').mockReturnValue(1080)
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(640)
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(360)
  const { host, root } = mount(false)
  act(() => { host.querySelector<HTMLButtonElement>('button[aria-label="Play the launch film with sound"]')!.click() })
  const phase = () => host.querySelector('[data-phase]')!.getAttribute('data-phase')
  expect(phase()).toBe('dissolve'); expect(ctx.drawImage).toHaveBeenCalledTimes(1)
  act(() => { vi.advanceTimersByTime(200) }); expect(phase()).toBe('dissolve'); expect(ctx.clearRect).toHaveBeenCalled(); expect(ctx.fillRect).toHaveBeenCalled()
  act(() => { vi.advanceTimersByTime(600) }); expect(phase()).toBe('video'); expect(host.querySelector('canvas')).toBeNull()
  act(() => root.unmount()); vi.restoreAllMocks()
})

test('metadata loaded before hydration still sets the duration readout', () => {
  vi.spyOn(HTMLMediaElement.prototype, 'readyState', 'get').mockReturnValue(1)
  vi.spyOn(HTMLMediaElement.prototype, 'duration', 'get').mockReturnValue(46.2)
  const { host, root } = mount(true)
  expect(host.querySelector('figure p')!.textContent).toBe('0:00 / 0:46'); expect(host.querySelector('button[aria-label="Play the launch film with sound"]')!.textContent).toContain('0:46')
  act(() => root.unmount()); vi.restoreAllMocks()
})

test('a video error disables play and links the recording', () => {
  const { host, root, play } = mount(true)
  act(() => { host.querySelector('video')!.dispatchEvent(new Event('error')) })
  expect(host.textContent).toContain('The film could not load.')
  expect(host.querySelector('a[href="/reels/sybil-eclipse/"]')).not.toBeNull()
  const btn = host.querySelector<HTMLButtonElement>('button[aria-disabled="true"]')!
  act(() => { btn.click() }); expect(play).not.toHaveBeenCalled()
  act(() => root.unmount())
})

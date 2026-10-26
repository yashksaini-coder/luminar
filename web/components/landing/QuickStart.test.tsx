import { act, createElement as h } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, test, vi } from 'vitest'
import QuickStart, { COPIED_MS, copyText, TABS } from './QuickStart'

function mount() {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  const host = document.body.appendChild(document.createElement('div')); const root = createRoot(host)
  act(() => root.render(h(QuickStart)))
  const tabs = () => [...host.querySelectorAll<HTMLButtonElement>('[role="tab"]')]
  const panel = () => host.querySelector<HTMLElement>('[role="tabpanel"]')!
  return { host, root, tabs, panel }
}
const key = (el: Element, k: string) => act(() => { el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true })) })
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); document.body.innerHTML = '' })

test('Local · Docker · Offline tabs; Local selected; the panel holds the README commands and the port', () => {
  const { tabs, panel, root, host } = mount()
  expect(tabs().map(t => t.textContent)).toEqual(['Local', 'Docker', 'Offline'])
  expect(tabs().map(t => t.getAttribute('aria-selected'))).toEqual(['true', 'false', 'false'])
  expect(tabs().map(t => t.tabIndex)).toEqual([0, -1, -1])
  expect(panel().getAttribute('aria-labelledby')).toBe('qs-tab-local'); expect(tabs()[0].getAttribute('aria-controls')).toBe(panel().id)
  expect(panel().textContent).toContain('git clone https://github.com/yashksaini-coder/luminar'); expect(panel().textContent).toContain('cd luminar')
  expect(panel().textContent).toContain('make dev'); expect(panel().textContent).toContain('http://localhost:3000/sim/')
  expect(host.querySelector('h2')!.textContent).toBeTruthy()
  act(() => root.unmount())
})
test('arrow keys, Home and End move selection and focus, wrapping at the ends', () => {
  const { tabs, panel, root } = mount()
  tabs()[0].focus(); key(tabs()[0], 'ArrowRight')
  expect(tabs()[1].getAttribute('aria-selected')).toBe('true'); expect(document.activeElement).toBe(tabs()[1])
  expect(panel().textContent).toContain('docker compose up --build'); expect(panel().textContent).toContain('http://localhost:8080')
  key(tabs()[1], 'ArrowRight'); expect(panel().textContent).toContain('make web'); expect(panel().textContent).toContain('/reels/sybil-eclipse/')
  key(tabs()[2], 'ArrowRight'); expect(tabs()[0].getAttribute('aria-selected')).toBe('true')
  key(tabs()[0], 'ArrowLeft'); expect(tabs()[2].getAttribute('aria-selected')).toBe('true')
  key(tabs()[2], 'Home'); expect(tabs()[0].getAttribute('aria-selected')).toBe('true')
  key(tabs()[0], 'End'); expect(document.activeElement).toBe(tabs()[2])
  act(() => root.unmount())
})
test('copy writes the selected panel commands, announces it, and resets after 1.5 s', async () => {
  vi.useFakeTimers()
  const writeText = vi.fn(() => Promise.resolve()); vi.stubGlobal('navigator', { clipboard: { writeText } })
  const { host, tabs, root } = mount()
  act(() => tabs()[1].click())
  const btn = host.querySelector<HTMLButtonElement>('button[aria-label^="Copy"]')!
  await act(async () => { btn.click() })
  expect(writeText).toHaveBeenCalledWith(copyText(TABS[1])); expect(copyText(TABS[1])).toBe('git clone https://github.com/yashksaini-coder/luminar\ncd luminar\ndocker compose up --build')
  expect(btn.textContent).toBe('Copied'); expect(host.querySelector('[role="status"]')!.textContent).toMatch(/copied/)
  act(() => { vi.advanceTimersByTime(COPIED_MS) }); expect(btn.textContent).toBe('Copy')
  act(() => root.unmount())
})
test('a refused clipboard shows an inline fallback, never an alert', async () => {
  vi.stubGlobal('navigator', { clipboard: { writeText: () => Promise.reject(new Error('denied')) } })
  const { host, root } = mount()
  const btn = host.querySelector<HTMLButtonElement>('button[aria-label^="Copy"]')!
  await act(async () => { btn.click() })
  expect(btn.textContent).toBe('Select and copy'); expect(host.querySelector('[role="status"]')!.textContent).toMatch(/by hand/)
  act(() => root.unmount())
})

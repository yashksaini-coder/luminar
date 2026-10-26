import { act, createElement as h } from 'react'
import { createRoot } from 'react-dom/client'
import { renderToStaticMarkup as r } from 'react-dom/server'
import { afterEach, expect, test, vi } from 'vitest'
import CopyCommand, { COPIED_MS } from './CopyCommand'
import Hero, { CHIPS, SETUP } from './Hero'

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); document.body.innerHTML = '' })

test('hero: four spec chips above the poster, the terminal chip under the CTAs, the parse-time reveal script kept', () => {
  const m = r(h(Hero)); const d = new DOMParser().parseFromString(m, 'text/html')
  expect([...d.querySelectorAll('ul[aria-label="What it is"] li')].map(l => l.textContent)).toEqual(['GossipSub v1.1', 'P1–P4 scoring', '20–200 peers', 'OpenTelemetry'])
  expect(CHIPS).toHaveLength(4)
  expect(m.indexOf('What it is')).toBeLessThan(m.indexOf('<h1')); expect(m.indexOf('Open the simulator')).toBeLessThan(m.indexOf('make dev'))
  expect(d.querySelector('code')!.textContent).toBe('$ make dev → localhost:3000')
  expect(d.querySelector('button[aria-label="Copy the clone, install and run commands"]')!.textContent).toBe('copy')
  expect(d.querySelector('[role="status"][aria-live="polite"]')).not.toBeNull()
  expect(SETUP).toBe('git clone https://github.com/yashksaini-coder/luminar && cd luminar && make install && make dev')
  expect([...d.querySelectorAll('section [data-k]')].map(e => e.getAttribute('style'))).toEqual(['--i:0', '--i:1', '--i:2', '--i:3', '--i:4', '--i:5', '--i:6', '--i:7', '--i:7'])
  expect(m).toMatch(/<\/section><script>\(function\(s\)\{s\.offsetWidth;s\.dataset\.in='1'\}\)\(document\.currentScript\.previousElementSibling\)<\/script>$/)
})

function mount(writeText?: (s: string) => Promise<void>) {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  vi.useFakeTimers(); vi.stubGlobal('navigator', { clipboard: writeText ? { writeText } : undefined })
  const host = document.body.appendChild(document.createElement('div')); const root = createRoot(host)
  act(() => root.render(h(CopyCommand, { text: SETUP, label: 'Copy the commands' })))
  return { root, btn: host.querySelector('button')!, status: host.querySelector('[role="status"]')! }
}

test('copy writes the whole setup to the clipboard, says "copied" for 1.5 s in the button and the live region, then resets', async () => {
  const writeText = vi.fn(async () => {}); const { root, btn, status } = mount(writeText)
  await act(async () => { btn.click() })
  expect(writeText).toHaveBeenCalledWith(SETUP); expect(btn.textContent).toBe('copied'); expect(btn.dataset.state).toBe('copied'); expect(status.textContent).toBe('copied')
  act(() => { vi.advanceTimersByTime(COPIED_MS - 10) }); expect(btn.textContent).toBe('copied')
  act(() => { vi.advanceTimersByTime(20) }); expect(btn.textContent).toBe('copy'); expect(status.textContent).toBe('')
  act(() => root.unmount())
})

test('without a clipboard (http on a LAN) it says "copy failed" instead of pretending', async () => {
  const { root, btn, status } = mount()
  await act(async () => { btn.click() })
  expect(btn.textContent).toBe('copy failed'); expect(status.textContent).toBe('copy failed')
  act(() => root.unmount())
})

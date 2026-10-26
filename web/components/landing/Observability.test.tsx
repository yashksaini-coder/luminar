import { act, createElement as h } from 'react'
import { createRoot } from 'react-dom/client'
import { renderToStaticMarkup as r } from 'react-dom/server'
import { afterEach, expect, test, vi } from 'vitest'
import { SAME_NAMES } from '@/lib/copy'
import Observability, { COPIED_MS, CURL, OTEL_UP, SERIES } from './Observability'

const doc = () => new DOMParser().parseFromString(r(h(Observability)), 'text/html')
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); document.body.innerHTML = '' })

test('a data-reveal section with a kicker, an h2 and the Lighthouse wording', () => {
  const d = doc(); const sec = d.querySelector('section[data-reveal]')!
  expect(sec.getAttribute('aria-labelledby')).toBe('obs-h')
  expect(d.querySelector('h2#obs-h')?.textContent).toBe('Same names, your own dashboards')
  expect(sec.textContent).toContain(SAME_NAMES)
  expect([...d.querySelectorAll('[data-k]')].map(e => e.getAttribute('style'))).toEqual(['--i:0', '--i:1', '--i:2', '--i:3', '--i:4', '--i:5'])
})

test('two clean stills in browser windows: sized, lazy, alt text, no dither', () => {
  const d = doc(); const imgs = [...d.querySelectorAll('figure img')]
  expect(imgs.map(i => i.getAttribute('src'))).toEqual(['/stills/grafana.png', '/stills/jaeger.png'])
  for (const i of imgs) { expect(i.getAttribute('width')).toBe('1440'); expect(i.getAttribute('height')).toBe('840'); expect(i.getAttribute('loading')).toBe('lazy'); expect(i.getAttribute('alt')!.length).toBeGreaterThan(20) }
  expect([...d.querySelectorAll('figure a')].map(a => a.textContent)).toEqual([expect.stringContaining('Grafana · luminar'), expect.stringContaining('Jaeger · gossipsub.publish')])
  expect(d.querySelector('canvas, [data-depth]')).toBeNull()
})

test('the terminal lists the seven gossipsub_* series with their /metrics kinds, plus make otel-up', () => {
  const pre = doc().querySelector('pre')!.textContent!
  expect(SERIES).toHaveLength(7)
  for (const [n, kind] of SERIES) expect(pre).toContain(`# TYPE ${n} ${kind}`)
  expect(pre).toContain(CURL)
  expect(doc().body.textContent).toContain(OTEL_UP)
})

test('copy writes the clipboard, says "copied" (announced) and resets after 1.5 s; a rejection says so', async () => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  vi.useFakeTimers()
  const writeText = vi.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('denied'))
  vi.stubGlobal('navigator', { clipboard: { writeText } })
  const host = document.body.appendChild(document.createElement('div')); const root = createRoot(host)
  act(() => root.render(h(Observability)))
  const btn = host.querySelector<HTMLButtonElement>('button[aria-label="Copy the curl command"]')!
  await act(async () => { btn.click() })
  expect(writeText).toHaveBeenCalledWith(CURL)
  expect(btn.textContent).toBe('copied'); expect(btn.nextElementSibling?.textContent).toBe('the curl command copied')
  act(() => { vi.advanceTimersByTime(COPIED_MS) })
  expect(btn.textContent).toBe('copy'); expect(btn.nextElementSibling?.textContent).toBe('')
  await act(async () => { btn.click() })
  expect(btn.textContent).toBe('copy failed')
  act(() => root.unmount())
})

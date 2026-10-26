import { createElement as h } from 'react'
import { renderToStaticMarkup as r } from 'react-dom/server'
import { expect, test } from 'vitest'
import { FORBIDDEN, MECHANISM } from '@/lib/copy'
import Statement, { FRAMING } from './Statement'

const doc = () => new DOMParser().parseFromString(r(h(Statement)), 'text/html')

test('the honesty line over a decorative halftone field, with framing and a mono attribution', () => {
  const d = doc()
  expect(d.querySelector('h2')!.textContent).toBe(MECHANISM)
  const c = d.querySelector('canvas')!
  expect(c.getAttribute('data-preset')).toBe('halftone'); expect(c.getAttribute('aria-hidden')).toBe('true')
  expect(d.body.textContent).toContain(FRAMING)
  expect(d.body.textContent).toContain('Luminar · GossipSub v1.1 · P1–P4')
})

test('framing quotes the engine constants and no forbidden phrase', () => {
  expect(FRAMING).toContain('mesh degree 6'); expect(FRAMING).toContain('one second heartbeat')
  for (const f of FORBIDDEN) expect(FRAMING).not.toContain(f)
})

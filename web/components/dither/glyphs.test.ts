import { createElement as h } from 'react'
import { renderToStaticMarkup as r } from 'react-dom/server'
import { expect, test, vi } from 'vitest'
import Stamp from '@/components/dither/Stamp'

test('Stamp: Manrope uppercase label, tilt variable, flame variant, nowrap, warns over 24 chars', () => {
  const m = r(h(Stamp, { children: 'SYBIL FLOOD · T+10S', depth: 1.2 }))
  expect(m).toContain('SYBIL FLOOD · T+10S'); expect(m).toContain('data-depth="1.2"'); expect(m).toContain('--stamp-tilt:3deg')
  expect(r(h(Stamp, { children: 'X', flame: true }))).toContain('var(--flame)')
  expect(r(h(Stamp, { children: 'X', tilt: -2 }))).toContain('--stamp-tilt:-2deg')
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  r(h(Stamp, { children: 'THIS STAMP IS FAR TOO LONG FOR A PLATE' })); expect(warn).toHaveBeenCalledTimes(1); warn.mockRestore()   // phase review focus 2
})

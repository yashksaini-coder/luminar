import { act, createElement as h } from 'react'
import { createRoot } from 'react-dom/client'
import { renderToStaticMarkup as r } from 'react-dom/server'
import { afterEach, expect, test } from 'vitest'
import { ECLIPSE_WHY } from '@/lib/copy'
import stats from '@/lib/reel-stats.json'
import AttackExplorer from './AttackExplorer'

afterEach(() => { document.body.innerHTML = '' })

function mount() {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  const host = document.body.appendChild(document.createElement('div')); const root = createRoot(host)
  act(() => root.render(h(AttackExplorer)))
  const tabs = [...host.querySelectorAll<HTMLButtonElement>('[role="tab"]')]
  const shown = () => [...host.querySelectorAll<HTMLElement>('[role="tabpanel"]')].filter((p) => !p.hidden)
  return { host, root, tabs, shown }
}

test('server markup: h2, four tabs, every panel rendered with the reel-stats numbers and honest eclipse copy', () => {
  const m = r(h(AttackExplorer)); const doc = new DOMParser().parseFromString(m, 'text/html')
  expect(m).toMatch(/^<section[^>]*data-reveal=""/)
  expect(doc.querySelector('h2')?.textContent).toBe('Break the mesh on purpose.')
  expect([...doc.querySelectorAll('[role="tab"]')].map((t) => t.textContent)).toEqual(['Sybil', 'Eclipse', 'Partition', 'Healthy'])
  expect(doc.querySelectorAll('[role="tabpanel"]').length).toBe(4); expect(doc.querySelectorAll('[role="tabpanel"][hidden]').length).toBe(3)
  for (const s of [`T+${stats.firstScorePruneAt} s`, `Sybils grafted at T+${stats.sybilAt} s`, '−0.25', stats.eclipseTarget, `${stats.healedInS} s`, `${stats.deliveryPct} %`, `${stats.avgHops}`, `${stats.avgPropagationMs} ms`]) expect(m).toContain(s)
  expect(m).toContain(ECLIPSE_WHY)
  for (const href of ['/reels/sybil-eclipse/', '/reels/partition-heal/', '/reels/healthy-publish/', '/sim/']) expect(m).toContain(`href="${href}"`)
  expect(doc.querySelectorAll('svg[role="img"][aria-label]').length).toBe(4)
})

test('WAI-ARIA tabs: one tab stop, arrows wrap, Home and End jump, focus follows, the panel follows', () => {
  const { root, tabs, shown } = mount()
  const sel = () => tabs.findIndex((t) => t.getAttribute('aria-selected') === 'true')
  expect(sel()).toBe(0); expect(tabs.map((t) => t.tabIndex)).toEqual([0, -1, -1, -1])
  const key = (k: string) => act(() => { document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true })) })
  tabs[0].focus()
  key('ArrowRight'); expect(sel()).toBe(1); expect(document.activeElement).toBe(tabs[1])
  expect(shown()).toHaveLength(1); expect(shown()[0].getAttribute('aria-labelledby')).toBe(tabs[1].id); expect(tabs[1].getAttribute('aria-controls')).toBe(shown()[0].id)
  key('ArrowLeft'); key('ArrowLeft'); expect(sel()).toBe(3); expect(document.activeElement).toBe(tabs[3])
  key('Home'); expect(sel()).toBe(0); key('End'); expect(sel()).toBe(3)
  expect(shown()[0].textContent).toContain(`${stats.avgPropagationMs} ms`)
  act(() => tabs[2].click()); expect(sel()).toBe(2); expect(shown()[0].textContent).toContain('partition')
  act(() => root.unmount())
})

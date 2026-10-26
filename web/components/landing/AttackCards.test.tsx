import { createElement as h } from 'react'
import { renderToStaticMarkup as r } from 'react-dom/server'
import { expect, test } from 'vitest'
import stats from '@/lib/reel-stats.json'
import AttackCards, { CARDS } from './AttackCards'

const doc = () => new DOMParser().parseFromString(r(h(AttackCards)), 'text/html')

test('section keeps id="attacks" for the nav and holds three titled article cards', () => {
  const d = doc()
  expect(d.querySelector('section')!.id).toBe('attacks')
  const cards = [...d.querySelectorAll('article')]
  expect(cards).toHaveLength(3)
  for (const a of cards) expect(d.getElementById(a.getAttribute('aria-labelledby')!)!.tagName).toBe('H3')
  expect([...d.querySelectorAll('article [class*="tag"]')].map(e => e.textContent)).toEqual(['01 / Sybil', '02 / Eclipse', '03 / Partition'])
})

test('dither headers: rays, rings, split; flame only on the attacking part', () => {
  expect(CARDS.map(c => c.preset)).toEqual(['rays', 'rings', 'split'])
  // Sybil rays and eclipse rings are the attackers (body flame, honest centre paper); the partition cut is the accent
  expect(CARDS.map(c => [c.tint, c.accent])).toEqual([['flame', 'paper'], ['flame', 'paper'], ['signal', 'flame']])
  for (const c of [...doc().querySelectorAll('article canvas')]) expect(c.getAttribute('aria-label')).toBeTruthy()
})

test('numbers come from the recordings', () => {
  const t = doc().body.textContent!
  for (const v of [`T+${stats.sybilAt} s`, `T+${stats.eclipseAt} s`, `T+${stats.partition.splitAt} s`, stats.eclipseTarget, `${stats.healedInS} s`, `${stats.partition.cutDeliveryPct}%`, `${stats.partition.healedInS} s`]) expect(t).toContain(v)
  expect(CARDS[0].facts.map(f => f[0])).toEqual([String(stats.sybils), String(stats.heartbeatsToPrune), `${stats.deliveryPct}%`])
})

test('each card ends in one full-width CTA bar into its recording; the eclipse bar seeks to the eclipse', () => {
  const links = [...doc().querySelectorAll('article a')].map(a => a.getAttribute('href'))
  expect(links).toEqual(['/reels/sybil-eclipse/', `/reels/sybil-eclipse/?t=${stats.eclipseAt}`, '/reels/partition-heal/'])
  expect(r(h(AttackCards))).not.toMatch(/make |git clone|curl|<code|<button/)
})

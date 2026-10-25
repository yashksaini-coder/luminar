import { test, expect } from 'vitest'
import { actionForKey, isTypingTarget, KEY_BINDINGS, KBD_HINT } from '@/lib/keys'
const ev = (key: string, extra: Partial<Pick<KeyboardEvent, 'ctrlKey' | 'metaKey' | 'altKey'>> = {}, tag = 'div', type = '') => {
  const target = document.createElement(tag); if (type) (target as HTMLInputElement).type = type
  return { key, ctrlKey: false, metaKey: false, altKey: false, target, ...extra }
}
test('every spec shortcut maps to its action', () => {
  expect(actionForKey(ev(' '))).toEqual({ action: 'togglePlay' })
  expect(actionForKey(ev('f'))).toEqual({ action: 'fitView' })
  expect(actionForKey(ev('Escape'))).toEqual({ action: 'escape' })
  expect(actionForKey(ev('3'))).toEqual({ action: 'reel', arg: 2 })
  expect(actionForKey(ev('9'))).toEqual({ action: 'reel', arg: 8 })
  expect(actionForKey(ev('0'))).toEqual({ action: 'backToLive' })
  for (const [k, a] of [['s', 'share'], ['t', 'toggleStage'], ['h', 'toggleHero'], ['r', 'reset'], ['?', 'toggleKeyHelp']] as const) expect(actionForKey(ev(k))).toEqual({ action: a })
  expect(actionForKey(ev('F'))).toBeNull()   // case-sensitive lowercase, as today
})
test('modifiers and typing targets are ignored; range input is not', () => {
  expect(actionForKey(ev('f', { ctrlKey: true }))).toBeNull(); expect(actionForKey(ev('h', { metaKey: true }))).toBeNull(); expect(actionForKey(ev('1', { altKey: true }))).toBeNull()
  expect(actionForKey(ev('f', {}, 'input', 'text'))).toBeNull(); expect(actionForKey(ev('f', {}, 'textarea'))).toBeNull(); expect(actionForKey(ev('f', {}, 'select'))).toBeNull()
  expect(actionForKey(ev(' ', {}, 'input', 'range'))).toEqual({ action: 'togglePlay' })
  const ce = document.createElement('div'); ce.setAttribute('contenteditable', 'true'); expect(isTypingTarget(ce)).toBe(true)
  expect(isTypingTarget(null)).toBe(false)
})
test('KEY_BINDINGS lists 18 rows and KBD_HINT is verbatim', () => {
  expect(KEY_BINDINGS).toHaveLength(18)
  expect(KEY_BINDINGS.filter(b => b.action === 'reel').map(b => b.arg)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8])
  expect(KBD_HINT).toBe('SPACE play · F fit · T stage · H hero · ? keys')
})

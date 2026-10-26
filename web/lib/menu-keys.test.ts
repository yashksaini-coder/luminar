import { expect, test } from 'vitest'
import { nextMenuIndex } from '@/lib/menu-keys'
test('arrow keys wrap, Home/End jump, other keys return null', () => {
  expect(nextMenuIndex(0, 'ArrowDown', 3)).toBe(1); expect(nextMenuIndex(2, 'ArrowDown', 3)).toBe(0)
  expect(nextMenuIndex(0, 'ArrowUp', 3)).toBe(2); expect(nextMenuIndex(1, 'Home', 3)).toBe(0); expect(nextMenuIndex(1, 'End', 3)).toBe(2)
  expect(nextMenuIndex(1, 'Enter', 3)).toBeNull(); expect(nextMenuIndex(0, 'ArrowDown', 0)).toBeNull()
})

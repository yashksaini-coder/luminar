import { describe, expect, it } from 'vitest'
import { inertExcept } from './SimApp'

describe('inertExcept', () => {
  it('makes every shell child but the open drawer and scrim inert, and restores on cleanup', () => {
    const shell = document.createElement('div')
    shell.innerHTML = '<header></header><aside id="l"></aside><main></main><button aria-label="Close panel"></button><aside id="r"></aside><section></section>'
    const open = shell.querySelector<HTMLElement>('#l')!
    const restore = inertExcept(shell, open)
    const inert = [...shell.children].filter(el => el.hasAttribute('inert')).map(el => el.id || el.tagName)
    expect(inert).toEqual(['HEADER', 'MAIN', 'r', 'SECTION'])
    restore()
    expect(shell.querySelectorAll('[inert]')).toHaveLength(0)
  })
})

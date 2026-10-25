import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useStore } from '@/lib/store'
import { snapWith } from '@/lib/fixtures'
import SimApp, { inertExcept } from './SimApp'

vi.mock('next/dynamic', () => ({ default: () => () => <canvas /> }))
vi.mock('@/lib/actions', async importOriginal => ({
  ...await importOriginal<typeof import('@/lib/actions')>(),
  bootSim: () => Promise.resolve(), initAutoGeo: () => () => {}, initUrlMoment: () => () => {}, teardownSim: () => {},
}))
vi.mock('@/lib/prefs', () => ({ initPrefs: () => () => {} }))

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

describe('drawer at narrow widths (D10)', () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  let root: Root, host: HTMLDivElement
  beforeEach(() => {
    useStore.setState(useStore.getInitialState(), true)
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('max-width'), media: q, addEventListener() {}, removeEventListener() {} }))
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })   // the inspector sparkline measures its host
    host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host)
    act(() => root.render(<SimApp />))
  })
  afterEach(() => { act(() => root.unmount()); host.remove(); vi.unstubAllGlobals() })

  it('selecting a peer while the Log drawer is open closes the drawer and lifts inert from the inspector', () => {
    const logBtn = [...host.querySelectorAll('button')].find(b => b.textContent === 'Log')!
    expect(logBtn.getAttribute('aria-controls')).toBe('rail-log')
    act(() => logBtn.click())
    const rail = host.querySelector('#rail-log')!
    expect(rail.getAttribute('data-open')).toBe('true')
    const inspectorWrap = rail.nextElementSibling!   // the hero-hide wrapper around <Inspector/>
    expect(inspectorWrap.hasAttribute('inert')).toBe(true)
    act(() => { useStore.getState().applySnapshot(snapWith(['peer-0'])); useStore.getState().selectPeer('peer-0') })
    expect(rail.hasAttribute('data-open')).toBe(false)
    expect(inspectorWrap.hasAttribute('inert')).toBe(false)
  })
})

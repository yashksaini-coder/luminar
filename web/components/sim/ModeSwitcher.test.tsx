import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, test } from 'vitest'
import ModeSwitcher, { GEO_DISABLED } from '@/components/sim/ModeSwitcher'
import { useStore } from '@/lib/store'

// R3: the switcher reads the store, so it mounts with createRoot + act (static markup would render the initial state)
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
let root: Root, host: HTMLDivElement
beforeEach(() => {
  useStore.setState(useStore.getInitialState(), true)
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host)
  act(() => root.render(<ModeSwitcher />))
})
afterEach(() => { act(() => root.unmount()); host.remove() })
const buttons = () => [...host.querySelectorAll('button')]
const pressed = () => buttons().filter(b => b.getAttribute('aria-pressed') === 'true').map(b => b.textContent)

test('three tabs, aria-pressed follows layoutMode, Geo disabled with reason until geoAvailable', () => {
  expect(buttons().map(b => b.textContent)).toEqual(['FORCE', 'RADIAL', 'GEO'])
  expect(pressed()).toEqual(['FORCE'])
  const geo = buttons()[2]; expect(geo.getAttribute('aria-disabled')).toBe('true'); expect(geo.disabled).toBe(false); expect(geo.title).toBe(GEO_DISABLED); expect(GEO_DISABLED).toBe('Geo needs real observers · turn MAINNET on')
  act(() => useStore.setState({ geoAvailable: true, layoutMode: 'radial' }))
  expect(buttons()[2].hasAttribute('aria-disabled')).toBe(false); expect(buttons()[2].hasAttribute('title')).toBe(false); expect(pressed()).toEqual(['RADIAL'])
  const group = host.querySelector('[role="group"]')!; expect(group.getAttribute('aria-label')).toBe('Layout')
})
test('a click writes layoutMode through setLayoutMode and clears the remembered layout (R9)', () => {
  act(() => useStore.setState({ geoAvailable: true, layoutMode: 'geo', layoutBeforeGeo: 'radial' }))
  act(() => buttons()[0].click())
  expect(useStore.getState().layoutMode).toBe('force'); expect(useStore.getState().layoutBeforeGeo).toBeNull()
})
test('when real nodes vanish in Geo, the previous layout comes back', () => {
  act(() => useStore.setState({ geoAvailable: true, layoutMode: 'geo', layoutBeforeGeo: 'radial' }))
  act(() => useStore.setState({ geoAvailable: false }))
  expect(useStore.getState().layoutMode).toBe('radial'); expect(pressed()).toEqual(['RADIAL'])
})
// T8: with MAINNET off a GEO tap pushes the reason as an info toast and leaves the layout alone.
test('GEO click while unavailable pushes a toast and does not change layoutMode', () => {
  act(() => buttons()[2].click())
  expect(useStore.getState().layoutMode).toBe('force'); expect(pressed()).toEqual(['FORCE'])
  expect(useStore.getState().toasts.map(t => [t.text, t.kind])).toEqual([[GEO_DISABLED, 'info']])
})

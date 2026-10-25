import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, test } from 'vitest'
import CommandStrip from '@/components/sim/CommandStrip'
import { useStore } from '@/lib/store'

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
let root: Root, host: HTMLDivElement
beforeEach(() => {
  useStore.setState(useStore.getInitialState(), true)
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host)
  act(() => root.render(<CommandStrip manifest={[]} drawer={null} onDrawer={() => {}} />))
})
afterEach(() => { act(() => root.unmount()); host.remove() })

test('Stats and Log drawer buttons hide under hero, since hero hides the rails they open', () => {
  const drawerBtns = [...host.querySelectorAll('button')].filter(b => ['Stats', 'Log'].includes(b.textContent!))
  expect(drawerBtns).toHaveLength(2)
  for (const b of drawerBtns) expect(b.hasAttribute('data-hero-hide')).toBe(true)
})

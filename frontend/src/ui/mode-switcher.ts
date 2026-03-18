import { store } from '../store'
import type { LayoutMode } from '../types'

export function initModeSwitcher(onLayoutChange: () => void) {
  const tabs = document.querySelectorAll<HTMLButtonElement>('.mode-tab')

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const mode = tab.dataset.mode as LayoutMode
      if (mode === store.layoutMode) return

      // Update active tab
      tabs.forEach(t => t.classList.remove('active'))
      tab.classList.add('active')

      store.layoutMode = mode
      onLayoutChange()
    })
  })
}

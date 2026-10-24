import { store } from '../store'
import type { LayoutMode } from '../types'

/** Tabs only report the pick; app.setLayoutMode is the single writer of store.layoutMode and `.active`. */
export function initModeSwitcher(onLayoutChange: (mode: LayoutMode) => void) {
  document.querySelectorAll<HTMLButtonElement>('.mode-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const mode = tab.dataset.mode as LayoutMode
      if (mode !== store.layoutMode && !tab.disabled) onLayoutChange(mode)
    })
  })
}

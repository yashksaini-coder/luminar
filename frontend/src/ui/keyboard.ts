import { togglePlay } from './playback'
import { store } from '../store'

export function initKeyboard() {
  document.addEventListener('keydown', (e: KeyboardEvent) => {
    const tag = (e.target as HTMLElement).tagName
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return

    switch (e.key) {
      case ' ':
        e.preventDefault()
        togglePlay()
        break
      case 'f':
        // fitView will be called by the app when renderer is available
        document.dispatchEvent(new CustomEvent('luminar:fitview'))
        break
      case 'Escape':
        store.selectedNode = -1
        document.dispatchEvent(new CustomEvent('luminar:render'))
        break
    }
  })
}

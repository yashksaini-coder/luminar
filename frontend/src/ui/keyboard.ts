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
      case '1': case '2': case '3':
        document.dispatchEvent(new CustomEvent('luminar:reel', { detail: Number(e.key) - 1 }))
        break
      case '0':
        document.dispatchEvent(new CustomEvent('luminar:reel', { detail: -1 }))  // back to live
        break
      case 't':
        document.dispatchEvent(new CustomEvent('luminar:pref', { detail: 'stageTheme' }))
        break
      case 'h':
        document.dispatchEvent(new CustomEvent('luminar:pref', { detail: 'hero' }))
        break
    }
  })
}

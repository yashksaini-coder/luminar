import { togglePlay } from './playback'
import { store } from '../store'

export function initKeyboard() {
  document.addEventListener('keydown', (e: KeyboardEvent) => {
    const t = e.target as HTMLElement
    // The timeline range slider keeps focus after a scrub; it is not a text field.
    if (t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || (t.tagName === 'INPUT' && (t as HTMLInputElement).type !== 'range')) return
    if (e.ctrlKey || e.metaKey || e.altKey) return  // browser chords (Ctrl+1, Cmd+H, ...) are not app keys

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
        store.highlightPeers = []
        document.dispatchEvent(new CustomEvent('luminar:render'))
        break
      case '1': case '2': case '3':
        document.dispatchEvent(new CustomEvent('luminar:reel', { detail: Number(e.key) - 1 }))
        break
      case '0':
        document.dispatchEvent(new CustomEvent('luminar:reel', { detail: -1 }))  // back to live
        break
      case 's':
        document.dispatchEvent(new CustomEvent('luminar:share'))
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

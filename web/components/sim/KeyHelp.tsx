'use client'

import { KEY_BINDINGS } from '@/lib/keys'
import { useStore } from '@/lib/store'
import styles from './KeyHelp.module.css'
import Overlay from './Overlay'

const display = (k: string) => (k === ' ' ? 'Space' : k === 'Escape' ? 'Esc' : k.toUpperCase())

// The nine reel bindings collapse into one `1–9` row, in place of the first.
const rows = KEY_BINDINGS.flatMap(b => {
  if (b.action !== 'reel') return [{ keys: <kbd>{display(b.key)}</kbd>, label: b.label }]
  return b.arg === 0 ? [{ keys: <><kbd>1</kbd>–<kbd>9</kbd></>, label: 'open recording N' }] : []
})

export default function KeyHelp() {
  const open = useStore(s => s.keyHelpOpen)
  const setKeyHelp = useStore(s => s.setKeyHelp)
  return (
    <Overlay open={open} onClose={() => setKeyHelp(false)} title="Keyboard shortcuts">
      <div className={styles.panel}>
        <h2 className={styles.title}>Keyboard shortcuts</h2>
        <dl className={styles.list}>
          {rows.map(r => (
            <div key={r.label} data-row="" className={styles.row}>
              <dt>{r.keys}</dt><dd>{r.label}</dd>
            </div>
          ))}
          <div data-row="" className={styles.row}>
            <dt><kbd>↑</kbd><kbd>↓</kbd></dt><dd>move in menus</dd>
          </div>
          <div data-row="" className={styles.row}>
            <dt><kbd>Enter</kbd></dt><dd>choose · <kbd>Esc</kbd> close</dd>
          </div>
        </dl>
        <p className={styles.foot}>press ? or Esc to close</p>
      </div>
    </Overlay>
  )
}

export type KeyAction =
  | 'togglePlay' | 'fitView' | 'escape' | 'reel' | 'backToLive' | 'share'
  | 'toggleStage' | 'toggleHero' | 'reset' | 'toggleKeyHelp'

export interface KeyBinding { key: string; action: KeyAction; label: string; arg?: number }

export const KEY_BINDINGS: readonly KeyBinding[] = [
  { key: ' ', action: 'togglePlay', label: 'play / pause' },
  { key: 'f', action: 'fitView', label: 'fit view' },
  { key: 'Escape', action: 'escape', label: 'deselect / close' },
  ...Array.from({ length: 9 }, (_, i): KeyBinding => (
    { key: String(i + 1), action: 'reel', label: `open recording ${i + 1}`, arg: i }
  )),
  { key: '0', action: 'backToLive', label: 'back to live' },
  { key: 's', action: 'share', label: 'copy link to this moment' },
  { key: 't', action: 'toggleStage', label: 'stage theme' },
  { key: 'h', action: 'toggleHero', label: 'hero layout' },
  { key: 'r', action: 'reset', label: 'reset' },
  { key: '?', action: 'toggleKeyHelp', label: 'this list' },
]

export const KBD_HINT = 'SPACE play · F fit · T stage · H hero · ? keys'

export function isTypingTarget(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false
  if (t.tagName === 'TEXTAREA' || t.tagName === 'SELECT') return true
  // jsdom has no isContentEditable; the attribute check covers it there.
  if (t.isContentEditable || t.closest('[contenteditable]:not([contenteditable="false"])')) return true
  return t.tagName === 'INPUT' && (t as HTMLInputElement).type !== 'range'
}

// Shift is allowed: '?' needs it.
export function actionForKey(
  e: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'altKey' | 'target'>,
): { action: KeyAction; arg?: number } | null {
  if (e.ctrlKey || e.metaKey || e.altKey || isTypingTarget(e.target)) return null
  const b = KEY_BINDINGS.find((k) => k.key === e.key)
  if (!b) return null
  return b.arg === undefined ? { action: b.action } : { action: b.action, arg: b.arg }
}

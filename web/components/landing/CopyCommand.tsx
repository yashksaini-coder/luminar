'use client'
// A copy button for a shell command: writes `text` to the clipboard and says so for 1.5 s, in the label
// and in a polite live region. Without a clipboard (http on a LAN, permission denied) it says "copy failed"
// so the reader knows to select the text by hand. Styling comes from the caller (className, data-state).
import { useEffect, useRef, useState } from 'react'

export const COPIED_MS = 1500
type State = 'idle' | 'copied' | 'failed'
const LABEL: Record<State, string> = { idle: 'copy', copied: 'copied', failed: 'copy failed' }

export default function CopyCommand({ text, label, className }: { text: string; label: string; className?: string }) {
  const [state, setState] = useState<State>('idle')
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])
  const copy = async () => {
    let next: State = 'copied'
    try {
      if (!navigator.clipboard?.writeText) throw new Error('no clipboard')
      await navigator.clipboard.writeText(text)
    } catch { next = 'failed' }
    setState(next)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setState('idle'), COPIED_MS)
  }
  return (<>
    <button type="button" className={className} data-state={state} aria-label={label} onClick={copy}>{LABEL[state]}</button>
    <span className="sr-only" role="status" aria-live="polite">{state === 'idle' ? '' : LABEL[state]}</span>
  </>)
}

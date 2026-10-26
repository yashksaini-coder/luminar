'use client'

import { type KeyboardEvent, type ReactNode, useEffect, useRef } from 'react'
import styles from './Overlay.module.css'

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'

// Full-screen dialog primitive: focus trap, Escape, backdrop click, staggered [data-row] rise (A.28).
export default function Overlay({ open, onClose, title, children, className }: {
  open: boolean; onClose: () => void; title: string; children: ReactNode; className?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const opener = document.activeElement as HTMLElement | null
    const el = ref.current
    el?.querySelectorAll<HTMLElement>('[data-row]').forEach((r, i) => {
      r.style.animationDelay = `calc(var(--stagger) * ${i})`
    })
    el?.querySelector<HTMLElement>(FOCUSABLE)?.focus()
    return () => opener?.focus?.()
  }, [open])
  if (!open) return null

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.stopPropagation()   // like R16: Escape closes the overlay and nothing else
      onClose()
      return
    }
    if (e.key !== 'Tab') return
    const f = Array.from(ref.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])
    if (!f.length) return
    const first = f[0], last = f[f.length - 1]
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
  }

  return (
    <div
      ref={ref}
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className={className ? `${styles.overlay} ${className}` : styles.overlay}
      onKeyDown={onKeyDown}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <button type="button" aria-label="Close" className={styles.close} onClick={onClose}>×</button>
      {children}
    </div>
  )
}

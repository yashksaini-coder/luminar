'use client'

import { useEffect } from 'react'
import { useStore } from '@/lib/store'
import type { Toast as ToastT } from '@/lib/types'
import styles from './Toasts.module.css'

export const TOAST_MS = 2000

function Toast({ t }: { t: ToastT }) {
  useEffect(() => {
    const id = setTimeout(() => useStore.getState().dismissToast(t.id), TOAST_MS)
    return () => clearTimeout(id)
  }, [t.id])
  return <div data-kind={t.kind} className={styles.toast}>{t.text}</div>
}

export default function Toasts() {
  const toasts = useStore(s => s.toasts)
  return (
    <div role="status" aria-live="polite" className={styles.stack}>
      {toasts.map(t => <Toast key={t.id} t={t} />)}
    </div>
  )
}

// The page grid (Axiom reference): two hairline rails at the frame edges running the full page height,
// and any descendant with [data-grid] becomes a row: a full-bleed top hairline with a `+` registration
// mark where it crosses each rail. CSS only; every mark is aria-hidden by being a pseudo-element.
import type { ReactNode } from 'react'
import styles from './GridFrame.module.css'

export default function GridFrame({ children }: { children: ReactNode }) {
  return (
    <div className={styles.frame}>
      <span className={styles.rails} aria-hidden="true" />
      {children}
    </div>
  )
}

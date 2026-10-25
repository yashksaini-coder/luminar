import type { Metadata } from 'next'
import { Suspense } from 'react'
import FigureRoute from './FigureRoute'

export const metadata: Metadata = { title: 'Fig. 2' }   // R15: the layout template appends the brand

export default function FigurePage() {
  return (
    <div style={{ background: '#f4f1e8', minHeight: '100dvh' }}>
      <Suspense fallback={null}><FigureRoute /></Suspense>
    </div>
  )
}

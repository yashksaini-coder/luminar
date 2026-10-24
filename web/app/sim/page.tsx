import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Simulator' }

export default function SimPage() {
  return (
    <main style={{ padding: 'var(--gutter, 16px)' }}>
      <p className="t-ui">
        LUMINAR <span className="t-label">gossipsub v1.1</span>
      </p>
      <h1 className="t-display">
        Fifty peers, <em>five Sybils grafted at once.</em>
      </h1>
      <p className="num">T+ 12.3s · /sim/</p>
    </main>
  )
}

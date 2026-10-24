import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: { default: 'Luminar', template: '%s · Luminar' },
  description: 'Real-time GossipSub v1.1 simulator',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark">
      <body>{children}</body>
    </html>
  )
}

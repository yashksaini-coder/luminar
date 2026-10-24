import './globals.css'
import type { Metadata } from 'next'
import localFont from 'next/font/local'

const display = localFont({
  src: [
    { path: '../public/fonts/instrument-serif-latin-400-normal.woff2', weight: '400', style: 'normal' },
    { path: '../public/fonts/instrument-serif-latin-400-italic.woff2', weight: '400', style: 'italic' },
  ],
  display: 'swap',
})

const mono = localFont({
  src: [
    { path: '../public/fonts/ibm-plex-mono-latin-400-normal.woff2', weight: '400', style: 'normal' },
    { path: '../public/fonts/ibm-plex-mono-latin-500-normal.woff2', weight: '500', style: 'normal' },
    { path: '../public/fonts/ibm-plex-mono-latin-600-normal.woff2', weight: '600', style: 'normal' },
  ],
  display: 'swap',
})

const ui = localFont({
  src: '../public/fonts/manrope-latin-wght-normal.woff2',
  weight: '200 800',
  display: 'swap',
})

export const metadata: Metadata = {
  title: { default: 'Luminar', template: '%s · Luminar' },
  description: 'Real-time GossipSub v1.1 simulator',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      data-theme="dark"
      style={
        {
          '--font-display': display.style.fontFamily,
          '--font-mono': mono.style.fontFamily,
          '--font-ui': ui.style.fontFamily,
        } as React.CSSProperties
      }
    >
      <body>{children}</body>
    </html>
  )
}

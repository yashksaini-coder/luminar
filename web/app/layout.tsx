import './globals.css'
import type { Metadata, Viewport } from 'next'
import localFont from 'next/font/local'
import Reveal from '@/components/Reveal'

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

const DESCRIPTION = 'GossipSub v1.1 peer scoring you can watch bite: fifty peers, five Sybils, pruned in two heartbeats.'

export const metadata: Metadata = {
  // NEXT_PUBLIC_SITE_URL is the deploy origin (land-05); without it og:image resolves against localhost.
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'),   // `||`: an empty value (web/.env.example copied as is) is not a URL
  title: { default: 'Luminar', template: '%s · Luminar' },
  description: 'Real-time GossipSub v1.1 simulator',
  openGraph: { title: 'Luminar', description: DESCRIPTION, images: ['/video/poster.png'] },
  twitter: { card: 'summary_large_image' },
}

export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover' }

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      suppressHydrationWarning
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
      <head>
        {/* data-js gates the reveal's hidden state (globals.css): no JS, no hidden sections. Runs before paint.
            The landing hero (the LCP element) reveals as soon as the document is parsed, without waiting for hydration. */}
        <script dangerouslySetInnerHTML={{ __html: "document.documentElement.dataset.js='1';document.addEventListener('DOMContentLoaded',function(){var s=document.querySelector('[data-hero-reveal]');if(s){s.offsetWidth;s.dataset.in='1'}})" }} />
      </head>
      <body>
        {children}
        <Reveal />
      </body>
    </html>
  )
}

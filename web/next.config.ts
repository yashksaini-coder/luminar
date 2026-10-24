import type { NextConfig } from 'next'
import { PHASE_DEVELOPMENT_SERVER } from 'next/constants'

const config = (phase: string): NextConfig => ({
  output: 'export',
  trailingSlash: true,
  images: { unoptimized: true },
  ...(phase === PHASE_DEVELOPMENT_SERVER && {
    rewrites: async () => [
      { source: '/api/:path*', destination: 'http://localhost:8000/api/:path*' },
    ],
  }),
})

export default config

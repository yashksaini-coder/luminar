// The reel manifest, bundled at build time: one source for the reel pages, the redirect, keys 1–9 and the landing Nav (A.29).
import manifest from '@/public/reels/manifest.json'
import type { ReelManifest } from './types'

export const REEL_MANIFEST: ReelManifest = manifest

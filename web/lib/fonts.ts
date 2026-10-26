/** Font family names as the browser registered them (next/font/local), for canvas text that cannot use CSS vars. */

/** First family of the computed --font-mono on <html>; '"IBM Plex Mono"' when unset (R18, R27: never a literal hashed name). */
export function monoFamily(): string {
  return getComputedStyle(document.documentElement).getPropertyValue('--font-mono').split(',')[0].trim() || '"IBM Plex Mono"'
}

declare module 'culori' {
  export function oklch(color: { mode: 'oklch'; l: number; c: number; h: number }): unknown
  export function formatRgb(color: unknown): string
}

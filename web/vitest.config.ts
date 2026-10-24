import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['**/*.test.{ts,tsx}'],
    exclude: ['**/node_modules/**', 'out/**', '.next/**'],
  },
  oxc: { jsx: { runtime: 'automatic' } },
  resolve: { alias: { '@': __dirname } },
})

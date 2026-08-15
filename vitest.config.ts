import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { tanstackAliases, tanstackSubpathPlugin } from './vitest.aliases.ts'

export default defineConfig({
  plugins: [tanstackSubpathPlugin(), react()],
  resolve: {
    alias: tanstackAliases,
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup-tests.ts'],
    include: ['packages/*/tests/**/*.{test,spec}.{ts,tsx}', 'tests/**/*.{test,spec}.{ts,tsx}'],
    exclude: [
      'tests/tanstack/**',
      'tests/tanstack-core/**',
      'tests/tanstack-history/**',
      'node_modules/**',
    ],
    benchmark: {
      include: ['benches/**/*.{bench,bench.ts,bench.tsx}', 'benches/**/*.bench.{ts,tsx}'],
    },
  },
})

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
    include: [
      'tests/tanstack/**/*.{test,spec}.{ts,tsx}',
      'tests/tanstack-core/**/*.{test,spec}.{ts,tsx}',
      'tests/tanstack-history/**/*.{test,spec}.{ts,tsx}',
    ],
    exclude: [],
    testTimeout: 15000,
  },
})

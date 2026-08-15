import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const root = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      { find: '@tanstack/router-core/path', replacement: resolve(root, 'packages/router-core/src/path.ts') },
      { find: '@tanstack/router-core/qss', replacement: resolve(root, 'packages/router-core/src/qss.ts') },
      { find: '@tanstack/router-core/utils', replacement: resolve(root, 'packages/router-core/src/utils.ts') },
      { find: '@tanstack/router-core/lru-cache', replacement: resolve(root, 'packages/router-core/src/lru-cache.ts') },
      { find: '@tanstack/router-core/new-process-route-tree', replacement: resolve(root, 'packages/router-core/src/match.ts') },
      { find: '@tanstack/router-core/isServer', replacement: resolve(root, 'packages/router-core/src/isServer.ts') },
      { find: '@anonrig/router-core/path', replacement: resolve(root, 'packages/router-core/src/path.ts') },
      { find: '@anonrig/router-core/qss', replacement: resolve(root, 'packages/router-core/src/qss.ts') },
      { find: '@anonrig/router-core/isServer', replacement: resolve(root, 'packages/router-core/src/isServer.ts') },
      { find: '@anonrig/history', replacement: resolve(root, 'packages/history/src/index.ts') },
      { find: '@anonrig/router-core', replacement: resolve(root, 'packages/router-core/src/index.ts') },
      { find: '@anonrig/react-router', replacement: resolve(root, 'packages/react-router/src/index.ts') },
      { find: '@tanstack/history', replacement: resolve(root, 'packages/history/src/index.ts') },
      { find: '@tanstack/router-core', replacement: resolve(root, 'packages/router-core/src/index.ts') },
      { find: '@tanstack/react-router', replacement: resolve(root, 'packages/react-router/src/index.ts') },
    ],
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setupTests.ts'],
    include: [
      'packages/*/tests/**/*.{test,spec}.{ts,tsx}',
      'tests/**/*.{test,spec}.{ts,tsx}',
    ],
    exclude: [
      'tests/tanstack/**',
      'tests/tanstack-core/**',
      'node_modules/**',
    ],
    benchmark: {
      include: ['benches/**/*.bench.ts'],
    },
  },
})

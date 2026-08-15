import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const root = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      {
        find: '@tanstack/router-core/path',
        replacement: resolve(root, 'packages/router-core/src/path.ts'),
      },
      {
        find: '@tanstack/router-core/qss',
        replacement: resolve(root, 'packages/router-core/src/qss.ts'),
      },
      {
        find: '@tanstack/router-core/utils',
        replacement: resolve(root, 'packages/router-core/src/utils.ts'),
      },
      {
        find: '@tanstack/router-core/lru-cache',
        replacement: resolve(root, 'packages/router-core/src/lru-cache.ts'),
      },
      {
        find: '@tanstack/router-core/new-process-route-tree',
        replacement: resolve(root, 'packages/router-core/src/match.ts'),
      },
      {
        find: '@tanstack/router-core/isServer',
        replacement: resolve(root, 'packages/router-core/src/is-server.ts'),
      },
      {
        find: '@tanstack/router-core/ssr/server',
        replacement: resolve(root, 'packages/router-core/src/ssr/server.ts'),
      },
      {
        find: '@tanstack/router-core/ssr/client',
        replacement: resolve(root, 'packages/router-core/src/ssr/client.ts'),
      },
      {
        find: '@tanstack/router-core/ssr/ssr-match-id',
        replacement: resolve(root, 'packages/router-core/src/ssr/ssr-match-id.ts'),
      },
      {
        find: '@tanstack/react-router/ssr/renderRouterToStream',
        replacement: resolve(root, 'packages/react-router/src/ssr/render-router-to-stream.tsx'),
      },
      {
        find: '@anonrig/router-core/ssr/server',
        replacement: resolve(root, 'packages/router-core/src/ssr/server.ts'),
      },
      {
        find: '@anonrig/router-core/ssr/client',
        replacement: resolve(root, 'packages/router-core/src/ssr/client.ts'),
      },
      {
        find: '@anonrig/router-core/is-server',
        replacement: resolve(root, 'packages/router-core/src/is-server.ts'),
      },
      { find: '@anonrig/history', replacement: resolve(root, 'packages/history/src/index.ts') },
      {
        find: '@anonrig/router-core',
        replacement: resolve(root, 'packages/router-core/src/index.ts'),
      },
      {
        find: '@anonrig/react-router',
        replacement: resolve(root, 'packages/react-router/src/index.ts'),
      },
      { find: '@tanstack/history', replacement: resolve(root, 'packages/history/src/index.ts') },
      {
        find: '@tanstack/router-core',
        replacement: resolve(root, 'packages/router-core/src/index.ts'),
      },
      {
        find: '@tanstack/react-router',
        replacement: resolve(root, 'packages/react-router/src/index.ts'),
      },
      {
        find: '@tanstack/react-store',
        replacement: resolve(root, 'packages/react-router/src/react-store.ts'),
      },
    ],
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup-tests.ts'],
    include: [
      'tests/tanstack/**/*.{test,spec}.{ts,tsx}',
      'tests/tanstack-core/**/*.{test,spec}.{ts,tsx}',
    ],
    exclude: [],
    testTimeout: 15000,
  },
})

import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..')

// Resolve @anonrig/* to this repo. Leave @tanstack/* on the published packages
// so the same operations can be timed against official TanStack Router.
export default defineConfig({
  resolve: {
    alias: [
      { find: /^@anonrig\/history$/, replacement: resolve(repo, 'packages/history/src/index.ts') },
      {
        find: /^@anonrig\/router-core\/ssr\/server$/,
        replacement: resolve(repo, 'packages/router-core/src/ssr/server.ts'),
      },
      {
        find: /^@anonrig\/router-core\/ssr\/ssr-match-id$/,
        replacement: resolve(repo, 'packages/router-core/src/ssr/ssr-match-id.ts'),
      },
      {
        find: /^@anonrig\/router-core\/is-server$/,
        replacement: resolve(repo, 'packages/router-core/src/is-server.ts'),
      },
      {
        find: /^@anonrig\/router-core$/,
        replacement: resolve(repo, 'packages/router-core/src/index.ts'),
      },
    ],
  },
})

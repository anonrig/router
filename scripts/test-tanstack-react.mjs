import { spawnSync } from 'node:child_process'
import { globSync } from 'node:fs'

const batches = [
  [
    'tests/tanstack/link.test.tsx',
    'tests/tanstack/loaders.test.tsx',
    'tests/tanstack/navigate.test.tsx',
    'tests/tanstack/router.test.tsx',
    'tests/tanstack/route.test.tsx',
    'tests/tanstack/outlet.test.tsx',
    'tests/tanstack/parallel-routes.test.tsx',
    'tests/tanstack/matches.test.tsx',
    'tests/tanstack/not-found.test.tsx',
  ],
  [
    'tests/tanstack/optional-path-params.test.tsx',
    'tests/tanstack/error-component.test.tsx',
    'tests/tanstack/disable-global-catch-boundary.test.tsx',
    'tests/tanstack/store-updates-during-navigation.test.tsx',
    'tests/tanstack/redirect.test.tsx',
    'tests/tanstack/redirect-chain-first-load.test.tsx',
    'tests/tanstack/route-context.test.tsx',
    'tests/tanstack/search-middleware.test.tsx',
    'tests/tanstack/blocker.test.tsx',
    'tests/tanstack/use-blocker.test.tsx',
  ],
  [
    'tests/tanstack/use-location.test.tsx',
    'tests/tanstack/use-match.test.tsx',
    'tests/tanstack/use-navigate.test.tsx',
    'tests/tanstack/use-params.test.tsx',
    'tests/tanstack/use-can-go-back.test.tsx',
    'tests/tanstack/file-route.test.ts',
    'tests/tanstack/create-lazy-route.test.tsx',
    'tests/tanstack/client-only.test.tsx',
    'tests/tanstack/scripts.test.tsx',
  ],
  [
    'tests/tanstack/ancestor-loader-child-pending-min.test.tsx',
    'tests/tanstack/component-preload-retry-pending-min.test.tsx',
    'tests/tanstack/component-preload-retry.test.tsx',
    'tests/tanstack/hydration-capped-boundary-pending.test.tsx',
    'tests/tanstack/hydration-terminal-lane.test.tsx',
    'tests/tanstack/issue-2182-root-pending.test.tsx',
    'tests/tanstack/issue-2905-root-beforeload-pending.test.tsx',
    'tests/tanstack/issue-4467-lazy-route-pending.test.tsx',
    'tests/tanstack/issue-4476-react-query-cancellation.test.tsx',
    'tests/tanstack/issue-5778-router-provider-context-preload.test.tsx',
    'tests/tanstack/issue-6107-lazy-chunk-error-component.test.tsx',
    'tests/tanstack/issue-6371-search-default-normalization-abort.test.tsx',
    'tests/tanstack/issue-7051-force-pending-suspense.test.tsx',
    'tests/tanstack/issue-7367-pending-min-redirect.test.tsx',
    'tests/tanstack/issue-7635-error-head-after-navigation.test.tsx',
    'tests/tanstack/issue-7638-invalidate-transition-error.test.tsx',
    'tests/tanstack/issue-7964-param-parsing-loader.test.tsx',
    'tests/tanstack/issue-7986-retained-pending.test.tsx',
    'tests/tanstack/on-rendered-same-href-state.test.tsx',
    'tests/tanstack/pending-fallback-promise-replacement.test.tsx',
    'tests/tanstack/preloaded-mount-resolution.test.tsx',
    'tests/tanstack/public-presentation-lane-contract.test.tsx',
    'tests/tanstack/react-render-owner-contract.test.tsx',
    'tests/tanstack/render-router-to-stream.test.tsx',
    'tests/tanstack/root-pending-min.test.tsx',
    'tests/tanstack/router-client-stream-cleanup.test.tsx',
    'tests/tanstack/transactional-loading.test.tsx',
    'tests/tanstack/transitioner-listener-errors.test.tsx',
    'tests/tanstack/transitioner-remount.test.tsx',
    'tests/tanstack/transitioner-render-ack.test.tsx',
  ],
]

const discovered = globSync('tests/tanstack/**/*.{test,spec}.{ts,tsx}').sort()
const batched = new Set(batches.flat())
const missing = discovered.filter((file) => !batched.has(file))
const extra = [...batched].filter((file) => !discovered.includes(file))
if (missing.length || extra.length) {
  if (missing.length) console.error('React batches missing:', missing.join('\n'))
  if (extra.length) console.error('React batches extra:', extra.join('\n'))
  process.exit(1)
}

for (const files of batches) {
  const result = spawnSync(
    'pnpm',
    [
      'exec',
      'vitest',
      'run',
      '--config',
      'vitest.tanstack.config.ts',
      '--pool=forks',
      '--maxWorkers=1',
      ...files,
    ],
    {
      stdio: 'inherit',
      env: { ...process.env, NODE_OPTIONS: '--max-old-space-size=4096' },
    },
  )
  if (result.status) process.exit(result.status ?? 1)
}

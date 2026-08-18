/**
 * Full vendored TanStack suite. One Vitest process OOMs on the React files,
 * so this runs the same isolated batches as CI: history, core, then React.
 */
import { spawnSync } from 'node:child_process'

function run(label, script) {
  console.log(`\n==> ${label}\n`)
  const result = spawnSync('pnpm', [script], {
    stdio: 'inherit',
    env: { ...process.env, NODE_OPTIONS: '--max-old-space-size=4096' },
  })
  if (result.status) process.exit(result.status ?? 1)
}

run('TanStack history', 'test:tanstack-history')
run('TanStack core', 'test:tanstack-core:ci')
run('TanStack React', 'test:tanstack-react:ci')

/**
 * Head-to-head client bundle size: this repo vs published TanStack Router.
 *
 * Minified ESM via Vite 8 / Rolldown, production, React external.
 * Re-run with `pnpm size`.
 */
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { gzipSync } from 'node:zlib'
import { scriptStringPlugin, viteBundle } from './vite-bundle.ts'

const repo = resolve(import.meta.dirname, '..')

const reactExternals = ['react', 'react-dom', 'react/jsx-runtime', 'react/jsx-dev-runtime']

const oursAlias = {
  'fast-router-history': join(repo, 'packages/history/src/index.ts'),
  'fast-router-core': join(repo, 'packages/router-core/src/index.ts'),
  'fast-router-core/is-server': join(repo, 'packages/router-core/src/is-server.ts'),
  'fast-router': join(repo, 'packages/react-router/src/index.ts'),
}

const cases = [
  {
    name: 'fast-router client',
    filename: 'entry.tsx',
    ours: `export {
  Link,
  Outlet,
  RouterProvider,
  createRootRoute,
  createRoute,
  createRouter,
} from 'fast-router'
`,
    tanstack: `export {
  Link,
  Outlet,
  RouterProvider,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router'
`,
  },
  {
    name: 'fast-router-core client',
    filename: 'entry.ts',
    ours: `export { createRootRoute, createRoute, createRouter } from 'fast-router-core'
`,
    tanstack: `export { BaseRootRoute, BaseRoute, RouterCore } from '@tanstack/router-core'
`,
  },
] as const

type Sizes = { min: number; gzip: number }

async function bundle(
  source: string,
  filename: string,
  alias: Record<string, string>,
): Promise<Sizes> {
  const cache = join(repo, 'node_modules/.cache')
  await mkdir(cache, { recursive: true })
  const dir = await mkdtemp(join(cache, 'anonrig-size-'))
  try {
    const entry = join(dir, filename)
    await writeFile(entry, source)
    const result = await viteBundle({
      root: repo,
      entry,
      outDir: join(dir, 'out'),
      alias,
      external: reactExternals,
      minify: true,
      plugins: [scriptStringPlugin()],
    })

    const initial = new Set(
      result.outputs.filter((chunk) => chunk.isEntry).map((chunk) => chunk.fileName),
    )
    const queue = [...initial]
    while (queue.length) {
      const file = queue.pop()!
      const chunk = result.outputs.find((item) => item.fileName === file)
      for (const imported of chunk?.imports ?? []) {
        const name = imported.replace(/^\.\//, '')
        if (!initial.has(name) && result.chunks[name]) {
          initial.add(name)
          queue.push(name)
        }
      }
    }

    let min = 0
    let gzip = 0
    for (const file of initial) {
      const code = result.chunks[file]
      if (!code) continue
      const part = Buffer.from(code)
      min += part.length
      gzip += gzipSync(part, { level: 9 }).length
    }
    return { min, gzip }
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

function kb(bytes: number) {
  return `${(bytes / 1024).toFixed(1)} kB`
}

function ratio(ours: number, tanstack: number) {
  if (tanstack <= 0) return '—'
  return `${(ours / tanstack).toFixed(2)}×`
}

const rows: Array<{ name: string; ours: Sizes; tanstack: Sizes }> = []

for (const item of cases) {
  rows.push({
    name: item.name,
    ours: await bundle(item.ours, item.filename, oursAlias),
    tanstack: await bundle(item.tanstack, item.filename, {}),
  })
}

console.log('')
console.log('Client bundle size (Vite/Rolldown minify, gzip -9, React external)')
console.log(`Node ${process.version}`)
console.log(
  'TanStack: @tanstack/react-router 1.170.29, @tanstack/router-core 1.171.24, @tanstack/history 1.162.1',
)
console.log('')
console.log(
  'Package'.padEnd(24) +
    'fast-router'.padStart(12) +
    ' gzip'.padStart(10) +
    ' TanStack'.padStart(12) +
    ' gzip'.padStart(10) +
    ' gzip vs'.padStart(10),
)
console.log(''.padEnd(78, '-'))
for (const row of rows) {
  console.log(
    row.name.padEnd(24) +
      kb(row.ours.min).padStart(12) +
      kb(row.ours.gzip).padStart(10) +
      kb(row.tanstack.min).padStart(12) +
      kb(row.tanstack.gzip).padStart(10) +
      ratio(row.ours.gzip, row.tanstack.gzip).padStart(10),
  )
}
console.log('')

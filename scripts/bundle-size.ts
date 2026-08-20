/**
 * Head-to-head client bundle size: this repo vs published TanStack Router.
 *
 * Minified ESM via Vite 8 / Rolldown, production, React external.
 * Re-run with `pnpm size`.
 */
import { createRequire } from 'node:module'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { gzipSync } from 'node:zlib'
import { scriptStringPlugin, viteBundle } from './vite-bundle.ts'

const require = createRequire(import.meta.url)
function tanstackVersion(name: string) {
  return (require(`${name}/package.json`) as { version: string }).version
}

const repo = resolve(import.meta.dirname, '..')

const reactExternals = ['react', 'react-dom', 'react/jsx-runtime', 'react/jsx-dev-runtime']

const oursAlias = {
  'speedy-router-history': join(repo, 'packages/history/src/index.ts'),
  'speedy-router-core': join(repo, 'packages/router-core/src/index.ts'),
  'speedy-router-core/is-server': join(repo, 'packages/router-core/src/is-server.ts'),
  'speedy-router-core/ssr/client': join(repo, 'packages/router-core/src/ssr/client.ts'),
  'speedy-router': join(repo, 'packages/react-router/src/index.ts'),
  'speedy-router/ssr/client': join(repo, 'packages/react-router/src/ssr/client.ts'),
}

const cases = [
  {
    name: 'speedy-router client',
    filename: 'entry.tsx',
    ours: `export {
  Link,
  Outlet,
  RouterProvider,
  createRootRoute,
  createRoute,
  createRouter,
} from 'speedy-router'
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
    name: 'speedy-router-core client',
    filename: 'entry.ts',
    ours: `export { createRootRoute, createRoute, createRouter } from 'speedy-router-core'
`,
    tanstack: `export { BaseRootRoute, BaseRoute, RouterCore } from '@tanstack/router-core'
`,
  },
  {
    name: 'speedy-router hydrate',
    filename: 'entry.tsx',
    ours: `export { RouterClient } from 'speedy-router/ssr/client'
export { createRootRoute, createRouter } from 'speedy-router'
`,
    tanstack: `export { RouterClient } from '@tanstack/react-router/ssr/client'
export { createRootRoute, createRouter } from '@tanstack/react-router'
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
  const dir = await mkdtemp(join(cache, 'speedy-router-size-'))
  try {
    const entry = join(dir, filename)
    await writeFile(entry, source)
    const result = await viteBundle({
      root: repo,
      entry,
      outDir: join(dir, 'out'),
      write: false,
      cacheDir: join(cache, 'speedy-router-vite'),
      alias,
      external: [
        ...reactExternals,
        'seroval',
        'seroval-plugins',
        'seroval-plugins/web',
        'cookie-es',
      ],
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
  `TanStack: @tanstack/react-router ${tanstackVersion('@tanstack/react-router')}, @tanstack/router-core ${tanstackVersion('@tanstack/router-core')}, @tanstack/history ${tanstackVersion('@tanstack/history')}`,
)
console.log('')
console.log(
  'Package'.padEnd(24) +
    'speedy-router'.padStart(12) +
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

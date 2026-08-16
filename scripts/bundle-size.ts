/**
 * Head-to-head client bundle size: this repo vs published TanStack Router.
 *
 * Minified ESM, production, React external. Dependencies are included.
 * Re-run with `pnpm size`.
 */
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { gzipSync } from 'node:zlib'

const repo = resolve(import.meta.dirname, '..')
const require = createRequire(import.meta.url)

type Metafile = {
  outputs: Record<
    string,
    {
      bytes: number
      entryPoint?: string
      imports: Array<{ path: string; kind: string; external?: boolean }>
    }
  >
}

function loadEsbuild(): {
  build: (options: Record<string, unknown>) => Promise<{ metafile: Metafile }>
} {
  const viteDir = dirname(require.resolve('vite'))
  return require(require.resolve('esbuild', { paths: [viteDir] }))
}

const reactExternals = ['react', 'react-dom', 'react/jsx-runtime', 'react/jsx-dev-runtime']

const oursAlias = {
  '@anonrig/history': join(repo, 'packages/history/src/index.ts'),
  '@anonrig/router-core': join(repo, 'packages/router-core/src/index.ts'),
  '@anonrig/router-core/is-server': join(repo, 'packages/router-core/src/is-server.ts'),
  '@anonrig/react-router': join(repo, 'packages/react-router/src/index.ts'),
}

const cases = [
  {
    name: '@react-router client',
    filename: 'entry.tsx',
    ours: `export {
  Link,
  Outlet,
  RouterProvider,
  createRootRoute,
  createRoute,
  createRouter,
} from '@anonrig/react-router'
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
    name: '@router-core client',
    filename: 'entry.ts',
    ours: `export { createRootRoute, createRoute, createRouter } from '@anonrig/router-core'
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
  const dir = await mkdtemp(join(tmpdir(), 'anonrig-size-'))
  try {
    const entry = join(dir, filename)
    const outdir = join(dir, 'out')
    await writeFile(entry, source)
    await mkdir(outdir)
    const esbuild = loadEsbuild()
    const result = await esbuild.build({
      absWorkingDir: repo,
      nodePaths: [join(repo, 'node_modules')],
      entryPoints: [entry],
      bundle: true,
      minify: true,
      format: 'esm',
      platform: 'browser',
      target: 'es2024',
      treeShaking: true,
      splitting: true,
      metafile: true,
      outdir,
      write: true,
      logLevel: 'silent',
      jsx: 'automatic',
      legalComments: 'none',
      define: {
        'process.env.NODE_ENV': '"production"',
      },
      alias,
      external: reactExternals,
      plugins: [
        {
          name: 'script-string',
          setup(build: {
            onResolve: (opts: { filter: RegExp }, fn: (args: any) => any) => void
            onLoad: (opts: { filter: RegExp; namespace: string }, fn: (args: any) => any) => void
          }) {
            build.onResolve({ filter: /\?script-string$/ }, (args) => ({
              path: resolve(args.resolveDir, args.path.replace(/\?script-string$/, '')),
              namespace: 'script-string',
            }))
            build.onLoad({ filter: /.*/, namespace: 'script-string' }, async (args) => ({
              contents: `export default ${JSON.stringify(await readFile(args.path, 'utf8'))}`,
              loader: 'js',
            }))
          },
        },
      ],
    })

    const outputs = result.metafile.outputs
    const entryOutput = Object.keys(outputs).find((file) => outputs[file]!.entryPoint)
    if (!entryOutput) throw new Error(`No entry output for ${filename}`)

    const initial = new Set<string>()
    const queue = [entryOutput]
    while (queue.length) {
      const file = queue.pop()!
      if (initial.has(file)) continue
      initial.add(file)
      for (const imported of outputs[file]?.imports ?? []) {
        if (imported.external || imported.kind === 'dynamic-import') continue
        queue.push(imported.path)
      }
    }

    let min = 0
    let gzip = 0
    for (const file of initial) {
      const part = await readFile(resolve(repo, file))
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
console.log('Client bundle size (esbuild minify, gzip -9, React external)')
console.log(`Node ${process.version}`)
console.log(
  'TanStack: @tanstack/react-router 1.170.29, @tanstack/router-core 1.171.24, @tanstack/history 1.162.1',
)
console.log('')
console.log(
  'Package'.padEnd(24) +
    ' @anonrig'.padStart(12) +
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

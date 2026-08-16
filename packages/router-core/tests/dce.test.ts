// @vitest-environment node
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

const root = join(import.meta.dirname, '../../..')
const require = createRequire(import.meta.url)

const serverMarkers = [
  'loadServerRoute',
  'executeFastServerLane',
  'executeServerLane',
  'createRequestHandler',
  'crossSerializeStream',
  'attachRouterServerSsrUtils',
]

function loadEsbuild(): { build: (options: Record<string, unknown>) => Promise<unknown> } {
  const viteDir = dirname(require.resolve('vite'))
  return require(require.resolve('esbuild', { paths: [viteDir] }))
}

const dirs: Array<string> = []

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

async function bundle(
  source: string,
  opts: { splitting?: boolean; filename?: string } = {},
): Promise<{ entry: string; chunks: Record<string, string> }> {
  const dir = await mkdtemp(join(tmpdir(), 'anonrig-dce-'))
  dirs.push(dir)
  const filename = opts.filename ?? 'entry.ts'
  const entry = join(dir, filename)
  await writeFile(entry, source)
  const outdir = join(dir, 'out')
  const esbuild = await loadEsbuild()
  await esbuild.build({
    absWorkingDir: root,
    entryPoints: [entry],
    bundle: true,
    format: 'esm',
    platform: 'browser',
    treeShaking: true,
    splitting: opts.splitting ?? false,
    outdir,
    write: true,
    logLevel: 'silent',
    jsx: 'automatic',
    define: {
      'process.env.NODE_ENV': '"production"',
    },
    alias: {
      '@anonrig/history': join(root, 'packages/history/src/index.ts'),
      '@anonrig/router-core': join(root, 'packages/router-core/src/index.ts'),
      '@anonrig/router-core/is-server': join(root, 'packages/router-core/src/is-server.ts'),
      '@anonrig/react-router': join(root, 'packages/react-router/src/index.ts'),
    },
    external: [
      'react',
      'react-dom',
      'react/jsx-runtime',
      'react/jsx-dev-runtime',
      'seroval',
      'seroval-plugins',
      'seroval-plugins/web',
      'cookie-es',
    ],
    plugins: [
      {
        name: 'script-string',
        setup(build) {
          build.onResolve({ filter: /\?script-string$/ }, (args) => ({
            path: args.path,
            namespace: 'script-string',
          }))
          build.onLoad({ filter: /.*/, namespace: 'script-string' }, () => ({
            contents: 'export default ""',
            loader: 'js',
          }))
        },
      },
    ],
  })
  const files = await readdir(outdir)
  const chunks: Record<string, string> = {}
  for (const file of files) {
    if (!file.endsWith('.js')) continue
    chunks[file] = await readFile(join(outdir, file), 'utf8')
  }
  const entryName = filename.replace(/\.[^.]+$/, '.js')
  return { entry: chunks[entryName] ?? Object.values(chunks)[0]!, chunks }
}

describe('dead code elimination', () => {
  it('drops the router and SSR graph when only encode is imported', async () => {
    const { entry } = await bundle(`
      import { encode } from '@anonrig/router-core'
      console.log(encode({ a: 1 }))
    `)
    expect(entry).toContain('encode')
    expect(entry).not.toContain('RouterCore')
    expect(entry).not.toContain('class Router')
    for (const marker of serverMarkers) {
      expect(entry, marker).not.toContain(marker)
    }
  })

  it('does not pull server loaders through the isServer export', async () => {
    const { entry } = await bundle(`
      import { isServer } from '@anonrig/router-core'
      console.log(isServer)
    `)
    expect(entry).toMatch(/document/)
    for (const marker of serverMarkers) {
      expect(entry, marker).not.toContain(marker)
    }
  })

  it('keeps load-server out of the client createRouter chunk', async () => {
    const { entry, chunks } = await bundle(
      `
        import { createRootRoute, createRouter } from '@anonrig/router-core'
        export const router = createRouter({ routeTree: createRootRoute() })
      `,
      { splitting: true },
    )
    expect(entry).toContain('createRouter')
    for (const marker of serverMarkers) {
      expect(entry, marker).not.toContain(marker)
    }
    const asyncCode = Object.entries(chunks)
      .filter(([name]) => name !== 'entry.js')
      .map(([, code]) => code)
      .join('\n')
    expect(asyncCode).toContain('loadServerRoute')
  })

  it('drops unused Scripts and HeadContent from a client react-router import', async () => {
    const { entry } = await bundle(
      `
        import { createRootRoute, createRouter } from '@anonrig/react-router'
        export const router = createRouter({ routeTree: createRootRoute() })
      `,
      { filename: 'entry.tsx', splitting: true },
    )
    expect(entry).not.toContain('tsr-meta-')
    expect(entry).not.toContain('preventScriptHoist')
    expect(entry).not.toContain('HeadContent')
    for (const marker of serverMarkers) {
      expect(entry, marker).not.toContain(marker)
    }
  })
})

// @vitest-environment node
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { scriptStringPlugin, viteBundle } from '../../../scripts/vite-bundle.ts'

const root = join(import.meta.dirname, '../../..')

const serverMarkers = [
  'loadServerRoute',
  'executeFastServerLane',
  'executeServerLane',
  'createRequestHandler',
  'crossSerializeStream',
  'attachRouterServerSsrUtils',
]

const dirs: Array<string> = []

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

async function bundle(
  source: string,
  opts: { filename?: string } = {},
): Promise<{ entry: string; chunks: Record<string, string> }> {
  const dir = await mkdtemp(join(tmpdir(), 'anonrig-dce-'))
  dirs.push(dir)
  const filename = opts.filename ?? 'entry.ts'
  const entry = join(dir, filename)
  await writeFile(entry, source)
  return viteBundle({
    root,
    entry,
    outDir: join(dir, 'out'),
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
    plugins: [scriptStringPlugin({ stub: true })],
  })
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
    expect(serverMarkers.filter((marker) => entry.includes(marker))).toEqual([])
  })

  it('does not pull server loaders through the isServer export', async () => {
    const { entry } = await bundle(`
      import { isServer } from '@anonrig/router-core'
      console.log(isServer)
    `)
    expect(entry).toMatch(/document/)
    expect(serverMarkers.filter((marker) => entry.includes(marker))).toEqual([])
  })

  it('keeps load-server out of the client createRouter chunk', async () => {
    const { entry, chunks } = await bundle(`
      import { createRootRoute, createRouter } from '@anonrig/router-core'
      export const router = createRouter({ routeTree: createRootRoute() })
    `)
    expect(entry).toContain('createRouter')
    expect(entry).not.toContain('tsr-scroll-restoration-v1_3')
    expect(serverMarkers.filter((marker) => entry.includes(marker))).toEqual([])
    const asyncCode = Object.entries(chunks)
      .filter(([name]) => name !== 'entry.js')
      .map(([, code]) => code)
      .join('\n')
    expect(asyncCode).toContain('loadServerRoute')
    expect(entry).not.toContain('runClientTransaction')
    expect(asyncCode).toContain('runClientTransaction')
  })

  it('drops unused Scripts and HeadContent from a client react-router import', async () => {
    const { entry } = await bundle(
      `
        import { createRootRoute, createRouter } from '@anonrig/react-router'
        export const router = createRouter({ routeTree: createRootRoute() })
      `,
      { filename: 'entry.tsx' },
    )
    expect(entry).not.toContain('tsr-meta-')
    expect(entry).not.toContain('preventScriptHoist')
    expect(entry).not.toContain('HeadContent')
    expect(serverMarkers.filter((marker) => entry.includes(marker))).toEqual([])
  })
})

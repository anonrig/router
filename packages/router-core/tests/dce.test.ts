// @vitest-environment node
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
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
  const cache = join(root, 'node_modules/.cache')
  await mkdir(cache, { recursive: true })
  const dir = await mkdtemp(join(cache, 'speedy-router-dce-'))
  dirs.push(dir)
  const filename = opts.filename ?? 'entry.ts'
  const entry = join(dir, filename)
  await writeFile(entry, source)
  return viteBundle({
    root,
    entry,
    outDir: join(dir, 'out'),
    write: false,
    cacheDir: join(root, 'node_modules/.cache/speedy-router-vite'),
    alias: {
      'speedy-router-history': join(root, 'packages/history/src/index.ts'),
      'speedy-router-core': join(root, 'packages/router-core/src/index.ts'),
      'speedy-router-core/is-server': join(root, 'packages/router-core/src/is-server.ts'),
      'speedy-router': join(root, 'packages/react-router/src/index.ts'),
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
      import { encode } from 'speedy-router-core'
      console.log(encode({ a: 1 }))
    `)
    expect(entry).toContain('encode')
    expect(entry).not.toContain('RouterCore')
    expect(entry).not.toContain('class Router')
    expect(serverMarkers.filter((marker) => entry.includes(marker))).toEqual([])
  })

  it('does not pull server loaders through the isServer export', async () => {
    const { entry } = await bundle(`
      import { isServer } from 'speedy-router-core'
      console.log(isServer)
    `)
    expect(entry).toMatch(/document/)
    expect(serverMarkers.filter((marker) => entry.includes(marker))).toEqual([])
  })

  it('keeps load-server out of the client createRouter chunk', async () => {
    const { entry, chunks } = await bundle(`
      import { createRootRoute, createRouter } from 'speedy-router-core'
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
    expect(entry).not.toContain('runRouteLifecycle')
    expect(asyncCode).toContain('runRouteLifecycle')
  })

  it('drops unused Scripts and HeadContent from a client react-router import', async () => {
    const { entry } = await bundle(
      `
        import { createRootRoute, createRouter } from 'speedy-router'
        export const router = createRouter({ routeTree: createRootRoute() })
      `,
      { filename: 'entry.tsx' },
    )
    expect(entry).not.toContain('tsr-meta-')
    expect(entry).not.toContain('preventScriptHoist')
    expect(entry).not.toContain('HeadContent')
    expect(serverMarkers.filter((marker) => entry.includes(marker))).toEqual([])
  })

  it('keeps scroll restoration out of the public client constructors', async () => {
    const { entry } = await bundle(
      `
        export {
          Link,
          Outlet,
          RouterProvider,
          createRootRoute,
          createRoute,
          createRouter,
        } from 'speedy-router'
      `,
      { filename: 'entry.tsx' },
    )
    expect(entry).toContain('createRouter')
    expect(entry).not.toContain('tsr-scroll-restoration-v1_3')
    expect(entry).not.toContain('getElementScrollRestorationEntry')
    expect(entry).not.toContain('sessionStorage')
    expect(entry).not.toContain('getRouteApi')
    expect(entry).not.toContain('useMatchRoute')
    expect(serverMarkers.filter((marker) => entry.includes(marker))).toEqual([])
  })
})

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
  opts: { filename?: string; ssr?: boolean; cacheDir?: string } = {},
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
    ssr: opts.ssr,
    cacheDir: join(
      root,
      opts.cacheDir ??
        (opts.ssr
          ? 'node_modules/.cache/speedy-router-vite-ssr'
          : 'node_modules/.cache/speedy-router-vite'),
    ),
    alias: {
      'speedy-router-history': join(root, 'packages/history/src/index.ts'),
      'speedy-router-core': join(root, 'packages/router-core/src/index.ts'),
      'speedy-router-core/is-server': join(root, 'packages/router-core/src/is-server.ts'),
      'speedy-router-core/ssr/client': join(root, 'packages/router-core/src/ssr/client.ts'),
      'speedy-router-core/ssr/server': join(root, 'packages/router-core/src/ssr/server.ts'),
      'speedy-router-core/warm': join(root, 'packages/router-core/src/warm.ts'),
      'speedy-router': join(root, 'packages/react-router/src/index.ts'),
      'speedy-router/warm': join(root, 'packages/react-router/src/warm.ts'),
      'speedy-router/ssr/client': join(root, 'packages/react-router/src/ssr/client.ts'),
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

function allCode(chunks: Record<string, string>) {
  return Object.values(chunks).join('\n')
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

  it('keeps load-server out of the client createRouter graph', async () => {
    const { entry, chunks } = await bundle(`
      import { createRootRoute, createRouter } from 'speedy-router-core'
      export const router = createRouter({ routeTree: createRootRoute() })
    `)
    expect(entry).toContain('createRouter')
    expect(entry).not.toContain('tsr-scroll-restoration-v1_3')
    expect(serverMarkers.filter((marker) => allCode(chunks).includes(marker))).toEqual([])
    expect(entry).not.toContain('runClientTransaction')
    expect(allCode(chunks)).toContain('runClientTransaction')
    expect(allCode(chunks)).not.toContain('createLRUCache')
    expect(allCode(chunks)).not.toContain('createStringMap')
    expect(allCode(chunks)).not.toContain('setupDefaultScroll')
    expect(allCode(chunks)).not.toContain('scroll-default')
  })

  it('keeps load-server in the SSR createRouter graph', async () => {
    const { chunks } = await bundle(
      `
      import { createRootRoute, createRouter } from 'speedy-router-core'
      export const router = createRouter({ routeTree: createRootRoute() })
    `,
      { ssr: true },
    )
    expect(allCode(chunks)).toContain('loadServerRoute')
  })

  it('registers load-server from the SSR entry when import.meta.env.SSR is false', async () => {
    const { chunks } = await bundle(
      `
      import { createRootRoute, createRouter } from 'speedy-router-core'
      import { attachRouterServerSsrUtils } from 'speedy-router-core/ssr/server'
      const router = createRouter({ routeTree: createRootRoute() })
      attachRouterServerSsrUtils({ router, manifest: undefined })
      export { router }
    `,
      { cacheDir: 'node_modules/.cache/speedy-router-vite-ssr-entry' },
    )
    const code = allCode(chunks)
    expect(code).toContain('loadServerRoute')
    expect(code).toMatch(/setLoadServerRoute\s*\(\s*loadServerRoute\s*\)/)
  })

  it('keeps the client load coordinator out of hydrate', async () => {
    const { entry, chunks } = await bundle(`
      export { hydrate } from 'speedy-router-core/ssr/client'
    `)
    const code = allCode(chunks)
    expect(entry).toContain('hydrate')
    expect(code).not.toContain('runClientTransaction')
    expect(code).not.toContain('executeClientLane')
    expect(code).not.toContain('loadClientRoute')
    expect(code).not.toContain('preloadClientRoute')
    expect(serverMarkers.filter((marker) => code.includes(marker))).toEqual([])
  })

  it('does not statically bind the coordinator into RouterClient', async () => {
    const { entry } = await bundle(
      `
        export { RouterClient } from 'speedy-router/ssr/client'
      `,
      { filename: 'entry.tsx' },
    )
    expect(entry).toContain('hydrate')
    expect(entry).not.toContain('runClientTransaction')
    expect(entry).not.toContain('loadClientRoute')
    expect(serverMarkers.filter((marker) => entry.includes(marker))).toEqual([])
  })

  it('keeps the warm loader out of the default client graph', async () => {
    const { chunks } = await bundle(`
      import { createRootRoute, createRouter } from 'speedy-router-core'
      export const router = createRouter({ routeTree: createRootRoute() })
    `)
    const code = allCode(chunks)
    expect(code).toContain('createRouter')
    expect(code).not.toContain('routeCanWarmLoad')
    expect(code).not.toContain('finishWarmMatches')
    expect(code).not.toContain('tryWarmLoad')
    expect(serverMarkers.filter((marker) => code.includes(marker))).toEqual([])
  })

  it('installs the warm loader when the warm entry is imported', async () => {
    const { chunks } = await bundle(`
      import { createRootRoute, createRouter } from 'speedy-router-core'
      import 'speedy-router-core/warm'
      export const router = createRouter({ routeTree: createRootRoute() })
    `)
    const code = allCode(chunks)
    expect(code).toContain('tryWarmLoad')
    expect(code).toMatch(/setWarmLoad\s*\(\s*tryWarmLoad\s*\)/)
  })

  it('keeps scroll setup listeners out of useElementScrollRestoration', async () => {
    const { chunks } = await bundle(
      `
        export { useElementScrollRestoration } from 'speedy-router'
      `,
      { filename: 'entry.tsx' },
    )
    const code = allCode(chunks)
    expect(code).toContain('getElementScrollRestorationEntry')
    expect(code).not.toContain('pagehide')
    expect(code).not.toContain('history.scrollRestoration')
    expect(serverMarkers.filter((marker) => code.includes(marker))).toEqual([])
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
    expect(entry).not.toContain('useMatchRoute')
    expect(entry).not.toContain('setupDefaultScroll')
    expect(serverMarkers.filter((marker) => entry.includes(marker))).toEqual([])
  })

  it('keeps useMatchRoute out of the Matches graph', async () => {
    const { entry, chunks } = await bundle(
      `
        export { Matches, useChildMatches } from 'speedy-router'
      `,
      { filename: 'entry.tsx' },
    )
    const code = allCode(chunks)
    expect(entry).toContain('Matches')
    expect(code).not.toContain('useMatchRoute')
    expect(serverMarkers.filter((marker) => code.includes(marker))).toEqual([])
  })
})

// @vitest-environment node
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { generateRouteTree } from '../src/generate'
import { scanRoutes } from '../src/scan'

const repoRoot = join(import.meta.dirname, '../../..')
const require = createRequire(import.meta.url)

function loadEsbuild(): { build: (options: Record<string, unknown>) => Promise<unknown> } {
  const viteDir = dirname(require.resolve('vite'))
  return require(require.resolve('esbuild', { paths: [viteDir] }))
}

function write(dir: string, file: string, body = 'export const Route = {}\n') {
  const full = join(dir, file)
  mkdirSync(join(full, '..'), { recursive: true })
  writeFileSync(full, body)
}

describe('scanRoutes', () => {
  it('maps TanStack file names to compact parent/id/path records', () => {
    const dir = mkdtempSync(join(tmpdir(), 'anonrig-routes-'))
    write(dir, '__root.tsx')
    write(dir, 'index.tsx')
    write(dir, 'about.tsx')
    write(dir, 'posts/route.tsx')
    write(dir, 'posts/index.tsx')
    write(dir, 'posts/$postId.tsx')
    write(dir, '_auth/login.tsx')
    write(dir, '_auth.tsx')
    write(dir, 'blog_/$slug.tsx')
    write(dir, 'about.lazy.tsx', 'export const Route = { lazy: true }\n')
    write(dir, 'posts/$postId-component.tsx', 'export const component = () => null\n')

    const scanned = scanRoutes({ routesDirectory: dir })
    const byKey = Object.fromEntries(
      scanned.filter((route) => !route.isRoot).map((route) => [route.key, route]),
    )

    expect(scanned.some((route) => route.isRoot)).toBe(true)
    expect(scanned.some((route) => route.fileId.includes('.lazy'))).toBe(false)
    expect(byKey['/']?.parentId).toBe('__root__')
    expect(byKey['/']?.path).toBe('/')
    expect(byKey['/about']?.path).toBe('/about')
    expect(byKey['/posts']?.parentId).toBe('__root__')
    expect(byKey['/posts/']?.parentId).toBe('/posts')
    expect(byKey['/posts/']?.id).toBe('/')
    expect(byKey['/posts/']?.path).toBe('/')
    expect(byKey['/posts/$postId']?.parentId).toBe('/posts')
    expect(byKey['/posts/$postId']?.id).toBe('/$postId')
    expect(byKey['/_auth']?.path).toBeUndefined()
    expect(byKey['/_auth/login']?.parentId).toBe('/_auth')
    expect(byKey['/_auth/login']?.path).toBe('/login')
    expect(byKey['/blog_/$slug']?.parentId).toBe('__root__')
    expect(byKey['/blog_/$slug']?.path).toBe('/blog/$slug')
  })
})

describe('generateRouteTree', () => {
  it('emits a runtime file that static-imports only the root route', () => {
    const dir = mkdtempSync(join(tmpdir(), 'anonrig-gen-'))
    const routes = join(dir, 'routes')
    write(routes, '__root.tsx', 'export const Route = { options: {} }\n')
    for (let i = 0; i < 40; i++) {
      write(
        routes,
        `page-${i}.tsx`,
        `export const Route = { options: { marker: 'PAGE_${i}_BODY' } }\n`,
      )
    }
    const generated = join(dir, 'routeTree.gen.ts')
    const result = generateRouteTree({
      routesDirectory: routes,
      generatedRouteTree: generated,
    })

    expect(result.routeCount).toBe(41)
    const runtime = readFileSync(generated, 'utf8')
    const types = readFileSync(result.typesPath, 'utf8')

    expect(runtime).toContain("import { Route as rootRoute } from './routes/__root'")
    expect(runtime).toContain('createRoute')
    expect(runtime).toContain('route.lazy')
    expect(runtime).toContain('() => import("./routes/page-0")')
    expect(runtime).not.toMatch(/import \{ Route as .+ \} from '\.\/routes\/page-/)
    expect(runtime).not.toContain('PAGE_0_BODY')
    expect(runtime).not.toContain('interface FileRoutesByFullPath')
    expect(types).toContain('export interface FileRouteTypes')
    expect(types).toContain('fullPaths: keyof FileRoutesByFullPath')
    expect(types).toContain("declare module '@anonrig/router-core'")
    expect(types).not.toContain('typeof ')
  })

  it('keeps route module bodies out of the initial client chunk', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'anonrig-dce-tree-'))
    const routes = join(dir, 'routes')
    write(routes, '__root.tsx', 'export const Route = { options: { marker: "ROOT_ONLY" } }\n')
    write(routes, 'index.tsx', 'export const Route = { options: { marker: "INDEX_ROUTE_BODY" } }\n')
    write(
      routes,
      'settings.tsx',
      'export const Route = { options: { marker: "SETTINGS_ROUTE_BODY" } }\n',
    )
    const generated = join(dir, 'routeTree.gen.ts')
    generateRouteTree({
      routesDirectory: routes,
      generatedRouteTree: generated,
    })
    writeFileSync(
      join(dir, 'entry.ts'),
      `import { routeTree } from './routeTree.gen.ts'\nexport { routeTree }\n`,
    )

    const esbuild = loadEsbuild()
    const outdir = join(dir, 'out')
    await esbuild.build({
      absWorkingDir: dir,
      entryPoints: [join(dir, 'entry.ts')],
      bundle: true,
      format: 'esm',
      platform: 'browser',
      treeShaking: true,
      splitting: true,
      outdir,
      write: true,
      logLevel: 'silent',
      define: { 'process.env.NODE_ENV': '"production"' },
      alias: {
        '@anonrig/history': join(repoRoot, 'packages/history/src/index.ts'),
        '@anonrig/router-core/is-server': join(repoRoot, 'packages/router-core/src/is-server.ts'),
        '@anonrig/router-core': join(repoRoot, 'packages/router-core/src/index.ts'),
      },
    })

    const entry = readFileSync(join(outdir, 'entry.js'), 'utf8')
    expect(entry).toContain('ROOT_ONLY')
    expect(entry).not.toContain('INDEX_ROUTE_BODY')
    expect(entry).not.toContain('SETTINGS_ROUTE_BODY')
    expect(entry).toContain('import(')
  })
})

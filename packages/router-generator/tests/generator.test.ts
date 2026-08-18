// @vitest-environment node
import { mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { viteBundle } from '../../../scripts/vite-bundle.ts'
import { generateRouteTree } from '../src/generate'
import { scanRoutes } from '../src/scan'

const repoRoot = join(import.meta.dirname, '../../..')

function write(dir: string, file: string, body = 'export const Route = {}\n') {
  const full = join(dir, file)
  mkdirSync(join(full, '..'), { recursive: true })
  writeFileSync(full, body)
}

describe('scanRoutes', () => {
  it('maps TanStack file names to compact parent/id/path records', () => {
    const dir = mkdtempSync(join(tmpdir(), 'speedy-router-routes-'))
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

  it('keeps pathful prefixes on underscore layout files', () => {
    const dir = mkdtempSync(join(tmpdir(), 'speedy-router-routes-layout-'))
    write(dir, '__root.tsx')
    write(dir, '$username/_profile.tsx')
    write(dir, '$username/_profile/index.tsx')
    write(dir, '$username/_profile/affiliates.tsx')
    write(dir, '$username/_followers.tsx')
    write(dir, '$username/_followers/followers.tsx')
    write(dir, 'i/spaces/$spaceId/_space.tsx')
    write(dir, 'i/spaces/$spaceId/_space/index.tsx')

    const scanned = scanRoutes({ routesDirectory: dir })
    const byKey = Object.fromEntries(
      scanned.filter((route) => !route.isRoot).map((route) => [route.key, route]),
    )

    expect(byKey['/$username/_profile']?.path).toBe('/$username')
    expect(byKey['/$username/_profile']?.parentId).toBe('__root__')
    expect(byKey['/$username/_profile/']?.parentId).toBe('/$username/_profile')
    expect(byKey['/$username/_profile/']?.path).toBe('/')
    expect(byKey['/$username/_profile/affiliates']?.path).toBe('/affiliates')
    expect(byKey['/$username/_followers']?.path).toBe('/$username')
    expect(byKey['/$username/_followers/followers']?.path).toBe('/followers')
    expect(byKey['/i/spaces/$spaceId/_space']?.path).toBe('/i/spaces/$spaceId')
    expect(byKey['/i/spaces/$spaceId/_space/']?.path).toBe('/')
  })

  it('treats unescaped dots as nested path segments, like TanStack', () => {
    const dir = mkdtempSync(join(tmpdir(), 'speedy-router-routes-flat-'))
    write(dir, '__root.tsx')
    write(dir, 'lists.tsx')
    write(dir, 'lists/$listId.tsx')
    write(dir, 'lists/$listId.index.tsx')
    write(dir, 'lists/$listId.followers.tsx')
    write(dir, 'posts.$postId.tsx')
    write(dir, 'posts_.$postId.edit.tsx')
    write(dir, 'files/script[.]js.tsx')

    const scanned = scanRoutes({ routesDirectory: dir })
    const byKey = Object.fromEntries(
      scanned.filter((route) => !route.isRoot).map((route) => [route.key, route]),
    )

    expect(byKey['/lists/$listId/']?.parentId).toBe('/lists/$listId')
    expect(byKey['/lists/$listId/']?.id).toBe('/')
    expect(byKey['/lists/$listId/']?.path).toBe('/')
    expect(byKey['/lists/$listId/followers']?.parentId).toBe('/lists/$listId')
    expect(byKey['/lists/$listId/followers']?.id).toBe('/followers')
    expect(byKey['/lists/$listId/followers']?.path).toBe('/followers')
    expect(byKey['/posts/$postId']?.parentId).toBe('__root__')
    expect(byKey['/posts/$postId']?.path).toBe('/posts/$postId')
    expect(byKey['/posts_/$postId/edit']?.parentId).toBe('__root__')
    expect(byKey['/posts_/$postId/edit']?.path).toBe('/posts/$postId/edit')
    expect(byKey['/files/script.js']?.path).toBe('/files/script.js')
    expect(byKey['/lists/$listId.index']).toBeUndefined()
    expect(byKey['/lists/$listId.followers']).toBeUndefined()
  })

  it('maps @slotName files to slot roots and slot children', () => {
    const dir = mkdtempSync(join(tmpdir(), 'speedy-router-slot-routes-'))
    write(dir, '__root.tsx')
    write(dir, 'dashboard.tsx')
    write(dir, 'dashboard.@activity.tsx')
    write(dir, 'dashboard.@activity.index.tsx')
    write(dir, '@modal.tsx')
    write(dir, '@modal.users.$id.tsx')

    const scanned = scanRoutes({ routesDirectory: dir })
    const byKey = Object.fromEntries(
      scanned.filter((route) => !route.isRoot).map((route) => [route.key, route]),
    )

    expect(byKey['/@modal']?.slot).toBe('modal')
    expect(byKey['/@modal']?.isSlotRoot).toBe(true)
    expect(byKey['/@modal']?.path).toBeUndefined()
    expect(byKey['/@modal/users/$id']?.parentId).toBe('/@modal')
    expect(byKey['/@modal/users/$id']?.path).toBe('/users/$id')
    expect(byKey['/dashboard/@activity']?.slot).toBe('activity')
    expect(byKey['/dashboard/@activity']?.parentId).toBe('/dashboard')
    expect(byKey['/dashboard/@activity']?.isSlotRoot).toBe(true)
    expect(byKey['/dashboard/@activity/']?.path).toBe('/')
    expect(byKey['/dashboard/@activity/']?.isPathless).toBe(false)
    expect(byKey['/dashboard/@activity/']?.isSlotRoot).toBe(false)
    expect(byKey['/dashboard/@activity/']?.parentId).toBe('/dashboard/@activity')
  })

  it('walks dirents once and skips node_modules, dot dirs, and split files', () => {
    const dir = mkdtempSync(join(tmpdir(), 'speedy-router-routes-skip-'))
    write(dir, '__root.tsx')
    write(dir, 'visible.tsx')
    write(dir, 'node_modules/hidden.tsx')
    write(dir, '.hidden/secret.tsx')
    write(dir, 'nested/node_modules/pkg.tsx')
    write(dir, 'about.lazy.tsx', 'export const Route = { lazy: true }\n')

    const scanned = scanRoutes({ routesDirectory: dir })
    const fileIds = scanned.map((route) => route.fileId).toSorted()
    expect(fileIds).toEqual(['__root', 'visible'])
  })

  it('throws when the routes directory is missing', () => {
    expect(() =>
      scanRoutes({ routesDirectory: join(tmpdir(), 'speedy-router-missing-routes') }),
    ).toThrow(/routesDirectory does not exist/)
  })

  it('honors TanStack routeFileIgnorePattern for colocated tests and generated files', () => {
    const dir = mkdtempSync(join(tmpdir(), 'speedy-router-routes-ignore-'))
    write(dir, '__root.tsx')
    write(dir, 'home.tsx')
    write(dir, 'home.test.ts')
    write(dir, 'home.e2e.ts')
    write(dir, 'settings/index.tsx')
    write(dir, 'settings/index.test.ts')
    write(dir, 'posts/__generated__/PostQuery.graphql.ts')

    const scanned = scanRoutes({
      routesDirectory: dir,
      routeFileIgnorePattern: '\\.test\\.|\\.e2e\\.|__generated__',
    })
    const fileIds = scanned
      .filter((route) => !route.isRoot)
      .map((route) => route.fileId)
      .toSorted()

    expect(fileIds).toEqual(['home', 'settings/index'])
  })
})

describe('generateRouteTree', () => {
  it('emits a runtime file that static-imports only the root route', () => {
    const dir = mkdtempSync(join(tmpdir(), 'speedy-router-gen-'))
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
    expect(types).toContain("declare module 'speedy-router-core'")
    expect(types).not.toContain('typeof ')
  })

  it('types fullPath without pathless underscore segments', () => {
    const dir = mkdtempSync(join(tmpdir(), 'speedy-router-gen-pathless-'))
    const routes = join(dir, 'routes')
    write(routes, '__root.tsx')
    write(routes, '$username/_profile.tsx')
    write(routes, '$username/_profile/affiliates.tsx')
    const generated = join(dir, 'routeTree.gen.ts')
    const result = generateRouteTree({
      routesDirectory: routes,
      generatedRouteTree: generated,
    })
    const types = readFileSync(result.typesPath, 'utf8')
    expect(types).toContain('"/$username/affiliates": {}')
    expect(types).toContain('fullPath: "/$username/affiliates"')
    expect(types).toContain('path: "/$username"')
    expect(types).not.toContain('fullPath: "/$username/_profile/affiliates"')
  })

  it('imports createSlotRoute from the React package so Outlet wiring is installed', () => {
    const dir = mkdtempSync(join(tmpdir(), 'speedy-router-gen-slots-'))
    const routes = join(dir, 'routes')
    write(routes, '__root.tsx')
    write(routes, 'dashboard.tsx')
    write(routes, 'dashboard.@activity.tsx')
    write(routes, 'dashboard.@activity.index.tsx')
    const generated = join(dir, 'routeTree.gen.ts')
    generateRouteTree({
      routesDirectory: routes,
      generatedRouteTree: generated,
    })
    const runtime = readFileSync(generated, 'utf8')
    expect(runtime).toContain("import { createRoute } from 'speedy-router-core'")
    expect(runtime).toContain("import { createSlotRoute } from 'speedy-router'")
    expect(runtime).toContain('createSlotRoute({ getParentRoute, slot })')
  })

  it('does not rewrite unchanged generated files', () => {
    const dir = mkdtempSync(join(tmpdir(), 'speedy-router-gen-idempotent-'))
    const routes = join(dir, 'routes')
    write(routes, '__root.tsx')
    write(routes, 'index.tsx')
    const generated = join(dir, 'routeTree.gen.ts')
    const first = generateRouteTree({
      routesDirectory: routes,
      generatedRouteTree: generated,
    })
    const runtimeBefore = statSync(first.runtimePath)
    const typesBefore = statSync(first.typesPath)
    generateRouteTree({
      routesDirectory: routes,
      generatedRouteTree: generated,
    })
    expect(statSync(first.runtimePath).mtimeMs).toBe(runtimeBefore.mtimeMs)
    expect(statSync(first.typesPath).mtimeMs).toBe(typesBefore.mtimeMs)
    expect(statSync(first.runtimePath).ino).toBe(runtimeBefore.ino)
    expect(statSync(first.typesPath).ino).toBe(typesBefore.ino)
  })

  it('keeps route module bodies out of the initial client chunk', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'speedy-router-dce-tree-'))
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

    const { entry } = await viteBundle({
      root: repoRoot,
      entry: join(dir, 'entry.ts'),
      outDir: join(dir, 'out'),
      alias: {
        'speedy-router-history': join(repoRoot, 'packages/history/src/index.ts'),
        'speedy-router-core/is-server': join(repoRoot, 'packages/router-core/src/is-server.ts'),
        'speedy-router-core': join(repoRoot, 'packages/router-core/src/index.ts'),
      },
    })
    expect(entry).toContain('ROOT_ONLY')
    expect(entry).not.toContain('INDEX_ROUTE_BODY')
    expect(entry).not.toContain('SETTINGS_ROUTE_BODY')
    expect(entry).toContain('import(')
  })
})

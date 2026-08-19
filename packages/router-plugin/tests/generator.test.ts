// @vitest-environment node
import { existsSync, mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseSync } from 'oxc-parser'
import { describe, expect, it } from 'vitest'
import { routePathToVariable } from '../src/emit'
import { generateRouteTree } from '../src/generate'
import { matchesRouteFileIgnorePattern, scanRoutes } from '../src/scan'

function write(dir: string, file: string, body = 'export const Route = {}\n') {
  const full = join(dir, file)
  mkdirSync(join(full, '..'), { recursive: true })
  writeFileSync(full, body)
}

describe('scanRoutes', () => {
  it('unwraps bracket-escaped route tokens', () => {
    const dir = mkdtempSync(join(tmpdir(), 'speedy-router-bracket-escapes-'))
    write(dir, '__root.tsx')
    write(dir, '[index].tsx')
    write(dir, '[_]auth.tsx')

    const routes = scanRoutes({ routesDirectory: dir })
    const byFileId = Object.fromEntries(routes.map((route) => [route.fileId, route]))

    expect(byFileId['[index]']).toMatchObject({
      key: '/index',
      path: '/index',
      fullPath: '/index',
    })
    expect(byFileId['[_]auth']).toMatchObject({
      key: '/_auth',
      path: '/_auth',
      fullPath: '/_auth',
      isPathless: false,
    })
  })

  it('keeps escaped tokens in fullPath for leaf and parent segments', () => {
    const dir = mkdtempSync(join(tmpdir(), 'speedy-router-escaped-full-paths-'))
    write(dir, '__root.tsx')
    write(dir, '[_]auth.login.tsx')
    write(dir, '[(]marketing[)].about.tsx')
    write(dir, 'posts[_].tsx')
    write(dir, 'shop.[_]tab.reviews.tsx')

    const routes = scanRoutes({ routesDirectory: dir })
    const byFileId = Object.fromEntries(routes.map((route) => [route.fileId, route]))

    expect(byFileId['[_]auth.login']).toMatchObject({
      key: '/_auth/login',
      path: '/_auth/login',
      fullPath: '/_auth/login',
      isPathless: false,
    })
    expect(byFileId['[(]marketing[)].about']).toMatchObject({
      key: '/(marketing)/about',
      path: '/(marketing)/about',
      fullPath: '/(marketing)/about',
    })
    expect(byFileId['shop.[_]tab.reviews']).toMatchObject({
      key: '/shop/_tab/reviews',
      path: '/shop/_tab/reviews',
      fullPath: '/shop/_tab/reviews',
    })
    // A trailing `_` opts out of nesting, but `[_]` is a literal character.
    expect(byFileId['posts[_]']).toMatchObject({
      key: '/posts_',
      path: '/posts_',
      fullPath: '/posts_',
    })
  })

  it('keeps escaped tokens in child paths when the escaped layout is a real parent', () => {
    const dir = mkdtempSync(join(tmpdir(), 'speedy-router-escaped-parent-'))
    write(dir, '__root.tsx')
    write(dir, '[_]auth.tsx')
    write(dir, '[_]auth.login.tsx')

    const routes = scanRoutes({ routesDirectory: dir })
    const byFileId = Object.fromEntries(routes.map((route) => [route.fileId, route]))

    expect(byFileId['[_]auth']).toMatchObject({ key: '/_auth', path: '/_auth', fullPath: '/_auth' })
    expect(byFileId['[_]auth.login']).toMatchObject({
      key: '/_auth/login',
      parentId: '/_auth',
      id: '/login',
      path: '/login',
      fullPath: '/_auth/login',
    })
  })

  it('does not treat an escaped @ file as a parallel-route slot', () => {
    const dir = mkdtempSync(join(tmpdir(), 'speedy-router-escaped-slot-'))
    write(dir, '__root.tsx')
    write(dir, '[@]modal.tsx')
    write(dir, '@drawer.tsx')

    const routes = scanRoutes({ routesDirectory: dir })
    const byFileId = Object.fromEntries(routes.map((route) => [route.fileId, route]))

    expect(byFileId['[@]modal']).toMatchObject({
      key: '/@modal',
      path: '/@modal',
      fullPath: '/@modal',
      isPathless: false,
      isSlotRoot: false,
    })
    expect(byFileId['[@]modal']?.slot).toBeUndefined()
    expect(byFileId['@drawer']).toMatchObject({ slot: 'drawer', isSlotRoot: true })
    expect(byFileId['@drawer']?.path).toBeUndefined()
  })

  it('rejects nested root route files', () => {
    const dir = mkdtempSync(join(tmpdir(), 'speedy-router-nested-root-'))
    write(dir, '__root.tsx')
    write(dir, 'nested/__root.tsx')

    expect(() => scanRoutes({ routesDirectory: dir })).toThrow(
      'Root route file must be directly inside the routes directory',
    )
  })

  it('rejects multiple root route files', () => {
    const dir = mkdtempSync(join(tmpdir(), 'speedy-router-multiple-roots-'))
    write(dir, '__root.ts')
    write(dir, '__root.tsx')

    expect(() => scanRoutes({ routesDirectory: dir })).toThrow('Multiple root route files')
  })

  it('applies global ignore patterns consistently', () => {
    const pattern = /\.test\./g

    expect(matchesRouteFileIgnorePattern('first.test.tsx', pattern)).toBe(true)
    expect(matchesRouteFileIgnorePattern('second.test.tsx', pattern)).toBe(true)
    expect(matchesRouteFileIgnorePattern('third.test.tsx', pattern)).toBe(true)
  })

  it('preserves directory segments named route', () => {
    const dir = mkdtempSync(join(tmpdir(), 'speedy-router-route-directory-'))
    write(dir, '__root.tsx')
    write(dir, 'contact.tsx')
    write(dir, 'route/contact.tsx')

    const keys = scanRoutes({ routesDirectory: dir }).map((route) => route.key)

    expect(keys).toContain('/contact')
    expect(keys).toContain('/route/contact')
  })

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

  it('treats parenthesized route groups as pathless and strips them from URL paths', () => {
    const dir = mkdtempSync(join(tmpdir(), 'speedy-router-group-routes-'))
    write(dir, '__root.tsx')
    write(dir, '(auth)/login.tsx')
    write(dir, '(auth)/sign-up.tsx')
    write(dir, '(auth).tsx')
    write(dir, '(app)/(dashboard)/settings.tsx')

    const scanned = scanRoutes({ routesDirectory: dir })
    const byKey = Object.fromEntries(
      scanned.filter((route) => !route.isRoot).map((route) => [route.key, route]),
    )

    expect(byKey['/(auth)']?.path).toBeUndefined()
    expect(byKey['/(auth)']?.isPathless).toBe(true)
    expect(byKey['/(auth)/login']?.parentId).toBe('/(auth)')
    expect(byKey['/(auth)/login']?.path).toBe('/login')
    expect(byKey['/(auth)/sign-up']?.path).toBe('/sign-up')
    expect(byKey['/(app)/(dashboard)/settings']?.path).toBe('/settings')
  })

  it('keeps sibling group layouts that share a URL prefix pathless', () => {
    const dir = mkdtempSync(join(tmpdir(), 'speedy-router-sibling-groups-'))
    write(dir, '__root.tsx')
    write(dir, 'dashboard/(admin).tsx')
    write(dir, 'dashboard/(admin)/users.tsx')
    write(dir, 'dashboard/(viewer).tsx')
    write(dir, 'dashboard/(viewer)/stats.tsx')

    const scanned = scanRoutes({ routesDirectory: dir })
    const byKey = Object.fromEntries(
      scanned.filter((route) => !route.isRoot).map((route) => [route.key, route]),
    )

    expect(byKey['/dashboard/(admin)']?.isPathless).toBe(true)
    expect(byKey['/dashboard/(admin)']?.path).toBe('/dashboard')
    expect(byKey['/dashboard/(viewer)']?.isPathless).toBe(true)
    expect(byKey['/dashboard/(viewer)']?.path).toBe('/dashboard')
    expect(byKey['/dashboard/(admin)/users']?.parentId).toBe('/dashboard/(admin)')
    expect(byKey['/dashboard/(admin)/users']?.path).toBe('/users')
    expect(byKey['/dashboard/(viewer)/stats']?.parentId).toBe('/dashboard/(viewer)')
    expect(byKey['/dashboard/(viewer)/stats']?.path).toBe('/stats')
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

  it('sorts routes like TanStack: shallower keys before trailing-slash indexes', () => {
    const dir = mkdtempSync(join(tmpdir(), 'speedy-router-routes-sort-'))
    write(dir, '__root.tsx')
    write(dir, 'explore/index.tsx')
    write(dir, 'favorites.tsx')
    write(dir, 'explore.tsx')
    write(dir, 'i/index.tsx')

    const scanned = scanRoutes({ routesDirectory: dir })
    const keys = scanned.filter((route) => !route.isRoot).map((route) => route.key)
    expect(keys).toEqual(['/explore', '/favorites', '/explore/', '/i/'])
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

describe('routePathToVariable', () => {
  it('matches TanStack identifier names', () => {
    expect(routePathToVariable('/index')).toBe('Index')
    expect(routePathToVariable('/404')).toBe('R404')
    expect(routePathToVariable('/$username/_profile')).toBe('UsernameProfile')
    expect(routePathToVariable('/$username/_profile/affiliates')).toBe('UsernameProfileAffiliates')
    expect(routePathToVariable('/i/lists/$listId/index')).toBe('IListsListIdIndex')
    expect(routePathToVariable('/i/rate-limited')).toBe('IRateLimited')
    expect(routePathToVariable('/i/bounce/$')).toBe('IBounceSplat')
  })
})

describe('generateRouteTree', () => {
  it('escapes line terminators in single-quoted output', () => {
    const dir = mkdtempSync(join(tmpdir(), 'speedy-router-gen-newline-'))
    const routes = join(dir, 'routes')
    write(routes, '__root.tsx')
    write(routes, 'bad\nname.tsx')
    const generated = join(dir, 'routeTree.gen.ts')

    generateRouteTree({
      routesDirectory: routes,
      generatedRouteTree: generated,
    })
    const runtime = readFileSync(generated, 'utf8')

    expect(runtime).toContain('bad\\nname')
    expect(parseSync('routeTree.gen.ts', runtime).errors).toEqual([])
  })

  it('emits a TanStack-shaped single routeTree.gen.ts', () => {
    const dir = mkdtempSync(join(tmpdir(), 'speedy-router-gen-'))
    const routes = join(dir, 'routes')
    write(routes, '__root.tsx', 'export const Route = { options: {} }\n')
    write(routes, 'index.tsx')
    write(routes, 'settings.tsx')
    write(routes, 'page-0.tsx')
    const generated = join(dir, 'routeTree.gen.ts')
    const result = generateRouteTree({
      routesDirectory: routes,
      generatedRouteTree: generated,
    })

    expect(result.routeCount).toBe(4)
    const runtime = readFileSync(generated, 'utf8')

    expect(runtime).toContain("import { Route as rootRouteImport } from './routes/__root'")
    expect(runtime).toContain("import { Route as IndexRouteImport } from './routes/index'")
    expect(runtime).toContain("import { Route as SettingsRouteImport } from './routes/settings'")
    expect(runtime).toContain('IndexRouteImport.update({')
    expect(runtime).toContain("id: '/'")
    expect(runtime).toContain('export interface FileRouteTypes')
    expect(runtime).toContain("declare module '@tanstack/react-router'")
    expect(runtime).toContain("declare module 'speedy-router'")
    expect(runtime).toContain('._addFileChildren(rootRouteChildren)')
    expect(runtime).toContain('._addFileTypes<FileRouteTypes>()')
    expect(runtime).not.toContain('route.lazy')
    expect(runtime).not.toContain('() => import(')
    expect(existsSync(join(dir, 'routeTree.types.ts'))).toBe(false)
  })

  it('types fullPath without pathless underscore segments', () => {
    const dir = mkdtempSync(join(tmpdir(), 'speedy-router-gen-pathless-'))
    const routes = join(dir, 'routes')
    write(routes, '__root.tsx')
    write(routes, '$username/_profile.tsx')
    write(routes, '$username/_profile/affiliates.tsx')
    const generated = join(dir, 'routeTree.gen.ts')
    generateRouteTree({
      routesDirectory: routes,
      generatedRouteTree: generated,
    })
    const runtime = readFileSync(generated, 'utf8')
    expect(runtime).toContain("fullPath: '/$username/affiliates'")
    expect(runtime).toContain("path: '/$username'")
    expect(runtime).toContain("id: '/$username/_profile'")
    expect(runtime).toContain("id: '/affiliates'")
    expect(runtime).not.toContain("fullPath: '/$username/_profile/affiliates'")
    expect(runtime).toContain('UsernameProfileRouteImport.update({')
    expect(runtime).toContain('UsernameProfileAffiliatesRouteImport.update({')
    expect(runtime).toContain(
      'const UsernameProfileRouteWithChildren = UsernameProfileRoute._addFileChildren',
    )
  })

  it('does not collapse escaped pathless routes onto the index fullPath', () => {
    const dir = mkdtempSync(join(tmpdir(), 'speedy-router-gen-escaped-'))
    const routes = join(dir, 'routes')
    write(routes, '__root.tsx')
    write(routes, 'index.tsx')
    write(routes, '[_]auth.tsx')
    write(routes, '[@]modal.tsx')
    const generated = join(dir, 'routeTree.gen.ts')
    generateRouteTree({
      routesDirectory: routes,
      generatedRouteTree: generated,
    })
    const runtime = readFileSync(generated, 'utf8')

    expect(runtime).toContain("fullPath: '/_auth'")
    expect(runtime).toContain("fullPath: '/@modal'")
    expect(runtime).toContain("  '/': typeof IndexRoute")
    expect(runtime).toContain("  '/_auth': typeof Char91_Char93authRoute")
    expect(runtime).toContain("  '/@modal': typeof Char91AtChar93modalRoute")
    expect(runtime).not.toContain("  '/': typeof Char91_Char93authRoute")
    expect(runtime).not.toContain("  '/': typeof Char91AtChar93modalRoute")
  })

  it('eager-imports slot files instead of synthesizing createSlotRoute stubs', () => {
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
    expect(runtime).toContain(
      "import { Route as DashboardAtactivityRouteImport } from './routes/dashboard.@activity'",
    )
    expect(runtime).toContain('DashboardAtactivityRouteImport.update({')
    expect(runtime).not.toContain('createSlotRoute')
    expect(runtime).not.toContain("from 'speedy-router-core'")
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
    generateRouteTree({
      routesDirectory: routes,
      generatedRouteTree: generated,
    })
    expect(statSync(first.runtimePath).mtimeMs).toBe(runtimeBefore.mtimeMs)
    expect(statSync(first.runtimePath).ino).toBe(runtimeBefore.ino)
  })

  it('removes a leftover routeTree.types.ts from older generators', () => {
    const dir = mkdtempSync(join(tmpdir(), 'speedy-router-gen-stale-types-'))
    const routes = join(dir, 'routes')
    write(routes, '__root.tsx')
    write(routes, 'index.tsx')
    const generated = join(dir, 'routeTree.gen.ts')
    const staleTypes = join(dir, 'routeTree.types.ts')
    writeFileSync(staleTypes, 'export type FileRouteTypes = never\n')
    generateRouteTree({
      routesDirectory: routes,
      generatedRouteTree: generated,
    })
    expect(existsSync(staleTypes)).toBe(false)
  })
})

import { expectTypeOf, test } from 'vitest'
import {
  createFileRoute,
  createRootRoute,
  notFound,
  redirect,
  useRouter,
} from '@tanstack/react-router'
import type { AnyRouter } from '@tanstack/react-router'

const rootRoute = createRootRoute()

const homeRoute = createFileRoute('/home')({
  beforeLoad: () => {
    return { language: 'en' }
  },
})

declare module '@tanstack/react-router' {
  interface FileRoutesByPath {
    '/home': {
      preLoaderRoute: typeof homeRoute
      parentRoute: typeof rootRoute
      id: '/home'
      fullPath: '/home'
      path: '/home'
    }
  }
}

test('createFileRoute resolves routes declared on @tanstack/react-router', () => {
  expectTypeOf(homeRoute.id).toEqualTypeOf<'/home'>()
  expectTypeOf(homeRoute.fullPath).toEqualTypeOf<'/home'>()
  expectTypeOf(homeRoute.path).toEqualTypeOf<'/home'>()
})

test('unknown file routes are rejected', () => {
  // @ts-expect-error catalog-alias apps only register generated FileRoutesByPath keys
  createFileRoute('/not-a-registered-file-route')
})

test('useRouter is a registered router, not any', () => {
  expectTypeOf(useRouter()).toMatchTypeOf<AnyRouter>()
  expectTypeOf(useRouter()).not.toBeAny()
})

test('throw redirect and notFound are typed as Error', () => {
  expectTypeOf(redirect({ to: '/' })).toMatchTypeOf<Error>()
  expectTypeOf(notFound()).toMatchTypeOf<Error>()
})

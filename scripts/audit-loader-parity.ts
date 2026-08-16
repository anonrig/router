/**
 * Fixed-operation loader-count probe from TanStack/router#8087.
 *
 * Compares this workspace against published TanStack Router. Default staleTime
 * is 0 on both sides, so typed and changing-params rows must call the post
 * loader the same number of times.
 */
import { createMemoryHistory as createOursMemoryHistory } from '@anonrig/history'
import {
  createRootRoute as createOursRootRoute,
  createRoute as createOursRoute,
  createRouter as createOursRouter,
} from '@anonrig/router-core'
import { createMemoryHistory as createTanStackMemoryHistory } from '@tanstack/history'
import {
  createRootRoute as createTanStackRootRoute,
  createRoute as createTanStackRoute,
  createRouter as createTanStackRouter,
} from '@tanstack/react-router'

type Counter = { calls: number }

const typedDestinations = [
  { to: '/' },
  { to: '/posts' },
  { to: '/posts/$id', params: { id: '1' } },
  { to: '/posts/$id', params: { id: '2' } },
  { to: '/about' },
] as const

function createOursApp(counter: Counter) {
  const root = createOursRootRoute()
  const index = createOursRoute({ getParentRoute: () => root, path: '/' })
  const posts = createOursRoute({ getParentRoute: () => root, path: '/posts' })
  const post = createOursRoute({
    getParentRoute: () => root,
    path: '/posts/$id',
    loader: () => {
      counter.calls++
      return { title: 'Post' }
    },
  })
  const about = createOursRoute({ getParentRoute: () => root, path: '/about' })
  return createOursRouter({
    routeTree: root.addChildren([index, posts, post, about]),
    history: createOursMemoryHistory({ initialEntries: ['/'] }),
  })
}

function createTanStackApp(counter: Counter) {
  const root = createTanStackRootRoute()
  const index = createTanStackRoute({ getParentRoute: () => root, path: '/' })
  const posts = createTanStackRoute({ getParentRoute: () => root, path: '/posts' })
  const post = createTanStackRoute({
    getParentRoute: () => root,
    path: '/posts/$id',
    loader: () => {
      counter.calls++
      return { title: 'Post' }
    },
  })
  const about = createTanStackRoute({ getParentRoute: () => root, path: '/about' })
  return createTanStackRouter({
    routeTree: root.addChildren([index, posts, post, about]),
    history: createTanStackMemoryHistory({ initialEntries: ['/'] }),
  })
}

async function runTyped(router: { navigate: (options: any) => Promise<unknown> }) {
  for (let index = 0; index < 100; index++) {
    await router.navigate(typedDestinations[index % typedDestinations.length])
  }
}

async function runChangingParams(router: { navigate: (options: any) => Promise<unknown> }) {
  for (let index = 0; index < 100; index++) {
    await router.navigate({
      to: '/posts/$id',
      params: { id: String((index % 50) + 1) },
    })
  }
}

const oursSequential = { calls: 0 }
const tanStackSequential = { calls: 0 }
const oursSequentialRouter = createOursApp(oursSequential)
const tanStackSequentialRouter = createTanStackApp(tanStackSequential)
await runTyped(oursSequentialRouter)
await runTyped(tanStackSequentialRouter)
const typed = {
  ours: oursSequential.calls,
  tanstack: tanStackSequential.calls,
}
await runChangingParams(oursSequentialRouter)
await runChangingParams(tanStackSequentialRouter)
const sequentialChanging = {
  ours: oursSequential.calls - typed.ours,
  tanstack: tanStackSequential.calls - typed.tanstack,
}

const oursFresh = { calls: 0 }
const tanStackFresh = { calls: 0 }
await runChangingParams(createOursApp(oursFresh))
await runChangingParams(createTanStackApp(tanStackFresh))

const result = {
  operationsPerRow: 100,
  typed,
  changingParamsAfterTyped: sequentialChanging,
  changingParamsFreshRouter: {
    ours: oursFresh.calls,
    tanstack: tanStackFresh.calls,
  },
}

console.log(JSON.stringify(result, null, 2))

if (
  typed.ours !== typed.tanstack ||
  sequentialChanging.ours !== sequentialChanging.tanstack ||
  oursFresh.calls !== tanStackFresh.calls
) {
  process.exitCode = 1
}

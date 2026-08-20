import type { PropsWithChildren, ReactNode } from 'react'
import { cleanup, render } from '@testing-library/react'
import { bench, describe } from 'vitest'
import {
  Link,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  interpolatePath,
  useRouter,
} from '@tanstack/react-router'
import type { LinkProps } from '@tanstack/react-router'

function renderProvider(router: ReturnType<typeof createRouter>) {
  render(<RouterProvider router={router} />)
  cleanup()
}

const createRouterRenderer = (routesCount: number) => (children: ReactNode) => {
  const rootRoute = createRootRoute()
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => children,
  })
  const paramRoutes = Array.from({ length: routesCount }).map((_, i) =>
    createRoute({
      getParentRoute: () => rootRoute,
      path: `/params/$param${i}`,
    }),
  )
  const routeTree = rootRoute.addChildren([indexRoute, ...paramRoutes])
  return createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
}

// Long warmup and sampling windows for stable local wall-clock numbers:
// each iteration renders thousands of links, so the default 500ms budget only
// collects a few dozen samples. CodSpeed's instrumented runs ignore these.
const BENCH_OPTIONS = { warmupIterations: 5, warmupTime: 500, time: 2000 }

const InterpolatePathLink = ({ to, params, children }: PropsWithChildren<LinkProps>) => {
  const href = interpolatePath({ path: to, params }).interpolatedPath
  return <a href={href}>{children}</a>
}

const BuildLocationLink = ({ children, ...props }: PropsWithChildren<LinkProps>) => {
  const router = useRouter()
  const { href } = router.buildLocation(props)
  return <a href={href}>{children}</a>
}

describe.each([
  {
    name: 'small router',
    numberOfRoutes: 1,
    matchedParamId: 0, // range from 0 to numberOfRoutes-1
    numberOfLinks: 5000,
  },
  {
    name: 'medium router',
    numberOfRoutes: 1000,
    matchedParamId: 500, // range from 0 to numberOfRoutes-1
    numberOfLinks: 5000,
  },
  // {
  //   name: 'large router',
  //   numberOfRoutes: 10000,
  //   matchedParamId: 9999, // range from 0 to numberOfRoutes-1
  //   numberOfLinks: 15000,
  // },
])('$name', ({ numberOfRoutes, numberOfLinks, matchedParamId }) => {
  const renderRouter = createRouterRenderer(numberOfRoutes)

  bench(
    'hardcoded href',
    () => {
      const router = renderRouter(
        Array.from({ length: numberOfLinks }).map((_, i) => (
          <a key={i} href={`/params/${i}`}>
            {i}
          </a>
        )),
      )
      renderProvider(router)
    },
    BENCH_OPTIONS,
  )

  bench(
    'interpolate path',
    () => {
      const router = renderRouter(
        Array.from({ length: numberOfLinks }).map((_, i) => (
          <InterpolatePathLink
            key={i}
            to={`/params/$param${Math.min(i, matchedParamId)}`}
            params={{ [`param${Math.min(i, matchedParamId)}`]: i }}
          >
            {i}
          </InterpolatePathLink>
        )),
      )
      renderProvider(router)
    },
    BENCH_OPTIONS,
  )

  bench(
    'build location',
    () => {
      const router = renderRouter(
        Array.from({ length: numberOfLinks }).map((_, i) => (
          <BuildLocationLink
            key={i}
            to={`/params/$param${Math.min(i, matchedParamId)}`}
            params={{ [`param${Math.min(i, matchedParamId)}`]: i }}
          >
            {i}
          </BuildLocationLink>
        )),
      )
      renderProvider(router)
    },
    BENCH_OPTIONS,
  )

  bench(
    'link to absolute path',
    () => {
      const router = renderRouter(
        Array.from({ length: numberOfLinks }).map((_, i) => (
          <Link
            key={i}
            to={`/params/$param${Math.min(i, matchedParamId)}`}
            params={{ [`param${Math.min(i, matchedParamId)}`]: i }}
          >
            {i}
          </Link>
        )),
      )
      renderProvider(router)
    },
    BENCH_OPTIONS,
  )

  bench(
    'link to relative path',
    () => {
      const router = renderRouter(
        Array.from({ length: numberOfLinks }).map((_, i) => {
          const to = `./params/$param${Math.min(i, matchedParamId)}`

          return (
            <Link key={i} from="/" to={to} params={{ [`param${Math.min(i, matchedParamId)}`]: i }}>
              {i}
            </Link>
          )
        }),
      )
      renderProvider(router)
    },
    BENCH_OPTIONS,
  )

  bench(
    'link to current path',
    () => {
      const router = renderRouter(
        Array.from({ length: numberOfLinks }).map((_, i) => (
          <Link key={i} from="/" search={{ param: i }}>
            {i}
          </Link>
        )),
      )
      renderProvider(router)
    },
    BENCH_OPTIONS,
  )
})

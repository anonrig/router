import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import {
  Link,
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  getRouteApi,
} from '../src'

afterEach(() => {
  cleanup()
})

describe('getRouteApi', () => {
  it('exposes the same hooks as createRoute', () => {
    const api = getRouteApi('foo')
    const route = createRoute({} as any)
    for (const name of Object.keys(api).filter((key) => key.startsWith('use'))) {
      expect(route[name as keyof typeof route]).toBeDefined()
    }
  })
})

describe('RouterProvider', () => {
  it('renders the matched route and navigates via Link', async () => {
    const rootRoute = createRootRoute({
      component: () => (
        <div>
          <Link to="/about">About</Link>
          <Outlet />
        </div>
      ),
    })
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => <h1>Home</h1>,
    })
    const aboutRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/about',
      component: () => <h1>About page</h1>,
    })
    const router = createRouter({
      routeTree: rootRoute.addChildren([indexRoute, aboutRoute]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })

    render(<RouterProvider router={router} />)

    expect(await screen.findByText('Home')).toBeInTheDocument()
    ;(await screen.findByText('About')).click()
    expect(await screen.findByText('About page')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/about')
  })

  it('runs loaders and beforeLoad', async () => {
    const rootRoute = createRootRoute()
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      beforeLoad: () => ({ fromBefore: true }),
      loader: ({ context }) => ({ hello: 'world', ...context }),
      component: () => {
        const data = indexRoute.useLoaderData()
        return (
          <div>
            {data.hello}-{String(data.fromBefore)}
          </div>
        )
      },
    })
    const router = createRouter({
      routeTree: rootRoute.addChildren([indexRoute]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })

    render(<RouterProvider router={router} />)
    expect(await screen.findByText('world-true')).toBeInTheDocument()
  })
})

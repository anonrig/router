import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  Link,
  Outlet,
  RouterProvider,
  createLink,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '../src'

afterEach(() => {
  cleanup()
})

function renderTree(initial = '/') {
  const rootRoute = createRootRoute({
    component: () => (
      <div>
        <Outlet />
      </div>
    ),
  })
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => (
      <div>
        <h1>Home</h1>
        <Link to="/about">About</Link>
        <Link to="/about" href={'#' as any}>
          About with hash href
        </Link>
        <Link to="https://example.com">External</Link>
        <Link to="https://example.com" disabled>
          Disabled external
        </Link>
        <Link to="/about" disabled>
          Disabled about
        </Link>
      </div>
    ),
  })
  const aboutRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/about',
    component: () => (
      <div>
        <h1>About page</h1>
        <Link to="/">Home</Link>
      </div>
    ),
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute, aboutRoute]),
    history: createMemoryHistory({ initialEntries: [initial] }),
  })
  render(<RouterProvider router={router} />)
  return router
}

describe('Link', () => {
  it('navigates on click', async () => {
    const router = renderTree()
    expect(await screen.findByText('Home')).toBeInTheDocument()
    fireEvent.click(await screen.findByRole('link', { name: 'About' }))
    expect(await screen.findByText('About page')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/about')
  })

  it('does not let a leftover href override to', async () => {
    const router = renderTree()
    fireEvent.click(await screen.findByRole('link', { name: 'About with hash href' }))
    expect(await screen.findByText('About page')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/about')
  })

  it('renders an href for internal links', async () => {
    renderTree()
    expect(await screen.findByRole('link', { name: 'About' })).toHaveAttribute('href', '/about')
  })

  it('suppresses href and navigation when disabled', async () => {
    const router = renderTree()
    const onClick = vi.fn()
    const link = await screen.findByRole('link', { name: 'Disabled about' })
    expect(link).not.toHaveAttribute('href')
    expect(link).toHaveAttribute('aria-disabled', 'true')
    fireEvent.click(link)
    expect(router.state.location.pathname).toBe('/')
    expect(screen.getByText('Home')).toBeInTheDocument()

    cleanup()
    const rootRoute = createRootRoute({
      component: () => (
        <Link to="/about" disabled onClick={onClick}>
          Disabled
        </Link>
      ),
    })
    const aboutRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/about',
      component: () => <h1>About page</h1>,
    })
    const router2 = createRouter({
      routeTree: rootRoute.addChildren([aboutRoute]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })
    render(<RouterProvider router={router2} />)
    fireEvent.click(await screen.findByRole('link', { name: 'Disabled' }))
    expect(onClick).toHaveBeenCalled()
    expect(router2.state.location.pathname).toBe('/')
  })

  it('suppresses href on disabled external links and does not follow them', async () => {
    renderTree()
    const link = await screen.findByRole('link', { name: 'Disabled external' })
    expect(link).not.toHaveAttribute('href')
    expect(link).toHaveAttribute('aria-disabled', 'true')
    const event = new MouseEvent('click', { bubbles: true, cancelable: true })
    link.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
  })

  it('keeps enabled external links as hrefs', async () => {
    renderTree()
    expect(await screen.findByRole('link', { name: 'External' })).toHaveAttribute(
      'href',
      'https://example.com',
    )
  })

  it('does not navigate when the user handler calls preventDefault', async () => {
    const rootRoute = createRootRoute({
      component: () => (
        <Link
          to="/about"
          onClick={(event) => {
            event.preventDefault()
          }}
        >
          Stay
        </Link>
      ),
    })
    const aboutRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/about',
      component: () => <h1>About page</h1>,
    })
    const blocked = createRouter({
      routeTree: rootRoute.addChildren([aboutRoute]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })
    render(<RouterProvider router={blocked} />)
    fireEvent.click(await screen.findByRole('link', { name: 'Stay' }))
    expect(blocked.state.location.pathname).toBe('/')
  })

  it('passes disabled through createLink hosts and keeps leftover href from winning', async () => {
    const ButtonLink = createLink('button')
    const rootRoute = createRootRoute({
      component: () => (
        <div>
          <ButtonLink to="/about" disabled>
            Disabled button
          </ButtonLink>
          <Link to="/about" href={'#' as any}>
            About leftover
          </Link>
          <Outlet />
        </div>
      ),
    })
    const aboutRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/about',
      component: () => <h1>About page</h1>,
    })
    const router = createRouter({
      routeTree: rootRoute.addChildren([aboutRoute]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })
    cleanup()
    render(<RouterProvider router={router} />)
    const button = await screen.findByRole('link', { name: 'Disabled button' })
    expect(button).toBeDisabled()
    fireEvent.click(button)
    expect(router.state.location.pathname).toBe('/')
    fireEvent.click(await screen.findByRole('link', { name: 'About leftover' }))
    expect(await screen.findByText('About page')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/about')
  })

  it('navigates through Route.Link with from set', async () => {
    const rootRoute = createRootRoute()
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => {
        return (
          <div>
            <h1>Home</h1>
            <indexRoute.Link to="/posts">Posts</indexRoute.Link>
          </div>
        )
      },
    })
    const postsRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/posts',
      component: () => <h1>Posts page</h1>,
    })
    const router = createRouter({
      routeTree: rootRoute.addChildren([indexRoute, postsRoute]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })
    render(<RouterProvider router={router} />)
    fireEvent.click(await screen.findByRole('link', { name: 'Posts' }))
    expect(await screen.findByText('Posts page')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/posts')
  })

  it('observes viewport preload when the caller passes a callback ref', async () => {
    const observed: Element[] = []
    const callbackNodes: Array<HTMLAnchorElement | null> = []
    class FakeIntersectionObserver {
      observe(node: Element) {
        observed.push(node)
      }
      disconnect() {}
      unobserve() {}
      takeRecords() {
        return []
      }
    }
    vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver)

    const rootRoute = createRootRoute({
      component: () => (
        <Link
          to="/about"
          preload="viewport"
          ref={(node) => {
            callbackNodes.push(node)
          }}
        >
          About
        </Link>
      ),
    })
    const aboutRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/about',
      component: () => <h1>About page</h1>,
    })
    const router = createRouter({
      routeTree: rootRoute.addChildren([aboutRoute]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })
    render(<RouterProvider router={router} />)
    const link = await screen.findByRole('link', { name: 'About' })
    expect(observed).toContain(link)
    expect(callbackNodes.some((node) => node === link)).toBe(true)
    vi.unstubAllGlobals()
  })

  const nextFrame = () =>
    new Promise<void>((resolve) => {
      requestAnimationFrame(() => resolve())
    })

  function renderProximityLink(preloadDelay: number) {
    const rootRoute = createRootRoute({
      component: () => (
        <Link to="/about" preload="intent" preloadIntentProximity={100} preloadDelay={preloadDelay}>
          About
        </Link>
      ),
    })
    const aboutRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/about',
      component: () => <h1>About page</h1>,
    })
    const router = createRouter({
      routeTree: rootRoute.addChildren([aboutRoute]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })
    const preloadSpy = vi.spyOn(router, 'preloadRoute').mockResolvedValue(undefined)
    render(<RouterProvider router={router} />)
    return preloadSpy
  }

  function mockLinkRect(link: HTMLElement) {
    link.getBoundingClientRect = () =>
      ({ top: 0, left: 0, right: 40, bottom: 20, width: 40, height: 20, x: 0, y: 0 }) as DOMRect
  }

  it('preloads intent links when the pointer enters the proximity radius', async () => {
    const preloadSpy = renderProximityLink(0)
    mockLinkRect(await screen.findByRole('link', { name: 'About' }))

    fireEvent.pointerMove(document, { clientX: 500, clientY: 500 })
    await nextFrame()
    expect(preloadSpy).not.toHaveBeenCalled()

    fireEvent.pointerMove(document, { clientX: 110, clientY: 10 })
    await nextFrame()
    expect(preloadSpy).toHaveBeenCalled()
  })

  it('cancels a proximity preload when the pointer leaves the radius before the delay', async () => {
    const preloadSpy = renderProximityLink(200)
    mockLinkRect(await screen.findByRole('link', { name: 'About' }))

    fireEvent.pointerMove(document, { clientX: 110, clientY: 10 })
    await nextFrame()
    fireEvent.pointerMove(document, { clientX: 500, clientY: 500 })
    await nextFrame()

    await new Promise((resolve) => {
      setTimeout(resolve, 300)
    })
    expect(preloadSpy).not.toHaveBeenCalled()
  })
})

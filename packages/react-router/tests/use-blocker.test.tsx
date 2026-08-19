import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  useBlocker,
  useRouter,
} from '../src'

afterEach(() => {
  cleanup()
})

function BlockerComponent() {
  const router = useRouter()
  const blocker = useBlocker({
    withResolver: true,
    shouldBlockFn: () => true,
  })

  return (
    <div>
      <div data-testid="status">{blocker.status}</div>
      <div data-testid="current-path">{blocker.current?.pathname ?? 'none'}</div>
      <div data-testid="next-path">{blocker.next?.pathname ?? 'none'}</div>
      <div data-testid="action">{blocker.action ?? 'none'}</div>
      <div data-testid="has-proceed">{typeof blocker.proceed === 'function' ? 'yes' : 'no'}</div>
      <div data-testid="has-reset">{typeof blocker.reset === 'function' ? 'yes' : 'no'}</div>
      <button
        type="button"
        data-testid="nav-btn"
        onClick={() => void router.navigate({ to: '/about' })}
      >
        Navigate to About
      </button>
      {blocker.status === 'blocked' && (
        <>
          <button type="button" data-testid="proceed-btn" onClick={() => blocker.proceed()}>
            Proceed
          </button>
          <button type="button" data-testid="reset-btn" onClick={() => blocker.reset()}>
            Reset
          </button>
        </>
      )}
    </div>
  )
}

function BeforeUnloadBlocker() {
  const [enabled, setEnabled] = useState(true)
  useBlocker({
    shouldBlockFn: () => true,
    enableBeforeUnload: enabled,
  })
  return (
    <button type="button" onClick={() => setEnabled(false)}>
      Disable before unload
    </button>
  )
}

function createBlockerRouter() {
  const rootRoute = createRootRoute({
    component: () => (
      <div>
        <BlockerComponent />
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
    component: () => <h1>About</h1>,
  })
  const otherRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/other',
    component: () => <h1>Other</h1>,
  })
  return createRouter({
    routeTree: rootRoute.addChildren([indexRoute, aboutRoute, otherRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
}

describe('useBlocker withResolver', () => {
  it('exposes undefined for navigation fields and resolver functions when idle', async () => {
    const router = createBlockerRouter()
    render(<RouterProvider router={router} />)

    expect(await screen.findByTestId('status')).toHaveTextContent('idle')
    expect(screen.getByTestId('current-path').textContent).toBe('none')
    expect(screen.getByTestId('next-path').textContent).toBe('none')
    expect(screen.getByTestId('action').textContent).toBe('none')
    expect(screen.getByTestId('has-proceed').textContent).toBe('no')
    expect(screen.getByTestId('has-reset').textContent).toBe('no')
  })

  it('exposes current, next, action, proceed, and reset when navigation is blocked', async () => {
    const router = createBlockerRouter()
    render(<RouterProvider router={router} />)

    // Wait for initial render and blocker registration
    expect(await screen.findByTestId('status')).toHaveTextContent('idle')

    // Trigger navigation to /about
    fireEvent.click(screen.getByTestId('nav-btn'))

    expect(await screen.findByText('blocked')).toBeInTheDocument()
    expect(screen.getByTestId('current-path').textContent).toBe('/')
    expect(screen.getByTestId('next-path').textContent).toBe('/about')
    expect(screen.getByTestId('action').textContent).toBe('PUSH')
    expect(screen.getByTestId('has-proceed').textContent).toBe('yes')
    expect(screen.getByTestId('has-reset').textContent).toBe('yes')

    // Click proceed
    fireEvent.click(screen.getByTestId('proceed-btn'))

    expect(await screen.findByText('About')).toBeInTheDocument()
    expect(screen.getByTestId('status').textContent).toBe('idle')
    expect(screen.getByTestId('next-path').textContent).toBe('none')
  })

  it('cancels navigation and returns to idle when reset is called', async () => {
    const router = createBlockerRouter()
    render(<RouterProvider router={router} />)

    // Wait for initial render and blocker registration
    expect(await screen.findByTestId('status')).toHaveTextContent('idle')

    // Trigger navigation to /about
    fireEvent.click(screen.getByTestId('nav-btn'))

    expect(await screen.findByText('blocked')).toBeInTheDocument()

    // Click reset to cancel
    fireEvent.click(screen.getByTestId('reset-btn'))

    expect(screen.getByTestId('status').textContent).toBe('idle')
    expect(router.state.location.pathname).toBe('/')
    expect(screen.getByTestId('next-path').textContent).toBe('none')
  })

  it('ignores a stale shouldBlockFn result after a newer navigation', async () => {
    const first = Promise.withResolvers<boolean>()
    const second = Promise.withResolvers<boolean>()
    let calls = 0
    function DelayedBlockerComponent() {
      const router = useRouter()
      const blocker = useBlocker({
        withResolver: true,
        shouldBlockFn: () => (++calls === 1 ? first.promise : second.promise),
      })
      return (
        <div>
          <div data-testid="status">{blocker.status}</div>
          <div data-testid="next-path">{blocker.next?.pathname ?? 'none'}</div>
          <button type="button" data-testid="proceed-btn" onClick={() => blocker.proceed?.()}>
            Proceed
          </button>
          <button
            type="button"
            data-testid="nav-about"
            onClick={() => void router.navigate({ to: '/about' })}
          >
            About
          </button>
          <button
            type="button"
            data-testid="nav-other"
            onClick={() => void router.navigate({ to: '/other' })}
          >
            Other
          </button>
        </div>
      )
    }
    const rootRoute = createRootRoute({
      component: () => (
        <div>
          <DelayedBlockerComponent />
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
      component: () => <h1>About</h1>,
    })
    const otherRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/other',
      component: () => <h1>Other</h1>,
    })
    const router = createRouter({
      routeTree: rootRoute.addChildren([indexRoute, aboutRoute, otherRoute]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })
    render(<RouterProvider router={router} />)
    expect(await screen.findByTestId('status')).toHaveTextContent('idle')

    fireEvent.click(screen.getByTestId('nav-about'))
    fireEvent.click(screen.getByTestId('nav-other'))
    second.resolve(true)
    first.resolve(true)

    expect(await screen.findByText('/other')).toBeInTheDocument()
    expect(screen.getByTestId('status').textContent).toBe('blocked')
    fireEvent.click(screen.getByTestId('proceed-btn'))
    expect(await screen.findByText('Other')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/other')
  })

  it('ignores an in-flight attempt that a disabled navigation supersedes', async () => {
    const pending = Promise.withResolvers<boolean>()
    let calls = 0
    function ToggleBlockerComponent() {
      const [disabled, setDisabled] = useState(false)
      const blocker = useBlocker({
        withResolver: true,
        disabled,
        shouldBlockFn: () => {
          calls++
          return pending.promise
        },
      })
      return (
        <div>
          <div data-testid="status">{blocker.status}</div>
          <button type="button" data-testid="disable-btn" onClick={() => setDisabled(true)}>
            Disable
          </button>
        </div>
      )
    }
    const rootRoute = createRootRoute({
      component: () => (
        <div>
          <ToggleBlockerComponent />
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
      component: () => <h1>About</h1>,
    })
    const otherRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/other',
      component: () => <h1>Other</h1>,
    })
    const router = createRouter({
      routeTree: rootRoute.addChildren([indexRoute, aboutRoute, otherRoute]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })
    render(<RouterProvider router={router} />)
    expect(await screen.findByTestId('status')).toHaveTextContent('idle')

    let first!: Promise<void>
    act(() => {
      first = router.navigate({ to: '/about' })
    })
    expect(calls).toBe(1)

    // The disabled attempt returns early, but it must still claim a generation.
    fireEvent.click(screen.getByTestId('disable-btn'))
    let second!: Promise<void>
    await act(async () => {
      second = router.navigate({ to: '/other' })
      await second
    })
    expect(await screen.findByText('Other')).toBeInTheDocument()

    // The first attempt lands after the newer navigation already continued.
    pending.resolve(true)
    await act(async () => {
      await first
    })
    expect(screen.getByTestId('status').textContent).toBe('idle')
    expect(router.state.location.pathname).toBe('/other')
  })

  it('keeps the newer resolver when the older attempt settles first', async () => {
    const first = Promise.withResolvers<boolean>()
    const second = Promise.withResolvers<boolean>()
    let calls = 0
    function DelayedBlockerComponent() {
      const blocker = useBlocker({
        withResolver: true,
        shouldBlockFn: () => (++calls === 1 ? first.promise : second.promise),
      })
      return (
        <div>
          <div data-testid="status">{blocker.status}</div>
          <div data-testid="next-path">{blocker.next?.pathname ?? 'none'}</div>
          <button type="button" data-testid="proceed-btn" onClick={() => blocker.proceed?.()}>
            Proceed
          </button>
        </div>
      )
    }
    const rootRoute = createRootRoute({
      component: () => (
        <div>
          <DelayedBlockerComponent />
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
      component: () => <h1>About</h1>,
    })
    const otherRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/other',
      component: () => <h1>Other</h1>,
    })
    const router = createRouter({
      routeTree: rootRoute.addChildren([indexRoute, aboutRoute, otherRoute]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })
    render(<RouterProvider router={router} />)
    expect(await screen.findByTestId('status')).toHaveTextContent('idle')

    let firstNav!: Promise<void>
    act(() => {
      firstNav = router.navigate({ to: '/about' })
    })
    let secondNav!: Promise<void>
    act(() => {
      secondNav = router.navigate({ to: '/other' })
    })
    expect(calls).toBe(2)

    // The older attempt settles first here, the opposite order of the test above.
    first.resolve(true)
    await act(async () => {
      await Promise.resolve()
    })
    second.resolve(true)

    expect(await screen.findByText('blocked')).toBeInTheDocument()
    expect(screen.getByTestId('next-path').textContent).toBe('/other')

    fireEvent.click(screen.getByTestId('proceed-btn'))
    await act(async () => {
      await Promise.all([firstNav, secondNav])
    })
    expect(await screen.findByText('Other')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/other')
  })

  it('settles a pending shouldBlockFn when the blocker unmounts', async () => {
    const pending = Promise.withResolvers<boolean>()
    function PendingBlockerComponent() {
      const blocker = useBlocker({
        withResolver: true,
        shouldBlockFn: () => pending.promise,
      })
      return <div data-testid="status">{blocker.status}</div>
    }
    const rootRoute = createRootRoute({
      component: () => (
        <div>
          <PendingBlockerComponent />
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
      component: () => <h1>About</h1>,
    })
    const router = createRouter({
      routeTree: rootRoute.addChildren([indexRoute, aboutRoute]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })
    const view = render(<RouterProvider router={router} />)
    expect(await screen.findByTestId('status')).toHaveTextContent('idle')

    let navigation!: Promise<void>
    act(() => {
      navigation = router.navigate({ to: '/about' })
    })

    // shouldBlockFn is still pending here, so cleanup cannot rely on an installed resolver.
    view.unmount()
    pending.resolve(true)
    await navigation
    expect(router.state.location.pathname).toBe('/')
  })

  it('settles a superseded resolver navigation', async () => {
    const router = createBlockerRouter()
    render(<RouterProvider router={router} />)
    expect(await screen.findByTestId('status')).toHaveTextContent('idle')

    let first!: Promise<void>
    act(() => {
      first = router.history.push('/about') as unknown as Promise<void>
    })
    expect(await screen.findByText('blocked')).toBeInTheDocument()

    let second!: Promise<void>
    act(() => {
      second = router.history.push('/other') as unknown as Promise<void>
    })
    expect(await screen.findByText('/other')).toBeInTheDocument()
    await first

    fireEvent.click(screen.getByTestId('proceed-btn'))
    await second
    expect(await screen.findByText('Other')).toBeInTheDocument()
  })

  it('settles an active resolver when the blocker unmounts', async () => {
    const router = createBlockerRouter()
    const view = render(<RouterProvider router={router} />)
    expect(await screen.findByTestId('status')).toHaveTextContent('idle')

    let navigation!: Promise<void>
    act(() => {
      navigation = router.navigate({ to: '/about' })
    })
    expect(await screen.findByText('blocked')).toBeInTheDocument()

    view.unmount()
    await navigation
    expect(router.state.location.pathname).toBe('/')
  })
})

describe('useBlocker options', () => {
  it('updates enableBeforeUnload without re-registering the blocker', async () => {
    const rootRoute = createRootRoute({ component: BeforeUnloadBlocker })
    const indexRoute = createRoute({ getParentRoute: () => rootRoute, path: '/' })
    const history = createMemoryHistory({ initialEntries: ['/'] })
    const router = createRouter({
      routeTree: rootRoute.addChildren([indexRoute]),
      history,
    })
    render(<RouterProvider router={router} />)
    const button = await screen.findByText('Disable before unload')
    const blocker = (history as any).blockers[0]
    const isEnabled = () =>
      typeof blocker.enableBeforeUnload === 'function'
        ? blocker.enableBeforeUnload()
        : blocker.enableBeforeUnload
    expect(isEnabled()).toBe(true)

    fireEvent.click(button)

    expect(isEnabled()).toBe(false)
  })
})

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
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

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
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
      <button data-testid="nav-btn" onClick={() => void router.navigate({ to: '/about' })}>
        Navigate to About
      </button>
      {blocker.status === 'blocked' && (
        <>
          <button data-testid="proceed-btn" onClick={() => blocker.proceed()}>
            Proceed
          </button>
          <button data-testid="reset-btn" onClick={() => blocker.reset()}>
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
  return createRouter({
    routeTree: rootRoute.addChildren([indexRoute, aboutRoute]),
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
})

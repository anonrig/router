import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  Link,
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '../src'

afterEach(() => {
  cleanup()
})

function createTestRouter(component: () => ReactNode) {
  const rootRoute = createRootRoute({
    component,
  })
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => <Outlet />,
  })
  return createRouter({
    routeTree: rootRoute.addChildren([indexRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
}

describe('<Link> disabled external links', () => {
  it('does not render href on disabled external links', async () => {
    const router = createTestRouter(() => (
      <div>
        <Link to="https://example.com" disabled>
          Disabled External
        </Link>
        <Link to="https://example.com">Enabled External</Link>
      </div>
    ))

    render(<RouterProvider router={router} />)

    const disabledLink = await screen.findByText('Disabled External')
    const enabledLink = await screen.findByText('Enabled External')

    expect(enabledLink).toHaveAttribute('href', 'https://example.com')
    expect(disabledLink).not.toHaveAttribute('href')
    expect(disabledLink).toHaveAttribute('aria-disabled', 'true')
  })

  it('prevents default click action on disabled external links while still invoking onClick', async () => {
    const handleClick = vi.fn()
    const router = createTestRouter(() => (
      <div>
        <Link to="https://example.com" disabled onClick={handleClick}>
          Disabled External
        </Link>
      </div>
    ))

    render(<RouterProvider router={router} />)

    const disabledLink = await screen.findByText('Disabled External')
    const event = fireEvent.click(disabledLink)

    expect(handleClick).toHaveBeenCalledTimes(1)
    // fireEvent.click returns false if e.preventDefault() was called
    expect(event).toBe(false)
  })

  it('does not render href on disabled internal links', async () => {
    const router = createTestRouter(() => (
      <div>
        <Link to="/about" disabled>
          Disabled Internal
        </Link>
      </div>
    ))

    render(<RouterProvider router={router} />)

    const disabledLink = await screen.findByText('Disabled Internal')
    expect(disabledLink).not.toHaveAttribute('href')
    expect(disabledLink).toHaveAttribute('aria-disabled', 'true')
  })
})

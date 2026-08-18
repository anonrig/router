import { afterEach, expect, test } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { createMemoryHistory } from '@tanstack/history'
import {
  Link,
  Outlet,
  RouterProvider,
  Slots,
  createRootRoute,
  createRoute,
  createRouter,
  createSlotRoute,
} from '@tanstack/react-router'

afterEach(() => {
  cleanup()
})

function createApp() {
  const rootRoute = createRootRoute({
    component: () => (
      <>
        <Outlet />
        <Outlet slot="modal" fallback={null} />
      </>
    ),
  })
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => (
      <div>
        <span>Home</span>
        <Link to="/@modal/users/$id" params={{ id: '42' }}>
          Open user
        </Link>
        <Link from="/" slots={{ modal: null }}>
          Close modal
        </Link>
      </div>
    ),
  })
  const dashboardRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/dashboard',
    component: () => (
      <div>
        <span>Dashboard</span>
        <Outlet slot="activity" />
      </div>
    ),
  })
  const modalRoute = createSlotRoute({
    slot: 'modal',
    getParentRoute: () => rootRoute,
    component: () => (
      <div>
        <span>Modal shell</span>
        <Outlet />
      </div>
    ),
  })
  const modalUserRoute = createSlotRoute({
    getParentRoute: () => modalRoute,
    path: '/users/$id',
    loader: ({ params }: { params: { id: string } }) => ({ title: `User ${params.id}` }),
    component: () => {
      const data = modalUserRoute.useLoaderData() as { title: string }
      return <span>{data.title}</span>
    },
  })
  const activityRoute = createSlotRoute({
    slot: 'activity',
    getParentRoute: () => dashboardRoute,
    component: () => <span>Activity root</span>,
  })
  modalRoute.addChildren([modalUserRoute])
  dashboardRoute.addChildren([activityRoute])
  rootRoute.addChildren([indexRoute, dashboardRoute, modalRoute])
  return { rootRoute, modalUserRoute }
}

test('renders a default-open scoped slot and a fully qualified modal navigation', async () => {
  const { rootRoute } = createApp()
  const router = createRouter({
    routeTree: rootRoute,
    history: createMemoryHistory({ initialEntries: ['/dashboard'] }),
  })
  render(<RouterProvider router={router} />)
  expect(await screen.findByText('Dashboard')).toBeInTheDocument()
  expect(await screen.findByText('Activity root')).toBeInTheDocument()

  await router.navigate({ to: '/@modal/users/$id', params: { id: '7' } } as any)
  expect(await screen.findByText('Modal shell')).toBeInTheDocument()
  expect(await screen.findByText('User 7')).toBeInTheDocument()
  expect(router.state.location.pathname).toBe('/dashboard')
  expect(router.state.location.search['@modal']).toBe('/users/7')
})

test('Link slots={null} closes a modal and leaves the main route', async () => {
  const { rootRoute } = createApp()
  const router = createRouter({
    routeTree: rootRoute,
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  render(<RouterProvider router={router} />)
  expect(await screen.findByText('Home')).toBeInTheDocument()
  await router.navigate({ to: '/@modal/users/$id', params: { id: '42' } } as any)
  expect(await screen.findByText('User 42')).toBeInTheDocument()
  await router.navigate({ slots: { modal: null } } as any)
  expect(screen.queryByText('User 42')).not.toBeInTheDocument()
  expect(router.state.location.search['@modal']).toBeUndefined()
})

test('Slots re-renders when a sibling slot opens and closes', async () => {
  const rootRoute = createRootRoute({
    component: () => (
      <>
        <Outlet />
        <Slots>
          {(slots) => (
            <div>
              {slots.map((slot) => (
                <div key={slot.name}>
                  <span>{slot.isOpen ? `${slot.name} open` : `${slot.name} closed`}</span>
                  <slot.Outlet fallback={null} />
                </div>
              ))}
            </div>
          )}
        </Slots>
      </>
    ),
  })
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => <span>Home</span>,
  })
  const modalRoute = createSlotRoute({
    slot: 'modal',
    getParentRoute: () => rootRoute,
    component: () => <span>Modal body</span>,
  })
  rootRoute.addChildren([indexRoute, modalRoute])
  const router = createRouter({
    routeTree: rootRoute,
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  render(<RouterProvider router={router} />)
  expect(await screen.findByText('Home')).toBeInTheDocument()
  expect(await screen.findByText('modal open')).toBeInTheDocument()
  await router.navigate({ slots: { modal: false } } as any)
  expect(await screen.findByText('modal closed')).toBeInTheDocument()
  expect(screen.queryByText('Modal body')).not.toBeInTheDocument()
  await router.navigate({ slots: { modal: {} } } as any)
  expect(await screen.findByText('modal open')).toBeInTheDocument()
  expect(await screen.findByText('Modal body')).toBeInTheDocument()
})

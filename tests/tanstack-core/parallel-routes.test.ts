import { describe, expect, test } from 'vitest'
import { createMemoryHistory } from '@anonrig/history'
import { createRootRoute, createRoute, createRouter, createSlotRoute } from '@anonrig/router-core'

function createSlotApp() {
  const root = createRootRoute()
  const index = createRoute({ getParentRoute: () => root, path: '/' })
  const dashboard = createRoute({ getParentRoute: () => root, path: '/dashboard' })
  const settings = createRoute({ getParentRoute: () => root, path: '/settings' })
  const modal = createSlotRoute({
    slot: 'modal',
    getParentRoute: () => root,
    component: () => null,
  })
  const modalUser = createSlotRoute({
    getParentRoute: () => modal,
    path: '/users/$id',
    validateSearch: (search: Record<string, unknown>) => ({
      tab: typeof search.tab === 'string' ? search.tab : 'profile',
    }),
    loader: ({ params }: { params: { id: string } }) => ({ user: params.id }),
  })
  const activity = createSlotRoute({
    slot: 'activity',
    getParentRoute: () => dashboard,
  })
  const activityRecent = createSlotRoute({
    getParentRoute: () => activity,
    path: '/recent',
    loader: () => ({ feed: 'recent' }),
  })
  modal.addChildren([modalUser])
  activity.addChildren([activityRecent])
  root.addChildren([index, dashboard, settings, modal])
  dashboard.addChildren([activity])
  return { root, modal, modalUser, activity }
}

describe('parallel route slots', () => {
  test('default-open slots match without URL params', async () => {
    const { root } = createSlotApp()
    const router = createRouter({
      routeTree: root,
      history: createMemoryHistory({ initialEntries: ['/dashboard'] }),
    })
    await router.load()
    const slots = router.state.matches.filter((match) => match.slot)
    expect(slots.some((match) => match.slot === 'activity')).toBe(true)
    expect(slots.some((match) => match.slot === 'modal')).toBe(true)
    expect(router.state.location.search['@modal']).toBeUndefined()
    expect(router.state.location.search['@activity']).toBeUndefined()
  })

  test('fully qualified slot navigation writes search params and keeps the main path', async () => {
    const { root } = createSlotApp()
    const router = createRouter({
      routeTree: root,
      history: createMemoryHistory({ initialEntries: ['/dashboard'] }),
    })
    await router.load()
    await router.navigate({ to: '/@modal/users/$id', params: { id: '123' } } as any)
    expect(router.state.location.pathname).toBe('/dashboard')
    expect(router.state.location.search['@modal']).toBe('/users/123')
    const user = router.state.matches.find((match) => match.routeId === '/@modal/users/$id')
    expect(user?.loaderData).toEqual({ user: '123' })
  })

  test('slots object can open, update search, and close a slot', async () => {
    const { root } = createSlotApp()
    const router = createRouter({
      routeTree: root,
      history: createMemoryHistory({ initialEntries: ['/dashboard'] }),
    })
    await router.load()
    await router.navigate({
      slots: { modal: { to: '/users/$id', params: { id: '9' }, search: { tab: 'settings' } } },
    } as any)
    expect(router.state.location.search['@modal']).toBe('/users/9')
    expect(router.state.location.search['@modal.tab']).toBe('settings')
    await router.navigate({ slots: { modal: null } } as any)
    expect(router.state.location.search['@modal']).toBeUndefined()
    expect(router.state.location.search['@modal.tab']).toBeUndefined()
  })

  test('unmentioned slots persist across main-route navigation', async () => {
    const { root } = createSlotApp()
    const router = createRouter({
      routeTree: root,
      history: createMemoryHistory({ initialEntries: ['/dashboard'] }),
    })
    await router.load()
    await router.navigate({ to: '/@modal/users/$id', params: { id: '1' } } as any)
    await router.navigate({ to: '/settings' })
    expect(router.state.location.pathname).toBe('/settings')
    expect(router.state.location.search['@modal']).toBe('/users/1')
    expect(router.state.matches.some((match) => match.slot === 'modal')).toBe(true)
    expect(router.state.matches.some((match) => match.slot === 'activity')).toBe(false)
  })

  test('slots: { name: false } disables a default-open slot', async () => {
    const { root } = createSlotApp()
    const router = createRouter({
      routeTree: root,
      history: createMemoryHistory({ initialEntries: ['/dashboard'] }),
    })
    await router.load()
    await router.navigate({ slots: { activity: false } } as any)
    expect(router.state.location.search['@activity']).toBe(false)
    expect(router.state.matches.some((match) => match.slot === 'activity')).toBe(false)
  })

  test('nested slots write @parent@child search keys', async () => {
    const root = createRootRoute()
    const index = createRoute({ getParentRoute: () => root, path: '/' })
    const modal = createSlotRoute({ slot: 'modal', getParentRoute: () => root })
    const confirm = createSlotRoute({ slot: 'confirm', getParentRoute: () => modal })
    const confirmDelete = createSlotRoute({
      getParentRoute: () => confirm,
      path: '/delete',
      loader: () => ({ ok: true }),
    })
    confirm.addChildren([confirmDelete])
    modal.addChildren([confirm])
    root.addChildren([index, modal])
    const router = createRouter({
      routeTree: root,
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })
    await router.load()
    await router.navigate({ to: '/@modal/@confirm/delete' } as any)
    expect(router.state.location.pathname).toBe('/')
    expect(router.state.location.search['@modal@confirm']).toBe('/delete')
    expect(router.state.matches.some((match) => match.routeId === '/@modal/@confirm/delete')).toBe(
      true,
    )
  })

  test('closing a parent slot clears nested slot keys', async () => {
    const root = createRootRoute()
    const index = createRoute({ getParentRoute: () => root, path: '/' })
    const modal = createSlotRoute({ slot: 'modal', getParentRoute: () => root })
    const confirm = createSlotRoute({ slot: 'confirm', getParentRoute: () => modal })
    const confirmDelete = createSlotRoute({
      getParentRoute: () => confirm,
      path: '/delete',
    })
    confirm.addChildren([confirmDelete])
    modal.addChildren([confirm])
    root.addChildren([index, modal])
    const router = createRouter({
      routeTree: root,
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })
    await router.load()
    await router.navigate({
      slots: {
        modal: { to: '/settings', slots: { confirm: { to: '/delete' } } },
      },
    } as any)
    expect(router.state.location.search['@modal']).toBe('/settings')
    expect(router.state.location.search['@modal@confirm']).toBe('/delete')
    await router.navigate({ slots: { modal: null } } as any)
    expect(router.state.location.search['@modal']).toBeUndefined()
    expect(router.state.location.search['@modal@confirm']).toBeUndefined()
  })

  test('qualified slot search stays off the main location', async () => {
    const { root } = createSlotApp()
    const router = createRouter({
      routeTree: root,
      history: createMemoryHistory({ initialEntries: ['/dashboard'] }),
    })
    await router.load()
    await router.navigate({
      to: '/@modal/users/$id',
      params: { id: '3' },
      search: { tab: 'settings' },
    } as any)
    expect(router.state.location.pathname).toBe('/dashboard')
    expect(router.state.location.search.tab).toBeUndefined()
    expect(router.state.location.search['@modal']).toBe('/users/3')
    expect(router.state.location.search['@modal.tab']).toBe('settings')
  })

  test('custom slotPrefix does not retain unrelated search keys', async () => {
    const { root } = createSlotApp()
    const router = createRouter({
      routeTree: root,
      slotPrefix: 'slot_',
      history: createMemoryHistory({ initialEntries: ['/dashboard'] }),
    })
    await router.load()
    await router.navigate({
      to: '/settings',
      search: { sort: 'name' },
      slots: { modal: { to: '/users/$id', params: { id: '1' } } },
    } as any)
    expect(router.state.location.search.slot_modal).toBe('/users/1')
    expect(router.state.location.search.sort).toBe('name')
    await router.navigate({ to: '/dashboard', search: { view: 'grid' } } as any)
    expect(router.state.location.search.slot_modal).toBe('/users/1')
    expect(router.state.location.search.sort).toBeUndefined()
    expect(router.state.location.search.view).toBe('grid')
  })

  test('enabled: false still opens when the URL explicitly sets the slot', async () => {
    const root = createRootRoute()
    const index = createRoute({ getParentRoute: () => root, path: '/' })
    const admin = createSlotRoute({
      slot: 'admin',
      getParentRoute: () => root,
      enabled: () => false,
    })
    const adminPanel = createSlotRoute({
      getParentRoute: () => admin,
      path: '/panel',
    })
    admin.addChildren([adminPanel])
    root.addChildren([index, admin])
    const router = createRouter({
      routeTree: root,
      history: createMemoryHistory({ initialEntries: ['/?@admin=/panel'] }),
    })
    await router.load()
    expect(router.state.matches.some((match) => match.routeId === '/@admin/panel')).toBe(true)
  })

  test('enabled: false keeps a slot closed', async () => {
    const root = createRootRoute()
    const index = createRoute({ getParentRoute: () => root, path: '/' })
    const admin = createSlotRoute({
      slot: 'admin',
      getParentRoute: () => root,
      enabled: () => false,
    })
    root.addChildren([index, admin])
    const router = createRouter({
      routeTree: root,
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })
    await router.load()
    expect(router.state.matches.some((match) => match.slot === 'admin')).toBe(false)
  })
})

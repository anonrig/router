import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import {
  Link,
  Outlet,
  RouterProvider,
  createFileRoute,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  getRouteApi,
  useElementScrollRestoration,
  useMatch,
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

describe('createFileRoute', () => {
  it('binds id and fullPath from the file path so lazy stubs stay hookable', () => {
    const profile = createFileRoute('/$username/_profile')({})
    expect(profile.isRoot).toBe(false)
    expect(profile.id).toBe('/$username/_profile')
    expect(profile.fullPath).toBe('/$username')

    const index = createFileRoute('/$username/_profile/')({})
    expect(index.id).toBe('/$username/_profile/')
    expect(index.fullPath).toBe('/$username/')

    const listIndex = createFileRoute('/i/lists/$listId/')({})
    expect(listIndex.fullPath).toBe('/i/lists/$listId/')

    const auth = createFileRoute('/_auth')({})
    expect(auth.id).toBe('/_auth')
    expect(auth.fullPath).toBe('/')
    expect(auth.to).toBe('/')

    const groupLayout = createFileRoute('/(auth)')({})
    expect(groupLayout.id).toBe('/(auth)')
    expect(groupLayout.fullPath).toBe('/')
    expect(groupLayout.to).toBe('/')

    const grouped = createFileRoute('/(auth)/login')({})
    expect(grouped.id).toBe('/(auth)/login')
    expect(grouped.fullPath).toBe('/login')
    expect(grouped.to).toBe('/login')

    const nestedGroup = createFileRoute('/(app)/(dashboard)/settings')({})
    expect(nestedGroup.fullPath).toBe('/settings')
  })

  it('reads params from the file Route after a generator-style lazy stub load', async () => {
    const Profile = createFileRoute('/$username/_profile')({
      component: function ProfileLayout() {
        const { username } = Profile.useParams()
        return (
          <div>
            <span>profile:{username}</span>
            <span>from:{Profile.fullPath}</span>
            <Outlet />
          </div>
        )
      },
    })
    const ProfileIndex = createFileRoute('/$username/_profile/')({
      component: function ProfilePosts() {
        return <div>posts</div>
      },
    })

    const root = createRootRoute({
      component: function Root() {
        return <Outlet />
      },
    })

    function stub(
      id: string,
      path: string | undefined,
      parent: () => any,
      fileRoute: { options: Record<string, unknown> },
    ) {
      const route = createRoute({ getParentRoute: parent })
      route.update(
        (path === undefined
          ? { id, getParentRoute: parent }
          : { id, path, getParentRoute: parent }) as any,
      )
      route.lazy(async () => ({ options: { id, ...fileRoute.options } }) as any)
      ;(route as any)._lazyOptions = true
      return route
    }

    const profileStub = stub('/$username/_profile', '/$username', () => root, Profile)
    const indexStub = stub('/$username/_profile/', '/', () => profileStub, ProfileIndex)
    const router = createRouter({
      routeTree: root.addChildren([profileStub.addChildren([indexStub])]),
      history: createMemoryHistory({ initialEntries: ['/jack'] }),
    })

    render(<RouterProvider router={router} />)
    expect(await screen.findByText('profile:jack')).toBeInTheDocument()
    expect(screen.getByText('from:/$username')).toBeInTheDocument()
    expect(screen.getByText('posts')).toBeInTheDocument()
  })
})

describe('useMatch', () => {
  it('resolves active match when from is passed as fullPath, routeId, or id', async () => {
    function PostComponent() {
      const matchByFullPath = useMatch({ from: '/posts' as any })
      const matchByRouteId = useMatch({ from: '/_layout/posts' as any })
      return (
        <div>
          <span>byFullPath:{matchByFullPath.routeId}</span>
          <span>byRouteId:{matchByRouteId.routeId}</span>
        </div>
      )
    }

    const root = createRootRoute({ component: () => <Outlet /> })
    const layout = createRoute({ getParentRoute: () => root, id: '_layout' })
    const posts = createRoute({
      getParentRoute: () => layout,
      path: '/posts',
      component: PostComponent,
    })

    const router = createRouter({
      routeTree: root.addChildren([layout.addChildren([posts])]),
      history: createMemoryHistory({ initialEntries: ['/posts'] }),
    })

    render(<RouterProvider router={router} />)
    expect(await screen.findByText('byFullPath:/_layout/posts')).toBeInTheDocument()
    expect(screen.getByText('byRouteId:/_layout/posts')).toBeInTheDocument()
  })

  it('does not shadow an inactive index route with ancestor layout matches', async () => {
    function AboutComponent() {
      const matchIndex = useMatch({ from: '/' as any, shouldThrow: false })
      return <div>indexMatch:{matchIndex ? 'found' : 'none'}</div>
    }

    const root = createRootRoute({ component: () => <Outlet /> })
    const layout = createRoute({ getParentRoute: () => root, id: '_auth' })
    const index = createRoute({ getParentRoute: () => layout, path: '/' })
    const about = createRoute({
      getParentRoute: () => layout,
      path: '/about',
      component: AboutComponent,
    })

    const router = createRouter({
      routeTree: root.addChildren([layout.addChildren([index, about])]),
      history: createMemoryHistory({ initialEntries: ['/about'] }),
    })

    render(<RouterProvider router={router} />)
    expect(await screen.findByText('indexMatch:none')).toBeInTheDocument()
  })
})

describe('useElementScrollRestoration', () => {
  it('returns undefined when no cached offset exists', async () => {
    function Home() {
      const restoration = useElementScrollRestoration({
        getElement: () => window,
      })
      return <h1>{restoration ? `${restoration.scrollY}` : 'none'}</h1>
    }
    const rootRoute = createRootRoute({
      component: Home,
    })
    const router = createRouter({
      routeTree: rootRoute.addChildren([]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })

    render(<RouterProvider router={router} />)
    expect(await screen.findByText('none')).toBeInTheDocument()
  })
})

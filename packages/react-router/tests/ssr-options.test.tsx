import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '../src'
import { createRequestHandler } from 'speedy-router-core/ssr/server'
import type { AnyRouter, SSROption } from 'speedy-router-core'

function loadServerResponse(router: AnyRouter, path: string) {
  return createRequestHandler({
    createRouter: () => router,
    request: new Request(`http://localhost${path}`),
  })(({ router: loaded, responseHeaders }) => {
    const result = (loaded as AnyRouter & { _serverResult?: any })._serverResult
    return new Response(null, {
      status: result?.type === 'redirect' ? result.redirect.status : (result?.status ?? 500),
      headers: responseHeaders,
    })
  })
}

async function renderServerHtml(
  ssr: SSROption | undefined,
  extras?: {
    defaultSsr?: SSROption
    isShell?: boolean
    pendingComponent?: (() => React.ReactNode) | null
    defaultPendingComponent?: () => React.ReactNode
    rootSsr?: SSROption
    shell?: boolean
  },
) {
  const rootRoute = createRootRoute({
    ssr: extras?.rootSsr,
    shellComponent: extras?.shell
      ? ({ children }: { children: React.ReactNode }) => (
          <div>
            <span>html-shell</span>
            {children}
          </div>
        )
      : undefined,
    component: () => (
      <div>
        <span>root-shell</span>
        <Outlet />
      </div>
    ),
    pendingComponent:
      extras?.rootSsr === false || extras?.defaultSsr === false
        ? () => <span>root-pending</span>
        : undefined,
  })
  const pageRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/page',
    ssr,
    pendingComponent:
      extras && 'pendingComponent' in extras
        ? (extras.pendingComponent ?? undefined)
        : () => <span>page-pending</span>,
    component: () => <span>page-body</span>,
    loader: () => 'server-loader',
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([pageRoute]),
    history: createMemoryHistory({ initialEntries: ['/page'] }),
    isServer: true,
    defaultSsr: extras?.defaultSsr,
    isShell: extras?.isShell,
    defaultPendingComponent: extras?.defaultPendingComponent,
  })
  const response = await loadServerResponse(router, '/page')
  const html = renderToString(<RouterProvider router={router} />)
  return { router, response, html, pageRoute, rootRoute }
}

describe('SSR option HTML rendering', () => {
  it('ssr:true renders the route component on the server', async () => {
    const { response, html, router, pageRoute } = await renderServerHtml(true)
    expect(response.status).toBe(200)
    expect(router.state.matches.find((match) => match.routeId === pageRoute.id)).toMatchObject({
      ssr: true,
      loaderData: 'server-loader',
    })
    expect(html).toContain('root-shell')
    expect(html).toContain('page-body')
    expect(html).not.toContain('page-pending')
  })

  it('ssr:false keeps the pending fallback and does not render the route body', async () => {
    const { html, router, pageRoute } = await renderServerHtml(false)
    expect(router.state.matches.find((match) => match.routeId === pageRoute.id)).toMatchObject({
      ssr: false,
    })
    expect(router.state.matches.find((match) => match.routeId === pageRoute.id)?.loaderData).toBe(
      undefined,
    )
    expect(html).toContain('root-shell')
    expect(html).toContain('page-pending')
    expect(html).not.toContain('page-body')
  })

  it('ssr:data-only hydrates loader data but still omits the route body', async () => {
    const { html, router, pageRoute } = await renderServerHtml('data-only')
    expect(router.state.matches.find((match) => match.routeId === pageRoute.id)).toMatchObject({
      ssr: 'data-only',
      loaderData: 'server-loader',
    })
    expect(html).toContain('root-shell')
    expect(html).toContain('page-pending')
    expect(html).not.toContain('page-body')
  })

  it('undefined ssr matches ssr:true HTML', async () => {
    const unset = await renderServerHtml(undefined)
    const enabled = await renderServerHtml(true)
    expect(unset.html).toContain('page-body')
    expect(unset.html).toBe(enabled.html)
  })

  it('falls back to defaultPendingComponent when pendingComponent is missing', async () => {
    const { html } = await renderServerHtml(false, {
      pendingComponent: undefined,
      defaultPendingComponent: () => <span>default-pending</span>,
    })
    expect(html).toContain('default-pending')
    expect(html).not.toContain('page-body')
    expect(html).not.toContain('page-pending')
  })

  it('renders no fallback when neither pending component is configured', async () => {
    const { html } = await renderServerHtml(false, {
      pendingComponent: undefined,
    })
    expect(html).toContain('root-shell')
    expect(html).not.toContain('page-body')
    expect(html).not.toContain('page-pending')
  })

  it('always SSRs shellComponent when the root route is client-only', async () => {
    const { html, router, rootRoute } = await renderServerHtml(true, {
      rootSsr: false,
      shell: true,
    })
    expect(router.state.matches.find((match) => match.routeId === rootRoute.id)?.ssr).toBe(false)
    expect(html).toContain('html-shell')
    expect(html).toContain('root-pending')
    expect(html).not.toContain('root-shell')
    expect(html).not.toContain('page-body')
  })

  it('defaultSsr:false keeps descendant bodies off the server', async () => {
    const { html, router, pageRoute, rootRoute } = await renderServerHtml(true, {
      defaultSsr: false,
    })
    expect(router.state.matches.find((match) => match.routeId === rootRoute.id)?.ssr).toBe(false)
    expect(router.state.matches.find((match) => match.routeId === pageRoute.id)?.ssr).toBe(false)
    // The first client-only route is the root, so the page pending fallback is
    // never reached. Start apps must supply a root shell for this mode.
    expect(html).not.toContain('page-body')
    expect(html).not.toContain('root-shell')
  })

  it('defaultSsr:false still SSRs shellComponent around the root pending fallback', async () => {
    const { html, router, rootRoute } = await renderServerHtml(true, {
      defaultSsr: false,
      shell: true,
    })
    expect(router.state.matches.find((match) => match.routeId === rootRoute.id)?.ssr).toBe(false)
    expect(html).toContain('html-shell')
    expect(html).toContain('root-pending')
    expect(html).not.toContain('root-shell')
    expect(html).not.toContain('page-body')
  })

  it('isShell SSRs the root and keeps descendant bodies off the server', async () => {
    const { html, router, rootRoute, pageRoute } = await renderServerHtml(true, {
      isShell: true,
    })
    expect(router.state.matches.find((match) => match.routeId === rootRoute.id)?.ssr).toBe(true)
    expect(router.state.matches.find((match) => match.routeId === pageRoute.id)?.ssr).toBe(false)
    expect(html).toContain('root-shell')
    expect(html).toContain('page-pending')
    expect(html).not.toContain('page-body')
  })

  it('functional ssr() returning data-only matches literal data-only HTML', async () => {
    const rootRoute = createRootRoute({
      component: () => (
        <div>
          <span>root-shell</span>
          <Outlet />
        </div>
      ),
    })
    const pageRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/page',
      ssr: () => 'data-only' as const,
      pendingComponent: () => <span>page-pending</span>,
      component: () => <span>page-body</span>,
      loader: () => 'server-loader',
    })
    const router = createRouter({
      routeTree: rootRoute.addChildren([pageRoute]),
      history: createMemoryHistory({ initialEntries: ['/page'] }),
      isServer: true,
    })
    await loadServerResponse(router, '/page')
    const html = renderToString(<RouterProvider router={router} />)
    const literal = await renderServerHtml('data-only')
    expect(html).toBe(literal.html)
    expect(router.state.matches.find((match) => match.routeId === pageRoute.id)).toMatchObject({
      ssr: 'data-only',
      loaderData: 'server-loader',
    })
  })
})

// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { compileReferenceRoute, compileVirtualRoute, routeHasDisabledSsr } from '../src/code-split'

const inboxRoute = `import { Outlet, createFileRoute, useParams } from '@tanstack/react-router'
import { Suspense, useCallback, useMemo } from 'react'

import { ParamProvider } from '@app/params'
import { mapInboxRouteParams } from '@app/inbox-path'
import { InboxProvider } from '@app/inbox-provider'
import { Spinner } from '@app/spinner'

import { requireAuth } from '@/lib/require-auth'
import { inboxSettings } from '@/lib/inbox-settings'

const inboxFallback = (
  <div>
    <Spinner size="lg" />
  </div>
)

export function mapRouterParamsToInboxParams(
  params: Record<string, string | undefined>,
): Record<string, string | undefined> {
  return mapInboxRouteParams(params)
}

function useInboxParams() {
  const params = useParams({ strict: false }) as Record<string, string | undefined>
  return useMemo(() => mapRouterParamsToInboxParams(params), [params])
}

export const Route = createFileRoute('/inbox')({
  beforeLoad: ({ context, location }) => {
    requireAuth(context, location)
  },
  staticData: {
    section: 'messages',
  },
  ssr: false,
  component: function InboxLayout() {
    const params = useInboxParams()
    const getParams = useCallback(() => params, [params])

    return (
      <ParamProvider useParams={getParams}>
        <Suspense fallback={inboxFallback}>
          <InboxProvider settings={inboxSettings}>
            <Outlet />
          </InboxProvider>
        </Suspense>
      </ParamProvider>
    )
  },
})
`

describe('compileReferenceRoute', () => {
  it('keeps server hooks and exported helpers, drops component-only imports', () => {
    const result = compileReferenceRoute(inboxRoute, '/app/src/routes/inbox.tsx')
    expect(result).toBeTruthy()
    expect(result).toContain("createFileRoute('/inbox')")
    expect(result).toContain('ssr: false')
    expect(result).toContain('requireAuth')
    expect(result).toContain('lazyRouteComponent(() => import')
    expect(result).toContain('./inbox.tsx?tsr-split=component')
    expect(result).toContain('export function mapRouterParamsToInboxParams')
    expect(result).toContain('mapInboxRouteParams')
    expect(result).not.toContain('InboxProvider')
    expect(result).not.toContain('inboxFallback')
    expect(result).not.toContain("from 'react'")
    expect(result).not.toContain('@app/spinner')
    expect(result).not.toContain('@app/params')
    expect(routeHasDisabledSsr(inboxRoute, '/app/src/routes/inbox.tsx')).toBe(true)
  })

  it('keeps exported helpers that are not the split UI', () => {
    const source = `import { createFileRoute } from '@tanstack/react-router'

export function mapRouteParams(params: Record<string, string | undefined>) {
  return params
}

export const Route = createFileRoute('/settings')({
  ssr: false,
  component: SettingsPage,
})

function SettingsPage() {
  return <HeavySettings />
}

function HeavySettings() {
  return <div>settings</div>
}
`
    const result = compileReferenceRoute(source, '/app/src/routes/settings.tsx')
    expect(result).toContain('export function mapRouteParams')
    expect(result).toContain('ssr: false')
    expect(result).toContain('?tsr-split=component')
    expect(result).not.toContain('function SettingsPage')
    expect(result).not.toContain('function HeavySettings')
  })

  it('keeps unrelated names from a mixed export declaration', () => {
    const source = `import { createFileRoute } from '@tanstack/react-router'
const Component = () => <div>large component graph</div>
const helper = 1
export { Component, helper }
export const Route = createFileRoute('/mixed')({ component: Component })
`
    const result = compileReferenceRoute(source, '/app/src/routes/mixed.tsx')

    expect(result).toContain('export { Component, helper }')
    expect(result).toContain('const helper = 1')
  })

  it('leaves tiny inline UI in the eager module', () => {
    const source = `import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/status')({
  ssr: false,
  beforeLoad: () => undefined,
  pendingComponent: () => <div>Loading</div>,
  component: BigPage,
})
function BigPage() {
  return <Heavy />
}
function Heavy() {
  return <div>ready</div>
}
`
    const result = compileReferenceRoute(source, '/app/src/routes/status.tsx')
    expect(result).toContain('pendingComponent: () => <div>Loading</div>')
    expect(result).toContain('?tsr-split=component')
    expect(result).not.toContain('function BigPage')
    expect(result).not.toContain('function Heavy')
  })

  it('leaves routes without split properties unchanged', () => {
    const source = `import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/login')({
  beforeLoad: () => undefined,
})
`
    expect(compileReferenceRoute(source, '/app/src/routes/login.tsx')).toBeNull()
  })

  it('splits SSR routes and keeps loaders in the reference module', () => {
    const source = `import { createFileRoute } from '@tanstack/react-router'
import { StoriesFeed } from '@/components/stories-feed'

export const Route = createFileRoute('/stories/home')({
  loader: async () => ({ stories: [] }),
  component: StoriesHomePage,
})

function StoriesHomePage() {
  const { stories } = Route.useLoaderData()
  return <StoriesFeed stories={stories} />
}
`
    const result = compileReferenceRoute(source, '/app/src/routes/stories/home.tsx')
    expect(result).toBeTruthy()
    expect(result).toContain('loader: async () => ({ stories: [] })')
    expect(result).toContain(
      "lazyRouteComponent(() => import('./home.tsx?tsr-split=component'), 'component')",
    )
    expect(result).not.toContain('function StoriesHomePage')
    expect(result).not.toContain('StoriesFeed')
    expect(routeHasDisabledSsr(source, '/app/src/routes/stories/home.tsx')).toBe(false)
  })

  it('still splits ssr:false routes that call Route.useSearch', () => {
    const source = `import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect } from 'react'

export const Route = createFileRoute('/redirect/')({
  ssr: false,
  component: EmailRedirect,
})

function EmailRedirect() {
  const { url } = Route.useSearch()
  const navigate = useNavigate()
  useEffect(() => {
    void navigate({ to: url ?? '/', replace: true })
  }, [url, navigate])
  return null
}
`
    const result = compileReferenceRoute(source, '/app/src/routes/redirect/index.tsx')
    expect(result).toContain('ssr: false')
    expect(result).toContain(
      "lazyRouteComponent(() => import('./index.tsx?tsr-split=component'), 'component')",
    )
    expect(result).not.toContain('function EmailRedirect')
    expect(result).not.toContain('useEffect')
  })
})

describe('compileVirtualRoute', () => {
  it('preserves import attributes', () => {
    const source = `import { createFileRoute } from '@tanstack/react-router'\nimport data from './data.json' with { type: 'json' }\nfunction Page() { return <main>{data.title} plus enough component content to split</main> }\nexport const Route = createFileRoute('/data')({ component: Page })\n`

    const result = compileVirtualRoute(source, '/app/src/routes/data.tsx', 'component')

    expect(result).toContain("import data from './data.json' with { type: 'json' }")
  })

  it('emits only the component graph', () => {
    const result = compileVirtualRoute(inboxRoute, '/app/src/routes/inbox.tsx', 'component')
    expect(result).toBeTruthy()
    expect(result).toContain('export const component =')
    expect(result).toContain('InboxProvider')
    expect(result).toContain('inboxFallback')
    expect(result).toContain('useInboxParams')
    expect(result).toContain('useParams')
    expect(result).toContain('Outlet')
    expect(result).not.toContain('createFileRoute')
    expect(result).not.toContain('requireAuth')
    expect(result).not.toContain('ssr: false')
    expect(result).not.toContain('import { Route }')
  })

  it('re-imports Route when the split component calls Route.useSearch', () => {
    const source = `import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect } from 'react'

export const Route = createFileRoute('/redirect/')({
  ssr: false,
  component: EmailRedirect,
})

function EmailRedirect() {
  const { url } = Route.useSearch()
  const navigate = useNavigate()
  useEffect(() => {
    void navigate({ to: url ?? '/', replace: true })
  }, [url, navigate])
  return null
}
`
    const result = compileVirtualRoute(source, '/app/src/routes/redirect/index.tsx', 'component')
    expect(result).toBeTruthy()
    expect(result).toContain("import { Route } from './index.tsx'")
    expect(result).toContain("import { useNavigate } from '@tanstack/react-router'")
    expect(result).toContain('export const component = EmailRedirect')
    expect(result).toContain('Route.useSearch')
    expect(result).toContain('useNavigate()')
    expect(result).toContain("void navigate({ to: url ?? '/', replace: true })")
    expect(result).not.toContain('createFileRoute')
    expect(result).not.toContain('ssr: false')
  })

  it('re-imports Route when the split SSR component calls useLoaderData', () => {
    const source = `import { createFileRoute } from '@tanstack/react-router'
import { StoriesFeed } from '@/components/stories-feed'

export const Route = createFileRoute('/stories/home')({
  loader: async () => ({ stories: [] }),
  component: StoriesHomePage,
})

function StoriesHomePage() {
  const { stories } = Route.useLoaderData()
  return <StoriesFeed stories={stories} />
}
`
    const result = compileVirtualRoute(source, '/app/src/routes/stories/home.tsx', 'component')
    expect(result).toBeTruthy()
    expect(result).toContain("import { Route } from './home.tsx'")
    expect(result).toContain('export const component = StoriesHomePage')
    expect(result).toContain('Route.useLoaderData')
    expect(result).toContain('StoriesFeed')
    expect(result).not.toContain('createFileRoute')
    expect(result).not.toContain('loader: async')
  })
})

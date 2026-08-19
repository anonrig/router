// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { compileReferenceRoute, compileVirtualRoute } from '../src/code-split'

const chatRoute = `import { Outlet, createFileRoute, useParams } from '@tanstack/react-router'
import { Suspense, useCallback, useMemo } from 'react'

import { ParamProvider } from '@x-clients/features/app/params'
import { mapRequestsRouterParams } from '@x-clients/features/dms/navigation/message-requests-path'
import { XChatProvider } from '@x-clients/features/dms/rweb/x-chat-provider'
import { Loader } from '@x-clients/xds/loader'

import { requireAuth } from '@/lib/auth/require-auth'
import { chatSettings } from '@/lib/xchat-provider-settings'

const chatFallback = (
  <div>
    <Loader size="lg" />
  </div>
)

export function mapRouterParamsToChatParams(
  params: Record<string, string | undefined>,
): Record<string, string | undefined> {
  return mapRequestsRouterParams(params)
}

function useChatParams() {
  const params = useParams({ strict: false }) as Record<string, string | undefined>
  return useMemo(() => mapRouterParamsToChatParams(params), [params])
}

export const Route = createFileRoute('/i/chat')({
  beforeLoad: ({ context, location }) => {
    requireAuth(context, location)
  },
  staticData: {
    scribe: { page: 'messages' },
  },
  ssr: false,
  component: function ChatLayout() {
    const params = useChatParams()
    const getParams = useCallback(() => params, [params])

    return (
      <ParamProvider useParams={getParams}>
        <Suspense fallback={chatFallback}>
          <XChatProvider settings={chatSettings}>
            <Outlet />
          </XChatProvider>
        </Suspense>
      </ParamProvider>
    )
  },
})
`

describe('compileReferenceRoute', () => {
  it('keeps server hooks and drops component-only imports', () => {
    const result = compileReferenceRoute(chatRoute, '/app/src/routes/i/chat.tsx')
    expect(result).toBeTruthy()
    expect(result).toContain("createFileRoute('/i/chat')")
    expect(result).toContain('ssr: false')
    expect(result).toContain('requireAuth')
    expect(result).toContain('lazyRouteComponent(() => import')
    expect(result).toContain('./chat.tsx?tsr-split=component')
    expect(result).not.toContain('mapRouterParamsToChatParams')
    expect(result).not.toContain('mapRequestsRouterParams')
    expect(result).not.toContain('XChatProvider')
    expect(result).not.toContain('chatFallback')
    expect(result).not.toContain("from 'react'")
    expect(result).not.toContain('@x-clients/xds/loader')
    expect(result).not.toContain('@x-clients/features/app/params')
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

  it('leaves SSR routes eager so Route.useLoaderData still renders on the server', () => {
    const source = `import { createFileRoute } from '@tanstack/react-router'
import { StoriesFeed } from '@/components/stories-feed'

export const Route = createFileRoute('/i/jf/stories/home')({
  loader: async () => ({ stories: [] }),
  component: StoriesHomePage,
})

function StoriesHomePage() {
  const { stories } = Route.useLoaderData()
  return <StoriesFeed stories={stories} />
}
`
    expect(compileReferenceRoute(source, '/app/src/routes/i/jf/stories/home.tsx')).toBeNull()
  })

  it('still splits ssr:false routes that call Route.useSearch', () => {
    const source = `import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect } from 'react'

export const Route = createFileRoute('/i/redirect/')({
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
    const result = compileReferenceRoute(source, '/app/src/routes/i/redirect/index.tsx')
    expect(result).toContain('ssr: false')
    expect(result).toContain(
      "lazyRouteComponent(() => import('./index.tsx?tsr-split=component'), 'component')",
    )
    expect(result).not.toContain('function EmailRedirect')
    expect(result).not.toContain('useEffect')
  })
})

describe('compileVirtualRoute', () => {
  it('emits only the component graph', () => {
    const result = compileVirtualRoute(chatRoute, '/app/src/routes/i/chat.tsx', 'component')
    expect(result).toBeTruthy()
    expect(result).toContain('export const component =')
    expect(result).toContain('XChatProvider')
    expect(result).toContain('chatFallback')
    expect(result).toContain('useChatParams')
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

export const Route = createFileRoute('/i/redirect/')({
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
    const result = compileVirtualRoute(source, '/app/src/routes/i/redirect/index.tsx', 'component')
    expect(result).toBeTruthy()
    expect(result).toContain("import { Route } from './index.tsx'")
    expect(result).toContain('export const component = EmailRedirect')
    expect(result).toContain('Route.useSearch')
    expect(result).not.toContain('createFileRoute')
    expect(result).not.toContain('ssr: false')
  })
})

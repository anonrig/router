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
    expect(result).toContain('mapRouterParamsToChatParams')
    expect(result).toContain('mapRequestsRouterParams')
    expect(result).not.toContain('XChatProvider')
    expect(result).not.toContain('chatFallback')
    expect(result).not.toContain("from 'react'")
    expect(result).not.toContain('@x-clients/xds/loader')
  })

  it('leaves routes without split properties unchanged', () => {
    const source = `import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/login')({
  beforeLoad: () => undefined,
})
`
    expect(compileReferenceRoute(source, '/app/src/routes/login.tsx')).toBeNull()
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
    expect(result).not.toContain('createFileRoute')
    expect(result).not.toContain('requireAuth')
    expect(result).not.toContain('ssr: false')
  })
})

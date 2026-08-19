// @vitest-environment node
import { parseSync } from 'oxc-parser'
import { describe, expect, it } from 'vitest'
import { compileReferenceRoute, compileVirtualRoute, routeHasDisabledSsr } from '../src/code-split'

function topLevelNames(statement: any): Array<string> {
  if (statement.type === 'ImportDeclaration') {
    return (statement.specifiers ?? []).map((specifier: any) => specifier.local?.name)
  }
  if (statement.type === 'VariableDeclaration') {
    return (statement.declarations ?? []).map((declaration: any) => declaration.id?.name)
  }
  if (statement.type === 'FunctionDeclaration' || statement.type === 'ClassDeclaration') {
    return [statement.id?.name]
  }
  if (statement.type === 'ExportNamedDeclaration' && statement.declaration) {
    return topLevelNames(statement.declaration)
  }
  return []
}

/** Parse errors, bindings, and export names of an emitted module. */
function moduleShape(code: string | null) {
  const parsed = parseSync('emitted.tsx', code ?? '')
  const program = parsed.program as any
  const errors = parsed.errors.map((error) => error.message)
  const bindings: Array<string> = []
  const exports: Array<string> = []
  for (const statement of program.body ?? []) {
    bindings.push(...topLevelNames(statement).filter(Boolean))
    if (statement.type !== 'ExportNamedDeclaration') continue
    if (statement.declaration) exports.push(...topLevelNames(statement.declaration).filter(Boolean))
    for (const specifier of statement.specifiers ?? []) {
      const name = specifier.exported?.name ?? specifier.exported?.value
      if (name) exports.push(name)
    }
  }
  return { errors, bindings, exports }
}

function occurrences(names: Array<string>, name: string): number {
  return names.filter((value) => value === name).length
}

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

  it('keeps the property key when rewriting a shorthand split property', () => {
    const source = `import { createFileRoute } from '@tanstack/react-router'
import { component } from '@/components/heavy'
export const Route = createFileRoute('/imported')({ component })
`
    const result = compileReferenceRoute(source, '/app/src/routes/imported.tsx')

    expect(moduleShape(result).errors).toEqual([])
    expect(result).toContain(
      "component: lazyRouteComponent(() => import('./imported.tsx?tsr-split=component'), 'component')",
    )
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
  it('exports a wrapper without colliding with an exported component binding', () => {
    const source = `import { createFileRoute } from '@tanstack/react-router'
const Inner = () => <div>inner</div>
export const component = Inner
export const Route = createFileRoute('/wrapped')({
  component: () => <Wrapper inner={component} />,
})
function Wrapper(props: { inner: () => unknown }) {
  return <div>{String(props.inner)}</div>
}
`
    const result = compileVirtualRoute(source, '/app/src/routes/wrapped.tsx', 'component')
    const shape = moduleShape(result)

    expect(shape.errors).toEqual([])
    expect(occurrences(shape.bindings, 'component')).toBe(1)
    expect(occurrences(shape.exports, 'component')).toBe(1)
    expect(result).toContain('const component = Inner')
    expect(result).not.toContain('export const component = Inner')
    expect(result).toContain('const $$component = () => <Wrapper inner={component} />')
    expect(result).toContain('export { $$component as component }')
    expect(result).toContain('function Wrapper')
  })

  it('re-exports a local shorthand component', () => {
    const source = `import { createFileRoute } from '@tanstack/react-router'
const LargeComponent = () => <div>large</div>
const component = () => <LargeComponent />
export const Route = createFileRoute('/local')({ component })
`
    const result = compileVirtualRoute(source, '/app/src/routes/local.tsx', 'component')
    const shape = moduleShape(result)

    expect(shape.errors).toEqual([])
    expect(occurrences(shape.bindings, 'component')).toBe(1)
    expect(shape.exports).toEqual(['component'])
    expect(result).toContain('const component = () => <LargeComponent />')
    expect(result).toContain('export { component }')
  })

  it('re-exports an imported shorthand component', () => {
    const source = `import { createFileRoute } from '@tanstack/react-router'
import { component } from '@/components/heavy'
export const Route = createFileRoute('/imported')({ component })
`
    const result = compileVirtualRoute(source, '/app/src/routes/imported.tsx', 'component')
    const shape = moduleShape(result)

    expect(shape.errors).toEqual([])
    expect(occurrences(shape.bindings, 'component')).toBe(1)
    expect(shape.exports).toEqual(['component'])
    expect(result).toContain("import { component } from '@/components/heavy'")
    expect(result).toContain('export { component }')
    expect(result).not.toContain('export const component')
  })

  it('keeps a single export for an exported shorthand component', () => {
    const source = `import { createFileRoute } from '@tanstack/react-router'
const LargeComponent = () => <div>large</div>
export const component = () => <LargeComponent />
export const Route = createFileRoute('/shorthand')({ component })
`
    const result = compileVirtualRoute(source, '/app/src/routes/shorthand.tsx', 'component')
    const shape = moduleShape(result)

    expect(shape.errors).toEqual([])
    expect(occurrences(shape.bindings, 'component')).toBe(1)
    expect(shape.exports).toEqual(['component'])
    expect(result).toContain('export const component = () => <LargeComponent />')
    expect(result).not.toContain('export { component }')
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

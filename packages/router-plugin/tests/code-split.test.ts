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

/** The initializer node behind `export const <name> = ...` in an emitted module. */
function exportedInit(code: string | null, name: string) {
  const program = parseSync('emitted.tsx', code ?? '').program as any
  for (const statement of program.body ?? []) {
    const declaration = statement.type === 'ExportNamedDeclaration' ? statement.declaration : null
    if (declaration?.type !== 'VariableDeclaration') continue
    for (const declarator of declaration.declarations ?? []) {
      if (declarator.id?.name === name) return declarator.init
    }
  }
  return undefined
}

const methodBody =
  'long enough route component body to force automatic splitting into a virtual module'

function methodRoute(method: string) {
  return `import { createFileRoute } from '@tanstack/react-router'
const componentKey = 'component'
export const Route = createFileRoute('/method')({
  ${method}
})
`
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
  it('splits object-method route components with valid syntax', () => {
    const source = methodRoute(`component() { return <main>${methodBody}</main> }`)

    const result = compileReferenceRoute(source, '/app/src/routes/method.tsx')

    expect(moduleShape(result).errors).toEqual([])
    expect(result).toContain(
      "component: lazyRouteComponent(() => import('./method.tsx?tsr-split=component'), 'component')",
    )
    expect(result).not.toContain('componentlazyRouteComponent')
  })

  it('splits string-literal and computed-literal method keys', () => {
    for (const method of [
      `'component'() { return <main>${methodBody}</main> }`,
      `['component']() { return <main>${methodBody}</main> }`,
    ]) {
      const result = compileReferenceRoute(methodRoute(method), '/app/src/routes/method.tsx')

      expect(moduleShape(result).errors).toEqual([])
      expect(result).toContain('component: lazyRouteComponent(')
    }
  })

  it('leaves accessor and dynamic-key route options in the eager module', () => {
    for (const method of [
      `get component() { return <main>${methodBody}</main> }`,
      `[componentKey]() { return <main>${methodBody}</main> }`,
    ]) {
      expect(compileReferenceRoute(methodRoute(method), '/app/src/routes/method.tsx')).toBeNull()
      expect(
        compileVirtualRoute(methodRoute(method), '/app/src/routes/method.tsx', 'component'),
      ).toBeNull()
    }
  })

  it('preserves top-level effects and unsupported named exports', () => {
    const source = `'use client'
import { createFileRoute } from '@tanstack/react-router'
globalThis.routeInitCount = (globalThis.routeInitCount ?? 0) + 1
export enum Status { Ready = 'ready' }
function Page() {
  return <div>large enough component body for automatic splitting</div>
}
export const Route = createFileRoute('/effects')({ component: Page })
`
    const result = compileReferenceRoute(source, '/app/src/routes/effects.tsx')

    expect(result).toContain("'use client'")
    expect(result).toContain('globalThis.routeInitCount =')
    expect(result).toContain('export enum Status')
  })

  it('aliases the lazy helper when a route exports the same binding', () => {
    const source = `import { createFileRoute } from '@tanstack/react-router'\nexport function lazyRouteComponent() { return 'public helper' }\nfunction Page() { return <main>enough route component content to force automatic splitting</main> }\nexport const Route = createFileRoute('/collision')({ component: Page })\n`

    const result = compileReferenceRoute(source, '/app/src/routes/collision.tsx')

    expect(result).toContain('lazyRouteComponent as __lazyRouteComponent')
    expect(result).toContain('__lazyRouteComponent(() => import(')
  })

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
  it('exports an object-method option as a function expression', () => {
    const source = methodRoute(`component() { return <main>${methodBody}</main> }`)

    const result = compileVirtualRoute(source, '/app/src/routes/method.tsx', 'component')
    const shape = moduleShape(result)
    const init = exportedInit(result, 'component')

    expect(shape.errors).toEqual([])
    expect(shape.exports).toEqual(['component'])
    expect(init?.type).toBe('FunctionExpression')
    expect(result).toContain(methodBody)
  })

  it('keeps async and generator markers on split method options', () => {
    const forms = [
      {
        method: `async component() { return <main>${methodBody}</main> }`,
        async: true,
        star: false,
      },
      { method: `*component() { yield <main>${methodBody}</main> }`, async: false, star: true },
      {
        method: `async *component() { yield <main>${methodBody}</main> }`,
        async: true,
        star: true,
      },
    ]
    for (const form of forms) {
      const result = compileVirtualRoute(
        methodRoute(form.method),
        '/app/src/routes/method.tsx',
        'component',
      )
      const init = exportedInit(result, 'component')

      expect(moduleShape(result).errors).toEqual([])
      expect(init?.type).toBe('FunctionExpression')
      expect(init?.async).toBe(form.async)
      expect(init?.generator).toBe(form.star)
    }
  })

  it('keeps type parameters and return types on split method options', () => {
    const source = methodRoute(
      `component<T extends string>(): T { return <main>${methodBody}</main> as T }`,
    )

    const result = compileVirtualRoute(source, '/app/src/routes/method.tsx', 'component')
    const init = exportedInit(result, 'component')

    expect(moduleShape(result).errors).toEqual([])
    expect(init?.type).toBe('FunctionExpression')
    expect(init?.typeParameters).toBeTruthy()
    expect(init?.returnType).toBeTruthy()
    expect(result).toContain('function <T extends string>(): T')
  })

  it('renames a method option that collides with a local binding', () => {
    const source = `import { createFileRoute } from '@tanstack/react-router'
const Inner = () => <div>inner</div>
export const component = Inner
export const Route = createFileRoute('/wrapped')({
  component() { return <Wrapper inner={component} /> },
})
function Wrapper(props: { inner: () => unknown }) {
  return <div>{String(props.inner)}</div>
}
`
    const result = compileVirtualRoute(source, '/app/src/routes/wrapped.tsx', 'component')
    const shape = moduleShape(result)

    expect(shape.errors).toEqual([])
    expect(occurrences(shape.exports, 'component')).toBe(1)
    expect(result).toContain(
      'const $$component = function () { return <Wrapper inner={component} /> }',
    )
    expect(result).toContain('export { $$component as component }')
  })

  it('preserves valid quoting for module names containing apostrophes', () => {
    const source = `import { createFileRoute } from "@tanstack/react-router"
import { Widget } from "./person's-widget"
export const Route = createFileRoute("/quoted")({ component: Page })
function Page() {
  return <Widget label="long enough to force route splitting" />
}
`
    const result = compileVirtualRoute(source, '/app/src/routes/quoted.tsx', 'component')

    expect(parseSync('quoted.tsx', result!).errors).toEqual([])
  })

  it('preserves import attributes', () => {
    const source = `import { createFileRoute } from '@tanstack/react-router'\nimport data from './data.json' with { type: 'json' }\nfunction Page() { return <main>{data.title} plus enough component content to split</main> }\nexport const Route = createFileRoute('/data')({ component: Page })\n`

    const result = compileVirtualRoute(source, '/app/src/routes/data.tsx', 'component')

    expect(result).toContain("import data from './data.json' with { type: 'json' }")
  })

  it('keeps named default declarations used by split components', () => {
    const source = `import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/default')({ component: Page })
export default function Page() {
  return <div>large enough component body for automatic splitting</div>
}
`
    const result = compileVirtualRoute(source, '/app/src/routes/default.tsx', 'component')

    expect(result).toContain('export default function Page()')
    expect(result).toContain('export const component = Page')
  })

  it('keeps TypeScript namespaces used by split components', () => {
    const source = `import { createFileRoute } from '@tanstack/react-router'\nnamespace UI { export function Page() { return <main>namespaced route component</main> } }\nexport const Route = createFileRoute('/namespace')({ component: UI.Page })\n`

    const result = compileVirtualRoute(source, '/app/src/routes/namespace.tsx', 'component')

    expect(result).toContain('namespace UI')
    expect(result).toContain('export const component = UI.Page')
  })

  it('keeps dotted TypeScript namespaces used by split components', () => {
    const source = `import { createFileRoute } from '@tanstack/react-router'\nnamespace UI.Forms { export function Page() { return <main>dotted namespace route component</main> } }\nexport const Route = createFileRoute('/namespace')({ component: UI.Forms.Page })\n`

    const result = compileVirtualRoute(source, '/app/src/routes/namespace.tsx', 'component')

    expect(result).toContain('namespace UI.Forms')
    expect(result).toContain('export const component = UI.Forms.Page')
  })

  it('preserves module directives', () => {
    const source = `'use client'
import { createFileRoute } from '@tanstack/react-router'
function Page() {
  return <div>large enough component body for automatic splitting</div>
}
export const Route = createFileRoute('/directive')({ component: Page })
`
    const result = compileVirtualRoute(source, '/app/src/routes/directive.tsx', 'component')

    expect(result?.trimStart().startsWith("'use client'")).toBe(true)
  })

  it('keeps directives first when the split component re-imports Route', () => {
    const source = `'use client'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/directive-route')({ component: Page })

function Page() {
  const { url } = Route.useSearch()
  return <div>{url}</div>
}
`
    const result = compileVirtualRoute(source, '/app/src/routes/directive-route.tsx', 'component')

    expect(result).toBeTruthy()
    expect(result).toContain("import { Route } from './directive-route.tsx'")
    expect(result?.trimStart().startsWith("'use client'")).toBe(true)
    expect(result!.indexOf("'use client'")).toBeLessThan(result!.indexOf('import'))
  })

  it('does not hoist a string statement that is not part of the prologue', () => {
    const source = `import { createFileRoute } from '@tanstack/react-router'

const label = 'inbox'
'not a directive'

function Page() {
  return <div>{label}</div>
}

export const Route = createFileRoute('/late-literal')({ component: Page })
`
    const result = compileVirtualRoute(source, '/app/src/routes/late-literal.tsx', 'component')

    expect(result).toBeTruthy()
    expect(result?.trimStart().startsWith("'not a directive'")).toBe(false)
  })

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

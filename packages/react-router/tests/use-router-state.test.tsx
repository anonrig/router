import { expect, test } from 'vitest'
import { renderToString } from 'react-dom/server'
import { createMemoryHistory, createRootRoute, createRouter, useRouterState } from '../src'

test('accepts an explicit router without a provider', () => {
  const router = createRouter({
    routeTree: createRootRoute(),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })

  function Probe() {
    const pathname = useRouterState({
      router,
      select: (state) => state.location.pathname,
    })
    return <span>{pathname}</span>
  }

  expect(renderToString(<Probe />)).toBe('<span>/</span>')
})

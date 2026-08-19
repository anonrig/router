import { expect, test } from 'vitest'
import { render } from '@testing-library/react'
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '../src'

test('settles an active transition when the provider unmounts', async () => {
  const root = createRootRoute()
  const index = createRoute({ getParentRoute: () => root, path: '/' })
  root.addChildren([index])
  const router = createRouter({
    routeTree: root,
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  const view = render(<RouterProvider router={router} />)

  const transition = router.startTransition(() => {}, [])
  view.unmount()

  await expect(Promise.race([transition, Promise.resolve('still pending')])).resolves.toBe(false)
})

test('restores the core transition function when the provider unmounts', async () => {
  const root = createRootRoute()
  const index = createRoute({ getParentRoute: () => root, path: '/' })
  root.addChildren([index])
  const router = createRouter({
    routeTree: root,
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  const view = render(<RouterProvider router={router} />)

  view.unmount()
  const transition = router.startTransition(() => {}, [])

  await expect(Promise.race([transition, Promise.resolve('still pending')])).resolves.toBe(false)
})

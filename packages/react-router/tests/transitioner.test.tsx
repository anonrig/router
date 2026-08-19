import { expect, test } from 'vitest'
import { render } from '@testing-library/react'
import { StrictMode } from 'react'
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

test('keeps the react transition installed when effects remount', async () => {
  const root = createRootRoute()
  const index = createRoute({ getParentRoute: () => root, path: '/' })
  root.addChildren([index])
  const router = createRouter({
    routeTree: root,
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  const view = render(
    <StrictMode>
      <RouterProvider router={router} />
    </StrictMode>,
  )

  const transition = router.startTransition(() => {}, [])

  await expect(Promise.race([transition, Promise.resolve('still pending')])).resolves.toBe(
    'still pending',
  )

  view.unmount()
  await expect(transition).resolves.toBe(false)

  const afterUnmount = router.startTransition(() => {}, [])
  await expect(Promise.race([afterUnmount, Promise.resolve('still pending')])).resolves.toBe(false)
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

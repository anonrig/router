import { listParentSlots, markSlotRoute } from '@anonrig/router-core'
import React from 'react'
import { Outlet } from './match'
import { matchContext } from './match-context'
import { createRoute, Route } from './route'
import { useRouter } from './use-router'

export function createSlotRoute(options: any = {}) {
  attachSlots()
  return markSlotRoute(
    createRoute({
      ...options,
      ...(options.slot && !options.path && !options.id ? { id: `@${options.slot}` } : {}),
    } as any),
    options,
  )
}

export function Slots({
  children,
}: {
  children: (
    slots: Array<ReturnType<typeof listParentSlots>[number] & { Outlet: typeof Outlet }>,
  ) => React.ReactNode
}) {
  attachSlots()
  const router = useRouter()
  const routeId = React.useContext(matchContext) as string
  const matches = router.stores.matches.get()
  const route = router.routesById[routeId]
  return children(
    listParentSlots(route as any, matches).map((slot) =>
      Object.assign(slot, {
        Outlet: ((props?: React.ComponentProps<typeof Outlet>) => (
          <Outlet slot={slot.name} {...props} />
        )) as typeof Outlet,
      }),
    ),
  )
}

function attachSlots() {
  Route.prototype.Slots = Slots
}

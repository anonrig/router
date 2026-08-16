import { listParentSlots, markSlotRoute, type AnyRouteMatch } from '@anonrig/router-core'
import React, { useContext } from 'react'
import { Outlet } from './match'
import { matchContext } from './match-context'
import { createRoute, Route } from './route'
import { useRouter } from './use-router'
import { useRouterState } from './use-router-state'

const slotOutlets = new Map<string, typeof Outlet>()

function slotOutlet(name: string) {
  let SlotOutlet = slotOutlets.get(name)
  if (!SlotOutlet) {
    SlotOutlet = ((props?: React.ComponentProps<typeof Outlet>) => (
      <Outlet slot={name} {...props} />
    )) as typeof Outlet
    slotOutlets.set(name, SlotOutlet)
  }
  return SlotOutlet
}

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
  const routeId = useContext(matchContext) as string
  const matches = useRouterState({
    select: (state) => state.matches as AnyRouteMatch[],
  })
  const route = router.routesById[routeId]
  return children(
    listParentSlots(route as any, matches).map((slot) =>
      Object.assign(slot, { Outlet: slotOutlet(slot.name) }),
    ),
  )
}

function attachSlots() {
  Route.prototype.Slots = Slots
}

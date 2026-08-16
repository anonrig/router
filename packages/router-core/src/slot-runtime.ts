export type SlotRuntime = {
  split(routeTree: any): void
  install(
    routeTree: any,
    routesById: Record<string, any>,
    routesByPath: Record<string, any>,
    caseSensitive: boolean,
  ): boolean
  match(router: any, location: any, matches: any[]): any[]
  resolveDest(router: any, dest: any, current: any): any
  applySearch(router: any, dest: any, currentSearch: any, nextSearch: any): any
}

export let slotRuntime: SlotRuntime | undefined

export function setSlotRuntime(runtime: SlotRuntime) {
  slotRuntime = runtime
}

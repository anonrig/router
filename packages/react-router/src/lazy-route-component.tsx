import { lazy, type ComponentType } from 'react'

export function lazyRouteComponent<T extends Record<string, any>>(
  importer: () => Promise<T>,
  exportName?: string,
) {
  return lazy(async () => {
    const mod = await importer()
    const Comp = (exportName ? mod[exportName] : mod.default) as ComponentType<any>
    return { default: Comp }
  })
}

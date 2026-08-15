import { createLazyRoute } from '@tanstack/react-router'
import HeavyComponent from './mockHeavyDependenciesRoute'

export default function Route(id: string) {
  return createLazyRoute(id)({
    component: HeavyComponent,
  })
}

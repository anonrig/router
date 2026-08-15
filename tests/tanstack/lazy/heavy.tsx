import { createLazyRoute } from '@tanstack/react-router'
import HeavyComponent from './mock-heavy-dependencies-route'

export default function Route(id: string) {
  return createLazyRoute(id)({
    component: HeavyComponent,
  })
}

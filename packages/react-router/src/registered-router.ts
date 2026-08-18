import type { AnyRouter, Register as CoreRegister } from 'speedy-router-core'
import type { Register as ReactRegister } from './augmentation'

type Register = CoreRegister & ReactRegister

/**
 * Router registered via `declare module '@tanstack/react-router'` / `speedy-router`
 * (and via core, for tests that augment `@tanstack/router-core`).
 */
export type RegisteredRouter = Register extends {
  router: infer TRouter
}
  ? TRouter
  : AnyRouter

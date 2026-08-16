// Boolean-only on purpose: re-exporting server loaders from here pulled the SSR
// graph into every `utils` / `isServer` import and blocked dead-code elimination.
// `undefined` on the client so `isServer ?? router.isServer` can honor test/SSR
// overrides in jsdom, matching TanStack's development isServer export.
export const isServer: boolean | undefined = typeof document === 'undefined' ? true : undefined

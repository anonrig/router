// Boolean-only on purpose: re-exporting server loaders from here pulled the SSR
// graph into every `utils` / `isServer` import and blocked dead-code elimination.
export const isServer = typeof document === 'undefined'

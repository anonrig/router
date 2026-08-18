/**
 * Type-only re-exports from `speedy-router-core` cannot be declaration-merged.
 * Apps that write `declare module '@tanstack/react-router'` (or `speedy-router`)
 * augment the interfaces in `./index`. This copies those fields onto the
 * interfaces core actually reads.
 */
declare module 'speedy-router-core' {
  interface Register extends import('./index').Register {}
  interface StaticDataRouteOption extends import('./index').StaticDataRouteOption {}
  interface FileRoutesByPath extends import('./index').FileRoutesByPath {}
}

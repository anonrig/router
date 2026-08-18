/**
 * App-facing interfaces that `declare module '@tanstack/react-router'` and
 * `declare module 'speedy-router'` merge into.
 *
 * Catalog aliases resolve `@tanstack/react-router` to this package, but
 * TypeScript still treats `speedy-router` (package.json name) and
 * `@tanstack/react-router` (import specifier) as distinct module identities.
 * Keeping these interfaces in their own file and re-exporting them from the
 * package entry lets both `declare module` forms merge into the same symbols
 * that `createFileRoute` and `RegisteredRouter` read.
 */
export interface Register {}

export interface StaticDataRouteOption {}

export interface FileRoutesByPath {}

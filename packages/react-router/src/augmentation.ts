/**
 * App-facing `FileRoutesByPath` that `declare module '@tanstack/react-router'`
 * (and `declare module 'speedy-router'`) merge into.
 *
 * Catalog aliases resolve `@tanstack/react-router` to this package, but
 * TypeScript still treats `speedy-router` (package.json name) and
 * `@tanstack/react-router` (import specifier) as distinct module identities.
 * `createFileRoute` reads this interface so generated route trees that only
 * augment the TanStack specifier stay typed.
 *
 * `Register` / `RegisteredRouter` stay on `speedy-router-core` and are
 * re-exported from this package, matching TanStack. oxlint-tsgolint only
 * follows hook defaults that point at the core module.
 */
export interface FileRoutesByPath {}

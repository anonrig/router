import { dirname, relative, sep } from 'node:path'
import type { ScannedRoute } from './scan'

export type EmitRouteTreeOptions = {
  routes: Array<ScannedRoute>
  generatedRouteTree: string
  routesDirectory: string
  runtimeImport?: string
  rootImport?: string
  slotImport?: string
  quoteStyle?: 'single' | 'double'
  semicolons?: boolean
}

type NamedRoute = ScannedRoute & { variableName: string }

const ALPHANUMERIC = /[a-zA-Z0-9_]/
const SPLAT_SLASH = /\/\$\//g
const TRAILING_SPLAT = /\$$/g
const BRACKET_SPLAT = /\$\{\$\}/g
const DOLLAR = /\$/g
const SPLIT_PATH = /[/-]/g
const LEADING_DIGIT = /^(\d)/g
const UNDERSCORE_ENDS = /(^_|_$)/gi
const UNDERSCORE_SLASH = /(\/_|_\/)/gi
const ESCAPED_DOT = '\0'

function toVariableSafeChar(char: string) {
  if (ALPHANUMERIC.test(char)) return char
  switch (char) {
    case '.':
      return 'Dot'
    case '-':
      return 'Dash'
    case '@':
      return 'At'
    case '(':
    case ')':
    case ' ':
      return ''
    default:
      return `Char${char.charCodeAt(0)}`
  }
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

function removeUnderscores(value: string) {
  return value.replace(UNDERSCORE_ENDS, '').replace(UNDERSCORE_SLASH, '/')
}

/** Same identifier rules as TanStack's `routePathToVariable`. */
export function routePathToVariable(routePath: string): string {
  const cleaned = removeUnderscores(routePath)
  if (!cleaned) return ''

  const parts = cleaned
    .replace(SPLAT_SLASH, '/splat/')
    .replace(TRAILING_SPLAT, 'splat')
    .replace(BRACKET_SPLAT, 'splat')
    .replace(DOLLAR, '')
    .split(SPLIT_PATH)

  let result = ''
  for (let i = 0; i < parts.length; i++) {
    const segment = i > 0 ? capitalize(parts[i]!) : parts[i]!
    for (let j = 0; j < segment.length; j++) {
      result += toVariableSafeChar(segment[j]!)
    }
  }

  return result.replace(LEADING_DIGIT, 'R$1')
}

function flattenFileId(fileId: string) {
  return fileId
    .replace(/\[\.\]/g, ESCAPED_DOT)
    .replace(/\./g, '/')
    .replaceAll(ESCAPED_DOT, '.')
}

function variableNameFor(route: ScannedRoute) {
  if (route.isRoot) return 'root'
  return routePathToVariable(`/${flattenFileId(route.fileId)}`)
}

function typePath(path: string | undefined) {
  if (!path) return ''
  return path !== '/' && path.endsWith('/') ? path.slice(0, -1) : path
}

function toPosix(value: string) {
  return value.split(sep).join('/')
}

function importSpecifier(fromFile: string, toFile: string) {
  let spec = toPosix(relative(dirname(fromFile), toFile)).replace(/\.[^.]+$/, '')
  if (!spec.startsWith('.')) spec = `./${spec}`
  return spec
}

function quote(value: string, style: 'single' | 'double') {
  if (style === 'double') return JSON.stringify(value)
  const escaped = JSON.stringify(value).slice(1, -1).replace(/'/g, "\\'")
  return `'${escaped}'`
}

function uniqueVariableNames(routes: Array<ScannedRoute>): Array<NamedRoute> {
  const used = new Set<string>()
  return routes.map((route) => {
    let name = variableNameFor(route)
    if (used.has(name)) {
      let suffix = 2
      while (used.has(`${name}${suffix}`)) suffix++
      name = `${name}${suffix}`
    }
    used.add(name)
    return { ...route, variableName: name }
  })
}

function resolvedName(route: NamedRoute, childrenByParent: Map<string, Array<NamedRoute>>) {
  return (childrenByParent.get(route.key)?.length ?? 0) > 0
    ? `${route.variableName}RouteWithChildren`
    : `${route.variableName}Route`
}

function typeofResolved(route: NamedRoute, childrenByParent: Map<string, Array<NamedRoute>>) {
  return `typeof ${resolvedName(route, childrenByParent)}`
}

function isIndexRoute(route: NamedRoute) {
  return route.key.endsWith('/') && route.key !== '/'
}

function preferFullPath(current: NamedRoute, existing: NamedRoute) {
  if (current.isPathless !== existing.isPathless) return !current.isPathless
  return true
}

function preferTo(current: NamedRoute, existing: NamedRoute) {
  if (isIndexRoute(current) !== isIndexRoute(existing)) return isIndexRoute(current)
  if (current.isPathless !== existing.isPathless) return !current.isPathless
  return true
}

function union(values: Array<string>, quoted: (value: string) => string) {
  if (values.length === 0) return 'never'
  if (values.length === 1) return quoted(values[0]!)
  return `\n    | ${values.map(quoted).join('\n    | ')}`
}

function fileRoutesByPathInterface(
  moduleName: string,
  children: Array<NamedRoute>,
  byKey: Map<string, NamedRoute>,
  quoted: (value: string) => string,
) {
  const entries = children.map((route) => {
    const parent =
      route.parentId === '__root__'
        ? 'rootRouteImport'
        : `${byKey.get(route.parentId)?.variableName ?? 'root'}Route`
    return `    ${quoted(route.key)}: {
          id: ${quoted(route.key)}
          path: ${quoted(typePath(route.path))}
          fullPath: ${quoted(route.fullPath)}
          preLoaderRoute: typeof ${route.variableName}RouteImport
          parentRoute: typeof ${parent}
        }`
  })
  return `declare module ${quoted(moduleName)} {
  interface FileRoutesByPath {
${entries.join('\n')}
  }
}`
}

/**
 * TanStack `routeTree.gen.ts` shape: eager `Route` imports, `.update()`,
 * `_addFileChildren` / `_addFileTypes`, and `FileRoutesByPath` in the same file.
 */
export function emitRouteTree(options: EmitRouteTreeOptions): string {
  const quoteStyle = options.quoteStyle ?? 'single'
  const semi = options.semicolons ? ';' : ''
  const quoted = (value: string) => quote(value, quoteStyle)
  const routes = uniqueVariableNames(options.routes)
  const root = routes.find((route) => route.isRoot)
  const children = routes.filter((route) => !route.isRoot)
  const byKey = new Map(
    routes.map((route) => [route.isRoot ? '__root__' : route.key, route] as const),
  )
  const childrenByParent = new Map<string, Array<NamedRoute>>()
  for (const route of children) {
    const list = childrenByParent.get(route.parentId) ?? []
    list.push(route)
    childrenByParent.set(route.parentId, list)
  }

  const lines: Array<string> = [
    '/* eslint-disable */',
    '',
    '// @ts-nocheck',
    '',
    '// noinspection JSUnusedGlobalSymbols',
    '',
    '// This file was automatically generated by TanStack Router.',
    '// You should NOT make any changes in this file as it will be overwritten.',
    '// Additionally, you should also exclude this file from your linter and/or formatter to prevent it from being checked or modified.',
    '',
  ]

  if (root) {
    lines.push(
      `import { Route as rootRouteImport } from ${quoted(importSpecifier(options.generatedRouteTree, root.filePath))}${semi}`,
    )
  } else {
    const rootImport = options.rootImport ?? options.runtimeImport ?? '@tanstack/react-router'
    lines.push(`import { createRootRoute } from ${quoted(rootImport)}${semi}`)
    lines.push(`const rootRouteImport = createRootRoute()${semi}`)
  }

  for (const route of children) {
    lines.push(
      `import { Route as ${route.variableName}RouteImport } from ${quoted(importSpecifier(options.generatedRouteTree, route.filePath))}${semi}`,
    )
  }

  lines.push('')

  for (const route of children) {
    const parent =
      route.parentId === '__root__'
        ? 'rootRouteImport'
        : `${byKey.get(route.parentId)?.variableName ?? 'root'}Route`
    const fields = [`  id: ${quoted(route.id)}`]
    if (route.path !== undefined) fields.push(`  path: ${quoted(route.path)}`)
    fields.push(`  getParentRoute: () => ${parent}`)
    lines.push(`const ${route.variableName}Route = ${route.variableName}RouteImport.update({`)
    lines.push(fields.join(',\n'))
    lines.push(`} as any)${semi}`)
  }

  const byFullPath = new Map<string, NamedRoute>()
  const byTo = new Map<string, NamedRoute>()
  for (const route of children) {
    const fullPath = route.fullPath
    const existingFull = byFullPath.get(fullPath)
    if (!existingFull || preferFullPath(route, existingFull)) {
      byFullPath.set(fullPath, route)
    }

    const hasIndexChild = (childrenByParent.get(route.key) ?? []).some(
      (child) => child.id === '/' || child.path === '/',
    )
    if (hasIndexChild) continue
    const to = fullPath !== '/' && fullPath.endsWith('/') ? fullPath.slice(0, -1) : fullPath
    const existingTo = byTo.get(to)
    if (!existingTo || preferTo(route, existingTo)) {
      byTo.set(to, route)
    }
  }

  lines.push('')
  lines.push('export interface FileRoutesByFullPath {')
  for (const [fullPath, route] of byFullPath) {
    lines.push(`  ${quoted(fullPath)}: ${typeofResolved(route, childrenByParent)}`)
  }
  lines.push('}')

  lines.push('export interface FileRoutesByTo {')
  for (const [to, route] of byTo) {
    lines.push(`  ${quoted(to)}: ${typeofResolved(route, childrenByParent)}`)
  }
  lines.push('}')

  lines.push('export interface FileRoutesById {')
  lines.push(`  ${quoted('__root__')}: typeof rootRouteImport`)
  for (const route of children) {
    lines.push(`  ${quoted(route.key)}: ${typeofResolved(route, childrenByParent)}`)
  }
  lines.push('}')

  const fullPaths = [...byFullPath.keys()]
  const tos = [...byTo.keys()]
  const ids = ['__root__', ...children.map((route) => route.key)]
  lines.push('export interface FileRouteTypes {')
  lines.push('  fileRoutesByFullPath: FileRoutesByFullPath')
  lines.push(`  fullPaths:${union(fullPaths, quoted)}`)
  lines.push('  fileRoutesByTo: FileRoutesByTo')
  lines.push(`  to:${union(tos, quoted)}`)
  lines.push(`  id:${union(ids, quoted)}`)
  lines.push('  fileRoutesById: FileRoutesById')
  lines.push('}')
  lines.push('export interface RootRouteChildren {')
  for (const route of childrenByParent.get('__root__') ?? []) {
    lines.push(`  ${route.variableName}Route: ${typeofResolved(route, childrenByParent)}`)
  }
  lines.push('}')
  lines.push('')

  function emitChildConfigs(parentKey: string) {
    const kids = childrenByParent.get(parentKey) ?? []
    for (const kid of kids) emitChildConfigs(kid.key)
    if (parentKey === '__root__' || kids.length === 0) return
    const parent = byKey.get(parentKey)
    if (!parent) return
    lines.push(`interface ${parent.variableName}RouteChildren {`)
    for (const kid of kids) {
      lines.push(`  ${kid.variableName}Route: ${typeofResolved(kid, childrenByParent)}`)
    }
    lines.push('}')
    lines.push('')
    lines.push(`const ${parent.variableName}RouteChildren: ${parent.variableName}RouteChildren = {`)
    for (const kid of kids) {
      lines.push(`  ${kid.variableName}Route: ${resolvedName(kid, childrenByParent)},`)
    }
    lines.push('}')
    lines.push('')
    lines.push(
      `const ${parent.variableName}RouteWithChildren = ${parent.variableName}Route._addFileChildren(${parent.variableName}RouteChildren)`,
    )
    lines.push('')
  }

  emitChildConfigs('__root__')

  lines.push('const rootRouteChildren: RootRouteChildren = {')
  for (const route of childrenByParent.get('__root__') ?? []) {
    lines.push(`  ${route.variableName}Route: ${resolvedName(route, childrenByParent)},`)
  }
  lines.push('}')
  lines.push(
    `export const routeTree = rootRouteImport`,
    `  ._addFileChildren(rootRouteChildren)`,
    `  ._addFileTypes<FileRouteTypes>()${semi}`,
    '',
  )

  lines.push(
    fileRoutesByPathInterface('@tanstack/react-router', children, byKey, quoted),
    '',
    fileRoutesByPathInterface('speedy-router', children, byKey, quoted),
    '',
  )

  return lines.join('\n')
}

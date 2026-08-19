import { basename } from 'node:path'
import { parseSync } from 'oxc-parser'

/** Same query TanStack uses for virtual split modules. */
export const TSR_SPLIT_QUERY = 'tsr-split'

export const SPLIT_PROPERTIES = [
  'component',
  'errorComponent',
  'pendingComponent',
  'notFoundComponent',
] as const

export type SplitProperty = (typeof SPLIT_PROPERTIES)[number]

const SPLIT_PROPERTY_SET = new Set<string>(SPLIT_PROPERTIES)

type EstreeNode = {
  type: string
  start: number
  end: number
  [key: string]: any
}

function parseProgram(fileName: string, code: string): EstreeNode {
  return parseSync(fileName, code).program as EstreeNode
}

function walk(node: unknown, visit: (value: EstreeNode) => void) {
  if (!node || typeof node !== 'object') return
  if (Array.isArray(node)) {
    for (const item of node) walk(item, visit)
    return
  }
  const value = node as EstreeNode
  if (typeof value.type !== 'string') return
  visit(value)
  for (const key of Object.keys(value)) {
    if (
      key === 'type' ||
      key === 'start' ||
      key === 'end' ||
      key === 'loc' ||
      key === 'range' ||
      key === 'span'
    ) {
      continue
    }
    walk(value[key], visit)
  }
}

function collectIdentifiers(node: EstreeNode, into: Set<string>) {
  walk(node, (value) => {
    if (value.type === 'Identifier' && typeof value.name === 'string') into.add(value.name)
    if (value.type === 'JSXIdentifier' && typeof value.name === 'string') into.add(value.name)
  })
}

function collectBindingNames(name: EstreeNode | undefined, into: Array<string>) {
  if (!name) return
  if (name.type === 'Identifier' && typeof name.name === 'string') {
    into.push(name.name)
    return
  }
  if (name.type === 'ObjectPattern') {
    for (const property of name.properties ?? []) {
      collectBindingNames(property.value ?? property.argument, into)
    }
    return
  }
  if (name.type === 'ArrayPattern') {
    for (const element of name.elements ?? []) {
      if (element) collectBindingNames(element, into)
    }
    return
  }
  if (name.type === 'RestElement') collectBindingNames(name.argument, into)
  if (name.type === 'AssignmentPattern') collectBindingNames(name.left, into)
}

function importLocalNames(declaration: EstreeNode): Array<string> {
  const names: Array<string> = []
  const specifiers: Array<EstreeNode> = declaration.specifiers ?? []
  for (const specifier of specifiers) {
    const local = specifier.local
    if (local?.type === 'Identifier') names.push(local.name)
  }
  return names
}

function declaredNames(statement: EstreeNode): Array<string> {
  if (statement.type === 'FunctionDeclaration' || statement.type === 'ClassDeclaration') {
    return statement.id?.name ? [statement.id.name] : []
  }
  if (statement.type === 'VariableDeclaration') {
    const names: Array<string> = []
    for (const declaration of statement.declarations ?? []) {
      collectBindingNames(declaration.id, names)
    }
    return names
  }
  if (statement.type === 'ImportDeclaration') return importLocalNames(statement)
  if (statement.type === 'ExportNamedDeclaration' && statement.declaration) {
    return declaredNames(statement.declaration)
  }
  return []
}

function isExportedStatement(statement: EstreeNode): boolean {
  return (
    statement.type === 'ExportNamedDeclaration' ||
    statement.type === 'ExportDefaultDeclaration' ||
    statement.type === 'ExportAllDeclaration'
  )
}

function isSideEffectImport(statement: EstreeNode): boolean {
  return statement.type === 'ImportDeclaration' && !(statement.specifiers?.length > 0)
}

function propertyNameOf(property: EstreeNode): string | undefined {
  if (property.type !== 'Property' && property.type !== 'MethodDefinition') return undefined
  const key = property.key
  if (key?.type === 'Identifier') return key.name
  if (key?.type === 'Literal' && typeof key.value === 'string') return key.value
  return undefined
}

function propertyValue(property: EstreeNode): EstreeNode | undefined {
  return property.value
}

function isCreateFileRouteIdentifier(node: EstreeNode | undefined): boolean {
  return node?.type === 'Identifier' && node.name === 'createFileRoute'
}

function getCreateFileRouteOptions(program: EstreeNode): EstreeNode | undefined {
  let found: EstreeNode | undefined
  walk(program, (node) => {
    if (found) return
    if (
      node.type === 'CallExpression' &&
      node.arguments?.length > 0 &&
      node.arguments[0]?.type === 'ObjectExpression' &&
      node.callee?.type === 'CallExpression' &&
      isCreateFileRouteIdentifier(node.callee.callee)
    ) {
      found = node.arguments[0]
    }
  })
  return found
}

function containsCreateFileRoute(node: EstreeNode): boolean {
  let found = false
  walk(node, (value) => {
    if (isCreateFileRouteIdentifier(value)) found = true
  })
  return found
}

function isAlreadyLazy(node: EstreeNode): boolean {
  return (
    node.type === 'CallExpression' &&
    node.callee?.type === 'Identifier' &&
    (node.callee.name === 'lazyRouteComponent' || node.callee.name === 'lazy')
  )
}

function splitPropertiesOf(options: EstreeNode) {
  const properties: Array<{ key: SplitProperty; value: EstreeNode }> = []
  for (const property of options.properties ?? []) {
    const key = propertyNameOf(property)
    if (!key || !SPLIT_PROPERTY_SET.has(key)) continue
    const value = propertyValue(property)
    if (!value || isAlreadyLazy(value)) continue
    properties.push({ key: key as SplitProperty, value })
  }
  return properties
}

function specifierFor(fileName: string, splitKey: string) {
  return `./${basename(fileName.split('?')[0] ?? fileName)}?${TSR_SPLIT_QUERY}=${splitKey}`
}

function lazyWrapper(fileName: string, splitKey: string) {
  return `lazyRouteComponent(() => import('${specifierFor(fileName, splitKey)}'), '${splitKey}')`
}

function createFileRouteImportSource(program: EstreeNode): string | undefined {
  for (const statement of program.body ?? []) {
    if (statement.type !== 'ImportDeclaration') continue
    if (importLocalNames(statement).includes('createFileRoute')) {
      return typeof statement.source?.value === 'string' ? statement.source.value : undefined
    }
  }
  return undefined
}

function neededStatements(
  program: EstreeNode,
  seeds: Array<EstreeNode>,
  skip?: (statement: EstreeNode) => boolean,
): Set<EstreeNode> {
  const statements: Array<EstreeNode> = program.body ?? []
  const needed = new Set<EstreeNode>(seeds)
  const used = new Set<string>()
  for (const statement of needed) collectIdentifiers(statement, used)

  let grew = true
  while (grew) {
    grew = false
    for (const statement of statements) {
      if (needed.has(statement)) continue
      if (skip?.(statement)) continue
      const names = declaredNames(statement)
      if (!names.some((name) => used.has(name))) continue
      needed.add(statement)
      collectIdentifiers(statement, used)
      grew = true
    }
  }
  return needed
}

function hasDisabledSsr(options: EstreeNode): boolean {
  for (const property of options.properties ?? []) {
    if (propertyNameOf(property) !== 'ssr') continue
    const value = propertyValue(property)
    if (value?.type === 'Literal' && value.value === false) return true
  }
  return false
}

function printNamedImport(
  declaration: EstreeNode,
  used: Set<string>,
  extraNamed: Array<string>,
  code: string,
): string | undefined {
  const moduleName = declaration.source?.value
  if (typeof moduleName !== 'string') return code.slice(declaration.start, declaration.end)
  const specifiers: Array<EstreeNode> = declaration.specifiers ?? []
  if (specifiers.length === 0) return `import '${moduleName}'`

  const defaultSpecifier = specifiers.find(
    (specifier) => specifier.type === 'ImportDefaultSpecifier',
  )
  const namespaceSpecifier = specifiers.find(
    (specifier) => specifier.type === 'ImportNamespaceSpecifier',
  )
  const namedSpecifiers = specifiers.filter((specifier) => specifier.type === 'ImportSpecifier')

  const parts: Array<string> = []
  if (defaultSpecifier?.local?.name && used.has(defaultSpecifier.local.name)) {
    parts.push(defaultSpecifier.local.name)
  }
  if (namespaceSpecifier?.local?.name && used.has(namespaceSpecifier.local.name)) {
    parts.push(`* as ${namespaceSpecifier.local.name}`)
  }
  const namedParts: Array<string> = []
  for (const specifier of namedSpecifiers) {
    const local = specifier.local?.name
    if (!local || !used.has(local)) continue
    const imported = specifier.imported?.name ?? specifier.imported?.value ?? local
    namedParts.push(imported === local ? local : `${imported} as ${local}`)
  }
  for (const extra of extraNamed) {
    if (!namedParts.includes(extra)) namedParts.push(extra)
  }
  if (namedParts.length) parts.push(`{ ${namedParts.join(', ')} }`)
  if (parts.length === 0) return undefined
  const typeOnly = declaration.importKind === 'type' ? 'type ' : ''
  return `import ${typeOnly}${parts.join(', ')} from '${moduleName}'`
}

function identifiersIn(statements: Iterable<EstreeNode>): Set<string> {
  const used = new Set<string>()
  for (const statement of statements) collectIdentifiers(statement, used)
  return used
}

function applyReplacements(
  code: string,
  replacements: Array<{ start: number; end: number; text: string }>,
) {
  const ordered = replacements.toSorted((left, right) => right.start - left.start)
  let next = code
  for (const replacement of ordered) {
    next = next.slice(0, replacement.start) + replacement.text + next.slice(replacement.end)
  }
  return next
}

function slice(code: string, node: EstreeNode) {
  return code.slice(node.start, node.end)
}

/**
 * Rewrite a route file so split UI properties load through `lazyRouteComponent`.
 * Only `ssr: false` routes are split, so SSR pages keep their components eager.
 * Loaders, `beforeLoad`, `head`, `ssr`, and `staticData` stay in this module.
 */
export function compileReferenceRoute(code: string, fileName: string): string | null {
  const program = parseProgram(fileName, code)
  const options = getCreateFileRouteOptions(program)
  if (!options || !hasDisabledSsr(options)) return null
  const properties = splitPropertiesOf(options)
  if (properties.length === 0) return null

  const replacements = properties.map(({ key, value }) => ({
    start: value.start,
    end: value.end,
    text: lazyWrapper(fileName, key),
  }))
  const rewritten = applyReplacements(code, replacements)
  const nextProgram = parseProgram(fileName, rewritten)
  const seeds = (nextProgram.body ?? []).filter(
    (statement: EstreeNode) => isExportedStatement(statement) || isSideEffectImport(statement),
  )
  if (seeds.length === 0) return rewritten
  const needed = neededStatements(nextProgram, seeds)
  const used = identifiersIn(needed)
  used.add('lazyRouteComponent')

  const runtimeImport = createFileRouteImportSource(nextProgram) ?? '@tanstack/react-router'
  const parts: Array<string> = []
  for (const statement of nextProgram.body ?? []) {
    if (!needed.has(statement)) continue
    if (statement.type === 'ImportDeclaration') {
      const extra = statement.source?.value === runtimeImport ? ['lazyRouteComponent'] : []
      const printed = printNamedImport(statement, used, extra, rewritten)
      if (printed) parts.push(printed)
      continue
    }
    parts.push(slice(rewritten, statement))
  }
  if (!parts.some((part) => part.includes('lazyRouteComponent'))) {
    parts.unshift(`import { lazyRouteComponent } from '${runtimeImport}'`)
  }
  return `${parts.join('\n\n')}\n`
}

/**
 * Emit a virtual module that only exports one split route property and its
 * local dependencies. The reference file dynamically imports this module.
 */
export function compileVirtualRoute(
  code: string,
  fileName: string,
  splitTarget: string,
): string | null {
  if (!SPLIT_PROPERTY_SET.has(splitTarget)) return null
  const program = parseProgram(fileName, code)
  const options = getCreateFileRouteOptions(program)
  if (!options) return null
  const match = splitPropertiesOf(options).find((property) => property.key === splitTarget)
  if (!match) return null

  const used = new Set<string>()
  collectIdentifiers(match.value, used)
  const seeds = (program.body ?? []).filter((statement: EstreeNode) => {
    if (containsCreateFileRoute(statement)) return false
    return declaredNames(statement).some((name) => used.has(name))
  })
  const needed = neededStatements(program, seeds, containsCreateFileRoute)
  const usedInModule = identifiersIn(needed)
  for (const name of used) usedInModule.add(name)
  const parts: Array<string> = []
  if (usedInModule.has('Route')) {
    parts.push(`import { Route } from './${basename(fileName)}'`)
  }
  for (const statement of program.body ?? []) {
    if (!needed.has(statement)) continue
    parts.push(slice(code, statement))
  }
  parts.push(`export const ${splitTarget} = ${slice(code, match.value)}`)
  return `${parts.join('\n\n')}\n`
}

export function fileNameFromModuleId(id: string) {
  const withoutNull = id.startsWith('\0') ? id.slice(1) : id
  return withoutNull.split('?')[0] ?? withoutNull
}

export function splitTargetFromModuleId(id: string) {
  const queryIndex = id.indexOf('?')
  if (queryIndex === -1) return undefined
  const params = new URLSearchParams(id.slice(queryIndex + 1))
  return params.get(TSR_SPLIT_QUERY) ?? undefined
}

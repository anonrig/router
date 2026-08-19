import { basename } from 'node:path'
import { parseSync } from 'oxc-parser'
import { TSR_SPLIT_QUERY } from './module-id'

export { fileNameFromModuleId, splitTargetFromModuleId, TSR_SPLIT_QUERY } from './module-id'

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
      key === 'span' ||
      key === 'comments' ||
      key === 'tokens' ||
      key === 'leadingComments' ||
      key === 'trailingComments' ||
      key === 'innerComments'
    ) {
      continue
    }
    walk(value[key], visit)
  }
}

function collectIdentifiers(node: EstreeNode, into: Set<string>) {
  walk(node, (value) => {
    if (value.type === 'Identifier' && typeof value.name === 'string') into.add(value.name)
    // Host elements (`div`) are not bindings; only user components pull deps.
    if (
      value.type === 'JSXIdentifier' &&
      typeof value.name === 'string' &&
      value.name.charCodeAt(0) < 97
    ) {
      into.add(value.name)
    }
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
  if (statement.type === 'TSEnumDeclaration') {
    return statement.id?.name ? [statement.id.name] : []
  }
  if (statement.type === 'ImportDeclaration') return importLocalNames(statement)
  if (statement.type === 'ExportNamedDeclaration' && statement.declaration) {
    return declaredNames(statement.declaration)
  }
  if (statement.type === 'ExportDefaultDeclaration' && statement.declaration) {
    return declaredNames(statement.declaration)
  }
  if (statement.type === 'TSModuleDeclaration') {
    const name = moduleDeclarationName(statement.id)
    return name ? [name] : []
  }
  return []
}

function moduleDeclarationName(id: EstreeNode | undefined): string | undefined {
  let node = id
  while (node?.type === 'TSQualifiedName') node = node.left
  return node?.type === 'Identifier' && typeof node.name === 'string' ? node.name : undefined
}

function isSideEffectImport(statement: EstreeNode): boolean {
  return statement.type === 'ImportDeclaration' && !(statement.specifiers?.length > 0)
}

function isDirective(statement: EstreeNode): boolean {
  return (
    statement.type === 'ExpressionStatement' &&
    statement.expression?.type === 'Literal' &&
    typeof statement.expression.value === 'string'
  )
}

/**
 * Only the leading run of string-literal statements forms the module prologue.
 * A later `'use client'` is a plain expression and must not be hoisted.
 */
function prologueDirectives(program: EstreeNode): Set<EstreeNode> {
  const directives = new Set<EstreeNode>()
  for (const statement of program.body ?? []) {
    if (!isDirective(statement)) break
    directives.add(statement)
  }
  return directives
}

function isTopLevelEffect(statement: EstreeNode): boolean {
  return (
    statement.type === 'ExpressionStatement' ||
    statement.type === 'ThrowStatement' ||
    statement.type === 'IfStatement' ||
    statement.type === 'SwitchStatement' ||
    statement.type === 'TryStatement' ||
    statement.type === 'WhileStatement' ||
    statement.type === 'DoWhileStatement' ||
    statement.type === 'ForStatement' ||
    statement.type === 'ForInStatement' ||
    statement.type === 'ForOfStatement'
  )
}

function propertyNameOf(property: EstreeNode): string | undefined {
  if (property.type !== 'Property' && property.type !== 'MethodDefinition') return undefined
  const key = property.key
  // `[component]` reads a variable, so a computed key only names a property
  // when it is a static string.
  if (key?.type === 'Identifier' && property.computed !== true) return key.name
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

/** Route factory / `createFileRoute(...)` call — not the import that also pulls hooks. */
function isCreateFileRouteBinding(statement: EstreeNode): boolean {
  return statement.type !== 'ImportDeclaration' && containsCreateFileRoute(statement)
}

function isAlreadyLazy(node: EstreeNode): boolean {
  return (
    node.type === 'CallExpression' &&
    node.callee?.type === 'Identifier' &&
    (node.callee.name === 'lazyRouteComponent' || node.callee.name === 'lazy')
  )
}

function splitPropertiesOf(options: EstreeNode) {
  const properties: Array<{
    key: SplitProperty
    value: EstreeNode
    shorthand: boolean
    method: boolean
    property: EstreeNode
  }> = []
  for (const property of options.properties ?? []) {
    // An accessor body computes the option value instead of being it, so its
    // span cannot be moved into the virtual module. Leave it in place.
    if (property.kind === 'get' || property.kind === 'set') continue
    const key = propertyNameOf(property)
    if (!key || !SPLIT_PROPERTY_SET.has(key)) continue
    const value = propertyValue(property)
    if (!value || isAlreadyLazy(value) || isTrivialSplitValue(value)) continue
    properties.push({
      key: key as SplitProperty,
      value,
      shorthand: property.shorthand === true,
      method: property.method === true,
      property,
    })
  }
  return properties
}

function specifierFor(fileName: string, splitKey: string) {
  return `./${basename(fileName.split('?')[0] ?? fileName)}?${TSR_SPLIT_QUERY}=${splitKey}`
}

function lazyWrapper(fileName: string, splitKey: string, helperName: string) {
  return `${helperName}(() => import('${specifierFor(fileName, splitKey)}'), '${splitKey}')`
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

function indexDeclarations(statements: Array<EstreeNode>) {
  const byName = new Map<string, Array<EstreeNode>>()
  for (const statement of statements) {
    for (const name of declaredNames(statement)) {
      const list = byName.get(name)
      if (list) list.push(statement)
      else byName.set(name, [statement])
    }
  }
  return byName
}

function neededStatements(
  program: EstreeNode,
  seeds: Array<EstreeNode>,
  skip?: (statement: EstreeNode) => boolean,
): Set<EstreeNode> {
  const statements: Array<EstreeNode> = program.body ?? []
  const byName = indexDeclarations(statements)
  const needed = new Set<EstreeNode>(seeds)
  const pending = seeds.slice()
  const used = new Set<string>()
  for (let i = 0; i < pending.length; i++) {
    collectIdentifiers(pending[i]!, used)
    for (const name of used) {
      const declarations = byName.get(name)
      if (!declarations) continue
      for (const statement of declarations) {
        if (needed.has(statement) || skip?.(statement)) continue
        needed.add(statement)
        pending.push(statement)
      }
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

/** True when the file route sets a literal `ssr: false`. */
export function routeHasDisabledSsr(code: string, fileName: string): boolean {
  const program = parseProgram(fileName, code)
  const options = getCreateFileRouteOptions(program)
  return !!options && hasDisabledSsr(options)
}

function exportedLocalNames(statement: EstreeNode): Array<string> {
  if (statement.type !== 'ExportNamedDeclaration') return []
  const names: Array<string> = []
  for (const specifier of statement.specifiers ?? []) {
    const local = specifier.local?.name
    if (local) names.push(local)
  }
  return names
}

/** True when the statement publishes the `local` binding under the name `exported`. */
function exportsBindingAs(statement: EstreeNode, local: string, exported: string): boolean {
  if (statement.type !== 'ExportNamedDeclaration') return false
  if (statement.declaration) {
    return local === exported && declaredNames(statement.declaration).includes(local)
  }
  for (const specifier of statement.specifiers ?? []) {
    const name = specifier.exported?.name ?? specifier.exported?.value
    if (specifier.local?.name === local && name === exported) return true
  }
  return false
}

function uniqueName(base: string, taken: Set<string>): string {
  let candidate = base
  let suffix = 1
  while (taken.has(candidate)) candidate = `${base}${suffix++}`
  return candidate
}

function splitIdentifierNames(properties: Array<{ value: EstreeNode }>): Set<string> {
  const names = new Set<string>()
  for (const { value } of properties) {
    if (value.type === 'Identifier' && typeof value.name === 'string') {
      names.add(value.name)
    }
  }
  return names
}

/** Keep the Route factory and its remaining options, not component-only helpers. */
function isRouteExport(statement: EstreeNode): boolean {
  if (statement.type === 'ExportDefaultDeclaration') return true
  if (statement.type === 'ExportAllDeclaration') return true
  if (statement.type !== 'ExportNamedDeclaration') return false
  if (containsCreateFileRoute(statement)) return true
  if (declaredNames(statement).includes('Route')) return true
  return exportedLocalNames(statement).includes('Route')
}

/**
 * Keep other named exports (and their deps) so importers still receive them.
 * Skip bindings that are only the split UI — those stay in the virtual module.
 */
function isNonSplitNamedExport(statement: EstreeNode, splitIds: Set<string>): boolean {
  if (statement.type !== 'ExportNamedDeclaration') return false
  if (containsCreateFileRoute(statement) || declaredNames(statement).includes('Route')) {
    return false
  }
  const names = [...declaredNames(statement), ...exportedLocalNames(statement)]
  if (names.length === 0 || names.includes('Route')) return false
  return names.some((name) => !splitIds.has(name))
}

const TRIVIAL_SPLIT_CHARS = 96

function isTrivialSplitValue(value: EstreeNode): boolean {
  if (value.end - value.start > TRIVIAL_SPLIT_CHARS) return false
  const used = new Set<string>()
  collectIdentifiers(value, used)
  return used.size === 0
}

function printNamedImport(
  declaration: EstreeNode,
  used: Set<string>,
  extraNamed: Array<string>,
  code: string,
): string | undefined {
  const moduleName = declaration.source?.value
  if (typeof moduleName !== 'string') return code.slice(declaration.start, declaration.end)
  const moduleSource = slice(code, declaration.source)
  const attributes = code.slice(declaration.source.end, declaration.end).trim()
  const attributeSuffix = attributes ? ` ${attributes}` : ''
  const specifiers: Array<EstreeNode> = declaration.specifiers ?? []
  if (specifiers.length === 0) return `import ${moduleSource}${attributeSuffix}`

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
  return `import ${typeOnly}${parts.join(', ')} from ${moduleSource}${attributeSuffix}`
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
 * Print a split option value as a standalone expression. A method shorthand
 * value span starts at its parameter list, so it needs its own `function`
 * keyword plus the `async` and generator markers that sit before the key.
 */
function printSplitValue(code: string, property: { value: EstreeNode; method: boolean }) {
  const text = slice(code, property.value)
  if (!property.method) return text
  const asyncPrefix = property.value.async === true ? 'async ' : ''
  const generatorMark = property.value.generator === true ? '*' : ''
  return `${asyncPrefix}function${generatorMark} ${text}`
}

/**
 * Rewrite a route file so split UI properties load through `lazyRouteComponent`.
 * Loaders, `beforeLoad`, `head`, `ssr`, and `staticData` stay in this module.
 * SSR still renders the UI via the virtual `?tsr-split=` module; only literal
 * `ssr: false` routes are stubbed on the server (see the Vite plugin).
 */
export function compileReferenceRoute(code: string, fileName: string): string | null {
  const program = parseProgram(fileName, code)
  const options = getCreateFileRouteOptions(program)
  if (!options) return null
  const properties = splitPropertiesOf(options)
  if (properties.length === 0) return null

  const splitIds = splitIdentifierNames(properties)
  const bindings = new Set(
    (program.body ?? []).flatMap((statement: EstreeNode) => declaredNames(statement)),
  )
  let helperName = 'lazyRouteComponent'
  if (
    (program.body ?? []).some(
      (statement: EstreeNode) =>
        statement.type !== 'ImportDeclaration' && declaredNames(statement).includes(helperName),
    )
  ) {
    helperName = '__lazyRouteComponent'
    while (bindings.has(helperName)) helperName = `_${helperName}`
  }
  // A shorthand property shares its span with the key, so the key must be reprinted.
  const replacements = properties.map(({ key, value, shorthand, method, property }) => ({
    start: method ? property.start : value.start,
    end: method ? property.end : value.end,
    text:
      shorthand || method
        ? `${key}: ${lazyWrapper(fileName, key, helperName)}`
        : lazyWrapper(fileName, key, helperName),
  }))
  const rewritten = applyReplacements(code, replacements)
  const nextProgram = parseProgram(fileName, rewritten)
  const seeds = (nextProgram.body ?? []).filter(
    (statement: EstreeNode) =>
      isRouteExport(statement) ||
      isSideEffectImport(statement) ||
      isTopLevelEffect(statement) ||
      isNonSplitNamedExport(statement, splitIds),
  )
  if (seeds.length === 0) return rewritten
  const needed = neededStatements(nextProgram, seeds)
  const used = identifiersIn(needed)
  used.add(helperName)

  const runtimeImport = createFileRouteImportSource(nextProgram) ?? '@tanstack/react-router'
  const parts: Array<string> = []
  for (const statement of nextProgram.body ?? []) {
    if (!needed.has(statement)) continue
    if (statement.type === 'ImportDeclaration') {
      const extra =
        statement.source?.value === runtimeImport && helperName === 'lazyRouteComponent'
          ? ['lazyRouteComponent']
          : []
      const printed = printNamedImport(statement, used, extra, rewritten)
      if (printed) parts.push(printed)
      continue
    }
    parts.push(slice(rewritten, statement))
  }
  if (helperName !== 'lazyRouteComponent') {
    parts.unshift(`import { lazyRouteComponent as ${helperName} } from '${runtimeImport}'`)
  } else if (!parts.some((part) => part.includes('lazyRouteComponent'))) {
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
  const directives = prologueDirectives(program)
  const seeds = (program.body ?? []).filter((statement: EstreeNode) => {
    if (isCreateFileRouteBinding(statement)) return false
    if (directives.has(statement)) return true
    return declaredNames(statement).some((name) => used.has(name))
  })
  const needed = neededStatements(program, seeds, isCreateFileRouteBinding)
  const live = identifiersIn(needed)
  collectIdentifiers(match.value, live)
  live.delete('createFileRoute')

  const emitted: Array<EstreeNode> = (program.body ?? []).filter(
    (statement: EstreeNode) => needed.has(statement) && !isCreateFileRouteBinding(statement),
  )
  const splitBinding =
    match.value.type === 'Identifier' && typeof match.value.name === 'string'
      ? match.value.name
      : undefined
  // Only the exact binding behind the option counts; a wrapper that merely
  // reads an exported `component` still owes the module its own export.
  const alreadyExported =
    splitBinding !== undefined &&
    emitted.some((statement) => exportsBindingAs(statement, splitBinding, splitTarget))
  const reexportsBinding = !alreadyExported && splitBinding === splitTarget
  // A same-named binding already lives here, so the option needs its own name.
  const nameTaken =
    !alreadyExported &&
    !reexportsBinding &&
    emitted.some((statement) => declaredNames(statement).includes(splitTarget))

  const prologue: Array<string> = []
  const parts: Array<string> = []
  for (const statement of emitted) {
    if (directives.has(statement)) {
      prologue.push(slice(code, statement))
      continue
    }
    if (statement.type === 'ImportDeclaration') {
      const printed = printNamedImport(statement, live, [], code)
      if (printed) parts.push(printed)
      continue
    }
    if (nameTaken && exportsBindingAs(statement, splitTarget, splitTarget)) {
      parts.push(slice(code, statement.declaration))
      continue
    }
    parts.push(slice(code, statement))
  }
  if (live.has('Route')) {
    parts.unshift(`import { Route } from './${basename(fileName)}'`)
  }

  if (reexportsBinding) {
    parts.push(`export { ${splitTarget} }`)
  } else if (nameTaken) {
    const local = uniqueName(`$$${splitTarget}`, live)
    parts.push(`const ${local} = ${printSplitValue(code, match)}`)
    parts.push(`export { ${local} as ${splitTarget} }`)
  } else if (!alreadyExported) {
    parts.push(`export const ${splitTarget} = ${printSplitValue(code, match)}`)
  }
  return `${[...prologue, ...parts].join('\n\n')}\n`
}

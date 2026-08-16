import { existsSync, readFileSync } from 'node:fs'
import { dirname, extname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const EXTS = ['.ts', '.tsx', '.js', '.mjs']

function resolveRelative(parentURL, specifier) {
  const parentDir = dirname(fileURLToPath(parentURL))
  for (const ext of EXTS) {
    const file = join(parentDir, specifier + ext)
    if (existsSync(file)) return file
  }
  const index = join(parentDir, specifier, 'index.ts')
  return existsSync(index) ? index : undefined
}

export async function resolve(specifier, context, nextResolve) {
  const qIndex = specifier.indexOf('?')
  const query = qIndex === -1 ? '' : specifier.slice(qIndex)
  const bare = qIndex === -1 ? specifier : specifier.slice(0, qIndex)

  if (query.startsWith('?script-string') && context.parentURL && bare.startsWith('.')) {
    const file = resolveRelative(context.parentURL, bare)
    if (file) {
      return { url: `${pathToFileURL(file).href}?script-string`, shortCircuit: true }
    }
  }

  try {
    return await nextResolve(specifier, context)
  } catch (error) {
    if (!context.parentURL || !bare.startsWith('.') || extname(bare)) throw error
    const file = resolveRelative(context.parentURL, bare)
    if (!file) throw error
    return nextResolve(pathToFileURL(file).href + query, context)
  }
}

export async function load(url, context, nextLoad) {
  if (url.includes('?script-string')) {
    const file = fileURLToPath(url.slice(0, url.indexOf('?')))
    return {
      format: 'module',
      shortCircuit: true,
      source: `export default ${JSON.stringify(readFileSync(file, 'utf8'))}`,
    }
  }
  return nextLoad(url, context)
}

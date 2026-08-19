/**
 * Keep the private root and the four public packages on the same version.
 *
 *   node scripts/bump-release.mjs --bump none
 *   node scripts/bump-release.mjs --bump patch
 *   node scripts/bump-release.mjs --version 0.2.0
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const root = join(import.meta.dirname, '..')
const files = [
  'package.json',
  'packages/history/package.json',
  'packages/react-router/package.json',
  'packages/router-core/package.json',
  'packages/router-plugin/package.json',
]

const semver = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/

export function parseArgs(argv) {
  let bump = 'none'
  let version
  let check
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--bump') bump = argv[++i] ?? ''
    else if (arg === '--version') version = argv[++i] ?? ''
    else if (arg === '--check') check = argv[++i] ?? ''
    else throw new Error(`unknown argument: ${arg}`)
  }
  return { bump, version, check }
}

export function bumpSemver(current, kind) {
  const match = semver.exec(current)
  if (match == null) throw new Error(`invalid current version: ${current}`)
  const major = Number(match[1])
  const minor = Number(match[2])
  const patch = Number(match[3])
  const pre = match[4]
  if (kind === 'major') return `${major + 1}.0.0`
  if (kind === 'minor') return `${major}.${minor + 1}.0`
  if (kind === 'patch') return `${major}.${minor}.${patch + 1}`
  if (kind === 'prerelease') {
    if (pre != null) {
      const numbered = /^(.*?)(\d+)$/.exec(pre)
      if (numbered != null)
        return `${major}.${minor}.${patch}-${numbered[1]}${Number(numbered[2]) + 1}`
      return `${major}.${minor}.${patch}-${pre}.1`
    }
    return `${major}.${minor}.${patch + 1}-0`
  }
  throw new Error(`unknown bump: ${kind}`)
}

export function nextVersion(current, bump, exact) {
  if (exact != null && exact !== '' && !semver.test(exact)) {
    throw new Error(`invalid version: ${exact}`)
  }
  if (
    (exact == null || exact === '') &&
    !['none', 'patch', 'minor', 'major', 'prerelease'].includes(bump)
  ) {
    throw new Error(`unknown bump: ${bump}`)
  }
  if (exact != null && exact !== '') return exact
  if (bump === 'none') return current
  return bumpSemver(current, bump)
}

export function writeLockstepVersion(version, base = root) {
  for (const file of files) {
    const path = join(base, file)
    const json = JSON.parse(readFileSync(path, 'utf8'))
    json.version = version
    writeFileSync(path, `${JSON.stringify(json, null, 2)}\n`)
  }
}

export function readLockstepVersion(base = root) {
  let expected
  for (const file of files) {
    const version = JSON.parse(readFileSync(join(base, file), 'utf8')).version
    if (expected == null) expected = version
    else if (version !== expected) {
      throw new Error(`version mismatch: ${file} is ${version}, expected ${expected}`)
    }
  }
  return expected
}

export function assertLockstepVersion(expected, base = root) {
  if (expected == null || expected === '' || !semver.test(expected)) {
    throw new Error(`invalid version: ${expected}`)
  }
  const current = readLockstepVersion(base)
  if (current !== expected) {
    throw new Error(`tag version ${expected} does not match package version ${current}`)
  }
  return current
}

function main() {
  const { bump, version: exact, check } = parseArgs(process.argv.slice(2))
  if (check != null && check !== '') {
    process.stdout.write(assertLockstepVersion(check))
    return
  }
  const current = JSON.parse(
    readFileSync(join(root, 'packages/react-router/package.json'), 'utf8'),
  ).version
  const next = nextVersion(current, bump, exact)
  writeLockstepVersion(next)
  process.stdout.write(next)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main()
}

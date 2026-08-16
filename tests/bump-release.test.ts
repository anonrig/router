import { bumpSemver, nextVersion, parseArgs } from '../scripts/bump-release.mjs'
import { describe, expect, test } from 'vitest'

describe('bump-release', () => {
  test('parses bump and exact version flags', () => {
    expect(parseArgs([])).toEqual({ bump: 'none', version: undefined })
    expect(parseArgs(['--bump', 'patch'])).toEqual({ bump: 'patch', version: undefined })
    expect(parseArgs(['--version', '1.2.3'])).toEqual({ bump: 'none', version: '1.2.3' })
  })

  test('bumps semver in lockstep', () => {
    expect(bumpSemver('0.1.0', 'patch')).toBe('0.1.1')
    expect(bumpSemver('0.1.0', 'minor')).toBe('0.2.0')
    expect(bumpSemver('0.1.0', 'major')).toBe('1.0.0')
    expect(bumpSemver('0.1.0', 'prerelease')).toBe('0.1.1-0')
    expect(bumpSemver('0.1.1-0', 'prerelease')).toBe('0.1.1-1')
  })

  test('prefers an exact version over the bump', () => {
    expect(nextVersion('0.1.0', 'major', '0.1.0')).toBe('0.1.0')
    expect(nextVersion('0.1.0', 'none', '')).toBe('0.1.0')
  })

  test('rejects invalid versions', () => {
    expect(() => nextVersion('0.1.0', 'none', 'v0.1.0')).toThrow('invalid version')
    expect(() => nextVersion('0.1.0', 'sideways', '')).toThrow('unknown bump')
  })
})

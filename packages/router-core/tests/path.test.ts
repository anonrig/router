import { describe, expect, it } from 'vitest'
import {
  cleanPath,
  exactPathTest,
  interpolatePath,
  joinPaths,
  removeTrailingSlash,
  resolvePath,
  trimPath,
  trimPathLeft,
  trimPathRight,
} from '../src/path'

describe('path utils', () => {
  it('cleans duplicate slashes without regex', () => {
    expect(cleanPath('/a//b///c')).toBe('/a/b/c')
    expect(cleanPath('//')).toBe('/')
  })

  it('trims slashes', () => {
    expect(trimPathLeft('/a/b')).toBe('a/b')
    expect(trimPathLeft('/')).toBe('/')
    expect(trimPathRight('/a/b/')).toBe('/a/b')
    expect(trimPathRight('/')).toBe('/')
    expect(trimPath('/a/b/')).toBe('a/b')
  })

  it('joins paths', () => {
    expect(joinPaths(['/a', 'b', '/c'])).toBe('/a/b/c')
    expect(joinPaths(['/', 'posts'])).toBe('/posts')
  })

  it('removes trailing slashes except root and basepath', () => {
    expect(removeTrailingSlash('/app/', '/app')).toBe('/app/')
    expect(removeTrailingSlash('/app/posts/', '/app')).toBe('/app/posts')
    expect(removeTrailingSlash('/', '/')).toBe('/')
  })

  it('compares exact paths', () => {
    expect(exactPathTest('/a/b', '/a/b/', '/')).toBe(true)
    expect(exactPathTest('/a/b', '/a/c', '/')).toBe(false)
  })
})

describe('resolvePath', () => {
  it.each([
    ['/', '/', '/'],
    ['/', '/a', '/a'],
    ['/', 'a/', '/a'],
    ['/a', 'b', '/a/b'],
    ['/a/b/c', '../d', '/a/b/d'],
    ['/a/b/c', '../../d', '/a/d'],
    ['/a/b/c', '..', '/a/b'],
    ['/a/b/c', '../..', '/a'],
    ['/a/b/c', '../../..', '/'],
    ['/a', '/absolute', '/absolute'],
    ['/a/b/c', './d', '/a/b/c/d'],
  ] as const)('%s + %s = %s', (base, to, expected) => {
    expect(resolvePath({ base, to })).toBe(expected)
  })

  it('honors trailingSlash always', () => {
    expect(resolvePath({ base: '/a/b/c', to: 'd', trailingSlash: 'always' })).toBe(
      '/a/b/c/d/',
    )
  })
})

describe('interpolatePath', () => {
  it('fills $params', () => {
    expect(
      interpolatePath({ path: '/posts/$slug', params: { slug: 'hello' } })
        .interpolatedPath,
    ).toBe('/posts/hello')
  })

  it('fills splat', () => {
    expect(
      interpolatePath({ path: '/files/$', params: { _splat: 'a/b' } })
        .interpolatedPath,
    ).toBe('/files/a/b')
  })

  it('skips optional params when missing', () => {
    expect(
      interpolatePath({ path: '/docs/{-$lang}/hello', params: {} }).interpolatedPath,
    ).toBe('/docs/hello')
  })

  it('reports missing params', () => {
    expect(
      interpolatePath({ path: '/posts/$slug', params: {} }).isMissingParams,
    ).toBe(true)
  })
})

import { describe, expect, it } from 'vitest'
import { decode, encode } from '../src/qss'
import { defaultParseSearch, defaultStringifySearch } from '../src/search-params'

describe('qss', () => {
  it('encodes and decodes primitives', () => {
    const encoded = encode({ token: 'foo', n: 1, flag: true })
    expect(encoded).toBe('token=foo&n=1&flag=true')
    expect(decode(encoded)).toEqual({ token: 'foo', n: 1, flag: true })
  })

  it('decodes repeated keys as arrays', () => {
    expect(decode('a=1&a=2')).toEqual({ a: [1, 2] })
  })

  it('handles empty and leading question marks', () => {
    expect(decode('')).toEqual({})
    expect(decode('?foo=bar')).toEqual({ foo: 'bar' })
  })

  it('encodes spaces as +', () => {
    expect(encode({ q: 'hello world' })).toBe('q=hello+world')
    expect(decode('q=hello+world')).toEqual({ q: 'hello world' })
  })

  it('returns a fresh object so callers can mutate the result', () => {
    const first = decode('foo=bar')
    first.foo = 'mutated'
    expect(decode('foo=bar')).toEqual({ foo: 'bar' })
  })
})

describe('search params', () => {
  it('round-trips objects via JSON', () => {
    const search = { page: 1, filter: { tag: 'js' } }
    const str = defaultStringifySearch(search)
    expect(str.startsWith('?')).toBe(true)
    expect(defaultParseSearch(str)).toEqual(search)
  })
})

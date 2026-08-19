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

  it('decodes valid bytes around malformed percent escapes', () => {
    expect(decode('a=%E0%A4%A')).toEqual({ a: '\uFFFD%A' })
  })

  it('encodes spaces as +', () => {
    expect(encode({ q: 'hello world' })).toBe('q=hello+world')
    expect(decode('q=hello+world')).toEqual({ q: 'hello world' })
  })

  it('encodes lone surrogates the same way as URLSearchParams', () => {
    const lone = '\uD800'
    expect(encode({ q: lone })).toBe(`q=${encodeURIComponent('\uFFFD')}`)
    expect(encode({ q: lone })).toBe(new URLSearchParams({ q: lone }).toString())
  })

  it('does not reuse a cached string after the same object mutates', () => {
    const search = { q: 'one' }
    expect(encode(search)).toBe('q=one')
    search.q = 'two'
    expect(encode(search)).toBe('q=two')
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

  it('stringifies a mutated search object instead of the previous snapshot', () => {
    const search = { page: 1 }
    expect(defaultStringifySearch(search)).toBe('?page=1')
    search.page = 2
    expect(defaultStringifySearch(search)).toBe('?page=2')
  })
})

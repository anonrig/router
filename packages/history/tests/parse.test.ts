import { describe, expect, test } from 'vitest'
import { parseHref } from '../src/parse'

describe('parseHref', () => {
  test('parses query-only href without setting pathname to the query string', () => {
    const parsed = parseHref('?foo=bar', undefined)
    expect(parsed.pathname).toBe('')
    expect(parsed.search).toBe('?foo=bar')
    expect(parsed.hash).toBe('')
    expect(parsed.href).toBe('?foo=bar')
  })

  test('parses hash-only href without setting pathname to the hash string', () => {
    const parsed = parseHref('#heading', undefined)
    expect(parsed.pathname).toBe('')
    expect(parsed.search).toBe('')
    expect(parsed.hash).toBe('#heading')
    expect(parsed.href).toBe('#heading')
  })

  test('parses query and hash starting at index 0', () => {
    const parsed = parseHref('?foo=bar#heading', undefined)
    expect(parsed.pathname).toBe('')
    expect(parsed.search).toBe('?foo=bar')
    expect(parsed.hash).toBe('#heading')
    expect(parsed.href).toBe('?foo=bar#heading')
  })

  test('parses normal paths with query and hash correctly', () => {
    const parsed = parseHref('/users/profile?id=1#section', undefined)
    expect(parsed.pathname).toBe('/users/profile')
    expect(parsed.search).toBe('?id=1')
    expect(parsed.hash).toBe('#section')
    expect(parsed.href).toBe('/users/profile?id=1#section')
  })

  test('parses empty string correctly', () => {
    const parsed = parseHref('', undefined)
    expect(parsed.pathname).toBe('')
    expect(parsed.search).toBe('')
    expect(parsed.hash).toBe('')
    expect(parsed.href).toBe('')
  })
})

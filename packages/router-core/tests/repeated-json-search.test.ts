import { describe, expect, it } from 'vitest'
import { decode } from '../src/qss'
import { defaultParseSearch } from '../src/search-params'

describe('repeated search keys with JSON values', () => {
  it('parses each repeated JSON object value', () => {
    expect(defaultParseSearch('?filter={"a":1}&filter={"b":2}').filter).toEqual([
      { a: 1 },
      { b: 2 },
    ])
  })

  it('parses each repeated JSON array value', () => {
    expect(defaultParseSearch('?foo=[1]&foo=[2]').foo).toEqual([[1], [2]])
  })

  it('still keeps repeated plain strings as arrays via decode', () => {
    expect(decode('tag=a&tag=b')).toEqual({ tag: ['a', 'b'] })
  })
})

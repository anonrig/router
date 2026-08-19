import { describe, expect, test } from 'vitest'
import { executeRewriteInput, executeRewriteOutput } from '../src/rewrite'

describe('rewrite string results', () => {
  test('relative input strings resolve against the current URL', () => {
    const url = new URL('https://example.com/posts/1')
    const rewritten = executeRewriteInput({ input: () => 'comments' }, url)
    expect(rewritten.href).toBe('https://example.com/posts/comments')
  })

  test('relative output strings resolve against the current URL', () => {
    const url = new URL('https://example.com/posts/1')
    const rewritten = executeRewriteOutput({ output: () => 'comments' }, url)
    expect(rewritten.href).toBe('https://example.com/posts/comments')
  })
})

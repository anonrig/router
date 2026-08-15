import { bench, describe } from 'vitest'
import { createMemoryHistory, parseHref } from '../packages/history/src/index.ts'

describe('history', () => {
  const history = createMemoryHistory({ initialEntries: ['/'] })

  bench('parseHref', () => {
    parseHref('/posts/abc?tab=specs&page=2#comments', undefined)
  })

  bench('memory push', () => {
    history.push('/posts/1')
  })

  bench('memory replace', () => {
    history.replace('/posts/2')
  })

  bench('memory back + forward', () => {
    history.push('/a')
    history.push('/b')
    history.back()
    history.forward()
  })
})

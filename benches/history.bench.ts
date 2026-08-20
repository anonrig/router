import { bench, describe } from 'vitest'
import { createMemoryHistory, parseHref } from '../packages/history/src/index.ts'

describe('history', () => {
  // Dedicated instance per bench: a shared unbounded history grows to millions
  // of entries over a run, so entry-array growth and GC pauses dominate the
  // numbers (30-140ms outliers, ±20-50% variance). `compact: true` bounds the
  // arrays with the library's own amortized compaction for the benches that
  // append entries.
  const pushHistory = createMemoryHistory({ initialEntries: ['/'], compact: true })
  const replaceHistory = createMemoryHistory({ initialEntries: ['/'] })
  const travelHistory = createMemoryHistory({ initialEntries: ['/'], compact: true })

  bench('parseHref', () => {
    parseHref('/posts/abc?tab=specs&page=2#comments', undefined)
  })

  bench('memory push', () => {
    pushHistory.push('/posts/1')
  })

  bench('memory replace', () => {
    replaceHistory.replace('/posts/2')
  })

  bench('memory back + forward', () => {
    travelHistory.push('/a')
    travelHistory.push('/b')
    travelHistory.back()
    travelHistory.forward()
  })
})

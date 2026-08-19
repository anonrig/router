import { beforeEach, expect, test, vi } from 'vitest'
import { useMatch } from '../src/use-match'
import { useMatches } from '../src/matches'
import { useRouterState } from '../src/use-router-state'

vi.mock('../src/use-router', () => ({
  useRouter: () => ({}),
}))

vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react')>()),
  useContext: () => undefined,
}))

vi.mock('../src/use-router-state', () => ({
  useRouterState: vi.fn(() => undefined),
}))

beforeEach(() => {
  vi.mocked(useRouterState).mockClear()
})

test('useMatch forwards structural sharing', () => {
  useMatch({
    strict: false,
    shouldThrow: false,
    structuralSharing: true,
  })

  expect(useRouterState).toHaveBeenCalledWith(expect.objectContaining({ structuralSharing: true }))
})

test('useMatches forwards structural sharing', () => {
  useMatches({ structuralSharing: true })

  expect(useRouterState).toHaveBeenCalledWith(expect.objectContaining({ structuralSharing: true }))
})

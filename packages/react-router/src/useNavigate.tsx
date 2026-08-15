import { useCallback } from 'react'
import { useRouter } from './useRouter'
import type { NavigateOptions } from '@anonrig/router-core'

export function useNavigate(opts?: { from?: string }) {
  const router = useRouter()
  return useCallback(
    (options: NavigateOptions = {}) =>
      router.navigate({ from: opts?.from, ...options }),
    [router, opts?.from],
  )
}

export function Navigate(props: NavigateOptions) {
  const navigate = useNavigate()
  navigate(props)
  return null
}

export type UseNavigateResult<T = any> = ReturnType<typeof useNavigate>

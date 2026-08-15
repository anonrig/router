import {
  use as reactUseImpl,
  useEffect,
  useLayoutEffect as useLayoutEffectReact,
  useRef,
  type Ref,
} from 'react'

export const useLayoutEffect =
  typeof document !== 'undefined' ? useLayoutEffectReact : useEffect

export const reactUse = reactUseImpl

export function useForwardedRef<T>(ref: Ref<T> | undefined) {
  const inner = useRef<T | null>(null)
  return (ref as any) ?? inner
}

export function useIntersectionObserver(
  _ref: any,
  _opts?: IntersectionObserverInit,
) {
  return { isIntersecting: false }
}

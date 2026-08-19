import {
  use as reactUseImpl,
  useEffect,
  useImperativeHandle,
  useLayoutEffect as useLayoutEffectReact,
  useRef,
  type Ref,
  type RefObject,
} from 'react'

export const useLayoutEffect = typeof document !== 'undefined' ? useLayoutEffectReact : useEffect

export const reactUse = reactUseImpl

export function useForwardedRef<T>(ref?: Ref<T> | null) {
  const innerRef = useRef<T | null>(null)
  useImperativeHandle(ref, () => innerRef.current as T)
  return innerRef
}

export function useIntersectionObserver(
  ref: RefObject<Element | null> | { current: Element | null },
  callback: (entry?: IntersectionObserverEntry) => void,
  disabled?: boolean,
  options?: IntersectionObserverInit,
  resetKey?: unknown,
  onCleanup?: () => void,
) {
  useEffect(() => {
    if (disabled || typeof IntersectionObserver === 'undefined' || !ref.current) {
      return () => {
        callback()
        onCleanup?.()
      }
    }
    const observer = new IntersectionObserver(
      (entries) => {
        callback(entries[entries.length - 1])
      },
      options ?? { rootMargin: '100px' },
    )
    observer.observe(ref.current)
    return () => {
      observer.disconnect()
      callback()
      onCleanup?.()
    }
  }, [ref, callback, disabled, options, resetKey, onCleanup])
}

import {
  use as reactUseImpl,
  useEffect,
  useLayoutEffect as useLayoutEffectReact,
  useRef,
  type Ref,
  type RefObject,
} from 'react'

export const useLayoutEffect = typeof document !== 'undefined' ? useLayoutEffectReact : useEffect

export const reactUse = reactUseImpl

export function useForwardedRef<T>(ref: Ref<T> | undefined) {
  const inner = useRef<T | null>(null)
  return (ref as any) ?? inner
}

export function useIntersectionObserver(
  ref: RefObject<Element | null> | { current: Element | null },
  callback: (entry: IntersectionObserverEntry) => void,
  disabled?: boolean,
  options?: IntersectionObserverInit,
  resetKey?: unknown,
  onCleanup?: () => void,
) {
  const callbackRef = useRef(callback)
  callbackRef.current = callback
  const cleanupRef = useRef(onCleanup)
  cleanupRef.current = onCleanup
  useEffect(() => {
    if (disabled || typeof IntersectionObserver === 'undefined') return
    const node = ref.current
    if (!node) return
    const observer = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1]
      if (entry) callbackRef.current(entry)
    }, options)
    observer.observe(node)
    return () => {
      observer.disconnect()
      cleanupRef.current?.()
    }
  }, [ref, disabled, options, resetKey])
}

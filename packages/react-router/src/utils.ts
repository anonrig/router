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
) {
  useEffect(() => {
    if (disabled || typeof IntersectionObserver === 'undefined') return
    const node = ref.current
    if (!node) return
    const observer = new IntersectionObserver((entries) => {
      const entry = entries[0]
      if (entry) callback(entry)
    }, options)
    observer.observe(node)
    return () => observer.disconnect()
  }, [ref, callback, disabled, options])
}

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

export function useForwardedRef<T = Element>(ref?: Ref<T> | null) {
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

type ProximityEntry = {
  el: Element
  proximity: number
  inside: boolean
  callback: (entry?: IntersectionObserverEntry) => void
}

const proximityEntries = new Set<ProximityEntry>()
let proximityPointer: { x: number; y: number } | null = null
let proximityFrame: number | null = null

function measureProximity() {
  proximityFrame = null
  const point = proximityPointer
  if (!point) return
  for (const entry of proximityEntries) {
    const rect = entry.el.getBoundingClientRect()
    const dx = Math.max(rect.left - point.x, 0, point.x - rect.right)
    const dy = Math.max(rect.top - point.y, 0, point.y - rect.bottom)
    const within = dx * dx + dy * dy <= entry.proximity * entry.proximity
    if (within !== entry.inside) {
      entry.inside = within
      entry.callback({ isIntersecting: within } as IntersectionObserverEntry)
    }
  }
}

function trackProximityPointer(event: PointerEvent) {
  proximityPointer = { x: event.clientX, y: event.clientY }
  proximityFrame ??= requestAnimationFrame(measureProximity)
}

/**
 * Report pointer entry/exit of the proximity radius around `ref` through
 * `callback`, shaped like an IntersectionObserver entry so links can reuse
 * their preload scheduling (enter schedules, exit cancels). All proximity
 * links share one document `pointermove` listener, and distances are
 * measured against bounding rects at most once per animation frame.
 */
export function useProximityPreload(
  ref: RefObject<Element | null> | { current: Element | null },
  callback: (entry?: IntersectionObserverEntry) => void,
  proximity: number,
) {
  useEffect(() => {
    const el = ref.current
    if (!(proximity > 0) || !el) return
    const entry: ProximityEntry = { el, proximity, inside: false, callback }
    if (proximityEntries.size === 0) {
      document.addEventListener('pointermove', trackProximityPointer, { passive: true })
    }
    proximityEntries.add(entry)
    return () => {
      proximityEntries.delete(entry)
      if (proximityEntries.size === 0) {
        document.removeEventListener('pointermove', trackProximityPointer)
        proximityPointer = null
        if (proximityFrame !== null) {
          cancelAnimationFrame(proximityFrame)
          proximityFrame = null
        }
      }
      // Unmounting while inside the radius must cancel a still-pending preload.
      if (entry.inside) callback({ isIntersecting: false } as IntersectionObserverEntry)
    }
  }, [ref, callback, proximity])
}

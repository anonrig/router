import { use, type ReactNode } from 'react'

export function useAwaited<T>({ promise }: { promise: Promise<T> }): [T] {
  return [use(promise)]
}

export function Await<T>({
  promise,
  children,
}: {
  promise: Promise<T>
  children: (data: T) => ReactNode
}) {
  const data = use(promise)
  return children(data)
}

export type AwaitOptions<T = any> = { promise: Promise<T> }

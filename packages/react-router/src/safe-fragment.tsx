import type { ReactNode } from 'react'

export function SafeFragment(props: { children?: ReactNode }) {
  return props.children ?? null
}

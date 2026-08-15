import { use as reactUseImpl, useEffect, useLayoutEffect as useLayoutEffectReact } from 'react'

export const useLayoutEffect =
  typeof document !== 'undefined' ? useLayoutEffectReact : useEffect

export const reactUse = reactUseImpl

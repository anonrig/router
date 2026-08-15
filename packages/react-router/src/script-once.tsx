import { isServer } from '@anonrig/router-core/is-server'
import { useRouter } from './use-router'

/**
 * Server-only helper to emit a script tag exactly once during SSR.
 */
export function ScriptOnce({ children }: { children: string }) {
  const router = useRouter()
  if (!(isServer ?? router.isServer)) {
    return null
  }

  return (
    <script
      nonce={router.options.ssr?.nonce}
      dangerouslySetInnerHTML={{
        __html: children + ';document.currentScript.remove()',
      }}
    />
  )
}

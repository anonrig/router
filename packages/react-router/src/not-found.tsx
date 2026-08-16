import { Component, type ReactNode } from 'react'
import { isNotFound } from 'fast-router-core'

export function DefaultGlobalNotFound() {
  return <p>Not Found</p>
}

export class CatchNotFound extends Component<
  {
    onCatch?: (error: any) => void
    fallback?: (error: any) => ReactNode
    children: ReactNode
  },
  { error: any }
> {
  state = { error: null as any }

  static getDerivedStateFromError(error: any) {
    if (isNotFound(error)) return { error }
    throw error
  }

  componentDidCatch(error: any) {
    if (isNotFound(error)) this.props.onCatch?.(error)
  }

  render() {
    if (this.state.error) {
      return this.props.fallback?.(this.state.error) ?? <DefaultGlobalNotFound />
    }
    return this.props.children
  }
}

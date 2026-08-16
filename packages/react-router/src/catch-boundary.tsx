import { Component, type ErrorInfo, type ReactNode } from 'react'
import { wrapInNonRouteComponentContext } from './non-route-component-context'

export function ErrorComponent({ error }: { error: unknown; reset?: () => void; info?: any }) {
  const message = Error.isError(error) ? error.message : String(error)
  return (
    <div style={{ padding: 8, color: 'red' }} data-error>
      <div>Something went wrong!</div>
      {message ? <div>{message}</div> : null}
    </div>
  )
}

export class CatchBoundary extends Component<
  {
    getResetKey?: () => unknown
    errorComponent?: any
    onCatch?: (error: Error, info: ErrorInfo) => void
    children: ReactNode
  },
  { error: Error | null; info?: ErrorInfo; resetKey?: unknown }
> {
  state: { error: Error | null; info?: ErrorInfo; resetKey?: unknown } = { error: null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  static getDerivedStateFromProps(
    props: CatchBoundary['props'],
    state: { error: Error | null; info?: ErrorInfo; resetKey?: unknown },
  ) {
    const resetKey = props.getResetKey?.()
    if (state.resetKey !== resetKey) {
      return { error: null, info: undefined, resetKey }
    }
    return null
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    this.props.onCatch?.(error, info)
    this.setState({ info })
  }

  render() {
    if (this.state.error) {
      const Comp = this.props.errorComponent ?? ErrorComponent
      const errorElement = (
        <Comp
          error={this.state.error}
          info={this.state.info}
          reset={() => this.setState({ error: null })}
        />
      )
      return process.env.NODE_ENV !== 'production'
        ? wrapInNonRouteComponentContext(errorElement, 'errorComponent')
        : errorElement
    }
    return this.props.children
  }
}

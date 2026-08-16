import { Component, type ErrorInfo, type ReactNode } from 'react'

export function ErrorComponent({ error }: { error: unknown; reset?: () => void; info?: any }) {
  const message = Error.isError(error) ? error.message : String(error)
  return (
    <div style={{ padding: 8, color: 'red' }} data-error>
      {message}
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
  { error: Error | null; info?: ErrorInfo }
> {
  state: { error: Error | null; info?: ErrorInfo } = { error: null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    this.props.onCatch?.(error, info)
    this.setState({ info })
  }

  componentDidUpdate(prevProps: this['props']) {
    if (
      this.state.error &&
      this.props.getResetKey &&
      prevProps.getResetKey &&
      this.props.getResetKey() !== prevProps.getResetKey()
    ) {
      this.setState({ error: null })
    }
  }

  render() {
    if (this.state.error) {
      const Comp = this.props.errorComponent ?? ErrorComponent
      return (
        <Comp
          error={this.state.error}
          info={this.state.info}
          reset={() => this.setState({ error: null })}
        />
      )
    }
    return this.props.children
  }
}

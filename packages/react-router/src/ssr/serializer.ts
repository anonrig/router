import type * as React from 'react'

declare module '@anonrig/router-core' {
  export interface SerializerExtensions {
    ReadableStream: React.JSX.Element
  }
}

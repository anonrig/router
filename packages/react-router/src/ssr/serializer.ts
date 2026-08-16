import type * as React from 'react'

declare module 'fast-router-core' {
  export interface SerializerExtensions {
    ReadableStream: React.JSX.Element
  }
}

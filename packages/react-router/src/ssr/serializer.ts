import type * as React from 'react'

declare module 'speedy-router-core' {
  export interface SerializerExtensions {
    ReadableStream: React.JSX.Element
  }
}

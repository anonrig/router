import { ReadableStreamPlugin } from 'seroval-plugins/web'
import { ShallowErrorPlugin } from './shallow-error-plugin'
import { RawStreamSSRPlugin } from './raw-stream'
import type { RawStream } from './raw-stream'
import type { Plugin } from 'seroval'

export const defaultSerovalPlugins = [
  ShallowErrorPlugin as Plugin<Error, any>,
  // RawStreamSSRPlugin must come before ReadableStreamPlugin to match first
  RawStreamSSRPlugin as Plugin<RawStream, any>,
  // ReadableStreamNode is not exported by seroval
  ReadableStreamPlugin as Plugin<ReadableStream, any>,
]

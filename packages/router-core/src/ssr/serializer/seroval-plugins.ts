import { createPlugin } from 'seroval'
import { ReadableStreamPlugin } from 'seroval-plugins/web'
import { RawStreamSSRPlugin } from './raw-stream'
import type { Plugin, PluginInfo, SerovalNode } from 'seroval'
import type { RawStream } from './raw-stream'

interface ErrorNode extends PluginInfo {
  message: SerovalNode
}

const parseMessage = (value: Error, ctx: { parse: (value: unknown) => SerovalNode }) => ({
  message: ctx.parse(value.message),
})

/**
 * Serializes only `Error.message` so values like ZodError (with attached
 * functions) can still cross the SSR boundary.
 */
const ShallowErrorPlugin = /* @__PURE__ */ createPlugin<Error, ErrorNode>({
  tag: '$TSR/Error',
  test(value) {
    return Error.isError(value)
  },
  parse: {
    sync: parseMessage,
    async async(value, ctx) {
      return {
        message: await ctx.parse(value.message),
      }
    },
    stream: parseMessage,
  },
  serialize(node, ctx) {
    return 'new Error(' + ctx.serialize(node.message) + ')'
  },
  deserialize(node, ctx) {
    return new Error(ctx.deserialize(node.message))
  },
})

export const defaultSerovalPlugins = [
  ShallowErrorPlugin as Plugin<Error, any>,
  // RawStreamSSRPlugin must come before ReadableStreamPlugin to match first
  RawStreamSSRPlugin as Plugin<RawStream, any>,
  // ReadableStreamNode is not exported by seroval
  ReadableStreamPlugin as Plugin<ReadableStream, any>,
]

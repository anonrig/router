import { createPlugin } from 'seroval'
import { GLOBAL_TSR } from '../constants'
import type { Plugin, PluginInfo, SerovalNode } from 'seroval'
import type { AnySerializationAdapter } from './transformer-types'

export { createSerializationAdapter } from './transformer-types'
export type * from './transformer-types'

export interface AdapterNode extends PluginInfo {
  v: SerovalNode
}

/** Create a Seroval plugin for server-side serialization only. */
/* @__NO_SIDE_EFFECTS__ */
export function makeSsrSerovalPlugin(
  serializationAdapter: AnySerializationAdapter,
  options: { didRun: boolean },
): Plugin<any, AdapterNode> {
  return /* @__PURE__ */ createPlugin<any, AdapterNode>({
    tag: '$TSR/t/' + serializationAdapter.key,
    test: serializationAdapter.test,
    parse: {
      stream(value, ctx, _data) {
        return {
          v: ctx.parse(serializationAdapter.toSerializable(value)),
        }
      },
    },
    serialize(node, ctx, _data) {
      options.didRun = true
      return (
        GLOBAL_TSR + '.t.get("' + serializationAdapter.key + '")(' + ctx.serialize(node.v) + ')'
      )
    },
    // we never deserialize on the server during SSR
    deserialize: undefined as never,
  })
}

/** Create a Seroval plugin for client/server symmetric (de)serialization. */
/* @__NO_SIDE_EFFECTS__ */
export function makeSerovalPlugin(
  serializationAdapter: AnySerializationAdapter,
): Plugin<any, AdapterNode> {
  return /* @__PURE__ */ createPlugin<any, AdapterNode>({
    tag: '$TSR/t/' + serializationAdapter.key,
    test: serializationAdapter.test,
    parse: {
      sync(value, ctx, _data) {
        return {
          v: ctx.parse(serializationAdapter.toSerializable(value)),
        }
      },
      async async(value, ctx, _data) {
        return {
          v: await ctx.parse(serializationAdapter.toSerializable(value)),
        }
      },
      stream(value, ctx, _data) {
        return {
          v: ctx.parse(serializationAdapter.toSerializable(value)),
        }
      },
    },
    // we don't generate JS code outside of SSR (for now)
    serialize: undefined as never,
    deserialize(node, ctx, _data) {
      return serializationAdapter.fromSerializable(ctx.deserialize(node.v))
    },
  })
}

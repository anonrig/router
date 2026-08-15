import type { RegisteredConfigType, RegisteredSsr, SSROption } from '../../router'
import type { LooseReturnType } from '../../utils'
import type { AnyRoute, ResolveAllSSR } from '../../route'

export interface RawStream {
  readonly stream: ReadableStream<Uint8Array>
  readonly hint: 'binary' | 'text'
}

declare const TSR_SERIALIZABLE: unique symbol
export type TSR_SERIALIZABLE = typeof TSR_SERIALIZABLE

export type TsrSerializable = { [TSR_SERIALIZABLE]: true }

export interface DefaultSerializable {
  number: number
  string: string
  boolean: boolean
  null: null
  undefined: undefined
  bigint: bigint
  Date: Date
  Uint8Array: Uint8Array
  RawStream: RawStream
  TsrSerializable: TsrSerializable
  void: void
}

export interface SerializableExtensions extends DefaultSerializable {}

export type Serializable = SerializableExtensions[keyof SerializableExtensions]

export type UnionizeSerializationAdaptersInput<
  TAdapters extends ReadonlyArray<AnySerializationAdapter>,
> = TAdapters[number]['~types']['input']

export function createSerializationAdapter<
  TInput = unknown,
  TOutput = unknown,
  const TExtendsAdapters extends ReadonlyArray<AnySerializationAdapter> | never = never,
>(
  opts: CreateSerializationAdapterOptions<TInput, TOutput, TExtendsAdapters>,
): SerializationAdapter<TInput, TOutput, TExtendsAdapters> {
  return opts as unknown as SerializationAdapter<TInput, TOutput, TExtendsAdapters>
}

export interface CreateSerializationAdapterOptions<
  TInput,
  TOutput,
  TExtendsAdapters extends ReadonlyArray<AnySerializationAdapter> | never,
> {
  key: string
  extends?: TExtendsAdapters
  test: (value: unknown) => value is TInput
  toSerializable: (
    value: TInput,
  ) => ValidateSerializable<
    TOutput,
    Serializable | UnionizeSerializationAdaptersInput<TExtendsAdapters>
  >
  fromSerializable: (value: TOutput) => TInput
}

export type ValidateSerializable<T, TSerializable> = T extends TSerializable
  ? T
  : T extends (...args: Array<any>) => any
    ? SerializationError<'Function may not be serializable'>
    : T extends RegisteredReadableStream
      ? SerializationError<'JSX is not be serializable'>
      : T extends ReadonlyArray<any>
        ? ValidateSerializableArray<T, TSerializable>
        : T extends Promise<any>
          ? ValidateSerializablePromise<T, TSerializable>
          : T extends ReadableStream<any>
            ? ValidateReadableStream<T, TSerializable>
            : T extends Set<any>
              ? ValidateSerializableSet<T, TSerializable>
              : T extends Map<any, any>
                ? ValidateSerializableMap<T, TSerializable>
                : T extends AsyncGenerator<any, any>
                  ? ValidateSerializableAsyncGenerator<T, TSerializable>
                  : T extends object
                    ? ValidateSerializableMapped<T, TSerializable>
                    : SerializationError<'Type may not be serializable'>

export type ValidateSerializableAsyncGenerator<T, TSerializable> =
  T extends AsyncGenerator<infer T, infer TReturn, infer TNext>
    ? AsyncGenerator<
        ValidateSerializable<T, TSerializable>,
        ValidateSerializable<TReturn, TSerializable>,
        TNext
      >
    : never

export type ValidateSerializablePromise<T, TSerializable> =
  T extends Promise<infer TAwaited> ? Promise<ValidateSerializable<TAwaited, TSerializable>> : never

export type ValidateReadableStream<T, TSerializable> =
  T extends ReadableStream<infer TStreamed>
    ? ReadableStream<ValidateSerializable<TStreamed, TSerializable>>
    : never

export type ValidateSerializableSet<T, TSerializable> =
  T extends Set<infer TItem> ? Set<ValidateSerializable<TItem, TSerializable>> : never

export type ValidateSerializableMap<T, TSerializable> =
  T extends Map<infer TKey, infer TValue>
    ? Map<ValidateSerializable<TKey, TSerializable>, ValidateSerializable<TValue, TSerializable>>
    : never

export type ValidateSerializableArray<T, TSerializable> = T extends readonly [any, ...Array<any>]
  ? ValidateSerializableMapped<T, TSerializable>
  : T extends Array<infer U>
    ? Array<ValidateSerializable<U, TSerializable>>
    : T extends ReadonlyArray<infer U>
      ? ReadonlyArray<ValidateSerializable<U, TSerializable>>
      : never

export type ValidateSerializableMapped<T, TSerializable> = {
  [K in keyof T]: ValidateSerializable<T[K], TSerializable>
}

const SERIALIZATION_ERROR = Symbol.for('TSR_SERIALIZATION_ERROR')

export interface SerializationError<in out TMessage extends string> {
  [SERIALIZATION_ERROR]: TMessage
}

export interface SerializationAdapter<
  TInput,
  TOutput,
  TExtendsAdapters extends ReadonlyArray<AnySerializationAdapter>,
> {
  '~types': SerializationAdapterTypes<TInput, TOutput, TExtendsAdapters>
  key: string
  extends?: TExtendsAdapters
  test: (value: unknown) => value is TInput
  toSerializable: (value: TInput) => TOutput
  fromSerializable: (value: TOutput) => TInput
}

export interface SerializationAdapterTypes<
  TInput,
  TOutput,
  TExtendsAdapters extends ReadonlyArray<AnySerializationAdapter>,
> {
  input: TInput | UnionizeSerializationAdaptersInput<TExtendsAdapters>
  output: TOutput
  extends: TExtendsAdapters
}

export type AnySerializationAdapter = SerializationAdapter<any, any, any>

export type ValidateSerializableInput<TRegister, T> = ValidateSerializable<
  T,
  RegisteredSerializableInput<TRegister>
>

export type RegisteredSerializableInput<TRegister> =
  | (unknown extends RegisteredSerializationAdapters<TRegister>
      ? never
      : RegisteredSerializationAdapters<TRegister> extends ReadonlyArray<AnySerializationAdapter>
        ? RegisteredSerializationAdapters<TRegister>[number]['~types']['input']
        : never)
  | Serializable

export type RegisteredSerializationAdapters<TRegister> = RegisteredConfigType<
  TRegister,
  'serializationAdapters'
>

export type RegisteredSSROption<TRegister> =
  unknown extends RegisteredConfigType<TRegister, 'defaultSsr'>
    ? SSROption
    : RegisteredConfigType<TRegister, 'defaultSsr'>

export type ValidateSerializableLifecycleResult<
  TRegister,
  TParentRoute extends AnyRoute,
  TSSR,
  TFn,
> =
  false extends RegisteredSsr<TRegister>
    ? any
    : ValidateSerializableLifecycleResultSSR<
          TRegister,
          TParentRoute,
          TSSR,
          TFn
        > extends infer TInput
      ? TInput
      : never

export type ValidateSerializableLifecycleResultSSR<
  TRegister,
  TParentRoute extends AnyRoute,
  TSSR,
  TFn,
> =
  ResolveAllSSR<TParentRoute, TSSR> extends false
    ? any
    : RegisteredSSROption<TRegister> extends false
      ? any
      : ValidateSerializableInput<TRegister, LooseReturnType<TFn>>

export type RegisteredReadableStream = unknown extends SerializerExtensions['ReadableStream']
  ? never
  : SerializerExtensions['ReadableStream']

export interface DefaultSerializerExtensions {
  ReadableStream: unknown
}

export interface SerializerExtensions extends DefaultSerializerExtensions {}

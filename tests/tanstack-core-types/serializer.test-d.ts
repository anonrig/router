import { describe, expectTypeOf, it } from 'vitest'

import type {
  Serializable,
  SerializationError,
  TsrSerializable,
  ValidateSerializable,
} from '@tanstack/router-core/ssr/serializer/transformer'

describe('Serializer', () => {
  it('fails for non-serializable types', () => {
    const value = () => {}
    expectTypeOf<ValidateSerializable<typeof value, Serializable>>().toEqualTypeOf<
      SerializationError<'Function may not be serializable'>
    >()
  })

  it('works for types extending TsrSerializable', () => {
    type MyCustomType = { f: () => {} } & TsrSerializable
    expectTypeOf<ValidateSerializable<MyCustomType, Serializable>>().toEqualTypeOf<MyCustomType>()
  })
})

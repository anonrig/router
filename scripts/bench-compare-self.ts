if (typeof globalThis.self === 'undefined') {
  ;(globalThis as typeof globalThis & { self: typeof globalThis }).self = globalThis
}

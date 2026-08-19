export {}

declare global {
  interface ImportMetaEnv {
    SSR: boolean
  }

  interface ImportMeta {
    readonly env: ImportMetaEnv
  }
}

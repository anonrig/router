/** Same query TanStack uses for virtual split modules. */
export const TSR_SPLIT_QUERY = 'tsr-split'

export function fileNameFromModuleId(id: string) {
  const withoutNull = id.startsWith('\0') ? id.slice(1) : id
  return withoutNull.split('?')[0] ?? withoutNull
}

export function splitTargetFromModuleId(id: string) {
  const queryIndex = id.indexOf('?')
  if (queryIndex === -1) return undefined
  const params = new URLSearchParams(id.slice(queryIndex + 1))
  return params.get(TSR_SPLIT_QUERY) ?? undefined
}

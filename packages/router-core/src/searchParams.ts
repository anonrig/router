import { decode, encode } from './qss'

const jsonStart = /^(?:\s|["[{\d-]|fa|nu|tr)/

export const defaultParseSearch = parseSearchWith(JSON.parse)
export const defaultStringifySearch = stringifySearchWith(
  JSON.stringify,
  JSON.parse,
)

export function parseSearchWith(parser: (str: string) => any) {
  return (searchStr: string): Record<string, any> => {
    if (searchStr.charCodeAt(0) === 63) searchStr = searchStr.substring(1)
    const query = decode(searchStr)
    for (const key in query) {
      const value = query[key]
      if (typeof value === 'string') {
        try {
          query[key] = parser(value)
        } catch {
          // keep the raw string
        }
      }
    }
    return query
  }
}

export function stringifySearchWith(
  stringify: (search: any) => string,
  parser?: (str: string) => any,
) {
  const isJsonParser = parser === JSON.parse
  function stringifyValue(val: any) {
    if (val && typeof val === 'object') {
      try {
        return stringify(val)
      } catch {
        // silent
      }
    } else if (parser && typeof val === 'string') {
      if (isJsonParser && !jsonStart.test(val)) return val
      try {
        parser(val)
        return stringify(val)
      } catch {
        // silent
      }
    }
    return val
  }

  return (search: Record<string, any>) => {
    const searchStr = encode(search, stringifyValue)
    return searchStr ? `?${searchStr}` : ''
  }
}

export type SearchSerializer = (searchObj: Record<string, any>) => string
export type SearchParser = (searchStr: string) => Record<string, any>

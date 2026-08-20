export const SEGMENT_TYPE_PATHNAME = 0
export const SEGMENT_TYPE_PARAM = 1
export const SEGMENT_TYPE_WILDCARD = 2
export const SEGMENT_TYPE_OPTIONAL_PARAM = 3

export type SegmentKind =
  | typeof SEGMENT_TYPE_PATHNAME
  | typeof SEGMENT_TYPE_PARAM
  | typeof SEGMENT_TYPE_WILDCARD
  | typeof SEGMENT_TYPE_OPTIONAL_PARAM

export type ParsedSegment = Uint16Array & {
  0: SegmentKind
  1: number
  2: number
  3: number
  4: number
  5: number
}

function write(
  output: Uint16Array,
  kind: SegmentKind,
  start: number,
  nameStart: number,
  nameEnd: number,
  close: number,
  end: number,
): ParsedSegment {
  output[0] = kind
  output[1] = start
  output[2] = nameStart
  output[3] = nameEnd
  output[4] = close
  output[5] = end
  return output as ParsedSegment
}

export function parseSegment(
  path: string,
  start: number,
  output: Uint16Array = new Uint16Array(6),
): ParsedSegment {
  const next = path.indexOf('/', start)
  const end = next === -1 ? path.length : next
  const part = path.substring(start, end)

  if (!part || part.indexOf('$') === -1) {
    return write(output, SEGMENT_TYPE_PATHNAME, start, start, end, end, end)
  }

  if (part === '$') {
    const total = path.length
    return write(output, SEGMENT_TYPE_WILDCARD, start, start, total, total, total)
  }

  if (part.charCodeAt(0) === 36) {
    return write(output, SEGMENT_TYPE_PARAM, start, start + 1, end, end, end)
  }

  const openBrace = part.indexOf('{')
  let closeBrace = -1
  if (
    openBrace !== -1 &&
    openBrace + 1 < part.length &&
    (closeBrace = part.indexOf('}', openBrace)) !== -1
  ) {
    const firstChar = part.charCodeAt(openBrace + 1)
    if (firstChar === 45) {
      if (openBrace + 2 < part.length && part.charCodeAt(openBrace + 2) === 36) {
        const paramStart = openBrace + 3
        const paramEnd = closeBrace
        if (paramStart < paramEnd) {
          return write(
            output,
            SEGMENT_TYPE_OPTIONAL_PARAM,
            start + openBrace,
            start + paramStart,
            start + paramEnd,
            start + closeBrace + 1,
            end,
          )
        }
      }
    } else if (firstChar === 36) {
      const dollarPos = openBrace + 1
      const afterDollar = openBrace + 2
      if (afterDollar === closeBrace) {
        return write(
          output,
          SEGMENT_TYPE_WILDCARD,
          start + openBrace,
          start + dollarPos,
          start + afterDollar,
          start + closeBrace + 1,
          path.length,
        )
      }
      return write(
        output,
        SEGMENT_TYPE_PARAM,
        start + openBrace,
        start + afterDollar,
        start + closeBrace,
        start + closeBrace + 1,
        end,
      )
    }
  }

  return write(output, SEGMENT_TYPE_PATHNAME, start, start, end, end, end)
}

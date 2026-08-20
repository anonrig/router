export {
  SEGMENT_TYPE_PATHNAME,
  SEGMENT_TYPE_PARAM,
  SEGMENT_TYPE_WILDCARD,
  SEGMENT_TYPE_OPTIONAL_PARAM,
  parseSegment,
  processRouteTree,
  findRouteMatch,
  findSingleMatch,
  findFlatMatch,
  buildRouteBranch,
  processRouteMasks,
} from './match-compat'

export type {
  SegmentKind,
  ProcessedTree,
  RouteMatchResult,
  AnyRouteLike,
  SegmentNode,
} from './match-compat'

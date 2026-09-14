import type { CanvasEdge, CanvasEdgeAnchor, CanvasEdgeStyle, CanvasNode, CanvasViewport, JsonCanvasDocument, JsonCanvasSide } from './types'

export interface Point {
  x: number
  y: number
}

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

export function clientToCanvas(client: Point, bounds: DOMRect, viewport: CanvasViewport): Point {
  return {
    x: (client.x - bounds.left - viewport.x) / viewport.zoom,
    y: (client.y - bounds.top - viewport.y) / viewport.zoom,
  }
}

export function nodeCenter(node: CanvasNode): Point {
  return { x: node.x + node.width / 2, y: node.y + node.height / 2 }
}

export function sideForPoint(node: CanvasNode, point: Point): JsonCanvasSide {
  return edgeAnchorForPoint(node, point).side
}

export function sideFacingPoint(node: CanvasNode, point: Point): JsonCanvasSide {
  const center = nodeCenter(node)
  const dx = point.x - center.x
  const dy = point.y - center.y
  if (Math.abs(dx) > Math.abs(dy)) return dx >= 0 ? 'right' : 'left'
  return dy >= 0 ? 'bottom' : 'top'
}

function snapMidpoint(position: number, sideLength: number, snapThreshold: number): number {
  const distanceToMiddle = Math.abs(position - 0.5) * sideLength
  return distanceToMiddle <= snapThreshold ? 0.5 : position
}

function rectangularEdgeAnchorForPoint(node: CanvasNode, point: Point, snapThreshold: number): CanvasEdgeAnchor {
  const distances: Array<{ side: JsonCanvasSide; distance: number }> = [
    { side: 'top', distance: Math.abs(point.y - node.y) },
    { side: 'right', distance: Math.abs(point.x - (node.x + node.width)) },
    { side: 'bottom', distance: Math.abs(point.y - (node.y + node.height)) },
    { side: 'left', distance: Math.abs(point.x - node.x) },
  ]
  distances.sort((a, b) => a.distance - b.distance)
  const side = distances[0]?.side ?? 'right'
  if (side === 'top' || side === 'bottom') {
    const raw = clamp((point.x - node.x) / node.width, 0, 1)
    return { side, position: snapMidpoint(raw, node.width, snapThreshold) }
  }
  const raw = clamp((point.y - node.y) / node.height, 0, 1)
  return { side, position: snapMidpoint(raw, node.height, snapThreshold) }
}

function pointOnSegment(start: Point, end: Point, position: number): Point {
  return {
    x: start.x + (end.x - start.x) * position,
    y: start.y + (end.y - start.y) * position,
  }
}

function closestPointOnSegment(point: Point, start: Point, end: Point): { point: Point; position: number; distance: number } {
  const dx = end.x - start.x
  const dy = end.y - start.y
  const lengthSquared = dx * dx + dy * dy
  const position = lengthSquared === 0 ? 0 : clamp(((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared, 0, 1)
  const closest = pointOnSegment(start, end, position)
  return {
    point: closest,
    position,
    distance: Math.hypot(point.x - closest.x, point.y - closest.y),
  }
}

function polygonVertices(node: CanvasNode): Record<'top' | 'right' | 'bottom' | 'left', Point> | null {
  if (node.shape !== 'diamond') return null
  return {
    top: { x: node.x + node.width / 2, y: node.y },
    right: { x: node.x + node.width, y: node.y + node.height / 2 },
    bottom: { x: node.x + node.width / 2, y: node.y + node.height },
    left: { x: node.x, y: node.y + node.height / 2 },
  }
}

function polygonEdgeAnchorForPoint(node: CanvasNode, point: Point, snapThreshold: number): CanvasEdgeAnchor | null {
  const vertices = polygonVertices(node)
  if (!vertices) return null
  const segments: Array<{ side: JsonCanvasSide; start: Point; end: Point }> = [
    { side: 'top', start: vertices.top, end: vertices.right },
    { side: 'right', start: vertices.right, end: vertices.bottom },
    { side: 'bottom', start: vertices.bottom, end: vertices.left },
    { side: 'left', start: vertices.left, end: vertices.top },
  ]
  const closest = segments
    .map((segment) => ({ ...segment, ...closestPointOnSegment(point, segment.start, segment.end) }))
    .sort((a, b) => a.distance - b.distance)[0]
  if (!closest) return null
  const sideLength = Math.hypot(closest.end.x - closest.start.x, closest.end.y - closest.start.y)
  return { side: closest.side, position: snapMidpoint(closest.position, sideLength, snapThreshold) }
}

export function edgeAnchorForPoint(node: CanvasNode, point: Point, snapThreshold = 14): CanvasEdgeAnchor {
  return polygonEdgeAnchorForPoint(node, point, snapThreshold) ?? rectangularEdgeAnchorForPoint(node, point, snapThreshold)
}

export function anchorForSide(node: CanvasNode, side?: JsonCanvasSide): Point {
  if (side === 'top') return { x: node.x + node.width / 2, y: node.y }
  if (side === 'right') return { x: node.x + node.width, y: node.y + node.height / 2 }
  if (side === 'bottom') return { x: node.x + node.width / 2, y: node.y + node.height }
  if (side === 'left') return { x: node.x, y: node.y + node.height / 2 }
  return nodeCenter(node)
}

export function defaultEdgeAnchorForSide(node: CanvasNode, side: JsonCanvasSide): CanvasEdgeAnchor {
  return { side, position: node.shape === 'diamond' ? 0 : 0.5 }
}

export function autoSidePair(fromNode: CanvasNode, toNode: CanvasNode): { fromSide: JsonCanvasSide; toSide: JsonCanvasSide } {
  const from = nodeCenter(fromNode)
  const to = nodeCenter(toNode)
  const dx = to.x - from.x
  const dy = to.y - from.y
  if (Math.abs(dx) > Math.abs(dy)) {
    return dx >= 0 ? { fromSide: 'right', toSide: 'left' } : { fromSide: 'left', toSide: 'right' }
  }
  return dy >= 0 ? { fromSide: 'bottom', toSide: 'top' } : { fromSide: 'top', toSide: 'bottom' }
}

export interface DefaultEdgeConnection {
  fromSide: JsonCanvasSide
  toSide: JsonCanvasSide
  fromAnchor: CanvasEdgeAnchor
  toAnchor: CanvasEdgeAnchor
  style?: CanvasEdgeStyle
}

export function defaultEdgeConnection(fromNode: CanvasNode, toNode: CanvasNode): DefaultEdgeConnection {
  const from = nodeCenter(fromNode)
  const to = nodeCenter(toNode)
  const dx = to.x - from.x
  const dy = to.y - from.y
  let fromSide: JsonCanvasSide
  let toSide: JsonCanvasSide
  let style: CanvasEdgeStyle | undefined

  if (dx < 0 && Math.abs(dx) >= Math.abs(dy)) {
    // Treat a leftward connection as a back edge only when its movement is
    // primarily horizontal. A target that remains clearly above or below the
    // source should keep using the facing vertical sides as it moves laterally.
    fromSide = 'bottom'
    toSide = 'bottom'
    style = { routing: 'elbow' }
  } else if (fromNode.shape === 'diamond' && Math.abs(dy) > 40) {
    fromSide = dy >= 0 ? 'bottom' : 'top'
    toSide = dy >= 0 ? 'top' : 'bottom'
  } else if (Math.abs(dx) >= Math.abs(dy)) {
    fromSide = 'right'
    toSide = 'left'
  } else {
    fromSide = dy >= 0 ? 'bottom' : 'top'
    toSide = dy >= 0 ? 'top' : 'bottom'
  }

  return {
    fromSide,
    toSide,
    fromAnchor: defaultEdgeAnchorForSide(fromNode, fromSide),
    toAnchor: defaultEdgeAnchorForSide(toNode, toSide),
    ...(style ? { style } : {}),
  }
}

function controlOffset(side: JsonCanvasSide | undefined, magnitude: number): Point {
  if (side === 'top') return { x: 0, y: -magnitude }
  if (side === 'right') return { x: magnitude, y: 0 }
  if (side === 'bottom') return { x: 0, y: magnitude }
  if (side === 'left') return { x: -magnitude, y: 0 }
  return { x: magnitude, y: 0 }
}

export function anchorForEdgeAnchor(node: CanvasNode, anchor?: CanvasEdgeAnchor): Point {
  if (!anchor) return anchorForSide(node)
  const position = clamp(anchor.position ?? 0.5, 0, 1)
  const vertices = polygonVertices(node)
  if (vertices) {
    if (anchor.side === 'top') return pointOnSegment(vertices.top, vertices.right, position)
    if (anchor.side === 'right') return pointOnSegment(vertices.right, vertices.bottom, position)
    if (anchor.side === 'bottom') return pointOnSegment(vertices.bottom, vertices.left, position)
    if (anchor.side === 'left') return pointOnSegment(vertices.left, vertices.top, position)
  }
  if (anchor.side === 'top') return { x: node.x + node.width * position, y: node.y }
  if (anchor.side === 'right') return { x: node.x + node.width, y: node.y + node.height * position }
  if (anchor.side === 'bottom') return { x: node.x + node.width * position, y: node.y + node.height }
  return { x: node.x, y: node.y + node.height * position }
}

export function edgePath(edge: CanvasEdge, fromNode: CanvasNode, toNode: CanvasNode): string {
  const sidePair = autoSidePair(fromNode, toNode)
  const fromSide = edge.fromAnchor?.side ?? edge.fromSide ?? sidePair.fromSide
  const toSide = edge.toAnchor?.side ?? edge.toSide ?? sidePair.toSide
  const start = edge.fromAnchor ? anchorForEdgeAnchor(fromNode, edge.fromAnchor) : anchorForSide(fromNode, fromSide)
  const end = edge.toAnchor ? anchorForEdgeAnchor(toNode, edge.toAnchor) : anchorForSide(toNode, toSide)
  const routing = edge.style?.routing ?? 'elbow'
  if (edge.waypoints?.length) {
    return roundedPolylinePath(edgeRoutePoints(edge, fromNode, toNode))
  }

  if (routing === 'straight') return `M ${start.x} ${start.y} L ${end.x} ${end.y}`

  if (routing === 'elbow') return roundedPolylinePath(elbowRoutePoints(start, end, fromSide, toSide))

  const distance = Math.hypot(end.x - start.x, end.y - start.y)
  const magnitude = clamp(distance * 0.35, 48, 180)
  const fromOffset = controlOffset(fromSide, magnitude)
  const toOffset = controlOffset(toSide, magnitude)
  const c1 = { x: start.x + fromOffset.x, y: start.y + fromOffset.y }
  const c2 = { x: end.x + toOffset.x, y: end.y + toOffset.y }
  return `M ${start.x} ${start.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${end.x} ${end.y}`
}

function pointOnCubic(start: Point, c1: Point, c2: Point, end: Point, t: number): Point {
  const mt = 1 - t
  return {
    x: mt ** 3 * start.x + 3 * mt ** 2 * t * c1.x + 3 * mt * t ** 2 * c2.x + t ** 3 * end.x,
    y: mt ** 3 * start.y + 3 * mt ** 2 * t * c1.y + 3 * mt * t ** 2 * c2.y + t ** 3 * end.y,
  }
}

function pointAtHalfPolylineLength(points: Point[]): Point {
  return pointAtPolylineRatio(points, 0.5)
}

export function pointAtPolylineRatio(points: Point[], ratio: number): Point {
  if (points.length === 0) return { x: 0, y: 0 }
  if (points.length === 1) return points[0] ?? { x: 0, y: 0 }

  const segments = points.slice(1).map((point, index) => {
    const previous = points[index] ?? point
    return {
      start: previous,
      end: point,
      length: Math.hypot(point.x - previous.x, point.y - previous.y),
    }
  })
  const totalLength = segments.reduce((sum, segment) => sum + segment.length, 0)
  let remaining = totalLength * clamp(ratio, 0, 1)

  for (const segment of segments) {
    if (remaining <= segment.length) {
      const t = segment.length === 0 ? 0 : remaining / segment.length
      return pointOnSegment(segment.start, segment.end, t)
    }
    remaining -= segment.length
  }

  return points[points.length - 1] ?? { x: 0, y: 0 }
}

function pointIsOutsideAnchor(point: Point, anchor: Point, side: JsonCanvasSide, epsilon = 0.5): boolean {
  if (side === 'top') return point.y <= anchor.y + epsilon
  if (side === 'right') return point.x >= anchor.x - epsilon
  if (side === 'bottom') return point.y >= anchor.y - epsilon
  return point.x <= anchor.x + epsilon
}

function elbowRoutePoints(start: Point, end: Point, fromSide: JsonCanvasSide, toSide: JsonCanvasSide): Point[] {
  const outset = 32

  if (fromSide === toSide) {
    if (fromSide === 'bottom') {
      const y = Math.max(start.y, end.y) + outset
      return normalizeOrthogonalRoute([start, { x: start.x, y }, { x: end.x, y }, end])
    }
    if (fromSide === 'top') {
      const y = Math.min(start.y, end.y) - outset
      return normalizeOrthogonalRoute([start, { x: start.x, y }, { x: end.x, y }, end])
    }
    if (fromSide === 'right') {
      const x = Math.max(start.x, end.x) + outset
      return normalizeOrthogonalRoute([start, { x, y: start.y }, { x, y: end.y }, end])
    }
    const x = Math.min(start.x, end.x) - outset
    return normalizeOrthogonalRoute([start, { x, y: start.y }, { x, y: end.y }, end])
  }

  const fromIsHorizontal = fromSide === 'left' || fromSide === 'right'
  const toIsHorizontal = toSide === 'left' || toSide === 'right'

  // Perpendicular endpoints often need only one corner. Avoid adding fixed
  // stubs and a midpoint when that corner already leaves and enters each node
  // on the correct side.
  if (fromIsHorizontal !== toIsHorizontal) {
    const corner = fromIsHorizontal ? { x: end.x, y: start.y } : { x: start.x, y: end.y }
    if (pointIsOutsideAnchor(corner, start, fromSide) && pointIsOutsideAnchor(corner, end, toSide)) {
      return normalizeOrthogonalRoute([start, corner, end])
    }
  }

  // Opposing, face-to-face endpoints need a single shared channel rather than
  // a stub on each end plus another pair of midpoint turns.
  if (fromIsHorizontal === toIsHorizontal) {
    const midpoint = fromIsHorizontal
      ? { first: { x: (start.x + end.x) / 2, y: start.y }, second: { x: (start.x + end.x) / 2, y: end.y } }
      : { first: { x: start.x, y: (start.y + end.y) / 2 }, second: { x: end.x, y: (start.y + end.y) / 2 } }
    if (pointIsOutsideAnchor(midpoint.first, start, fromSide) && pointIsOutsideAnchor(midpoint.second, end, toSide)) {
      return normalizeOrthogonalRoute([start, midpoint.first, midpoint.second, end])
    }
  }

  const startOut = controlOffset(fromSide, outset)
  const endOut = controlOffset(toSide, outset)
  const startStub = { x: start.x + startOut.x, y: start.y + startOut.y }
  const endStub = { x: end.x + endOut.x, y: end.y + endOut.y }

  if (fromSide === 'left' || fromSide === 'right') {
    const midX = (startStub.x + endStub.x) / 2
    return normalizeOrthogonalRoute([start, startStub, { x: midX, y: startStub.y }, { x: midX, y: endStub.y }, endStub, end])
  }
  const midY = (startStub.y + endStub.y) / 2
  return normalizeOrthogonalRoute([start, startStub, { x: startStub.x, y: midY }, { x: endStub.x, y: midY }, endStub, end])
}

function pointToward(from: Point, to: Point, distance: number): Point {
  const length = Math.hypot(to.x - from.x, to.y - from.y)
  if (length <= 0) return { ...from }
  const ratio = distance / length
  return {
    x: from.x + (to.x - from.x) * ratio,
    y: from.y + (to.y - from.y) * ratio,
  }
}

export function roundedPolylinePath(points: Point[], radius = 12): string {
  const route = normalizeOrthogonalRoute(points)
  if (route.length === 0) return ''
  if (route.length === 1) return `M ${route[0]!.x} ${route[0]!.y}`

  const commands = [`M ${route[0]!.x} ${route[0]!.y}`]
  for (let index = 1; index < route.length - 1; index += 1) {
    const previous = route[index - 1]!
    const current = route[index]!
    const next = route[index + 1]!
    const previousLength = Math.hypot(current.x - previous.x, current.y - previous.y)
    const nextLength = Math.hypot(next.x - current.x, next.y - current.y)
    const turnRadius = Math.min(radius, previousLength / 2, nextLength / 2)
    if (turnRadius <= 0.5 || collinear(previous, current, next, 0.5)) {
      commands.push(`L ${current.x} ${current.y}`)
      continue
    }
    const entry = pointToward(current, previous, turnRadius)
    const exit = pointToward(current, next, turnRadius)
    commands.push(`L ${entry.x} ${entry.y}`, `Q ${current.x} ${current.y} ${exit.x} ${exit.y}`)
  }
  const last = route.at(-1)!
  commands.push(`L ${last.x} ${last.y}`)
  return commands.join(' ')
}

function orthogonalCorner(a: Point, b: Point, preferHorizontalFirst: boolean): Point {
  return preferHorizontalFirst ? { x: b.x, y: a.y } : { x: a.x, y: b.y }
}

function cornerCreatesBacktrack(previous: Point | undefined, current: Point, corner: Point, epsilon: number): boolean {
  return Boolean(previous && (samePoint(previous, corner, epsilon) || collinear(previous, current, corner, epsilon)))
}

function orthogonalizeRoute(points: Point[], fromSide: JsonCanvasSide, toSide: JsonCanvasSide, epsilon = 0.5): Point[] {
  const route: Point[] = []
  for (let index = 0; index < points.length - 1; index += 1) {
    const current = points[index]
    const next = points[index + 1]
    if (!current || !next) continue
    if (route.length === 0) route.push({ ...current })
    if (Math.abs(current.x - next.x) > epsilon && Math.abs(current.y - next.y) > epsilon) {
      const firstSegment = index === 0
      const lastSegment = index === points.length - 2
      const preferHorizontalFirst = firstSegment
        ? fromSide === 'left' || fromSide === 'right'
        : lastSegment
          ? !(toSide === 'left' || toSide === 'right')
          : true
      const preferred = orthogonalCorner(current, next, preferHorizontalFirst)
      const alternate = orthogonalCorner(current, next, !preferHorizontalFirst)
      const previous = route.at(-2)
      route.push(cornerCreatesBacktrack(previous, current, preferred, epsilon) && !cornerCreatesBacktrack(previous, current, alternate, epsilon) ? alternate : preferred)
    }
    route.push({ ...next })
  }
  return normalizeOrthogonalRoute(route, epsilon)
}

function pointIsTangentialToSide(anchor: Point, point: Point, side: JsonCanvasSide, epsilon = 0.5): boolean {
  if (side === 'left' || side === 'right') return Math.abs(anchor.y - point.y) <= epsilon
  return Math.abs(anchor.x - point.x) <= epsilon
}

export function edgeRoutePoints(edge: CanvasEdge, fromNode: CanvasNode, toNode: CanvasNode): Point[] {
  const sidePair = autoSidePair(fromNode, toNode)
  const fromSide = edge.fromAnchor?.side ?? edge.fromSide ?? sidePair.fromSide
  const toSide = edge.toAnchor?.side ?? edge.toSide ?? sidePair.toSide
  const start = edge.fromAnchor ? anchorForEdgeAnchor(fromNode, edge.fromAnchor) : anchorForSide(fromNode, fromSide)
  const end = edge.toAnchor ? anchorForEdgeAnchor(toNode, edge.toAnchor) : anchorForSide(toNode, toSide)
  if (edge.waypoints?.length) {
    const outset = 32
    const startOut = controlOffset(fromSide, outset)
    const endOut = controlOffset(toSide, outset)
    const startStub = { x: start.x + startOut.x, y: start.y + startOut.y }
    const endStub = { x: end.x + endOut.x, y: end.y + endOut.y }
    const firstWaypoint = edge.waypoints[0]
    const lastWaypoint = edge.waypoints.at(-1)
    return orthogonalizeRoute([
      start,
      ...(firstWaypoint && pointIsTangentialToSide(start, firstWaypoint, fromSide) ? [] : [startStub]),
      ...edge.waypoints,
      ...(lastWaypoint && pointIsTangentialToSide(end, lastWaypoint, toSide) ? [] : [endStub]),
      end,
    ], fromSide, toSide)
  }
  if ((edge.style?.routing ?? 'elbow') === 'elbow') return elbowRoutePoints(start, end, fromSide, toSide)
  return [start, end]
}

export function edgeWaypointHandlePoint(edge: CanvasEdge, fromNode: CanvasNode, toNode: CanvasNode): Point {
  return pointAtPolylineRatio(edgeRoutePoints(edge, fromNode, toNode), 0.5)
}

function samePoint(a: Point, b: Point, epsilon: number): boolean {
  return Math.abs(a.x - b.x) <= epsilon && Math.abs(a.y - b.y) <= epsilon
}

function collinear(a: Point, b: Point, c: Point, epsilon: number): boolean {
  return (Math.abs(a.x - b.x) <= epsilon && Math.abs(b.x - c.x) <= epsilon)
    || (Math.abs(a.y - b.y) <= epsilon && Math.abs(b.y - c.y) <= epsilon)
}

export function normalizeOrthogonalRoute(points: Point[], epsilon = 0.5): Point[] {
  const deduped = points.reduce<Point[]>((next, point) => {
    const previous = next.at(-1)
    if (!previous || !samePoint(previous, point, epsilon)) next.push({ ...point })
    return next
  }, [])

  let changed = true
  while (changed) {
    changed = false
    for (let index = 1; index < deduped.length - 1; index += 1) {
      const previous = deduped[index - 1]
      const current = deduped[index]
      const next = deduped[index + 1]
      if (previous && current && next && collinear(previous, current, next, epsilon)) {
        deduped.splice(index, 1)
        changed = true
        break
      }
    }
  }

  return deduped
}

export function moveOrthogonalRouteSegment(points: Point[], segmentIndex: number, delta: Point): Point[] {
  const a = points[segmentIndex]
  const b = points[segmentIndex + 1]
  if (!a || !b) return normalizeOrthogonalRoute(points)

  const horizontal = Math.abs(b.x - a.x) >= Math.abs(b.y - a.y)
  const sameRun = (p1: Point, p2: Point): boolean => horizontal ? Math.abs(p1.y - p2.y) <= 0.5 : Math.abs(p1.x - p2.x) <= 0.5
  let runStart = segmentIndex
  let runEnd = segmentIndex + 1

  while (runStart > 0) {
    const previous = points[runStart - 1]
    const current = points[runStart]
    if (!previous || !current || !sameRun(previous, current)) break
    runStart -= 1
  }
  while (runEnd < points.length - 1) {
    const current = points[runEnd]
    const next = points[runEnd + 1]
    if (!current || !next || !sameRun(current, next)) break
    runEnd += 1
  }

  const lastIndex = points.length - 1
  const result: Point[] = points.slice(0, runStart).map((point) => ({ ...point }))

  if (horizontal) {
    const y = a.y + delta.y
    if (runStart === 0) result.push({ ...points[0]! }, { x: points[0]!.x, y })
    else result.push({ x: points[runStart]!.x, y })

    for (let index = runStart + 1; index < runEnd; index += 1) {
      result.push({ x: points[index]!.x, y })
    }

    if (runEnd === lastIndex) result.push({ x: points[lastIndex]!.x, y }, { ...points[lastIndex]! })
    else result.push({ x: points[runEnd]!.x, y })
  } else {
    const x = a.x + delta.x
    if (runStart === 0) result.push({ ...points[0]! }, { x, y: points[0]!.y })
    else result.push({ x, y: points[runStart]!.y })

    for (let index = runStart + 1; index < runEnd; index += 1) {
      result.push({ x, y: points[index]!.y })
    }

    if (runEnd === lastIndex) result.push({ x, y: points[lastIndex]!.y }, { ...points[lastIndex]! })
    else result.push({ x, y: points[runEnd]!.y })
  }

  if (runEnd < lastIndex) {
    result.push(...points.slice(runEnd + 1).map((point) => ({ ...point })))
  }

  return normalizeOrthogonalRoute(result)
}

export function edgeLabelPoint(edge: CanvasEdge, fromNode: CanvasNode, toNode: CanvasNode): Point {
  const sidePair = autoSidePair(fromNode, toNode)
  const fromSide = edge.fromAnchor?.side ?? edge.fromSide ?? sidePair.fromSide
  const toSide = edge.toAnchor?.side ?? edge.toSide ?? sidePair.toSide
  const start = edge.fromAnchor ? anchorForEdgeAnchor(fromNode, edge.fromAnchor) : anchorForSide(fromNode, fromSide)
  const end = edge.toAnchor ? anchorForEdgeAnchor(toNode, edge.toAnchor) : anchorForSide(toNode, toSide)
  const routing = edge.style?.routing ?? 'elbow'
  if (edge.waypoints?.length) return pointAtHalfPolylineLength(edgeRoutePoints(edge, fromNode, toNode))

  if (routing === 'straight') return { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 }

  if (routing === 'elbow') return pointAtHalfPolylineLength(elbowRoutePoints(start, end, fromSide, toSide))

  const distance = Math.hypot(end.x - start.x, end.y - start.y)
  const magnitude = clamp(distance * 0.35, 48, 180)
  const fromOffset = controlOffset(fromSide, magnitude)
  const toOffset = controlOffset(toSide, magnitude)
  const c1 = { x: start.x + fromOffset.x, y: start.y + fromOffset.y }
  const c2 = { x: end.x + toOffset.x, y: end.y + toOffset.y }
  return pointOnCubic(start, c1, c2, end, 0.5)
}

export function canvasBounds(nodes: readonly CanvasNode[], padding = 120): Rect {
  if (nodes.length === 0) return { x: -padding, y: -padding, width: padding * 2, height: padding * 2 }
  const minX = Math.min(...nodes.map((node) => node.x)) - padding
  const minY = Math.min(...nodes.map((node) => node.y)) - padding
  const maxX = Math.max(...nodes.map((node) => node.x + node.width)) + padding
  const maxY = Math.max(...nodes.map((node) => node.y + node.height)) + padding
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}

export function centerViewportForDocument(
  document: Pick<JsonCanvasDocument, 'nodes'>,
  size: { width: number; height: number },
  options: { zoom?: number; padding?: number } = {},
): CanvasViewport {
  const zoom = options.zoom ?? 1
  if (document.nodes.length === 0) return { x: 0, y: 0, zoom }
  const bounds = canvasBounds(document.nodes, options.padding ?? 0)
  return {
    zoom,
    x: size.width / 2 - (bounds.x + bounds.width / 2) * zoom,
    y: size.height / 2 - (bounds.y + bounds.height / 2) * zoom,
  }
}

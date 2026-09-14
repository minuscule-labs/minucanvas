import {
  anchorForEdgeAnchor,
  canvasBounds,
  defaultEdgeAnchorForSide,
  edgeLabelPoint,
  edgePath,
  edgeRoutePoints,
  nodeCenter,
  pointAtPolylineRatio,
  roundedPolylinePath,
  sideForPoint,
} from '../geometry'
import type { Point } from '../geometry'
import type { CanvasEdge, CanvasNode, JsonCanvasDocument } from '../types'
import type { CanvasDiagnostic, ResolvedCanvasScene } from './types'

/**
 * Deterministic document identity for derived-scene handoff. It includes all
 * authored document content, so equal node/edge counts cannot admit stale paths.
 */
export function canvasDocumentFingerprint(document: JsonCanvasDocument): string {
  return stableSerialize(document)
}

export function isResolvedCanvasSceneCurrent<NodeExtra extends Record<string, unknown>, EdgeExtra extends Record<string, unknown>>(
  scene: ResolvedCanvasScene<NodeExtra, EdgeExtra> | undefined,
  document: JsonCanvasDocument<NodeExtra, EdgeExtra>,
): scene is ResolvedCanvasScene<NodeExtra, EdgeExtra> {
  return Boolean(scene
    && scene.documentFingerprint === canvasDocumentFingerprint(document)
    && hasSafeResolvedGeometry(scene, document))
}

/** Retains resolved geometry for an export subset without reconstructing routes. */
export function filterResolvedCanvasScene<NodeExtra extends Record<string, unknown>, EdgeExtra extends Record<string, unknown>>(
  scene: ResolvedCanvasScene<NodeExtra, EdgeExtra>,
  document: JsonCanvasDocument<NodeExtra, EdgeExtra>,
): ResolvedCanvasScene<NodeExtra, EdgeExtra> {
  const nodeIds = new Set(document.nodes.map((node) => node.id))
  const edgeIds = new Set(document.edges.map((edge) => edge.id))
  return {
    ...scene,
    document,
    documentFingerprint: canvasDocumentFingerprint(document),
    nodes: scene.nodes.filter((node) => nodeIds.has(node.id)),
    edges: scene.edges.filter((edge) => edgeIds.has(edge.id)),
    bounds: canvasBounds(document.nodes),
  }
}

/** Creates render-neutral geometry without persisting generated routes as waypoints. */
export function resolveCanvasScene<NodeExtra extends Record<string, unknown> = Record<string, unknown>, EdgeExtra extends Record<string, unknown> = Record<string, unknown>>(
  document: JsonCanvasDocument<NodeExtra, EdgeExtra>,
  options: { generatedEdgePoints?: ReadonlyMap<string, Point[]>; diagnostics?: CanvasDiagnostic[] } = {},
): ResolvedCanvasScene<NodeExtra, EdgeExtra> {
  const nodesById = new Map(document.nodes.map((node) => [node.id, node]))
  return {
    document,
    documentFingerprint: canvasDocumentFingerprint(document),
    nodes: document.nodes.map((node) => ({
      id: node.id,
      node,
      bounds: { x: node.x, y: node.y, width: node.width, height: node.height },
    })),
    edges: document.edges.flatMap((edge) => resolveEdge(edge, nodesById, options.generatedEdgePoints)),
    bounds: canvasBounds(document.nodes),
    diagnostics: options.diagnostics ?? [],
  }
}

function resolveEdge<EdgeExtra extends Record<string, unknown>>(
  edge: CanvasEdge<EdgeExtra>,
  nodesById: Map<string, CanvasNode>,
  generatedEdgePoints: ReadonlyMap<string, Point[]> | undefined,
) {
  const from = nodesById.get(edge.fromNode)
  const to = nodesById.get(edge.toNode)
  const endpoints = edgeEndpoints(edge, from, to)
  if (!endpoints) return []

  const connected = !edge.fromPoint && !edge.toPoint && from && to
  const fallbackPoints = connected ? edgeRoutePoints(edge, from, to) : [endpoints.from, endpoints.to]
  const hasManualRoute = edge.routingMode === 'manual' || Boolean(edge.waypoints?.length)
  const generated = hasManualRoute ? undefined : generatedEdgePoints?.get(edge.id)
  const points = generated?.length
    ? [fallbackPoints[0]!, ...generated.slice(1, -1).map((point) => ({ ...point })), fallbackPoints.at(-1)!]
    : fallbackPoints
  const path = generated?.length
    ? roundedPolylinePath(points)
    : connected
      ? edgePath(edge, from, to)
      : `M ${endpoints.from.x} ${endpoints.from.y} L ${endpoints.to.x} ${endpoints.to.y}`
  const labelPoint = generated?.length
    ? pointAtPolylineRatio(points, 0.5)
    : connected
      ? edgeLabelPoint(edge, from, to)
      : { x: (endpoints.from.x + endpoints.to.x) / 2, y: (endpoints.from.y + endpoints.to.y) / 2 }

  return [{ id: edge.id, edge, points, path, labelPoint }]
}

function edgeEndpoints(edge: CanvasEdge, fromNode: CanvasNode | undefined, toNode: CanvasNode | undefined): { from: Point; to: Point } | null {
  const fromReference = edge.toPoint ?? (toNode ? nodeCenter(toNode) : null)
  const from = edgeEndpoint(edge, 'from', fromNode, fromReference)
  const toReference = from ?? edge.fromPoint ?? (fromNode ? nodeCenter(fromNode) : null)
  const to = edgeEndpoint(edge, 'to', toNode, toReference)
  return from && to ? { from, to } : null
}

function edgeEndpoint(edge: CanvasEdge, endpoint: 'from' | 'to', node: CanvasNode | undefined, otherPoint: Point | null): Point | null {
  const freePoint = endpoint === 'from' ? edge.fromPoint : edge.toPoint
  if (freePoint) return { ...freePoint }
  if (!node) return null
  const anchor = endpoint === 'from' ? edge.fromAnchor : edge.toAnchor
  const side = anchor?.side ?? (endpoint === 'from' ? edge.fromSide : edge.toSide) ?? (otherPoint ? sideForPoint(node, otherPoint) : 'right')
  return anchorForEdgeAnchor(node, anchor ?? defaultEdgeAnchorForSide(node, side))
}

function hasSafeResolvedGeometry(scene: ResolvedCanvasScene, document: JsonCanvasDocument): boolean {
  const nodesById = new Map(document.nodes.map((node) => [node.id, node]))
  const expectedIds = document.edges
    .filter((edge) => edgeEndpoints(edge, nodesById.get(edge.fromNode), nodesById.get(edge.toNode)) !== null)
    .map((edge) => edge.id)
  const expected = new Set(expectedIds)
  const actual = new Set(scene.edges.map((edge) => edge.id))
  // A supplied scene must be a complete one-to-one projection of renderable
  // authored edges. Array order is irrelevant; missing, foreign, or duplicate
  // IDs cause the editor to resolve fresh geometry instead.
  if (expected.size !== expectedIds.length || scene.edges.length !== expected.size || actual.size !== expected.size) return false
  if ([...expected].some((id) => !actual.has(id))) return false
  return scene.edges.every((edge) => expected.has(edge.id)
    && typeof edge.path === 'string'
    && /^[MLCQZ0-9, .+\-Ee]*$/.test(edge.path)
    && edge.points.length >= 2
    && edge.points.every((point) => Number.isFinite(point.x) && Number.isFinite(point.y))
    && Number.isFinite(edge.labelPoint.x)
    && Number.isFinite(edge.labelPoint.y))
}

function stableSerialize(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`
  const record = value as Record<string, unknown>
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableSerialize(record[key])}`).join(',')}}`
}

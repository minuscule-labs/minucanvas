import dagre from '@dagrejs/dagre'
import { resolveCanvasScene } from '../engine/scene'
import { asMinuDiagramDiagnostics, validateParsedMinuDiagram } from '../engine/validate'
import { defaultEdgeConnection } from '../geometry'
import type { Point } from '../geometry'
import { layoutMindMap } from '../mindmap'
import { createCanvasEdge, createCanvasNode } from '../model'
import type { CanvasEdge, CanvasNode, CanvasShape, JsonCanvasEdgeEnd } from '../types'
import { parseMinuDiagramSyntax } from './parse'
import type { MinuDiagramCompileOptions, MinuDiagramCompileResult, MinuDiagramConnection, MinuDiagramDiagnostic, MinuDiagramNode, ParsedMinuDiagram } from './types'

const DEFAULT_WIDTH = 220
const DEFAULT_HEIGHT = 88
const IMAGE_WIDTH = 320
const IMAGE_HEIGHT = 200
const DIAMOND_WIDTH = 240
const DIAMOND_HEIGHT = 160
const ELLIPSE_SIZE = 160
const GROUP_PADDING = 40

const SHAPE_ALIASES: Record<string, CanvasShape> = {
  text: 'text',
  rectangle: 'rectangle',
  rect: 'rectangle',
  rounded: 'rounded-rectangle',
  card: 'rounded-rectangle',
  pill: 'pill',
  oval: 'pill',
  diamond: 'diamond',
  decision: 'diamond',
  ellipse: 'ellipse',
  circle: 'ellipse',
  parallelogram: 'parallelogram',
  hexagon: 'hexagon',
}

export function compileMinuDiagramSyntax(source: string, options: MinuDiagramCompileOptions = {}): MinuDiagramCompileResult {
  return compileParsedMinuDiagram(parseMinuDiagramSyntax(source, { strict: options.strict }), options)
}

export function compileParsedMinuDiagram(parsed: ParsedMinuDiagram, options: MinuDiagramCompileOptions = {}): MinuDiagramCompileResult {
  const semanticDiagnostics = validateParsedMinuDiagram(parsed)
  const diagnostics: MinuDiagramDiagnostic[] = [...parsed.diagnostics, ...asMinuDiagramDiagnostics(semanticDiagnostics)]
  if (semanticDiagnostics.some((diagnostic) => diagnostic.severity === 'error')) {
    const document = { nodes: [], edges: [] }
    return { document, scene: resolveCanvasScene(document, { diagnostics: semanticDiagnostics }), parsed, diagnostics }
  }
  const origin = options.origin ?? { x: 80, y: 80 }
  const nodeGap = options.nodeGap ?? 56
  const rankGap = options.rankGap ?? 112
  const groupPadding = options.groupPadding ?? GROUP_PADDING
  const gridSize = options.gridSize === false ? null : options.gridSize ?? 20
  const layout = options.layout ?? parsed.layout ?? 'flow'
  const placement = layout === 'mindmap'
    ? { positions: new Map(parsed.nodes.map((node) => [node.id, origin])), edgePoints: new Map<string, Point[]>() }
    : placeNodes(parsed, origin, nodeGap, rankGap, gridSize)

  const nodes: CanvasNode[] = []
  const groupNodes: CanvasNode[] = []

  for (const group of parsed.groups) {
    const partial: Partial<CanvasNode> = {
      id: group.id,
      type: 'group',
      label: group.label ?? group.id,
      x: origin.x,
      y: origin.y,
      width: 360,
      height: 240,
      style: { strokeStyle: 'dashed', opacity: 0.72, ...group.style },
    }
    if (group.color) partial.color = group.color
    if (group.parentGroupId) partial.groupId = group.parentGroupId
    groupNodes.push(createCanvasNode(partial))
  }

  for (const node of parsed.nodes) {
    nodes.push(createNode(node, placement.positions.get(node.id) ?? origin, diagnostics, layout === 'mindmap' ? 'text' : 'rounded-rectangle'))
  }

  const nodeLookup = new Map(nodes.map((node) => [node.id, node]))
  const edges = parsed.connections.map((connection, index) => createEdge(connection, index, nodeLookup))
  const documentNodes = fitGroups([...groupNodes, ...nodes], groupPadding)
  const document = { nodes: documentNodes, edges }
  if (layout === 'mindmap') {
    const mindMapDocument = layoutMindMap(document, { origin, gridSize: options.gridSize, ...(options.mindMap ?? {}) })
    const resolvedDocument = { ...mindMapDocument, nodes: fitGroups(mindMapDocument.nodes, groupPadding) }
    return { document: resolvedDocument, scene: resolveCanvasScene(resolvedDocument, { diagnostics: semanticDiagnostics }), parsed, diagnostics }
  }

  return { document, scene: resolveCanvasScene(document, { generatedEdgePoints: placement.edgePoints, diagnostics: semanticDiagnostics }), parsed, diagnostics }
}

function createNode(node: MinuDiagramNode, position: { x: number; y: number }, diagnostics: MinuDiagramDiagnostic[], defaultShape: CanvasShape): CanvasNode {
  const type = node.type ?? typeForNode(node)
  const shape = shapeForNode(node, diagnostics, defaultShape)
  const { width, height } = sizeForNode(node, type, shape)
  const partial: Partial<CanvasNode> = {
    id: node.id,
    type,
    x: position.x,
    y: position.y,
    width,
    height,
    shape,
  }
  if (type === 'text') partial.text = node.label ?? node.id
  const label = node.label ?? (type === 'link' || type === 'image' ? node.id : undefined)
  if (label) partial.label = label
  if (node.url) partial.url = node.url
  const file = node.file ?? (type === 'image' ? node.url : undefined)
  if (file) partial.file = file
  if (node.color) partial.color = node.color
  if (node.style) partial.style = node.style
  if (node.groupId) partial.groupId = node.groupId
  return createCanvasNode(partial)
}

function typeForNode(node: MinuDiagramNode): CanvasNode['type'] {
  if (node.url && !isImageUrl(node.url)) return 'link'
  if (node.url && isImageUrl(node.url)) return 'image'
  if (node.file && isImageUrl(node.file)) return 'image'
  return 'text'
}

function shapeForNode(node: MinuDiagramNode, diagnostics: MinuDiagramDiagnostic[], defaultShape: CanvasShape): CanvasShape {
  if (node.type === 'image' || node.type === 'link') return 'text'
  if (!node.shape) return defaultShape
  const shape = SHAPE_ALIASES[node.shape]
  if (shape) return shape
  diagnostics.push({ severity: 'warning', message: `Unsupported shape "${node.shape}" for node "${node.id}". Using rounded rectangle.`, line: node.line })
  return 'rounded-rectangle'
}

function sizeForTextNote(text: string): { width: number; height: number } {
  const lines = text.split('\n')
  const longest = Math.max(1, ...lines.map((line) => line.length))
  return {
    width: Math.max(80, Math.min(360, Math.ceil(longest * 8.7 + 18))),
    height: Math.max(36, Math.ceil(lines.length * 19 + 14)),
  }
}

function sizeForNode(node: MinuDiagramNode, type: CanvasNode['type'], shape: CanvasShape): { width: number; height: number } {
  const dimension = (value: number | undefined, fallback: number) => Number.isFinite(value) && (value ?? 0) > 0 ? value! : fallback
  if (type === 'image') return { width: dimension(node.width, IMAGE_WIDTH), height: dimension(node.height, IMAGE_HEIGHT) }
  if (shape === 'text') {
    const size = sizeForTextNote(node.label ?? node.id)
    return { width: dimension(node.width, size.width), height: dimension(node.height, size.height) }
  }
  if (shape === 'diamond') return { width: dimension(node.width, DIAMOND_WIDTH), height: dimension(node.height, DIAMOND_HEIGHT) }
  if (shape === 'ellipse') return { width: dimension(node.width, ELLIPSE_SIZE), height: dimension(node.height, ELLIPSE_SIZE) }
  if (shape === 'pill') return { width: dimension(node.width, 180), height: dimension(node.height, 84) }
  return { width: dimension(node.width, DEFAULT_WIDTH), height: dimension(node.height, DEFAULT_HEIGHT) }
}

function createEdge(connection: MinuDiagramConnection, index: number, nodes: Map<string, CanvasNode>): CanvasEdge {
  const { fromNode, toNode, fromEnd, toEnd } = edgeDirection(connection)
  const from = nodes.get(fromNode)
  const to = nodes.get(toNode)
  const defaults = from && to ? defaultEdgeConnection(from, to) : undefined
  const fromSide = defaults?.fromSide ?? 'right'
  const toSide = defaults?.toSide ?? 'left'
  const partial: Partial<CanvasEdge> = {
    id: `edge-${index + 1}`,
    fromSide,
    toSide,
    fromAnchor: defaults?.fromAnchor ?? { side: fromSide, position: 0.5 },
    toAnchor: defaults?.toAnchor ?? { side: toSide, position: 0.5 },
    fromEnd,
    toEnd,
  }
  if (connection.label) partial.label = connection.label
  if (connection.color) partial.color = connection.color
  const style = { ...(defaults?.style ?? {}), ...(connection.style ?? {}) }
  if (Object.keys(style).length > 0) partial.style = style
  return createCanvasEdge(fromNode, toNode, partial)
}

function edgeDirection(connection: MinuDiagramConnection): { fromNode: string; toNode: string; fromEnd: JsonCanvasEdgeEnd; toEnd: JsonCanvasEdgeEnd } {
  if (connection.operator === '<') return { fromNode: connection.to, toNode: connection.from, fromEnd: 'none', toEnd: 'arrow' }
  if (connection.operator === '<>') return { fromNode: connection.from, toNode: connection.to, fromEnd: 'arrow', toEnd: 'arrow' }
  if (connection.operator === '-' || connection.operator === '--') return { fromNode: connection.from, toNode: connection.to, fromEnd: 'none', toEnd: 'none' }
  return { fromNode: connection.from, toNode: connection.to, fromEnd: 'none', toEnd: 'arrow' }
}

interface FlowPlacement {
  positions: Map<string, { x: number; y: number }>
  edgePoints: Map<string, Point[]>
}

function placeNodes(
  parsed: ParsedMinuDiagram,
  origin: { x: number; y: number },
  nodeGap: number,
  rankGap: number,
  gridSize: number | null,
): FlowPlacement {
  // Mermaid's flowcharts delegate ordering and coordinate assignment to Dagre. In
  // particular, its crossing-minimization passes are much more reliable than
  // placing each rank in declaration order, which often made links pass through
  // unrelated nodes in fan-in and fan-out diagrams.
  const graph = new dagre.graphlib.Graph({ multigraph: true })
  graph.setGraph({
    rankdir: parsed.direction === 'left' ? 'RL' : parsed.direction === 'up' ? 'BT' : parsed.direction === 'down' ? 'TB' : 'LR',
    nodesep: nodeGap,
    ranksep: rankGap,
    edgesep: Math.max(20, Math.round(nodeGap / 2)),
    marginx: 0,
    marginy: 0,
    ranker: 'network-simplex',
    acyclicer: 'greedy',
  })
  graph.setDefaultEdgeLabel(() => ({}))

  for (const node of parsed.nodes) graph.setNode(node.id, estimatedNodeSize(node))
  parsed.connections.forEach((connection, index) => {
    const direction = edgeDirection(connection)
    if (direction.fromNode !== direction.toNode) graph.setEdge(direction.fromNode, direction.toNode, {}, `edge-${index}`)
  })
  dagre.layout(graph)

  const raw = parsed.nodes.map((node) => {
    const size = estimatedNodeSize(node)
    const point = graph.node(node.id) as { x?: number; y?: number } | undefined
    return {
      id: node.id,
      width: size.width,
      height: size.height,
      x: (point?.x ?? size.width / 2) - size.width / 2,
      y: (point?.y ?? size.height / 2) - size.height / 2,
    }
  })
  const minX = Math.min(0, ...raw.map((point) => point.x))
  const minY = Math.min(0, ...raw.map((point) => point.y))
  const snap = (value: number) => gridSize ? Math.round(value / gridSize) * gridSize : value
  const positions = new Map(raw.map((point) => [point.id, {
    x: snap(origin.x + point.x - minX + point.width / 2) - point.width / 2,
    y: snap(origin.y + point.y - minY + point.height / 2) - point.height / 2,
  }]))
  const edgePoints = new Map<string, Point[]>()
  parsed.connections.forEach((connection, index) => {
    const direction = edgeDirection(connection)
    const edge = graph.edge({ v: direction.fromNode, w: direction.toNode, name: `edge-${index}` }) as { points?: Point[] } | undefined
    if (!edge?.points?.length) return
    edgePoints.set(`edge-${index + 1}`, edge.points.map((point) => ({
      x: snap(origin.x + point.x - minX),
      y: snap(origin.y + point.y - minY),
    })))
  })
  return { positions, edgePoints }
}

function estimatedNodeSize(node: MinuDiagramNode): { width: number; height: number } {
  const type = node.type ?? typeForNode(node)
  const shape = node.type === 'image' || node.type === 'link' ? 'text' : node.shape ? (SHAPE_ALIASES[node.shape] ?? 'rounded-rectangle') : 'rounded-rectangle'
  return sizeForNode(node, type, shape)
}

function fitGroups(nodes: CanvasNode[], padding: number): CanvasNode[] {
  // Resolve descendants first: a parent must fit a child's resolved bounds, not
  // the group's placeholder dimensions from before its own children were fitted.
  const resolved = new Map(nodes.map((node) => [node.id, node]))
  const visiting = new Set<string>()
  const resolveGroup = (id: string): CanvasNode | undefined => {
    const group = resolved.get(id)
    if (!group || group.type !== 'group') return group
    if (visiting.has(id)) return group // Validation reports cycles; keep this pass finite.
    visiting.add(id)
    const children = nodes
      .filter((candidate) => candidate.groupId === id && candidate.id !== id)
      .map((child) => child.type === 'group' ? resolveGroup(child.id) ?? child : resolved.get(child.id) ?? child)
    if (children.length > 0) {
      const minX = Math.min(...children.map((child) => child.x))
      const minY = Math.min(...children.map((child) => child.y))
      const maxX = Math.max(...children.map((child) => child.x + child.width))
      const maxY = Math.max(...children.map((child) => child.y + child.height))
      resolved.set(id, { ...group, x: minX - padding, y: minY - padding, width: maxX - minX + padding * 2, height: maxY - minY + padding * 2 })
    }
    visiting.delete(id)
    return resolved.get(id)
  }
  for (const node of nodes) if (node.type === 'group') resolveGroup(node.id)
  return nodes.map((node) => resolved.get(node.id) ?? node)
}

function isImageUrl(value: string): boolean {
  return /\.(png|jpe?g|gif|webp|svg)(\?.*)?$/i.test(value)
}

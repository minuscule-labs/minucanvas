import type { CanvasEdgeStyle, CanvasNodeStyle, CanvasShape, CanvasStrokeStyle, JsonCanvasNodeType } from '../types'
import type { MinuDiagramDiagnostic, MinuDiagramNode, ParsedMinuDiagram } from '../syntax/types'
import type { CanvasDiagnostic } from './types'

const NODE_TYPES: readonly JsonCanvasNodeType[] = ['text', 'file', 'link', 'group', 'image']
const SHAPES: readonly CanvasShape[] = ['text', 'rectangle', 'rounded-rectangle', 'pill', 'diamond', 'ellipse', 'parallelogram', 'hexagon']
const SHAPE_ALIASES = new Set(['rect', 'rounded', 'card', 'oval', 'decision', 'circle'])
const STROKE_STYLES: readonly CanvasStrokeStyle[] = ['solid', 'dashed', 'dotted', 'sketch']
const ROUTINGS = new Set(['elbow', 'straight', 'curved'])
const NODE_PROPERTIES = new Set(['label', 'type', 'shape', 'url', 'file', 'width', 'height', 'color', 'fill', 'stroke', 'text', 'strokeWidth', 'style'])
const GROUP_PROPERTIES = new Set(['label', 'color', 'fill', 'stroke', 'text', 'strokeWidth', 'style'])
const EDGE_PROPERTIES = new Set(['color', 'stroke', 'strokeWidth', 'style', 'routing', 'route', 'lineType'])

function diagnostic(
  code: CanvasDiagnostic['code'],
  message: string,
  line?: number,
  propertyPath?: string,
  suggestion?: string,
): CanvasDiagnostic {
  return {
    severity: 'error',
    code,
    message,
    ...(line === undefined ? {} : { line }),
    ...(propertyPath === undefined ? {} : { propertyPath }),
    ...(suggestion === undefined ? {} : { suggestion }),
  }
}

/**
 * Validates relationships and values that require the completed parsed document.
 * Parser diagnostics remain separate so syntax errors preserve their exact source.
 */
export function validateParsedMinuDiagram(parsed: ParsedMinuDiagram): CanvasDiagnostic[] {
  const diagnostics: CanvasDiagnostic[] = []
  const nodes = new Map(parsed.nodes.map((node) => [node.id, node]))
  const groups = new Map(parsed.groups.map((group) => [group.id, group]))
  const identities = parsed.identities ?? []
  const declared = new Map<string, (typeof identities)[number]>()

  const defaults = parsed.defaultDeclarations ?? (['colorMode', 'styleMode', 'typeface'] as const)
    .flatMap((property) => parsed.defaults[property] === undefined ? [] : [{ property, value: parsed.defaults[property]!, line: parsed.defaultLines?.[property] }])
  for (const entry of defaults) {
    diagnostics.push({
      severity: 'warning',
      code: 'unsupported_default',
      message: `Default "${entry.property}" is parsed but has no rendering behavior yet.`,
      ...(entry.line === undefined ? {} : { line: entry.line }),
      propertyPath: entry.property,
      suggestion: 'Remove this default or style nodes and edges explicitly.',
    })
  }

  // The declaration registry is the single identity authority. It retains every
  // declaration, unlike the parser's maps, which intentionally retain the final
  // declaration for normal property refinement.
  for (const identity of identities) {
    const previous = declared.get(identity.id)
    if (previous && previous.kind !== identity.kind) {
      diagnostics.push(diagnostic('duplicate_id', `ID "${identity.id}" is declared as both ${previous.kind} and ${identity.kind}.`, identity.line, 'id', 'Use a unique ID for every node and group.'))
    } else if (!previous) {
      declared.set(identity.id, identity)
    }
    validateProperties(identity.id, identity.properties, identity.kind === 'node' ? NODE_PROPERTIES : GROUP_PROPERTIES, identity.line, diagnostics)
    validateStyle(identity.id, identity.properties, undefined, identity.line, diagnostics)
    if (identity.kind === 'node') validateRawNodeProperties(identity.id, identity.properties, identity.line, diagnostics)
  }

  // Parsed documents supplied directly by API consumers may not have parser
  // declaration metadata, so preserve relationship and value validation here.
  for (const node of parsed.nodes) {
    if (groups.has(node.id) && !identities.length) {
      diagnostics.push(diagnostic('duplicate_id', `ID "${node.id}" is used by both a node and a group.`, node.line, 'id', 'Use a unique ID for every node and group.'))
    }
    if (!identities.length) {
      validateProperties(node.id, node.properties, NODE_PROPERTIES, node.line, diagnostics)
      validateStyle(node.id, node.properties, node.style, node.line, diagnostics)
    }
    if (!identities.length) validateNode(node, diagnostics)
    if (node.groupId && !groups.has(node.groupId)) {
      diagnostics.push(diagnostic('invalid_group_reference', `Node "${node.id}" references unknown group "${node.groupId}".`, node.line, 'groupId', 'Declare the group before assigning nodes to it.'))
    }
  }

  for (const group of parsed.groups) {
    if (!identities.length) {
      validateProperties(group.id, group.properties, GROUP_PROPERTIES, group.line, diagnostics)
      validateStyle(group.id, group.properties, group.style, group.line, diagnostics)
    }
    if (group.parentGroupId && !groups.has(group.parentGroupId)) {
      diagnostics.push(diagnostic('invalid_group_reference', `Group "${group.id}" references unknown parent group "${group.parentGroupId}".`, group.line, 'parentGroupId', 'Declare the parent group before nesting this group.'))
    }
  }

  for (const connection of parsed.connections) {
    validateProperties(`${connection.from} → ${connection.to}`, connection.properties, EDGE_PROPERTIES, connection.line, diagnostics)
    validateStyle(`${connection.from} → ${connection.to}`, connection.properties, connection.style, connection.line, diagnostics, true)
    for (const id of [connection.from, connection.to]) {
      if (!nodes.has(id)) {
        diagnostics.push(diagnostic('unknown_reference', `Connection references unknown node "${id}".`, connection.line, 'connection', 'Declare the node before connecting it.'))
      }
      if (groups.has(id)) {
        diagnostics.push(diagnostic('unknown_reference', `Connection endpoint "${id}" is a group, not a node.`, connection.line, 'connection', 'Connect to a node ID instead.'))
      }
    }
  }

  const visiting = new Set<string>()
  const visited = new Set<string>()
  const visit = (id: string): void => {
    if (visited.has(id)) return
    if (visiting.has(id)) {
      const group = groups.get(id)
      diagnostics.push(diagnostic('containment_cycle', `Group containment contains a cycle at "${id}".`, group?.line, 'parentGroupId', 'Remove the parent reference that closes the cycle.'))
      return
    }
    visiting.add(id)
    const parent = groups.get(id)?.parentGroupId
    if (parent && groups.has(parent)) visit(parent)
    visiting.delete(id)
    visited.add(id)
  }
  for (const group of parsed.groups) visit(group.id)

  return diagnostics
}

function validateProperties(id: string, properties: Record<string, string> | undefined, allowed: Set<string>, line: number | undefined, diagnostics: CanvasDiagnostic[]): void {
  for (const propertyName of Object.keys(properties ?? {})) {
    if (!allowed.has(propertyName)) {
      diagnostics.push(diagnostic('unknown_property', `Property "${propertyName}" is not allowed on "${id}".`, line, propertyName, 'Remove the property or use a property supported by this statement type.'))
    }
  }
}

function validateStyle(
  id: string,
  properties: Record<string, string> | undefined,
  style: CanvasNodeStyle | CanvasEdgeStyle | undefined,
  line: number | undefined,
  diagnostics: CanvasDiagnostic[],
  edge = false,
): void {
  const strokeWidth = properties?.strokeWidth ?? style?.strokeWidth
  if (strokeWidth !== undefined && (!Number.isFinite(Number(strokeWidth)) || Number(strokeWidth) < 0)) {
    diagnostics.push(diagnostic('invalid_property_value', `"${id}" has an invalid strokeWidth.`, line, 'strokeWidth', 'Use a finite non-negative number.'))
  }
  const strokeStyle = properties?.style ?? style?.strokeStyle
  if (strokeStyle !== undefined && !STROKE_STYLES.includes(strokeStyle as CanvasStrokeStyle)) {
    diagnostics.push(diagnostic('invalid_property_value', `"${id}" has an unsupported stroke style "${strokeStyle}".`, line, 'style', `Use one of: ${STROKE_STYLES.join(', ')}.`))
  }
  if (!edge) return
  const rawRouting = ['routing', 'route', 'lineType']
    .map((propertyPath) => ({ propertyPath, value: properties?.[propertyPath] }))
    .find((entry) => entry.value !== undefined)
  const routing = rawRouting?.value ?? (style as CanvasEdgeStyle | undefined)?.routing
  if (routing !== undefined && !ROUTINGS.has(routing)) {
    diagnostics.push(diagnostic('invalid_property_value', `"${id}" has an unsupported routing value "${routing}".`, line, rawRouting?.propertyPath ?? 'routing', `Use one of: ${[...ROUTINGS].join(', ')}.`))
  }
}

function validateRawNodeProperties(id: string, properties: Record<string, string>, line: number, diagnostics: CanvasDiagnostic[]): void {
  const type = properties.type
  if (type !== undefined && !NODE_TYPES.includes(type as JsonCanvasNodeType)) {
    diagnostics.push(diagnostic('invalid_property_value', `Unsupported node type "${type}".`, line, 'type', `Use one of: ${NODE_TYPES.join(', ')}.`))
  }
  const shape = properties.shape
  if (shape !== undefined && !SHAPES.includes(shape as CanvasShape) && !SHAPE_ALIASES.has(shape)) {
    diagnostics.push(diagnostic('invalid_property_value', `Unsupported node shape "${shape}".`, line, 'shape', `Use one of: ${SHAPES.join(', ')}.`))
  }
  for (const propertyPath of ['width', 'height'] as const) {
    const value = properties[propertyPath]
    if (value !== undefined && (!Number.isFinite(Number(value)) || Number(value) <= 0)) {
      diagnostics.push(diagnostic('invalid_property_value', `Node "${id}" has an invalid ${propertyPath}.`, line, propertyPath, 'Use a finite positive number.'))
    }
  }
}

function validateNode(node: MinuDiagramNode, diagnostics: CanvasDiagnostic[]): void {
  if (node.type && !NODE_TYPES.includes(node.type)) {
    diagnostics.push(diagnostic('invalid_property_value', `Unsupported node type "${node.type}".`, node.line, 'type', `Use one of: ${NODE_TYPES.join(', ')}.`))
  }
  if (node.shape && !SHAPES.includes(node.shape as CanvasShape) && !SHAPE_ALIASES.has(node.shape)) {
    diagnostics.push(diagnostic('invalid_property_value', `Unsupported node shape "${node.shape}".`, node.line, 'shape', `Use one of: ${SHAPES.join(', ')}.`))
  }
  for (const [propertyPath, value] of [['width', node.width], ['height', node.height]] as const) {
    if (value !== undefined && (!Number.isFinite(value) || value <= 0)) {
      diagnostics.push(diagnostic('invalid_property_value', `Node "${node.id}" has an invalid ${propertyPath}.`, node.line, propertyPath, 'Use a finite positive number.'))
    }
  }
}

export function asMinuDiagramDiagnostics(diagnostics: CanvasDiagnostic[]): MinuDiagramDiagnostic[] {
  return diagnostics.map((item) => ({
    severity: item.severity,
    code: item.code,
    message: item.message,
    ...(item.line === undefined ? {} : { line: item.line }),
    ...(item.propertyPath === undefined ? {} : { propertyPath: item.propertyPath }),
    ...(item.suggestion === undefined ? {} : { suggestion: item.suggestion }),
  }))
}

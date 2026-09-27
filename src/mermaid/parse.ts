import { parse } from 'mermaid-parser-bundle'
import { DEFAULT_DIAGRAM_RESOURCE_LIMITS } from './limits'
import type {
  MermaidDiagnostic,
  MermaidDiagramEdge,
  MermaidDiagramGroup,
  MermaidDiagramNode,
  MermaidParseOptions,
  MermaidParseResult,
  ParsedMermaidDiagram,
} from './types'

interface FlowVertex {
  id?: unknown
  text?: unknown
  type?: unknown
  labelType?: unknown
  styles?: unknown
  classes?: unknown
  link?: unknown
  linkTarget?: unknown
  haveCallback?: unknown
  props?: unknown
  icon?: unknown
  img?: unknown
}

interface FlowEdge {
  start?: unknown
  end?: unknown
  type?: unknown
  stroke?: unknown
  text?: unknown
  labelType?: unknown
  classes?: unknown
  style?: unknown
  isUserDefinedId?: unknown
  length?: unknown
  interpolate?: unknown
  animate?: unknown
  animation?: unknown
}

interface FlowSubGraph {
  id?: unknown
  title?: unknown
  labelType?: unknown
  nodes?: unknown
  classes?: unknown
  dir?: unknown
  metadata?: unknown
}

interface FlowDb {
  getDirection(): unknown
  getVertices(): unknown
  getEdges(): unknown
  getSubGraphs(): unknown
  getClasses?(): unknown
}

export async function parseMermaidSyntax(source: string, options: MermaidParseOptions = {}): Promise<MermaidParseResult> {
  const maxSourceLength = options.maxSourceLength ?? DEFAULT_DIAGRAM_RESOURCE_LIMITS.maxSourceLength
  if (source.length > maxSourceLength) {
    return failure('resource_limit', `Mermaid source exceeds the ${maxSourceLength} character limit.`)
  }

  const sourceDiagnostics = inspectSource(source)
  if (sourceDiagnostics.length > 0) return { success: false, diagnostics: sourceDiagnostics }

  const header = firstMeaningfulLine(source)
  if (!/^(?:flowchart|graph)(?:\s|$)/i.test(header)) {
    return failure('unsupported_diagram', 'Only Mermaid flowchart and graph diagrams are supported.')
  }

  const maskedSource = maskComments(source)
  const expansionDiagnostic = preflightExpansion(maskedSource, options.maxEdges ?? DEFAULT_DIAGRAM_RESOURCE_LIMITS.maxEdges)
  if (expansionDiagnostic) return { success: false, diagnostics: [expansionDiagnostic] }

  let result: { type: string; db: unknown }
  try {
    // The candidate parser currently mishandles standard full-line comments.
    // Mask only Mermaid comment lines while preserving line numbers for errors.
    result = await parse(maskedSource)
  } catch (error) {
    return { success: false, diagnostics: [syntaxDiagnostic(error)] }
  }

  if (result.type !== 'flowchart' && result.type !== 'flowchart-v2') {
    return failure('unsupported_diagram', `Unsupported Mermaid diagram type "${result.type}".`)
  }
  if (!isFlowDb(result.db)) {
    return failure('parser_contract', 'The Mermaid parser returned an incompatible flowchart database.')
  }

  try {
    const parsed = normalizeFlowDb(result.db)
    if (parsed.nodes.length === 0 && parsed.groups.length === 0) {
      return failure('invalid_graph', 'Mermaid flowchart must contain at least one node or subgraph.')
    }
    const graphDiagnostics = validateNormalizedGraph(parsed, result.db, options)
    return graphDiagnostics.length > 0
      ? { success: false, diagnostics: graphDiagnostics }
      : { success: true, parsed, diagnostics: [] }
  } catch (error) {
    if (error instanceof NormalizationError) return failure(error.code, error.message)
    return failure('parser_contract', error instanceof Error ? error.message : 'The Mermaid parser returned invalid flowchart data.')
  }
}

function inspectSource(source: string): MermaidDiagnostic[] {
  const diagnostics: MermaidDiagnostic[] = []
  const lines = source.split(/\r?\n/)
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!
    const trimmed = line.trimStart()
    if (trimmed.startsWith('%%{')) {
      diagnostics.push(unsupported(index + 1, 'Mermaid initialization and configuration directives are not supported.'))
    }
    if (index === 0 && trimmed === '---') {
      diagnostics.push(unsupported(1, 'Mermaid frontmatter is not supported.'))
    }
  }

  const inspectableSource = maskLabelContent(maskComments(source))
  for (const match of inspectableSource.matchAll(/@\s*\{/g)) {
    const position = sourcePosition(source, match.index ?? 0)
    diagnostics.push(unsupported(position.line, 'Advanced Mermaid node shape and metadata syntax is not supported.', position.column))
  }
  const statementPatterns = [
    /(?:^|[;\n])\s*(style|classDef|class|linkStyle|click)\b/gi,
    /(?:^|[;\n])\s*(accTitle)\s*:/gi,
    /(?:^|[;\n])\s*(accDescr)\s*(?=[:{])/gi,
  ]
  for (const pattern of statementPatterns) {
    for (const match of inspectableSource.matchAll(pattern)) {
      const statement = match[1]!
      const offset = (match.index ?? 0) + match[0].lastIndexOf(statement)
      const position = sourcePosition(source, offset)
      diagnostics.push(unsupported(position.line, `Mermaid ${statement} statements are not supported.`, position.column))
    }
  }
  return diagnostics
}

function firstMeaningfulLine(source: string): string {
  for (const line of source.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (trimmed && !trimmed.startsWith('%%')) return trimmed
  }
  return ''
}

function maskComments(source: string): string {
  return source.split(/(\r?\n)/).map((part) => {
    if (/^\r?\n$/.test(part)) return part
    return part.trimStart().startsWith('%%') ? part.replace(/[^\r\n]/g, ' ') : part
  }).join('')
}

function preflightExpansion(source: string, maxEdges: number): MermaidDiagnostic | undefined {
  const structural = maskLabelContent(source)
  const connectionCount = [...structural.matchAll(/<-->|<-\.->|-->|-\.->|---|-\.-/g)].length
  if (connectionCount > maxEdges) {
    return limit(`Mermaid source declares more than the ${maxEdges} edge limit.`)
  }

  const branchSeparators = [...structural.matchAll(/&/g)].length
  // One branching link creates a Cartesian product. This bound keeps parser-time
  // expansion near the configured edge budget before FlowDB materializes links.
  const maxBranchSeparators = Math.max(0, Math.floor(2 * Math.sqrt(Math.max(0, maxEdges))) - 2)
  if (branchSeparators > maxBranchSeparators) {
    return limit(`Mermaid branching shorthand exceeds the safe expansion limit for ${maxEdges} edges.`)
  }
  return undefined
}

function maskLabelContent(source: string): string {
  let result = ''
  let quote: '"' | null = null
  let pipeLabel = false
  const closing: string[] = []
  const pairs: Record<string, string> = { '[': ']', '(': ')', '{': '}' }
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index]!
    if (quote) {
      if (character === quote && !isEscaped(source, index)) quote = null
      result += character === '\n' || character === '\r' ? character : ' '
      continue
    }
    if (pipeLabel) {
      if (character === '|' && !isEscaped(source, index)) pipeLabel = false
      result += character === '\n' || character === '\r' ? character : ' '
      continue
    }
    if (character === '"') {
      quote = character
      result += ' '
      continue
    }
    if (character === '|' && closing.length === 0) {
      pipeLabel = true
      result += ' '
      continue
    }
    if (pairs[character]) {
      closing.push(pairs[character])
      result += character
      continue
    }
    if (closing.length > 0) {
      if (character === closing.at(-1)) closing.pop()
      result += character === '\n' || character === '\r' ? character : ' '
      continue
    }
    result += character
  }
  return result
}

function isEscaped(source: string, index: number): boolean {
  let backslashes = 0
  for (let cursor = index - 1; cursor >= 0 && source[cursor] === '\\'; cursor -= 1) backslashes += 1
  return backslashes % 2 === 1
}

function normalizeFlowDb(db: FlowDb): ParsedMermaidDiagram {
  const verticesValue = db.getVertices()
  const edgesValue = db.getEdges()
  const groupsValue = db.getSubGraphs()
  if (!(verticesValue instanceof Map) || !Array.isArray(edgesValue) || !Array.isArray(groupsValue)) {
    throw new Error('The Mermaid flowchart database collections have unexpected types.')
  }

  const rawGroups = groupsValue.map(readGroup)
  const groupIds = new Set<string>()
  for (const group of rawGroups) {
    if (groupIds.has(group.id)) throw new NormalizationError('invalid_graph', `Mermaid returned duplicate subgraph ID "${group.id}".`)
    groupIds.add(group.id)
  }
  const directParent = new Map<string, string>()
  for (const parent of rawGroups) {
    for (const child of parent.members) {
      if (!groupIds.has(child)) continue
      if (directParent.has(child)) throw new Error(`Mermaid subgraph "${child}" has multiple parent groups.`)
      directParent.set(child, parent.id)
    }
  }

  const groups: MermaidDiagramGroup[] = rawGroups.map((group) => ({
    id: group.id,
    label: group.title,
    ...(directParent.get(group.id) ? { parentGroupId: directParent.get(group.id)! } : {}),
  }))
  const nodeGroups = new Map<string, string>()
  for (const group of rawGroups) {
    for (const member of group.members) {
      if (groupIds.has(member)) continue
      if (nodeGroups.has(member)) throw new Error(`Mermaid node "${member}" belongs to multiple direct groups.`)
      nodeGroups.set(member, group.id)
    }
  }

  const nodes: MermaidDiagramNode[] = []
  for (const [mapId, value] of verticesValue.entries()) {
    if (!isRecord(value)) throw new Error(`Mermaid node "${String(mapId)}" has an invalid value.`)
    const vertex = value as FlowVertex
    const id = requiredString(vertex.id ?? mapId, 'node id')
    nodes.push({
      id,
      label: typeof vertex.text === 'string' ? vertex.text : id,
      shape: normalizeShape(vertex.type),
      ...(nodeGroups.get(id) ? { groupId: nodeGroups.get(id)! } : {}),
    })
  }

  const edges: MermaidDiagramEdge[] = edgesValue.map((value) => {
    if (!isRecord(value)) throw new Error('Mermaid returned an invalid edge.')
    const edge = value as FlowEdge
    return {
      from: requiredString(edge.start, 'edge start'),
      to: requiredString(edge.end, 'edge end'),
      arrow: normalizeArrow(edge.type),
      stroke: edge.stroke === 'dotted' ? 'dotted' : 'solid',
      ...(typeof edge.text === 'string' && edge.text ? { label: edge.text } : {}),
    }
  })

  return { direction: normalizeDirection(db.getDirection()), nodes, groups, edges }
}

function validateNormalizedGraph(parsed: ParsedMermaidDiagram, db: FlowDb, options: MermaidParseOptions): MermaidDiagnostic[] {
  const diagnostics: MermaidDiagnostic[] = []
  const nodeIds = new Set(parsed.nodes.map((node) => node.id))
  const groupIds = new Set(parsed.groups.map((group) => group.id))
  for (const id of nodeIds) {
    if (groupIds.has(id)) diagnostics.push(invalidGraph(`ID "${id}" is used by both a Mermaid node and subgraph.`))
  }
  for (const edge of parsed.edges) {
    for (const endpoint of [edge.from, edge.to]) {
      if (groupIds.has(endpoint)) diagnostics.push(invalidGraph(`Edge endpoint "${endpoint}" is a subgraph; edges targeting subgraphs are not supported.`))
      else if (!nodeIds.has(endpoint)) diagnostics.push(invalidGraph(`Edge references unknown node "${endpoint}".`))
    }
  }

  const maxNodes = options.maxNodes ?? DEFAULT_DIAGRAM_RESOURCE_LIMITS.maxNodes
  const maxEdges = options.maxEdges ?? DEFAULT_DIAGRAM_RESOURCE_LIMITS.maxEdges
  const maxNesting = options.maxNesting ?? DEFAULT_DIAGRAM_RESOURCE_LIMITS.maxNesting
  const nativeNodeCount = parsed.nodes.length + parsed.groups.length
  if (nativeNodeCount > maxNodes) diagnostics.push(limit(`Mermaid diagram creates ${nativeNodeCount} native nodes including groups; the limit is ${maxNodes}.`))
  if (parsed.edges.length > maxEdges) diagnostics.push(limit(`Mermaid diagram has ${parsed.edges.length} edges; the limit is ${maxEdges}.`))

  const vertices = db.getVertices() as Map<unknown, FlowVertex>
  for (const [id, vertex] of vertices) {
    if (nonEmptyArray(vertex.styles) || nonEmptyArray(vertex.classes) || vertex.link || vertex.linkTarget || vertex.haveCallback) {
      diagnostics.push(unsupported(undefined, `Node "${String(id)}" uses unsupported styling or click behavior.`))
    }
    if (vertex.labelType === 'markdown' || containsHtml(vertex.text)) {
      diagnostics.push(unsupported(undefined, `Node "${String(id)}" uses unsupported HTML or Markdown label formatting.`))
    }
    if (isRecord(vertex.props) && Object.keys(vertex.props).length > 0 || vertex.icon || vertex.img) {
      diagnostics.push(unsupported(undefined, `Node "${String(id)}" uses unsupported advanced shape, icon, or image metadata.`))
    }
  }

  for (const edge of db.getEdges() as FlowEdge[]) {
    if (!['arrow_point', 'arrow_open', 'double_arrow_point'].includes(String(edge.type)) || ![undefined, 'normal', 'dotted'].includes(edge.stroke as undefined | 'normal' | 'dotted')) {
      diagnostics.push({ severity: 'error', code: 'unsupported_edge', message: `Edge "${String(edge.start)}" → "${String(edge.end)}" uses an unsupported Mermaid edge type.` })
    }
    if (nonEmptyArray(edge.classes) || nonEmptyArray(edge.style) || edge.isUserDefinedId || edge.interpolate || edge.animate || edge.animation || edge.length !== undefined && edge.length !== 1) {
      diagnostics.push(unsupported(undefined, `Edge "${String(edge.start)}" → "${String(edge.end)}" uses unsupported length, styling, animation, interpolation, or an explicit edge ID.`))
    }
    if (edge.labelType === 'markdown' || containsHtml(edge.text)) {
      diagnostics.push(unsupported(undefined, `Edge "${String(edge.start)}" → "${String(edge.end)}" uses unsupported HTML or Markdown label formatting.`))
    }
  }

  for (const group of db.getSubGraphs() as FlowSubGraph[]) {
    if (group.dir || nonEmptyArray(group.classes) || group.metadata) diagnostics.push(unsupported(undefined, `Subgraph "${String(group.id)}" uses unsupported direction, styling, or metadata.`))
    if (group.labelType === 'markdown' || containsHtml(group.title)) {
      diagnostics.push(unsupported(undefined, `Subgraph "${String(group.id)}" uses unsupported HTML or Markdown label formatting.`))
    }
  }
  const classes = db.getClasses?.()
  if (classes instanceof Map && classes.size > 0) diagnostics.push(unsupported(undefined, 'Mermaid class definitions are not supported.'))

  const parents = new Map(parsed.groups.flatMap((group) => group.parentGroupId ? [[group.id, group.parentGroupId] as const] : []))
  for (const group of parsed.groups) {
    const seen = new Set<string>()
    let current: string | undefined = group.id
    while (current) {
      if (seen.has(current)) {
        diagnostics.push({ severity: 'error', code: 'invalid_graph', message: `Subgraph containment contains a cycle at "${current}".` })
        break
      }
      seen.add(current)
      if (seen.size > maxNesting) {
        diagnostics.push(limit(`Mermaid subgraph nesting exceeds the limit of ${maxNesting}.`))
        break
      }
      current = parents.get(current)
    }
  }
  return diagnostics
}

function readGroup(value: unknown): { id: string; title: string; members: string[] } {
  if (!isRecord(value)) throw new Error('Mermaid returned an invalid subgraph.')
  const group = value as FlowSubGraph
  if (!Array.isArray(group.nodes) || !group.nodes.every((member) => typeof member === 'string')) {
    throw new Error(`Mermaid subgraph "${String(group.id)}" has invalid members.`)
  }
  const id = requiredString(group.id, 'subgraph id')
  return { id, title: typeof group.title === 'string' && group.title ? group.title : id, members: group.nodes }
}

function normalizeShape(value: unknown): MermaidDiagramNode['shape'] {
  if (value === undefined || value === 'square' || value === 'rect') return 'rectangle'
  if (value === 'round') return 'rounded-rectangle'
  if (value === 'stadium') return 'pill'
  if (value === 'diamond') return 'diamond'
  if (value === 'circle') return 'ellipse'
  if (value === 'hexagon') return 'hexagon'
  throw new NormalizationError('unsupported_shape', `Unsupported Mermaid node shape "${String(value)}".`)
}

function normalizeArrow(value: unknown): MermaidDiagramEdge['arrow'] {
  if (value === 'arrow_point') return 'forward'
  if (value === 'arrow_open') return 'none'
  if (value === 'double_arrow_point') return 'both'
  throw new NormalizationError('unsupported_edge', `Unsupported Mermaid edge type "${String(value)}".`)
}

function normalizeDirection(value: unknown): ParsedMermaidDiagram['direction'] {
  if (value === 'BT') return 'up'
  if (value === 'LR') return 'right'
  if (value === 'RL') return 'left'
  if (value === 'TB' || value === 'TD' || value === undefined) return 'down'
  throw new Error(`Unsupported Mermaid flowchart direction "${String(value)}".`)
}

function isFlowDb(value: unknown): value is FlowDb {
  return isRecord(value) && ['getDirection', 'getVertices', 'getEdges', 'getSubGraphs'].every((key) => typeof value[key] === 'function')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function nonEmptyArray(value: unknown): boolean {
  return Array.isArray(value) && value.length > 0
}

function containsHtml(value: unknown): boolean {
  return typeof value === 'string' && /<\/?[a-z][^>]*>/i.test(value)
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value) throw new Error(`Mermaid returned an invalid ${field}.`)
  return value
}

function syntaxDiagnostic(error: unknown): MermaidDiagnostic {
  const fallback = error instanceof Error ? error.message : 'Invalid Mermaid syntax.'
  const hash = isRecord(error) && isRecord(error.hash) ? error.hash : undefined
  const location = hash && isRecord(hash.loc) ? hash.loc : undefined
  const line = location && typeof location.first_line === 'number' ? location.first_line : undefined
  const zeroBasedColumn = location && typeof location.first_column === 'number' ? location.first_column : undefined
  return {
    severity: 'error',
    code: 'invalid_syntax',
    message: fallback.slice(0, 500),
    ...(line === undefined ? {} : { line }),
    ...(zeroBasedColumn === undefined ? {} : { column: zeroBasedColumn + 1 }),
  }
}

function sourcePosition(source: string, offset: number): { line: number; column: number } {
  const before = source.slice(0, offset)
  const lines = before.split(/\r?\n/)
  return { line: lines.length, column: lines.at(-1)!.length + 1 }
}

function unsupported(line: number | undefined, message: string, column?: number): MermaidDiagnostic {
  return { severity: 'error', code: 'unsupported_feature', message, ...(line === undefined ? {} : { line }), ...(column === undefined ? {} : { column }) }
}

function limit(message: string): MermaidDiagnostic {
  return { severity: 'error', code: 'resource_limit', message }
}

function invalidGraph(message: string): MermaidDiagnostic {
  return { severity: 'error', code: 'invalid_graph', message }
}

class NormalizationError extends Error {
  constructor(readonly code: 'unsupported_shape' | 'unsupported_edge' | 'invalid_graph', message: string) {
    super(message)
    this.name = 'NormalizationError'
  }
}

function failure(code: MermaidDiagnostic['code'], message: string): MermaidParseResult {
  return { success: false, diagnostics: [{ severity: 'error', code, message }] }
}

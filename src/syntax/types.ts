import type { MindMapLayoutOptions } from '../mindmap'
import type { ResolvedCanvasScene } from '../engine/types'
import type { CanvasEdgeStyle, CanvasNodeStyle, CanvasShape, JsonCanvasDocument } from '../types'

export type MinuDiagramDirection = 'down' | 'up' | 'right' | 'left'
export type MinuDiagramLayout = 'flow' | 'mindmap'
export type MinuDiagramDiagnosticSeverity = 'warning' | 'error'
export type MinuDiagramDiagnosticCode =
  | 'unsupported_statement'
  | 'unsupported_operator'
  | 'malformed_connection'
  | 'invalid_properties'
  | 'invalid_directive'
  | 'unmatched_group'
  | 'unsupported_default'
  | 'unknown_property'
  | 'invalid_property_value'
  | 'duplicate_id'
  | 'unknown_reference'
  | 'invalid_group_reference'
  | 'containment_cycle'
  | 'resource_limit'

export interface MinuDiagramDiagnostic {
  severity: MinuDiagramDiagnosticSeverity
  code?: MinuDiagramDiagnosticCode | undefined
  message: string
  line?: number | undefined
  column?: number | undefined
  source?: string | undefined
  propertyPath?: string | undefined
  suggestion?: string | undefined
}

export interface MinuDiagramParseOptions {
  /** Reject ambiguous or unsupported statements instead of treating them as bare node IDs. */
  strict?: boolean | undefined
  /** Optional resource bounds for untrusted source. */
  maxSourceLength?: number | undefined
  maxNodes?: number | undefined
  maxEdges?: number | undefined
  maxNesting?: number | undefined
}

export interface MinuDiagramNode {
  id: string
  label?: string | undefined
  type?: 'text' | 'file' | 'link' | 'group' | 'image' | undefined
  shape?: string | undefined
  url?: string | undefined
  file?: string | undefined
  width?: number | undefined
  height?: number | undefined
  color?: string | undefined
  style?: CanvasNodeStyle | undefined
  groupId?: string | undefined
  /** Parser-only source metadata retained for semantic validation. */
  propertyNames?: string[] | undefined
  properties?: Record<string, string> | undefined
  line?: number | undefined
}

export interface MinuDiagramGroup {
  id: string
  label?: string | undefined
  color?: string | undefined
  style?: CanvasNodeStyle | undefined
  parentGroupId?: string | undefined
  /** Parser-only source metadata retained for semantic validation. */
  propertyNames?: string[] | undefined
  properties?: Record<string, string> | undefined
  line?: number | undefined
}

export type MinuDiagramConnectionOperator = '>' | '<' | '<>' | '-' | '--' | '-->'

export interface MinuDiagramConnection {
  from: string
  to: string
  operator: MinuDiagramConnectionOperator
  label?: string | undefined
  color?: string | undefined
  style?: CanvasEdgeStyle | undefined
  /** Parser-only source metadata retained for semantic validation. */
  propertyNames?: string[] | undefined
  properties?: Record<string, string> | undefined
  line?: number | undefined
}

export interface MinuDiagramIdentity {
  id: string
  kind: 'node' | 'group'
  line: number
  properties: Record<string, string>
}

export interface MinuDiagramDefault {
  property: 'colorMode' | 'styleMode' | 'typeface'
  value: string
  line: number
}

export interface ParsedMinuDiagram {
  title?: string | undefined
  direction: MinuDiagramDirection
  layout?: MinuDiagramLayout | undefined
  nodes: MinuDiagramNode[]
  groups: MinuDiagramGroup[]
  connections: MinuDiagramConnection[]
  /** Explicit declarations used for document-wide identity validation. */
  identities?: MinuDiagramIdentity[] | undefined
  defaults: {
    colorMode?: string | undefined
    styleMode?: string | undefined
    typeface?: string | undefined
  }
  /** Source lines for parsed defaults; direct callers may omit this metadata. */
  defaultLines?: Partial<Record<'colorMode' | 'styleMode' | 'typeface', number>> | undefined
  /** Every authored default directive, retained even when a later one overwrites it. */
  defaultDeclarations?: MinuDiagramDefault[] | undefined
  diagnostics: MinuDiagramDiagnostic[]
}

export interface MinuDiagramCompileOptions extends MinuDiagramParseOptions {
  origin?: { x: number; y: number }
  nodeGap?: number
  rankGap?: number
  groupPadding?: number
  /** Snap generated node centers to this grid size. Set to false to disable. */
  gridSize?: number | false
  layout?: MinuDiagramLayout | undefined
  mindMap?: MindMapLayoutOptions | undefined
}

export interface MinuDiagramCompileResult {
  document: JsonCanvasDocument
  /** Experimental derived geometry. Generated points do not modify document edges. */
  scene: ResolvedCanvasScene
  parsed: ParsedMinuDiagram
  diagnostics: MinuDiagramDiagnostic[]
}

export type SupportedMinuDiagramShape = CanvasShape

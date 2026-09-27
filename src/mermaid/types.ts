import type { ResolvedCanvasScene } from '../engine/types'
import type { MinuDiagramCompileOptions } from '../syntax/types'
import type { CanvasShape, JsonCanvasDocument } from '../types'

export type MermaidDiagnosticSeverity = 'warning' | 'error'
export type MermaidDiagnosticCode =
  | 'invalid_syntax'
  | 'unsupported_diagram'
  | 'unsupported_feature'
  | 'unsupported_shape'
  | 'unsupported_edge'
  | 'invalid_graph'
  | 'resource_limit'
  | 'parser_contract'

export interface MermaidDiagnostic {
  severity: MermaidDiagnosticSeverity
  code: MermaidDiagnosticCode
  message: string
  line?: number | undefined
  column?: number | undefined
  suggestion?: string | undefined
}

export interface MermaidDiagramNode {
  id: string
  label: string
  shape: CanvasShape
  groupId?: string | undefined
}

export interface MermaidDiagramGroup {
  id: string
  label: string
  parentGroupId?: string | undefined
}

export interface MermaidDiagramEdge {
  from: string
  to: string
  arrow: 'none' | 'forward' | 'both'
  stroke: 'solid' | 'dotted'
  label?: string | undefined
}

export interface ParsedMermaidDiagram {
  direction: 'down' | 'up' | 'right' | 'left'
  nodes: MermaidDiagramNode[]
  groups: MermaidDiagramGroup[]
  edges: MermaidDiagramEdge[]
}

export interface MermaidResourceLimits {
  maxSourceLength?: number | undefined
  maxNodes?: number | undefined
  maxEdges?: number | undefined
  maxNesting?: number | undefined
}

export interface MermaidParseOptions extends MermaidResourceLimits {}

export interface MermaidCompileOptions extends MermaidResourceLimits, Pick<
  MinuDiagramCompileOptions,
  'origin' | 'nodeGap' | 'rankGap' | 'groupPadding' | 'gridSize'
> {}

export type MermaidParseResult =
  | { success: true; parsed: ParsedMermaidDiagram; diagnostics: MermaidDiagnostic[] }
  | { success: false; diagnostics: MermaidDiagnostic[] }

export type MermaidCompileResult =
  | {
      success: true
      document: JsonCanvasDocument
      scene: ResolvedCanvasScene
      parsed: ParsedMermaidDiagram
      diagnostics: MermaidDiagnostic[]
    }
  | { success: false; diagnostics: MermaidDiagnostic[] }

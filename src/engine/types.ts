import type { Point } from '../geometry'
import type { CanvasEdge, CanvasNode, JsonCanvasDocument } from '../types'

export type CanvasDiagnosticCode =
  | 'unsupported_default'
  | 'unknown_property'
  | 'invalid_property_value'
  | 'duplicate_id'
  | 'unknown_reference'
  | 'invalid_group_reference'
  | 'containment_cycle'

export interface CanvasDiagnostic {
  severity: 'warning' | 'error'
  code: CanvasDiagnosticCode
  message: string
  line?: number
  propertyPath?: string
  suggestion?: string
}

/** Derived geometry. It never changes the authored JSON Canvas document. */
export interface ResolvedNode<NodeExtra extends Record<string, unknown> = Record<string, unknown>> {
  id: string
  node: CanvasNode<NodeExtra>
  bounds: { x: number; y: number; width: number; height: number }
}

/** Generated points are intentionally separate from CanvasEdge.waypoints. */
export interface ResolvedEdge<EdgeExtra extends Record<string, unknown> = Record<string, unknown>> {
  id: string
  edge: CanvasEdge<EdgeExtra>
  /** Resolved route points. Generated points never become authored waypoints. */
  points: Point[]
  /** Shared SVG path data for both live rendering and export. */
  path: string
  /** Route-aware edge-label position. */
  labelPoint: Point
}

export interface ResolvedCanvasScene<NodeExtra extends Record<string, unknown> = Record<string, unknown>, EdgeExtra extends Record<string, unknown> = Record<string, unknown>> {
  document: JsonCanvasDocument<NodeExtra, EdgeExtra>
  /** Stable content fingerprint used to reject geometry from a stale document. */
  documentFingerprint: string
  nodes: ResolvedNode<NodeExtra>[]
  edges: ResolvedEdge<EdgeExtra>[]
  bounds: { x: number; y: number; width: number; height: number }
  diagnostics: CanvasDiagnostic[]
}

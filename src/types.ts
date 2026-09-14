import type { CSSProperties, ReactNode } from 'react'
import type { ResolvedCanvasScene } from './engine/types'

export type JsonCanvasSide = 'top' | 'right' | 'bottom' | 'left'
export type JsonCanvasEdgeEnd = 'none' | 'arrow'
export type JsonCanvasNodeType = 'text' | 'file' | 'link' | 'group' | 'image'

/**
 * The base JSON Canvas document shape. Extra properties are allowed by design so
 * host services can persist app-specific metadata alongside spec-compatible data.
 */
export interface JsonCanvasDocument<NodeExtra extends Record<string, unknown> = Record<string, unknown>, EdgeExtra extends Record<string, unknown> = Record<string, unknown>> {
  nodes: Array<CanvasNode<NodeExtra>>
  edges: Array<CanvasEdge<EdgeExtra>>
}

/**
 * MinuCanvas documents are JSON Canvas-compatible documents plus optional
 * MinuCanvas editing extensions on nodes and edges.
 */
export type MinuCanvasDocument<NodeExtra extends Record<string, unknown> = Record<string, unknown>, EdgeExtra extends Record<string, unknown> = Record<string, unknown>> = JsonCanvasDocument<NodeExtra, EdgeExtra>

export type CanvasDocumentKind = 'canvas' | 'mindmap' | (string & {})

export type CanvasShape =
  | 'text'
  | 'rectangle'
  | 'rounded-rectangle'
  | 'pill'
  | 'diamond'
  | 'ellipse'
  | 'parallelogram'
  | 'hexagon'

export type CanvasTool =
  | 'select'
  | 'hand'
  | 'arrow'
  | 'line'
  | 'text'
  | 'rectangle'
  | 'diamond'
  | 'ellipse'
  | 'pill'

export type CanvasEdgeRouting = 'straight' | 'curved' | 'elbow'
export type CanvasEdgeArrowMode = 'none' | 'end' | 'start' | 'both'
export type CanvasStrokeStyle = 'solid' | 'dashed' | 'dotted' | 'sketch'
export type CanvasThemeMode = 'light' | 'dark' | 'system'
export type CanvasShapeTheme = 'outline' | 'filled' | 'soft'
export type CanvasAlignment = 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom'
export type CanvasDistribution = 'horizontal' | 'vertical'

export interface CanvasNodeStyle {
  fill?: string
  stroke?: string
  text?: string
  strokeWidth?: number
  strokeStyle?: CanvasStrokeStyle
  borderRadius?: number
  opacity?: number
  fontFamily?: string
  fontSize?: number
  fontWeight?: CSSProperties['fontWeight']
  textAlign?: CSSProperties['textAlign']
}

export interface CanvasEdgeStyle {
  stroke?: string
  strokeWidth?: number
  strokeStyle?: CanvasStrokeStyle
  routing?: CanvasEdgeRouting
  opacity?: number
}

export interface CanvasEdgeAnchor {
  side: JsonCanvasSide
  /** 0..1 position along the chosen side. Defaults to 0.5, the side midpoint. */
  position?: number
}

export type CanvasNode<NodeExtra extends Record<string, unknown> = Record<string, unknown>> = NodeExtra & {
  id: string
  type: JsonCanvasNodeType
  x: number
  y: number
  width: number
  height: number
  color?: string
  text?: string
  file?: string
  url?: string
  label?: string
  background?: string
  shape?: CanvasShape
  style?: CanvasNodeStyle
  groupId?: string
  /** Frame-like group/container for visual organization and export regions. */
  frame?: boolean
  locked?: boolean
  imageWidth?: number
  imageHeight?: number
  imageStatus?: 'uploading' | 'failed'
  imageError?: string
}

export type CanvasEdge<EdgeExtra extends Record<string, unknown> = Record<string, unknown>> = EdgeExtra & {
  id: string
  fromNode: string
  /** Free-standing edge start point. When present with `toPoint`, the edge does not need to be connected to nodes. */
  fromPoint?: Point
  fromSide?: JsonCanvasSide
  fromAnchor?: CanvasEdgeAnchor
  fromEnd?: JsonCanvasEdgeEnd
  toNode: string
  /** Free-standing edge end point. When present with `fromPoint`, the edge does not need to be connected to nodes. */
  toPoint?: Point
  toSide?: JsonCanvasSide
  toAnchor?: CanvasEdgeAnchor
  toEnd?: JsonCanvasEdgeEnd
  label?: string
  color?: string
  style?: CanvasEdgeStyle
  /** Whether endpoint placement and route geometry should be recalculated when connected nodes move. */
  routingMode?: 'auto' | 'manual'
  /** Optional editable route points in canvas coordinates. */
  waypoints?: Point[]
}

export interface Point {
  x: number
  y: number
}

export interface CanvasViewport {
  x: number
  y: number
  zoom: number
}

export interface CanvasSelection {
  nodeIds: string[]
  edgeIds: string[]
}

/** Optional overrides for CanvasHandle.exportSvg(). */
export interface CanvasSvgExportOptions {
  area?: 'canvas' | 'selection'
  background?: 'transparent' | 'solid'
  colorMode?: 'light' | 'dark'
}

export type CanvasChangeReason =
  | 'create-node'
  | 'update-node'
  | 'update-edge'
  | 'move-node'
  | 'delete'
  | 'create-edge'
  | 'duplicate'
  | 'paste'
  | 'programmatic'

export type CanvasChangeSource = 'pointer' | 'keyboard' | 'api' | 'paste' | 'async'

export interface CanvasChangeContext {
  reason: CanvasChangeReason
  /** IDs added, removed, or replaced by this change. */
  nodeIds?: string[]
  /** IDs added, removed, or replaced by this change. */
  edgeIds?: string[]
  source?: CanvasChangeSource
  transactionId?: string
}

export interface CanvasShortcut {
  key: string
  description: string
  tool?: CanvasTool
}

export interface CanvasRenderNodeContext<NodeExtra extends Record<string, unknown> = Record<string, unknown>> {
  node: CanvasNode<NodeExtra>
  selected: boolean
  editing: boolean
}

export interface CanvasRenderEdgeContext<EdgeExtra extends Record<string, unknown> = Record<string, unknown>> {
  edge: CanvasEdge<EdgeExtra>
  selected: boolean
}

export interface CanvasContextAction {
  id: string
  label: string
  shortcut?: string
  disabled?: boolean
  danger?: boolean
  separatorBefore?: boolean
  onSelect: () => void
}

export interface CanvasHandle<NodeExtra extends Record<string, unknown> = Record<string, unknown>, EdgeExtra extends Record<string, unknown> = Record<string, unknown>> {
  getDocument: () => JsonCanvasDocument<NodeExtra, EdgeExtra>
  getSelection: () => CanvasSelection
  selectAll: () => void
  clearSelection: () => void
  deleteSelection: () => void
  setTool: (tool: CanvasTool) => void
  createNode: (partial: Partial<CanvasNode<NodeExtra>>) => CanvasNode<NodeExtra>
  createEdge: (fromNode: string, toNode: string, partial?: Partial<CanvasEdge<EdgeExtra>>) => CanvasEdge<EdgeExtra> | null
  updateNode: (nodeId: string, updater: (node: CanvasNode<NodeExtra>) => CanvasNode<NodeExtra>) => CanvasNode<NodeExtra> | null
  updateEdge: (edgeId: string, updater: (edge: CanvasEdge<EdgeExtra>) => CanvasEdge<EdgeExtra>) => CanvasEdge<EdgeExtra> | null
  resetEdgeRoute: (edgeId: string) => CanvasEdge<EdgeExtra> | null
  setSelection: (selection: CanvasSelection) => void
  groupSelection: () => CanvasNode<NodeExtra> | null
  frameSelection: () => CanvasNode<NodeExtra> | null
  ungroupSelection: () => void
  bringSelectionForward: () => void
  sendSelectionBackward: () => void
  bringSelectionToFront: () => void
  sendSelectionToBack: () => void
  alignSelection: (alignment: CanvasAlignment) => void
  distributeSelection: (distribution: CanvasDistribution) => void
  exportSvg: (options?: CanvasSvgExportOptions) => string
  exportPng: () => Promise<string>
  getViewport: () => CanvasViewport
  setViewport: (viewport: CanvasViewport) => void
  zoomIn: () => void
  zoomOut: () => void
  resetView: () => void
  fitView: () => void
}

export interface CanvasExternalContentWarning {
  code: 'missing-upload-handler' | 'inline-image-fallback' | 'unsupported-file'
  message: string
  file?: File
}

export type CanvasInteractionMode = 'canvas' | 'mindmap'

export interface CanvasDocumentProfile<Options = unknown, NodeExtra extends Record<string, unknown> = Record<string, unknown>, EdgeExtra extends Record<string, unknown> = Record<string, unknown>> {
  kind: CanvasDocumentKind
  label: string
  interactionMode?: CanvasInteractionMode
  toolbarTools?: CanvasTool[]
  createDefaultDocument?: (options?: Options) => MinuCanvasDocument<NodeExtra, EdgeExtra>
  layout?: (document: MinuCanvasDocument<NodeExtra, EdgeExtra>, options?: Options) => MinuCanvasDocument<NodeExtra, EdgeExtra>
}

export type AnyCanvasDocumentProfile = CanvasDocumentProfile<any, any, any>

export interface MinuCanvasProps<NodeExtra extends Record<string, unknown> = Record<string, unknown>, EdgeExtra extends Record<string, unknown> = Record<string, unknown>> {
  value: JsonCanvasDocument<NodeExtra, EdgeExtra>
  /** Experimental ephemeral geometry. It is ignored when it no longer matches value. */
  resolvedScene?: ResolvedCanvasScene<NodeExtra, EdgeExtra>
  onChange: (nextValue: JsonCanvasDocument<NodeExtra, EdgeExtra>, context: CanvasChangeContext) => void
  readOnly?: boolean
  className?: string
  autoFocus?: boolean
  minHeight?: number | string
  maxHeight?: number | string
  /** Canvas/surface theme. `theme` is kept as an alias for editor-package style usage. */
  canvasTheme?: CanvasThemeMode
  theme?: CanvasThemeMode
  /** Shape rendering theme, independent from the canvas surface theme. */
  shapeTheme?: CanvasShapeTheme
  tool?: CanvasTool
  defaultTool?: CanvasTool
  selectedNodeIds?: string[]
  selectedEdgeIds?: string[]
  onSelectionChange?: (selection: CanvasSelection) => void
  onToolChange?: (tool: CanvasTool) => void
  /** Controlled viewport. Pair with `onViewportChange` to synchronize or persist camera state. */
  viewport?: CanvasViewport
  initialViewport?: CanvasViewport
  /** Fit the current document into the visible canvas once after mount. */
  autoFit?: boolean
  onViewportChange?: (viewport: CanvasViewport) => void
  renderNode?: (context: CanvasRenderNodeContext<NodeExtra>) => ReactNode
  renderNodeAdornment?: (context: CanvasRenderNodeContext<NodeExtra>) => ReactNode
  renderEdgeLabel?: (context: CanvasRenderEdgeContext<EdgeExtra>) => ReactNode
  getNodeContextActions?: (context: {
    node: CanvasNode<NodeExtra>
    selection: CanvasSelection
    document: JsonCanvasDocument<NodeExtra, EdgeExtra>
  }) => CanvasContextAction[]
  getNodeDefaults?: (tool: CanvasTool, point: { x: number; y: number }) => Partial<CanvasNode<NodeExtra>>
  onUpload?: (file: File) => Promise<string>
  onResolveLink?: (url: string) => Promise<{ label?: string } | null>
  allowInlineImages?: boolean
  onExternalContentWarning?: (warning: CanvasExternalContentWarning) => void
  grid?: boolean
  snapToGrid?: boolean
  gridSize?: number
  shortcuts?: boolean
  /** Optional profile that can supply interaction/layout conventions such as mind maps. */
  documentProfile?: AnyCanvasDocumentProfile
  /** Keyboard behavior preset. `mindmap` uses Tab/Enter for branch creation. Overrides `documentProfile.interactionMode`. */
  interactionMode?: CanvasInteractionMode
}

// @dpklabs/minucanvas
// Public API — exported from here

export { CanvasToolbar } from './CanvasToolbar'
export { canvasDocumentFingerprint, filterResolvedCanvasScene, isResolvedCanvasSceneCurrent, resolveCanvasScene } from './engine/scene'
export { validateParsedMinuDiagram } from './engine/validate'
export { JSON_CANVAS_PRESET_COLORS, isJsonCanvasPresetColor, resolveCanvasColor } from './colors'
export type { CanvasColorMode, JsonCanvasPresetColor } from './colors'
export { CanvasStyleToolbar } from './CanvasStyleToolbar'
export { MinuCanvas } from './MinuCanvas'
export {
  createCanvasEdge,
  createCanvasNode,
  alignSelection,
  bringSelectionForward,
  bringSelectionToFront,
  createId,
  deleteSelection,
  distributeSelection,
  duplicateSelection,
  createDefaultCanvasDocument,
  emptyCanvas,
  frameSelection,
  groupSelection,
  nodeLabel,
  resetEdgeRoute,
  sendSelectionBackward,
  sendSelectionToBack,
  shapeForTool,
  snap,
  snapPoint,
  ungroupSelection,
  updateEdge,
  updateNode,
} from './model'
export {
  anchorForEdgeAnchor,
  anchorForSide,
  autoSidePair,
  canvasBounds,
  centerViewportForDocument,
  clientToCanvas,
  defaultEdgeAnchorForSide,
  defaultEdgeConnection,
  edgeAnchorForPoint,
  edgeLabelPoint,
  edgePath,
  edgeRoutePoints,
  edgeWaypointHandlePoint,
  moveOrthogonalRouteSegment,
  normalizeOrthogonalRoute,
  nodeCenter,
  sideForPoint,
} from './geometry'
export { createDefaultMindMapDocument, layoutMindMap } from './mindmap'
export {
  applyCanvasDocumentProfileLayout,
  builtInCanvasDocumentProfiles,
  getCanvasDocumentProfile,
  MIND_MAP_TOOLS,
  STANDARD_CANVAS_TOOLS,
  mindMapCanvasProfile,
  resolveCanvasInteractionMode,
  standardCanvasProfile,
  toolsForCanvasProfile,
} from './profiles'
export { defaultCanvasShortcuts, toolFromKey } from './shortcuts'
export { compileMinuDiagramSyntax, compileParsedMinuDiagram, parseMinuDiagramSyntax } from './syntax'
export type {
  MinuDiagramCompileOptions,
  MinuDiagramCompileResult,
  MinuDiagramConnection,
  MinuDiagramConnectionOperator,
  MinuDiagramDiagnostic,
  MinuDiagramDiagnosticCode,
  MinuDiagramDiagnosticSeverity,
  MinuDiagramDefault,
  MinuDiagramDirection,
  MinuDiagramGroup,
  MinuDiagramIdentity,
  MinuDiagramLayout,
  MinuDiagramNode,
  MinuDiagramParseOptions,
  ParsedMinuDiagram,
  SupportedMinuDiagramShape,
} from './syntax'
export type {
  AnyCanvasDocumentProfile,
  CanvasAlignment,
  CanvasChangeContext,
  CanvasChangeReason,
  CanvasChangeSource,
  CanvasContextAction,
  CanvasDistribution,
  CanvasDocumentKind,
  CanvasDocumentProfile,
  CanvasEdge,
  CanvasEdgeAnchor,
  CanvasEdgeArrowMode,
  CanvasEdgeRouting,
  CanvasEdgeStyle,
  CanvasExternalContentWarning,
  CanvasHandle,
  CanvasInteractionMode,
  CanvasNode,
  CanvasNodeStyle,
  CanvasRenderEdgeContext,
  CanvasRenderNodeContext,
  CanvasSelection,
  CanvasShape,
  CanvasShapeTheme,
  CanvasShortcut,
  CanvasSvgExportOptions,
  CanvasStrokeStyle,
  CanvasThemeMode,
  CanvasTool,
  CanvasViewport,
  JsonCanvasDocument,
  JsonCanvasEdgeEnd,
  JsonCanvasNodeType,
  JsonCanvasSide,
  MinuCanvasDocument,
  MinuCanvasProps,
} from './types'
export type { CanvasDiagnostic, CanvasDiagnosticCode, ResolvedCanvasScene, ResolvedEdge, ResolvedNode } from './engine/types'
export type { MindMapDefaultDocumentOptions, MindMapEdgeEnds, MindMapLayoutOptions, MindMapProfileOptions, MindMapSide } from './mindmap'
export type { CanvasToolbarProps } from './CanvasToolbar'
export type { CanvasStyleToolbarProps } from './CanvasStyleToolbar'

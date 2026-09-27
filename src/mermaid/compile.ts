import { compileParsedMinuDiagram } from '../syntax/compile'
import type { MinuDiagramCompileOptions, MinuDiagramDiagnostic, ParsedMinuDiagram } from '../syntax/types'
import { parseMermaidSyntax } from './parse'
import type { MermaidCompileOptions, MermaidCompileResult, MermaidDiagnostic, ParsedMermaidDiagram } from './types'

export async function compileMermaidSyntax(source: string, options: MermaidCompileOptions = {}): Promise<MermaidCompileResult> {
  const parsedResult = await parseMermaidSyntax(source, options)
  if (!parsedResult.success) return parsedResult

  const compileOptions: MinuDiagramCompileOptions = {}
  if (options.origin !== undefined) compileOptions.origin = options.origin
  if (options.nodeGap !== undefined) compileOptions.nodeGap = options.nodeGap
  if (options.rankGap !== undefined) compileOptions.rankGap = options.rankGap
  if (options.groupPadding !== undefined) compileOptions.groupPadding = options.groupPadding
  if (options.gridSize !== undefined) compileOptions.gridSize = options.gridSize

  const result = compileParsedMinuDiagram(asCompilerGraph(parsedResult.parsed), compileOptions)
  const compilerDiagnostics = result.diagnostics.map(asMermaidDiagnostic)
  if (compilerDiagnostics.some((diagnostic) => diagnostic.severity === 'error')) {
    return { success: false, diagnostics: compilerDiagnostics }
  }

  return {
    success: true,
    document: result.document,
    scene: result.scene,
    parsed: parsedResult.parsed,
    diagnostics: compilerDiagnostics,
  }
}

function asCompilerGraph(graph: ParsedMermaidDiagram): ParsedMinuDiagram {
  return {
    direction: graph.direction,
    nodes: graph.nodes.map((node) => ({
      id: node.id,
      label: node.label,
      shape: node.shape,
      ...(node.groupId ? { groupId: node.groupId } : {}),
    })),
    groups: graph.groups.map((group) => ({
      id: group.id,
      label: group.label,
      ...(group.parentGroupId ? { parentGroupId: group.parentGroupId } : {}),
    })),
    connections: graph.edges.map((edge) => ({
      from: edge.from,
      to: edge.to,
      operator: edge.arrow === 'both' ? '<>' : edge.arrow === 'forward' ? '>' : '-',
      ...(edge.label ? { label: edge.label } : {}),
      ...(edge.stroke === 'dotted' ? { style: { strokeStyle: 'dotted' as const } } : {}),
    })),
    defaults: {},
    diagnostics: [],
  }
}

function asMermaidDiagnostic(diagnostic: MinuDiagramDiagnostic): MermaidDiagnostic {
  return {
    severity: diagnostic.severity,
    code: 'invalid_graph',
    message: diagnostic.message,
    ...(diagnostic.line === undefined ? {} : { line: diagnostic.line }),
    ...(diagnostic.column === undefined ? {} : { column: diagnostic.column }),
    ...(diagnostic.suggestion === undefined ? {} : { suggestion: diagnostic.suggestion }),
  }
}

import { compileMinuDiagramSyntax } from '../syntax/compile'
import type { MinuDiagramCompileOptions } from '../syntax/types'
import { compileMermaidSyntax } from './compile'
import type {
  CompileDiagramSyntaxOptions,
  DiagramSyntaxCompileResult,
  DiagramSyntaxDiagnostic,
} from './types'
import { DEFAULT_DIAGRAM_RESOURCE_LIMITS } from './limits'
import type { MermaidCompileOptions } from './types'

/**
 * Compiles either Mermaid flowchart or Minu diagram syntax to native canvas data.
 * Auto mode recognizes complete Mermaid header lines, not merely a `graph` or
 * `flowchart` prefix. Other inputs are validated as Minu first, preserving
 * legacy connections such as `graph > End` and `flowchart > End`.
 */
export async function compileDiagramSyntax(
  source: string,
  options: CompileDiagramSyntaxOptions = {},
): Promise<DiagramSyntaxCompileResult> {
  if (options.format === 'mermaid') return compileMermaid(source, options)
  if (options.format === 'minu') return compileMinu(source, options, options.strict)
  if (hasMermaidFlowchartHeader(source)) return compileMermaid(source, options)

  return compileMinu(source, options, options.strict ?? true)
}

async function compileMermaid(source: string, options: CompileDiagramSyntaxOptions): Promise<DiagramSyntaxCompileResult> {
  try {
    const result = await compileMermaidSyntax(source, mermaidOptions(options))
    return result.success
      ? { ...result, success: true, format: 'mermaid' }
      : { ...result, success: false, format: 'mermaid' }
  } catch (error) {
    return {
      success: false,
      format: 'mermaid',
      diagnostics: [{
        severity: 'error',
        code: 'parser_contract',
        message: `Mermaid compilation failed: ${errorMessage(error)}`,
      }],
    }
  }
}

function compileMinu(
  source: string,
  options: CompileDiagramSyntaxOptions,
  strict: boolean | undefined,
): DiagramSyntaxCompileResult {
  try {
    const result = compileMinuDiagramSyntax(source, minuOptions(options, strict))
    const diagnostics: DiagramSyntaxDiagnostic[] = [...result.diagnostics]
    if (hasErrors(diagnostics)) return { success: false, format: 'minu', diagnostics }
    if (!hasCanvasContent(result.document)) {
      diagnostics.push({
        severity: 'error',
        code: 'unsupported_statement',
        message: 'Diagram source must define at least one node or group.',
      })
      return { success: false, format: 'minu', diagnostics }
    }
    return {
      success: true,
      format: 'minu',
      document: result.document,
      scene: result.scene,
      parsed: result.parsed,
      diagnostics,
    }
  } catch (error) {
    return {
      success: false,
      format: 'minu',
      diagnostics: [{ severity: 'error', message: `Minu compilation failed: ${errorMessage(error)}` }],
    }
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unexpected compiler error.'
}

function hasErrors(diagnostics: readonly DiagramSyntaxDiagnostic[]): boolean {
  return diagnostics.some((diagnostic) => diagnostic.severity === 'error')
}

function hasCanvasContent(document: { nodes: unknown[]; edges: unknown[] }): boolean {
  return document.nodes.length > 0 || document.edges.length > 0
}

function hasMermaidFlowchartHeader(source: string): boolean {
  const firstLine = source.split(/\r?\n/).find((line) => {
    const trimmed = line.trim()
    return trimmed.length > 0 && !trimmed.startsWith('%%')
  })?.trim() ?? ''
  return /^(?:flowchart|graph)(?:\s+(?:TB|TD|BT|LR|RL))?(?:\s*;.*)?$/i.test(firstLine)
}

function minuOptions(options: CompileDiagramSyntaxOptions, strict: boolean | undefined): MinuDiagramCompileOptions {
  const result: MinuDiagramCompileOptions = {}
  if (strict !== undefined) result.strict = strict
  if (options.origin !== undefined) result.origin = options.origin
  if (options.nodeGap !== undefined) result.nodeGap = options.nodeGap
  if (options.rankGap !== undefined) result.rankGap = options.rankGap
  if (options.groupPadding !== undefined) result.groupPadding = options.groupPadding
  if (options.gridSize !== undefined) result.gridSize = options.gridSize
  if (options.layout !== undefined) result.layout = options.layout
  if (options.mindMap !== undefined) result.mindMap = options.mindMap
  result.maxSourceLength = options.maxSourceLength ?? DEFAULT_DIAGRAM_RESOURCE_LIMITS.maxSourceLength
  result.maxNodes = options.maxNodes ?? DEFAULT_DIAGRAM_RESOURCE_LIMITS.maxNodes
  result.maxEdges = options.maxEdges ?? DEFAULT_DIAGRAM_RESOURCE_LIMITS.maxEdges
  result.maxNesting = options.maxNesting ?? DEFAULT_DIAGRAM_RESOURCE_LIMITS.maxNesting
  return result
}

function mermaidOptions(options: CompileDiagramSyntaxOptions): MermaidCompileOptions {
  const result: MermaidCompileOptions = {}
  if (options.origin !== undefined) result.origin = options.origin
  if (options.nodeGap !== undefined) result.nodeGap = options.nodeGap
  if (options.rankGap !== undefined) result.rankGap = options.rankGap
  if (options.groupPadding !== undefined) result.groupPadding = options.groupPadding
  if (options.gridSize !== undefined) result.gridSize = options.gridSize
  if (options.maxSourceLength !== undefined) result.maxSourceLength = options.maxSourceLength
  if (options.maxNodes !== undefined) result.maxNodes = options.maxNodes
  if (options.maxEdges !== undefined) result.maxEdges = options.maxEdges
  if (options.maxNesting !== undefined) result.maxNesting = options.maxNesting
  return result
}

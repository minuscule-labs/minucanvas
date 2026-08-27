import type { CanvasEdgeRouting, CanvasEdgeStyle, CanvasNodeStyle, CanvasStrokeStyle } from '../types'
import type { MinuDiagramConnectionOperator, MinuDiagramDiagnostic, MinuDiagramGroup, MinuDiagramNode, MinuDiagramParseOptions, ParsedMinuDiagram } from './types'

const CONNECTION_OPERATORS: MinuDiagramConnectionOperator[] = ['-->', '<>', '--', '>', '<', '-']
const EDGE_ROUTINGS = ['elbow', 'straight', 'curved'] as const
const EDGE_STROKE_STYLES = ['solid', 'dashed', 'dotted', 'sketch'] as const
const DIAGNOSTIC_SOURCE_LIMIT = 240

interface ParseLine {
  text: string
  line: number
}

function stripComment(line: string): string {
  let quoted = false
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i]
    if (char === '"' && line[i - 1] !== '\\') quoted = !quoted
    if (!quoted && char === '/' && line[i + 1] === '/') return line.slice(0, i)
    if (!quoted && char === '#') return line.slice(0, i)
  }
  return line
}

function unquote(value: string): string {
  const trimmed = value.trim()
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) return trimmed.slice(1, -1).replace(/\\"/g, '"')
  return trimmed
}

function splitTopLevel(value: string, separator: string): string[] {
  const parts: string[] = []
  let current = ''
  let quoted = false
  let bracketDepth = 0
  for (let i = 0; i < value.length; i += 1) {
    const char = value[i]
    if (char === '"' && value[i - 1] !== '\\') quoted = !quoted
    if (!quoted && char === '[') bracketDepth += 1
    if (!quoted && char === ']') bracketDepth = Math.max(0, bracketDepth - 1)
    if (!quoted && bracketDepth === 0 && char === separator) {
      parts.push(current.trim())
      current = ''
    } else {
      current += char
    }
  }
  if (current.trim()) parts.push(current.trim())
  return parts
}

function parseProperties(source: string): Record<string, string> {
  const props: Record<string, string> = {}
  const body = source.trim().replace(/^\[/, '').replace(/\]$/, '')
  for (const part of splitTopLevel(body, ',')) {
    const index = part.indexOf(':')
    if (index === -1) continue
    const key = part.slice(0, index).trim()
    const value = unquote(part.slice(index + 1).trim())
    if (key) props[key] = value
  }
  return props
}

function readTrailingProperties(text: string): { text: string; props: Record<string, string> } {
  const trimmed = text.trim()
  if (!trimmed.endsWith(']')) return { text: trimmed, props: {} }
  let quoted = false
  let depth = 0
  for (let i = trimmed.length - 1; i >= 0; i -= 1) {
    const char = trimmed[i]
    if (char === '"' && trimmed[i - 1] !== '\\') quoted = !quoted
    if (!quoted && char === ']') depth += 1
    if (!quoted && char === '[') {
      depth -= 1
      if (depth === 0) {
        return { text: trimmed.slice(0, i).trim(), props: parseProperties(trimmed.slice(i)) }
      }
    }
  }
  return { text: trimmed, props: {} }
}

function findTopLevelColon(text: string): number {
  let quoted = false
  let bracketDepth = 0
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]
    if (char === '"' && text[i - 1] !== '\\') quoted = !quoted
    if (!quoted && char === '[') bracketDepth += 1
    if (!quoted && char === ']') bracketDepth = Math.max(0, bracketDepth - 1)
    if (!quoted && bracketDepth === 0 && char === ':') return i
  }
  return -1
}

function findConnectionOperator(text: string): MinuDiagramConnectionOperator | null {
  let quoted = false
  let bracketDepth = 0
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]
    if (char === '"' && text[i - 1] !== '\\') quoted = !quoted
    if (!quoted && char === '[') bracketDepth += 1
    if (!quoted && char === ']') bracketDepth = Math.max(0, bracketDepth - 1)
    if (quoted || bracketDepth > 0) continue
    for (const op of CONNECTION_OPERATORS) {
      if (text.slice(i, i + op.length) === op) return op
    }
  }
  return null
}

function splitConnectionTokens(text: string): Array<string | MinuDiagramConnectionOperator> {
  const tokens: Array<string | MinuDiagramConnectionOperator> = []
  let current = ''
  let quoted = false
  let bracketDepth = 0
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]
    if (char === '"' && text[i - 1] !== '\\') quoted = !quoted
    if (!quoted && char === '[') bracketDepth += 1
    if (!quoted && char === ']') bracketDepth = Math.max(0, bracketDepth - 1)
    if (!quoted && bracketDepth === 0) {
      const op = CONNECTION_OPERATORS.find((candidate) => text.slice(i, i + candidate.length) === candidate)
      if (op) {
        if (current.trim()) tokens.push(current.trim())
        tokens.push(op)
        current = ''
        i += op.length - 1
        continue
      }
    }
    current += char
  }
  if (current.trim()) tokens.push(current.trim())
  return tokens
}

function findUnsupportedOperator(text: string): { operator: string; column: number } | null {
  let quoted = false
  let bracketDepth = 0
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]
    if (char === '"' && text[i - 1] !== '\\') quoted = !quoted
    if (!quoted && char === '[') bracketDepth += 1
    if (!quoted && char === ']') bracketDepth = Math.max(0, bracketDepth - 1)
    if (quoted || bracketDepth > 0) continue
    if (text.slice(i, i + 3) === '-->') {
      i += 2
      continue
    }
    if (text.slice(i, i + 2) === '->') return { operator: '->', column: i + 1 }
  }
  return null
}

function delimiterError(text: string): string | null {
  let quoted = false
  let bracketDepth = 0
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]
    if (char === '"' && text[i - 1] !== '\\') quoted = !quoted
    if (quoted) continue
    if (char === '[') {
      bracketDepth += 1
      if (bracketDepth > 1) return 'Nested property brackets are not supported.'
    }
    if (char === ']') {
      bracketDepth -= 1
      if (bracketDepth < 0) return 'Unexpected closing property bracket.'
    }
  }
  if (quoted) return 'Unterminated quoted string.'
  if (bracketDepth > 0) return 'Unclosed property bracket.'
  return null
}

function findTopLevelOpeningBracket(text: string): number {
  let quoted = false
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]
    if (char === '"' && text[i - 1] !== '\\') quoted = !quoted
    if (!quoted && char === '[') return i
  }
  return -1
}

function propertyError(text: string): string | null {
  const bracketIndex = findTopLevelOpeningBracket(text)
  if (bracketIndex === -1) return null
  if (!text.trim().endsWith(']')) return 'Property blocks must appear at the end of a statement.'
  const trimmedEnd = text.trimEnd().length - 1
  let quoted = false
  for (let i = bracketIndex + 1; i <= trimmedEnd; i += 1) {
    if (text[i] === '"' && text[i - 1] !== '\\') quoted = !quoted
    if (!quoted && text[i] === ']' && i !== trimmedEnd) return 'Only one trailing property block is allowed.'
  }
  const body = text.slice(bracketIndex + 1, trimmedEnd)
  if (!body.trim()) return 'Property blocks cannot be empty.'
  if (body.trimEnd().endsWith(',')) return 'Property blocks cannot end with a comma.'
  for (const part of splitTopLevel(body, ',')) {
    const index = part.indexOf(':')
    if (index <= 0 || !part.slice(index + 1).trim()) return `Invalid property "${part}". Expected key: value.`
  }
  return null
}

function isQuoted(value: string): boolean {
  const trimmed = value.trim()
  return trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"')
}

function hasAmbiguousBareId(value: string): boolean {
  return splitTopLevel(value, ',').some((part) => !isQuoted(part) && /\s/.test(part.trim()))
}

function explicitDeclarationSuggestion(text: string): string {
  const match = text.match(/^node\s+([^\s"]+)\s+"([^"]+)"(?:\s+shape\s+([^\s]+))?$/i)
  if (!match) return 'Use canonical syntax: Id [label: "Display label", shape: card]'
  const shape = match[3] ? `, shape: ${match[3]}` : ''
  return `Use: ${match[1]} [label: "${match[2]}"${shape}]`
}

function diagnostic(entry: ParseLine, code: MinuDiagramDiagnostic['code'], message: string, suggestion?: string, column?: number): MinuDiagramDiagnostic {
  return {
    severity: 'error',
    code,
    message,
    line: entry.line,
    column,
    source: entry.text.slice(0, DIAGNOSTIC_SOURCE_LIMIT).replace(/[\u0000-\u001f\u007f]/g, '?'),
    suggestion,
  }
}

function propsToNode(id: string, props: Record<string, string>, groupId: string | undefined, line: number): MinuDiagramNode {
  const style = styleFromProps(props)
  return {
    id,
    label: props.label,
    type: props.type as MinuDiagramNode['type'] | undefined,
    shape: props.shape,
    url: props.url,
    file: props.file,
    width: numberProp(props.width),
    height: numberProp(props.height),
    color: props.color,
    style,
    groupId,
    line,
  }
}

function styleFromProps(props: Record<string, string>): CanvasNodeStyle | undefined {
  const style: CanvasNodeStyle = {}
  if (props.fill) style.fill = props.fill
  if (props.stroke) style.stroke = props.stroke
  if (props.text) style.text = props.text
  if (props.strokeWidth) style.strokeWidth = Number(props.strokeWidth)
  if (props.style) style.strokeStyle = props.style as CanvasStrokeStyle
  return Object.keys(style).length ? style : undefined
}

function numberProp(value: string | undefined): number | undefined {
  if (!value) return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

function normalizeLines(source: string): ParseLine[] {
  return source.split(/\r?\n/).map((line, index) => ({ text: stripComment(line).trim(), line: index + 1 })).filter((line) => line.text.length > 0)
}

export function parseMinuDiagramSyntax(source: string, options: MinuDiagramParseOptions = {}): ParsedMinuDiagram {
  const diagnostics: MinuDiagramDiagnostic[] = []
  const nodes = new Map<string, MinuDiagramNode>()
  const groups = new Map<string, MinuDiagramGroup>()
  const connections: ParsedMinuDiagram['connections'] = []
  const groupStack: Array<{ id: string; entry: ParseLine }> = []
  const defaults: ParsedMinuDiagram['defaults'] = {}
  let diagramEntry: ParseLine | undefined
  let title: string | undefined
  let direction: ParsedMinuDiagram['direction'] = 'down'
  let layout: ParsedMinuDiagram['layout']
  const currentGroupId = () => groupStack.at(-1)?.id

  for (const entry of normalizeLines(source)) {
    let text = entry.text
    const unsupportedOperator = findUnsupportedOperator(text)
    if (unsupportedOperator) {
      diagnostics.push(diagnostic(
        entry,
        'unsupported_operator',
        `Unsupported connection operator "${unsupportedOperator.operator}".`,
        'Use ">" for a directed connection, for example: A > B',
        unsupportedOperator.column,
      ))
      continue
    }

    if (options.strict) {
      const delimiter = delimiterError(text)
      if (delimiter) {
        diagnostics.push(diagnostic(entry, 'invalid_properties', delimiter, 'Use a balanced quoted string and a trailing [key: value] property block.'))
        continue
      }
    }

    const diagramMatch = text.match(/^diagram\s+(?:"([^"]+)"|([^\s{]+))\s*(\{)?$/i)
    if (diagramMatch) {
      if (options.strict && diagramEntry) {
        diagnostics.push(diagnostic(entry, 'unsupported_statement', 'Nested or repeated diagram declarations are not supported.'))
        continue
      }
      title = diagramMatch[1] ?? diagramMatch[2]
      if (diagramMatch[3]) diagramEntry = entry
      continue
    }
    if (text === '}') {
      if (groupStack.length > 0) groupStack.pop()
      else if (diagramEntry) diagramEntry = undefined
      else if (options.strict) diagnostics.push(diagnostic(entry, 'unmatched_group', 'Unmatched closing brace.', 'Remove the brace or add a matching group declaration.'))
      continue
    }

    const directionMatch = text.match(/^direction\s+(down|up|right|left)$/i)
    if (directionMatch) {
      direction = directionMatch[1].toLowerCase() as ParsedMinuDiagram['direction']
      continue
    }

    const layoutMatch = text.match(/^layout\s+(flow|mindmap)$/i)
    if (layoutMatch) {
      layout = layoutMatch[1].toLowerCase() as ParsedMinuDiagram['layout']
      continue
    }

    const defaultMatch = text.match(/^(colorMode|styleMode|typeface)\s+(.+)$/)
    if (defaultMatch) {
      defaults[defaultMatch[1] as keyof typeof defaults] = unquote(defaultMatch[2])
      continue
    }

    if (options.strict && /^(diagram|direction|layout|colorMode|styleMode|typeface)(?:\s|$)/i.test(text)) {
      diagnostics.push(diagnostic(entry, 'invalid_directive', 'Invalid diagram directive or value.', 'Use a documented directive value, such as "direction right" or "layout flow".'))
      continue
    }

    if (options.strict && /^(node|edge|group)(?:\s|$)/i.test(text)) {
      diagnostics.push(diagnostic(
        entry,
        'unsupported_statement',
        'Unsupported explicit declaration.',
        text.toLowerCase().startsWith('node ') ? explicitDeclarationSuggestion(text) : 'Use canonical node, group, or connection syntax.',
      ))
      continue
    }

    if (text.endsWith('{')) {
      text = text.slice(0, -1).trim()
      if (options.strict) {
        const properties = propertyError(text)
        if (properties) {
          diagnostics.push(diagnostic(entry, 'invalid_properties', properties))
          continue
        }
      }
      const { text: groupNameSource, props } = readTrailingProperties(text)
      const id = unquote(groupNameSource)
      if (!id) {
        diagnostics.push(diagnostic(entry, 'unmatched_group', 'Group name is required.', 'Use: GroupName {'))
        continue
      }
      if (options.strict && hasAmbiguousBareId(groupNameSource)) {
        diagnostics.push(diagnostic(entry, 'unsupported_statement', 'Unquoted multiword group IDs are ambiguous.', 'Quote the group ID or use a single bare ID with a label property.'))
        continue
      }
      groups.set(id, { id, label: props.label, color: props.color, style: styleFromProps(props), parentGroupId: currentGroupId(), line: entry.line })
      groupStack.push({ id, entry })
      continue
    }

    if (findConnectionOperator(text)) {
      if (options.strict) {
        const properties = propertyError(text)
        if (properties) {
          diagnostics.push(diagnostic(entry, 'invalid_properties', properties))
          continue
        }
      }
      const { text: withoutProps, props } = readTrailingProperties(text)
      const colonIndex = findTopLevelColon(withoutProps)
      const expression = colonIndex === -1 ? withoutProps : withoutProps.slice(0, colonIndex).trim()
      const labelSource = colonIndex === -1 ? undefined : withoutProps.slice(colonIndex + 1).trim()
      const label = labelSource === undefined ? undefined : unquote(labelSource)
      const tokens = splitConnectionTokens(expression)
      const malformed = tokens.length < 3 || tokens.length % 2 === 0
        || tokens.some((token, index) => index % 2 === 0 ? CONNECTION_OPERATORS.includes(token as MinuDiagramConnectionOperator) : !CONNECTION_OPERATORS.includes(token as MinuDiagramConnectionOperator))
      const ambiguousOperand = tokens.some((token, index) => index % 2 === 0 && hasAmbiguousBareId(token))
      if (options.strict && (malformed || ambiguousOperand || labelSource === '')) {
        diagnostics.push(diagnostic(
          entry,
          'malformed_connection',
          ambiguousOperand ? 'Unquoted multiword connection IDs are ambiguous.' : 'Malformed connection statement.',
          'Use complete canonical connections, for example: A > B or "Node A" > B.',
        ))
        continue
      }
      if (malformed) continue
      const edgeStyle = edgeStyleFromProps(props, diagnostics, entry.line)
      for (let i = 0; i < tokens.length - 2; i += 2) {
        const leftIds = splitTopLevel(tokens[i], ',').map(unquote)
        const op = tokens[i + 1] as MinuDiagramConnectionOperator
        const rightIds = splitTopLevel(tokens[i + 2], ',').map(unquote)
        for (const from of leftIds) {
          for (const to of rightIds) {
            connections.push({ from, to, operator: op, label, color: props.color, style: edgeStyle, line: entry.line })
            ensureNode(nodes, from, currentGroupId(), entry.line)
            ensureNode(nodes, to, currentGroupId(), entry.line)
          }
        }
      }
      continue
    }

    if (options.strict) {
      const properties = propertyError(text)
      if (properties) {
        diagnostics.push(diagnostic(entry, 'invalid_properties', properties))
        continue
      }
    }
    const { text: idSource, props } = readTrailingProperties(text)
    if (options.strict && hasAmbiguousBareId(idSource)) {
      diagnostics.push(diagnostic(
        entry,
        'unsupported_statement',
        'Unquoted multiword node IDs are ambiguous.',
        'Quote the ID or use a single bare ID with properties, for example: upload [label: "Bulk feed upload"].',
      ))
      continue
    }
    for (const idPart of splitTopLevel(idSource, ',')) {
      const id = unquote(idPart)
      if (!id) continue
      nodes.set(id, { ...ensureNode(nodes, id, currentGroupId(), entry.line), ...propsToNode(id, props, currentGroupId(), entry.line) })
    }
  }

  if (options.strict) {
    for (const group of groupStack) {
      diagnostics.push(diagnostic(group.entry, 'unmatched_group', `Group "${group.id}" is missing a closing brace.`, 'Add a closing "}" after the group contents.'))
      groups.delete(group.id)
    }
    if (diagramEntry) diagnostics.push(diagnostic(diagramEntry, 'unmatched_group', 'Diagram block is missing a closing brace.', 'Add a closing "}" after the diagram contents.'))
  }

  return { title, direction, layout, nodes: [...nodes.values()], groups: [...groups.values()], connections, defaults, diagnostics }
}

function edgeStyleFromProps(props: Record<string, string>, diagnostics: MinuDiagramDiagnostic[], line: number): CanvasEdgeStyle | undefined {
  const style: CanvasEdgeStyle = {}
  if (props.color) style.stroke = props.color
  if (props.stroke) style.stroke = props.stroke
  if (props.strokeWidth) style.strokeWidth = Number(props.strokeWidth)
  if (props.style) {
    if (EDGE_STROKE_STYLES.includes(props.style as CanvasStrokeStyle)) style.strokeStyle = props.style as CanvasStrokeStyle
    else diagnostics.push({ severity: 'warning', message: `Unsupported edge style "${props.style}". Expected solid, dashed, dotted, or sketch.`, line })
  }
  const routing = props.routing ?? props.route ?? props.lineType
  if (routing) {
    if (EDGE_ROUTINGS.includes(routing as CanvasEdgeRouting)) style.routing = routing as CanvasEdgeRouting
    else diagnostics.push({ severity: 'warning', message: `Unsupported edge routing "${routing}". Expected elbow, straight, or curved.`, line })
  }
  return Object.keys(style).length ? style : undefined
}

function ensureNode(nodes: Map<string, MinuDiagramNode>, id: string, groupId: string | undefined, line: number): MinuDiagramNode {
  const existing = nodes.get(id)
  if (existing) return existing
  const node: MinuDiagramNode = { id, groupId, line }
  nodes.set(id, node)
  return node
}

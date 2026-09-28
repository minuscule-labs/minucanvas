import { describe, expect, it } from 'vitest'
import { compileMinuDiagramSyntax, compileParsedMinuDiagram, parseMinuDiagramSyntax } from './index'
import type { ParsedMinuDiagram } from './types'
import { resolveCanvasScene } from '../engine/scene'

describe('parseMinuDiagramSyntax', () => {
  it('parses nodes, direction, labels, chains, and edge properties', () => {
    const parsed = parseMinuDiagramSyntax(`
      diagram "Auth flow" {
        direction right
        User [shape: pill]
        Valid [shape: diamond, label: "Valid?"]
        User > Login > Valid
        Valid > Done: yes [style: dashed, color: green]
      }
    `)

    expect(parsed.title).toBe('Auth flow')
    expect(parsed.direction).toBe('right')
    expect(parsed.nodes.map((node) => node.id)).toContain('Login')
    expect(parsed.nodes.find((node) => node.id === 'Valid')?.label).toBe('Valid?')
    expect(parsed.connections).toHaveLength(3)
    expect(parsed.connections[2]).toMatchObject({ from: 'Valid', to: 'Done', label: 'yes', color: 'green' })
  })

  it('parses layout directives', () => {
    const parsed = parseMinuDiagramSyntax(`
      diagram "Plan" {
        layout mindmap
        Root > A
      }
    `)

    expect(parsed.layout).toBe('mindmap')
  })

  it('warns once per currently unsupported diagram default while continuing compilation', () => {
    const result = compileMinuDiagramSyntax(`
      colorMode outline
      styleMode plain
      typeface clean
      A > B
    `)
    const warnings = result.diagnostics.filter((diagnostic) => diagnostic.code === 'unsupported_default')

    expect(result.document.nodes).toHaveLength(2)
    expect(warnings.map((diagnostic) => diagnostic.propertyPath)).toEqual(['colorMode', 'styleMode', 'typeface'])
    expect(warnings.map((diagnostic) => diagnostic.line)).toEqual([2, 3, 4])
    expect(result.scene.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(['unsupported_default', 'unsupported_default', 'unsupported_default'])
  })

  it('parses groups and assigns child group IDs', () => {
    const parsed = parseMinuDiagramSyntax(`
      Backend [label: "Backend services"] {
        API
        DB
      }
    `)

    expect(parsed.groups[0]).toMatchObject({ id: 'Backend', label: 'Backend services' })
    expect(parsed.nodes.find((node) => node.id === 'API')?.groupId).toBe('Backend')
  })

  it('rejects unsupported compound operators atomically in both modes', () => {
    for (const strict of [false, true]) {
      const parsed = parseMinuDiagramSyntax('A -> B', { strict })

      expect(parsed.diagnostics).toEqual([
        expect.objectContaining({
          severity: 'error',
          code: 'unsupported_operator',
          line: 1,
          column: 3,
          source: 'A -> B',
        }),
      ])
      expect(parsed.nodes).toEqual([])
      expect(parsed.connections).toEqual([])
    }
  })

  it('rejects unsupported declarations in strict mode without adding nodes', () => {
    const parsed = parseMinuDiagramSyntax('node upload "Bulk feed upload" shape card', { strict: true })

    expect(parsed.diagnostics[0]).toMatchObject({
      severity: 'error',
      code: 'unsupported_statement',
      line: 1,
      source: 'node upload "Bulk feed upload" shape card',
    })
    expect(parsed.diagnostics[0]?.suggestion).toContain('upload [label:')
    expect(parsed.nodes).toEqual([])
  })

  it('collects independent strict diagnostics while preserving valid lines', () => {
    const parsed = parseMinuDiagramSyntax(`Valid > Done
node upload "Bulk feed upload" shape card
Bad -> Worse
direction sideways`, { strict: true })

    expect(parsed.diagnostics.map((item) => item.code)).toEqual([
      'unsupported_statement',
      'unsupported_operator',
      'invalid_directive',
    ])
    expect(parsed.nodes.map((node) => node.id)).toEqual(['Valid', 'Done'])
    expect(parsed.connections).toHaveLength(1)
  })

  it('rejects empty connection operands in both strict and permissive modes', () => {
    for (const strict of [false, true]) {
      for (const source of ['A > ,', ', > B']) {
        const parsed = parseMinuDiagramSyntax(source, { strict })
        expect(parsed.diagnostics).toContainEqual(expect.objectContaining({ code: 'malformed_connection', line: 1 }))
        expect(parsed.connections).toEqual([])
        expect(parsed.nodes).toEqual([])
      }
    }
  })

  it('enforces optional source, graph, edge, and nesting limits while parsing', () => {
    const sourceLimit = parseMinuDiagramSyntax('A > B', { maxSourceLength: 2 })
    const nodeLimit = parseMinuDiagramSyntax('A,B > C,D', { maxNodes: 2 })
    const edgeLimit = parseMinuDiagramSyntax('A,B > C,D', { maxEdges: 2 })
    const nestingLimit = parseMinuDiagramSyntax('Outer {\nInner {\nA\n}\n}', { maxNesting: 1 })

    expect(sourceLimit.diagnostics[0]).toMatchObject({ code: 'resource_limit' })
    expect(sourceLimit.nodes).toEqual([])
    expect(nodeLimit.diagnostics).toContainEqual(expect.objectContaining({ code: 'resource_limit' }))
    expect(nodeLimit.nodes.length).toBeLessThanOrEqual(2)
    expect(edgeLimit.diagnostics).toContainEqual(expect.objectContaining({ code: 'resource_limit' }))
    expect(edgeLimit.connections).toHaveLength(2)
    expect(nestingLimit.diagnostics).toContainEqual(expect.objectContaining({ code: 'resource_limit' }))
  })

  it('rejects malformed strict statements without adding their artifacts', () => {
    const cases = [
      ['A >', 'malformed_connection'],
      ['A > > B', 'malformed_connection'],
      ['A > ,', 'malformed_connection'],
      [', > B', 'malformed_connection'],
      ['Unquoted node name', 'unsupported_statement'],
      ['A [shape card]', 'invalid_properties'],
      ['A [shape: card', 'invalid_properties'],
      ['A [shape: card,]', 'invalid_properties'],
      ['A [label: [nested]]', 'invalid_properties'],
      ['A [shape: card] [color: blue]', 'invalid_properties'],
      ['}', 'unmatched_group'],
    ] as const

    for (const [source, code] of cases) {
      const parsed = parseMinuDiagramSyntax(source, { strict: true })
      expect(parsed.diagnostics[0]?.code, source).toBe(code)
      expect(parsed.nodes, source).toEqual([])
      expect(parsed.groups, source).toEqual([])
      expect(parsed.connections, source).toEqual([])
    }
  })

  it('reports unclosed groups and removes the incomplete group artifact', () => {
    const parsed = parseMinuDiagramSyntax('Backend {\nAPI', { strict: true })

    expect(parsed.diagnostics).toContainEqual(expect.objectContaining({ code: 'unmatched_group', line: 1 }))
    expect(parsed.groups).toEqual([])
  })

  it('keeps operators in quotes, properties, URLs, and comments out of validation', () => {
    const parsed = parseMinuDiagramSyntax(`
      "A -> label" [url: "https://example.com/a->b"]
      A > B: "shows -> text"
      C > D // ignored -> operator
    `, { strict: true })

    expect(parsed.diagnostics).toEqual([])
    expect(parsed.nodes.map((node) => node.id)).toContain('A -> label')
    expect(parsed.connections).toHaveLength(2)
  })

  it('accepts canonical diagrams, groups, chains, and supported operators in strict mode', () => {
    const parsed = parseMinuDiagramSyntax(`
      diagram "Strict flow" {
        direction right
        Backend [label: "Backend services"] {
          "API service" [shape: card]
          DB
          "API service" > DB --> Archive
        }
      }
    `, { strict: true })

    expect(parsed.diagnostics).toEqual([])
    expect(parsed.groups).toHaveLength(1)
    expect(parsed.nodes).toHaveLength(3)
    expect(parsed.connections).toHaveLength(2)
  })
})

describe('compileMinuDiagramSyntax', () => {
  it('forwards strict mode to the parser', () => {
    const result = compileMinuDiagramSyntax('node upload "Bulk feed upload" shape card', { strict: true })

    expect(result.diagnostics[0]?.code).toBe('unsupported_statement')
    expect(result.document.nodes).toEqual([])
  })

  it('compiles flow syntax to MinuCanvas JSON', () => {
    const result = compileMinuDiagramSyntax(`
      direction right
      Start [shape: pill]
      Valid [shape: diamond, label: "Valid?"]
      Start > Valid: check
    `)

    expect(result.document.nodes).toHaveLength(2)
    expect(result.document.nodes.find((node) => node.id === 'Valid')?.shape).toBe('diamond')
    expect(result.document.edges[0]).toMatchObject({ fromNode: 'Start', toNode: 'Valid', label: 'check', toEnd: 'arrow' })
    expect(result.document.edges[0].toAnchor).toMatchObject({ side: 'left', position: 0 })
    expect(result.document.nodes.find((node) => node.id === 'Valid')?.x).toBeGreaterThan(
      result.document.nodes.find((node) => node.id === 'Start')?.x ?? 0,
    )
  })

  it('compiles explicit edge routing', () => {
    const result = compileMinuDiagramSyntax('A > B [routing: straight]')

    expect(result.document.edges[0].style?.routing).toBe('straight')
  })

  it('supports lineType as an edge routing alias', () => {
    const result = compileMinuDiagramSyntax('A > B [lineType: curved]')

    expect(result.document.edges[0].style?.routing).toBe('curved')
  })

  it('rejects unsupported edge routing before constructing a document', () => {
    const result = compileMinuDiagramSyntax('A > B [routing: diagonal]')

    expect(result.document).toEqual({ nodes: [], edges: [] })
    expect(result.diagnostics).toContainEqual(expect.objectContaining({ code: 'invalid_property_value', propertyPath: 'routing' }))
  })

  it('rejects unsupported shapes before constructing a document', () => {
    const result = compileMinuDiagramSyntax('DB [shape: cylinder]')

    expect(result.document).toEqual({ nodes: [], edges: [] })
    expect(result.diagnostics).toContainEqual(expect.objectContaining({ code: 'invalid_property_value', propertyPath: 'shape' }))
  })

  it('uses node positions to choose sides for back edges', () => {
    const result = compileMinuDiagramSyntax(`
      direction right
      A > B > C
      C > A
    `)

    const backEdge = result.document.edges.find((edge) => edge.fromNode === 'C' && edge.toNode === 'A')
    expect(backEdge).toMatchObject({ fromSide: 'bottom', toSide: 'bottom', style: { routing: 'elbow' } })
  })

  it('reorders ranks to reduce link crossings instead of preserving adversarial declaration order', () => {
    const result = compileMinuDiagramSyntax(`
      direction right
      A > D
      B > C
    `, { gridSize: false })
    const centerY = (id: string) => {
      const node = result.document.nodes.find((item) => item.id === id)!
      return node.y + node.height / 2
    }

    expect(Math.sign(centerY('A') - centerY('B'))).toBe(Math.sign(centerY('D') - centerY('C')))
  })

  it('keeps nodes separated in branching layouts with mixed sizes', () => {
    const result = compileMinuDiagramSyntax(`
      direction down
      Root > A
      Root > B
      Root > C
      B [shape: diamond]
      C [width: 420, height: 120]
    `, { gridSize: false })
    const nodes = result.document.nodes

    for (let index = 0; index < nodes.length; index += 1) {
      for (let otherIndex = index + 1; otherIndex < nodes.length; otherIndex += 1) {
        const a = nodes[index]!
        const b = nodes[otherIndex]!
        const overlaps = a.x < b.x + b.width && a.x + a.width > b.x
          && a.y < b.y + b.height && a.y + a.height > b.y
        expect(overlaps, `${a.id} overlaps ${b.id}`).toBe(false)
      }
    }
  })

  it('center-aligns mixed-height nodes on the main horizontal lane', () => {
    const result = compileMinuDiagramSyntax(`
      direction right
      User [shape: pill]
      Login [shape: rectangle]
      Valid [shape: diamond]
      User > Login > Valid
    `)

    const centers = result.document.nodes.map((node) => node.y + node.height / 2)
    expect(new Set(centers).size).toBe(1)
  })

  it('compiles mind map layout with curved branch edges', () => {
    const result = compileMinuDiagramSyntax(`
      layout mindmap
      Root
      Root > Research
      Root > Build
      Research > Interviews
      Research > Competitors
    `)

    const root = result.document.nodes.find((node) => node.id === 'Root')
    const research = result.document.nodes.find((node) => node.id === 'Research')
    const build = result.document.nodes.find((node) => node.id === 'Build')
    const interviews = result.document.nodes.find((node) => node.id === 'Interviews')
    expect(root).toBeTruthy()
    expect(research).toBeTruthy()
    expect(build).toBeTruthy()
    expect(interviews).toBeTruthy()
    expect(research!.x).toBeGreaterThan(root!.x)
    expect(build!.x).toBeLessThan(root!.x)
    expect(interviews!.x).toBeGreaterThan(research!.x)
    expect(root!.shape).toBe('text')
    expect(root!.height).toBeLessThan(60)
    expect(result.document.edges.every((edge) => edge.toEnd === 'none' && edge.style?.routing === 'curved')).toBe(true)
  })

  it('routes downward diamond branches into the top of the target', () => {
    const result = compileMinuDiagramSyntax(`
      direction right
      Valid [shape: diamond]
      Dashboard [shape: pill]
      Error [shape: text]
      Valid > Dashboard: yes
      Valid > Error: no
    `)

    const edge = result.document.edges.find((item) => item.toNode === 'Error')
    expect(edge).toMatchObject({ fromSide: 'bottom', toSide: 'top' })
  })

  it('fits nested groups from child bounds outward', () => {
    const result = compileMinuDiagramSyntax(`
      Outer {
        Inner {
          A
          B
        }
      }
    `)
    const outer = result.document.nodes.find((node) => node.id === 'Outer')!
    const inner = result.document.nodes.find((node) => node.id === 'Inner')!

    expect(outer.x).toBeLessThanOrEqual(inner.x - 40)
    expect(outer.y).toBeLessThanOrEqual(inner.y - 40)
    expect(outer.x + outer.width).toBeGreaterThanOrEqual(inner.x + inner.width + 40)
    expect(outer.y + outer.height).toBeGreaterThanOrEqual(inner.y + inner.height + 40)
  })

  it('returns Dagre-generated routes only in the resolved scene', () => {
    const result = compileMinuDiagramSyntax('direction right\nA > B > C')
    const edge = result.document.edges[0]!
    const resolved = result.scene.edges.find((item) => item.id === edge.id)!

    expect(resolved.points.length).toBeGreaterThan(2)
    expect(resolved.points.every((point) => Number.isFinite(point.x) && Number.isFinite(point.y))).toBe(true)
    expect(resolved.points[0]).toEqual({ x: result.document.nodes[0]!.x + result.document.nodes[0]!.width, y: result.document.nodes[0]!.y + result.document.nodes[0]!.height / 2 })
    expect(edge.waypoints).toBeUndefined()
  })

  it('gives manual routing modes and authored waypoints precedence over generated routes', () => {
    const document = {
      nodes: [
        { id: 'A', type: 'text' as const, x: 0, y: 0, width: 100, height: 60 },
        { id: 'B', type: 'text' as const, x: 300, y: 0, width: 100, height: 60 },
      ],
      edges: [
        { id: 'manual-mode', fromNode: 'A', toNode: 'B', routingMode: 'manual' as const },
        { id: 'manual-waypoints', fromNode: 'A', toNode: 'B', waypoints: [{ x: 160, y: 140 }] },
      ],
    }
    const scene = resolveCanvasScene(document, {
      generatedEdgePoints: new Map(document.edges.map((edge) => [edge.id, [{ x: 100, y: 30 }, { x: 200, y: 240 }, { x: 300, y: 30 }]])),
    })

    expect(scene.edges.find((edge) => edge.id === 'manual-mode')?.points).not.toContainEqual({ x: 200, y: 240 })
    expect(scene.edges.find((edge) => edge.id === 'manual-waypoints')?.points).toContainEqual({ x: 160, y: 140 })
  })

  it('reports semantic diagnostics with stable codes and never emits malformed documents', () => {
    const result = compileMinuDiagramSyntax(`
      Shared
      Shared {
        A [type: bogus, width: NaN, unexpected: true]
      }
    `)

    expect(result.diagnostics.map((item) => item.code)).toEqual(expect.arrayContaining([
      'duplicate_id',
      'invalid_property_value',
      'unknown_property',
    ]))
    expect(result.document).toEqual({ nodes: [], edges: [] })
    expect(result.scene.diagnostics).toHaveLength(4)
    expect(result.diagnostics.find((item) => item.code === 'unknown_property')?.propertyPath).toBe('unexpected')
  })

  it('retains declaration metadata and rejects invalid group and edge styles', () => {
    const repeated = compileMinuDiagramSyntax('A [unexpected: true]\nA [label: "okay"]')
    const styles = compileMinuDiagramSyntax('G [strokeWidth: nope, style: neon] {\n  A > B [strokeWidth: nope, routing: diagonal]\n}')

    expect(repeated.diagnostics).toContainEqual(expect.objectContaining({ code: 'unknown_property', line: 1 }))
    expect(styles.document).toEqual({ nodes: [], edges: [] })
    expect(styles.diagnostics.filter((item) => item.code === 'invalid_property_value')).toHaveLength(4)
    expect(styles.diagnostics.some((item) => item.severity === 'warning')).toBe(false)
  })

  it('validates overwritten values from every node declaration', () => {
    const result = compileMinuDiagramSyntax(`
      BadWidth [width: NaN]
      BadWidth [label: "okay"]
      BadHeight [height: 0]
      BadHeight [label: "okay"]
      BadType [type: bogus]
      BadType [label: "okay"]
      BadShape [shape: cylinder]
      BadShape [label: "okay"]
    `)

    expect(result.document).toEqual({ nodes: [], edges: [] })
    expect(result.diagnostics.filter((item) => item.code === 'invalid_property_value').map((item) => item.propertyPath)).toEqual([
      'width', 'height', 'type', 'shape',
    ])
  })

  it('compiles directly constructed parsed documents without identity metadata', () => {
    const parsed: ParsedMinuDiagram = {
      direction: 'right',
      nodes: [
        { id: 'A' },
        { id: 'B' },
      ],
      groups: [],
      connections: [{ from: 'A', to: 'B', operator: '>' }],
      defaults: {},
      diagnostics: [],
    }

    const result = compileParsedMinuDiagram(parsed)
    expect(result.document.nodes.map((node) => node.id)).toEqual(['A', 'B'])
    expect(result.document.edges).toHaveLength(1)
  })

  it('validates normalized styles from direct parsed-document callers', () => {
    const parsed: ParsedMinuDiagram = {
      direction: 'right',
      nodes: [
        { id: 'A', style: { strokeWidth: Number.NaN, strokeStyle: 'neon' as never } },
        { id: 'B' },
      ],
      groups: [{ id: 'G', style: { strokeWidth: -1, strokeStyle: 'glow' as never } }],
      connections: [{ from: 'A', to: 'B', operator: '>', style: { strokeWidth: Number.POSITIVE_INFINITY, strokeStyle: 'sparkle' as never, routing: 'diagonal' as never } }],
      defaults: {},
      diagnostics: [],
    }

    const result = compileParsedMinuDiagram(parsed)
    const invalid = result.diagnostics.filter((item) => item.code === 'invalid_property_value')

    expect(result.document).toEqual({ nodes: [], edges: [] })
    expect(invalid.map((item) => item.propertyPath)).toEqual([
      'strokeWidth', 'style',
      'strokeWidth', 'style',
      'strokeWidth', 'style', 'routing',
    ])
  })
})

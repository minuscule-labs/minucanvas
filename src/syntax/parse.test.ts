import { describe, expect, it } from 'vitest'
import { compileMinuDiagramSyntax, parseMinuDiagramSyntax } from './index'

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

  it('rejects malformed strict statements without adding their artifacts', () => {
    const cases = [
      ['A >', 'malformed_connection'],
      ['A > > B', 'malformed_connection'],
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

  it('warns on unsupported edge routing', () => {
    const result = compileMinuDiagramSyntax('A > B [routing: diagonal]')

    expect(result.document.edges[0].style?.routing).toBeUndefined()
    expect(result.diagnostics[0]).toMatchObject({ severity: 'warning' })
  })

  it('warns and falls back for unsupported shapes', () => {
    const result = compileMinuDiagramSyntax('DB [shape: cylinder]')

    expect(result.document.nodes[0].shape).toBe('rounded-rectangle')
    expect(result.diagnostics[0]?.severity).toBe('warning')
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
})

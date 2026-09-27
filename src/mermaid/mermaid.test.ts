import { describe, expect, it } from 'vitest'
import { compileMermaidSyntax, parseMermaidSyntax } from './index'

describe('parseMermaidSyntax', () => {
  it('normalizes the supported flowchart subset', async () => {
    const result = await parseMermaidSyntax(`flowchart LR
      %% this comment is intentionally preserved as a source line
      start["Start ✓"] --> choice{Choose}
      choice -->|yes| done([Done]); choice -. no .-> retry((Retry))
      done --- retry
    `)

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.parsed.direction).toBe('right')
    expect(result.parsed.nodes).toEqual([
      { id: 'start', label: 'Start ✓', shape: 'rectangle' },
      { id: 'choice', label: 'Choose', shape: 'diamond' },
      { id: 'done', label: 'Done', shape: 'pill' },
      { id: 'retry', label: 'Retry', shape: 'ellipse' },
    ])
    expect(result.parsed.edges).toEqual([
      { from: 'start', to: 'choice', arrow: 'forward', stroke: 'solid' },
      { from: 'choice', to: 'done', arrow: 'forward', stroke: 'solid', label: 'yes' },
      { from: 'choice', to: 'retry', arrow: 'forward', stroke: 'dotted', label: 'no' },
      { from: 'done', to: 'retry', arrow: 'none', stroke: 'solid' },
    ])
  })

  it('does not interpret supported labels or comments as unsupported statements', async () => {
    const result = await parseMermaidSyntax(`flowchart TD
      %% ; style is plain comment text
      A[It's; style guide] -->|Review; class notes| accTitle
      accTitle --> accDescr
    `, { maxEdges: 2 })

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.parsed.nodes.find((node) => node.id === 'A')?.label).toBe("It's; style guide")
    expect(result.parsed.nodes.map((node) => node.id)).toEqual(['A', 'accTitle', 'accDescr'])
    expect(result.parsed.edges[0]?.label).toBe('Review; class notes')
  })

  it('normalizes nested groups and repeated declarations', async () => {
    const result = await parseMermaidSyntax(`graph TD
      subgraph outer[Outer]
        a[First]
        subgraph inner[Inner]
          b{{Decision}}
        end
      end
      a --> b
      a[Renamed] --> b
    `)

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.parsed.nodes).toEqual([
      { id: 'a', label: 'Renamed', shape: 'rectangle', groupId: 'outer' },
      { id: 'b', label: 'Decision', shape: 'hexagon', groupId: 'inner' },
    ])
    expect(result.parsed.groups).toEqual([
      { id: 'inner', label: 'Inner', parentGroupId: 'outer' },
      { id: 'outer', label: 'Outer' },
    ])
    expect(result.parsed.edges).toHaveLength(2)
  })

  it('supports all v1 directions and Mermaid default direction', async () => {
    const cases = [
      ['flowchart\nA --> B', 'down'],
      ['flowchart TB\nA --> B', 'down'],
      ['flowchart TD\nA --> B', 'down'],
      ['flowchart BT\nA --> B', 'up'],
      ['flowchart LR\nA --> B', 'right'],
      ['flowchart RL\nA --> B', 'left'],
    ] as const
    for (const [source, direction] of cases) {
      const result = await parseMermaidSyntax(source)
      expect(result.success, source).toBe(true)
      if (result.success) expect(result.parsed.direction).toBe(direction)
    }
  })

  it('preserves self-loops, parallel edges, branching, and bidirectional edges', async () => {
    const result = await parseMermaidSyntax(`flowchart TD
      A --> A
      A --> B & C
      A --> B
      B <--> C
    `)

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.parsed.edges.map((edge) => [edge.from, edge.to, edge.arrow])).toEqual([
      ['A', 'A', 'forward'],
      ['A', 'B', 'forward'],
      ['A', 'C', 'forward'],
      ['A', 'B', 'forward'],
      ['B', 'C', 'both'],
    ])
  })

  it.each([
    ['sequenceDiagram\nA->>B: hello', 'unsupported_diagram'],
    ['%%{init: {"theme":"dark"}}%%\nflowchart TD\nA --> B', 'unsupported_feature'],
    ['---\ntitle: Test\n---\nflowchart TD\nA --> B', 'unsupported_feature'],
    ['flowchart TD\nA --> B\nstyle A fill:#fff', 'unsupported_feature'],
    ['flowchart TD\nA --> B\nclick A href "https://example.com"', 'unsupported_feature'],
    ['flowchart TD\nA --> B\naccTitle: Checkout flow', 'unsupported_feature'],
    ['flowchart TD\nA --> B\naccDescr { Checkout steps }', 'unsupported_feature'],
    ['flowchart TD\nA@{ shape: rect, width: 150 }', 'unsupported_feature'],
    ["flowchart TD\nA[It's fine] --> B\nA@{ shape: rect, width: 150 }", 'unsupported_feature'],
    ["flowchart TD\nA[It's fine] --> B\naccTitle: Hidden", 'unsupported_feature'],
    ['flowchart TD\nA["<b>formatted</b>"]', 'unsupported_feature'],
    ['flowchart TD\nA[<b>formatted</b>]', 'unsupported_feature'],
    ['flowchart TD\nA -->|<b>formatted</b>| B', 'unsupported_feature'],
    ['flowchart TD\nsubgraph group["<b>formatted</b>"]\nA\nend', 'unsupported_feature'],
    ['flowchart TD\nsubgraph group[<b>formatted</b>]\nA\nend', 'unsupported_feature'],
    ['flowchart TD\nA[(Database)]', 'unsupported_shape'],
    ['flowchart TD\nA ----> B', 'unsupported_feature'],
    ['flowchart TD\nsubgraph group[Group]\nA\nend\ngroup --> A', 'invalid_graph'],
    ['flowchart TD\nsubgraph group[One]\nend\nsubgraph group[Two]\nend', 'invalid_graph'],
    ['flowchart TD\nA -->', 'invalid_syntax'],
  ])('fails closed for unsupported or invalid source', async (source, code) => {
    const result = await parseMermaidSyntax(source)

    expect(result.success).toBe(false)
    if (!result.success) expect(result.diagnostics).toContainEqual(expect.objectContaining({ severity: 'error', code }))
  })

  it.each(['flowchart TD', 'flowchart TD\n', 'flowchart TD\n%% comment only'])('rejects flowcharts without nodes or groups: %s', async (source) => {
    const result = await parseMermaidSyntax(source)

    expect(result.success).toBe(false)
  })

  it('enforces source and graph limits', async () => {
    const sourceFailure = await parseMermaidSyntax('flowchart TD\nA --> B', { maxSourceLength: 5 })
    expect(sourceFailure).toEqual(expect.objectContaining({ success: false, diagnostics: [expect.objectContaining({ code: 'resource_limit' })] }))

    const graphFailure = await parseMermaidSyntax('flowchart TD\nA --> B', { maxNodes: 1 })
    expect(graphFailure).toEqual(expect.objectContaining({ success: false, diagnostics: [expect.objectContaining({ code: 'resource_limit' })] }))

    const groupFailure = await parseMermaidSyntax('flowchart TD\nsubgraph one[One]\nend\nsubgraph two[Two]\nend', { maxNodes: 1 })
    expect(groupFailure).toEqual(expect.objectContaining({ success: false, diagnostics: [expect.objectContaining({ code: 'resource_limit' })] }))

    const endpoints = Array.from({ length: 40 }, (_, index) => `L${index}`).join(' & ')
    const targets = Array.from({ length: 40 }, (_, index) => `R${index}`).join(' & ')
    const expansionFailure = await parseMermaidSyntax(`flowchart TD\n${endpoints} --> ${targets}`, { maxEdges: 1_000 })
    expect(expansionFailure).toEqual(expect.objectContaining({ success: false, diagnostics: [expect.objectContaining({ code: 'resource_limit' })] }))
  })
})

describe('compileMermaidSyntax', () => {
  it('compiles a branching flowchart to native canvas objects', async () => {
    const result = await compileMermaidSyntax(`flowchart LR
      A[Start] --> B{Choose}
      B -. retry .-> C((Again))
      B --> D([Done])
    `)

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.document.nodes).toHaveLength(4)
    expect(result.document.nodes.find((node) => node.id === 'B')?.shape).toBe('diamond')
    const circle = result.document.nodes.find((node) => node.id === 'C')!
    expect(circle.width).toBe(circle.height)
    expect(result.document.edges).toEqual(expect.arrayContaining([
      expect.objectContaining({ fromNode: 'A', toNode: 'B', toEnd: 'arrow' }),
      expect.objectContaining({ fromNode: 'B', toNode: 'C', label: 'retry', style: expect.objectContaining({ strokeStyle: 'dotted' }) }),
    ]))
    expect(result.scene.nodes).toHaveLength(4)
  })

  it.each([
    ['flowchart LR\nA --> A', 'bottom', 0.2, 0.8],
    ['flowchart RL\nA --> A', 'bottom', 0.8, 0.2],
    ['flowchart TD\nA --> A', 'right', 0.1, 0.9],
    ['flowchart BT\nA --> A', 'right', 0.9, 0.1],
  ] as const)('compiles a visible native self-loop for %s', async (source, side, fromPosition, toPosition) => {
    const result = await compileMermaidSyntax(source)

    expect(result.success).toBe(true)
    if (!result.success) return
    const node = result.document.nodes[0]!
    const edge = result.document.edges[0]!
    const points = result.scene.edges[0]!.points
    expect(edge.fromAnchor).toEqual({ side, position: fromPosition })
    expect(edge.toAnchor).toEqual({ side, position: toPosition })
    expect(points.length).toBeGreaterThan(2)
    expect(points.some((point) => point.x < node.x
      || point.x > node.x + node.width
      || point.y < node.y
      || point.y > node.y + node.height)).toBe(true)
  })

  it('compiles nested subgraphs to fitted native groups', async () => {
    const result = await compileMermaidSyntax(`flowchart TD
      subgraph outer[Outer]
        A
        subgraph inner[Inner]
          B
        end
      end
      A --> B
    `)

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.document.nodes.find((node) => node.id === 'inner')).toMatchObject({ type: 'group', groupId: 'outer' })
    expect(result.document.nodes.find((node) => node.id === 'B')).toMatchObject({ groupId: 'inner' })
    expect(result.document.edges[0]).toMatchObject({ fromNode: 'A', toNode: 'B' })
  })

  it('returns no importable document for empty or invalid input', async () => {
    const empty = await compileMermaidSyntax('flowchart TD\n')
    expect(empty.success).toBe(false)
    expect('document' in empty).toBe(false)

    const invalid = await compileMermaidSyntax('flowchart TD\nA -->')
    expect(invalid.success).toBe(false)
    expect('document' in invalid).toBe(false)
  })

  it('keeps generated edge IDs distinct from source node IDs', async () => {
    const result = await compileMermaidSyntax('flowchart LR\nedge-1 --> B')

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.document.edges[0]?.id).toBe('edge-2')
    expect(new Set([...result.document.nodes, ...result.document.edges].map((item) => item.id)).size).toBe(3)
  })

  it('is deterministic for identical source and options', async () => {
    const source = 'flowchart LR\nA --> B\nA --> B'
    const first = await compileMermaidSyntax(source, { gridSize: 10 })
    const second = await compileMermaidSyntax(source, { gridSize: 10 })

    expect(second).toEqual(first)
  })
})

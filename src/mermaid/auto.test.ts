import { describe, expect, it } from 'vitest'
import { compileDiagramSyntax } from './index'

describe('compileDiagramSyntax', () => {
  it.each(['graph > End', 'flowchart > End'])('preserves valid Minu connections whose source ID is %s', async (source) => {
    const result = await compileDiagramSyntax(source)

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.format).toBe('minu')
    expect(result.document.nodes.map((node) => node.id)).toEqual([source.startsWith('graph') ? 'graph' : 'flowchart', 'End'])
    expect(result.document.edges).toHaveLength(1)
  })

  it.each([
    ['flowchart LR\nA --> B', 'mermaid'],
    ['graph TD\nA --> B', 'mermaid'],
    ['flowchart\nA{Decision} --> B', 'mermaid'],
  ] as const)('auto-detects Mermaid flowcharts: %s', async (source, format) => {
    const result = await compileDiagramSyntax(source)

    expect(result.success).toBe(true)
    if (result.success) expect(result.format).toBe(format)
  })

  it('allows callers to force either syntax when auto-detection is ambiguous', async () => {
    const minu = await compileDiagramSyntax('graph > End', { format: 'minu' })
    const mermaid = await compileDiagramSyntax('graph > End', { format: 'mermaid' })

    expect(minu.success).toBe(true)
    if (minu.success) expect(minu.format).toBe('minu')
    expect(mermaid.success).toBe(false)
    if (!mermaid.success) expect(mermaid.format).toBe('mermaid')
  })

  it('returns no importable document for invalid and empty source', async () => {
    for (const source of ['flowchart LR\nA -->', '']) {
      const result = await compileDiagramSyntax(source)
      expect(result.success).toBe(false)
      expect('document' in result).toBe(false)
    }
  })

  it.each(['A > ,', ', > B'])('fails closed for an empty Minu connection operand: %s', async (source) => {
    for (const options of [{}, { format: 'minu' as const, strict: false }]) {
      const result = await compileDiagramSyntax(source, options)
      expect(result.success).toBe(false)
      expect('document' in result).toBe(false)
      expect(result.diagnostics).toContainEqual(expect.objectContaining({ code: 'malformed_connection' }))
    }
  })

  it('enforces shared resource limits for Minu compilation', async () => {
    const cases = [
      ['A > B', { maxSourceLength: 2 }],
      ['A > B', { maxNodes: 1 }],
      ['A > B', { format: 'minu' as const, maxEdges: 0 }],
      ['Outer {\nInner {\nA\n}\n}', { format: 'minu' as const, maxNesting: 1 }],
    ] as const

    for (const [source, options] of cases) {
      const result = await compileDiagramSyntax(source, options)
      expect(result.success).toBe(false)
      expect('document' in result).toBe(false)
      expect(result.diagnostics).toContainEqual(expect.objectContaining({ code: 'resource_limit' }))
    }
  })

  it('forwards shared layout options to either compiler', async () => {
    const minu = await compileDiagramSyntax('A > B', { format: 'minu', origin: { x: 500, y: 400 } })
    const mermaid = await compileDiagramSyntax('flowchart LR\nA --> B', { origin: { x: 500, y: 400 } })

    expect(minu.success).toBe(true)
    if (minu.success) expect(Math.min(...minu.document.nodes.map((node) => node.x))).toBeGreaterThanOrEqual(500)
    expect(mermaid.success).toBe(true)
    if (mermaid.success) expect(Math.min(...mermaid.document.nodes.map((node) => node.x))).toBeGreaterThanOrEqual(500)
  })
})

/* @vitest-environment jsdom */

import { createRef } from 'react'
import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { compileMinuDiagramSyntax } from './syntax'
import { resolveCanvasScene } from './engine/scene'
import { MinuCanvas } from './MinuCanvas'
import type { CanvasHandle, JsonCanvasDocument } from './types'

function documentWithEdge(): JsonCanvasDocument {
  return {
    nodes: [
      { id: 'A', type: 'text', x: 0, y: 0, width: 100, height: 60 },
      { id: 'B', type: 'text', x: 300, y: 0, width: 100, height: 60 },
    ],
    edges: [{ id: 'edge', fromNode: 'A', toNode: 'B', label: 'connect' }],
  }
}

describe('MinuCanvas resolved scene handoff', () => {
  it('uses compiled Dagre geometry for both the live edge and SVG export', () => {
    const compiled = compileMinuDiagramSyntax('direction right\nA > B: hello\nB > C')
    const ref = createRef<CanvasHandle>()
    const view = render(<MinuCanvas ref={ref} value={compiled.document} resolvedScene={compiled.scene} selectedNodeIds={['A', 'B']} selectedEdgeIds={[]} onChange={() => {}} />)
    const livePath = view.container.querySelector<SVGPathElement>('.minucanvas-edge__path')!.getAttribute('d')!
    const exported = ref.current!.exportSvg()
    const selectionExported = ref.current!.exportSvg({ area: 'selection' })

    expect(livePath).toBe(compiled.scene.edges[0]!.path)
    expect(exported).toContain(`d="${livePath}"`)
    expect(selectionExported).toContain(`d="${livePath}"`)
    expect(view.container.querySelector<HTMLElement>('.minucanvas-edge-label')?.style.left).toBe(`${compiled.scene.edges[0]!.labelPoint.x}px`)
  })

  it('rejects malicious scene paths before they reach live rendering or SVG export', () => {
    const document = documentWithEdge()
    const scene = resolveCanvasScene(document)
    const malicious = {
      ...scene,
      edges: scene.edges.map((edge) => ({ ...edge, path: 'M 0 0" /><script>window.pwned=1</script><path d="M 1 1' })),
    }
    const ref = createRef<CanvasHandle>()
    const view = render(<MinuCanvas ref={ref} value={document} resolvedScene={malicious} onChange={() => {}} />)

    expect(view.container.innerHTML).not.toContain('<script>')
    expect(ref.current!.exportSvg()).not.toContain('<script>')
    expect(ref.current!.exportSvg()).toContain(`d="${resolveCanvasScene(document).edges[0]!.path}"`)
  })

  it('rejects a stale scene after every authored-document change', () => {
    const original = documentWithEdge()
    const suppliedScene = resolveCanvasScene(original, {
      generatedEdgePoints: new Map([['edge', [{ x: 100, y: 30 }, { x: 190, y: 170 }, { x: 300, y: 30 }]]]),
    })
    const view = render(<MinuCanvas value={original} resolvedScene={suppliedScene} onChange={() => {}} />)
    const livePath = () => view.container.querySelector<SVGPathElement>('.minucanvas-edge__path')!.getAttribute('d')
    const stalePath = livePath()
    const replacements: JsonCanvasDocument[] = [
      { ...original, nodes: original.nodes.map((node) => node.id === 'A' ? { ...node, x: 40 } : node) },
      { ...original, nodes: original.nodes.map((node) => node.id === 'A' ? { ...node, width: 160 } : node) },
      { ...original, edges: [{ ...original.edges[0]!, style: { routing: 'straight' } }] },
      { nodes: [{ id: 'X', type: 'text', x: 0, y: 0, width: 80, height: 50 }, { id: 'Y', type: 'text', x: 220, y: 0, width: 80, height: 50 }], edges: [{ id: 'replacement', fromNode: 'X', toNode: 'Y' }] },
    ]

    for (const replacement of replacements) {
      view.rerender(<MinuCanvas value={replacement} resolvedScene={suppliedScene} onChange={() => {}} />)
      expect(livePath()).toBe(resolveCanvasScene(replacement).edges[0]!.path)
      expect(livePath()).not.toBe(stalePath)
    }
  })

  it('keeps host node and edge metadata typed through resolvedScene', () => {
    type HostNode = { noteId: string }
    type HostEdge = { relation: 'depends-on' }
    const document: JsonCanvasDocument<HostNode, HostEdge> = {
      nodes: [
        { id: 'A', type: 'text', x: 0, y: 0, width: 80, height: 50, noteId: 'note-a' },
        { id: 'B', type: 'text', x: 200, y: 0, width: 80, height: 50, noteId: 'note-b' },
      ],
      edges: [{ id: 'edge', fromNode: 'A', toNode: 'B', relation: 'depends-on' }],
    }
    const scene = resolveCanvasScene(document)
    const noteId: string = scene.nodes[0]!.node.noteId
    const relation: 'depends-on' = scene.edges[0]!.edge.relation

    expect(noteId).toBe('note-a')
    expect(relation).toBe('depends-on')
  })
})

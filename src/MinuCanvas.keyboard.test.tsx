/* @vitest-environment jsdom */

import { fireEvent, render, waitFor } from '@testing-library/react'
import { createRef, useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { MinuCanvas } from './MinuCanvas'
import { createCanvasNode } from './model'
import type { CanvasChangeContext, CanvasHandle, CanvasSelection, CanvasTool, JsonCanvasDocument } from './types'

function renderCanvasHarness(initialDocument: JsonCanvasDocument, initialSelection: CanvasSelection, defaultTool: CanvasTool = 'select') {
  let latestDocument = initialDocument
  let latestSelection = initialSelection
  let latestChangeContext: CanvasChangeContext | null = null

  function Harness() {
    const [document, setDocument] = useState(initialDocument)
    const [selection, setSelection] = useState(initialSelection)
    return (
      <MinuCanvas
        value={document}
        defaultTool={defaultTool}
        onChange={(next, context) => {
          latestDocument = next
          latestChangeContext = context
          setDocument(next)
        }}
        selectedNodeIds={selection.nodeIds}
        selectedEdgeIds={selection.edgeIds}
        onSelectionChange={(next) => {
          latestSelection = next
          setSelection(next)
        }}
      />
    )
  }

  const view = render(<Harness />)
  return {
    ...view,
    get latestDocument() { return latestDocument },
    get latestSelection() { return latestSelection },
    get latestChangeContext() { return latestChangeContext },
  }
}

describe('MinuCanvas viewport control', () => {
  it('renders from a controlled viewport and follows prop updates', () => {
    const document: JsonCanvasDocument = { nodes: [], edges: [] }
    const view = render(
      <MinuCanvas value={document} onChange={() => {}} viewport={{ x: 40, y: 60, zoom: 1.25 }} />,
    )

    expect(view.container.querySelector<HTMLElement>('.minucanvas-world')?.style.transform).toBe('translate(40px, 60px) scale(1.25)')

    view.rerender(<MinuCanvas value={document} onChange={() => {}} viewport={{ x: -20, y: 10, zoom: 0.75 }} />)
    expect(view.container.querySelector<HTMLElement>('.minucanvas-world')?.style.transform).toBe('translate(-20px, 10px) scale(0.75)')
  })
})

describe('MinuCanvas linked nodes', () => {
  it('opens a selected node URL with Cmd/Ctrl+Enter', () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null)
    const initialDocument: JsonCanvasDocument = {
      nodes: [createCanvasNode({ id: 'docs', text: 'Docs', url: 'https://docs.example.com', x: 0, y: 0 })],
      edges: [],
    }
    const view = renderCanvasHarness(initialDocument, { nodeIds: ['docs'], edgeIds: [] })
    const canvas = view.container.querySelector<HTMLElement>('.minucanvas')!

    fireEvent.keyDown(canvas, { key: 'Enter', metaKey: true })

    expect(open).toHaveBeenCalledWith('https://docs.example.com', '_blank', 'noopener,noreferrer')
    open.mockRestore()
  })

  it('renders URL badges and host node adornments', () => {
    const initialDocument: JsonCanvasDocument = {
      nodes: [createCanvasNode({ id: 'docs', text: 'Docs', url: 'https://docs.example.com', x: 0, y: 0 })],
      edges: [],
    }

    const view = render(
      <MinuCanvas
        value={initialDocument}
        onChange={() => {}}
        renderNodeAdornment={({ node }) => node.id === 'docs' ? <span data-testid="note-adornment">note</span> : null}
      />,
    )

    expect(view.getByLabelText('Open linked URL')).toBeTruthy()
    expect(view.getByTestId('note-adornment')).toBeTruthy()
  })
})

describe('MinuCanvas JSON Canvas colors', () => {
  it('resolves presets for nodes and edges without changing document tokens', () => {
    const ref = createRef<CanvasHandle>()
    const document: JsonCanvasDocument = {
      nodes: [
        createCanvasNode({ id: 'A', text: 'A', x: 0, y: 0, width: 120, height: 80, color: '1', style: { fill: '2', text: '3' } }),
        createCanvasNode({ id: 'B', text: 'B', x: 260, y: 0, width: 120, height: 80 }),
      ],
      edges: [{ id: 'preset-edge', fromNode: 'A', toNode: 'B', color: '5' }],
    }
    const view = render(<MinuCanvas ref={ref} value={document} onChange={() => {}} canvasTheme="dark" />)

    const nodeStyle = view.container.querySelector<HTMLElement>('[data-minucanvas-node-id="A"]')!.getAttribute('style')!
    expect(nodeStyle).toContain('--mc-node-stroke: var(--mc-json-canvas-color-1')
    expect(nodeStyle).toContain('--mc-node-fill: var(--mc-json-canvas-color-2')
    expect(nodeStyle).toContain('--mc-node-text: var(--mc-json-canvas-color-3')
    const edgeStyle = view.container.querySelector<SVGGElement>('[data-minucanvas-edge-id="preset-edge"]')!.parentElement!.getAttribute('style')!
    expect(edgeStyle).toContain('--mc-edge-stroke: var(--mc-json-canvas-color-5')
    expect(view.container.querySelector<SVGMarkerElement>('#minucanvas-arrow-preset-edge path')!.getAttribute('style')).toContain('--mc-json-canvas-color-5')

    const svg = ref.current!.exportSvg()
    expect(svg).toContain('stroke="#f87171"')
    expect(svg).toContain('fill="#fb923c"')
    expect(svg).toContain('fill="#facc15"')
    expect(svg).toContain('stroke="#22d3ee"')
    expect(ref.current!.getDocument().nodes[0]?.color).toBe('1')
    expect(ref.current!.getDocument().edges[0]?.color).toBe('5')
  })
})

describe('MinuCanvas connector arrowheads', () => {
  it('renders independent start and end markers with backwards-compatible defaults', () => {
    const document: JsonCanvasDocument = {
      nodes: [
        createCanvasNode({ id: 'A', text: 'A', x: 0, y: 0, width: 120, height: 80 }),
        createCanvasNode({ id: 'B', text: 'B', x: 260, y: 0, width: 120, height: 80 }),
      ],
      edges: [
        { id: 'default', fromNode: 'A', toNode: 'B' },
        { id: 'start', fromNode: 'A', toNode: 'B', fromEnd: 'arrow', toEnd: 'none' },
        { id: 'both', fromNode: 'A', toNode: 'B', fromEnd: 'arrow', toEnd: 'arrow' },
      ],
    }
    const view = render(<MinuCanvas value={document} onChange={() => {}} />)
    const path = (id: string) => view.container.querySelector<SVGPathElement>(`[data-minucanvas-edge-id="${id}"] + .minucanvas-edge__path`)!

    expect(path('default').getAttribute('marker-start')).toBeNull()
    expect(path('default').getAttribute('marker-end')).toBe('url(#minucanvas-arrow-default)')
    expect(path('start').getAttribute('marker-start')).toBe('url(#minucanvas-arrow-start)')
    expect(path('start').getAttribute('marker-end')).toBeNull()
    expect(path('both').getAttribute('marker-start')).toBe('url(#minucanvas-arrow-both)')
    expect(path('both').getAttribute('marker-end')).toBe('url(#minucanvas-arrow-both)')
  })

  it('exports start and end arrowheads to SVG', () => {
    const ref = createRef<CanvasHandle>()
    const document: JsonCanvasDocument = {
      nodes: [
        createCanvasNode({ id: 'A', text: 'A', x: 0, y: 0, width: 120, height: 80 }),
        createCanvasNode({ id: 'B', text: 'B', x: 260, y: 0, width: 120, height: 80 }),
      ],
      edges: [{ id: 'both', fromNode: 'A', toNode: 'B', fromEnd: 'arrow', toEnd: 'arrow' }],
    }
    render(<MinuCanvas ref={ref} value={document} onChange={() => {}} />)

    const svg = ref.current!.exportSvg()
    expect(svg).toContain('marker-start="url(#arrow-both)"')
    expect(svg).toContain('marker-end="url(#arrow-both)"')
  })
})

describe('MinuCanvas connector routing', () => {
  it.each([
    ['arrow', 'arrow'],
    ['line', 'none'],
  ] as const)('marks a user-drawn %s connector as manual', async (tool, toEnd) => {
    const initialDocument: JsonCanvasDocument = {
      nodes: [
        createCanvasNode({ id: 'A', text: 'A', x: 0, y: 0, width: 120, height: 80 }),
        createCanvasNode({ id: 'B', text: 'B', x: 260, y: 0, width: 120, height: 80 }),
      ],
      edges: [],
    }
    Object.defineProperty(window, 'PointerEvent', { configurable: true, value: MouseEvent })
    const view = renderCanvasHarness(initialDocument, { nodeIds: [], edgeIds: [] }, tool)
    const canvas = view.container.querySelector<HTMLElement>('.minucanvas')!
    const fromNode = view.container.querySelector<HTMLElement>('[data-minucanvas-node-id="A"]')!
    fromNode.setPointerCapture = vi.fn()

    fireEvent.pointerDown(fromNode, { pointerId: 1, clientX: 120, clientY: 40 })
    fireEvent.pointerMove(canvas, { pointerId: 1, clientX: 260, clientY: 40 })
    fireEvent.pointerUp(canvas, { pointerId: 1, clientX: 260, clientY: 40 })

    await waitFor(() => expect(view.latestDocument.edges).toHaveLength(1))
    expect(view.latestDocument.edges[0]).toMatchObject({
      fromNode: 'A',
      toNode: 'B',
      toEnd,
      routingMode: 'manual',
    })
    expect(canvas.dataset.tool).toBe('select')
  })
  it('copies a selected connector without copying its connected nodes', async () => {
    const initialDocument: JsonCanvasDocument = {
      nodes: [
        createCanvasNode({ id: 'A', text: 'A', x: 0, y: 0, width: 120, height: 80 }),
        createCanvasNode({ id: 'B', text: 'B', x: 260, y: 0, width: 120, height: 80 }),
      ],
      edges: [{ id: 'edge-1', fromNode: 'A', toNode: 'B', toEnd: 'arrow' }],
    }
    const view = renderCanvasHarness(initialDocument, { nodeIds: [], edgeIds: ['edge-1'] })
    const canvas = view.container.querySelector<HTMLElement>('.minucanvas')!

    fireEvent.keyDown(canvas, { key: 'c', metaKey: true })
    fireEvent.keyDown(canvas, { key: 'v', metaKey: true })

    await waitFor(() => expect(view.latestDocument.edges).toHaveLength(2))
    expect(view.latestDocument.nodes).toHaveLength(2)
    expect(view.latestDocument.edges.find((edge) => edge.id !== 'edge-1')).toMatchObject({ fromNode: 'A', toNode: 'B' })
  })

  it('offsets manual connector waypoints when copying and pasting a subgraph', async () => {
    const initialDocument: JsonCanvasDocument = {
      nodes: [
        createCanvasNode({ id: 'A', text: 'A', x: 0, y: 0, width: 120, height: 80 }),
        createCanvasNode({ id: 'B', text: 'B', x: 260, y: 0, width: 120, height: 80 }),
      ],
      edges: [{
        id: 'edge-1',
        fromNode: 'A',
        toNode: 'B',
        routingMode: 'manual',
        waypoints: [{ x: 140, y: 120 }],
      }],
    }
    const view = renderCanvasHarness(initialDocument, { nodeIds: ['A', 'B'], edgeIds: [] })
    const canvas = view.container.querySelector<HTMLElement>('.minucanvas')!

    fireEvent.keyDown(canvas, { key: 'c', metaKey: true })
    fireEvent.keyDown(canvas, { key: 'v', metaKey: true })

    await waitFor(() => expect(view.latestDocument.edges).toHaveLength(2))
    expect(view.latestDocument.edges.find((edge) => edge.id !== 'edge-1')?.waypoints).toEqual([{ x: 180, y: 160 }])
  })

  it('preserves a manually positioned endpoint when a connected node moves', async () => {
    const initialDocument: JsonCanvasDocument = {
      nodes: [
        createCanvasNode({ id: 'A', text: 'A', x: 0, y: 0, width: 120, height: 80 }),
        createCanvasNode({ id: 'B', text: 'B', x: 260, y: 0, width: 120, height: 80 }),
      ],
      edges: [
        {
          id: 'edge-1',
          fromNode: 'A',
          toNode: 'B',
          fromSide: 'top',
          toSide: 'left',
          fromAnchor: { side: 'top', position: 0.25 },
          toAnchor: { side: 'left', position: 0.75 },
          toEnd: 'arrow',
          style: { routing: 'elbow' },
          routingMode: 'manual',
        },
      ],
    }
    const view = renderCanvasHarness(initialDocument, { nodeIds: ['A'], edgeIds: [] })
    const canvas = view.container.querySelector<HTMLElement>('.minucanvas')!

    fireEvent.keyDown(canvas, { key: 'ArrowRight' })

    await waitFor(() => expect(view.latestDocument.nodes.find((node) => node.id === 'A')?.x).toBe(20))
    expect(view.latestChangeContext).toMatchObject({ reason: 'move-node', nodeIds: ['A'] })
    expect(view.latestDocument.edges[0]).toMatchObject({
      fromSide: 'top',
      toSide: 'left',
      fromAnchor: { side: 'top', position: 0.25 },
      toAnchor: { side: 'left', position: 0.75 },
      routingMode: 'manual',
    })
  })

  it('moves manual connector waypoints with a multi-node selection', async () => {
    const initialDocument: JsonCanvasDocument = {
      nodes: [
        createCanvasNode({ id: 'A', text: 'A', x: 40, y: 40, width: 120, height: 80 }),
        createCanvasNode({ id: 'B', text: 'B', x: 260, y: 140, width: 120, height: 80 }),
      ],
      edges: [
        {
          id: 'edge-1',
          fromNode: 'A',
          toNode: 'B',
          routingMode: 'manual',
          waypoints: [{ x: 100, y: 160 }, { x: 220, y: 160 }],
        },
      ],
    }
    const view = renderCanvasHarness(initialDocument, { nodeIds: ['A', 'B'], edgeIds: [] })
    const canvas = view.container.querySelector<HTMLElement>('.minucanvas')!

    fireEvent.keyDown(canvas, { key: 'ArrowRight' })

    await waitFor(() => expect(view.latestDocument.nodes.find((node) => node.id === 'A')?.x).toBe(60))
    expect(view.latestDocument.edges[0]?.waypoints).toEqual([{ x: 120, y: 160 }, { x: 240, y: 160 }])
  })

  it('moves manual connector waypoints with a group instead of pinning them to the canvas', async () => {
    const initialDocument: JsonCanvasDocument = {
      nodes: [
        createCanvasNode({ id: 'group', type: 'group', x: 0, y: 0, width: 420, height: 260 }),
        createCanvasNode({ id: 'A', text: 'A', groupId: 'group', x: 40, y: 40, width: 120, height: 80 }),
        createCanvasNode({ id: 'B', text: 'B', groupId: 'group', x: 260, y: 140, width: 120, height: 80 }),
      ],
      edges: [
        {
          id: 'edge-1',
          fromNode: 'A',
          toNode: 'B',
          fromAnchor: { side: 'bottom', position: 0.5 },
          toAnchor: { side: 'left', position: 0.5 },
          routingMode: 'manual',
          waypoints: [{ x: 100, y: 160 }, { x: 220, y: 160 }],
        },
      ],
    }
    const view = renderCanvasHarness(initialDocument, { nodeIds: ['group'], edgeIds: [] })
    const canvas = view.container.querySelector<HTMLElement>('.minucanvas')!

    fireEvent.keyDown(canvas, { key: 'ArrowRight' })

    await waitFor(() => expect(view.latestDocument.nodes.find((node) => node.id === 'group')?.x).toBe(20))
    expect(view.latestDocument.edges[0]?.waypoints).toEqual([{ x: 120, y: 160 }, { x: 240, y: 160 }])
  })

  it('preserves manually routed connector waypoints when a connected node moves', async () => {
    const initialDocument: JsonCanvasDocument = {
      nodes: [
        createCanvasNode({ id: 'A', text: 'A', x: 0, y: 0, width: 120, height: 80 }),
        createCanvasNode({ id: 'B', text: 'B', x: 260, y: 0, width: 120, height: 80 }),
      ],
      edges: [
        {
          id: 'edge-1',
          fromNode: 'A',
          toNode: 'B',
          fromSide: 'bottom',
          toSide: 'left',
          fromAnchor: { side: 'bottom', position: 0.25 },
          toAnchor: { side: 'left', position: 0.75 },
          toEnd: 'arrow',
          style: { routing: 'elbow' },
          waypoints: [{ x: 120, y: 180 }, { x: 220, y: 180 }],
        },
      ],
    }
    const view = renderCanvasHarness(initialDocument, { nodeIds: ['A'], edgeIds: [] })
    const canvas = view.container.querySelector<HTMLElement>('.minucanvas')!

    fireEvent.keyDown(canvas, { key: 'ArrowRight' })

    await waitFor(() => expect(view.latestDocument.nodes.find((node) => node.id === 'A')?.x).toBe(20))
    expect(view.latestDocument.edges[0]).toMatchObject({
      fromSide: 'bottom',
      toSide: 'left',
      fromAnchor: { side: 'bottom', position: 0.25 },
      toAnchor: { side: 'left', position: 0.75 },
      waypoints: [{ x: 120, y: 180 }, { x: 220, y: 180 }],
    })
  })
})

describe('MinuCanvas keyboard creation', () => {
  it('allows Cmd/Ctrl+Arrow to create from a node that is already being edited after keyboard creation', async () => {
    const initialDocument: JsonCanvasDocument = {
      nodes: [createCanvasNode({ id: 'Root', text: 'Root', shape: 'rounded-rectangle', x: 0, y: 0, width: 160, height: 80 })],
      edges: [],
    }
    const view = renderCanvasHarness(initialDocument, { nodeIds: ['Root'], edgeIds: [] })
    const canvas = view.container.querySelector<HTMLElement>('.minucanvas')!

    fireEvent.keyDown(canvas, { key: 'ArrowRight', metaKey: true })

    await waitFor(() => expect(view.latestDocument.nodes).toHaveLength(2))
    const firstNew = view.latestDocument.nodes.find((node) => node.id !== 'Root')!
    expect(view.latestSelection).toEqual({ nodeIds: [firstNew.id], edgeIds: [] })
    const editable = await waitFor(() => {
      const element = view.container.querySelector<HTMLElement>(`[data-minucanvas-node-id="${firstNew.id}"] [contenteditable="true"]`)
      expect(element).toBeTruthy()
      return element!
    })

    fireEvent.keyDown(editable, { key: 'ArrowDown', metaKey: true })

    await waitFor(() => expect(view.latestDocument.nodes).toHaveLength(3))
    const secondNew = view.latestDocument.nodes.find((node) => node.id !== 'Root' && node.id !== firstNew.id)!
    expect(view.latestDocument.edges).toContainEqual(expect.objectContaining({ fromNode: firstNew.id, toNode: secondNew.id }))
    expect(view.latestSelection).toEqual({ nodeIds: [secondNew.id], edgeIds: [] })
  })
})

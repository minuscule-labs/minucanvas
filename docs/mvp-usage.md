# MinuCanvas MVP Usage Notes

This guide covers the current MVP editor workflow: creating diagrams from syntax, editing them visually, using keyboard shortcuts, importing external content, grouping/layering, and exporting.

## Basic editor setup

```tsx
import { useRef, useState } from 'react'
import { MinuCanvas, type CanvasHandle, type JsonCanvasDocument } from '@dpklabs/minucanvas'
import '@dpklabs/minucanvas/theme.css'

const initial: JsonCanvasDocument = { nodes: [], edges: [] }

export function CanvasExample() {
  const canvasRef = useRef<CanvasHandle>(null)
  const [value, setValue] = useState(initial)

  return (
    <MinuCanvas
      ref={canvasRef}
      value={value}
      onChange={setValue}
      canvasTheme="system"
      shapeTheme="outline"
      grid
      snapToGrid
      autoFit
    />
  )
}
```

## Creating a canvas from diagram syntax

MinuCanvas includes a small LLM-friendly diagram syntax compiler as package utilities. The compiler is separate from the React UI, so host apps decide where to show textareas, diagnostics, import buttons, and reset controls.

```tsx
import { compileMinuDiagramSyntax } from '@dpklabs/minucanvas/syntax'

const source = `diagram "Auth flow" {
  direction right
  User [shape: pill]
  Login [shape: rectangle, label: "Login form"]
  Valid [shape: diamond, label: "Valid?"]
  Dashboard [shape: pill]
  Error [shape: text, label: "Show error", stroke: "#64748b", style: dashed]

  User > Login
  Login > Valid
  Valid > Dashboard: yes
  Valid > Error: no [style: dashed]
  Error > Login
}`

const { document, diagnostics } = compileMinuDiagramSyntax(source, { strict: true })
if (diagnostics.some(({ severity }) => severity === 'error')) {
  // Show diagnostics. Do not apply or persist the generated document.
} else {
  setValue(document)
  canvasRef.current?.fitView()
}
```

Useful syntax features:

- `diagram "Title" { ... }`
- `direction right | down | up | left`
- `layout flow | mindmap`
- node declarations: `Id [shape: diamond, label: "Approved?"]`
- groups: `Backend { ... }`
- edges: `A > B`, `A - B`, `A <> B`, `A --> B` (`A -> B` is unsupported)
- edge labels: `A > B: yes`
- edge styles: `A > B [style: dashed, routing: elbow]`
- canonical routing values: `elbow`, `straight`, `curved`
- strict validation: pass `{ strict: true }` and reject the result when any diagnostic has `severity: 'error'`

Minu diagram syntax uses one language with multiple layouts:

- `layout flow` is the default. Use it for process diagrams, app flows, system diagrams, and decision trees. `A > B` means A leads to B; nodes are arranged by graph depth in the selected `direction`.
- `layout mindmap` uses the same nodes and edges for brainstorming, outlines, and topic trees. `A > B` means B is a branch/topic under A; the root is centered and child branches split left/right.

Mind map syntax uses the same nodes and edges with a tree layout:

```txt
diagram "Product plan" {
  layout mindmap
  Product
  Product > Research
  Product > Build
  Research > Interviews
  Research > Competitors
}
```

Host apps can also lay out an existing document as a mind map without syntax:

```ts
import { layoutMindMap } from '@dpklabs/minucanvas'

setValue(layoutMindMap(value, { rootId: 'Product' }))
```

For profile-backed usage, use the built-in mind map profile:

```tsx
import {
  MinuCanvas,
  applyCanvasDocumentProfileLayout,
  createDefaultMindMapDocument,
  mindMapCanvasProfile,
} from '@dpklabs/minucanvas'

const emptyMindMapDocument = createDefaultMindMapDocument({ rootText: 'Product plan' })
const mindMapDocument = applyCanvasDocumentProfileLayout(value, mindMapCanvasProfile, {
  rootId: 'Product',
})

<MinuCanvas
  value={mindMapDocument}
  onChange={setValue}
  documentProfile={mindMapCanvasProfile}
/>
```

`documentProfile={mindMapCanvasProfile}` enables the mind map interaction mode. Explicit `interactionMode="mindmap"` is still supported as an override for hosts that do not want to use profiles yet.

See [`minu-diagram-syntax.md`](./minu-diagram-syntax.md) for the full syntax proposal and API details.

### Importing Mermaid flowcharts

Mermaid flowchart import is available from a separate asynchronous entry so it does not add the parser to normal canvas or Minu syntax imports:

```ts
const { compileMermaidSyntax } = await import('@dpklabs/minucanvas/mermaid')
const result = await compileMermaidSyntax(`flowchart LR
  A["Start"] --> B{Choose}
  B -->|yes| C([Done])
`)

if (!result.success) {
  showDiagnostics(result.diagnostics)
  // Do not replace the current canvas.
} else {
  setValue(result.document)
  canvasRef.current?.fitView()
}
```

The result contains editable native canvas objects, not Mermaid SVG. Import is fail-closed: invalid or unsupported source returns diagnostics and no document. See [`mermaid-support.md`](./mermaid-support.md) for the supported subset, mappings, limits, and non-goals.

## Core editing

- Select: click a shape, text, image, link, group, line, or arrow.
- Multi-select: `Shift` + click items, or drag a marquee selection box with the select tool.
- Create shapes: click a shape tool to place a default-sized shape, or drag to draw a custom-sized shape. Hold `Shift` while dragging a shape to constrain width/height.
- Move: drag selected items, or use arrow keys. With snap enabled, arrow movement uses the grid size.
- Keyboard navigation: `Alt/Option + Arrow` jumps selection to the nearest node or connector in that direction.
- Pan: use the hand tool, hold `Shift`/`Space`, middle mouse, or two-finger trackpad scroll.
- Zoom: pinch/ctrl-wheel/meta-wheel zooms the canvas around the pointer.
- Resize: drag selected item resize handles.
- Change shape: select one or more nodes and press `Tab` to open the compact shape switcher.
- Add connected shapes: select a non-group shape and click a `+` handle, or use `Cmd/Ctrl + Arrow`.
- Draw free-standing lines/arrows: choose the line or arrow tool and drag on empty canvas space instead of starting from a node outline. Hold `Shift` while drawing to snap to 15° angle increments.
- Drawing tools are one-shot: after creating a shape, line, or arrow, MinuCanvas returns to the select tool. Press the shortcut again for another item.

## Keyboard shortcuts

Default canvas shortcuts:

| Shortcut | Action |
| --- | --- |
| `V` / `1` | Select / move tool |
| `H` | Hand / pan tool |
| `A` / `5` | Arrow connector tool |
| `L` / `7` | Line connector tool |
| `T` / `6` | Text tool |
| `R` / `2` | Rectangle tool |
| `D` / `3` | Diamond tool |
| `O` / `4` | Ellipse/circle tool |
| `P` / `8` | Pill tool |
| Arrow keys | Move selected nodes by the grid amount when snap is enabled, otherwise by a small step |
| `Alt/Option + Arrow` | Navigate selection spatially between nodes/connectors |
| `Tab` | Open selected node shape switcher |
| `Enter` / `F2` | Edit selected node or edge label |
| `Escape` | Clear selection, close menus/dialogs, exit editing/group mode |
| `Delete` / `Backspace` | Delete selection |
| `Cmd/Ctrl + C` | Copy selection |
| `Cmd/Ctrl + X` | Cut selection |
| `Cmd/Ctrl + V` | Paste selection or external clipboard content |
| `Cmd/Ctrl + D` | Duplicate selection |
| `Cmd/Ctrl + Z` | Undo |
| `Cmd/Ctrl + Shift + Z` / `Cmd/Ctrl + Y` | Redo |
| `Cmd/Ctrl + G` | Group selection |
| `Cmd/Ctrl + Shift + G` | Ungroup selection |
| `Cmd/Ctrl + ]` | Bring selection to front |
| `Cmd/Ctrl + [` | Send selection to back |
| `Cmd/Ctrl + +` / `Cmd/Ctrl + -` | Zoom in / out |
| `Cmd/Ctrl + 0` | Reset view |
| `Cmd/Ctrl + Arrow` | Add a connected shape in that direction |

Mind map mode can be enabled with `documentProfile={mindMapCanvasProfile}` or directly with `<MinuCanvas interactionMode="mindmap" />`. In that mode, add handles are limited to left/right branch directions for horizontal mind maps, and resize handles are hidden to keep notes content-sized.

| Shortcut | Action |
| --- | --- |
| Arrow keys | Navigate spatially between mind map notes |
| `Tab` on selected note | Add child branch and start editing it |
| `Enter` on selected note | Edit selected note text |
| `F2` on selected note | Edit selected note text |
| `Tab` while editing | Commit current text, add child branch, and start editing it |
| `Enter` while editing | Commit current text, add sibling branch, and start editing it |
| `Alt/Option + Enter` while editing | Insert a new line inside the note |

Text-note nodes automatically resize to fit their text plus padding when edited. During editing, they grow visually as you type and persist the new size on blur. Editing mode hides add/resize overlays so handles do not lag behind the growing text box.

## Shapes, style, and connectors

- Rectangle, pill, ellipse/circle, diamond, and text shapes are available from tools and the `Tab` shape switcher.
- Ellipse creates a circle by default; resize it to make an oval.
- Pill is a capsule with straight sides and fully rounded ends.
- Diamond defaults to a grid-friendly 3:2 ratio.
- Select nodes or edges to use the style toolbar for shape, stroke/fill/text colors, stroke style, width, font size/alignment, and edge routing.
- For selected connectors, the line style panel can set no arrows, an arrow at the end, an arrow at the start, or arrows at both ends. The choice applies to every selected edge.
- Elbow connectors render with rounded corners. Select an elbow connector and drag a horizontal or vertical segment to customize its route.
- Arrow and line tools can also draw free-standing marks when dragged on empty canvas space. Start from a node outline to create a connector; start on empty canvas to create an unconnected line/arrow. Hold `Shift` while drawing to snap to 15° increments for clean horizontal, vertical, and diagonal lines.
- User-drawn connectors preserve their chosen endpoint sides as manual routes. Syntax, mind-map, keyboard-generated, and programmatic connectors remain automatic unless configured otherwise.
- Select a line/arrow to drag endpoint handles. Dropping an endpoint near a shape connects it; dragging it away from shapes detaches it to a free point. Hold `Shift` while dragging a free endpoint to snap the line angle.

## Text, links, and images

### Text shapes

The text tool creates a true text shape with no visible container by default. It shows a dashed outline while selected or editing.

### Linked nodes and link nodes

Any node can carry an external `url`. Linked regular nodes keep their normal shape/text behavior and show a small external-link badge. Select a linked node and press `Cmd/Ctrl+Enter` to open it, or right-click the node and use `Add link…`, `Edit link…`, `Open link`, or `Remove link`.

Pasting/dropping a normal URL creates a compact dedicated link node. Link labels default to the URL hostname. Hosts can optionally resolve better labels with:

```tsx
<MinuCanvas
  onResolveLink={async (url) => ({ label: 'Resolved title' })}
/>
```

Double-click a dedicated link node or use the context menu `Open link` action to open it.

### Image nodes

Pasting/dropping an image file or image URL creates an image node. Image nodes use the image dimensions, scaled down to a reasonable maximum if needed, and do not render a shape outline.

The upload API is generic so future non-image files can reuse it:

```tsx
<MinuCanvas
  onUpload={async (file) => {
    // Upload to app storage and return a durable URL.
    return uploadedUrl
  }}
/>
```

For local demos, object URLs are acceptable but not persistent:

```tsx
async function handleDemoUpload(file: File) {
  return URL.createObjectURL(file)
}
```

If no `onUpload` is provided, image paste/drop is ignored by default and emits a warning. You can allow inline base64/data URLs for demos only:

```tsx
<MinuCanvas allowInlineImages />
```

Warnings can be handled with:

```tsx
<MinuCanvas
  onExternalContentWarning={(warning) => console.warn(warning.message, warning)}
/>
```

## Groups and frames

- Group: select two or more shapes and use `Cmd/Ctrl+G` or context menu `Group selection`. Groups are primarily a transform relationship; their wrapper/label is only emphasized when selected, active, or editing.
- Frame: select two or more shapes and use context menu `Frame selection`. Frames reuse group mechanics but remain visible as organization/export regions with a persistent title and border.
- Rename a group/frame: select it and press `Enter`/`F2`, double-click its label, or use context menu `Rename frame/group`.
- Ungroup: `Cmd/Ctrl+Shift+G` or context menu `Ungroup`.
- Click a grouped child to select/move the group.
- Double-click a group to enter group editing.
- In group editing mode, child shapes can be selected and moved independently.
- Click `Done` in the group breadcrumb or press `Escape` to exit group editing.
- Group bounds auto-fit around children when children are moved/resized inside the group.
- Double-click the group label above-left to rename it.

## Layers and locking

Context menu actions:

- Change order → Bring to front
- Change order → Bring forward
- Change order → Send backward
- Change order → Send to back
- Lock
- Unlock

Locked nodes can be selected, but cannot be moved, resized, or deleted by normal delete selection.

## Alignment and distribution

Context menu actions:

- Align → Left / Center / Right / Top / Middle / Bottom
- Distribute → Horizontal / Vertical

Smart alignment guides appear while dragging shapes. With snap-to-grid enabled, guides are visual only so they do not fight grid snapping. With snap-to-grid disabled, guides also snap.

## Export

Use context menu `Export…` to open the export dialog.

Supported:

- Area: Canvas or Selection
- File type: PNG image or SVG
- PNG quality: 1x / 2x / 3x
- PNG background: Solid / Transparent
- Color mode: Dark / Light

Imperative API:

```tsx
const canvasRef = useRef<CanvasHandle>(null)

const svg = canvasRef.current?.exportSvg()
const pngDataUrl = await canvasRef.current?.exportPng()
```

The handle also provides host-driven editing and viewport operations:

```tsx
canvasRef.current?.updateNode('node-1', (node) => ({ ...node, label: 'Updated' }))
canvasRef.current?.updateEdge('edge-1', (edge) => ({ ...edge, label: 'Approved' }))
canvasRef.current?.resetEdgeRoute('edge-1')
canvasRef.current?.setSelection({ nodeIds: ['node-1'], edgeIds: [] })
canvasRef.current?.setViewport({ x: 120, y: 80, zoom: 1.25 })
```

Hosts can control the viewport declaratively as well:

```tsx
<MinuCanvas viewport={viewport} onViewportChange={setViewport} value={value} onChange={setValue} />
```

Notes:

- SVG export is safest for external images.
- PNG export may be limited by browser canvas security if external images are cross-origin and do not allow CORS.

## Manual QA checklist

1. Compile/import a sample from diagram syntax and verify diagnostics are visible in the host UI.
2. Create each shape tool: text, rectangle, diamond, ellipse/circle, pill.
3. Use `Tab` on selected nodes to change shape.
4. Create arrows and lines between shapes. Edges default to elbow routing and can be changed to straight or curved from the style toolbar. Select an elbow edge and drag a horizontal or vertical segment to adjust line positioning.
5. Select, multi-select, marquee-select shapes and connectors.
6. Navigate selection with `Alt/Option + Arrow` across nodes/connectors.
7. Move items with mouse and arrow keys.
8. Resize shapes and groups.
9. Use copy, cut, paste, duplicate, undo, redo.
10. Group and ungroup shapes.
11. Enter a group, move a child, and exit with Done/Escape.
12. Rename a group label.
13. Lock and unlock nodes.
14. Use layer ordering commands.
15. Align and distribute selected nodes.
16. Drag with snap-to-grid on and off to verify guides.
17. Paste/drop plain text, URLs, image URLs, and local image files.
18. Replace an image and resize image to 25%, 50%, 100%.
19. Export canvas and selection as SVG and PNG.
20. Verify fullscreen and standard demos both behave consistently.

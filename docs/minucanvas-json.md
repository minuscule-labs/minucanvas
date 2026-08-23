# MinuCanvas JSON

MinuCanvas JSON is a JSON Canvas-compatible document shape with MinuCanvas extensions for modern diagram editing.

The goal is to keep the simple `nodes` + `edges` foundation while preserving richer canvas features such as shapes, styling, precise connector anchors, groups, images, locking, and export behavior.

## Document

Current documents are stored as JSON Canvas-compatible `nodes` and `edges`:

```ts
type JsonCanvasDocument = {
  nodes: CanvasNode[]
  edges: CanvasEdge[]
}
```

The public `MinuCanvasDocument` type is currently an alias for this shape:

```ts
type MinuCanvasDocument = JsonCanvasDocument
```

The name clarifies intent: a MinuCanvas document is JSON Canvas at the core plus optional MinuCanvas editing extensions on nodes and edges. For now, `nodes` and `edges` remain top-level for JSON Canvas compatibility. Host apps can wrap the document with their own file metadata, kind/profile, viewport, or version fields.

## Node

Base JSON Canvas-compatible fields:

```ts
type CanvasNode = {
  id: string
  type: 'text' | 'file' | 'link' | 'group' | 'image'
  x: number
  y: number
  width: number
  height: number
  text?: string
  file?: string
  url?: string
  label?: string
  color?: string
  background?: string
}
```

### MinuCanvas node extensions

```ts
type CanvasNode = {
  shape?: CanvasShape
  style?: CanvasNodeStyle
  groupId?: string
  frame?: boolean
  locked?: boolean
  imageWidth?: number
  imageHeight?: number
  imageStatus?: 'uploading' | 'failed'
  imageError?: string
}
```

### Node types

| Type | Meaning |
| --- | --- |
| `text` | Text or shape node. The visual shape is controlled by `shape`. |
| `link` | External/internal URL node. Uses `url`. |
| `file` | Generic file attachment node. Reserved for future broader file support. |
| `image` | Image node. Uses `file` or `url` as source. Current editor convenience type; a slimmer future spec could normalize images to `file` plus media metadata. |
| `group` | Group/container node. Child nodes reference it via `groupId`. |

### Shapes

```ts
type CanvasShape =
  | 'text'
  | 'rectangle'
  | 'rounded-rectangle'
  | 'pill'
  | 'diamond'
  | 'ellipse'
  | 'parallelogram'
  | 'hexagon'
```

`shape: 'text'` renders text without a visible container by default.

### JSON Canvas colors

The standard JSON Canvas preset tokens `"1"` through `"6"` are supported on node and edge `color` fields. They resolve to theme-aware red, orange, yellow, green, cyan, and purple colors while rendering. Explicit CSS colors, including hexadecimal values, remain unchanged.

MinuCanvas preserves preset tokens in the document; it does not replace them with hexadecimal colors during editing or JSON serialization. Standalone SVG and PNG exports resolve presets to concrete light- or dark-mode colors. The same resolver is used by nodes, edges, arrowheads, style-toolbar previews, and exports.

Hosts can customize rendered presets with `--mc-json-canvas-color-1` through `--mc-json-canvas-color-6`. The public `resolveCanvasColor` helper is available for custom UI and renderers.

### Node style

```ts
type CanvasNodeStyle = {
  fill?: string
  stroke?: string
  text?: string
  strokeWidth?: number
  strokeStyle?: 'solid' | 'dashed' | 'dotted' | 'sketch'
  borderRadius?: number
  opacity?: number
  fontFamily?: string
  fontSize?: number
  fontWeight?: CSSProperties['fontWeight']
  textAlign?: CSSProperties['textAlign']
}
```

### Groups and frames

Groups are represented as normal nodes with `type: 'group'`.

Children reference the group by ID:

```json
{
  "id": "child-1",
  "type": "text",
  "groupId": "group-1"
}
```

Group behavior:

- Clicking a grouped child selects/moves the group unless the group is actively being edited.
- Double-clicking a group enters group editing.
- Group bounds can auto-fit around children.
- Group labels render above-left of the group box.

Frames use the same container primitive with `type: 'group'` and `frame: true`:

```json
{
  "id": "frame-1",
  "type": "group",
  "frame": true,
  "label": "Frame"
}
```

Frames are intentionally frame-like groups for now: they provide a visible organization/export region while reusing group movement, resizing, child membership, and edit-mode behavior. Plain groups are treated as transform relationships and are visually de-emphasized unless selected, active, or editing.

### Images

Image nodes use `type: 'image'` and store the source in `file` or `url`:

```json
{
  "id": "image-1",
  "type": "image",
  "file": "https://example.com/image.png",
  "label": "image.png",
  "x": 100,
  "y": 100,
  "width": 640,
  "height": 360,
  "imageWidth": 1280,
  "imageHeight": 720
}
```

`imageWidth` and `imageHeight` are the natural dimensions when known.

`imageStatus` and `imageError` are intended for transient upload/error UI. Hosts may persist them, but durable saved documents should generally omit successful transient status fields.

## Edge

Base fields:

```ts
type CanvasEdge = {
  id: string
  fromNode: string
  toNode: string
  fromSide?: 'top' | 'right' | 'bottom' | 'left'
  toSide?: 'top' | 'right' | 'bottom' | 'left'
  label?: string
  color?: string
}

For a free-standing line/arrow that is not connected to nodes, MinuCanvas can store point endpoints instead:

```ts
type FreeCanvasEdge = CanvasEdge & {
  fromNode: ''
  toNode: ''
  fromPoint: { x: number; y: number }
  toPoint: { x: number; y: number }
}
```
```

### MinuCanvas edge extensions

```ts
type CanvasEdge = {
  fromPoint?: { x: number; y: number }
  toPoint?: { x: number; y: number }
  fromAnchor?: CanvasEdgeAnchor
  toAnchor?: CanvasEdgeAnchor
  fromEnd?: 'none' | 'arrow'
  toEnd?: 'none' | 'arrow'
  style?: CanvasEdgeStyle
  routingMode?: 'auto' | 'manual'
  waypoints?: Array<{ x: number; y: number }>
}
```

`fromPoint` and `toPoint` are optional free-standing endpoints for lines/arrows that are drawn directly on the canvas instead of attached to nodes.

`waypoints` are optional editable route points in canvas coordinates. When present, the edge renders through those points between the start and end anchors.

`routingMode: 'manual'` preserves user-positioned endpoints and waypoints when connected nodes move. `resetEdgeRoute(document, edgeId)` returns the edge to automatic endpoint placement and removes manual waypoints.

`fromEnd` and `toEnd` control arrowheads independently. For backwards compatibility, omitted values resolve as `fromEnd: 'none'` and `toEnd: 'arrow'`. Set both to `arrow` for a bidirectional connector, or both to `none` for a plain line.

### Precise anchors

```ts
type CanvasEdgeAnchor = {
  side: 'top' | 'right' | 'bottom' | 'left'
  position?: number // 0..1 along the side; defaults to 0.5
}
```

`fromSide` and `toSide` are retained for compatibility and simple consumers. `fromAnchor` and `toAnchor` are the richer MinuCanvas fields; when `position` is omitted, consumers should attach at the midpoint of the side.

### Edge style

```ts
type CanvasEdgeStyle = {
  stroke?: string
  strokeWidth?: number
  strokeStyle?: 'solid' | 'dashed' | 'dotted' | 'sketch'
  routing?: 'straight' | 'curved' | 'elbow' // defaults to 'elbow'
  opacity?: number
}
```

## Document profiles

Profiles describe editor behavior/layout around the base document without replacing the node/edge schema.

Built-in profiles:

```ts
import {
  standardCanvasProfile,
  mindMapCanvasProfile,
  applyCanvasDocumentProfileLayout,
} from '@dpklabs/minucanvas'
```

A host app can store a wrapper like:

```ts
type CanvasFile = {
  id: string
  title: string
  kind: 'canvas' | 'mindmap' | string
  document: MinuCanvasDocument
  profileOptions?: Record<string, unknown>
}
```

Then render with:

```tsx
<MinuCanvas
  value={file.document}
  onChange={setDocument}
  documentProfile={file.kind === 'mindmap' ? mindMapCanvasProfile : standardCanvasProfile}
/>
```

For mind maps, the profile supplies `interactionMode: 'mindmap'`; `applyCanvasDocumentProfileLayout(document, mindMapCanvasProfile, options)` applies the same layout utility behind the profile.

## Persistence guidance

Recommended persisted fields:

- `nodes`
- `edges`
- all semantic/layout/style fields
- image natural dimensions
- group membership
- lock state

Recommended transient fields:

- `imageStatus`
- `imageError`
- active selection
- active group editing state
- viewport, unless a host explicitly wants to save it separately

## Strict JSON Canvas export

If strict JSON Canvas compatibility is needed later, add an exporter that maps/strips MinuCanvas extensions:

- Remove `style`, `shape`, `groupId`, `locked`, image metadata, precise anchors.
- Map `style.stroke` to `color` where possible.
- Map `shape` to generic text/group/file/link semantics where possible.
- Use `fromSide` / `toSide` as fallback for anchors.

This export will be lossy. Full fidelity requires MinuCanvas JSON.

## Relationship to diagram syntax

The proposed MinuCanvas diagram syntax compiles into MinuCanvas JSON. The syntax is optimized for authors and LLMs; MinuCanvas JSON is optimized for persistence and rendering.

See [`minu-diagram-syntax.md`](./minu-diagram-syntax.md).

# MinuCanvas Diagram Syntax Proposal

This is a proposed LLM-friendly diagram-as-code syntax for generating MinuCanvas JSON. It is inspired by Eraser's diagram syntax, but scoped to the diagram types and canvas primitives MinuCanvas currently supports.

## Goals

- Easy for humans and LLMs to write.
- Deterministic enough to compile into `JsonCanvasDocument`.
- Compatible with current MinuCanvas primitives: text, links, images, shapes, groups, arrows, lines, styles.
- Extendable later for ERD, sequence, architecture, and BPMN-style diagrams without redesigning the core.

## MVP scope

Supported first:

- Flow/box-arrow diagrams
- Mind map layout mode
- Nodes
- Groups
- Connections
- Direction hints
- Basic styling
- Labels distinct from IDs

Deferred:

- ERD-specific cardinality
- Sequence lifelines/activations
- Cloud icon libraries
- BPMN pools/lanes
- Full HTML/rich text import

## Recommended syntax

### Diagram header

```txt
diagram "Signup flow" {
  direction right

  Start [shape: pill]
  Form [label: "Signup form"]
  Valid [shape: diamond, label: "Valid?"]
  Done [shape: pill]

  Start > Form
  Form > Valid
  Valid > Done: yes
}
```

The outer `diagram` block is optional for single-diagram documents, but recommended for imports and LLM output.

### Nodes

```txt
NodeId [shape: rectangle, label: "Human label", color: blue]
```

- Node IDs must be unique.
- If `label` is omitted, the visible label defaults to the node ID.
- IDs can contain spaces if quoted:

```txt
"Signup Form" [shape: rectangle]
```

### Supported MVP shapes

Map syntax shapes to current MinuCanvas shapes:

| Syntax | MinuCanvas shape/type |
| --- | --- |
| `text` | `shape: text` |
| `rectangle`, `rect` | `rectangle` |
| `rounded`, `card` | `rounded-rectangle` |
| `pill`, `oval` | `pill` |
| `diamond`, `decision` | `diamond` |
| `ellipse`, `circle` | `ellipse` |
| `parallelogram` | `parallelogram` |
| `hexagon` | `hexagon` |

Later aliases can map unsupported Eraser shapes like `cylinder`, `document`, `star`, `trapezoid`, `triangle` once MinuCanvas supports them.

### Links and images

Any node can carry a generic external `url` while keeping its normal node type and shape:

```txt
Research [shape: text, url: "https://docs.example.com/research"]
```

Use `type: link` when the link itself is the primary canvas object, and `type: image` for image URLs:

```txt
Docs [type: link, url: "https://docs.example.com", label: "Docs"]
Screenshot [type: image, url: "https://example.com/screenshot.png"]
```

### Groups

```txt
Backend {
  API [shape: rectangle]
  DB [shape: cylinder, label: "Database"]
}
```

Group properties:

```txt
Backend [label: "Backend services", color: blue] {
  API
  DB
}
```

Nested groups should be allowed in the grammar, but initial layout can be simple.

### Connections

Eraser-style operators are concise and LLM-friendly. We should support them:

| Syntax | Meaning |
| --- | --- |
| `A > B` | arrow from A to B |
| `A < B` | arrow from B to A |
| `A <> B` | bidirectional arrow, later maybe two arrows or an edge style |
| `A - B` | plain line |
| `A -- B` | dotted/dashed plain line |
| `A --> B` | dashed arrow |

Operators are tokenized atomically. The common `A -> B` spelling is not supported; use canonical `A > B`. It produces an `unsupported_operator` error rather than being split into a line and a literal `>` node.

Labels:

```txt
A > B: request
B > A: response [style: dashed, color: green, routing: elbow]
```

Branching:

```txt
Issue > Bug, Feature
```

Chaining:

```txt
Start > Form > Valid > Done
```

If a referenced node does not exist, the compiler should create a default node with that ID/label.

### Direction

```txt
direction right
```

Allowed:

- `down`
- `up`
- `right`
- `left`

This is a layout hint, not a hard guarantee. Flow layout places nodes by graph depth in the chosen direction.

### Layout

Minu diagram syntax uses one language with multiple layouts. The syntax describes nodes and relationships; the selected `layout` decides how those relationships are arranged and styled.

Supported layouts:

| Layout | Use for | Relationship meaning |
| --- | --- | --- |
| `layout flow` | process diagrams, app flows, system diagrams, decision trees | `A > B` means A leads to B |
| `layout mindmap` | brainstorming, outlines, topic trees, knowledge maps | `A > B` means B is a branch/topic under A |

Flow layout is the default.

#### Flow layout

```txt
diagram "Login flow" {
  layout flow
  direction right

  Start [shape: pill]
  Login [label: "Login form"]
  Valid [shape: diamond, label: "Valid?"]
  Dashboard [shape: pill]
  Error [shape: text, label: "Show error"]

  Start > Login
  Login > Valid
  Valid > Dashboard: yes
  Valid > Error: no [style: dashed]
  Error > Login
}
```

Flow layout behavior:

- Edges represent directional flow: A happens before, calls, leads to, or depends on B.
- `direction right/down/up/left` controls the main progression.
- Nodes are arranged by graph depth in the chosen direction.
- Branches, cycles, and decision nodes are allowed.
- Arrowheads are kept by default.
- Connector routing defaults to diagram-like elbow routing unless `routing` is specified.

Use flow layout when the mental model is:

```txt
A happens, then B happens, then C happens.
```

#### Mind map layout

Use `layout mindmap` for a tree-style mind map arrangement:

```txt
diagram "Product plan" {
  layout mindmap

  Product
  Product > Research
  Product > Build
  Product > Launch
  Research > Interviews
  Research > Competitors
  Build > Prototype
  Build > MVP
}
```

Mind map layout behavior:

- The document is still normal MinuCanvas / JSON Canvas nodes and edges.
- Edges represent parent-to-child topic branches.
- The root is selected from the first node with no incoming edge, or the first node if every node has an incoming edge.
- Root children split left/right by default.
- Descendants continue outward on their branch side.
- Nodes default to text-note shapes, grow from their text content, and can still opt into explicit shapes such as `shape: pill`.
- Branch edges default to curved lines with no arrowheads.

Use mind map layout when the mental model is:

```txt
A contains or branches into B and C.
```

The same connection syntax has a different layout meaning. For example:

```txt
Product > Research
```

- In `layout flow`, Product leads to Research.
- In `layout mindmap`, Research is a branch/topic under Product.

There is intentionally no separate mind map language yet. If tree authoring becomes too verbose, a nested shorthand may be added later inside the same Minu diagram syntax:

```txt
diagram "Product plan" {
  layout mindmap

  Product {
    Research {
      Interviews
      Competitors
    }
    Build {
      MVP
      Beta
    }
  }
}
```

That shorthand is future syntax sugar only; the canonical compiled output should remain the same normal nodes and edges as explicit `Product > Research` connections.

The compiler also accepts mind map options:

```ts
const { document } = compileMinuDiagramSyntax(source, {
  layout: 'mindmap',
  mindMap: {
    rootId: 'Product',
    horizontalGap: 140,
    verticalGap: 32,
    splitRootChildren: true,
  },
})
```

For non-syntax use, host apps can call `layoutMindMap(document, options)` from the root package and then pass the returned document to `<MinuCanvas />`. Prefer `documentProfile={mindMapCanvasProfile}` when rendering mind maps so keyboard behavior, branch creation, and note editing use the mind map profile.

### Styling

Diagram-level defaults:

```txt
colorMode outline
styleMode plain
typeface clean
```

These directives are currently parsed but have no document behavior. Each emits an `unsupported_default` warning during compilation; use explicit node and edge styles until a default has defined behavior.

Node styles:

```txt
API [fill: "#1f2937", stroke: "#93c5fd", text: "#ffffff"]
```

Connection styles:

```txt
API > DB [color: "#93c5fd", style: dashed]
```

Recommended supported MVP properties:

| Property | Applies to | Notes |
| --- | --- | --- |
| `shape` | node | mapped to MinuCanvas shape |
| `type` | node | `text`, `link`, `image`, `file` later |
| `label` | node/group/edge | visible label |
| `url` | link/image | source URL |
| `color` | node/edge | shorthand for stroke / line color |
| `fill` | node | node fill |
| `stroke` | node | node stroke |
| `text` | node | text color |
| `style` | edge | `solid`, `dashed`, `dotted`, `sketch` |
| `routing` | edge | `elbow`, `straight`, `curved`; defaults to `elbow`. |
| `width`, `height` | node | optional explicit dimensions |

## Example MVP input

```txt
diagram "Auth flow" {
  direction right
  colorMode outline

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
}
```

## Compiler output

The compiler should produce:

```ts
type CompileResult = {
  document: JsonCanvasDocument
  /** Ephemeral geometry for passing alongside this exact document to MinuCanvas. */
  scene: ResolvedCanvasScene
  diagnostics: Array<{
    severity: 'warning' | 'error'
    code?: MinuDiagramDiagnosticCode
    message: string
    line?: number
    column?: number
    source?: string
    suggestion?: string
  }>
}
```

Diagnostics should warn on unsupported properties/shapes rather than failing whenever possible. Hosts must not persist or apply `document` when any diagnostic has `severity: 'error'`.

## Syntax discipline

Keep authored syntax small and canonical. Prefer `routing` for line/arrow shape:

```txt
A > B [routing: elbow]
A > B [routing: straight]
A > B [routing: curved]
```

The parser may accept a few LLM-friendly aliases such as `route` or `lineType`, but these are advanced compatibility conveniences, not recommended authoring style. Documentation, examples, and future syntax export should emit canonical `routing`.

## API

The syntax compiler is owned by the MinuCanvas package but kept separate from the React editor UI:

```ts
import { compileMinuDiagramSyntax, parseMinuDiagramSyntax } from '@dpklabs/minucanvas/syntax'
import { applyCanvasDocumentProfileLayout, layoutMindMap, mindMapCanvasProfile } from '@dpklabs/minucanvas'

const parsed = parseMinuDiagramSyntax(source, { strict: true })
const { document, scene, diagnostics } = compileMinuDiagramSyntax(source, { strict: true })
if (diagnostics.some(({ severity }) => severity === 'error')) {
  // Show diagnostics and do not persist or apply the generated document.
}
// `scene` is ephemeral derived geometry. Pass it with its exact document to
// render generated routes; MinuCanvas safely ignores it after document edits.
;<MinuCanvas value={document} resolvedScene={scene} onChange={setDocument} />
const mindMapDocument = layoutMindMap(document, { rootId: 'Product' })
const profileMindMapDocument = applyCanvasDocumentProfileLayout(document, mindMapCanvasProfile, { rootId: 'Product' })
```

The root package also re-exports these helpers for convenience.

Strict mode rejects unsupported explicit declarations, malformed property blocks and connections, invalid directives, unmatched braces, and ambiguous unquoted multiword IDs. Permissive mode remains the default for compatibility, but unsupported compound operators are rejected safely in both modes.

## Phased implementation

### Phase 1: Parser and flow compiler

Status: initial implementation exists in `src/syntax`.

- Parse diagram block or loose statements.
- Parse `layout flow` and `layout mindmap`.
- Parse node declarations with properties.
- Parse group blocks.
- Parse connections with labels and simple styles.
- Auto-create referenced nodes.
- Produce a basic layered layout from `direction`.
- Produce a basic tree layout for mind maps.

### Phase 2: Import/export UI

- Add API helpers:
  - `parseMinuDiagramSyntax(source)`
  - `compileMinuDiagramSyntax(source)`
  - maybe `documentToMinuDiagramSyntax(document)` later
- Add a dev/demo import panel.

### Phase 3: More diagram families

Add explicit modes later:

```txt
erd "Data model" { ... }
sequence "Checkout" { ... }
architecture "AWS" { ... }
```

These can reuse shared properties, groups, styles, and labels.

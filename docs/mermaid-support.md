# Mermaid flowchart import

MinuCanvas can compile a documented Mermaid flowchart subset into editable native JSON Canvas nodes, edges, and groups. This is source import, not SVG rendering or source synchronization.

The optional API is isolated in its own package entry and is asynchronous:

```ts
import { compileMermaidSyntax } from '@dpklabs/minucanvas/mermaid'

const result = await compileMermaidSyntax(`flowchart LR
  start["Start"] --> choice{Choose}
  choice -->|yes| done([Done])
  choice -. retry .-> start
`)

if (!result.success) {
  showDiagnostics(result.diagnostics)
  // Keep the current canvas unchanged.
} else {
  setValue(result.document)
  canvasRef.current?.fitView()
}
```

`parseMermaidSyntax(source, options)` is also exported when a host needs the normalized graph without layout or canvas object creation.

## Compatibility target

The parser integration is pinned to `mermaid-parser-bundle@0.2.1`, whose flowchart parser is built from Mermaid 11.17.2. MinuCanvas owns runtime checks and executable fixtures around the FlowDB fields it consumes.

Supported:

- `flowchart` and `graph` headers.
- Omitted direction and `TB`/`TD`, `BT`, `LR`, and `RL`.
- Explicit and implicit nodes, quoted labels, Unicode, `%%` comment lines, and newline or semicolon separators.
- Rectangle (`[]`), rounded rectangle (`()`), stadium (`([])`), diamond (`{}`), circle (`(())`), and hexagon (`{{}}`) nodes.
- Directed (`-->`), undirected (`---`), bidirectional (`<-->`), and dotted edges, with optional labels.
- Chains, branching with `&`, repeated declarations, parallel edges, cycles, and self-loops.
- Named subgraphs, nesting, and edges between nodes in different subgraphs.

The same source and options produce deterministic native IDs and output. Node IDs are retained. Imported source is not retained or updated when users edit the resulting canvas.

## Mapping

| Mermaid | Native canvas |
| --- | --- |
| Rectangle | `rectangle` node |
| Rounded rectangle | `rounded-rectangle` node |
| Stadium | `pill` node |
| Diamond | `diamond` node |
| Circle | Equal-width/height `ellipse` node |
| Hexagon | `hexagon` node |
| `-->` | Solid edge with end arrow |
| `---` | Solid edge without arrows |
| `<-->` | Solid edge with arrows at both ends |
| Dotted link | Edge with `strokeStyle: 'dotted'` |
| Subgraph | Native fitted group |

Mermaid coordinates and renderer styling are intentionally not preserved. MinuCanvas uses its shared Dagre/compiler pipeline.

## Fail-closed behavior

Compilation returns a discriminated result. A failure has diagnostics and no `document`, preventing accidental import of a partial graph.

The initial subset rejects:

- Empty flowcharts with no nodes or groups.
- Non-flowchart diagram families.
- Frontmatter and `%%{...}%%` initialization/configuration directives.
- `style`, `classDef`, `class`, `linkStyle`, and click/action statements.
- HTML or Markdown labels, icons, images, and advanced node metadata.
- Unsupported node shapes and edge forms.
- Subgraph-local directions and edges targeting subgraphs.
- Explicit edge IDs, animation, custom interpolation, presentation styling, and accessibility metadata such as `accTitle` or `accDescr`.

Diagnostics include line and column when the parser or source inspection provides a real location. Semantic diagnostics do not invent source positions.

## Limits

Defaults are enforced before parsing or layout:

| Limit | Default |
| --- | ---: |
| Source characters | 100,000 |
| Native nodes, including groups | 500 |
| Edges | 1,000 |
| Subgraph nesting | 16 |

Override them with `maxSourceLength`, `maxNodes`, `maxEdges`, and `maxNesting`. Before invoking Mermaid, the adapter also conservatively bounds explicit edge operators and `&` branching separators to prevent compact Cartesian branching expressions from expanding far beyond `maxEdges`. Hosts should generally lower these values rather than raising them for untrusted input.

## Packaging and runtime

The `@dpklabs/minucanvas/mermaid` entry supports ESM, CJS, and declarations. Its parser is bundled into that entry as a build-time dependency, is not installed separately in consumers' runtime dependency trees, and is absent from the root and `./syntax` JavaScript outputs. Browser hosts should lazy-load the optional entry when Mermaid import is requested:

```ts
const { compileMermaidSyntax } = await import('@dpklabs/minucanvas/mermaid')
```

The same async API runs in plain Node, allowing a server or agent harness to compile Mermaid and then persist `result.document` as ordinary JSON Canvas.

## AI generation guidance

Ask the model to emit only Mermaid flowchart syntax with explicit node IDs and quoted plain-text labels. Use only the documented shapes and edge forms. Avoid styling, classes, directives, actions, HTML, Markdown labels, icons, and images.

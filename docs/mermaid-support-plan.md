# Mermaid syntax support plan

Status: core parser adapter, shared compilation, package entry, demo integration, and automated verification implemented; final manual release QA remains. See [Mermaid flowchart parser evaluation](./mermaid-parser-evaluation.md) and [Mermaid flowchart import](./mermaid-support.md).

## Decision

Add standard Mermaid syntax as another input to native MinuCanvas objects. Keep JSON Canvas authoritative and preserve the existing Minu syntax API. Start with an explicitly documented flowchart subset; do not claim full Mermaid compatibility.

```text
Minu syntax → existing parser ───────────┐
                                        ├→ shared graph compilation → Canvas JSON + scene
Mermaid → parser → normalization adapter ┘
```

This is source import, not SVG embedding, Mermaid rendering, or bidirectional source synchronization. Imported objects remain editable with existing canvas tools.

## Repository baseline

- `src/syntax/parse.ts` parses Minu syntax.
- `src/syntax/types.ts` defines `ParsedMinuDiagram`, compile options, and diagnostics.
- `src/syntax/compile.ts` exposes `compileParsedMinuDiagram` and handles native object creation, Dagre layout, group fitting, and scene resolution.
- `src/engine/validate.ts` validates the parsed graph, but also contains Minu-specific property validation.
- `dev/App.tsx` demonstrates syntax import.
- `package.json` publishes root and `./syntax` entry points, including ESM, CJS, and declarations.

Reuse the compiler pipeline rather than translating Mermaid into Minu source strings. Audit parser-specific validation before feeding it normalized Mermaid data.

## Initial compatibility contract

Target a pinned Mermaid version and publish a syntax-to-canvas mapping table with executable fixtures.

### Required for v1

- `flowchart` and `graph` headers.
- `TB`/`TD`, `BT`, `LR`, and `RL` directions; omitted direction follows Mermaid semantics, not Minu's default.
- Explicit and implicit nodes, quoted labels, Unicode, comments, newline and semicolon statement separators.
- Standard rectangle, rounded rectangle, stadium, diamond, circle, and hexagon forms.
- Directed, undirected, bidirectional, and dotted edges; edge labels; chains and branching shorthand.
- Repeated references and declarations resolved according to the pinned Mermaid semantics, rather than incorrectly reported as duplicate nodes.
- Parallel edges and self-loops without loss of graph connectivity.
- Named subgraphs mapped to native groups, including nesting and cross-group node edges.
- Deterministic native IDs and output for identical source and options.

Circle nodes must retain equal width and height. Node IDs must be preserved where possible; generated group and edge IDs must avoid collisions. Stable identity across arbitrary source edits is not promised.

### Explicitly outside v1

- Other diagram families: mind maps, sequence diagrams, ERDs, state diagrams, Gantt, and others.
- Mermaid rendering parity, layout engine selection, or exact coordinates.
- Subgraph-local directions and edges targeting subgraphs themselves.
- CSS, `style`, `classDef`, `class`, `linkStyle`, themes, and advanced/new shape syntax.
- Click actions, callbacks, embedded HTML, Markdown label formatting, icons, images, and external resource loading.
- Frontmatter, initialization/configuration directives, and accessibility metadata such as `accTitle` or `accDescr`.
- Mermaid export, source round-tripping, or updating an existing canvas in place.
- New Minu-specific Mermaid grammar extensions.

Unsupported semantic or structural constructs produce errors. Unsupported presentation features also produce explicit diagnostics; any warning-based fallback must be individually documented and tested, never silently applied. Initial default: fail closed rather than import an incomplete diagram.

Host-specific note links and metadata stay outside the source language. Hosts may attach them to compiled nodes by ID using existing integration APIs; adding a new metadata API is not required for v1.

## Phase 1 — Parser and compatibility spike

Evaluate maintained Mermaid parsing options before writing a new grammar. Do not assume a package named Mermaid parser supports flowcharts or offers a stable flowchart AST.

Check:

1. Flowchart grammar coverage and access to nodes, edges, subgraphs, and source locations.
2. Whether unsupported constructs remain visible for diagnostics rather than being discarded.
3. Browser and plain Node execution without DOM, rendering, network access, or global mutable configuration.
4. ESM/CJS integration, license, maintenance, dependency size, and bundle impact.
5. Safe handling of malformed/untrusted input and reasonable input limits.

Use a fixture corpus covering every required feature, every excluded feature, ambiguous punctuation in labels, and repeated declarations. Compare accepted cases against the pinned Mermaid reference implementation in development tests where feasible.

**Deliverable:** record the selected parser, exact version, limitations, measured bundle delta, and whether the public API must be asynchronous. Prefer a maintained parser with a usable AST. If only unstable internals or a bespoke subset parser are viable, document the maintenance tradeoff and obtain agreement before proceeding. Do not use regex rewriting between languages.

**Exit gate:** prove source → normalized graph → native canvas for a branching flowchart and a nested-group example, in browser and Node, without rendering Mermaid.

## Phase 2 — Adapter, API, and failure behavior

Proposed public entry point: `@dpklabs/minucanvas/mermaid`, with `compileMermaidSyntax(source, options)`. Finalize synchronous versus asynchronous behavior after Phase 1; do not change the existing Minu API.

- Add a dedicated `src/mermaid/` module for parser integration, normalization, diagnostics, and exports.
- Map Mermaid semantics directly into the compiler's graph input. In particular, Mermaid `-->` is a solid arrow, whereas Minu `-->` denotes a dashed arrow; map edge meaning, not spelling.
- Reuse layout options such as origin, grid size, node gap, rank gap, and group padding. Do not expose the Minu mind-map override as Mermaid flowchart semantics.
- Reuse `compileParsedMinuDiagram` initially if safe. If necessary, extract a minimal format-neutral compilation layer while retaining all existing exports and types as compatible wrappers. Avoid a broad compiler rewrite.
- Keep Mermaid diagnostics independent of Minu's diagnostic-code union; normalize shared validator diagnostics into the Mermaid result contract.
- Return an explicit success/failure result. Success includes document, scene, and diagnostics. Failure includes diagnostics and no importable document.
- Include diagnostic code, severity, actionable message, and source location where available. Never invent line/column precision.
- Treat syntax and semantic errors as blocking before compilation/import. The existing compiler only directly gates on semantic errors, so merely passing parser diagnostics through is insufficient.
- Preserve source locations through normalization where the chosen parser supports them.
- Reject unsafe directives/actions; do not execute callbacks, inject HTML, fetch resources, or mutate global Mermaid settings.
- Define source-size, node-count, edge-count, and nesting limits before release. Enforce source limits before parsing and graph limits before layout; test boundary and over-limit inputs.

**Exit gate:** all required feature mappings and failure behavior have automated tests, with unchanged existing Minu tests.

## Phase 3 — Packaging and import demonstration

- Add a separate Mermaid build entry and package export; update `vite.config.ts` and package verification as needed.
- Avoid adding the Mermaid dependency to normal root/Minu-syntax imports. Verify actual bundle separation rather than relying on tree-shaking assumptions.
- Test the published ESM, CJS, and declaration surfaces, including any async parser-loading boundary.
- Add an explicit Minu/Mermaid format selector and examples in `dev/App.tsx`. Avoid ambiguous automatic detection in v1.
- Show diagnostics and replace the current demo canvas only on successful compilation. If compilation is asynchronous, prevent stale results from overwriting newer input.
- Demonstrate native selection, label editing, dragging, grouping, and connecting imported objects.

Production MinuNotes tools and host UI integrations live outside this package's scope and need separate follow-up work. Existing `*_from_syntax` consumers must not silently switch languages.

**Exit gate:** both formats work in the demo; failed Mermaid imports leave the current canvas untouched; packaged entry points work in browser and Node.

## Phase 4 — Verification and documentation

### Automated coverage

- Fixture matrix for headers, directions, shapes, labels/escaping, comments, separators, chains, branching, implicit nodes, declaration merging, and groups.
- Edge endpoints, labels, arrowheads, and solid/dotted styles asserted independently of layout coordinates.
- Parallel edges, cycles, self-loops, disconnected components, and nested/cross-group relationships.
- Unsupported families/features, malformed/truncated AI output, empty input, ID collisions, and resource limits.
- Security cases covering HTML, callbacks, configuration directives, and external URLs without execution or fetching.
- Deterministic output, valid references, finite dimensions/coordinates, and derived scene consistency.
- Browser demo failure-preservation tests and package-level plain Node smoke tests.
- Existing Minu syntax, canvas editing, and layout regression tests.

### Manual checks

Import representative small and larger AI-generated diagrams. Inspect readability, labels, edge direction, group bounds, and native editability. Record layout limitations; do not equate successful parsing with usable output.

### Commands

- `npm run typecheck`
- `npm test`
- `npm run check:release`

Update `scripts/verify-dist.cjs` to include the Mermaid entry before relying on release verification.

### Documentation

Add `docs/mermaid-support.md` with the pinned compatibility target, supported subset, examples, mapping/fallback rules, diagnostics, API usage, limits, and non-goals. Link it from `README.md` and `docs/mvp-usage.md`.

Provide a short AI generation instruction: emit only the documented Mermaid flowchart subset, use explicit node IDs and quoted labels, and avoid unsupported styling or directives.

## Definition of done

- Supported Mermaid source compiles into editable native canvas objects through shared layout/compiler infrastructure.
- Unsupported or invalid input cannot silently replace a canvas with a partial diagram.
- No Mermaid renderer or DOM is required for compilation.
- Existing Minu syntax and canvas document contracts remain compatible.
- Dedicated published entry point passes browser, Node, ESM/CJS, type, and release checks.
- Compatibility fixtures and user-facing documentation agree.
- Parser/dependency choice and measured costs are recorded.

## Follow-up decisions, not release blockers

After v1, compare Mermaid and Minu syntax on the same set of AI generation tasks: valid compilation rate, semantic accuracy, prompt overhead, and visual usability. Use that evidence to decide whether Mermaid becomes the recommended AI input. Keep Minu syntax supported during this evaluation.

Prioritize additional diagram families, styling, or host integrations based on actual demand rather than promising full Mermaid support upfront.

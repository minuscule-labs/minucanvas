# MinuCanvas Rendering Engine Plan

## Decision

Keep MinuCanvas, Minu Diagram syntax, and JSON Canvas as the product foundation. Adopt the strongest ideas from Eraser and similar tools as internal architecture patterns—not their document model or implementation.

The work should focus first on syntax-generated rendering quality:

1. semantic validation,
2. staged layout and routing,
3. measured content,
4. structural containers,
5. visual diagnostics, and
6. one resolved scene shared by the editor and exports.

Do not introduce another persisted diagram format. Authored `nodes[] + edges[]` remains the source of truth.

## Status

### Completed initial slice — release candidate

- Added a checked-in rendering corpus with directional, branching, cyclic, grouped, mind-map, and 50-/100-node fixtures.
- Added semantic validation with stable codes and property paths.
- Validation runs before layout and returns an empty document/scene for semantic errors.
- Preserved per-declaration identity/property metadata, including validation of overwritten invalid values.
- Added finite sizing fallbacks and bottom-up nested group fitting.
- Added generic `ResolvedCanvasScene`, `ResolvedNode`, and `ResolvedEdge` contracts.
- Retained Dagre-generated route points in the resolved scene without persisting them as manual waypoints.
- Preserved authored waypoints and `routingMode: "manual"` over generated routes.
- Verified the release candidate with 113 tests, typecheck, production build, distribution verification, and package dry-run.

The foundation and scene-backed rendering slice are suitable for a `0.8.0` release after versioning, committing, a clean release dry-run, and consumer smoke testing. The editor and SVG/PNG exports now consume Dagre's resolved routes when a matching compiled scene is supplied.

### Completed scene-backed rendering and export milestone

- Added render-neutral edge paths and route-aware label positions to `ResolvedCanvasScene`.
- Added experimental `resolvedScene` handoff to `MinuCanvas`; a deterministic authored-document fingerprint rejects stale scenes after edits or replacement.
- Switched live connector paths and SVG/PNG export to the same resolved edge geometry.
- Added `unsupported_default` warnings for currently unapplied diagram defaults.

## Current baseline

MinuCanvas already has important foundations:

- JSON Canvas-compatible persistence;
- a compact, agent-friendly syntax;
- separate parser and compiler modules;
- Dagre-based flow placement and a dedicated mind-map layout;
- interactive node and connector editing;
- explicit connector anchors and editable waypoints;
- groups, frames, host metadata, and linked nodes;
- SVG and PNG export;
- strict syntax diagnostics; and
- React rendering for a directly editable document.

The parser now rejects malformed syntax and semantic validation prevents invalid geometry, styles, identities, references, and containment from reaching layout. Geometry supports normalized orthogonal waypoints and manual route editing. The compiler returns an experimental resolved scene containing generated Dagre routes.

The remaining rendering limitations are architectural:

- A matching compiled scene supplies shared connector geometry to the live editor and SVG/PNG exports; documents without one use deterministic fallback geometry.
- Automatic fallback elbow routing considers only each edge's endpoints, not all obstacles.
- Node dimensions are estimated from character counts before layout.
- Groups fit bottom-up, but containers are not yet structural placement/routing inputs.
- Parsed diagram defaults (`colorMode`, `styleMode`, and `typeface`) remain unapplied and emit `unsupported_default` warnings until behavior is defined.
- Live React rendering and SVG export still implement presentation separately.
- Compiler diagnostics describe syntax and semantic problems, not visual problems such as crossings or overflow.

## Product principles

1. **Preserve portability.** Persist ordinary JSON Canvas with optional MinuCanvas extensions.
2. **Preserve editability.** Generated diagrams must remain normal interactive canvases.
3. **Separate intent from resolution.** Authored dimensions, anchors, and routes are distinct from measured or generated geometry.
4. **Progressive control.** Automatic placement and routing are defaults; explicit coordinates, sizes, anchors, and manual routes always win.
5. **Keep the core deterministic.** Pure compilation must work without a browser. Browser measurement is an enhancement, not a requirement for parsing or server-side use.
6. **Return actionable diagnostics.** Humans and agents should be able to identify and repair a specific source property or visual conflict.
7. **Avoid premature component systems.** Rendering correctness is more valuable now than a custom template vocabulary.

## Target pipeline

```text
Minu Diagram syntax or JSON Canvas
              ↓
        authored document
              ↓
semantic validation + source diagnostics
              ↓
 intrinsic size estimates / measurements
              ↓
 initial node placement
              ↓
 bottom-up container resolution
              ↓
 batch obstacle-aware edge routing
              ↓
 route-aware label placement
              ↓
 visual validation
              ↓
          resolved scene
          ↙          ↘
 React editor        SVG / PNG export
```

The authored document remains unchanged unless the user explicitly applies a layout. The resolved scene is derived and replaceable.

## Proposed engine boundaries

Add small modules rather than extending `MinuCanvas.tsx` further:

```text
src/engine/
  types.ts          authored/resolved contracts and diagnostic types
  validate.ts       semantic and document validation
  measure.ts        measurement interface and deterministic fallback
  layout.ts         layout adapter interface and Dagre adapter
  containers.ts     containment graph and bottom-up bounds
  route.ts          router interface and batch routing coordinator
  labels.ts         route-aware edge-label placement
  diagnostics.ts    overlap/crossing/overflow checks
  resolve.ts        staged pipeline coordinator
  scene.ts          render-neutral scene primitives
  export.ts         SVG serialization from the scene
```

Suggested public/internal contracts:

```ts
interface CanvasMeasurementProvider {
  measureNode(node: CanvasNode): Promise<{ width: number; height: number }>
  measureEdgeLabel(edge: CanvasEdge): Promise<{ width: number; height: number }>
}

interface CanvasLayoutEngine {
  layout(input: LayoutInput): LayoutResult
}

interface CanvasRouter {
  route(input: RoutingInput): RoutingResult
}

interface ResolvedCanvasScene {
  document: JsonCanvasDocument
  nodes: ResolvedNode[]
  edges: ResolvedEdge[]
  bounds: Rect
  diagnostics: CanvasDiagnostic[]
}

interface ResolvedEdge {
  id: string
  points: Point[]
  labelBounds?: Rect
}
```

`CanvasEdge.waypoints` continues to represent authored/manual route intent. Automatically generated route points belong in `ResolvedEdge.points`; they should not silently become sticky manual waypoints.

Keep `compileMinuDiagramSyntax()` synchronous and deterministic. Add a separate asynchronous resolver for browser-measured scenes:

```ts
const compiled = compileMinuDiagramSyntax(source, { strict: true })
const scene = await resolveCanvasDocument(compiled.document, {
  measurementProvider,
  layout: 'flow',
})
```

The editor can call the resolver after mounting. Headless consumers can use the deterministic fallback measurement provider.

## Implementation phases

### Phase 0 — Rendering corpus and quality gates

Create a checked-in corpus before changing algorithms.

Include:

- left, right, up, and down flows;
- fan-in and fan-out graphs;
- cycles and back edges;
- parallel and bidirectional edges;
- mixed node shapes and dimensions;
- long text, long unbroken words, Unicode, and multiline labels;
- sibling and nested groups;
- edges entering, leaving, and crossing groups;
- disconnected components;
- mind maps with uneven branch depth; and
- 50- and 100-node stress fixtures.

Add invariant tests for:

- node overlap;
- edge segments crossing unrelated node interiors;
- invalid or non-finite geometry;
- nodes escaping their declared containers;
- deterministic output;
- source diagnostics retaining line/property context; and
- equivalent edge and node geometry in editor and export scenes.

Use deterministic JSON geometry snapshots for most tests. Keep image snapshots to a small set of high-value integration fixtures.

**Exit criteria:** known bad examples are reproducible and the suite can measure improvement without subjective inspection.

### Phase 1 — Semantic correctness and diagnostics

Add validation after parsing and before layout.

Validate:

- one document-wide namespace for node and group IDs;
- valid node types, shapes, routing modes, stroke styles, and directive values;
- allowed properties by node, group, connection, and directive;
- finite positive width/height values;
- finite non-negative stroke widths;
- valid group references and an acyclic containment tree;
- valid connection endpoints; and
- implemented defaults only.

Expand stable diagnostic codes, for example:

```text
unknown_property
invalid_property_value
duplicate_id
unknown_reference
invalid_group_reference
containment_cycle
unsupported_default
```

Diagnostics should include severity, stable code, line/column when syntax is the source, a property path when available, source excerpt, and a repair suggestion.

Apply supported defaults during compilation. Until a default has real behavior, reject or warn on it rather than silently accepting it.

**Exit criteria:** malformed semantic input never produces `NaN`, duplicate React keys, ambiguous references, or silent no-ops.

### Phase 2 — Resolved scene and renderer extraction

Introduce the render-neutral scene before replacing algorithms.

1. Extract node geometry, edge paths, markers, labels, and bounds from `MinuCanvas.tsx` into engine modules.
2. Resolve the current algorithms into `ResolvedCanvasScene` first; behavior should remain unchanged.
3. Make both React and SVG export consume the same resolved nodes, edge points, and label positions.
4. Keep interaction state, selection, pointer handling, and editor commands in React.
5. Retain current public exports while the new API is marked experimental.

This phase reduces risk: later router and measurement changes happen behind one boundary instead of being implemented twice.

**Exit criteria:** existing visual behavior is preserved, `MinuCanvas.tsx` no longer owns export geometry, and editor/export geometry is generated by the same scene resolver.

### Phase 3 — Layout and first batch routes

Improve generated diagrams without waiting for the final router.

1. Extend the Dagre adapter to return node placement and edge paths.
2. Translate Dagre edge paths into `ResolvedEdge.points`.
3. Preserve explicit/manual anchors and waypoints over generated routes.
4. Derive automatic port sides from the selected layout direction and actual route approach.
5. Add deterministic separation for parallel edges and fan-in/fan-out ports.
6. Re-resolve automatic routes when a connected node moves or resizes; do not modify manual routes.

Dagre routes are an interim improvement and a baseline for router comparisons. They should not dictate the engine contract.

**Exit criteria:** ordinary syntax-generated edges no longer fall back to endpoint-only midpoint elbows, and direction-left/up diagrams use sensible forward anchors.

### Phase 4 — Structural containers

Replace post-layout group decoration with explicit containment processing.

1. Build and validate a containment tree.
2. Resolve child layouts deepest-first.
3. Fit group bounds bottom-up using already-resolved child groups.
4. Place sibling groups as graph units where appropriate.
5. Add group boundaries to routing obstacles.
6. Define policies for connections that cross container boundaries.
7. Keep frames and visual groups distinguishable where their behavior differs.

For the first implementation, nested local layouts plus parent placement are preferable to a complex all-at-once compound algorithm.

**Exit criteria:** nested groups fit correctly, sibling containers do not overlap in corpus fixtures, and routed edges intentionally cross container boundaries.

### Phase 5 — Obstacle-aware router

Implement or integrate behind `CanvasRouter`; do not couple persistence to one algorithm.

Required behavior:

- route all automatic edges as a batch;
- support orthogonal routes first;
- avoid expanded node and container rectangles;
- honor requested source/target sides;
- keep endpoint stubs clear of shapes;
- penalize bends, crossings, overlap with existing routes, and excessive length;
- separate parallel edges;
- produce deterministic routes; and
- return a diagnostic when no clean route is found.

Start with a visibility/grid graph plus A* or Dijkstra over orthogonal channels. Treat third-party routers, including Eraser's layout package, as benchmark experiments rather than permanent dependencies until API stability, bundle cost, licensing, and output quality are proven.

Fallback order:

1. obstacle-aware route;
2. Dagre-provided route for generated flow diagrams;
3. current endpoint elbow with an `unrouted_edge` warning.

**Exit criteria:** no edge crosses an unrelated node in the core corpus unless the router emits a specific degradation diagnostic.

### Phase 6 — Measurement and iterative resolution

Add actual content measurement without breaking headless compilation.

1. Centralize today's estimator as `DeterministicMeasurementProvider`.
2. Add a browser provider that measures the same node content and typography used by React.
3. Mark explicit width/height as authored constraints; measured content can report overflow or grow auto-sized generated nodes according to policy.
4. Resolve in bounded passes:

```text
estimate → place → measure → resize changed nodes
         → fit containers → route → place labels
         → reroute once if labels obstruct routes
```

5. Stop when geometry is stable within a tolerance or after a fixed pass limit.
6. Report `resolution_unstable` rather than looping indefinitely.
7. Document font-loading requirements and await font readiness before browser measurement.

**Exit criteria:** long, proportional, Unicode, and multiline text fixtures do not overflow, and layout remains deterministic with a fixed font set.

### Phase 7 — Visual diagnostics and agent repair loop

Run diagnostics over the resolved scene:

```text
node_overlap
edge_crosses_node
group_overlap
content_overflow
label_overlap
unrouted_edge
disconnected_component
resolution_unstable
```

Each diagnostic should identify affected IDs, relevant bounds or route segments, severity, and a suggested repair. Syntax-originated objects should retain source-line metadata long enough to map a visual problem back to the authored statement.

Expose diagnostics from compilation/resolution in structured form so MinuNotes agents can revise source and retry without interpreting screenshots.

**Exit criteria:** the rendering corpus has no unexpected error-level diagnostics, and intentionally impossible fixtures produce stable actionable errors.

## Delivery slices

Prefer small releases that each improve the current product:

| Slice | User-visible result |
| --- | --- |
| A | Semantic validation and stable diagnostic codes |
| B | Shared scene geometry for live rendering and export |
| C | Dagre routes retained for generated diagrams |
| D | Correct nested containers and group-aware routing inputs |
| E | Obstacle-aware orthogonal batch routing |
| F | Browser measurement and route-aware labels |
| G | Visual diagnostics exposed to hosts and agents |

Do not combine all phases into one rewrite.

## Compatibility and migration

- No migration is required for existing JSON Canvas documents.
- Existing manual `waypoints` and `routingMode: 'manual'` remain authoritative.
- Existing documents without route metadata use the latest automatic resolver.
- Generated route geometry is ephemeral unless an explicit "apply/freeze layout" action writes it into the document.
- If frozen, route provenance should be explicit rather than inferred only from the presence of waypoints.
- New diagnostics are additive, but strict mode may reject values previously accepted silently; call this out in release notes.
- Keep current synchronous compiler exports throughout the transition.

## Performance budgets

Establish budgets from the corpus rather than optimizing blindly. Initial targets on a typical development laptop:

- semantic validation: under 10 ms for 100 nodes;
- deterministic placement and routing: under 100 ms for 100 nodes / 150 edges;
- warm browser measurement and final resolution: under 250 ms for 100 nodes;
- no unbounded route or measurement passes; and
- identical deterministic geometry for repeated headless runs.

Measure route quality alongside latency; a fast route that crosses nodes is not a success.

## Non-goals for this effort

- replacing JSON Canvas persistence;
- adopting Eraser's entity/connection document model;
- introducing Chromium as a requirement for all consumers;
- building a general custom HTML component/template system;
- adding every architecture, BPMN, sequence, or ERD primitive;
- redesigning collaboration or host-link metadata; or
- rewriting all editor interactions before the engine boundary exists.

## Completed builder milestone — scene-backed rendering and export

### Outcome

The resolved scene is the shared geometry source for connector rendering and export without changing JSON Canvas persistence or editor interaction behavior.

### Completed work

1. **Complete the edge scene contract.** Extend `ResolvedEdge` with the render-neutral information needed to preserve current straight, elbow, curved, and manual rendering, including route/path geometry and label position. Avoid making React or SVG export independently reconstruct geometry.
2. **Accept an optional compiled scene.** Add a typed optional `resolvedScene` input to `MinuCanvas` so syntax consumers can pass `compileMinuDiagramSyntax(source).scene` alongside its document. Preserve `NodeExtra` and `EdgeExtra` generics.
3. **Reject stale scenes safely.** Use a supplied scene only when it corresponds to the current authored document. After an edit, resize, or document replacement, fall back to resolving fresh geometry rather than rendering stale points. Define and test the correspondence rule; do not rely only on matching array lengths.
4. **Move path and label geometry out of `MinuCanvas.tsx`.** Both live React edges and SVG/PNG export must consume the same resolved edge geometry. Keep selection, hit targets, endpoint handles, and pointer interactions in React.
5. **Preserve authored intent.** Manual waypoints and `routingMode: "manual"` remain authoritative. Generated Dagre routes remain derived and must not be written into `CanvasEdge.waypoints`.
6. **Expose unsupported defaults.** Add a stable `unsupported_default` warning for parsed `colorMode`, `styleMode`, and `typeface` directives until they have defined document behavior. Continue compiling because these are warnings, and update syntax documentation so the no-op is explicit.
7. **Update documentation.** Document how syntax callers pass `{ document, scene }` into the editor and clarify that the scene is ephemeral derived geometry.

### Tests

Add focused coverage for:

- straight, elbow, curved, generated Dagre, and manual routes;
- identical live/export path geometry from one scene;
- route-aware label placement;
- generated routes appearing in the live editor and SVG export;
- manual route precedence after scene integration;
- stale-scene rejection after move, resize, edge change, and document replacement;
- generic host node/edge metadata remaining typed;
- one `unsupported_default` warning per unsupported directive; and
- no mutation of the authored document during resolution or rendering.

### Non-goals

- obstacle-aware routing;
- browser text measurement;
- structural/compound container layout;
- visual overlap diagnostics;
- changing JSON Canvas persistence;
- freezing generated routes into authored waypoints; or
- broad editor interaction refactoring.

### Acceptance criteria

- Syntax-generated Dagre routes are visibly used by both the editor and exported SVG/PNG.
- Live and exported edges share one resolved path and label geometry implementation.
- Existing manual connector editing and all current tests remain green.
- Stale scenes cannot leave connectors detached from edited nodes.
- Unsupported diagram defaults are no longer silent.
- `npm test`, `npm run typecheck`, `npm run build`, `git diff --check`, and `npm run check:release` pass.

After this milestone, proceed to direction-aware ports and parallel-edge separation, then structural containers and obstacle-aware batch routing.

# Mermaid flowchart parser evaluation

Status: selected for the initial implementation.

## Decision

Use an exact pin of `mermaid-parser-bundle@0.2.1` behind the isolated `@dpklabs/minucanvas/mermaid` entry. It is the only evaluated package that exposes Mermaid's populated flowchart database without a renderer or DOM and runs in both plain Node and a real browser. MinuCanvas owns runtime contract checks and compatibility fixtures because the package exposes an untyped database built over Mermaid internals.

The adapter masks standard full-line `%%` comments while preserving line numbering, working around the candidate's comment parsing defect. Directives beginning with `%%{` remain explicitly rejected. The official standalone parser is not currently an alternative because it does not parse flowcharts.

## Candidates

| Candidate | Result | Details |
| --- | --- | --- |
| `@mermaid-js/parser@2.0.0` | Reject for v1 | Official, MIT, maintained, async ESM API, but its exported `DiagramAST` and `parse` overloads do not include flowcharts. Package requires Node >=22.12.0. |
| `mermaid@11.17.2` | Reject for import path | Official reference implementation and flowchart DB, MIT. The public package is renderer-oriented, has an 84 MB unpacked package, and a plain Node `getDiagramFromText` probe failed in text sanitization with `DOMPurify.addHook is not a function`. It also requires initialization that mutates Mermaid's global configuration. |
| `mermaid-parser-bundle@0.2.1` | Selected with safeguards | MIT, async ESM, Node >=20, 1.1 MB unpacked, no transitive production dependencies. Built from Mermaid 11.17.2 and exposes populated flowchart DB data. The full browser compilation spike emitted 1176.8 KiB raw / 314.2 KiB gzip JavaScript. Risks and safeguards are listed below. |
| `mermaid-parser@0.2.0` | Reject | GPL-3.0-or-later, last published in 2023, and its roadmap does not implement flowcharts. |
| `@a24z/mermaid-parser@1.0.0` | Reject | Validation-only; does not expose nodes, edges, or subgraphs. Published repository metadata points to a placeholder URL, so maintenance provenance is also unclear. |

Sizes above are package registry `dist.unpackedSize` values or measurements from the checked-in spike. They are not estimates of the final separate MinuCanvas entry, which does not exist yet.

## Candidate compatibility findings

`mermaid-parser-bundle@0.2.1` successfully exposes:

- `flowchart` and `graph` headers and direction.
- Explicit and implicit nodes, Unicode labels, and rectangle, rounded, stadium, diamond, circle, and hexagon node types.
- Directed, undirected, bidirectional, dotted, chained, and branching edges, including labels.
- Repeated declarations with Mermaid's final node label/shape and parallel edges retained.
- Self-loops.
- Named nested subgraphs and cross-group edges.
- Unsupported styling/action evidence in the DB, including node `styles`, `classes`, and `link`, so an adapter can fail closed rather than silently drop those features.
- Jison syntax error locations through the thrown error's `hash.loc` object.

Known risks and safeguards:

1. The candidate rejects standalone `%%` comments. The adapter masks only full-line Mermaid comments, preserves newlines, and tests comments as part of the supported contract. It does not mask `%%{` directives.
2. Successful flowchart DB entities do not expose source ranges. Diagnostics use parser/source-inspection locations when available and otherwise omit line/column.
3. The package types `db` as `unknown`; MinuCanvas owns and runtime-checks a small structural interface around every consumed `FlowDB` collection and field.
4. The package is a third-party all-diagram bundle built by wiring Mermaid parser/database internals. Exact version pinning and executable output fixtures detect contract drift.
5. It is ESM-only and asynchronous. MinuCanvas exposes an async API and bundles it into both the dedicated ESM and CJS entries.
6. The browser payload remains large for a parser-only optional entry. The parser is isolated from root and Minu syntax outputs so browser hosts can lazy-load it.
7. Directives, click behavior, HTML-like labels, styles, classes, accessibility metadata, and advanced metadata are detected and rejected before an importable document is returned.

## Reproducible spike

The spike is intentionally isolated from production exports. The candidate is an exact-version development dependency while evaluation continues.

```bash
npm run spike:mermaid:node
npm run spike:mermaid:browser
```

The Node runner verifies that `window` and `document` are absent. The browser runner builds the same fixtures with Vite, serves them locally, and executes them in headless Chrome/Chromium without invoking Mermaid rendering. Set `CHROME_BIN` when Chrome is not in a standard location.

Passing fixtures cover a branching flowchart and nested groups with repeated declarations. They assert extracted nodes, labels, shapes, edges, styles, direction, and group membership rather than merely accepting syntax.

## Follow-up opportunities

Request an upstream comment fix, a flowchart-only build, and exported FlowDB types. If parser payload or compatibility becomes unacceptable, replace the dependency behind the stable MinuCanvas adapter rather than changing the public import result contract. Existing Minu syntax remains unchanged.

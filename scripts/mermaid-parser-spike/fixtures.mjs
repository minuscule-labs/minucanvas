export const compatibilityFixtures = [
  {
    name: 'branching flowchart',
    source: `flowchart LR
  start["Start ✓"] --> choice{Choose}
  choice -->|yes| done([Done])
  choice -. no .-> retry((Retry))
  done --- retry`,
    expected: {
      type: 'flowchart-v2',
      direction: 'LR',
      nodes: [
        ['start', 'Start ✓', 'square'],
        ['choice', 'Choose', 'diamond'],
        ['done', 'Done', 'stadium'],
        ['retry', 'Retry', 'circle'],
      ],
      edges: [
        ['start', 'choice', 'arrow_point', 'normal', ''],
        ['choice', 'done', 'arrow_point', 'normal', 'yes'],
        ['choice', 'retry', 'arrow_point', 'dotted', 'no'],
        ['done', 'retry', 'arrow_open', 'normal', ''],
      ],
      groups: [],
    },
  },
  {
    name: 'nested groups and repeated declarations',
    source: `graph TD
  subgraph outer[Outer]
    a[First]
    subgraph inner[Inner]
      b{{Decision}}
    end
  end
  a --> b
  a[Renamed] --> b`,
    expected: {
      type: 'flowchart',
      direction: 'TB',
      nodes: [
        ['a', 'Renamed', 'square'],
        ['b', 'Decision', 'hexagon'],
      ],
      edges: [
        ['a', 'b', 'arrow_point', 'normal', ''],
        ['a', 'b', 'arrow_point', 'normal', ''],
      ],
      groups: [
        ['inner', 'Inner', ['b']],
        ['outer', 'Outer', ['a', 'inner']],
      ],
    },
  },
]

export function snapshotParseResult(result) {
  const db = result.db
  if (!db || typeof db.getVertices !== 'function' || typeof db.getEdges !== 'function' || typeof db.getSubGraphs !== 'function') {
    throw new Error(`Parser returned an incompatible ${result.type ?? 'unknown'} diagram database.`)
  }

  return {
    type: result.type,
    direction: db.getDirection(),
    nodes: [...db.getVertices().values()].map((node) => [node.id, node.text, node.type]),
    edges: db.getEdges().map((edge) => [edge.start, edge.end, edge.type, edge.stroke, edge.text]),
    groups: db.getSubGraphs().map((group) => [group.id, group.title, group.nodes]),
  }
}

export function assertFixture(actual, fixture) {
  const actualJson = JSON.stringify(actual)
  const expectedJson = JSON.stringify(fixture.expected)
  if (actualJson !== expectedJson) {
    throw new Error(`${fixture.name} did not match.\nExpected: ${expectedJson}\nActual:   ${actualJson}`)
  }
}

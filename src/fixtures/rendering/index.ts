export interface RenderingFixture {
  id: string
  source: string
  options?: { gridSize?: false }
}

function stressFixture(id: string, nodes: number): RenderingFixture {
  const declarations = Array.from({ length: nodes }, (_, index) => `N${index + 1} [label: "Service ${index + 1}"]`)
  const edges = Array.from({ length: nodes - 1 }, (_, index) => `N${index + 1} > N${index + 2}`)
  const fanOut = Array.from({ length: Math.min(25, nodes - 1) }, (_, index) => `N1 > N${index + 2}`)
  return { id, source: ['direction right', ...declarations, ...edges, ...fanOut].join('\n'), options: { gridSize: false } }
}

/** Checked-in syntax corpus for deterministic rendering/layout regression tests. */
export const RENDERING_FIXTURES: RenderingFixture[] = [
  {
    id: 'flow-directions',
    source: `
direction right
Start [shape: pill]
Decision [shape: diamond, label: "Continue?"]
Finish [shape: rounded]
Start > Decision > Finish
`,
  },
  {
    id: 'fan-and-cycle',
    source: `
direction down
Source > WorkerA, WorkerB, WorkerC
WorkerA, WorkerB, WorkerC > Join
Join > Source
`,
  },
  {
    id: 'parallel-and-bidirectional',
    source: `
direction right
Client > API: request
Client > API: retry
API <> Cache
`,
  },
  {
    id: 'mixed-content',
    source: `
direction down
Brief [label: "Multiline\\nUnicode: こんにちは 🌿", shape: text]
Decision [shape: diamond, width: 280, height: 180]
Long [label: "supercalifragilisticexpialidociouswithoutbreaks", width: 420]
Brief > Decision > Long
`,
  },
  {
    id: 'nested-containers',
    source: `
direction right
Platform [label: "Platform"] {
  Services [label: "Services"] {
    API
    Worker
  }
  Store
}
API > Store
Worker > Store
`,
  },
  {
    id: 'disconnected-components',
    source: `
direction left
A > B
C > D
`,
  },
  {
    id: 'uneven-mindmap',
    source: `
layout mindmap
Root > Research
Root > Build
Research > Interviews
Research > Competitors
Competitors > Pricing
Build > Prototype
`,
  },
  stressFixture('stress-50', 50),
  stressFixture('stress-100', 100),
]

export const FLOW_DIRECTIONS: RenderingFixture[] = ['right', 'left', 'down', 'up'].map((direction) => ({
  id: `direction-${direction}`,
  source: `direction ${direction}\nA > B > C`,
}))

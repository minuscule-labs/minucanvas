import { compileMermaidSyntax } from '../../../src/mermaid'
import { compatibilityFixtures } from '../fixtures.mjs'

async function run() {
  try {
    for (const fixture of compatibilityFixtures) {
      const result = await compileMermaidSyntax(fixture.source)
      if (!result.success) throw new Error(`${fixture.name} failed: ${JSON.stringify(result.diagnostics)}`)
      if (result.document.nodes.length !== fixture.expected.nodes.length + fixture.expected.groups.length) {
        throw new Error(`${fixture.name} produced an unexpected native node count.`)
      }
      if (result.document.edges.length !== fixture.expected.edges.length) {
        throw new Error(`${fixture.name} produced an unexpected native edge count.`)
      }
    }
    document.body.dataset.status = 'passed'
    document.body.textContent = `PASS browser; ${compatibilityFixtures.length} native canvas fixtures; no Mermaid renderer used`
  } catch (error) {
    document.body.dataset.status = 'failed'
    document.body.textContent = `FAIL ${error instanceof Error ? error.stack : String(error)}`
  }
}

void run()

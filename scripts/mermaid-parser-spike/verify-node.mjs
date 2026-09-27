import { parse } from 'mermaid-parser-bundle'
import { assertFixture, compatibilityFixtures, snapshotParseResult } from './fixtures.mjs'

if ('document' in globalThis || 'window' in globalThis) {
  throw new Error('The plain Node spike must run without browser globals.')
}

for (const fixture of compatibilityFixtures) {
  const result = await parse(fixture.source)
  assertFixture(snapshotParseResult(result), fixture)
  console.log(`PASS ${fixture.name}`)
}

const presentationResult = await parse(`flowchart TD
  a["<b>Unsafe HTML</b>"] --> b
  style a fill:#fff
  classDef hot fill:red
  class b hot
  click a href "https://example.com"`)
const presentationDb = presentationResult.db
const presentationNodes = presentationDb.getVertices()
if (presentationNodes.get('a')?.link !== 'https://example.com/' || presentationNodes.get('a')?.styles?.[0] !== 'fill:#fff' || !presentationNodes.get('b')?.classes?.includes('hot')) {
  throw new Error('Presentation/action constructs were silently discarded instead of remaining visible for rejection.')
}
console.log('PASS unsupported presentation/actions remain visible for fail-closed diagnostics')

let commentFailure
try {
  await parse(`flowchart TD
  %% standard Mermaid comment
  a --> b`)
} catch (error) {
  commentFailure = error
}
if (!commentFailure) throw new Error('Update the evaluation: standard comments now parse successfully.')
console.log('KNOWN GAP standard %% comments fail to parse')

console.log(`PASS plain Node (${process.version}); no DOM or renderer used`)

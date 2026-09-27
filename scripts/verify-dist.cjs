const fs = require('fs')
const { spawnSync } = require('child_process')

const required = [
  'dist/index.js',
  'dist/index.cjs',
  'dist/index.d.ts',
  'dist/syntax.js',
  'dist/syntax.cjs',
  'dist/syntax.d.ts',
  'dist/mermaid.js',
  'dist/mermaid.cjs',
  'dist/mermaid.d.ts',
  'dist/theme.css',
  'dist/themes/light.css',
  'dist/themes/dark.css',
  'THIRD_PARTY_NOTICES.md',
]

const missing = required.filter((file) => !fs.existsSync(file))
if (missing.length > 0) {
  console.error(`Missing dist files:\n${missing.join('\n')}`)
  process.exit(1)
}

const maps = []

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = `${dir}/${entry.name}`
    if (entry.isDirectory()) walk(file)
    else if (file.endsWith('.map')) maps.push(file)
  }
}

walk('dist')

if (maps.length > 0) {
  console.error(`Unexpected sourcemaps in dist:\n${maps.join('\n')}`)
  process.exit(1)
}

const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'))
const packageFiles = Array.isArray(packageJson.files) ? packageJson.files : []
if (!packageFiles.includes('THIRD_PARTY_NOTICES.md')) {
  console.error('THIRD_PARTY_NOTICES.md must be included in the published package files.')
  process.exit(1)
}

const noticeContents = fs.readFileSync('THIRD_PARTY_NOTICES.md', 'utf8')
const requiredNoticeMarkers = [
  'Copyright (c) 2026 Contember Limited',
  'Copyright (c) 2014 - 2022 Knut Sveidqvist',
  'Copyright OpenJS Foundation and other contributors',
  'Jeremy Ashkenas, DocumentCloud and',
  'Permission is hereby granted, free of charge',
]
const missingNoticeMarkers = requiredNoticeMarkers.filter((marker) => !noticeContents.includes(marker))
if (missingNoticeMarkers.length > 0) {
  console.error(`Third-party notices are incomplete:\n${missingNoticeMarkers.join('\n')}`)
  process.exit(1)
}

const mermaidBundle = fs.readFileSync('dist/mermaid.js', 'utf8')
if (!mermaidBundle.includes('lodash-es/lodash.js:') || !mermaidBundle.includes('Copyright OpenJS Foundation and other contributors')) {
  console.error('The Mermaid bundle attribution changed; review THIRD_PARTY_NOTICES.md against all bundled license headers.')
  process.exit(1)
}

if (packageJson.dependencies?.['mermaid-parser-bundle'] !== undefined) {
  console.error('mermaid-parser-bundle is bundled and must not also be installed as a runtime dependency.')
  process.exit(1)
}
if (packageJson.devDependencies?.['mermaid-parser-bundle'] !== '0.2.1') {
  console.error('The bundled Mermaid parser must remain an exact development dependency at version 0.2.1.')
  process.exit(1)
}

const exportTargets = [
  packageJson.main,
  packageJson.module,
  packageJson.types,
  packageJson.exports?.['.']?.types,
  packageJson.exports?.['.']?.import,
  packageJson.exports?.['.']?.require,
  packageJson.exports?.['./syntax']?.types,
  packageJson.exports?.['./syntax']?.import,
  packageJson.exports?.['./syntax']?.require,
  packageJson.exports?.['./mermaid']?.types,
  packageJson.exports?.['./mermaid']?.import,
  packageJson.exports?.['./mermaid']?.require,
  packageJson.exports?.['./theme.css'],
  packageJson.exports?.['./themes/light.css'],
  packageJson.exports?.['./themes/dark.css'],
].filter(Boolean)

const missingExports = exportTargets
  .map((target) => String(target).replace(/^\.\//, ''))
  .filter((target) => !fs.existsSync(target))

if (missingExports.length > 0) {
  console.error(`Package exports point to missing files:\n${missingExports.join('\n')}`)
  process.exit(1)
}

const bundledReactMarkers = [
  'react.production.min',
  'react.development.js',
  'react-jsx-runtime.production.min',
]

for (const file of ['dist/index.js', 'dist/index.cjs']) {
  const contents = fs.readFileSync(file, 'utf8')
  const marker = bundledReactMarkers.find((value) => contents.includes(value))
  if (marker) {
    console.error(`React appears to be bundled in ${file}. Matched marker: ${marker}`)
    process.exit(1)
  }
}

const mermaidMarkers = ['flowchart-v2', 'MermaidParseError', 'classDef']
const normalEntryFiles = fs.readdirSync('dist')
  .filter((file) => /\.(?:js|cjs)$/.test(file) && !file.startsWith('mermaid.'))
  .map((file) => `dist/${file}`)
for (const file of normalEntryFiles) {
  const contents = fs.readFileSync(file, 'utf8')
  const marker = mermaidMarkers.find((value) => contents.includes(value))
  if (marker) {
    console.error(`Mermaid parser code appears in normal bundle ${file}. Matched marker: ${marker}`)
    process.exit(1)
  }
}

const smokeChecks = [
  ['ESM', ['--input-type=module', '-e', `import('./dist/mermaid.js').then(async ({ compileMermaidSyntax }) => { const result = await compileMermaidSyntax('flowchart LR\\nA --> B'); if (!result.success || result.document.nodes.length !== 2 || result.document.edges.length !== 1) process.exit(1) })`]],
  ['CJS', ['-e', `const { compileMermaidSyntax } = require('./dist/mermaid.cjs'); compileMermaidSyntax('flowchart LR\\nA --> B').then((result) => { if (!result.success || result.document.nodes.length !== 2 || result.document.edges.length !== 1) process.exit(1) })`]],
]
for (const [label, args] of smokeChecks) {
  const result = spawnSync(process.execPath, args, { encoding: 'utf8' })
  if (result.status !== 0) {
    console.error(`Mermaid ${label} smoke check failed:\n${result.stderr || result.stdout}`)
    process.exit(1)
  }
}

console.log('dist verified')

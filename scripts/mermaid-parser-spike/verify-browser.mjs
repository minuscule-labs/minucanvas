import { spawn } from 'node:child_process'
import { createReadStream, existsSync } from 'node:fs'
import { mkdtemp, readdir, readFile, rm, stat } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'
import { build } from 'vite'

const spikeDir = resolve(fileURLToPath(new URL('.', import.meta.url)))
const browserDir = join(spikeDir, 'browser')
const outDir = await mkdtemp(join(tmpdir(), 'minucanvas-mermaid-browser-'))

try {
  await build({
    root: browserDir,
    configFile: false,
    logLevel: 'error',
    build: { outDir, emptyOutDir: true },
  })

  const server = createServer(async (request, response) => {
    const pathname = new URL(request.url ?? '/', 'http://localhost').pathname
    const requested = pathname === '/' ? '/index.html' : pathname
    const file = resolve(outDir, `.${requested}`)
    if (!file.startsWith(outDir)) {
      response.writeHead(403).end()
      return
    }
    try {
      if (!(await stat(file)).isFile()) throw new Error('Not a file')
      const contentType = extname(file) === '.html' ? 'text/html' : extname(file) === '.js' ? 'text/javascript' : 'application/octet-stream'
      response.writeHead(200, { 'Content-Type': contentType })
      createReadStream(file).pipe(response)
    } catch {
      response.writeHead(404).end()
    }
  })
  await new Promise((resolveListen) => server.listen(0, '127.0.0.1', resolveListen))

  try {
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('Could not determine browser spike server address.')
    const chrome = findChrome()
    if (!chrome) throw new Error('Chrome/Chromium not found. Set CHROME_BIN to run the browser spike.')
    const html = await runChrome(chrome, `http://127.0.0.1:${address.port}/`)
    if (!html.includes('data-status="passed"')) throw new Error(`Browser spike failed.\n${html}`)
    const assetsDir = join(outDir, 'assets')
    const javascriptFiles = (await readdir(assetsDir)).filter((file) => file.endsWith('.js'))
    const javascript = Buffer.concat(await Promise.all(javascriptFiles.map((file) => readFile(join(assetsDir, file)))))
    console.log(`PASS real browser (${chrome})`)
    console.log(`Browser JavaScript: ${formatBytes(javascript.byteLength)} raw, ${formatBytes(gzipSync(javascript).byteLength)} gzip`)
  } finally {
    await new Promise((resolveClose, reject) => server.close((error) => error ? reject(error) : resolveClose()))
  }
} finally {
  await rm(outDir, { recursive: true, force: true })
}

function formatBytes(bytes) {
  return `${(bytes / 1024).toFixed(1)} KiB`
}

function findChrome() {
  const candidates = [
    process.env.CHROME_BIN,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ].filter(Boolean)
  return candidates.find((candidate) => existsSync(candidate))
}

function runChrome(executable, url) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(executable, [
      '--headless=new',
      '--disable-gpu',
      '--no-sandbox',
      '--dump-dom',
      '--virtual-time-budget=10000',
      url,
    ], { stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => { stdout += chunk })
    child.stderr.on('data', (chunk) => { stderr += chunk })
    child.on('error', reject)
    child.on('close', (code) => code === 0 ? resolveRun(stdout) : reject(new Error(`Chrome exited ${code}.\n${stderr}`)))
  })
}

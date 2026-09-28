import { useMemo, useRef, useState } from 'react'
import { CanvasStyleToolbar, CanvasToolbar, MinuCanvas } from '../src/index'
import { defaultCanvasShortcuts } from '../src/index'
import { compileDiagramSyntax } from '../src/mermaid'
import type { CanvasHandle, CanvasShapeTheme, CanvasThemeMode, CanvasTool, JsonCanvasDocument } from '../src/index'
import '../src/theme/theme.css'
import lightThemeUrl from '../src/theme/themes/light.css?url'
import darkThemeUrl from '../src/theme/themes/dark.css?url'

type ThemeChoice = 'base' | 'light' | 'dark'

const THEME_URLS: Record<Exclude<ThemeChoice, 'base'>, string> = {
  light: lightThemeUrl,
  dark: darkThemeUrl,
}

type DiagramFormat = 'auto' | 'minu' | 'mermaid'

const SAMPLE_DIAGRAM_SYNTAX = `diagram "Auth flow" {
  direction right

  User [shape: pill]
  Login [shape: rectangle, label: "Login form"]
  Valid [shape: diamond, label: "Valid?"]
  Dashboard [shape: pill]
  Error [shape: text, label: "Show error", stroke: "#f8fafc", style: dashed]

  User > Login
  Login > Valid
  Valid > Dashboard: yes
  Valid > Error: no [style: dashed]
  Error > Login
}`

const SAMPLE_MERMAID_SYNTAX = `flowchart LR
  User([User]) --> Login["Login form"]
  Login --> Valid{Valid?}
  Valid -->|yes| Dashboard([Dashboard])
  Valid -. no .-> Error["Show error"]
  Error --> Login`

const INITIAL_CANVAS: JsonCanvasDocument = {
  nodes: [
    {
      id: 'start',
      type: 'text',
      text: 'Start',
      x: -120,
      y: -40,
      width: 160,
      height: 80,
      shape: 'pill',
    },
    {
      id: 'decision',
      type: 'text',
      text: 'Approved?',
      x: 120,
      y: -80,
      width: 240,
      height: 160,
      shape: 'diamond',
    },
    {
      id: 'ship',
      type: 'text',
      text: 'Ship it',
      x: 440,
      y: -40,
      width: 170,
      height: 80,
      shape: 'rounded-rectangle',
    },
    {
      id: 'revise',
      type: 'text',
      text: 'Revise draft',
      x: 160,
      y: 170,
      width: 180,
      height: 90,
      shape: 'ellipse',
    },
  ],
  edges: [
    {
      id: 'start-decision',
      fromNode: 'start',
      fromSide: 'right',
      toNode: 'decision',
      toSide: 'left',
      toEnd: 'arrow',
      style: { routing: 'curved', strokeStyle: 'sketch' },
    },
    {
      id: 'decision-ship',
      fromNode: 'decision',
      fromSide: 'right',
      toNode: 'ship',
      toSide: 'left',
      toEnd: 'arrow',
      label: 'yes',
      style: { routing: 'elbow' },
    },
    {
      id: 'decision-revise',
      fromNode: 'decision',
      fromSide: 'bottom',
      toNode: 'revise',
      toSide: 'top',
      toEnd: 'arrow',
      label: 'no',
      style: { routing: 'curved', strokeStyle: 'dashed' },
    },
  ],
}

function themeMode(choice: ThemeChoice): CanvasThemeMode {
  if (choice === 'dark') return 'dark'
  if (choice === 'light') return 'light'
  return 'system'
}

export default function App() {
  const canvasRef = useRef<CanvasHandle>(null)
  const importRequest = useRef(0)
  const [document, setDocument] = useState<JsonCanvasDocument>(INITIAL_CANVAS)
  const [theme, setTheme] = useState<ThemeChoice>('base')
  const [shapeTheme, setShapeTheme] = useState<CanvasShapeTheme>('outline')
  const [grid, setGrid] = useState(true)
  const [snapToGrid, setSnapToGrid] = useState(true)
  const [tool, setTool] = useState<CanvasTool>('select')
  const [selected, setSelected] = useState({ nodeIds: [] as string[], edgeIds: [] as string[] })
  const [diagramFormat, setDiagramFormat] = useState<DiagramFormat>('auto')
  const [diagramSource, setDiagramSource] = useState(SAMPLE_DIAGRAM_SYNTAX)
  const [diagramDiagnostics, setDiagramDiagnostics] = useState<string[]>([])
  const [isImporting, setIsImporting] = useState(false)

  const activeThemeUrl = theme === 'base' ? null : THEME_URLS[theme]
  const serialized = useMemo(() => JSON.stringify(document, null, 2), [document])

  async function handleDemoUpload(file: File) {
    return URL.createObjectURL(file)
  }

  async function handleImportDiagramSyntax() {
    const request = ++importRequest.current
    setIsImporting(true)
    const result = await compileDiagramSyntax(diagramSource, { format: diagramFormat, strict: true })
    if (request !== importRequest.current) return

    setIsImporting(false)
    setDiagramDiagnostics(result.diagnostics.map((diagnostic) => `${diagnostic.severity}: ${diagnostic.message}${diagnostic.line ? ` (line ${diagnostic.line})` : ''}`))
    if (!result.success) return

    setDocument(result.document)
    setSelected({ nodeIds: [], edgeIds: [] })
    requestAnimationFrame(() => canvasRef.current?.fitView())
  }

  function selectDiagramFormat(format: DiagramFormat) {
    importRequest.current += 1
    setIsImporting(false)
    setDiagramFormat(format)
    setDiagramSource(format === 'mermaid' ? SAMPLE_MERMAID_SYNTAX : SAMPLE_DIAGRAM_SYNTAX)
    setDiagramDiagnostics([])
  }

  return (
    <div className={`app app--theme-${theme}`}>
      {activeThemeUrl ? <link rel="stylesheet" href={activeThemeUrl} /> : null}
      <header className="app-header">
        <div>
          <h1>@dpklabs/minucanvas</h1>
          <p>JSON Canvas foundation, flowchart MVP shapes, Excalidraw/Eraser-inspired lines.</p>
        </div>
        <div className="header-controls">
          <label>
            Canvas
            <select value={theme} onChange={(event) => setTheme(event.target.value as ThemeChoice)}>
              <option value="base">System</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </label>
          <label>
            Shapes
            <select value={shapeTheme} onChange={(event) => setShapeTheme(event.target.value as CanvasShapeTheme)}>
              <option value="outline">Outline</option>
              <option value="filled">Filled</option>
              <option value="soft">Soft</option>
            </select>
          </label>
          <label className="checkbox-control">
            <input type="checkbox" checked={grid} onChange={(event) => setGrid(event.target.checked)} />
            Grid
          </label>
          <label className="checkbox-control">
            <input type="checkbox" checked={snapToGrid} onChange={(event) => setSnapToGrid(event.target.checked)} />
            Snap
          </label>
          <button onClick={() => canvasRef.current?.fitView()}>Fit</button>
          <button onClick={() => canvasRef.current?.resetView()}>Reset</button>
          <a href="/fullscreen.html">Fullscreen</a>
          <a href="/mindmap.html">Mind map fullscreen</a>
        </div>
      </header>

      <main className="app-main">
        <section className="canvas-frame">
          <CanvasToolbar tool={tool} onToolChange={setTool} className="canvas-frame__toolbar" orientation="vertical" />
          <CanvasStyleToolbar
            value={document}
            selection={selected}
            onChange={(next) => setDocument(next)}
            className="canvas-frame__style-toolbar"
          />
          <MinuCanvas
            ref={canvasRef}
            value={document}
            onChange={(next) => setDocument(next)}
            tool={tool}
            onToolChange={setTool}
            selectedNodeIds={selected.nodeIds}
            selectedEdgeIds={selected.edgeIds}
            onSelectionChange={setSelected}
            canvasTheme={themeMode(theme)}
            shapeTheme={shapeTheme}
            grid={grid}
            snapToGrid={snapToGrid}
            autoFit
            autoFocus
            getNodeDefaults={() => ({})}
            onUpload={handleDemoUpload}
            onExternalContentWarning={(warning) => console.warn(warning.message, warning)}
          />
        </section>

        <section className="info-grid">
          <article>
            <h2>Shortcuts</h2>
            <ul>
              {defaultCanvasShortcuts.map((shortcut) => (
                <li key={shortcut.key}>
                  <kbd>{shortcut.key}</kbd>
                  <span>{shortcut.description}</span>
                </li>
              ))}
            </ul>
          </article>
          <article>
            <h2>Diagram syntax</h2>
            <label>
              Format
              <select value={diagramFormat} onChange={(event) => selectDiagramFormat(event.target.value as DiagramFormat)}>
                <option value="auto">Auto-detect</option>
                <option value="minu">Minu</option>
                <option value="mermaid">Mermaid flowchart</option>
              </select>
            </label>
            <textarea
              className="diagram-source"
              value={diagramSource}
              onChange={(event) => {
                importRequest.current += 1
                setIsImporting(false)
                setDiagramSource(event.target.value)
              }}
              spellCheck={false}
            />
            <div className="diagram-source__actions">
              <button onClick={() => void handleImportDiagramSyntax()} disabled={isImporting}>{isImporting ? 'Importing…' : `Import ${diagramFormat}`}</button>
              <button onClick={() => selectDiagramFormat(diagramFormat)}>Reset sample</button>
            </div>
            {diagramDiagnostics.length > 0 ? (
              <ul className="diagram-diagnostics">
                {diagramDiagnostics.map((diagnostic) => <li key={diagnostic}>{diagnostic}</li>)}
              </ul>
            ) : null}
          </article>
          <article>
            <h2>JSON Canvas output</h2>
            <pre>{serialized}</pre>
          </article>
        </section>
      </main>
    </div>
  )
}

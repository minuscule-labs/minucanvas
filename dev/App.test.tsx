import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { resolveCanvasScene } from '../src/engine/scene'
import type { DiagramSyntaxCompileResult } from '../src/mermaid'
import type { JsonCanvasDocument } from '../src/types'
import App from './App'

const compileDiagramSyntax = vi.hoisted(() => vi.fn())

vi.mock('../src/mermaid', () => ({ compileDiagramSyntax }))

function diagramControls() {
  const section = screen.getByRole('heading', { name: 'Diagram syntax' }).closest('article')!
  return {
    section,
    format: within(section).getByLabelText('Format'),
    source: within(section).getByRole('textbox'),
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((resolvePromise) => { resolve = resolvePromise })
  return { promise, resolve }
}

function successfulResult(id: string, format: 'minu' | 'mermaid'): DiagramSyntaxCompileResult {
  const document: JsonCanvasDocument = {
    nodes: [{ id, type: 'text', text: id, x: 0, y: 0, width: 100, height: 60 }],
    edges: [],
  }
  return {
    success: true,
    format,
    diagnostics: [],
    parsed: { direction: 'right', nodes: [{ id, label: id, shape: 'rectangle' }], groups: [], edges: [] },
    document,
    scene: resolveCanvasScene(document),
  }
}

describe('Diagram syntax demo import', () => {
  beforeEach(() => {
    compileDiagramSyntax.mockReset()
    compileDiagramSyntax.mockImplementation((_source: string, options: { format?: string }) => Promise.resolve(
      options.format === 'mermaid'
        ? successfulResult('mermaid-result', 'mermaid')
        : successfulResult('User', 'minu'),
    ))
  })

  it('auto-detects Minu input and supports explicitly selecting Mermaid', async () => {
    const user = userEvent.setup()
    render(<App />)
    const controls = diagramControls()

    await user.click(within(controls.section).getByRole('button', { name: 'Import auto' }))
    expect(await screen.findByText(/"id": "User"/)).toBeInTheDocument()
    expect(compileDiagramSyntax).toHaveBeenCalledWith(expect.stringContaining('diagram "Auth flow"'), { format: 'auto', strict: true })

    await user.selectOptions(controls.format, 'mermaid')
    await user.click(within(controls.section).getByRole('button', { name: 'Import mermaid' }))
    expect(await screen.findByText(/"id": "mermaid-result"/)).toBeInTheDocument()
    expect(compileDiagramSyntax).toHaveBeenLastCalledWith(expect.stringContaining('flowchart LR'), { format: 'mermaid', strict: true })
  })

  it('keeps the current canvas when Mermaid compilation fails', async () => {
    compileDiagramSyntax.mockResolvedValue({
      success: false,
      format: 'mermaid',
      diagnostics: [{ severity: 'error', code: 'invalid_syntax', message: 'Broken Mermaid', line: 2 }],
    } satisfies DiagramSyntaxCompileResult)
    const user = userEvent.setup()
    render(<App />)
    const controls = diagramControls()

    await user.selectOptions(controls.format, 'mermaid')
    await user.clear(controls.source)
    await user.type(controls.source, 'flowchart TD')
    await user.click(within(controls.section).getByRole('button', { name: 'Import mermaid' }))

    expect(compileDiagramSyntax).toHaveBeenCalledWith('flowchart TD', { format: 'mermaid', strict: true })
    expect(await within(controls.section).findByText('error: Broken Mermaid (line 2)')).toBeInTheDocument()
    expect(screen.getByText(/"id": "start"/)).toBeInTheDocument()
  })

  it('does not apply a stale auto-detected result after the source changes', async () => {
    const pending = deferred<DiagramSyntaxCompileResult>()
    compileDiagramSyntax.mockReturnValue(pending.promise)
    const user = userEvent.setup()
    render(<App />)
    const controls = diagramControls()

    await user.selectOptions(controls.format, 'mermaid')
    await user.click(within(controls.section).getByRole('button', { name: 'Import mermaid' }))
    expect(within(controls.section).getByRole('button', { name: 'Importing…' })).toBeDisabled()

    await user.type(controls.source, ' ')
    await act(async () => {
      pending.resolve(successfulResult('stale-result', 'mermaid'))
      await pending.promise
    })

    expect(screen.queryByText(/"id": "stale-result"/)).not.toBeInTheDocument()
    expect(screen.getByText(/"id": "start"/)).toBeInTheDocument()
    expect(within(controls.section).getByRole('button', { name: 'Import mermaid' })).toBeEnabled()
  })
})

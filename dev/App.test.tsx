import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { resolveCanvasScene } from '../src/engine/scene'
import type { MermaidCompileResult } from '../src/mermaid'
import type { JsonCanvasDocument } from '../src/types'
import App from './App'

const compileMermaidSyntax = vi.hoisted(() => vi.fn())

vi.mock('../src/mermaid', () => ({ compileMermaidSyntax }))

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

function successfulMermaidResult(id: string): MermaidCompileResult {
  const document: JsonCanvasDocument = {
    nodes: [{ id, type: 'text', text: id, x: 0, y: 0, width: 100, height: 60 }],
    edges: [],
  }
  return {
    success: true,
    diagnostics: [],
    parsed: { direction: 'right', nodes: [{ id, label: id, shape: 'rectangle' }], groups: [], edges: [] },
    document,
    scene: resolveCanvasScene(document),
  }
}

describe('Mermaid demo import', () => {
  beforeEach(() => {
    compileMermaidSyntax.mockReset()
  })

  it('imports both Minu and Mermaid sources through the selected format', async () => {
    compileMermaidSyntax.mockResolvedValue(successfulMermaidResult('mermaid-result'))
    const user = userEvent.setup()
    render(<App />)
    const controls = diagramControls()

    await user.click(within(controls.section).getByRole('button', { name: 'Import minu' }))
    expect(await screen.findByText(/"id": "User"/)).toBeInTheDocument()

    await user.selectOptions(controls.format, 'mermaid')
    await user.click(within(controls.section).getByRole('button', { name: 'Import mermaid' }))
    expect(await screen.findByText(/"id": "mermaid-result"/)).toBeInTheDocument()
    expect(compileMermaidSyntax).toHaveBeenCalledWith(expect.stringContaining('flowchart LR'))
  })

  it('keeps the current canvas when Mermaid compilation fails', async () => {
    compileMermaidSyntax.mockResolvedValue({
      success: false,
      diagnostics: [{ severity: 'error', code: 'invalid_syntax', message: 'Broken Mermaid', line: 2 }],
    } satisfies MermaidCompileResult)
    const user = userEvent.setup()
    render(<App />)
    const controls = diagramControls()

    await user.selectOptions(controls.format, 'mermaid')
    await user.clear(controls.source)
    await user.type(controls.source, 'flowchart TD')
    await user.click(within(controls.section).getByRole('button', { name: 'Import mermaid' }))

    expect(compileMermaidSyntax).toHaveBeenCalledWith('flowchart TD')
    expect(await within(controls.section).findByText('error: Broken Mermaid (line 2)')).toBeInTheDocument()
    expect(screen.getByText(/"id": "start"/)).toBeInTheDocument()
  })

  it('does not apply a stale Mermaid result after the source changes', async () => {
    const pending = deferred<MermaidCompileResult>()
    compileMermaidSyntax.mockReturnValue(pending.promise)
    const user = userEvent.setup()
    render(<App />)
    const controls = diagramControls()

    await user.selectOptions(controls.format, 'mermaid')
    await user.click(within(controls.section).getByRole('button', { name: 'Import mermaid' }))
    expect(within(controls.section).getByRole('button', { name: 'Importing…' })).toBeDisabled()

    await user.type(controls.source, ' ')
    await act(async () => {
      pending.resolve(successfulMermaidResult('stale-result'))
      await pending.promise
    })

    expect(screen.queryByText(/"id": "stale-result"/)).not.toBeInTheDocument()
    expect(screen.getByText(/"id": "start"/)).toBeInTheDocument()
    expect(within(controls.section).getByRole('button', { name: 'Import mermaid' })).toBeEnabled()
  })
})

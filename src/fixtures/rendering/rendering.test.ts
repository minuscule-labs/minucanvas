import { describe, expect, it } from 'vitest'
import { compileMinuDiagramSyntax } from '../../syntax'
import { FLOW_DIRECTIONS, RENDERING_FIXTURES } from './index'

type Bounds = { x: number; y: number; width: number; height: number }

function overlaps(a: Bounds, b: Bounds): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x
    && a.y < b.y + b.height && a.y + a.height > b.y
}

describe('rendering fixture corpus', () => {
  it.each([...RENDERING_FIXTURES, ...FLOW_DIRECTIONS])('$id resolves finite, deterministic geometry without semantic errors', (fixture) => {
    const first = compileMinuDiagramSyntax(fixture.source, fixture.options)
    const second = compileMinuDiagramSyntax(fixture.source, fixture.options)

    expect(first.diagnostics.filter((diagnostic) => diagnostic.severity === 'error')).toEqual([])
    expect(JSON.stringify(first.document)).toBe(JSON.stringify(second.document))
    expect(JSON.stringify(first.scene.edges.map((edge) => edge.points))).toBe(JSON.stringify(second.scene.edges.map((edge) => edge.points)))
    expect(first.document.nodes.every((node) => [node.x, node.y, node.width, node.height].every(Number.isFinite))).toBe(true)
    expect(first.scene.edges.every((edge) => edge.points.every((point) => Number.isFinite(point.x) && Number.isFinite(point.y)))).toBe(true)
  })

  it('keeps ordinary nodes separate across the corpus', () => {
    for (const fixture of RENDERING_FIXTURES) {
      const nodes = compileMinuDiagramSyntax(fixture.source, fixture.options).document.nodes.filter((node) => node.type !== 'group')
      for (let index = 0; index < nodes.length; index += 1) {
        for (let otherIndex = index + 1; otherIndex < nodes.length; otherIndex += 1) {
          const a = nodes[index]!
          const b = nodes[otherIndex]!
          expect(overlaps(a, b), `${fixture.id}: ${a.id} overlaps ${b.id}`).toBe(false)
        }
      }
    }
  })

  it('fits nested containers around their resolved children', () => {
    const nodes = compileMinuDiagramSyntax(RENDERING_FIXTURES.find((fixture) => fixture.id === 'nested-containers')!.source).document.nodes
    for (const child of nodes.filter((node) => node.groupId)) {
      const group = nodes.find((node) => node.id === child.groupId)!
      expect(child.x).toBeGreaterThanOrEqual(group.x)
      expect(child.y).toBeGreaterThanOrEqual(group.y)
      expect(child.x + child.width).toBeLessThanOrEqual(group.x + group.width)
      expect(child.y + child.height).toBeLessThanOrEqual(group.y + group.height)
    }
  })

  it('places each directional flow in its requested direction', () => {
    for (const fixture of FLOW_DIRECTIONS) {
      const nodes = compileMinuDiagramSyntax(fixture.source).document.nodes
      const [a, b, c] = ['A', 'B', 'C'].map((id) => nodes.find((node) => node.id === id)!)
      if (fixture.id === 'direction-right') {
        expect(a.x).toBeLessThan(b.x)
        expect(b.x).toBeLessThan(c.x)
      }
      if (fixture.id === 'direction-left') {
        expect(a.x).toBeGreaterThan(b.x)
        expect(b.x).toBeGreaterThan(c.x)
      }
      if (fixture.id === 'direction-down') {
        expect(a.y).toBeLessThan(b.y)
        expect(b.y).toBeLessThan(c.y)
      }
      if (fixture.id === 'direction-up') {
        expect(a.y).toBeGreaterThan(b.y)
        expect(b.y).toBeGreaterThan(c.y)
      }
    }
  })

  it('includes checked-in 50 and 100 node stress fixtures', () => {
    expect(compileMinuDiagramSyntax(RENDERING_FIXTURES.find((fixture) => fixture.id === 'stress-50')!.source).document.nodes).toHaveLength(50)
    expect(compileMinuDiagramSyntax(RENDERING_FIXTURES.find((fixture) => fixture.id === 'stress-100')!.source).document.nodes).toHaveLength(100)
  })
})

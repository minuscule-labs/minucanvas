import { describe, expect, it } from 'vitest'
import { isResolvedCanvasSceneCurrent, resolveCanvasScene } from './scene'
import type { JsonCanvasDocument } from '../types'

describe('resolveCanvasScene edge geometry', () => {
  it('resolves straight, elbow, curved, generated, and manual routes without mutating intent', () => {
    const document: JsonCanvasDocument = {
      nodes: [
        { id: 'A', type: 'text', x: 0, y: 0, width: 100, height: 60 },
        { id: 'B', type: 'text', x: 300, y: 200, width: 100, height: 60 },
      ],
      edges: [
        { id: 'straight', fromNode: 'A', toNode: 'B', style: { routing: 'straight' } },
        { id: 'elbow', fromNode: 'A', toNode: 'B', style: { routing: 'elbow' } },
        { id: 'curved', fromNode: 'A', toNode: 'B', style: { routing: 'curved' } },
        { id: 'generated', fromNode: 'A', toNode: 'B' },
        { id: 'manual', fromNode: 'A', toNode: 'B', routingMode: 'manual', waypoints: [{ x: 160, y: 140 }] },
      ],
    }
    const before = JSON.stringify(document)
    const scene = resolveCanvasScene(document, {
      generatedEdgePoints: new Map([
        ['generated', [{ x: 100, y: 30 }, { x: 180, y: 140 }, { x: 300, y: 30 }]],
        ['manual', [{ x: 100, y: 30 }, { x: 180, y: 240 }, { x: 300, y: 30 }]],
      ]),
    })
    const edge = (id: string) => scene.edges.find((item) => item.id === id)!

    expect(edge('straight').path).toMatch(/^M .* L /)
    expect(edge('elbow').path).toContain('Q')
    expect(edge('curved').path).toContain('C')
    expect(edge('generated').points).toContainEqual({ x: 180, y: 140 })
    expect(edge('generated').path).toContain('Q')
    expect(edge('manual').points).toContainEqual({ x: 160, y: 140 })
    expect(edge('manual').points).not.toContainEqual({ x: 180, y: 240 })
    expect(edge('manual').labelPoint).toEqual(expect.objectContaining({ x: expect.any(Number), y: expect.any(Number) }))
    expect(JSON.stringify(document)).toBe(before)
  })

  it('accepts reordered complete scenes and rejects incomplete, foreign, or duplicate edge sets', () => {
    const document: JsonCanvasDocument = {
      nodes: [
        { id: 'A', type: 'text', x: 0, y: 0, width: 100, height: 60 },
        { id: 'B', type: 'text', x: 250, y: 0, width: 100, height: 60 },
        { id: 'C', type: 'text', x: 500, y: 0, width: 100, height: 60 },
      ],
      edges: [
        { id: 'ab', fromNode: 'A', toNode: 'B' },
        { id: 'bc', fromNode: 'B', toNode: 'C' },
      ],
    }
    const scene = resolveCanvasScene(document)

    expect(isResolvedCanvasSceneCurrent(scene, document)).toBe(true)
    expect(isResolvedCanvasSceneCurrent({ ...scene, edges: [] }, document)).toBe(false)
    expect(isResolvedCanvasSceneCurrent({ ...scene, edges: [scene.edges[0]!] }, document)).toBe(false)
    expect(isResolvedCanvasSceneCurrent({ ...scene, edges: [...scene.edges, scene.edges[0]!] }, document)).toBe(false)
    expect(isResolvedCanvasSceneCurrent({ ...scene, edges: [...scene.edges].reverse() }, document)).toBe(true)
  })
})

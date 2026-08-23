import { describe, expect, it } from 'vitest'
import { JSON_CANVAS_PRESET_COLORS, isJsonCanvasPresetColor, resolveCanvasColor } from './colors'

describe('JSON Canvas preset colors', () => {
  it('resolves all six presets to theme-aware CSS variables', () => {
    expect(JSON_CANVAS_PRESET_COLORS.map((color) => resolveCanvasColor(color))).toEqual([
      'var(--mc-json-canvas-color-1, #dc2626)',
      'var(--mc-json-canvas-color-2, #ea580c)',
      'var(--mc-json-canvas-color-3, #ca8a04)',
      'var(--mc-json-canvas-color-4, #16a34a)',
      'var(--mc-json-canvas-color-5, #0891b2)',
      'var(--mc-json-canvas-color-6, #7c3aed)',
    ])
  })

  it('resolves presets to concrete colors for light and dark exports', () => {
    expect(resolveCanvasColor('5', 'light')).toBe('#0891b2')
    expect(resolveCanvasColor('5', 'dark')).toBe('#22d3ee')
  })

  it('preserves explicit colors and rejects unsupported numeric presets', () => {
    expect(resolveCanvasColor('#123456')).toBe('#123456')
    expect(resolveCanvasColor('rebeccapurple')).toBe('rebeccapurple')
    expect(resolveCanvasColor('7')).toBeUndefined()
    expect(isJsonCanvasPresetColor('6')).toBe(true)
    expect(isJsonCanvasPresetColor('7')).toBe(false)
  })
})

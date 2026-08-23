export type JsonCanvasPresetColor = '1' | '2' | '3' | '4' | '5' | '6'
export type CanvasColorMode = 'css' | 'light' | 'dark'

export const JSON_CANVAS_PRESET_COLORS: readonly JsonCanvasPresetColor[] = ['1', '2', '3', '4', '5', '6']

const LIGHT_PRESET_COLORS: Record<JsonCanvasPresetColor, string> = {
  '1': '#dc2626',
  '2': '#ea580c',
  '3': '#ca8a04',
  '4': '#16a34a',
  '5': '#0891b2',
  '6': '#7c3aed',
}

const DARK_PRESET_COLORS: Record<JsonCanvasPresetColor, string> = {
  '1': '#f87171',
  '2': '#fb923c',
  '3': '#facc15',
  '4': '#4ade80',
  '5': '#22d3ee',
  '6': '#a78bfa',
}

export function isJsonCanvasPresetColor(color: string | undefined): color is JsonCanvasPresetColor {
  return color !== undefined && JSON_CANVAS_PRESET_COLORS.includes(color as JsonCanvasPresetColor)
}

/**
 * Resolves JSON Canvas preset colors to theme-aware CSS variables or concrete
 * export colors. Explicit CSS colors pass through unchanged. Unsupported
 * numeric preset tokens are omitted so renderers can use their normal fallback.
 */
export function resolveCanvasColor(color: string | undefined, mode: CanvasColorMode = 'css'): string | undefined {
  if (color === undefined || color === '') return color
  if (isJsonCanvasPresetColor(color)) {
    if (mode === 'light') return LIGHT_PRESET_COLORS[color]
    if (mode === 'dark') return DARK_PRESET_COLORS[color]
    return `var(--mc-json-canvas-color-${color}, ${LIGHT_PRESET_COLORS[color]})`
  }
  return /^\d+$/.test(color) ? undefined : color
}

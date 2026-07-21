import { useEffect, useState } from 'react'
import type {
  CanvasChangeContext,
  CanvasEdgeArrowMode,
  CanvasEdgeRouting,
  CanvasEdgeStyle,
  CanvasNodeStyle,
  CanvasSelection,
  CanvasShape,
  CanvasStrokeStyle,
  JsonCanvasDocument,
} from './types'

export interface CanvasStyleToolbarProps<NodeExtra extends Record<string, unknown> = Record<string, unknown>, EdgeExtra extends Record<string, unknown> = Record<string, unknown>> {
  value: JsonCanvasDocument<NodeExtra, EdgeExtra>
  selection: CanvasSelection
  onChange: (nextValue: JsonCanvasDocument<NodeExtra, EdgeExtra>, context: CanvasChangeContext) => void
  className?: string
}

type Panel = 'shape' | 'color' | 'line' | 'font' | null
type StyleTarget = 'nodes' | 'edges' | 'both'

const SHAPES: CanvasShape[] = ['text', 'rectangle', 'ellipse', 'diamond', 'pill', 'parallelogram', 'hexagon']
const STROKE_STYLES: CanvasStrokeStyle[] = ['solid', 'dashed', 'dotted', 'sketch']
const LINE_ROUTINGS: CanvasEdgeRouting[] = ['elbow', 'straight', 'curved']
const ARROW_MODES: Array<{ mode: CanvasEdgeArrowMode; label: string }> = [
  { mode: 'none', label: 'No arrows' },
  { mode: 'end', label: 'Arrow at end' },
  { mode: 'start', label: 'Arrow at start' },
  { mode: 'both', label: 'Arrows at both ends' },
]
const LINE_WIDTHS = [1, 1.5, 2.5, 4]
const FONT_SIZES = [
  { label: 'S', name: 'Small', value: 12 },
  { label: 'M', name: 'Medium', value: 14 },
  { label: 'L', name: 'Large', value: 18 },
  { label: 'XL', name: 'X-Large', value: 24 },
] as const
const TEXT_ALIGNMENTS = ['left', 'center', 'right'] as const
const PALETTE = ['#111827', '#ffffff', '#ef4444', '#f59e0b', '#eab308', '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899', '#64748b']
const FILLS = ['', '#ffffff', '#fee2e2', '#fef3c7', '#fef9c3', '#dcfce7', '#dbeafe', '#ede9fe', '#fce7f3', '#e2e8f0']

function mixedValue<T>(values: T[], fallback: T): T | '' {
  if (values.length === 0) return fallback
  const first = values[0]
  return values.every((value) => value === first) ? first : ''
}

function edgeArrowMode(edge: { fromEnd?: 'none' | 'arrow'; toEnd?: 'none' | 'arrow' }): CanvasEdgeArrowMode {
  const start = (edge.fromEnd ?? 'none') === 'arrow'
  const end = (edge.toEnd ?? 'arrow') === 'arrow'
  if (start && end) return 'both'
  if (start) return 'start'
  if (end) return 'end'
  return 'none'
}

function ArrowModeIcon({ mode }: { mode: CanvasEdgeArrowMode }) {
  const start = mode === 'start' || mode === 'both'
  const end = mode === 'end' || mode === 'both'
  return (
    <svg viewBox="0 0 90 20" aria-hidden="true">
      <path d="M12 10H78" />
      {start ? <path d="M12 10l8-5M12 10l8 5" /> : null}
      {end ? <path d="M78 10l-8-5M78 10l-8 5" /> : null}
    </svg>
  )
}

function ShapeIcon({ shape }: { shape: CanvasShape }) {
  if (shape === 'text') return <path d="M6 8V5h16v3M14 5v18M10 23h8" />
  if (shape === 'ellipse') return <ellipse cx="14" cy="14" rx="8" ry="7" />
  if (shape === 'diamond') return <path d="M14 5l9 9-9 9-9-9 9-9z" />
  if (shape === 'pill') return <rect x="6" y="9" width="16" height="10" rx="5" />
  if (shape === 'parallelogram') return <path d="M9 8h14l-4 12H5L9 8z" />
  if (shape === 'hexagon') return <path d="M10 6h8l5 8-5 8h-8l-5-8 5-8z" />
  return <rect x="6" y="8" width="16" height="12" rx="1.5" />
}

export function CanvasStyleToolbar<NodeExtra extends Record<string, unknown> = Record<string, unknown>, EdgeExtra extends Record<string, unknown> = Record<string, unknown>>({
  value,
  selection,
  onChange,
  className,
}: CanvasStyleToolbarProps<NodeExtra, EdgeExtra>) {
  const [panel, setPanel] = useState<Panel>(null)
  const selectedNodes = value.nodes.filter((node) => selection.nodeIds.includes(node.id))
  const selectedEdges = value.edges.filter((edge) => selection.edgeIds.includes(edge.id))
  const hasNodes = selectedNodes.length > 0
  const hasEdges = selectedEdges.length > 0
  const disabled = !hasNodes && !hasEdges

  useEffect(() => {
    setPanel(null)
  }, [selection.nodeIds.join('\u0000'), selection.edgeIds.join('\u0000')])

  if (disabled) return null

  const shape = mixedValue(selectedNodes.map((node) => node.shape ?? 'rounded-rectangle'), 'rounded-rectangle' as CanvasShape)
  const stroke = mixedValue([
    ...selectedNodes.map((node) => node.style?.stroke ?? node.color ?? '#111827'),
    ...selectedEdges.map((edge) => edge.style?.stroke ?? edge.color ?? '#111827'),
  ], '#111827')
  const fill = mixedValue(selectedNodes.map((node) => node.style?.fill ?? node.background ?? ''), '')
  const text = mixedValue(selectedNodes.map((node) => node.style?.text ?? '#111827'), '#111827')
  const strokeWidth = mixedValue([
    ...selectedNodes.map((node) => node.style?.strokeWidth ?? 1.5),
    ...selectedEdges.map((edge) => edge.style?.strokeWidth ?? 1.5),
  ], 1.5)
  const strokeStyle = mixedValue([
    ...selectedNodes.map((node) => node.style?.strokeStyle ?? 'solid'),
    ...selectedEdges.map((edge) => edge.style?.strokeStyle ?? 'solid'),
  ], 'solid' as CanvasStrokeStyle)
  const routing = mixedValue(selectedEdges.map((edge) => edge.style?.routing ?? 'elbow'), 'elbow' as CanvasEdgeRouting)
  const arrowMode = mixedValue(selectedEdges.map(edgeArrowMode), 'end' as CanvasEdgeArrowMode)
  const fontSize = mixedValue(selectedNodes.map((node) => node.style?.fontSize ?? 14), 14)
  const fontSizeOption = FONT_SIZES.find((option) => option.value === fontSize)
  const textAlign = mixedValue(selectedNodes.map((node) => node.style?.textAlign ?? 'center'), 'center')

  function emit(nextValue: JsonCanvasDocument<NodeExtra, EdgeExtra>, reason: CanvasChangeContext['reason']) {
    onChange(nextValue, { reason })
  }

  function updateShape(nextShape: CanvasShape) {
    if (!hasNodes) return
    emit({
      nodes: value.nodes.map((node) => selection.nodeIds.includes(node.id) ? { ...node, shape: nextShape } : node),
      edges: value.edges,
    }, 'update-node')
  }

  function updateArrowMode(mode: CanvasEdgeArrowMode) {
    if (!hasEdges) return
    const fromEnd = mode === 'start' || mode === 'both' ? 'arrow' : 'none'
    const toEnd = mode === 'end' || mode === 'both' ? 'arrow' : 'none'
    emit({
      nodes: value.nodes,
      edges: value.edges.map((edge) => selection.edgeIds.includes(edge.id) ? { ...edge, fromEnd, toEnd } : edge),
    }, 'update-edge')
  }

  function updateStyles(nodeStyle: Partial<CanvasNodeStyle>, edgeStyle: Partial<CanvasEdgeStyle>, target: StyleTarget = 'both') {
    if (disabled) return
    const updateNodes = target === 'nodes' || target === 'both'
    const updateEdges = target === 'edges' || target === 'both'
    emit({
      nodes: value.nodes.map((node) => {
        if (!updateNodes || !selection.nodeIds.includes(node.id)) return node
        return { ...node, style: { ...(node.style ?? {}), ...nodeStyle } }
      }),
      edges: value.edges.map((edge) => {
        if (!updateEdges || !selection.edgeIds.includes(edge.id)) return edge
        return { ...edge, style: { ...(edge.style ?? {}), ...edgeStyle } }
      }),
    }, hasNodes ? 'update-node' : 'update-edge')
  }

  return (
    <div className={`minucanvas-style-toolbar${className ? ` ${className}` : ''}`} role="toolbar" aria-label="Canvas style">
      {hasNodes ? (
        <div className="minucanvas-style-toolbar__item">
          <button type="button" className={`minucanvas-style-toolbar__button${panel === 'shape' ? ' minucanvas-style-toolbar__button--active' : ''}`} onClick={() => setPanel(panel === 'shape' ? null : 'shape')} title="Shape">
            <svg viewBox="0 0 28 28" aria-hidden="true"><ShapeIcon shape={shape || 'rectangle'} /></svg><span className="minucanvas-style-toolbar__chevron">⌄</span>
          </button>
          {panel === 'shape' ? (
            <div className="minucanvas-style-toolbar__popover minucanvas-style-toolbar__shape-grid">
              {SHAPES.map((item) => (
                <button key={item} type="button" className={shape === item ? 'is-active' : ''} onClick={() => updateShape(item)} title={item}>
                  <svg viewBox="0 0 28 28" aria-hidden="true"><ShapeIcon shape={item} /></svg>
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="minucanvas-style-toolbar__item">
        <button type="button" className={`minucanvas-style-toolbar__button${panel === 'color' ? ' minucanvas-style-toolbar__button--active' : ''}`} disabled={disabled} onClick={() => setPanel(panel === 'color' ? null : 'color')} title="Colors">
          <span className="minucanvas-style-toolbar__swatch" style={{ background: fill || 'transparent', borderColor: stroke || '#111827' }} />
          <span className="minucanvas-style-toolbar__chevron">⌄</span>
        </button>
        {panel === 'color' ? (
          <div className="minucanvas-style-toolbar__popover minucanvas-style-toolbar__color-panel">
            <div className="minucanvas-style-toolbar__popover-row">
              <span>{hasEdges && !hasNodes ? 'Line' : 'Stroke'}</span>
              <div className="minucanvas-style-toolbar__palette">
                {PALETTE.map((color) => <button key={color} type="button" style={{ background: color }} className={stroke === color ? 'is-active' : ''} onClick={() => updateStyles({ stroke: color }, { stroke: color })} />)}
              </div>
            </div>
            {hasNodes ? (
              <>
                <div className="minucanvas-style-toolbar__popover-row">
                  <span>Fill</span>
                  <div className="minucanvas-style-toolbar__palette">
                    {FILLS.map((color) => <button key={color || 'none'} type="button" style={{ background: color || 'transparent' }} className={`${fill === color ? 'is-active' : ''}${color ? '' : ' is-empty'}`} onClick={() => updateStyles({ fill: color }, {}, 'nodes')} />)}
                  </div>
                </div>
                <div className="minucanvas-style-toolbar__popover-row">
                  <span>Text</span>
                  <div className="minucanvas-style-toolbar__palette">
                    {PALETTE.map((color) => <button key={color} type="button" style={{ background: color }} className={text === color ? 'is-active' : ''} onClick={() => updateStyles({ text: color }, {}, 'nodes')} />)}
                  </div>
                </div>
              </>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="minucanvas-style-toolbar__item">
        <button type="button" className={`minucanvas-style-toolbar__button${panel === 'line' ? ' minucanvas-style-toolbar__button--active' : ''}`} disabled={disabled} onClick={() => setPanel(panel === 'line' ? null : 'line')} title="Line">
          <svg viewBox="0 0 28 28" aria-hidden="true"><path d="M6 9h16M6 14h16M6 19h16" /></svg><span className="minucanvas-style-toolbar__chevron">⌄</span>
        </button>
        {panel === 'line' ? (
          <div className="minucanvas-style-toolbar__popover minucanvas-style-toolbar__line-panel">
            {STROKE_STYLES.map((style) => (
              <button key={style} type="button" className={strokeStyle === style ? 'is-active' : ''} onClick={() => updateStyles({ strokeStyle: style }, { strokeStyle: style })} title={style} aria-label={style}>
                <svg viewBox="0 0 90 16" aria-hidden="true"><path d="M4 8h82" strokeDasharray={style === 'dashed' || style === 'sketch' ? '10 8' : style === 'dotted' ? '2 8' : undefined} /></svg>
              </button>
            ))}
            {hasEdges ? (
              <>
                <div className="minucanvas-style-toolbar__divider" />
                {LINE_ROUTINGS.map((item) => (
                  <button key={item} type="button" className={routing === item ? 'is-active' : ''} onClick={() => updateStyles({}, { routing: item }, 'edges')} title={item} aria-label={item}>
                    <svg viewBox="0 0 90 24" aria-hidden="true">{item === 'straight' ? <path d="M8 16L82 8" /> : item === 'curved' ? <path d="M8 16C32 16 48 8 82 8" /> : <path d="M8 16H44V8H82" />}</svg>
                  </button>
                ))}
                <div className="minucanvas-style-toolbar__divider" />
                {ARROW_MODES.map((item) => (
                  <button key={item.mode} type="button" className={arrowMode === item.mode ? 'is-active' : ''} onClick={() => updateArrowMode(item.mode)} title={item.label} aria-label={item.label}>
                    <ArrowModeIcon mode={item.mode} />
                  </button>
                ))}
              </>
            ) : null}
            <div className="minucanvas-style-toolbar__divider" />
            {LINE_WIDTHS.map((width) => (
              <button key={width} type="button" className={strokeWidth === width ? 'is-active' : ''} onClick={() => updateStyles({ strokeWidth: width }, { strokeWidth: width })} title={`Stroke width ${width}`} aria-label={`Stroke width ${width}`}>
                <svg viewBox="0 0 90 16" aria-hidden="true"><path d="M4 8h82" strokeWidth={width} /></svg>
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {hasNodes ? (
        <>
          <span className="minucanvas-style-toolbar__separator" />

          <div className="minucanvas-style-toolbar__item">
            <button type="button" className="minucanvas-style-toolbar__button minucanvas-style-toolbar__button--label" onClick={() => {
              const currentIndex = FONT_SIZES.findIndex((option) => option.value === fontSize)
              const next = FONT_SIZES[(currentIndex + 1) % FONT_SIZES.length] ?? FONT_SIZES[1]
              updateStyles({ fontSize: next.value }, {}, 'nodes')
            }} title="Text size">
              {fontSizeOption?.label ?? 'M'}
            </button>
          </div>

          <div className="minucanvas-style-toolbar__item">
            <button type="button" className={`minucanvas-style-toolbar__button${panel === 'font' ? ' minucanvas-style-toolbar__button--active' : ''}`} onClick={() => setPanel(panel === 'font' ? null : 'font')} title="Text">
              <strong>T</strong><span className="minucanvas-style-toolbar__chevron">⌄</span>
            </button>
            {panel === 'font' ? (
              <div className="minucanvas-style-toolbar__popover minucanvas-style-toolbar__font-panel">
                {FONT_SIZES.map((size) => <button key={size.label} type="button" className={fontSize === size.value ? 'is-active' : ''} onClick={() => updateStyles({ fontSize: size.value }, {}, 'nodes')}><span>{size.label}</span>{size.name}</button>)}
                <div className="minucanvas-style-toolbar__divider" />
                <div className="minucanvas-style-toolbar__alignment-row" aria-label="Text alignment">
                  {TEXT_ALIGNMENTS.map((alignment) => (
                    <button key={alignment} type="button" className={textAlign === alignment ? 'is-active' : ''} onClick={() => updateStyles({ textAlign: alignment }, {}, 'nodes')} title={`Align ${alignment}`}>
                      <span className={`minucanvas-style-toolbar__align-icon minucanvas-style-toolbar__align-icon--${alignment}`}>
                        <i /><i /><i />
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  )
}

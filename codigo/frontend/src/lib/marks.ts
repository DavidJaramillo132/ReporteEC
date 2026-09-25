import type { Confidence, IncidentType } from './registry'
import { CONFIDENCE_ORDER, INCIDENT_TYPES, TYPE_COLOR } from './registry'

/**
 * Registry marks. Hue is the incident type; shape reinforces it; confidence is
 * the mark's style (fill and outline), so both read without relying on color.
 *   homicidio    disc
 *   sicariato    disc inside a second ring
 *   femicidio    disc with a paper core
 *   desaparecida open ring: a person who is not there
 * One geometry feeds both the map (canvas) and the interface (SVG).
 */
export const INK = '#15212c'
export const PAPER = '#f8f9f7'

interface MarkShape {
  disc: boolean
  core: boolean
  outerRing: boolean
}

const SHAPES: Record<IncidentType, MarkShape> = {
  homicidio: { disc: true, core: false, outerRing: false },
  sicariato: { disc: true, core: false, outerRing: true },
  femicidio: { disc: true, core: true, outerRing: false },
  desaparecida: { disc: false, core: false, outerRing: false },
}

export interface MarkStyle {
  fill: 'solid' | 'hatch' | 'none'
  /** Outline dash on a 24-unit box; null draws a solid outline. */
  dash: [number, number] | null
  /** Outline in ink (confirmed levels) or in the type color (unconfirmed). */
  outline: 'ink' | 'type'
}

export const CONFIDENCE_STYLE: Record<Confidence, MarkStyle> = {
  oficial: { fill: 'solid', dash: null, outline: 'ink' },
  verificado: { fill: 'solid', dash: [2.2, 1.6], outline: 'ink' },
  reportado: { fill: 'hatch', dash: null, outline: 'type' },
  en_revision: { fill: 'none', dash: [2.2, 1.6], outline: 'type' },
}

/** Geometry on a 24-unit box. */
const R_DISC = 6.5
const R_OUTER = 10
const R_CORE = 2.4

export const markImageId = (type: IncidentType, confidence: Confidence) => `mark-${type}-${confidence}`

function hatchPattern(ctx: CanvasRenderingContext2D, color: string, scale: number) {
  const tile = document.createElement('canvas')
  const size = Math.max(2, Math.round(3 * scale))
  tile.width = size
  tile.height = size
  const t = tile.getContext('2d')!
  t.fillStyle = PAPER
  t.fillRect(0, 0, size, size)
  t.strokeStyle = color
  t.lineWidth = Math.max(1, 1.1 * scale)
  t.beginPath()
  t.moveTo(0, size)
  t.lineTo(size, 0)
  t.stroke()
  return ctx.createPattern(tile, 'repeat')!
}

export function drawMark(
  ctx: CanvasRenderingContext2D,
  type: IncidentType,
  confidence: Confidence,
  scale: number,
  color = TYPE_COLOR[type],
) {
  const shape = SHAPES[type]
  const style = CONFIDENCE_STYLE[confidence]
  const c = 12 * scale
  const dash = style.dash ? style.dash.map((d) => d * scale) : []
  const outline = style.outline === 'ink' ? INK : color
  ctx.save()

  if (shape.outerRing) {
    ctx.beginPath()
    ctx.arc(c, c, R_OUTER * scale, 0, Math.PI * 2)
    ctx.setLineDash(dash)
    ctx.lineWidth = 1.6 * scale
    ctx.strokeStyle = color
    ctx.stroke()
  }

  ctx.beginPath()
  ctx.arc(c, c, R_DISC * scale, 0, Math.PI * 2)
  if (shape.disc) {
    ctx.fillStyle = style.fill === 'solid' ? color : style.fill === 'hatch' ? hatchPattern(ctx, color, scale) : PAPER
    ctx.fill()
    ctx.setLineDash(dash)
    ctx.lineWidth = (style.outline === 'ink' ? 1.1 : 1.6) * scale
    ctx.strokeStyle = outline
    ctx.stroke()
  } else {
    // Open ring: the ring itself carries the type color and the style.
    ctx.fillStyle = style.fill === 'hatch' ? hatchPattern(ctx, color, scale) : PAPER
    ctx.fill()
    ctx.setLineDash(dash)
    ctx.lineWidth = (style.fill === 'none' ? 2 : 3) * scale
    ctx.strokeStyle = color
    ctx.stroke()
    ctx.setLineDash(style.outline === 'ink' && style.dash ? dash : [])
    ctx.beginPath()
    ctx.arc(c, c, (R_DISC + 1.6) * scale, 0, Math.PI * 2)
    ctx.lineWidth = 0.9 * scale
    ctx.strokeStyle = INK
    ctx.stroke()
  }

  if (shape.core && style.fill !== 'none') {
    ctx.setLineDash([])
    ctx.beginPath()
    ctx.arc(c, c, R_CORE * scale, 0, Math.PI * 2)
    ctx.fillStyle = PAPER
    ctx.fill()
  }
  ctx.restore()
}

/** Every type × confidence mark as ImageData, ready for map.addImage. */
export function buildMarkImages(pixelRatio: number) {
  const size = Math.round(24 * pixelRatio)
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  const images: { id: string; data: ImageData }[] = []
  for (const type of INCIDENT_TYPES) {
    for (const confidence of CONFIDENCE_ORDER) {
      ctx.clearRect(0, 0, size, size)
      drawMark(ctx, type, confidence, pixelRatio)
      images.push({ id: markImageId(type, confidence), data: ctx.getImageData(0, 0, size, size) })
    }
  }
  return images
}

export function markGeometry(type: IncidentType) {
  return { ...SHAPES[type], rDisc: R_DISC, rOuter: R_OUTER, rCore: R_CORE }
}

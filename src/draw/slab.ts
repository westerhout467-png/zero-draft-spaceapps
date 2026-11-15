// A flat PMMA slab seen edge-on, its leading edge facing the airflow, as the INTERPRET chamber
// draws opposed-flow slab tests such as Test M5. Clear PMMA like the rod, with square corners, so
// it reads as a plate rather than a rod. An illustration, not to scale.
import { clamp01 } from './noise'

export interface SlabInput {
  /** The middle of the slab's leading edge. The slab runs away from it toward +x. */
  x: number
  y: number
  /** Half the slab's thickness, px. */
  halfThickness: number
  length: number
  /** Light falling on the slab from its flame. */
  light?: { rgb: string; intensity: number; reach: number }
}

const GLASS = '214,226,236'

/** Draw it after the flame, so the flame shows through the clear plate. */
export function drawSlab(ctx: CanvasRenderingContext2D, slab: SlabInput): void {
  const { x, y, halfThickness: half, length } = slab
  const level = clamp01(slab.light?.intensity ?? 0)
  const reach = slab.light?.reach ?? half * 12
  ctx.save()
  ctx.translate(x, y)
  ctx.globalCompositeOperation = 'lighter'

  // The plate: brighter along its two faces, where the edge-on glass bends the most light.
  const body = ctx.createLinearGradient(0, -half, 0, half)
  body.addColorStop(0, `rgba(${GLASS},0.11)`)
  body.addColorStop(0.3, `rgba(${GLASS},0.035)`)
  body.addColorStop(0.7, `rgba(${GLASS},0.035)`)
  body.addColorStop(1, `rgba(${GLASS},0.1)`)
  ctx.fillStyle = body
  ctx.fillRect(0, -half, length, half * 2)

  // Its outline: square corners, clearer near the flame.
  const outline = ctx.createLinearGradient(0, 0, reach * 1.6, 0)
  outline.addColorStop(0, `rgba(${GLASS},${0.16 + 0.2 * level})`)
  outline.addColorStop(1, `rgba(${GLASS},0.08)`)
  ctx.strokeStyle = outline
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(length, -half + 0.5)
  ctx.lineTo(0.5, -half + 0.5)
  ctx.lineTo(0.5, half - 0.5)
  ctx.lineTo(length, half - 0.5)
  ctx.stroke()

  // A faint reflection of the flame in the burning end, and nothing further along.
  if (slab.light && level > 0.003) {
    const glow = ctx.createLinearGradient(0, 0, reach, 0)
    glow.addColorStop(0, `rgba(${slab.light.rgb},${0.16 * level})`)
    glow.addColorStop(1, `rgba(${slab.light.rgb},0)`)
    ctx.fillStyle = glow
    ctx.fillRect(0, -half, reach, half * 2)
  }
  ctx.restore()
}

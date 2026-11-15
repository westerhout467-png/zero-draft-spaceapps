// A clear PMMA rod with a rounded nose, seen in the dark, as in NASA's Fig. 6.3 photos: a
// translucent cylinder with soft highlights along its edges, a few small bubbles in the hot end,
// and a faint reflection of its flame. An illustration, not to scale. The rod never hides the
// flame: whatever is drawn before it shows through.
import { clamp01, glow } from './noise'

export interface RodInput {
  /** The nose of the rod. */
  x: number
  y: number
  /** The direction the rod runs away from its nose, radians: 0 is toward +x, π/2 is down. */
  angle: number
  radius: number
  length: number
  /** Light falling on the rod from its flame. */
  light?: {
    /** "r,g,b" */
    rgb: string
    /** 0 none … 1 full. */
    intensity: number
    /** How far along the rod the light reaches, px. */
    reach: number
  }
}

const GLASS = '214,226,236'

/**
 * Bubbles in the hot end of the rod: [distance from the nose in radii, offset across in radii,
 * size in radii]. Fixed, so they don't jump about between frames.
 */
const BUBBLES: readonly (readonly [number, number, number])[] = [
  [0.95, 0.12, 0.17],
  [1.5, -0.4, 0.1],
  [1.95, 0.34, 0.2],
  [2.5, -0.12, 0.12],
  [3.05, 0.46, 0.09],
  [3.5, -0.42, 0.15],
  [4.2, 0.14, 0.08],
]

/** How far along the rod its bubbles reach, in radii. The stage puts their footnote over them. */
export const BUBBLES_REACH_RADII = 4.6

function rodPath(ctx: CanvasRenderingContext2D, radius: number, length: number) {
  ctx.beginPath()
  ctx.moveTo(radius, -radius)
  ctx.lineTo(length, -radius)
  ctx.lineTo(length, radius)
  ctx.lineTo(radius, radius)
  ctx.arc(radius, 0, radius, Math.PI / 2, (Math.PI * 3) / 2)
  ctx.closePath()
}

/** The rod's two long edges and its nose, as an open line. */
function edgePath(ctx: CanvasRenderingContext2D, radius: number, length: number) {
  ctx.beginPath()
  ctx.moveTo(length, -radius)
  ctx.lineTo(radius, -radius)
  ctx.arc(radius, 0, radius, (Math.PI * 3) / 2, Math.PI / 2, true)
  ctx.lineTo(length, radius)
}

/** Draw it after the flame, so the flame shows through the clear rod. */
export function drawRod(ctx: CanvasRenderingContext2D, rod: RodInput): void {
  const { radius, length } = rod
  const level = clamp01(rod.light?.intensity ?? 0)
  const reach = rod.light?.reach ?? radius * 6
  ctx.save()
  ctx.translate(rod.x, rod.y)
  ctx.rotate(rod.angle)
  ctx.globalCompositeOperation = 'lighter'

  // The glass itself: a little brighter toward each edge, where it bends the most light.
  rodPath(ctx, radius, length)
  const body = ctx.createLinearGradient(0, -radius, 0, radius)
  body.addColorStop(0, `rgba(${GLASS},0.085)`)
  body.addColorStop(0.16, `rgba(${GLASS},0.03)`)
  body.addColorStop(0.5, `rgba(${GLASS},0.014)`)
  body.addColorStop(0.84, `rgba(${GLASS},0.028)`)
  body.addColorStop(1, `rgba(${GLASS},0.075)`)
  ctx.fillStyle = body
  ctx.fill()

  // Its outline: faint everywhere, clearer near the flame.
  const outline = ctx.createLinearGradient(0, 0, reach * 1.6, 0)
  outline.addColorStop(0, `rgba(${GLASS},${0.09 + 0.17 * level})`)
  outline.addColorStop(1, `rgba(${GLASS},0.07)`)
  edgePath(ctx, radius, length)
  ctx.strokeStyle = outline
  ctx.lineWidth = 1
  ctx.stroke()

  // One soft highlight running along the rod, off-centre, as on any polished cylinder.
  const streak = ctx.createLinearGradient(radius * 0.8, 0, reach * 1.4, 0)
  streak.addColorStop(0, `rgba(${GLASS},0)`)
  streak.addColorStop(0.12, `rgba(${GLASS},${0.1 + 0.26 * level})`)
  streak.addColorStop(1, `rgba(${GLASS},0.04)`)
  ctx.beginPath()
  ctx.moveTo(radius * 0.8, -radius * 0.46)
  ctx.lineTo(length, -radius * 0.46)
  ctx.strokeStyle = streak
  ctx.lineWidth = Math.max(1, radius * 0.09)
  ctx.lineCap = 'round'
  ctx.stroke()

  if (rod.light && level > 0.003) {
    // A faint reflection of the flame in the end of the rod, and nothing further along.
    ctx.save()
    rodPath(ctx, radius, length)
    ctx.clip()
    ctx.translate(radius * 0.3, 0)
    ctx.scale(Math.max(radius * 2, reach * 0.55), radius * 1.6)
    const reflection = ctx.createRadialGradient(0, 0, 0, 0, 0, 1)
    reflection.addColorStop(0, `rgba(${rod.light.rgb},${0.11 * level})`)
    reflection.addColorStop(0.5, `rgba(${rod.light.rgb},${0.04 * level})`)
    reflection.addColorStop(1, `rgba(${rod.light.rgb},0)`)
    ctx.fillStyle = reflection
    ctx.fillRect(-1, -1, 2, 2)
    ctx.restore()
  }

  // Bubbles in the hot end: small soft specks of light, each with a brighter glint, as in the
  // photos. They catch the flame's light.
  const shine = 0.35 + 0.65 * level
  for (const [alongRadii, acrossRadii, sizeRadii] of BUBBLES) {
    const bx = alongRadii * radius
    const by = acrossRadii * radius
    const size = Math.max(1.5, sizeRadii * radius)
    glow(ctx, bx, by, size * 1.5, size * 1.2, GLASS, 0.3 * shine, 'body')
    glow(ctx, bx - size * 0.3, by - size * 0.3, size * 0.6, size * 0.6, '245,250,255', 0.75 * shine)
  }
  ctx.restore()
}

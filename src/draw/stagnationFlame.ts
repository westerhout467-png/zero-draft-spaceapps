// The orbit flame: a cup of light around the nose of a rod that faces into the airflow. An
// illustration, not data, drawn after NASA's photos of limit flames on BASS-II rods (Fig. 6.3 of
// the BASS-II Summary Report, PDF p. 78):
// - (a) to (c), near quenching: a translucent blue cup, brightest along its outer rim, open
//   downstream, with a thin dark gap between the flame and the rod;
// - (d) to (f), near blowoff: the cup's tip opens up and warm light trails downstream, with blue
//   only at the edges.
// The Burn Twin uses it now; the INTERPRET simulator (M5) reuses it.
import { QUENCH_ASPECT_RATIO } from '../lib/burnTwin'
import { EQ61_MINIMUM } from '../lib/physics'
import { clamp01, glow, lerp, smoothstep } from './noise'

export interface StagnationFlameShape {
  /** Gap from the rod's nose, upstream, to the front of the cup, px. */
  standoff: number
  /** Half the flame's width across the flow, px. */
  halfWidth: number
  /** How far the flame reaches downstream of the nose, px. */
  tail: number
  /** 0 at the limit … 1 well above it. Sets the size and brightness. */
  vigor: number
  /** 0 all-blue … 1 warm orange-yellow light trailing downstream. Only in fast airflow. */
  warm: number
  /** 0 a closed cup … 1 the stagnation tip has opened up (close to blowoff). */
  open: number
}

export interface StagnationFlameInput {
  /** The rod's nose, where the flow stagnates. The flow runs toward +x and the rod lies at x > 0. */
  x: number
  y: number
  rodRadius: number
  shape: StagnationFlameShape
  /** 0 dark … 1 fully lit. Fades and the 1.1 Hz pulse come in here. */
  intensity: number
}

const MIN_FLATTEN = 0.4
const MAX_FLATTEN = 1.5
/** Where the cup's brightest ring sits, as a fraction of its gradient's radius. */
const RIM_AT = 0.9

/**
 * Turns model state into the drawn shape. All of it is illustration, steered by two things the
 * report states:
 * - at quenching extinction the flame's length ÷ width is 0.5, a hemisphere (bass2.aspect-0.5),
 *   so on the quenching side the cup shortens toward exactly that as the margin runs out;
 * - near blowoff the stagnation tip opens up (Fig. 6.3 d to f).
 * A bigger margin gives a bigger flame; a higher stretch rate flattens it against the tip.
 */
export function stagnationFlameShape(p: {
  /** Drawn radius of the 6.35 mm rod, px. */
  unit: number
  /** Drawn radius of this rod, px. */
  rodRadius: number
  /** Stretch rate a, 1/s. */
  stretchRate: number
  /** Points of O2 above the Eq. 6.1 limit. */
  marginPts: number
}): StagnationFlameShape {
  const margin = Math.max(0, p.marginPts)
  const vigor = 1 - Math.exp(-margin / 1.4)
  const thicker = p.rodRadius / p.unit - 1
  /** Stretch rate as a multiple of the one where Eq. 6.1 is lowest: below 1 is the quenching side. */
  const flow = Math.max(p.stretchRate, 1e-3) / EQ61_MINIMUM.a
  const flatten = Math.min(MAX_FLATTEN, Math.max(MIN_FLATTEN, Math.pow(flow, -0.4)))
  /** 0 on the quenching side, rising to 1 well up the blowoff side. */
  const blow = smoothstep(1, 4, flow)

  const standoff = p.unit * (2 + 0.35 * vigor) * flatten
  const gap = p.unit * (2.6 + 0.8 * thicker + 0.9 * vigor) * (0.55 + 0.45 * flatten)
  const halfWidth = p.rodRadius + gap

  // Length ÷ width. Away from the limit the cup is longer than a hemisphere, more so on a thick
  // rod and in fast flow. On the quenching side it closes in on 0.5 as the margin goes to zero.
  const roomy = 0.8 + 0.2 * thicker + 0.7 * blow
  const closing = Math.exp(-margin / 0.6) * (1 - blow)
  const aspect = lerp(roomy, QUENCH_ASPECT_RATIO, closing)

  return {
    standoff,
    halfWidth,
    tail: aspect * 2 * halfWidth - standoff,
    vigor,
    warm: blow,
    open: blow * (1 - smoothstep(0.4, 2.2, margin)),
  }
}

/** The flame's length ÷ width, the ratio NASA reports falling to 0.5 at quenching extinction. */
export function flameAspectRatio(shape: StagnationFlameShape): number {
  return (shape.standoff + shape.tail) / (2 * shape.halfWidth)
}

/** The box that holds the cup, relative to the nose. The annotation bracket tracks it. */
export function stagnationFlameBounds(shape: StagnationFlameShape) {
  return { left: -shape.standoff, right: shape.tail, top: -shape.halfWidth, bottom: shape.halfWidth }
}

/** The rod's outline in the flame's own coordinates: nose at (0, 0), body running to +x. */
function rodOutline(g: CanvasRenderingContext2D, radius: number, length: number) {
  g.beginPath()
  g.moveTo(length, -radius)
  g.lineTo(radius, -radius)
  g.arc(radius, 0, radius, (Math.PI * 3) / 2, Math.PI / 2, true)
  g.lineTo(length, radius)
}

// The flame is drawn on its own small canvas first, so parts of it can be faded or cut away
// with masks, and then added to the stage as light.
let layer: HTMLCanvasElement | null = null

export function drawStagnationFlame(ctx: CanvasRenderingContext2D, input: StagnationFlameInput): void {
  const light = clamp01(input.intensity)
  if (light <= 0.003) return
  const { standoff, halfWidth, tail, vigor, warm, open } = input.shape
  const radius = input.rodRadius
  const scale = ctx.getTransform().a
  const pad = 28
  const left = standoff + pad
  const right = tail * (1 + 0.7 * warm) + pad
  const half = halfWidth + pad
  const width = Math.ceil((left + right) * scale)
  const height = Math.ceil(half * 2 * scale)

  layer ??= document.createElement('canvas')
  if (layer.width < width) layer.width = width
  if (layer.height < height) layer.height = height
  const g = layer.getContext('2d')
  if (!g) return
  g.setTransform(1, 0, 0, 1, 0, 0)
  g.globalCompositeOperation = 'source-over'
  g.filter = 'none'
  g.clearRect(0, 0, layer.width, layer.height)
  // From here the nose is at (0, 0) and the flow runs toward +x.
  g.setTransform(scale, 0, 0, scale, left * scale, half * scale)
  g.globalCompositeOperation = 'lighter'

  // The cup: half an ellipse whose centre is on the trailing edge. Brightest along its outer
  // rim, then a broad fall to a soft translucent blue inside.
  const along = tail + standoff
  g.save()
  g.beginPath()
  g.rect(-left, -half, left + tail, half * 2)
  g.clip()
  g.translate(tail, 0)
  g.scale(along / RIM_AT, halfWidth / RIM_AT)
  const cup = g.createRadialGradient(0, 0, 0, 0, 0, 1)
  // The rim is a lighter, whiter blue the further the flame is from its limit.
  const rim = [lerp(96, 176, vigor), lerp(194, 230, vigor), 255].map(Math.round).join(',')
  // Near the limit the inside is thinner, so the rim stands out more, as in the photos.
  const inside = light * (0.78 + 0.22 * vigor)
  cup.addColorStop(0, `rgba(34,100,232,${0.3 * inside})`)
  cup.addColorStop(0.4, `rgba(38,110,236,${0.34 * inside})`)
  cup.addColorStop(0.64, `rgba(46,130,244,${0.45 * inside})`)
  cup.addColorStop(0.79, `rgba(64,164,252,${0.68 * light})`)
  cup.addColorStop(RIM_AT, `rgba(${rim},${light})`)
  cup.addColorStop(0.945, `rgba(64,150,255,${0.5 * light})`)
  cup.addColorStop(0.975, `rgba(30,90,235,${0.14 * light})`)
  cup.addColorStop(1, 'rgba(30,90,235,0)')
  g.fillStyle = cup
  g.beginPath()
  g.arc(0, 0, 1, 0, Math.PI * 2)
  g.fill()
  g.restore()

  // The trailing edge. Near quenching it is flat and fairly crisp, as in Fig. 6.3 (a) to (c);
  // in fast flow the flame thins out along the rod instead.
  const edge = 11 + 3 * vigor + 0.6 * tail * warm
  const fade = g.createLinearGradient(tail - edge, 0, tail, 0)
  fade.addColorStop(0, 'rgba(0,0,0,1)')
  fade.addColorStop(1, 'rgba(0,0,0,0)')
  g.globalCompositeOperation = 'destination-in'
  g.fillStyle = fade
  g.fillRect(-left, -half, left + right, half * 2)

  // Close to blowoff the stagnation tip opens up: the front of the cup is cut away and the
  // flame holds on only along the sides (Fig. 6.3 d to f).
  if (open > 0.01) {
    g.globalCompositeOperation = 'destination-out'
    const across = (radius + (halfWidth - radius) * 0.55) * (0.5 + 0.5 * open)
    glow(g, -standoff * 0.7, 0, standoff * 1.6 + radius * 1.4, across, '0,0,0', open, 'body')
  }
  g.globalCompositeOperation = 'lighter'

  // In fast flow warm orange-yellow light trails downstream inside the blue edges. It stays
  // behind the flame front: nothing warm shows upstream of the cup.
  if (warm > 0.01) {
    const hot = warm * light
    const reach = tail * (0.7 + 0.5 * warm)
    g.save()
    g.beginPath()
    g.ellipse(tail, 0, along * 0.93, halfWidth * 0.93, 0, Math.PI / 2, (Math.PI * 3) / 2)
    g.lineTo(tail + right, -halfWidth)
    g.lineTo(tail + right, halfWidth)
    g.closePath()
    g.clip()
    // Two lobes, one each side of the rod, between its surface and the blue edge: the light
    // is in the flame beside the rod, not in the rod.
    const room = halfWidth - radius
    for (const side of [-1, 1]) {
      const cy = side * (radius + room * 0.42)
      glow(g, reach * 0.72, cy, reach * 0.95, room * 0.62, '255,122,34', 0.44 * hot, 'body')
      glow(g, reach * 0.6, cy, reach * 0.7, room * 0.4, '255,190,88', 0.26 * hot, 'body')
    }
    g.restore()
  }

  // The thin dark gap between flame and rod, where the cool surface quenches the flame, and a
  // little dimming where the light is seen through the rod itself.
  const quench = Math.max(3.5, standoff * 0.15)
  g.globalCompositeOperation = 'destination-out'
  if ('filter' in g) g.filter = `blur(${(quench * 0.6).toFixed(1)}px)`
  rodOutline(g, radius, right + pad)
  g.lineWidth = quench * 2
  g.strokeStyle = 'rgba(0,0,0,0.85)'
  g.stroke()
  g.filter = 'none'
  rodOutline(g, radius, right + pad)
  g.fillStyle = 'rgba(0,0,0,0.38)'
  g.fill()

  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  // A wide, faint aura, so the flame lights the dark around it.
  glow(ctx, input.x + tail * 0.25, input.y, along * 1.6, halfWidth * 1.7, '28,84,255', 0.16 * light)
  ctx.drawImage(layer, 0, 0, width, height, input.x - left, input.y - half, width / scale, height / scale)
  ctx.restore()
}

/**
 * What is left when the orbit flame goes out: a faint round haze that stays where it is,
 * because without buoyancy nothing carries it up.
 */
export function drawHalo(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  alpha: number,
): void {
  glow(ctx, x, y, radius, radius, '150,170,205', 0.1 * clamp01(alpha))
  glow(ctx, x, y, radius * 0.55, radius * 0.55, '170,185,215', 0.07 * clamp01(alpha))
}

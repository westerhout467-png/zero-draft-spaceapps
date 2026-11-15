// The Earth flame: a teardrop of light rising from the top of a rod. An illustration, not data.
// It is drawn as stacked soft glows added together (blue base, orange-yellow body, warm white
// core), so it has no outline. Call it with globalCompositeOperation "lighter".
import { clamp01, glow, noise } from './noise'

export interface CandleFlameInput {
  /** The top of the rod. The flame rises from here, toward −y. */
  x: number
  y: number
  rodRadius: number
  /** Width of the flame's body at its widest, px. */
  width: number
  /** Height from the rod's top to the flame's tip, px. */
  height: number
  /** 0 dark … 1 fully lit. */
  intensity: number
  /** 0 standing … 1 collapsed onto the rod. Drives the 400 ms going-out. */
  collapse: number
  /** Seconds. Drives the flicker; ignored when `flicker` is 0. */
  time: number
  /** 0 perfectly still … 1 full flicker. */
  flicker: number
}

/** Relative width of the teardrop from its base (first) to its tip (last). */
const PROFILE = [0.8, 0.97, 1, 0.93, 0.8, 0.63, 0.45, 0.28, 0.13]

const ORANGE = '255,112,24'
const YELLOW = '255,184,64'
const WHITE = '255,240,206'
const BLUE = '54,112,255'

/** Where the tip of the flame is this frame, so smoke can rise from it. */
export function candleFlameTip(input: CandleFlameInput): { x: number; y: number } {
  const { sway, height } = motion(input)
  return { x: input.x + sway, y: input.y - height }
}

/** The flicker: a small random sway and stretch about ten times a second, on a slower drift. */
function motion({ time, flicker, width, height, collapse }: CandleFlameInput) {
  const eased = collapse * collapse * (3 - 2 * collapse)
  const stretch = 1 + flicker * (0.07 * noise(time * 10, 3) + 0.05 * noise(time * 2.3, 4))
  return {
    sway: flicker * width * (0.3 * noise(time * 10, 1) + 0.24 * noise(time * 3.1, 2)),
    height: height * stretch * (1 - 0.82 * eased),
    width: width * (1 - 0.45 * eased),
    brightness: 1 + flicker * 0.06 * noise(time * 13, 5),
  }
}

export function drawCandleFlame(ctx: CanvasRenderingContext2D, input: CandleFlameInput): void {
  const level = clamp01(input.intensity) * Math.pow(1 - clamp01(input.collapse), 1.2)
  if (level <= 0.003) return
  const { sway, height, width, brightness } = motion(input)
  const light = level * brightness
  const half = width / 2
  const last = PROFILE.length - 1

  // Blue base: a cup of light around the top of the rod.
  glow(ctx, input.x, input.y + input.rodRadius * 0.7, half * 2.5, input.rodRadius * 1.5, BLUE, 0.34 * light)
  glow(ctx, input.x, input.y - height * 0.02, half * 2.7, height * 0.1, BLUE, 0.5 * light)

  for (let i = 0; i <= last; i++) {
    const s = i / last
    // The tip sways furthest; the base stays on the rod.
    const cx = input.x + sway * Math.pow(s, 1.6)
    const cy = input.y - s * height
    // A glow fades to nothing at its radius, so the radii are beyond the visible edge.
    const rx = PROFILE[i] * half * 1.7
    const ry = height * (0.24 - 0.08 * s)
    if (s >= 0.06) glow(ctx, cx, cy, rx, ry, ORANGE, 0.2 * light, 'body')
    if (s >= 0.06 && s <= 0.8) glow(ctx, cx, cy, rx * 0.66, ry * 0.9, YELLOW, 0.2 * light, 'body')
    if (s >= 0.1 && s <= 0.5) glow(ctx, cx, cy, rx * 0.36, ry * 0.75, WHITE, 0.36 * light)
  }
}

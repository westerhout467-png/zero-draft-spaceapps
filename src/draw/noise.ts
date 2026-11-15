// Small maths helpers for the stage drawings.

export const clamp01 = (value: number) => Math.min(1, Math.max(0, value))

export const lerp = (from: number, to: number, t: number) => from + (to - from) * t

/** 0 below `from`, 1 above `to`, a smooth S-curve between. */
export function smoothstep(from: number, to: number, value: number): number {
  const t = clamp01((value - from) / (to - from))
  return t * t * (3 - 2 * t)
}

/** A repeatable pseudo-random number in 0…1 for a whole number n. */
function hash(n: number): number {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453
  return s - Math.floor(s)
}

/**
 * Smooth random wobble in −1…1. It changes direction about once per unit of x, so
 * noise(seconds * 10, seed) wobbles about ten times a second. Different seeds don't move together.
 */
export function noise(x: number, seed = 0): number {
  const cell = Math.floor(x)
  const f = x - cell
  const u = f * f * (3 - 2 * f)
  const offset = seed * 57.31
  return lerp(hash(cell + offset), hash(cell + 1 + offset), u) * 2 - 1
}

/** Moves `value` toward `target` at `perSecond` units per second, without overshooting. */
export function approach(value: number, target: number, perSecond: number, dt: number): number {
  const step = perSecond * dt
  if (Math.abs(target - value) <= step) return target
  return value + Math.sign(target - value) * step
}

/**
 * Fills a soft elliptical glow: one radial gradient from `alpha` at the centre to nothing at the
 * edge. Flames are built from many of these, added together.
 * "haze" falls away quickly from the centre; "body" stays bright most of the way out and then
 * fades, which gives a flame a readable edge without an outline.
 */
export function glow(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radiusX: number,
  radiusY: number,
  rgb: string,
  alpha: number,
  profile: 'haze' | 'body' = 'haze',
): void {
  if (alpha <= 0.002 || radiusX <= 0.5 || radiusY <= 0.5) return
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(radiusX, radiusY)
  const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, 1)
  gradient.addColorStop(0, `rgba(${rgb},${alpha})`)
  if (profile === 'body') {
    gradient.addColorStop(0.5, `rgba(${rgb},${alpha * 0.86})`)
    gradient.addColorStop(0.78, `rgba(${rgb},${alpha * 0.34})`)
  } else {
    gradient.addColorStop(0.35, `rgba(${rgb},${alpha * 0.62})`)
    gradient.addColorStop(0.7, `rgba(${rgb},${alpha * 0.18})`)
  }
  gradient.addColorStop(1, `rgba(${rgb},0)`)
  ctx.fillStyle = gradient
  ctx.beginPath()
  ctx.arc(0, 0, 1, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

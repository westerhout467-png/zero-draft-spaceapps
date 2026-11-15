// The orbit airflow: thin streaks of light carried left to right, parting around the rod's nose.
// An illustration. The path each streak follows is the textbook flow past a round-nosed body
// (a uniform stream plus a source), so the streaks stagnate at the nose and slide around it.
import { clamp01 } from './noise'

/** Never more than this many streaks (SPEC F1). */
export const MAX_PARTICLES = 300
/** Each streak remembers this many past positions; its trail is drawn through them. */
const HISTORY = 16
/** A trail is never drawn longer than about this, however fast the flow, px. */
const MAX_TRAIL_PX = 150
/** Trails are drawn in three pieces, faintest at the tail. */
const TRAIL_ALPHA = [0.22, 0.5, 1]
const ALPHA_LEVELS = 4
const COLOR = '205,240,255'

export interface AirflowBounds {
  left: number
  right: number
  top: number
  bottom: number
}

export interface AirflowField {
  /** The rod's nose. */
  noseX: number
  noseY: number
  rodRadius: number
  /** Speed of the undisturbed stream, px/s. Proportional to U. */
  speed: number
}

export class Airflow {
  private readonly count: number
  /** Position history: for each particle, HISTORY pairs of (x, y); `head` is the newest. */
  private readonly trail: Float32Array
  private readonly depth: Float32Array
  private head = 0
  /** How many positions back a trail reaches: fewer when the flow is fast. */
  private lag = HISTORY - 1
  private bounds: AirflowBounds = { left: 0, right: 1, top: 0, bottom: 1 }
  private seeded = false

  constructor(count = 260) {
    this.count = Math.min(count, MAX_PARTICLES)
    this.trail = new Float32Array(this.count * HISTORY * 2)
    this.depth = new Float32Array(this.count)
    for (let i = 0; i < this.count; i++) this.depth[i] = 0.45 + 0.55 * Math.random()
  }

  /** Sets the box the streaks live in (the stage's right half) and scatters them across it. */
  setBounds(bounds: AirflowBounds): void {
    this.bounds = bounds
    for (let i = 0; i < this.count; i++) {
      this.place(i, bounds.left + Math.random() * (bounds.right - bounds.left))
    }
    this.seeded = true
  }

  private place(i: number, x: number): void {
    const y = this.bounds.top + Math.random() * (this.bounds.bottom - this.bounds.top)
    const base = i * HISTORY * 2
    for (let h = 0; h < HISTORY; h++) {
      this.trail[base + h * 2] = x
      this.trail[base + h * 2 + 1] = y
    }
  }

  /** Moves every streak along the flow for `dt` seconds. */
  update(dt: number, field: AirflowField): void {
    if (!this.seeded || dt <= 0) return
    const { left, right } = this.bounds
    // A uniform stream plus a source just behind the nose: the stream stagnates at the nose and
    // parts around a body that ends up a little fatter than the rod, so no streak clips it.
    // The flat (2D) form is used because it keeps the streaks evenly spread across the picture.
    const reach = (field.rodRadius * 1.45) / Math.PI
    const sourceX = field.noseX + reach
    const next = (this.head + 1) % HISTORY
    const perStep = Math.max(field.speed * dt, 1e-3)
    this.lag = Math.min(HISTORY - 1, Math.max(3, Math.round(MAX_TRAIL_PX / perStep)))
    for (let i = 0; i < this.count; i++) {
      const base = i * HISTORY * 2
      let x = this.trail[base + this.head * 2]
      let y = this.trail[base + this.head * 2 + 1]
      const speed = field.speed * this.depth[i]
      // Short steps near the nose, so fast streaks follow the curve instead of cutting across it.
      const steps = Math.min(8, Math.max(1, Math.ceil((speed * dt) / 5)))
      const h = dt / steps
      for (let s = 0; s < steps; s++) {
        const dx = x - sourceX
        let dy = y - field.noseY
        // Nothing sits exactly on the centreline, where a streak would stall at the nose forever.
        if (Math.abs(dy) < 0.75) dy = dy < 0 ? -0.75 : 0.75
        const push = reach / Math.max(dx * dx + dy * dy, reach * reach * 0.25)
        x += speed * (1 + push * dx) * h
        y += speed * push * dy * h
      }
      const insideRod =
        x > field.noseX + field.rodRadius * 0.3 && Math.abs(y - field.noseY) < field.rodRadius
      if (x > right || insideRod) {
        this.place(i, left)
        continue
      }
      this.trail[base + next * 2] = x
      this.trail[base + next * 2 + 1] = y
    }
    this.head = next
  }

  /** Rebuilds every trail at once, for a still picture of the flow (reduced motion). */
  settle(field: AirflowField): void {
    for (let step = 0; step < HISTORY; step++) this.update(1 / 60, field)
  }

  draw(ctx: CanvasRenderingContext2D, opacity = 1): void {
    if (!this.seeded || opacity <= 0) return
    const { left, right } = this.bounds
    const span = right - left
    ctx.save()
    ctx.globalCompositeOperation = 'lighter'
    ctx.lineCap = 'round'
    ctx.lineWidth = 1
    const piece = this.lag / TRAIL_ALPHA.length
    // The oldest position a trail uses, then forward to the head in three pieces.
    const tail = this.head - this.lag + HISTORY
    for (let level = 1; level <= ALPHA_LEVELS; level++) {
      for (let part = 0; part < TRAIL_ALPHA.length; part++) {
        const from = (tail + Math.round(part * piece)) % HISTORY
        const to = (tail + Math.round((part + 1) * piece)) % HISTORY
        ctx.strokeStyle = `rgba(${COLOR},${0.3 * opacity * (level / ALPHA_LEVELS) * TRAIL_ALPHA[part]})`
        ctx.beginPath()
        for (let i = 0; i < this.count; i++) {
          const base = i * HISTORY * 2
          const x = this.trail[base + this.head * 2]
          if (this.levelOf(i, x, left, span) !== level) continue
          ctx.moveTo(this.trail[base + from * 2], this.trail[base + from * 2 + 1])
          ctx.lineTo(this.trail[base + to * 2], this.trail[base + to * 2 + 1])
        }
        ctx.stroke()
      }
      // A brighter head, so a slow streak still reads as a mote of light.
      ctx.fillStyle = `rgba(${COLOR},${0.42 * opacity * (level / ALPHA_LEVELS)})`
      for (let i = 0; i < this.count; i++) {
        const base = i * HISTORY * 2
        const x = this.trail[base + this.head * 2]
        if (this.levelOf(i, x, left, span) !== level) continue
        ctx.fillRect(x - 0.75, this.trail[base + this.head * 2 + 1] - 0.75, 1.5, 1.5)
      }
    }
    ctx.restore()
  }

  /** Brightness step for a streak: nearer ones are brighter, and all fade in and out at the edges. */
  private levelOf(i: number, x: number, left: number, span: number): number {
    const t = (x - left) / span
    const edge = clamp01(t / 0.1) * clamp01((1 - t) / 0.14)
    return Math.round(this.depth[i] * edge * ALPHA_LEVELS)
  }
}

// Draws one frame of the INTERPRET chamber: the orbit airflow, the rod (or a flat slab) with the
// Burn Twin's blue orbit flame on its leading edge, a faint haze for CO, then bloom and a vignette.
// The cabin model decides whether the flame burns; this file only decides how that looks, using
// the same flame, fade and halo as the Overview's orbit half. All of it is illustration.
import { PULSE_HZ } from '../lib/burnTwin'
import type { Geometry } from '../lib/cabin'
import { EQ61_MINIMUM, ROD_DIAMETERS_MM, type RodMm } from '../lib/physics'
import { Airflow, type AirflowField } from './airflow'
import { Bloom } from './bloom'
import { approach, lerp } from './noise'
import { drawRod } from './rod'
import { drawSlab } from './slab'
import { drawHalo, drawStagnationFlame, stagnationFlameShape } from './stagnationFlame'

export interface ChamberSceneInput {
  geometry: Geometry
  rodMm: RodMm
  flowCmS: number
  /** The model says the flame is burning. */
  lit: boolean
  /** The model says it burned and has gone out (not "never lit"). */
  wentOut: boolean
  /** Points of O2 above the flame's limit. For a slab, an O2-based size only: slabs have no limit model. */
  marginPts: number
  /** Stretch rate a, 1/s. Rods only. */
  stretchRate: number
  /** The 1.1 Hz pulse near the quenching limit (SPEC F1). */
  pulsing: boolean
  /** CO ÷ 55 ppm, capped at 1: how thick the haze is. */
  haze: number
  /** The streaks move only while the simulation plays. */
  flowing: boolean
  reducedMotion: boolean
}

// The same timings as the Burn Twin's orbit flame (SPEC F1).
const FADE_S = 0.6
const IGNITE_S = 0.25
const FLOW_SPEED_PER_CM_S = 2
const STREAKS = 120
/** The haze at full strength (CO at 55 ppm or more). Faint: it tints the chamber, it doesn't hide the flame. */
const HAZE_ALPHA = 0.16

export class ChamberScene {
  private readonly canvas: HTMLCanvasElement
  private readonly ctx: CanvasRenderingContext2D | null
  private readonly bloom = new Bloom()
  private readonly airflow = new Airflow(STREAKS)
  private width = 0
  private height = 0
  private dpr = 1
  private light = 0
  private halo = 0
  private pulseTime = 0
  private started = false
  private airflowPlaced = false
  private airflowStill = ''

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d', { alpha: false })
  }

  resize(width: number, height: number, dpr: number): void {
    this.width = width
    this.height = height
    this.dpr = dpr
    this.canvas.width = Math.max(1, Math.round(width * dpr))
    this.canvas.height = Math.max(1, Math.round(height * dpr))
    this.airflowPlaced = false
    this.started = false
  }

  /** Draws a frame. Returns true while something is still easing, so the loop keeps going. */
  render(input: ChamberSceneInput, dt: number): boolean {
    const ctx = this.ctx
    if (!ctx || this.width === 0 || this.height === 0) return false
    const still = input.reducedMotion
    const snap = still || !this.started

    const target = input.lit ? 1 : 0
    this.light = snap ? target : approach(this.light, target, 1 / (input.lit ? IGNITE_S : FADE_S), dt)
    const haloTarget = !input.lit && input.wentOut ? 1 : 0
    this.halo = snap ? haloTarget : approach(this.halo, haloTarget, 1 / FADE_S, dt)
    const pulsing = input.pulsing && !still && input.flowing
    this.pulseTime = pulsing ? this.pulseTime + dt : 0
    const pulse = 0.5 - 0.5 * Math.cos(2 * Math.PI * PULSE_HZ * this.pulseTime)

    // Layout: the leading edge a little left of centre, facing the flow from the left.
    const unit = Math.min(18, Math.max(8, Math.min(this.width / 24, this.height / 30)))
    const nose = { x: Math.round(this.width * 0.4), y: Math.round(this.height * 0.46) }
    const rod = input.geometry === 'concurrent-rod'
    const radius = rod ? unit * (input.rodMm / ROD_DIAMETERS_MM[0]) : unit * 0.5

    const shape = stagnationFlameShape({
      unit,
      rodRadius: radius,
      // Slabs have no stretch-rate model; their flame is drawn as the blue, quenching-side cup.
      stretchRate: rod ? input.stretchRate : EQ61_MINIMUM.a * 0.7,
      marginPts: input.marginPts,
    })
    const breath = 1 - 0.06 * pulse
    const drawn = { ...shape, standoff: shape.standoff * breath, halfWidth: shape.halfWidth * breath, tail: shape.tail * breath }

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
    ctx.globalCompositeOperation = 'source-over'
    ctx.globalAlpha = 1
    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, this.width, this.height)

    this.drawAirflow(ctx, input, dt, { noseX: nose.x, noseY: nose.y, rodRadius: radius, speed: input.flowCmS * unit * FLOW_SPEED_PER_CM_S })

    ctx.globalCompositeOperation = 'lighter'
    drawHalo(ctx, nose.x + radius * 0.3, nose.y, radius + unit * 4.6, this.halo)
    const dim = 1 - 0.45 * pulse
    drawStagnationFlame(ctx, {
      x: nose.x,
      y: nose.y,
      rodRadius: radius,
      shape: drawn,
      intensity: this.light * dim * (0.82 + 0.18 * shape.vigor),
    })
    const warm = shape.warm * 0.6
    const rgb = [lerp(120, 255, warm), lerp(184, 200, warm), lerp(255, 150, warm)].map(Math.round).join(',')
    const light = { rgb, intensity: this.light * dim * (0.55 + 0.45 * shape.vigor), reach: shape.tail + unit * 2 }
    const length = this.width - nose.x + 48
    if (rod) drawRod(ctx, { x: nose.x, y: nose.y, angle: 0, radius, length, light })
    else drawSlab(ctx, { x: nose.x, y: nose.y, halfThickness: radius, length, light })

    this.drawHaze(ctx, input.haze)
    this.bloom.apply(ctx, this.canvas, this.width, this.height)
    this.drawVignette(ctx)

    this.started = true
    const easing = this.light !== target || this.halo !== haloTarget
    return easing || pulsing
  }

  private drawAirflow(ctx: CanvasRenderingContext2D, input: ChamberSceneInput, dt: number, field: AirflowField) {
    if (!this.airflowPlaced) {
      this.airflow.setBounds({ left: -8, right: this.width + 24, top: -12, bottom: this.height + 12 })
      this.airflowPlaced = true
      this.airflowStill = ''
    }
    if (input.flowing && !input.reducedMotion) {
      this.airflow.update(dt, field)
      this.airflowStill = ''
    } else {
      // A still picture of the flow, rebuilt only when the flow itself changes.
      const key = `${field.speed.toFixed(2)}|${field.rodRadius.toFixed(1)}|${this.width}x${this.height}`
      if (key !== this.airflowStill) this.airflow.settle(field)
      this.airflowStill = key
    }
    this.airflow.draw(ctx, 0.8)
  }

  /** Smoke for CO: a faint, even grey that thickens toward the middle of the chamber. */
  private drawHaze(ctx: CanvasRenderingContext2D, haze: number) {
    if (haze <= 0.002) return
    const alpha = HAZE_ALPHA * Math.min(1, haze)
    ctx.save()
    ctx.globalCompositeOperation = 'source-over'
    ctx.translate(this.width / 2, this.height * 0.46)
    ctx.scale(this.width * 0.75, this.height * 0.6)
    const fog = ctx.createRadialGradient(0, 0, 0, 0, 0, 1)
    fog.addColorStop(0, `rgba(150,146,138,${alpha})`)
    fog.addColorStop(0.6, `rgba(150,146,138,${alpha * 0.8})`)
    fog.addColorStop(1, `rgba(150,146,138,${alpha * 0.45})`)
    ctx.fillStyle = fog
    ctx.fillRect(-2, -2, 4, 4)
    ctx.restore()
  }

  private drawVignette(ctx: CanvasRenderingContext2D): void {
    ctx.save()
    ctx.globalCompositeOperation = 'source-over'
    ctx.translate(this.width / 2, this.height / 2)
    ctx.scale(this.width / 2, this.height / 2)
    const shade = ctx.createRadialGradient(0, 0, 0.6, 0, 0, 1.45)
    shade.addColorStop(0, 'rgba(0,0,0,0)')
    shade.addColorStop(1, 'rgba(0,0,0,0.85)')
    ctx.fillStyle = shade
    ctx.fillRect(-1, -1, 2, 2)
    ctx.restore()
  }
}

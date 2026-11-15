// Draws one frame of the Burn Twin stage on its canvas: the oxygen line, the Earth rod and flame
// with its smoke, the orbit airflow, rod and flame, then bloom and a vignette. It also owns the
// small animations between model states (a flame collapsing, fading, pulsing).
// The model decides what is lit; this file only decides how that looks. All of it is illustration.
import { PULSE_HZ } from '../lib/burnTwin'
import { gaugeY, type Point, type StageLayout } from '../lib/twinLayout'
import { Airflow, type AirflowField } from './airflow'
import { Bloom } from './bloom'
import { candleFlameTip, drawCandleFlame, type CandleFlameInput } from './candleFlame'
import { approach, lerp } from './noise'
import { drawRod } from './rod'
import { drawStillWisp, Smoke } from './smoke'
import {
  drawHalo,
  drawStagnationFlame,
  stagnationFlameBounds,
  stagnationFlameShape,
} from './stagnationFlame'

export interface TwinSceneInput {
  layout: StageLayout
  o2Pct: number
  flowCmS: number
  earth: { lit: boolean; wentOut: boolean; marginPts: number }
  orbit: { lit: boolean; wentOut: boolean; marginPts: number; stretchRate: number; pulsing: boolean }
  /** The pointer over the stage, −1…1 on each axis, or null when it is elsewhere. */
  pointer: Point | null
  /** No flicker, pulse, parallax or drifting particles; every state change is instant. */
  reducedMotion: boolean
}

export interface TwinSceneOutput {
  /** How far the flames and the gauge are shifted this frame (parallax), px. */
  flameShift: Point
  gaugeShift: Point
  /** The box around the orbit flame, in stage px before parallax. */
  orbitBox: { left: number; top: number; width: number; height: number }
}

// Durations from SPEC F1.
const EARTH_COLLAPSE_S = 0.4
const ORBIT_FADE_S = 0.6
const IGNITE_S = 0.25
/** How long the Earth rod keeps giving off smoke after its flame goes out, seconds. */
const SMOLDER_S = 3.2
/** The flames move this many px at the stage edge; the gauge moves less, so it sits further back. */
const FLAME_PARALLAX_PX = 9
const GAUGE_PARALLAX_PX = 3
/** Airflow streak speed in drawn units per second for each cm/s of U: proportional to U. */
const FLOW_SPEED_PER_CM_S = 2
const BOX_PAD = 10

export class TwinScene {
  private readonly canvas: HTMLCanvasElement
  private readonly ctx: CanvasRenderingContext2D | null
  private readonly bloom = new Bloom()
  private readonly airflow = new Airflow()
  private readonly smoke = new Smoke()
  private width = 0
  private height = 0
  private dpr = 1
  private time = 0
  private started = false
  private earthLight = 0
  private orbitLight = 0
  private halo = 0
  private smolder = 0
  private pulseTime = 0
  private earthWasLit = false
  private readonly lean: Point = { x: 0, y: 0 }
  /** False until the streaks have been scattered across a stage of the current size. */
  private airflowPlaced = false
  /** The flow the still picture was last drawn for (reduced motion only). */
  private airflowStill = ''

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d', { alpha: false })
  }

  /** Sizes the canvas for a stage of this CSS size, sharp at this device pixel ratio. */
  resize(width: number, height: number, dpr: number): void {
    this.width = width
    this.height = height
    this.dpr = dpr
    this.canvas.width = Math.max(1, Math.round(width * dpr))
    this.canvas.height = Math.max(1, Math.round(height * dpr))
    this.airflowPlaced = false
  }

  render(input: TwinSceneInput, dt: number): TwinSceneOutput {
    const { layout, earth, orbit } = input
    const still = input.reducedMotion
    const snap = still || !this.started
    if (!still) this.time += dt

    // Flames ease between lit and out; under reduced motion they switch at once.
    const ease = (value: number, lit: boolean, outSeconds: number) =>
      snap ? (lit ? 1 : 0) : approach(value, lit ? 1 : 0, 1 / (lit ? IGNITE_S : outSeconds), dt)
    this.earthLight = ease(this.earthLight, earth.lit, EARTH_COLLAPSE_S)
    this.orbitLight = ease(this.orbitLight, orbit.lit, ORBIT_FADE_S)
    const haloTarget = !orbit.lit && orbit.wentOut ? 1 : 0
    this.halo = snap ? haloTarget : approach(this.halo, haloTarget, 1 / ORBIT_FADE_S, dt)
    this.pulseTime = orbit.pulsing && !still ? this.pulseTime + dt : 0
    const pulse = 0.5 - 0.5 * Math.cos(2 * Math.PI * PULSE_HZ * this.pulseTime)

    const follow = still || !input.pointer ? { x: 0, y: 0 } : input.pointer
    const catchUp = snap ? 1 : 1 - Math.exp(-dt * 7)
    this.lean.x += (follow.x - this.lean.x) * catchUp
    this.lean.y += (follow.y - this.lean.y) * catchUp
    const flameShift = { x: -this.lean.x * FLAME_PARALLAX_PX, y: -this.lean.y * FLAME_PARALLAX_PX }
    const gaugeShift = { x: -this.lean.x * GAUGE_PARALLAX_PX, y: -this.lean.y * GAUGE_PARALLAX_PX }

    const shape = stagnationFlameShape({
      unit: layout.unit,
      rodRadius: layout.rodRadius,
      stretchRate: orbit.stretchRate,
      marginPts: orbit.marginPts,
    })
    // The pulse: the flame dims and draws in a little, 1.1 times a second.
    const breath = 1 - 0.06 * pulse
    const drawn = {
      ...shape,
      standoff: shape.standoff * breath,
      halfWidth: shape.halfWidth * breath,
      tail: shape.tail * breath,
    }
    const bounds = stagnationFlameBounds(drawn)
    const orbitBox = {
      left: layout.orbitTip.x + bounds.left - BOX_PAD,
      top: layout.orbitTip.y + bounds.top - BOX_PAD,
      width: bounds.right - bounds.left + BOX_PAD * 2,
      height: bounds.bottom - bounds.top + BOX_PAD * 2,
    }

    const ctx = this.ctx
    if (ctx && this.width > 0 && this.height > 0) {
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
      ctx.globalCompositeOperation = 'source-over'
      ctx.globalAlpha = 1
      ctx.fillStyle = '#000'
      ctx.fillRect(0, 0, this.width, this.height)

      this.drawOxygenLine(ctx, gaugeY(layout, input.o2Pct) + gaugeShift.y)
      ctx.save()
      ctx.translate(flameShift.x, flameShift.y)
      this.drawEarth(ctx, input, dt)
      this.drawOrbit(ctx, input, dt, drawn, pulse)
      ctx.restore()
      this.bloom.apply(ctx, this.canvas, this.width, this.height)
      this.drawVignette(ctx)
    }

    this.started = true
    this.earthWasLit = earth.lit
    return { flameShift, gaugeShift, orbitBox }
  }

  /** The current O2 level: a thin bright line with a little light under it, like a water surface. */
  private drawOxygenLine(ctx: CanvasRenderingContext2D, y: number): void {
    const from = -24
    const span = this.width + 48
    ctx.save()
    ctx.globalCompositeOperation = 'lighter'
    const under = ctx.createLinearGradient(0, y, 0, y + 72)
    under.addColorStop(0, 'rgba(110,196,224,0.075)')
    under.addColorStop(1, 'rgba(110,196,224,0)')
    ctx.fillStyle = under
    ctx.fillRect(from, y, span, 72)
    const halo = ctx.createLinearGradient(0, y - 5, 0, y + 5)
    halo.addColorStop(0, 'rgba(150,220,240,0)')
    halo.addColorStop(0.5, 'rgba(150,220,240,0.2)')
    halo.addColorStop(1, 'rgba(150,220,240,0)')
    ctx.fillStyle = halo
    ctx.fillRect(from, y - 5, span, 10)
    ctx.fillStyle = 'rgba(208,238,248,0.66)'
    ctx.fillRect(from, y - 0.5, span, 1)
    ctx.restore()
  }

  private drawEarth(ctx: CanvasRenderingContext2D, input: TwinSceneInput, dt: number): void {
    const { layout, earth } = input
    const { unit, rodRadius, earthTip: tip } = layout
    const still = input.reducedMotion
    const vigor = 1 - Math.exp(-Math.max(0, earth.marginPts) / 1.4)
    const thicker = rodRadius / unit - 1
    const flame: CandleFlameInput = {
      x: tip.x,
      y: tip.y,
      rodRadius,
      width: rodRadius * 2.2 + unit * 0.4,
      height: unit * (9.5 + 2.2 * thicker) * (0.7 + 0.3 * vigor),
      intensity: 1,
      collapse: 1 - this.earthLight,
      time: this.time,
      flicker: still ? 0 : 1,
    }

    ctx.globalCompositeOperation = 'lighter'
    if (still) {
      // A still wisp: faint above a lit flame, plainer once it has gone out.
      if (earth.lit) drawStillWisp(ctx, tip.x, tip.y - flame.height, unit * 0.3, 0.03)
      else if (earth.wentOut) drawStillWisp(ctx, tip.x, tip.y - unit, unit * 0.42, 0.07)
    } else {
      if (this.earthWasLit && !earth.lit) this.smolder = SMOLDER_S
      if (earth.lit && this.earthLight > 0.6) {
        const top = candleFlameTip(flame)
        this.smoke.emit(dt, top.x, top.y - unit * 0.4, 7, unit * 0.3, 0.035)
      } else if (this.smolder > 0) {
        // Going out leaves a wisp that drifts up from the rod and thins away.
        this.smolder = Math.max(0, this.smolder - dt)
        const strength = this.smolder / SMOLDER_S
        this.smoke.emit(dt, tip.x, tip.y - unit * (0.4 + 2 * strength), 6 + 20 * strength, unit * 0.45, 0.11)
      }
      this.smoke.update(dt)
      this.smoke.draw(ctx)
    }

    drawCandleFlame(ctx, flame)
    drawRod(ctx, {
      x: tip.x,
      y: tip.y,
      angle: Math.PI / 2,
      radius: rodRadius,
      length: this.height - tip.y + 48,
      light: { rgb: '255,190,120', intensity: this.earthLight, reach: flame.height * 0.6 },
    })
  }

  private drawOrbit(
    ctx: CanvasRenderingContext2D,
    input: TwinSceneInput,
    dt: number,
    shape: ReturnType<typeof stagnationFlameShape>,
    pulse: number,
  ): void {
    const { layout } = input
    const { unit, rodRadius, orbitTip: tip } = layout
    const field: AirflowField = {
      noseX: tip.x,
      noseY: tip.y,
      rodRadius,
      speed: input.flowCmS * unit * FLOW_SPEED_PER_CM_S,
    }

    if (!this.airflowPlaced) {
      this.airflow.setBounds({ left: layout.seamX + 2, right: this.width + 24, top: -12, bottom: this.height + 12 })
      this.airflowPlaced = true
      this.airflowStill = ''
    }
    if (input.reducedMotion) {
      // A still picture of the flow, redrawn only when the flow itself changes.
      const key = `${field.speed.toFixed(2)}|${rodRadius.toFixed(1)}`
      if (key !== this.airflowStill) this.airflow.settle(field)
      this.airflowStill = key
    } else {
      this.airflow.update(dt, field)
    }
    this.airflow.draw(ctx)

    ctx.globalCompositeOperation = 'lighter'
    drawHalo(ctx, tip.x + rodRadius * 0.3, tip.y, rodRadius + unit * 4.6, this.halo)
    const dim = 1 - 0.45 * pulse
    drawStagnationFlame(ctx, {
      x: tip.x,
      y: tip.y,
      rodRadius,
      shape,
      intensity: this.orbitLight * dim * (0.82 + 0.18 * shape.vigor),
    })
    // The rod reflects its flame: blue, a little warmer when warm light trails in fast flow.
    const warm = shape.warm * 0.6
    const rgb = [lerp(120, 255, warm), lerp(184, 200, warm), lerp(255, 150, warm)].map(Math.round).join(',')
    drawRod(ctx, {
      x: tip.x,
      y: tip.y,
      angle: 0,
      radius: rodRadius,
      length: this.width - tip.x + 48,
      light: {
        rgb,
        intensity: this.orbitLight * dim * (0.55 + 0.45 * shape.vigor),
        reach: shape.tail + unit * 2,
      },
    })
  }

  /** Darkens the stage toward its edges, so the light gathers in the middle. */
  private drawVignette(ctx: CanvasRenderingContext2D): void {
    ctx.save()
    ctx.globalCompositeOperation = 'source-over'
    ctx.translate(this.width / 2, this.height / 2)
    ctx.scale(this.width / 2, this.height / 2)
    const shade = ctx.createRadialGradient(0, 0, 0.7, 0, 0, 1.45)
    shade.addColorStop(0, 'rgba(0,0,0,0)')
    shade.addColorStop(1, 'rgba(0,0,0,0.85)')
    ctx.fillStyle = shade
    ctx.fillRect(-1, -1, 2, 2)
    ctx.restore()
  }
}

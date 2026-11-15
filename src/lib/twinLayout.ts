// Where things sit on the Burn Twin stage (SPEC F1), in CSS pixels. Pure functions, so the canvas
// and the HTML overlay agree to the pixel: the oxygen line, the limit marks and the gauge ticks
// all come from gaugeY().
import { O2_RANGE_PCT } from './burnTwin'
import { ROD_DIAMETERS_MM, type RodMm } from './physics'

export interface Point {
  x: number
  y: number
}

export interface StageLayout {
  width: number
  height: number
  /** x of the seam between the Earth half and the Orbit half: the oxygen gauge. */
  seamX: number
  /** y of 23 % O2, the top of the gauge. */
  gaugeTop: number
  /** y of 12 % O2, the bottom of the gauge. */
  gaugeBottom: number
  /** Drawn radius of the smallest (6.35 mm) rod. Every drawn size is a multiple of this. */
  unit: number
  /** Drawn radius of the selected rod. */
  rodRadius: number
  /** Top of the Earth rod, where its flame sits. */
  earthTip: Point
  /** Nose of the orbit rod, where the airflow meets it. */
  orbitTip: Point
}

const GAUGE_TOP_INSET = 72
const GAUGE_BOTTOM_INSET = 44
const UNIT_MIN = 11
const UNIT_MAX = 26

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

/**
 * Lays out a stage of this size. The rods are drawn to one scale, so the 12.7 mm rod is twice
 * as thick as the 6.35 mm one. The scale itself is an illustration, not a measurement.
 */
export function stageLayout(width: number, height: number, rodMm: RodMm): StageLayout {
  const half = width / 2
  const unit = clamp(Math.min(half / 32, height / 29), UNIT_MIN, UNIT_MAX)
  return {
    width,
    height,
    seamX: Math.round(half),
    gaugeTop: GAUGE_TOP_INSET,
    gaugeBottom: Math.max(GAUGE_TOP_INSET + 1, height - GAUGE_BOTTOM_INSET),
    unit,
    // Ratio first, so the 6.35 mm rod is exactly one unit.
    rodRadius: unit * (rodMm / ROD_DIAMETERS_MM[0]),
    earthTip: { x: Math.round(half * 0.5), y: Math.round(height * 0.6) },
    orbitTip: { x: Math.round(half + half * 0.46), y: Math.round(height * 0.5) },
  }
}

/** The y of an O2 level on the gauge: 23 % at the top, 12 % at the bottom, linear between. */
export function gaugeY(layout: Pick<StageLayout, 'gaugeTop' | 'gaugeBottom'>, o2Pct: number): number {
  const t = (O2_RANGE_PCT.max - o2Pct) / (O2_RANGE_PCT.max - O2_RANGE_PCT.min)
  return layout.gaugeTop + t * (layout.gaugeBottom - layout.gaugeTop)
}

/** The gauge's tick marks: every 0.1 point, longer at each half point and each whole point. */
export function gaugeTicks(): { o2Pct: number; kind: 'whole' | 'half' | 'tenth' }[] {
  const ticks: { o2Pct: number; kind: 'whole' | 'half' | 'tenth' }[] = []
  const steps = Math.round((O2_RANGE_PCT.max - O2_RANGE_PCT.min) * 10)
  for (let step = 0; step <= steps; step++) {
    const kind = step % 10 === 0 ? 'whole' : step % 5 === 0 ? 'half' : 'tenth'
    ticks.push({ o2Pct: O2_RANGE_PCT.min + step / 10, kind })
  }
  return ticks
}

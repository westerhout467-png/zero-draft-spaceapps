// The flammability map (SPEC F3b) and the ignition race (F3c): their axes, curve, test rug and
// timing. Pure functions only; the components in components/rank/ draw them.
import { sampleFamily, type Bass2Row } from './audit'
import { FLOW_RANGE_CM_S, O2_RANGE_PCT } from './burnTwin'
import { o2LimitPct, ROD_DIAMETERS_MM, solidResponseTimeS, type RodMm } from './physics'

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

// ---------------------------------------------------------------------------------------------
// The map: flow on a log x-axis (0.2–40 cm/s), O2 on a linear y-axis (12–23 %), the same ranges as
// the Burn Twin's sliders.

/** Below this flow the report calls flow values uncertain, cm/s. Quoted: bass2.flam.low-flow-uncertain (p. 76). */
export const UNCERTAIN_BELOW_CM_S = 1

const FLOW_SPAN = Math.log(FLOW_RANGE_CM_S.max / FLOW_RANGE_CM_S.min)

/** Where a flow sits across the map, 0 at the left edge to 1 at the right. */
export function flowToX(flowCmS: number): number {
  return Math.log(clamp(flowCmS, FLOW_RANGE_CM_S.min, FLOW_RANGE_CM_S.max) / FLOW_RANGE_CM_S.min) / FLOW_SPAN
}

/** The flow at a point across the map, 0…1. */
export function xToFlow(x: number): number {
  return FLOW_RANGE_CM_S.min * Math.exp(FLOW_SPAN * clamp(x, 0, 1))
}

/** Where an O2 sits up the map, 0 at the bottom to 1 at the top. */
export function o2ToY(o2Pct: number): number {
  return (clamp(o2Pct, O2_RANGE_PCT.min, O2_RANGE_PCT.max) - O2_RANGE_PCT.min) / (O2_RANGE_PCT.max - O2_RANGE_PCT.min)
}

/** The O2 at a height up the map, 0…1. */
export function yToO2(y: number): number {
  return O2_RANGE_PCT.min + clamp(y, 0, 1) * (O2_RANGE_PCT.max - O2_RANGE_PCT.min)
}

/** Eq. 6.1 for one rod on evenly spaced log steps of flow, with the band above it to the top of the map. */
export function limitCurve(rodMm: RodMm, steps = 120): { flow: number; limit: number; band: [number, number] }[] {
  return Array.from({ length: steps + 1 }, (_, step) => {
    const flow = xToFlow(step / steps)
    const limit = o2LimitPct(flow, rodMm)
    return { flow, limit, band: [limit, O2_RANGE_PCT.max] }
  })
}

export type MapRegion = 'sustained' | 'extinguishes'

/** Which side of the Eq. 6.1 curve a point is on: at or above it the flame is sustained (model). */
export function regionAt(o2Pct: number, flowCmS: number, rodMm: RodMm): MapRegion {
  return o2Pct >= o2LimitPct(flowCmS, rodMm) ? 'sustained' : 'extinguishes'
}

/** Steps for the map point's arrow keys: O2 in points, flow as a share of a decade-ish log step. */
export const MAP_KEY_STEP = { o2Pct: 0.1, o2PctLarge: 1, flowFactor: Math.pow(10, 1 / 40), flowFactorLarge: Math.pow(10, 1 / 8) }

/**
 * The rug on the O2 axis: the final O2 of every burn-confirmed BASS-II rod test, lowest first.
 * They aren't placed by flow: the CSV's airflow cells are sequences of settings, not one value.
 */
export function rodRug(rows: readonly Bass2Row[]): { testId: string; o2Pct: number }[] {
  return rows
    .filter((row) => row.burnConfirmed && row.o2FinalPct !== null && sampleFamily(row.sampleType) === 'rod')
    .map((row) => ({ testId: row.testId, o2Pct: row.o2FinalPct as number }))
    .sort((a, b) => a.o2Pct - b.o2Pct || (a.testId < b.testId ? -1 : 1))
}

// ---------------------------------------------------------------------------------------------
// The race: 0 to 250 s of ignition time, played in a few seconds.

/** The longest successful BASS-II ignition delay, s. Quoted: bass2.ign.230s (p. 69). */
export const LONGEST_IGNITION_S = 230

/** The race's timeline, s, and how long the sweep takes on screen, ms (a linear sweep: constant motion). */
export const RACE = { endS: 250, sweepMs: 3200, axisStepS: 50 } as const

/** The race's little lit-rod canvas, CSS px, and where the rod's nose sits in it (the rod runs off to the right). */
export const RACE_FLAME = { width: 64, height: 44, noseX: 22, noseY: 22 } as const

/** One marker per BASS-II rod, at its solid response time t_s. */
export function raceMarkers(): { rodMm: RodMm; tsS: number }[] {
  return ROD_DIAMETERS_MM.map((rodMm) => ({ rodMm, tsS: solidResponseTimeS(rodMm) }))
}

/** Race time, s, this far into the sweep. */
export function raceTimeAt(elapsedMs: number): number {
  return RACE.endS * clamp(elapsedMs / RACE.sweepMs, 0, 1)
}

/** Where a race time sits along the track, 0…1. */
export function raceX(timeS: number): number {
  return clamp(timeS / RACE.endS, 0, 1)
}

/** The axis ticks, s: 0, 50, … 250. */
export function raceTicks(): number[] {
  return Array.from({ length: RACE.endS / RACE.axisStepS + 1 }, (_, i) => i * RACE.axisStepS)
}

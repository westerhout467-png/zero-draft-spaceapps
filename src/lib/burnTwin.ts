// The Earth vs Orbit Burn Twin's model state (SPEC F1). Pure functions only: which flame is lit,
// where each went out, and how far the oxygen drain has run. Every verdict the view shows
// (lit, out, pulsing, won't ignite) comes from here, never from the drawing (CLAUDE.md rule 5).
import { EARTH_LIMIT_O2_PCT, eq61Branch, o2LimitPct, stretchRate, type RodMm } from './physics'

/** The O2 slider and gauge range, % O2 (SPEC F1). */
export const O2_RANGE_PCT = { min: 12, max: 23 } as const

/** The orbit airflow slider range, cm/s, on a log scale (SPEC F1). */
export const FLOW_RANGE_CM_S = { min: 0.2, max: 40 } as const

/** The drain: O2 falls linearly from 17.0 % to 13.0 % over 10 s of display time (SPEC F1). */
export const DRAIN = { fromPct: 17, toPct: 13, durationMs: 10_000 } as const

/** PMMA rods would not ignite below about this O2 in BASS-II. Quoted: bass2.ign.limit-14.5 (p. 68). */
export const IGNITION_LIMIT_O2_PCT = 14.5

/** Frequency of the oscillation seen just before quenching, Hz. Quoted: bass2.osc-1.1hz (p. 89). */
export const PULSE_HZ = 1.1

/**
 * Flame length ÷ width at quenching extinction: 0.5 is a hemisphere. Quoted: bass2.aspect-0.5 (p. 70).
 * The orbit flame's drawn shape closes in on this as its margin runs out.
 */
export const QUENCH_ASPECT_RATIO = 0.5

/** The pulse shows only within this many points of O2 above the limit (SPEC F1). */
export const PULSE_MARGIN_PTS = 0.15

/** Where the twin starts and what Reset returns to: the drain's start, U = 2 cm/s, the 6.35 mm rod. */
export const TWIN_DEFAULTS: { o2Pct: number; flowCmS: number; rodMm: RodMm } = {
  o2Pct: DRAIN.fromPct,
  flowCmS: 2,
  rodMm: 6.35,
}

/** Why Ignite didn't light a flame. */
export type Refusal = 'below-ignition' | 'below-limit'

export interface FlameState {
  lit: boolean
  /** The O2 (%) at which it went out, or null if it hasn't gone out since it was last lit. */
  outAtPct: number | null
  /** Why the last Ignite didn't light it, or null. */
  refusal: Refusal | null
}

export interface TwinState {
  o2Pct: number
  flowCmS: number
  rodMm: RodMm
  earth: FlameState
  orbit: FlameState
  drain: { phase: 'idle' | 'running' | 'done'; elapsedMs: number }
}

const LIT: FlameState = { lit: true, outAtPct: null, refusal: null }

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

/** Both flames lit at the defaults. */
export function initialTwin(): TwinState {
  return { ...TWIN_DEFAULTS, earth: LIT, orbit: LIT, drain: { phase: 'idle', elapsedMs: 0 } }
}

/** The Eq. 6.1 model values for the orbit rod at these conditions. */
export function orbitModel(o2Pct: number, flowCmS: number, rodMm: RodMm) {
  const a = stretchRate(flowCmS, rodMm)
  const limitPct = o2LimitPct(flowCmS, rodMm)
  const marginPts = o2Pct - limitPct
  const branch = eq61Branch(a)
  /** SPEC F1: the quenching branch only, and less than 0.15 points above the limit. */
  const nearQuench = branch === 'quenching' && marginPts >= 0 && marginPts < PULSE_MARGIN_PTS
  return { a, limitPct, marginPts, branch, nearQuench }
}

/** Points of O2 above (+) or below (−) the 1g limit. */
export function earthMarginPts(o2Pct: number): number {
  return o2Pct - EARTH_LIMIT_O2_PCT
}

/** The orbit flame pulses at 1.1 Hz only while it is lit and near the quenching limit. */
export function isPulsing(state: TwinState): boolean {
  return state.orbit.lit && orbitModel(state.o2Pct, state.flowCmS, state.rodMm).nearQuench
}

/**
 * Puts out any lit flame whose O2 is now below its limit. It went out at its limit if the O2
 * fell through it, or at the O2 it was already at if the limit rose past it (a flow or rod change).
 */
function settle(previous: TwinState, next: TwinState): TwinState {
  const orbitLimit = o2LimitPct(next.flowCmS, next.rodMm)
  const putOut = (flame: FlameState, limitPct: number): FlameState =>
    flame.lit && next.o2Pct < limitPct
      ? { lit: false, outAtPct: Math.min(previous.o2Pct, limitPct), refusal: null }
      : flame
  return {
    ...next,
    earth: putOut(next.earth, EARTH_LIMIT_O2_PCT),
    orbit: putOut(next.orbit, orbitLimit),
  }
}

const clearRefusal = (flame: FlameState): FlameState =>
  flame.refusal === null ? flame : { ...flame, refusal: null }

/** Moves the O2 slider. Doing so during a drain stops the drain. */
export function setO2(state: TwinState, o2Pct: number): TwinState {
  const next = clamp(o2Pct, O2_RANGE_PCT.min, O2_RANGE_PCT.max)
  if (next === state.o2Pct && state.drain.phase !== 'running') return state
  return settle(state, {
    ...state,
    o2Pct: next,
    earth: clearRefusal(state.earth),
    orbit: clearRefusal(state.orbit),
    drain: state.drain.phase === 'running' ? { phase: 'idle', elapsedMs: 0 } : state.drain,
  })
}

export function setFlow(state: TwinState, flowCmS: number): TwinState {
  const next = clamp(flowCmS, FLOW_RANGE_CM_S.min, FLOW_RANGE_CM_S.max)
  if (next === state.flowCmS) return state
  return settle(state, { ...state, flowCmS: next, orbit: clearRefusal(state.orbit) })
}

export function setRod(state: TwinState, rodMm: RodMm): TwinState {
  if (rodMm === state.rodMm) return state
  return settle(state, { ...state, rodMm, orbit: clearRefusal(state.orbit) })
}

/** What Ignite does to one flame: light it, or say why it won't light. */
function lightFlame(flame: FlameState, refusal: Refusal | null): FlameState {
  if (flame.lit) return flame
  return refusal === null ? LIT : { ...flame, refusal }
}

/**
 * Ignite. The orbit rod won't light below about 14.5 % O2 (bass2.ign.limit-14.5), though a flame
 * lit higher survives lower (bass2.ign.survive-13.6). Neither flame lights below its own limit.
 */
export function ignite(state: TwinState): TwinState {
  const orbitLimit = o2LimitPct(state.flowCmS, state.rodMm)
  const earthRefusal: Refusal | null = state.o2Pct < EARTH_LIMIT_O2_PCT ? 'below-limit' : null
  let orbitRefusal: Refusal | null = null
  if (state.o2Pct < IGNITION_LIMIT_O2_PCT) orbitRefusal = 'below-ignition'
  else if (state.o2Pct < orbitLimit) orbitRefusal = 'below-limit'
  return {
    ...state,
    earth: lightFlame(state.earth, earthRefusal),
    orbit: lightFlame(state.orbit, orbitRefusal),
  }
}

/** Back to the defaults with both flames lit. */
export function reset(): TwinState {
  return initialTwin()
}

/** O2 (%) this far into the drain: linear from 17.0 to 13.0 over 10 s. */
export function drainO2At(elapsedMs: number): number {
  const t = clamp(elapsedMs / DRAIN.durationMs, 0, 1)
  return DRAIN.fromPct + (DRAIN.toPct - DRAIN.fromPct) * t
}

/** Starts the drain: O2 goes to 17.0 %, both flames are lit afresh (where they can be), flow and rod stay. */
export function startDrain(state: TwinState): TwinState {
  const unlit: FlameState = { lit: false, outAtPct: null, refusal: null }
  return ignite({
    ...state,
    o2Pct: DRAIN.fromPct,
    earth: unlit,
    orbit: unlit,
    drain: { phase: 'running', elapsedMs: 0 },
  })
}

/** Advances a running drain by `dtMs` of display time. Any step size gives the same limits. */
export function tickDrain(state: TwinState, dtMs: number): TwinState {
  if (state.drain.phase !== 'running' || dtMs <= 0) return state
  const elapsedMs = Math.min(state.drain.elapsedMs + dtMs, DRAIN.durationMs)
  const done = elapsedMs >= DRAIN.durationMs
  return settle(state, {
    ...state,
    o2Pct: drainO2At(elapsedMs),
    drain: { phase: done ? 'done' : 'running', elapsedMs },
  })
}

/** The whole drain in one step, for reduced motion: the end state, with nothing animated. */
export function drainInstantly(state: TwinState): TwinState {
  return tickDrain(startDrain(state), DRAIN.durationMs)
}

/**
 * How many points of O2 lower the orbit flame kept burning than the Earth flame, once both have
 * gone out. Negative if the orbit flame went out first. Null until both are out.
 */
export function resultPts(state: TwinState): number | null {
  if (state.earth.outAtPct === null || state.orbit.outAtPct === null) return null
  return state.earth.outAtPct - state.orbit.outAtPct
}

const FLOW_DECADES = Math.log(FLOW_RANGE_CM_S.max / FLOW_RANGE_CM_S.min)

/** Flow (cm/s) for a log-slider position t in 0…1, rounded to three significant figures. */
export function flowFromSlider(t: number): number {
  const flow = FLOW_RANGE_CM_S.min * Math.exp(FLOW_DECADES * clamp(t, 0, 1))
  return Number(flow.toPrecision(3))
}

/** Log-slider position in 0…1 for a flow in cm/s. */
export function sliderFromFlow(flowCmS: number): number {
  const flow = clamp(flowCmS, FLOW_RANGE_CM_S.min, FLOW_RANGE_CM_S.max)
  return Math.log(flow / FLOW_RANGE_CM_S.min) / FLOW_DECADES
}

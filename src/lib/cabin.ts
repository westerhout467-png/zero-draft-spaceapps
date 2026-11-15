// Cabin fire, toxicity and N2 dilution in a sealed, well-mixed volume at 1 atm (SPEC F4, §8.2).
// Pure functions only. Built from the BASS-II report's own relations:
//   Eq. 1.3 gas amount, Huggett's constant, Eq. 1.1 stoichiometry, the CO/CO2 averages, and
//   Eq. B.2 N2 dilution. Each constant names the claim in src/data/claims.json that quotes it.
import { eq61Validity, o2LimitPct } from './physics'

export type Geometry = 'opposed-slab' | 'concurrent-rod'

export interface CabinInputs {
  volumeM3: number
  pressureAtm: number
  o2InitPct: number
  co2InitPct: number
  coInitPpm: number
  powerW: number
  geometry: Geometry
  rodMm?: 6.35 | 9.525 | 12.7
  flowCmS?: number
  n2FlowCcMin: number
  n2StartMin: number
  durationMin: number
}

export type AlarmKind = 'smac-10' | 'smac-55' | 'sensor-1000' | 'extinguished'

export interface CabinState {
  tSec: number
  o2Pct: number
  co2Pct: number
  coPpm: number
  heatKJ: number
  flame: 'burning' | 'out-limit' | 'out-duration' | 'not-ignited'
  alarms: Array<{ tSec: number; kind: AlarmKind }>
  valid: boolean
  invalidReason?: string
}

/** Gas constant R in cm³·atm/(mol·K). Quoted: bass2.calorimetry-inputs (p. 11). */
export const R_CM3_ATM_PER_MOL_K = 82.05
/** Gas temperature T in K for Eq. 1.3 (p. 11). No quote yet. */
export const GAS_TEMPERATURE_K = 300
/** Huggett's constant: 13.1 kJ of heat per gram of O2 consumed. Quoted: bass2.hrr.huggett (p. 8). */
export const HUGGETT_J_PER_G_O2 = 13_100
/** Molar mass of O2, g/mol (a physical constant). */
export const O2_MOLAR_MASS_G_PER_MOL = 32
/** C5H8O2 + 6 O2 → 5 CO2 + 4 H2O, so each mol of O2 makes 5/6 mol of CO2. Quoted: bass2.stoich (p. 6). */
export const CO2_PER_O2 = 5 / 6
/** Average ppm of CO per 1 % of CO2. Quoted: bass2.co.370 and bass2.co.550 (p. 7). */
export const CO_PPM_PER_PCT_CO2: Record<Geometry, number> = {
  'opposed-slab': 370,
  'concurrent-rod': 550,
}
/** Long-term and 1-hour CO SMACs, ppm. Quoted: bass2.co.smac (p. 8). */
export const SMAC_LONG_TERM_PPM = 10
export const SMAC_1_HOUR_PPM = 55
/** The CSA-CP CO sensor read 0 to 1,000 ppm. Quoted: bass2.co.sensor-range (p. 6). */
export const CO_SENSOR_CEILING_PPM = 1000
/** MSG net volume, m³. Quoted: bass2.cstr.volume (p. 115). */
export const MSG_VOLUME_M3 = 0.25
/** N2 flow in the dilution calibration, cm³/min. Quoted: bass2.cstr.n2-flow (p. 116). */
export const MSG_N2_FLOW_CC_MIN = 493
/** The MSG's maximum N2 flow, cm³/min: "0.0005 m3/min maximum". Quoted: bass2.cstr.n2-max (p. 115). */
export const MSG_N2_MAX_CC_MIN = 500
/** US Lab pressurized volume, m³. Quoted: bass2.us-lab-volume (p. 8). */
export const US_LAB_VOLUME_M3 = 106

const CM3_PER_M3 = 1_000_000

/** Eq. 1.3: total moles of gas n = P·V/(R·T), with V in cm³. */
export function totalMoles(volumeM3: number, pressureAtm = 1): number {
  return (pressureAtm * volumeM3 * CM3_PER_M3) / (R_CM3_ATM_PER_MOL_K * GAS_TEMPERATURE_K)
}

/** Moles of O2 a fire uses to release `energyJ` of heat (Huggett). */
export function o2ConsumedMol(energyJ: number): number {
  return energyJ / HUGGETT_J_PER_G_O2 / O2_MOLAR_MASS_G_PER_MOL
}

/** What an O2 drop in a sealed volume means: moles and grams of O2 used, and heat released. */
export function heatFromO2Drop(volumeM3: number, o2DropPct: number) {
  const mol = (o2DropPct / 100) * totalMoles(volumeM3)
  const grams = mol * O2_MOLAR_MASS_G_PER_MOL
  const kJ = (grams * HUGGETT_J_PER_G_O2) / 1000
  return { mol, grams, kJ }
}

/** Average heat release rate in W for `kJ` released over `minutes`. */
export function averagePowerW(kJ: number, minutes: number): number {
  return (kJ * 1000) / (minutes * 60)
}

/** How fast a fire of `powerW` pulls down O2 in a sealed volume, in % O2 per second. */
export function o2DrawPctPerS(powerW: number, volumeM3: number): number {
  return (o2ConsumedMol(powerW) / totalMoles(volumeM3)) * 100
}

/** Eq. B.2 solved for time: N2 alone takes (V/r)·ln(C₀/C) minutes to dilute O2 from C₀ to C. */
export function dilutionTimeMin(
  fromPct: number,
  toPct: number,
  volumeM3: number,
  n2FlowCcMin: number,
): number {
  return ((volumeM3 * CM3_PER_M3) / n2FlowCcMin) * Math.log(fromPct / toPct)
}

/** CO (ppm) that goes with a CO2 rise (in % CO2) for this geometry: ratio × ΔCO2. */
export function coFromCo2RisePpm(co2RisePct: number, geometry: Geometry): number {
  return CO_PPM_PER_PCT_CO2[geometry] * co2RisePct
}

/** CO (ppm) a constant fire adds to a sealed volume with no dilution: ratio × (5/6) × ΔO2. */
export function coFromFirePpm(fire: {
  volumeM3: number
  powerW: number
  durationMin: number
  geometry: Geometry
}): number {
  const o2DropPct = o2DrawPctPerS(fire.powerW, fire.volumeM3) * fire.durationMin * 60
  return coFromCo2RisePpm(CO2_PER_O2 * o2DropPct, fire.geometry)
}

/** The volume (m³) below which the same fire pushes CO above `limitPpm`. CO scales as 1/V. */
export function volumeWhereCoReaches(
  limitPpm: number,
  fire: { powerW: number; durationMin: number; geometry: Geometry },
): number {
  return coFromFirePpm({ ...fire, volumeM3: 1 }) / limitPpm
}

/** Why the model can't run these inputs, or undefined if it can (CLAUDE.md rule 6). */
export function cabinInvalidReason(inputs: CabinInputs): string | undefined {
  if (inputs.pressureAtm !== 1) return 'Pressure is not 1 atm'
  if (!(inputs.volumeM3 > 0)) return 'Volume must be above zero'
  if (!(inputs.durationMin > 0)) return 'Duration must be above zero'
  if (inputs.geometry === 'concurrent-rod') {
    if (inputs.rodMm === undefined || inputs.flowCmS === undefined) {
      return 'Rods need a rod size and an airflow'
    }
    const rod = eq61Validity(inputs.rodMm, inputs.pressureAtm)
    if (!rod.valid) return rod.reason
  }
  return undefined
}

/** The Eq. 6.1 limit for a rod fire, or null for slabs (no extinction model for slabs). */
function extinctionLimitPct(inputs: CabinInputs): number | null {
  if (inputs.geometry !== 'concurrent-rod' || !inputs.rodMm || inputs.flowCmS === undefined) {
    return null
  }
  return o2LimitPct(inputs.flowCmS, inputs.rodMm)
}

export function initialCabinState(inputs: CabinInputs): CabinState {
  const invalidReason = cabinInvalidReason(inputs)
  const limit = invalidReason ? null : extinctionLimitPct(inputs)
  const canBurn = inputs.powerW > 0 && (limit === null || inputs.o2InitPct >= limit)
  return {
    tSec: 0,
    o2Pct: inputs.o2InitPct,
    co2Pct: inputs.co2InitPct,
    coPpm: inputs.coInitPpm,
    heatKJ: 0,
    flame: canBurn ? 'burning' : 'not-ignited',
    alarms: [],
    valid: invalidReason === undefined,
    invalidReason,
  }
}

export interface StepOptions {
  /** Set for the MSG preset only: log a 'sensor-1000' alarm at the CSA-CP ceiling. */
  coSensorCeilingPpm?: number
}

/** One step of `dtSec` seconds: dilute, burn, check extinction, then log new alarms (SPEC F4). */
export function stepCabin(
  state: CabinState,
  inputs: CabinInputs,
  dtSec: number,
  options: StepOptions = {},
): CabinState {
  if (!state.valid) return state
  const tSec = state.tSec + dtSec
  let { o2Pct, co2Pct, coPpm, heatKJ, flame } = state

  // 1. N2 dilution of every species (Eq. B.2, stepwise).
  if (inputs.n2FlowCcMin > 0 && state.tSec >= inputs.n2StartMin * 60) {
    const keep = Math.exp(
      -((inputs.n2FlowCcMin / 60) * dtSec) / (inputs.volumeM3 * CM3_PER_M3),
    )
    o2Pct *= keep
    co2Pct *= keep
    coPpm *= keep
  }

  // 2. Burning: O2 down, CO2 up by 5/6 of it, CO up by the geometry's ratio.
  if (flame === 'burning') {
    const o2DropPct = o2DrawPctPerS(inputs.powerW, inputs.volumeM3) * dtSec
    o2Pct -= o2DropPct
    co2Pct += CO2_PER_O2 * o2DropPct
    coPpm += coFromCo2RisePpm(CO2_PER_O2 * o2DropPct, inputs.geometry)
    heatKJ += (inputs.powerW * dtSec) / 1000
  }

  // 3. Extinction: rods go out below the Eq. 6.1 limit; every fire stops at the set duration.
  const newAlarms: CabinState['alarms'] = []
  if (flame === 'burning') {
    const limit = extinctionLimitPct(inputs)
    if (limit !== null && o2Pct < limit) {
      flame = 'out-limit'
      newAlarms.push({ tSec, kind: 'extinguished' })
    } else if (tSec >= inputs.durationMin * 60 - 1e-9) {
      flame = 'out-duration'
    }
  }

  // 4. Alarms, each logged once, the first time the model crosses the line.
  const logged = new Set(state.alarms.map((alarm) => alarm.kind))
  const crossed = (kind: AlarmKind, limitPpm: number | undefined) => {
    if (limitPpm !== undefined && coPpm >= limitPpm && !logged.has(kind)) {
      newAlarms.push({ tSec, kind })
    }
  }
  crossed('smac-10', SMAC_LONG_TERM_PPM)
  crossed('smac-55', SMAC_1_HOUR_PPM)
  crossed('sensor-1000', options.coSensorCeilingPpm)

  return {
    tSec,
    o2Pct,
    co2Pct,
    coPpm,
    heatKJ,
    flame,
    alarms: newAlarms.length > 0 ? [...state.alarms, ...newAlarms] : state.alarms,
    valid: true,
  }
}

/**
 * Runs the model from t = 0 to the set duration, returning one state per step (default 1 s).
 * Invalid inputs return a single state with `valid: false` and no prediction.
 */
export function simulateCabin(
  inputs: CabinInputs,
  options: StepOptions & { dtSec?: number } = {},
): CabinState[] {
  const dtSec = options.dtSec ?? 1
  let state = initialCabinState(inputs)
  const states = [state]
  if (!state.valid) return states
  const endSec = inputs.durationMin * 60
  while (state.tSec < endSec - 1e-9) {
    state = stepCabin(state, inputs, Math.min(dtSec, endSec - state.tSec), options)
    states.push(state)
  }
  return states
}

// Flammability and ignition of PMMA rods at 1 atm, from the BASS-II Summary Report
// (NASA/TM-20210011385). Pure functions only. Equations and test values: SPEC §8.1.
//
// Each constant names the claim in src/data/claims.json that quotes it. claims.test.ts checks
// that every constant marked "quoted" really appears in its claim. Constants marked
// "no quote yet" come from the report's equations, which the PDF text extraction doesn't
// capture cleanly, so they have no machine-checked quote.

/** Base rod radius r₀ in cm. Quoted: bass2.flam.r0 (p. 75). */
export const R0_CM = 0.318

/** Thermal diffusivity of PMMA α_s in cm²/s. Quoted: bass2.ign.alpha-pmma (p. 65). */
export const ALPHA_PMMA_CM2_S = 1.2e-3

/** The 1g upward-spread limit for PMMA rods with 4 cm/s forced flow, % O2. Quoted: bass2.flam.vs-1g (p. 76). */
export const EARTH_LIMIT_O2_PCT = 15.4

/** The three BASS-II rod diameters, mm. Eq. 6.1 is fitted to these rods only. */
export const ROD_DIAMETERS_MM = [6.35, 9.525, 12.7] as const
export type RodMm = (typeof ROD_DIAMETERS_MM)[number]

/** The 3/2 factor in the stretch-rate definition. Quoted: bass2.flam.stretch-def (p. 75). */
const STRETCH_FACTOR = 3 / 2

// Eq. 6.1, X_O2 = 6·exp(−0.5a) + 0.0167a + 13.4 (p. 75; branches: bass2.flam.eq61-branches). The PDF's
// text layer garbles the equation, so it can't be a quoted claim: the drawer shows it as printed
// (figures.ts, public/img/eq61-bass2-p75.png), check:claims finds these four numbers in this order
// on its page, and figures.test.ts checks they are the ones below.
export const EQ61_COEFFICIENTS = [6, 0.5, 0.0167, 13.4] as const
const [EQ61_QUENCH_AMPLITUDE, EQ61_QUENCH_RATE, EQ61_BLOWOFF_SLOPE, EQ61_OFFSET] = EQ61_COEFFICIENTS

// t_s = 0.7 r² / α_s (p. 68; bass2.ign.ts-def names it). The 0.7 is NASA's empirical factor,
// "selected so that τ = 1 at the ignition limit" (bass2.ign.ts-factor, p. 68).
const TS_FACTOR = 0.7

/** Rod radius in cm from diameter in mm. */
export function rodRadiusCm(rodMm: number): number {
  return rodMm / 10 / 2
}

/** Stretch rate a in 1/s: a = (3/2)(U/r)(r/r₀)^½, U in cm/s, r in cm (bass2.flam.stretch-def). */
export function stretchRate(flowCmS: number, rodMm: number): number {
  const r = rodRadiusCm(rodMm)
  return STRETCH_FACTOR * (flowCmS / r) * Math.sqrt(r / R0_CM)
}

/** Quenching branch of Eq. 6.1: 6·exp(−0.5a) + 13.4, % O2. */
export function quenchingBranch(a: number): number {
  return EQ61_QUENCH_AMPLITUDE * Math.exp(-EQ61_QUENCH_RATE * a) + EQ61_OFFSET
}

/** Blowoff branch of Eq. 6.1: 0.0167a + 13.4, % O2. At a = 0 it is 13.4 % (bass2.flam.derate). */
export function blowoffBranch(a: number): number {
  return EQ61_BLOWOFF_SLOPE * a + EQ61_OFFSET
}

/** Eq. 6.1, the limiting O2 for a PMMA rod flame at stretch rate a: X_O2 in % O2. */
export function eq61(a: number): number {
  return quenchingBranch(a) + blowoffBranch(a) - EQ61_OFFSET
}

/** Where Eq. 6.1 is lowest: dX/da = 0 gives a = 2·ln(6·0.5 / 0.0167). */
export const EQ61_MINIMUM = (() => {
  const a =
    Math.log((EQ61_QUENCH_AMPLITUDE * EQ61_QUENCH_RATE) / EQ61_BLOWOFF_SLOPE) / EQ61_QUENCH_RATE
  return { a, o2Pct: eq61(a) }
})()

/** Which side of the minimum a stretch rate is on. The 1.1 Hz pulse only happens on the quenching side. */
export function eq61Branch(a: number): 'quenching' | 'blowoff' {
  return a < EQ61_MINIMUM.a ? 'quenching' : 'blowoff'
}

/** Limiting O2 (% O2) for a rod of this diameter in a flow of U cm/s: Eq. 6.1 at a(U, d). */
export function o2LimitPct(flowCmS: number, rodMm: number): number {
  return eq61(stretchRate(flowCmS, rodMm))
}

/** How many points of O2 lower the orbit rod keeps burning than the 1g limit: 15.4 − X_O2. */
export function burnTwinGap(flowCmS: number, rodMm: number): number {
  return EARTH_LIMIT_O2_PCT - o2LimitPct(flowCmS, rodMm)
}

/** Solid-phase response time t_s = 0.7 r² / α_s, in seconds. */
export function solidResponseTimeS(rodMm: number): number {
  const r = rodRadiusCm(rodMm)
  return (TS_FACTOR * r * r) / ALPHA_PMMA_CM2_S
}

/** Normalized ignition delay τ = delay ÷ t_s. */
export function normalizedIgnitionDelay(delayS: number, rodMm: number): number {
  return delayS / solidResponseTimeS(rodMm)
}

/**
 * Eq. 6.1 is for the three BASS-II PMMA rods at 1 atm (CLAUDE.md rule 6). Anything else gets a
 * reason, and the UI shows "Outside tested range" instead of a prediction.
 */
export function eq61Validity(rodMm: number, pressureAtm = 1): { valid: boolean; reason?: string } {
  if (!(ROD_DIAMETERS_MM as readonly number[]).includes(rodMm)) {
    return { valid: false, reason: 'Rod size is not one of the BASS-II rods' }
  }
  if (pressureAtm !== 1) return { valid: false, reason: 'Pressure is not 1 atm' }
  return { valid: true }
}

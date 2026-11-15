import { describe, expect, it } from 'vitest'
import {
  averagePowerW,
  coFromCo2RisePpm,
  coFromFirePpm,
  dilutionTimeMin,
  heatFromO2Drop,
  MSG_N2_FLOW_CC_MIN,
  MSG_N2_MAX_CC_MIN,
  MSG_VOLUME_M3,
  o2DrawPctPerS,
  simulateCabin,
  totalMoles,
  US_LAB_VOLUME_M3,
  volumeWhereCoReaches,
  type CabinInputs,
  type CabinState,
} from './cabin'
import { getClaim } from './claims'

// SPEC §8.2: every value within 0.5 %.
const within = (actual: number, expected: number) =>
  expect(Math.abs(actual - expected) / Math.abs(expected)).toBeLessThanOrEqual(0.005)

const M5_MINUTES = 27.2
const M5_O2_DROP_PCT = 22.2 - 19 // Table 5.1 row M5 (bass2.m5.row)
const M5_POWER_W = averagePowerW(heatFromO2Drop(MSG_VOLUME_M3, M5_O2_DROP_PCT).kJ, M5_MINUTES)

/** Test M5 replayed in the MSG: constant power, no N2 dilution. */
const m5Fire: CabinInputs = {
  volumeM3: MSG_VOLUME_M3,
  pressureAtm: 1,
  o2InitPct: 22.2,
  co2InitPct: 0,
  coInitPpm: 0,
  powerW: M5_POWER_W,
  geometry: 'opposed-slab',
  n2FlowCcMin: 0,
  n2StartMin: 0,
  durationMin: M5_MINUTES,
}

/** N2 dilution of the MSG with the fire off. */
const n2Only: CabinInputs = {
  ...m5Fire,
  o2InitPct: 20.9,
  powerW: 0,
  n2FlowCcMin: MSG_N2_FLOW_CC_MIN,
  durationMin: 300,
}

const last = (states: CabinState[]) => states[states.length - 1]
const minutesUntilO2Below = (states: CabinState[], pct: number) =>
  states.find((state) => state.o2Pct < pct)!.tSec / 60

describe('N2 dilution (SPEC §8.2, fire off)', () => {
  it('has V/r = 507.10 min for 0.25 m³ and 493 cm³/min', () => {
    within((MSG_VOLUME_M3 * 1e6) / MSG_N2_FLOW_CC_MIN, 507.1)
  })

  it('takes 217.5 min to go from 20.9 % to 13.611 %', () => {
    within(dilutionTimeMin(20.9, 13.611, MSG_VOLUME_M3, MSG_N2_FLOW_CC_MIN), 217.5)
    within(minutesUntilO2Below(simulateCabin(n2Only), 13.611), 217.5)
  })

  it('takes 169.0 min to go from 20.9 % to 14.977 %', () => {
    within(dilutionTimeMin(20.9, 14.977, MSG_VOLUME_M3, MSG_N2_FLOW_CC_MIN), 169.0)
    within(minutesUntilO2Below(simulateCabin(n2Only), 14.977), 169.0)
  })
})

describe('Test M5 in the MSG (SPEC §8.2, constant power, no dilution)', () => {
  it('has n_total = 10.156 mol in 250,000 cm³ at 1 atm and 300 K', () => {
    within(totalMoles(MSG_VOLUME_M3), 10.156)
  })

  it('used 0.3250 mol = 10.400 g of O2 for a 3.2-point drop', () => {
    const { mol, grams } = heatFromO2Drop(MSG_VOLUME_M3, M5_O2_DROP_PCT)
    within(mol, 0.325)
    within(grams, 10.4)
  })

  it('released 136.24 kJ, 83.48 W over 27.2 min', () => {
    within(heatFromO2Drop(MSG_VOLUME_M3, M5_O2_DROP_PCT).kJ, 136.24)
    within(M5_POWER_W, 83.48)
  })

  it('draws 0.001961 %/s of O2 at 83.48 W, 3.200 points over 27.2 min', () => {
    within(o2DrawPctPerS(83.48, MSG_VOLUME_M3), 0.001961)
    within(o2DrawPctPerS(83.48, MSG_VOLUME_M3) * M5_MINUTES * 60, 3.2)
  })

  it('replays O2 22.2 % → 19.0 %, CO2 +2.667 % and CO 986.7 ppm', () => {
    const end = last(simulateCabin(m5Fire))
    within(end.o2Pct, 19.0)
    within(end.co2Pct, 2.667)
    within(end.coPpm, 986.7)
    within(end.heatKJ, 136.24)
    expect(end.flame).toBe('out-duration')
    within(coFromFirePpm(m5Fire), 986.7)
  })

  it('gives 1,028.6 ppm CO from the measured 2.78 % CO2 rise', () => {
    within(coFromCo2RisePpm(2.78, 'opposed-slab'), 1028.6)
  })

  it('logs the CSA-CP ceiling alarm only when asked, and only from model state', () => {
    const big = { ...m5Fire, durationMin: 30 }
    const withSensor = last(simulateCabin(big, { coSensorCeilingPpm: 1000 }))
    expect(withSensor.alarms.map((alarm) => alarm.kind)).toEqual(['smac-10', 'smac-55', 'sensor-1000'])
    const without = last(simulateCabin(big))
    expect(without.alarms.map((alarm) => alarm.kind)).toEqual(['smac-10', 'smac-55'])
  })
})

describe('the same fire in other volumes (SPEC §8.2)', () => {
  it('gives 2.327 ppm CO in the US Lab', () => {
    const end = last(simulateCabin({ ...m5Fire, volumeM3: US_LAB_VOLUME_M3 }))
    within(end.coPpm, 2.327)
    expect(end.alarms).toEqual([])
  })

  it.each([
    ['opposed-slab', 55, 4.485],
    ['concurrent-rod', 55, 6.667],
    ['opposed-slab', 10, 24.67],
    ['concurrent-rod', 10, 36.67],
  ] as const)('%s: CO reaches %s ppm below %s m³', (geometry, limit, expected) => {
    const fire = { powerW: 83.48, durationMin: M5_MINUTES, geometry }
    within(volumeWhereCoReaches(limit, fire), expected)
  })
})

describe('extinction and model range', () => {
  it('puts a 5 W rod fire out at the Eq. 6.1 limit (13.61 %) sooner than N2 alone', () => {
    const states = simulateCabin({
      ...n2Only,
      powerW: 5,
      geometry: 'concurrent-rod',
      rodMm: 6.35,
      flowCmS: 2,
    })
    const out = states.find((state) => state.flame === 'out-limit')!
    expect(out.tSec / 60).toBeLessThan(217.5)
    expect(out.o2Pct).toBeLessThan(13.611)
    expect(out.o2Pct).toBeGreaterThan(13.6)
    expect(out.alarms.some((alarm) => alarm.kind === 'extinguished')).toBe(true)
  })

  it('does not ignite a rod below its limit, and makes no prediction off 1 atm', () => {
    const rod = { ...m5Fire, geometry: 'concurrent-rod', rodMm: 6.35, flowCmS: 2 } as const
    expect(simulateCabin({ ...rod, o2InitPct: 13 })[0].flame).toBe('not-ignited')
    const offPressure = simulateCabin({ ...m5Fire, pressureAtm: 0.56 })
    expect(offPressure).toHaveLength(1)
    expect(offPressure[0].valid).toBe(false)
    expect(offPressure[0].invalidReason).toBe('Pressure is not 1 atm')
  })
})

describe('constants quoted from the report', () => {
  it('stops the N2 slider at the MSG maximum the report states, 0.0005 m3/min', () => {
    const claim = getClaim('bass2.cstr.n2-max')
    expect(claim?.unit).toBe('m3/min')
    expect(MSG_N2_MAX_CC_MIN).toBeCloseTo((claim?.value ?? NaN) * 1e6, 6)
  })
})

import { describe, expect, it } from 'vitest'
import flowByTestJson from '../../docs/fixtures/flow-by-test.json'
import csvText from '../../pipeline/sources/PSI-25/PSI-25_Experimental table_BASS-II.csv?raw'
import { compileBass2, type FlowByTest } from './audit'
import { getClaim } from './claims'
import { o2LimitPct } from './physics'
import {
  flowToX,
  limitCurve,
  LONGEST_IGNITION_S,
  o2ToY,
  RACE,
  raceMarkers,
  raceTicks,
  raceTimeAt,
  raceX,
  regionAt,
  rodRug,
  UNCERTAIN_BELOW_CM_S,
  xToFlow,
  yToO2,
} from './rankCharts'

const rows = compileBass2(csvText, flowByTestJson as FlowByTest)

describe('map axes', () => {
  it('puts flow on a log scale from 0.2 to 40 cm/s', () => {
    expect(flowToX(0.2)).toBe(0)
    expect(flowToX(40)).toBeCloseTo(1, 12)
    expect(flowToX(Math.sqrt(0.2 * 40))).toBeCloseTo(0.5, 12)
    expect(xToFlow(flowToX(2))).toBeCloseTo(2, 12)
    expect(flowToX(0.01)).toBe(0)
    expect(flowToX(100)).toBeCloseTo(1, 12)
  })

  it('puts O2 on a linear scale from 12 to 23 %', () => {
    expect(o2ToY(12)).toBe(0)
    expect(o2ToY(23)).toBe(1)
    expect(yToO2(o2ToY(15.4))).toBeCloseTo(15.4, 12)
    expect(yToO2(2)).toBe(23)
  })
})

describe('the Eq. 6.1 curve', () => {
  it('samples the limit for the rod across the whole flow range', () => {
    const curve = limitCurve(6.35)
    expect(curve[0].flow).toBe(0.2)
    expect(curve.at(-1)?.flow).toBeCloseTo(40, 10)
    for (const point of curve) {
      expect(point.limit).toBeCloseTo(o2LimitPct(point.flow, 6.35), 12)
      expect(point.band).toEqual([point.limit, 23])
    }
  })

  it('says sustained at or above the limit, extinguishes below (model)', () => {
    expect(regionAt(13.62, 2, 6.35)).toBe('sustained')
    expect(regionAt(13.6, 2, 6.35)).toBe('extinguishes')
    expect(regionAt(15, 20, 6.35)).toBe('sustained')
    expect(regionAt(14.9, 20, 6.35)).toBe('extinguishes')
  })

  it('hatches below 1 cm/s, as the report says (bass2.flam.low-flow-uncertain)', () => {
    expect(UNCERTAIN_BELOW_CM_S).toBe(1)
    expect(getClaim('bass2.flam.low-flow-uncertain')?.quote).toContain('(<1 cm/s)')
  })
})

describe('the rug of BASS-II rod tests', () => {
  it('holds the final O2 of the 42 burn-confirmed rod tests, lowest first', () => {
    const rug = rodRug(rows)
    expect(rug).toHaveLength(42)
    expect(rug[0]).toEqual({ testId: 'O4', o2Pct: 13.6 })
    expect(rug.at(-1)?.o2Pct).toBe(21.7)
  })
})

describe('the ignition race', () => {
  it('places the rods at t_s: 58.8, 132.3 and 235.2 s', () => {
    expect(raceMarkers().map((m) => [m.rodMm, Number(m.tsS.toFixed(1))])).toEqual([
      [6.35, 58.8],
      [9.525, 132.3],
      [12.7, 235.2],
    ])
  })

  it('marks the longest successful BASS-II ignition at 230 s, as quoted', () => {
    expect(LONGEST_IGNITION_S).toBe(getClaim('bass2.ign.230s')?.value)
  })

  it('sweeps 0 to 250 s linearly and stops at the end', () => {
    expect(raceTimeAt(0)).toBe(0)
    expect(raceTimeAt(RACE.sweepMs / 2)).toBe(125)
    expect(raceTimeAt(RACE.sweepMs * 2)).toBe(250)
    expect(raceTimeAt(-5)).toBe(0)
    expect(raceX(25)).toBe(0.1)
    expect(raceTicks()).toEqual([0, 50, 100, 150, 200, 250])
  })

  it('fits every marker on the track', () => {
    for (const marker of raceMarkers()) expect(raceX(marker.tsS)).toBeLessThan(1)
  })
})

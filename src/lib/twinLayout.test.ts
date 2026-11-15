import { describe, expect, it } from 'vitest'
import { EARTH_LIMIT_O2_PCT, o2LimitPct } from './physics'
import { gaugeTicks, gaugeY, stageLayout } from './twinLayout'

// The stage at the 1440×900 demo size: 1392 wide beside the Lab Partner rail, about 619 tall.
const demo = stageLayout(1392, 619, 6.35)

describe('stageLayout', () => {
  it('puts the gauge on the seam, halfway across', () => {
    expect(demo.seamX).toBe(696)
  })

  it('puts each rod tip near the centre of its half', () => {
    const half = demo.width / 2
    expect(Math.abs(demo.earthTip.x - half * 0.5)).toBeLessThan(half * 0.1)
    expect(Math.abs(demo.orbitTip.x - half * 1.5)).toBeLessThan(half * 0.1)
    expect(Math.abs(demo.earthTip.y - demo.height / 2)).toBeLessThan(demo.height * 0.15)
    expect(Math.abs(demo.orbitTip.y - demo.height / 2)).toBeLessThan(demo.height * 0.15)
  })

  it('draws the three rods to one scale', () => {
    const small = stageLayout(1392, 619, 6.35)
    const large = stageLayout(1392, 619, 12.7)
    expect(small.rodRadius).toBe(small.unit)
    expect(large.rodRadius).toBeCloseTo(small.rodRadius * 2)
    expect(stageLayout(1392, 619, 9.525).rodRadius).toBeCloseTo(small.rodRadius * 1.5)
  })

  it('keeps a usable scale on a small stage and a huge one', () => {
    expect(stageLayout(1184, 440, 6.35).unit).toBeGreaterThanOrEqual(11)
    expect(stageLayout(3000, 2000, 6.35).unit).toBeLessThanOrEqual(26)
  })
})

describe('gaugeY', () => {
  it('runs from 23 % at the top to 12 % at the bottom', () => {
    expect(gaugeY(demo, 23)).toBe(demo.gaugeTop)
    expect(gaugeY(demo, 12)).toBe(demo.gaugeBottom)
    expect(gaugeY(demo, 17.5)).toBeCloseTo((demo.gaugeTop + demo.gaugeBottom) / 2)
  })

  it('puts the orbit limit below the Earth limit at the defaults, with room for the result', () => {
    const gap = gaugeY(demo, o2LimitPct(2, 6.35)) - gaugeY(demo, EARTH_LIMIT_O2_PCT)
    // "Kept burning / 1.79 points / of oxygen longer" is three lines, about 68 px.
    expect(gap).toBeGreaterThan(68)
  })
})

describe('gaugeTicks', () => {
  it('marks every tenth of a point from 12 to 23, with whole and half points longer', () => {
    const ticks = gaugeTicks()
    expect(ticks).toHaveLength(111)
    expect(ticks[0]).toEqual({ o2Pct: 12, kind: 'whole' })
    expect(ticks.at(-1)).toEqual({ o2Pct: 23, kind: 'whole' })
    expect(ticks.filter((tick) => tick.kind === 'whole')).toHaveLength(12)
    expect(ticks.filter((tick) => tick.kind === 'half')).toHaveLength(11)
  })
})

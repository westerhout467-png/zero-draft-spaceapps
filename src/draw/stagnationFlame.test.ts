import { describe, expect, it } from 'vitest'
import { QUENCH_ASPECT_RATIO } from '../lib/burnTwin'
import { stretchRate } from '../lib/physics'
import { flameAspectRatio, stagnationFlameBounds, stagnationFlameShape } from './stagnationFlame'

const unit = 21
const at = (marginPts: number, flowCmS = 2, rodMm = 6.35) =>
  stagnationFlameShape({
    unit,
    rodRadius: (unit * rodMm) / 6.35,
    stretchRate: stretchRate(flowCmS, rodMm),
    marginPts,
  })

// The drawn shape is an illustration, but it must follow the model the way SPEC F1 says.
describe('stagnationFlameShape', () => {
  it('shrinks as the margin to the limit shrinks', () => {
    const margins = [3.4, 2, 1, 0.5, 0.1, 0]
    for (let i = 1; i < margins.length; i++) {
      const bigger = at(margins[i - 1])
      const smaller = at(margins[i])
      expect(smaller.halfWidth).toBeLessThan(bigger.halfWidth)
      expect(smaller.tail).toBeLessThan(bigger.tail)
      expect(smaller.standoff).toBeLessThan(bigger.standoff)
    }
  })

  it('closes to a hemisphere, length ÷ width 0.5, at the quenching limit (bass2.aspect-0.5)', () => {
    expect(flameAspectRatio(at(0))).toBeCloseTo(QUENCH_ASPECT_RATIO, 10)
    expect(flameAspectRatio(at(0, 2, 9.525))).toBeCloseTo(QUENCH_ASPECT_RATIO, 10)
    expect(flameAspectRatio(at(0, 2, 12.7))).toBeCloseTo(QUENCH_ASPECT_RATIO, 10)
    const margins = [3.4, 2, 1, 0.5, 0.1, 0]
    for (let i = 1; i < margins.length; i++) {
      expect(flameAspectRatio(at(margins[i]))).toBeLessThan(flameAspectRatio(at(margins[i - 1])))
    }
  })

  it('is all blue with a closed tip on the quenching side, at any margin', () => {
    for (const margin of [0, 0.1, 1, 1.5]) {
      expect(at(margin).warm).toBe(0)
      expect(at(margin).open).toBe(0)
    }
    // Well above the limit it is a bigger, brighter blue cup, still with no hot core.
    expect(at(3.39).warm).toBe(0)
    expect(at(3.39).vigor).toBeGreaterThan(at(1).vigor)
  })

  it('opens its tip and trails warm light in fast flow close to blowoff (Fig. 6.3 d to f)', () => {
    const nearBlowoff = at(0.1, 20)
    expect(nearBlowoff.open).toBeGreaterThan(0.9)
    expect(nearBlowoff.warm).toBeGreaterThan(0.9)
    // It does not become a hemisphere there: that is the quenching limit's shape.
    expect(flameAspectRatio(nearBlowoff)).toBeGreaterThan(1)
    // Well above the blowoff limit the cup is closed again.
    expect(at(4, 20).open).toBe(0)
  })

  it('flattens against the tip as the airflow rises', () => {
    expect(at(1, 20).standoff).toBeLessThan(at(1, 2).standoff)
    expect(at(1, 40).standoff).toBeLessThan(at(1, 20).standoff)
    expect(at(1, 20).halfWidth).toBeLessThan(at(1, 2).halfWidth)
  })

  it('still has a size at the limit and below it, so the bracket never collapses', () => {
    expect(at(0).halfWidth).toBeGreaterThan(unit)
    expect(at(-3)).toEqual(at(0))
  })

  it('matches the proportions of the 6.35 mm near-limit flame in Fig. 6.3 (a)', () => {
    // Measured off the photo in rod radii: standoff about 2, half-width about 3.6. The length
    // is no longer taken from the photo: at the limit it is set by the report's 0.5 ratio.
    const minimum = stagnationFlameShape({ unit, rodRadius: unit, stretchRate: 10.38, marginPts: 0 })
    expect(minimum.standoff / unit).toBeCloseTo(2, 1)
    expect(minimum.halfWidth / unit).toBeCloseTo(3.6, 1)
  })

  it('fills about a quarter to a third of its half of the stage at the defaults', () => {
    // 1392 px stage: each half is 696 px and the unit is about 21 px.
    const shape = at(17 - 13.611)
    const bounds = stagnationFlameBounds(shape)
    const tall = bounds.bottom - bounds.top
    expect(tall / 696).toBeGreaterThan(0.25)
    expect(tall / 696).toBeLessThan(1 / 3)
  })

  it('wraps further along a thicker rod', () => {
    expect(at(1, 2, 12.7).tail).toBeGreaterThan(at(1, 2, 6.35).tail)
  })
})

import { describe, expect, it } from 'vitest'
import {
  blowoffBranch,
  burnTwinGap,
  EQ61_MINIMUM,
  eq61,
  eq61Branch,
  eq61Validity,
  normalizedIgnitionDelay,
  o2LimitPct,
  solidResponseTimeS,
  stretchRate,
} from './physics'

// SPEC §8.1 table: every value within ±0.01 unless noted.
const within = (actual: number, expected: number, tolerance = 0.01) =>
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(tolerance)

describe('Eq. 6.1 (SPEC §8.1)', () => {
  it('has its minimum at a = 10.382, 13.607 % O2', () => {
    within(EQ61_MINIMUM.a, 10.382)
    within(EQ61_MINIMUM.o2Pct, 13.607)
    within(eq61(10.382), 13.607)
  })

  it('gives a = 9.441 for U = 2 cm/s and d = 6.35 mm', () => {
    within(stretchRate(2, 6.35), 9.441)
  })

  it.each([
    [2, 6.35, 13.611],
    [20, 6.35, 14.977],
    [1, 6.35, 14.045],
    [0.5, 6.35, 15.283],
    [2, 9.525, 13.656],
    [20, 9.525, 14.687],
    [2, 12.7, 13.725],
    [20, 12.7, 14.515],
  ])('gives X_O2 for U = %s cm/s, d = %s mm as %s %%', (flow, rod, expected) => {
    within(o2LimitPct(flow, rod), expected)
  })

  it('gives the Burn Twin gap 15.4 − X_O2(U = 2, d = 6.35) = 1.789 points', () => {
    within(burnTwinGap(2, 6.35), 1.789)
  })

  it('has a blowoff branch of 13.4 % at a = 0 (the conservative space limit)', () => {
    expect(blowoffBranch(0)).toBe(13.4)
  })

  it('puts a < 10.38 on the quenching branch and above it on the blowoff branch', () => {
    expect(eq61Branch(stretchRate(2, 6.35))).toBe('quenching')
    expect(eq61Branch(stretchRate(20, 6.35))).toBe('blowoff')
  })
})

describe('solid response time t_s (SPEC §8.1)', () => {
  it.each([
    [6.35, 58.804],
    [9.525, 132.308],
    [12.7, 235.215],
  ])('is %s mm → %s s', (rod, expected) => {
    within(solidResponseTimeS(rod), expected)
  })

  it('gives t_s ÷ 25 s = 9.409 for d = 12.7 mm', () => {
    within(solidResponseTimeS(12.7) / 25, 9.409)
  })

  it('normalizes an ignition delay by t_s', () => {
    within(normalizedIgnitionDelay(58.804, 6.35), 1)
  })
})

describe('model range (CLAUDE.md rule 6)', () => {
  it('accepts the three BASS-II rods at 1 atm', () => {
    for (const rod of [6.35, 9.525, 12.7]) expect(eq61Validity(rod).valid).toBe(true)
  })

  it('rejects other rod sizes and other pressures', () => {
    expect(eq61Validity(5).valid).toBe(false)
    expect(eq61Validity(6.35, 0.56).valid).toBe(false)
  })
})

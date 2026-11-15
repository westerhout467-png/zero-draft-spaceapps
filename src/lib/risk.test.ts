import { describe, expect, it } from 'vitest'
import flowByTestJson from '../../docs/fixtures/flow-by-test.json'
import riskExpected from '../../docs/fixtures/risk-components.json'
import csvText from '../../pipeline/sources/PSI-25/PSI-25_Experimental table_BASS-II.csv?raw'
import { compileBass2, type Bass2Row, type FlowByTest, type SampleType } from './audit'
import { solidResponseTimeS } from './physics'
import {
  biggestFactor,
  burnCountRange,
  componentScores,
  componentShares,
  EQUAL_WEIGHTS,
  familyFlows,
  INDEX_KEYS,
  isEqualWeights,
  leaderboard,
  leaderHeadline,
  lowestInitialO2,
  riskEntities,
  riskIndex,
  setWeight,
  TEST1_IGNITION_S,
  unrankedGroups,
  type RiskEntity,
  type Weights,
} from './risk'

const rows = compileBass2(csvText, flowByTestJson as FlowByTest)
const entities = riskEntities(rows)
const entity = (id: string): RiskEntity => {
  const found = entities.find((e) => e.id === id)
  if (!found) throw new Error(`no entity ${id}`)
  return found
}
const order = (weights: Weights) => leaderboard(entities, weights).rows.map((row) => row.entity.id)
const only = (key: keyof Weights): Weights => ({ lowO2: 0, coYield: 0, [key]: 1 })

type ExpectedMeasured = { value: number; unit: string; n: number | null; test?: string }
type ExpectedEntity = {
  id: string
  label: string
  tests: number
  burnConfirmed: number
  components: Partial<Record<'lowO2' | 'coYield' | 'ignitionGap', ExpectedMeasured>>
  ranked: boolean
  flows: Record<string, number>
}
const expected = riskExpected.entities as ExpectedEntity[]

/** How many decimals a fixture value was written with: the tolerance is half its last digit. */
const halfLastDigit = (value: number) => 0.5 * 10 ** -(String(value).split('.')[1]?.length ?? 0)

describe('measured components, recomputed from the raw PSI-25 CSV (risk-components.json)', () => {
  it('has one entity per sample type in the CSV, the same 17 as the fixture', () => {
    expect(entities.map((e) => e.id).sort()).toEqual(expected.map((e) => e.id).sort())
  })

  for (const want of expected) {
    it(`${want.id}: tests, burns, components, flows and ranking`, () => {
      const got = entity(want.id)
      expect(got.label).toBe(want.label)
      expect(got.tests).toBe(want.tests)
      expect(got.burnConfirmed).toBe(want.burnConfirmed)
      expect(got.ranked).toBe(want.ranked)
      expect(got.flows).toEqual(want.flows)
      expect(Object.keys(got.components).sort()).toEqual(Object.keys(want.components).sort())
      for (const [key, measured] of Object.entries(want.components)) {
        const ours = got.components[key as keyof typeof want.components]!
        expect(Math.abs(ours.value - measured.value), `${key} ${ours.value}`).toBeLessThanOrEqual(
          halfLastDigit(measured.value),
        )
        expect(ours.unit).toBe(measured.unit)
        expect(ours.n).toBe(measured.n)
        if (measured.test) expect(ours.testId).toBe(measured.test)
        expect(ours.claimIds.length).toBe(1)
      }
    })
  }

  it('puts finding claims on Nomex and the wax candle only', () => {
    expect(entity('nomex').findingClaimIds).toEqual(['bass2.nomex'])
    expect(entity('wax-candle').findingClaimIds).toEqual(['bass2.wax-droplet'])
    expect(entities.filter((e) => e.findingClaimIds.length > 0)).toHaveLength(2)
  })

  it('keeps CO yield to 0.1 ppm per %, as shown, so the index can be redone from the screen', () => {
    // Slab 5 mm's median is 344.44…; unrounded, its equal-weight index would be 34.67, not 34.6.
    expect(entity('pmma-slab-5').components.coYield?.value).toBe(344.4)
    expect(entity('pmma-rod-9.525').components.coYield?.value).toBe(291.4)
  })

  it('measures the ignition gap as t_s ÷ 25 s from the rod diameter alone', () => {
    expect(TEST1_IGNITION_S).toBe(25)
    expect(entity('pmma-rod-12.7').components.ignitionGap?.value).toBeCloseTo(solidResponseTimeS(12.7) / 25, 10)
  })
})

describe('the ranking rule: at least 3 burn-confirmed tests and 2 components', () => {
  it('ranks the 8 PMMA rods and slabs, nothing else', () => {
    expect(entities.filter((e) => e.ranked).map((e) => e.id)).toEqual([
      'pmma-rod-6.35',
      'pmma-rod-9.525',
      'pmma-rod-12.7',
      'pmma-slab-1',
      'pmma-slab-2',
      'pmma-slab-3',
      'pmma-slab-4',
      'pmma-slab-5',
    ])
  })

  it('leaves out a type with fewer than 3 burn-confirmed tests, even with enough tests', () => {
    expect(entity('pmma-sphere').burnConfirmed).toBe(2)
    expect(entity('pmma-sphere').ranked).toBe(false)
    expect(entity('pmma-sphere').components).toEqual({})
  })

  it('leaves out a rod with fewer than 3 burns: the ignition gap alone is one component', () => {
    const rod = rows.filter((row) => row.sampleType === 'pmma-rod-12.7')
    const burning = rod.filter((row) => row.burnConfirmed).slice(0, 2)
    const unburnt = rod.filter((row) => !row.burnConfirmed)
    const [thin] = riskEntities([...burning, ...unburnt])
    expect(Object.keys(thin.components)).toEqual(['ignitionGap'])
    expect(thin.ranked).toBe(false)
  })

  it('needs 3 numeric CO values for a CO yield', () => {
    const slab = rows.filter((row) => row.sampleType === 'pmma-slab-1' && row.burnConfirmed)
    expect(slab).toHaveLength(3)
    const noCo: Bass2Row = { ...slab[0], coPerCo2: null }
    const [few] = riskEntities([noCo, slab[1], slab[2]])
    expect(few.components.lowO2).toBeDefined()
    expect(few.components.coYield).toBeUndefined()
    expect(few.ranked).toBe(false)
  })
})

describe('scores', () => {
  const scores = componentScores(entities.filter((e) => e.ranked))
  const score = (id: SampleType) => scores.get(id)!

  it('min–max normalizes low-O2 burning: lowest O2 scores 1, highest 0', () => {
    expect(score('pmma-rod-9.525').lowO2).toBe(1)
    expect(score('pmma-slab-1').lowO2).toBe(0)
    expect(score('pmma-rod-6.35').lowO2).toBeCloseTo((18.4 - 14.3) / (18.4 - 13.6), 10)
  })

  it('min–max normalizes CO yield: highest yield scores 1, lowest 0', () => {
    expect(score('pmma-slab-2').coYield).toBe(1)
    expect(score('pmma-rod-9.525').coYield).toBe(0)
  })

  it('leaves the ignition gap out of the scores: t_s comes from the rod diameter alone, the same on Earth', () => {
    // Still measured on every rod (the fixture's ignitionGap), just not scored.
    expect(entity('pmma-rod-12.7').components.ignitionGap).toBeDefined()
    for (const s of scores.values()) expect(Object.keys(s).sort()).toEqual(['coYield', 'lowO2'])
  })

  it('keeps every score between 0 and 1', () => {
    for (const s of scores.values()) {
      for (const value of Object.values(s)) {
        expect(value).toBeGreaterThanOrEqual(0)
        expect(value).toBeLessThanOrEqual(1)
      }
    }
  })

  it('gives a component with no spread 0 for every type, never NaN', () => {
    const same = entities
      .filter((e) => e.ranked)
      .map((e) => ({ ...e, components: { ...e.components, lowO2: { ...e.components.lowO2!, value: 15 } } }))
    for (const s of componentScores(same).values()) expect(s.lowO2).toBe(0)
  })
})

describe('missing components', () => {
  it('indexes rods and slabs over the same 2 components', () => {
    expect(entity('pmma-slab-2').components.ignitionGap).toBeUndefined()
    for (const e of entities.filter((x) => x.ranked)) {
      expect(INDEX_KEYS.every((key) => e.components[key])).toBe(true)
    }
    expect(riskIndex({ lowO2: 0.5, coYield: 1 }, EQUAL_WEIGHTS)).toBeCloseTo(75, 10)
  })

  it('says "Not scored at these weights" (null) when a type has weight only on components it lacks', () => {
    expect(riskIndex({ lowO2: 0.5 }, only('coYield'))).toBeNull()
    expect(riskIndex({}, EQUAL_WEIGHTS)).toBeNull()
  })

  it('moves a type to the unscored list, without dividing by zero, when its only weighted component is missing', () => {
    // Can't happen with the real data (every ranked type has both), so take CO yield off one.
    const { coYield: _, ...rest } = entity('pmma-slab-2').components
    const lopsided = entities.map((e) => (e.id === 'pmma-slab-2' ? { ...e, components: rest } : e))
    const board = leaderboard(lopsided, only('coYield'))
    expect(board.unscored.map((u) => u.entity.id)).toEqual(['pmma-slab-2'])
    expect(board.rows).toHaveLength(7)
    for (const row of board.rows) expect(Number.isFinite(row.index)).toBe(true)
  })
})

describe('the index at equal weights', () => {
  it('matches the agreed values, highest first', () => {
    // 50 × (low-O2 score + CO yield score), from the fixture's measured values: e.g. slab 2 mm is
    // 50 × ((18.4 − 17.1)/4.8 + 1) = 63.54; rod 12.7 mm is 50 × ((18.4 − 14.2)/4.8 + (334.1 − 291.4)/109.4) = 63.27.
    const board = leaderboard(entities, EQUAL_WEIGHTS)
    expect(board.rows.map((row) => [row.entity.id, Number(row.index.toFixed(1))])).toEqual([
      ['pmma-slab-2', 63.5],
      ['pmma-rod-12.7', 63.3],
      ['pmma-rod-6.35', 51.5],
      ['pmma-rod-9.525', 50.0],
      ['pmma-slab-3', 47.9],
      ['pmma-slab-1', 43.5],
      ['pmma-slab-5', 34.6],
      ['pmma-slab-4', 25.9],
    ])
    expect(board.rows.map((row) => row.rank)).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
    expect(board.unscored).toEqual([])
  })

  it('is the same at any equal weight', () => {
    const half: Weights = { lowO2: 0.5, coYield: 0.5 }
    expect(isEqualWeights(half)).toBe(true)
    expect(order(half)).toEqual(order(EQUAL_WEIGHTS))
  })
})

describe('reordering when weights change', () => {
  it('ranks by low-O2 burning alone, ties by sample type id', () => {
    // Slabs 4 mm and 5 mm both bottomed out at 17.4%: a tie, so 4 before 5.
    expect(order(only('lowO2'))).toEqual([
      'pmma-rod-9.525',
      'pmma-rod-12.7',
      'pmma-rod-6.35',
      'pmma-slab-3',
      'pmma-slab-2',
      'pmma-slab-4',
      'pmma-slab-5',
      'pmma-slab-1',
    ])
    const board = leaderboard(entities, only('lowO2')).rows
    expect(board[5].index).toBe(board[6].index)
  })

  it('ranks by CO yield alone', () => {
    expect(order(only('coYield'))).toEqual([
      'pmma-slab-2',
      'pmma-slab-1',
      'pmma-slab-3',
      'pmma-slab-5',
      'pmma-rod-12.7',
      'pmma-slab-4',
      'pmma-rod-6.35',
      'pmma-rod-9.525',
    ])
  })

  it('moves a row when one slider moves', () => {
    const before = order(EQUAL_WEIGHTS)
    const after = order(setWeight(EQUAL_WEIGHTS, 'coYield', 0))
    expect(after).not.toEqual(before)
    expect(after[0]).toBe('pmma-rod-9.525')
  })
})

describe('setWeight', () => {
  it('snaps to 0.05 steps between 0 and 1', () => {
    expect(setWeight(EQUAL_WEIGHTS, 'lowO2', 0.333).lowO2).toBe(0.35)
    expect(setWeight(EQUAL_WEIGHTS, 'lowO2', 7).lowO2).toBe(1)
    expect(setWeight(EQUAL_WEIGHTS, 'lowO2', -1).lowO2).toBe(0)
  })

  it('always keeps one slider above 0', () => {
    const one = only('coYield')
    const next = setWeight(one, 'coYield', 0)
    expect(next.coYield).toBe(0.05)
    expect(INDEX_KEYS.some((key) => next[key] > 0)).toBe(true)
    expect(setWeight(next, 'lowO2', 0.5).lowO2).toBe(0.5)
  })

  it('returns the same object when nothing changes', () => {
    expect(setWeight(EQUAL_WEIGHTS, 'lowO2', 1)).toBe(EQUAL_WEIGHTS)
  })
})

describe('segment shares and the headline', () => {
  const weightings: Weights[] = [
    EQUAL_WEIGHTS,
    only('lowO2'),
    only('coYield'),
    { lowO2: 0.35, coYield: 0.8 },
  ]

  it('cuts each row into segments that add up exactly to its index', () => {
    for (const weights of weightings) {
      for (const row of leaderboard(entities, weights).rows) {
        const shares = Object.values(componentShares(row.scores, weights))
        expect(shares.reduce((sum, share) => sum + share, 0)).toBeCloseTo(row.index, 10)
        for (const share of shares) expect(share).toBeGreaterThanOrEqual(0)
      }
    }
  })

  it('gives a segment wᵢcᵢ ÷ Σwᵢ × 100, and none for a missing component', () => {
    const slab = leaderboard(entities, EQUAL_WEIGHTS).rows.find((row) => row.entity.id === 'pmma-slab-2')!
    const shares = componentShares(slab.scores, EQUAL_WEIGHTS)
    expect(shares.coYield).toBeCloseTo(50, 10)
    expect(shares.lowO2).toBeCloseTo((100 * (18.4 - 17.1)) / 4.8 / 2, 10)
    expect(componentShares({ lowO2: 0.5 }, EQUAL_WEIGHTS)).toEqual({ lowO2: 50 })
    expect(componentShares({ lowO2: 0.5 }, only('coYield'))).toEqual({})
  })

  it('at equal weights: the 2 mm slab leads, and its biggest factor is CO yield', () => {
    // Its weighted shares: low-O2 13.5, CO yield 50.0.
    const headline = leaderHeadline(leaderboard(entities, EQUAL_WEIGHTS), EQUAL_WEIGHTS)
    expect(headline?.entity.id).toBe('pmma-slab-2')
    expect(headline?.factor).toBe('coYield')
    expect(headline?.measured.value).toBe(400.8)
  })

  it('follows the weights', () => {
    const lowO2 = leaderHeadline(leaderboard(entities, only('lowO2')), only('lowO2'))
    expect([lowO2?.entity.id, lowO2?.factor, lowO2?.measured.value, lowO2?.measured.testId]).toEqual([
      'pmma-rod-9.525',
      'lowO2',
      13.6,
      'O4',
    ])
    const co = leaderHeadline(leaderboard(entities, only('coYield')), only('coYield'))
    expect([co?.entity.id, co?.factor, co?.measured.value]).toEqual(['pmma-slab-2', 'coYield', 400.8])
  })

  it('says how far ahead the leader is, from the indexes as shown', () => {
    // 63.5 and 63.3 on screen: a 0.2-point lead, not a finding.
    const equal = leaderHeadline(leaderboard(entities, EQUAL_WEIGHTS), EQUAL_WEIGHTS)
    expect([equal?.runnerUp?.id, equal?.margin]).toEqual(['pmma-rod-12.7', 0.2])
    // Low-O2 alone: rod 9.525 mm scores 1 (100), rod 12.7 mm (18.4 − 14.2)/4.8 = 0.875 (87.5).
    const lowO2 = leaderHeadline(leaderboard(entities, only('lowO2')), only('lowO2'))
    expect([lowO2?.runnerUp?.id, lowO2?.margin]).toEqual(['pmma-rod-12.7', 12.5])
  })

  it('gives a margin of 0 when the top two show the same index, and none with one row', () => {
    // Slabs 4 mm and 5 mm both bottomed out at 17.4%: on their own, no spread, both 0.
    const pair = entities.filter((e) => e.id === 'pmma-slab-4' || e.id === 'pmma-slab-5')
    const tied = leaderHeadline(leaderboard(pair, only('lowO2')), only('lowO2'))
    expect([tied?.entity.id, tied?.runnerUp?.id, tied?.margin]).toEqual(['pmma-slab-4', 'pmma-slab-5', 0])
    const alone = leaderHeadline(leaderboard([entity('pmma-slab-2')], EQUAL_WEIGHTS), EQUAL_WEIGHTS)
    expect([alone?.runnerUp, alone?.margin]).toEqual([null, null])
  })

  it('breaks a tie for biggest factor in component order', () => {
    expect(biggestFactor({ lowO2: 0.5, coYield: 0.5 }, EQUAL_WEIGHTS)).toBe('lowO2')
    expect(biggestFactor({ lowO2: 0.5 }, only('coYield'))).toBeNull()
  })
})

describe('repeat runs', () => {
  it('gives identical output every time, and from rows in any order', () => {
    const a = leaderboard(riskEntities(rows), EQUAL_WEIGHTS)
    const b = leaderboard(riskEntities(rows), EQUAL_WEIGHTS)
    expect(b).toEqual(a)
    const c = leaderboard(riskEntities([...rows].reverse()), EQUAL_WEIGHTS)
    expect(c.rows.map((row) => [row.entity.id, row.index])).toEqual(a.rows.map((row) => [row.entity.id, row.index]))
  })

  it('does not change the entities it is given', () => {
    const copy = structuredClone(entities)
    leaderboard(entities, only('lowO2'))
    expect(entities).toEqual(copy)
  })
})

describe('unranked groups and their reasons', () => {
  const groups = unrankedGroups(entities, rows)
  const group = (family: string) => groups.find((g) => g.family === family)!

  it('lists SIBAL, thin films and the sphere section with reasons, then the two findings', () => {
    expect(groups.map((g) => [g.label, g.tests, g.reason.kind])).toEqual([
      ['SIBAL fabric', 27, 'too-small'],
      ['PMMA thin films', 22, 'few-burns'],
      ['PMMA sphere section, 4 cm', 2, 'few-burns'],
      ['Nomex III fabric', 3, 'finding'],
      ['Japan wax candle', 1, 'finding'],
    ])
  })

  it('says SIBAL never moved the sensors: largest CO2 rise 0.07%', () => {
    expect(group('sibal').reason).toEqual({ kind: 'too-small', largestCo2RisePct: 0.07 })
    expect(group('sibal').burnConfirmed).toBe(0)
  })

  it('counts 2 burn-confirmed thin films out of 22', () => {
    expect(group('film').reason).toEqual({ kind: 'few-burns', burnConfirmed: 2 })
  })

  it('gives the findings their claims and tests', () => {
    expect(group('nomex').reason).toEqual({ kind: 'finding', claimIds: ['bass2.nomex'] })
    expect(group('nomex').testIds).toEqual(['F1', 'F2', 'F3'])
    expect(group('wax').reason).toEqual({ kind: 'finding', claimIds: ['bass2.wax-droplet'] })
    expect(group('wax').testIds).toEqual(['F4'])
    // The candle burned (NASA's notes), but its CO2 rose only 0.1%: under the 0.2% the sensors need.
    expect(group('wax').largestCo2RisePct).toBe(0.1)
  })
})

describe('the sentences shown with the components', () => {
  it('slab tests never started below 17.9% O2; rod tests started as low as 13.6%', () => {
    // Not 16.8%: that is the lowest final O2 a slab reached, not the lowest it started at.
    expect(lowestInitialO2(rows, 'slab')).toBe(17.9)
    expect(lowestInitialO2(rows, 'rod')).toBe(13.6)
  })

  it('rods had 8 to 25 burn-confirmed tests each, slabs 3 to 4', () => {
    // A lowest value can only drop as tests are added, so the low-O2 slider says this too.
    expect(burnCountRange(entities, 'rod')).toEqual({ min: 8, max: 25 })
    expect(burnCountRange(entities, 'slab')).toEqual({ min: 3, max: 4 })
    expect(burnCountRange(entities, 'sibal')).toBeNull()
  })

  it('slabs were only tested in opposed flow; rods mix flow directions', () => {
    expect(familyFlows(entities, 'slab')).toEqual(['Opposed'])
    expect(familyFlows(entities, 'rod')).toEqual(['Concurrent', 'Opposed', 'Stagnation'])
  })
})

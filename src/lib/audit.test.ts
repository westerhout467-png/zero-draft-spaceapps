import { describe, expect, it } from 'vitest'
import auditExpected from '../../docs/fixtures/audit-expected.json'
import flowByTestJson from '../../docs/fixtures/flow-by-test.json'
import forensicsExpected from '../../docs/fixtures/o2-forensics.json'
import perTestExpected from '../../docs/fixtures/per-test-expected.json'
import csvText from '../../pipeline/sources/PSI-25/PSI-25_Experimental table_BASS-II.csv?raw'
import bass2File from '../../public/data/bass2.json'
import auditFile from '../../public/data/audit.json'
import {
  auditGroups,
  auditHeadline,
  BURN_CO2_RISE_PCT,
  CO2_RESOLUTION_PCT,
  COLUMNS,
  compileBass2,
  dayOfYear,
  FLAGS,
  forensicClaimId,
  isMissingCell,
  isOverRangeCell,
  nasaChecks,
  numberCell,
  O2_RESOLUTION_PCT,
  o2Forensic,
  parseAppendixO2,
  parseSampleType,
  quarantineReason,
  roundTo,
  severityOf,
  summarizeAudit,
  type Bass2Row,
  type Flag,
  type FlowByTest,
} from './audit'
import { getClaim } from './claims'
import { median } from './stats'

const flowByTest = flowByTestJson as FlowByTest
const rows = compileBass2(csvText, flowByTest)
const summary = summarizeAudit(rows, { generatedBy: 'test', generatedAt: 'now' })
const byId = new Map(rows.map((row) => [row.testId, row]))
const row = (testId: string): Bass2Row => {
  const found = byId.get(testId)
  if (!found) throw new Error(`no test ${testId}`)
  return found
}

type PerTest = {
  entity: string
  flowConfig: string | null
  o2Usable: boolean
  dCO2: number | null
  burnConfirmed: boolean
  coPerCo2: number | null
  flags: string[]
}
const perTest = perTestExpected as Record<string, PerTest>

describe('reading the raw PSI-25 CSV', () => {
  it('finds 129 tests with the 17 trimmed column names', () => {
    expect(rows).toHaveLength(129)
    expect(Object.keys(rows[0].raw)).toEqual(Object.values(COLUMNS))
    // Two spaces inside, trailing space trimmed.
    expect(rows[0].raw).toHaveProperty(['Calibrated  initial O2 % by vol'])
  })

  it('keeps every raw cell exactly, quotes undone, spaces and typos kept, empty cells empty', () => {
    expect(row('O1').material).toBe('1/4" clear rod')
    expect(row('O4').material).toBe('3/8"clear rod')
    expect(row('B4').material).toBe('300 micron PMMA film   2 cm wide ')
    expect(row('P14').material).toBe('1/4 blac rod')
    expect(row('M19').material).toBe('4 mm thick   2 cm 2ide PMMA slab')
    expect(row('B2').raw[COLUMNS.co2Final]).toBe('')
    expect(row('B2').raw[COLUMNS.coFinal]).toBe('')
    expect(row('T29').airDisplayRaw).toBe('5   2(?)')
    expect(row('M5').raw[COLUMNS.coFinal]).toBe('>500')
    for (const r of rows) for (const cell of Object.values(r.raw)) expect(cell).not.toBe('nan')
  })

  it('numbers each data row from 1 in the CSV order', () => {
    expect(rows.map((r) => r.rowIndex)).toEqual(rows.map((_, i) => i + 1))
    expect(rows[0].testId).toBe('B1')
    expect(rows.at(-1)?.testId).toBe('T29')
  })

  it('shows the date errors as written, never fixed', () => {
    expect(row('T9').date).toBe('2018-06-24')
    expect(row('T18').date).toBe('2018-06-24')
    expect(row('O10').date).toBe('2014-07-22')
    expect(row('O10').gmtDay).toBe(213)
  })
})

describe('whole-cell rules', () => {
  it('reads CO over range only from a whole cell', () => {
    for (const cell of ['OR', 'or', ' OR ', 'over', 'Over', '>500', '>1000']) expect(isOverRangeCell(cell), cell).toBe(true)
    for (const cell of ['FOR', 'OR?', 'overall', 'cover', '500', '', 'none', 'no ign at any flow']) {
      expect(isOverRangeCell(cell), cell).toBe(false)
    }
  })

  it('reads missing only from an empty cell or "none"', () => {
    for (const cell of ['', '  ', 'none', 'None']) expect(isMissingCell(cell), cell).toBe(true)
    for (const cell of ['0', 'nonexistent', 'OR']) expect(isMissingCell(cell), cell).toBe(false)
  })

  it('reads numbers only from cells that are plain numbers', () => {
    expect(numberCell('22.2')).toBe(22.2)
    expect(numberCell('-1')).toBe(-1)
    expect(numberCell('.36')).toBe(0.36)
    for (const cell of ['none', 'OR', '>500', '', '10 postburn only', '300+   +102']) expect(numberCell(cell)).toBeNull()
  })

  it('ties its thresholds to the cited sensor resolutions', () => {
    expect(O2_RESOLUTION_PCT).toBe(getClaim('bass2.sensor.o2-res')?.value)
    expect(CO2_RESOLUTION_PCT).toBe(getClaim('bass2.sensor.co2-res')?.value)
    expect(BURN_CO2_RISE_PCT).toBe(0.2)
  })
})

describe('sample types', () => {
  it('reads the odd spellings', () => {
    expect(parseSampleType('1/4 blac rod')).toBe('pmma-rod-6.35')
    expect(parseSampleType('0.5" black rod')).toBe('pmma-rod-12.7')
    expect(parseSampleType('3/8"clear rod')).toBe('pmma-rod-9.525')
    expect(parseSampleType('4 mm thick   2 cm 2ide PMMA slab')).toBe('pmma-slab-4')
    expect(parseSampleType('2 cm wide   5 mm thick 1 sided PMMA')).toBe('pmma-slab-5')
    expect(parseSampleType('2 cm   0.4 mm thick film')).toBe('pmma-film-0.4')
    expect(parseSampleType('200 micron  2 cm wide ')).toBe('pmma-film-0.2')
    expect(parseSampleType('2 cm Sibal   moved igniter')).toBe('sibal-2cm')
    expect(parseSampleType('4 cm spherical section')).toBe('pmma-sphere')
    expect(parseSampleType('Japan Wax candle')).toBe('wax-candle')
    expect(() => parseSampleType('mystery sample')).toThrow()
  })

  it('takes T3 and T7 as PMMA sphere sections, not SIBAL, and splits Ferkul into Nomex and wax', () => {
    expect(row('T3').sampleType).toBe('pmma-sphere')
    expect(row('T7').sampleType).toBe('pmma-sphere')
    expect(['F1', 'F2', 'F3', 'F4'].map((id) => row(id).sampleType)).toEqual(['nomex', 'nomex', 'nomex', 'wax-candle'])
  })
})

describe('audit-expected.json', () => {
  const expectedCounts = auditExpected.counts as Record<string, unknown>

  it('reproduces every count', () => {
    for (const [key, value] of Object.entries(expectedCounts)) {
      if (key === 'byPi') continue
      expect(summary.counts[key as Flag | 'total'], key).toBe(value)
    }
    expect(summary.byPi).toEqual(auditExpected.counts.byPi)
  })

  it('reproduces every test-id list, in CSV order, and no others', () => {
    const expectedIds = auditExpected.testIds as Record<string, string[]>
    for (const [flag, ids] of Object.entries(expectedIds)) {
      expect(summary.testIds[flag as Flag], flag).toEqual(ids)
    }
    expect(Object.keys(summary.testIds).sort()).toEqual(Object.keys(expectedIds).sort())
    // Every flag the rules name has a count.
    for (const flag of FLAGS) expect(expectedCounts[flag], flag).toBe(summary.counts[flag])
  })

  it('reproduces the stats over O2-usable tests', () => {
    const usable = rows.filter((r) => r.o2Usable)
    const stat = (values: number[]) => ({
      n: values.length,
      mean: roundTo(values.reduce((a, b) => a + b, 0) / values.length, 3),
      min: Math.min(...values),
      max: Math.max(...values),
    })
    const s = auditExpected.stats_o2Usable
    expect(stat(usable.map((r) => r.o2InitPct as number))).toEqual(s.o2InitPct)
    expect(stat(usable.map((r) => r.o2FinalPct as number))).toEqual(s.o2FinalPct)
    expect(stat(usable.map((r) => roundTo((r.o2InitPct as number) - (r.o2FinalPct as number), 2)))).toEqual(s.dO2Pct)
    expect(stat(usable.flatMap((r) => (r.dCo2Pct === null ? [] : [r.dCo2Pct])))).toEqual(s.dCO2Pct)
    const dCo = usable.flatMap((r) => (r.coInitPpm === null || r.coFinalPpm === null ? [] : [r.coFinalPpm - r.coInitPpm]))
    expect(stat(dCo)).toEqual(s.dCOppm)
  })

  it('finds 45 usable tests whose O2 change is inside the sensor resolution', () => {
    const inside = rows.filter(
      (r) => r.o2Usable && Math.abs(roundTo((r.o2FinalPct as number) - (r.o2InitPct as number), 2)) <= O2_RESOLUTION_PCT,
    )
    expect(inside).toHaveLength(45)
  })
})

describe('per-test-expected.json', () => {
  it('covers exactly the tests in the CSV', () => {
    expect(Object.keys(perTest).sort()).toEqual(rows.map((r) => r.testId).sort())
  })

  for (const [testId, expected] of Object.entries(perTest)) {
    it(`reproduces ${testId}`, () => {
      const r = row(testId)
      expect(r.sampleType).toBe(expected.entity)
      expect(r.flowConfig).toBe(expected.flowConfig)
      expect(r.o2Usable).toBe(expected.o2Usable)
      expect(r.dCo2Pct === null ? null : roundTo(r.dCo2Pct, 2)).toBe(expected.dCO2)
      expect(r.burnConfirmed).toBe(expected.burnConfirmed)
      expect(r.coPerCo2 === null ? null : roundTo(r.coPerCo2, 1)).toBe(expected.coPerCo2)
      // The fixture writes a detail after some flags: O10's "date-gmt-mismatch(doy=203)" also
      // gives the day of year its Date column works out to. Check the flag and the detail.
      const names = expected.flags.map((flag) => {
        const match = /^([a-z0-9-]+)(?:\(doy=(\d+)\))?$/.exec(flag)
        if (!match) throw new Error(`unreadable fixture flag ${flag}`)
        if (match[2]) {
          const [year, month, day] = r.date.split('-').map(Number)
          expect(dayOfYear(year, month, day)).toBe(Number(match[2]))
          expect(r.gmtDay).not.toBe(Number(match[2]))
        }
        return match[1]
      })
      expect(r.flags).toEqual(names)
    })
  }
})

describe('o2-forensics.json', () => {
  it('covers exactly the tests flagged o2-impossible', () => {
    expect(forensicsExpected.rows.map((f) => f.test)).toEqual(summary.testIds['o2-impossible'])
  })

  for (const expected of forensicsExpected.rows) {
    it(`reproduces ${expected.test} from the CSV and its Appendix A row`, () => {
      expect(forensicClaimId(expected.test)).toBe(expected.claimId)
      const claim = getClaim(expected.claimId)
      expect(claim?.verified).toBe(true)
      const f = o2Forensic(row(expected.test), claim?.quote ?? '')
      expect(f.calibratedInitial).toBe(expected.calibratedInitial)
      expect(f.calibratedFinal).toBe(expected.calibratedFinal)
      expect(f.uncalibratedInitial).toBe(expected.uncalibratedInitial)
      expect(f.uncalibratedFinal).toBe(expected.uncalibratedFinal)
      expect(f.offset).toBe(expected.offset)
      expect(f.reproduced).toBe(expected.reproduced)
      expect(f.matches).toBe(expected.matches)
      expect(f.appendixMatchesCsv).toBe(true)
    })
  }

  it('keeps the four cells exactly as Appendix A prints them', () => {
    const printed = (id: string) => o2Forensic(row(id), getClaim(forensicClaimId(id))?.quote ?? '').printed
    expect(printed('P22b')).toEqual(['20.0', '39.1', '----', '19.1'])
    expect(printed('T28b')).toEqual(['20.7', '40.4', '------', '19.7'])
    expect(printed('B2')).toEqual(['22.2', '1.6', '20.6', '-----'])
  })

  it('reads Appendix A dashes as blank', () => {
    expect(parseAppendixO2('20.0 39.1 ---- 19.1')).toEqual({
      calibratedInitial: 20,
      calibratedFinal: 39.1,
      uncalibratedInitial: null,
      uncalibratedFinal: 19.1,
    })
    expect(() => parseAppendixO2('20.0 39.1')).toThrow()
  })
})

describe('burn confirmation', () => {
  it('confirms 65 tests, and never a SIBAL test (largest CO2 rise 0.07%)', () => {
    expect(rows.filter((r) => r.burnConfirmed)).toHaveLength(65)
    const sibal = rows.filter((r) => r.sampleType.startsWith('sibal'))
    expect(sibal.some((r) => r.burnConfirmed)).toBe(false)
    expect(Math.max(...sibal.map((r) => r.dCo2Pct ?? -Infinity))).toBe(0.07)
  })
})

describe('groups and severity', () => {
  const groups = auditGroups(summary.testIds)

  it('quarantines the 7 tests whose final O2 is missing or impossible', () => {
    expect([...groups.quarantined].sort()).toEqual(['B14', 'B2', 'F3', 'P22a', 'P22b', 'T28a', 'T28b'])
    expect(groups['co-over-range']).toEqual(['M5', 'O4', 'O12', 'O13b'])
    expect(groups['date-error'].sort()).toEqual(['O10', 'T18', 'T9'])
    expect(rows.filter((r) => !r.o2Usable).map((r) => r.testId).sort()).toEqual([...groups.quarantined].sort())
  })

  it('agrees with each row’s severity', () => {
    const bySeverity = (s: string) => rows.filter((r) => severityOf(r.flags) === s).map((r) => r.testId)
    expect(bySeverity('quarantined').sort()).toEqual([...groups.quarantined].sort())
    expect(bySeverity('co-over-range')).toEqual(groups['co-over-range'])
    const warned = new Set([...groups['sensor-warning'], ...groups['date-error']])
    expect(bySeverity('warning').sort()).toEqual([...warned].sort())
    expect(severityOf(row('P8').flags)).toBe('clean') // NASA's note, not a data problem
  })

  it('writes the reason chips from the raw cells', () => {
    expect(quarantineReason(row('P22b'))).toBe('Final O2 39.1%: impossible')
    expect(quarantineReason(row('T28b'))).toBe('Final O2 40.4%: impossible')
    expect(quarantineReason(row('B14'))).toBe('Final O2 not recorded')
    expect(quarantineReason(row('M5'))).toBeNull()
  })
})

describe('checked against NASA (SPEC F2, within 1 ppm)', () => {
  const checks = nasaChecks(rows)

  it('opposed slabs: median 367 ppm CO per 1% CO2 over 18 tests (NASA: about 370)', () => {
    expect(checks.opposedSlabs.n).toBe(18)
    expect(Math.abs((checks.opposedSlabs.median ?? 0) - 367)).toBeLessThan(1)
  })

  it('concurrent and stagnation rods: median 539 over 18 tests (NASA: concurrent rods about 550)', () => {
    expect(checks.concurrentAndStagnationRods.n).toBe(18)
    expect(Math.abs((checks.concurrentAndStagnationRods.median ?? 0) - 539)).toBeLessThan(1)
  })

  it('opposed rods: median 118, from 23 to 389, over 18 tests', () => {
    const s = checks.opposedRods
    expect(s.n).toBe(18)
    expect(Math.abs((s.median ?? 0) - 118)).toBeLessThan(1)
    expect(Math.abs((s.min ?? 0) - 23)).toBeLessThan(1)
    expect(Math.abs((s.max ?? 0) - 389)).toBeLessThan(1)
  })

  it('lowest final O2: 13.6% with confirmed burning (O4), 13.5% among usable rows (O12)', () => {
    expect(checks.lowestBurning).toEqual({ value: 13.6, testId: 'O4' })
    expect(checks.lowestUsable).toEqual({ value: 13.5, testId: 'O12' })
    expect(median([checks.lowestBurning?.value ?? 0])).toBe(getClaim('bass2.ign.survive-13.6')?.value)
  })
})

describe('CO per CO2, mean and median, from per-test-expected.json', () => {
  // NASA says "on average" and doesn't list which tests it averaged, so the panel shows both.
  // Expected values from the M3.1 brief; the fixture rounds coPerCo2 to 0.1, so within 0.05.
  const family = (entity: string) => (entity.startsWith('pmma-rod') ? 'rod' : entity.startsWith('pmma-slab') ? 'slab' : 'other')
  const fromFixture = (include: (t: PerTest) => boolean) => {
    const values = Object.values(perTest)
      .filter((t) => t.burnConfirmed && t.coPerCo2 !== null && include(t))
      .map((t) => t.coPerCo2 as number)
    return { n: values.length, median: median(values) ?? NaN, mean: values.reduce((a, b) => a + b, 0) / values.length }
  }
  const checks = nasaChecks(rows)
  const cases = [
    {
      name: 'opposed slabs',
      fixture: fromFixture((t) => family(t.entity) === 'slab' && t.flowConfig === 'Opposed'),
      ours: checks.opposedSlabs,
      expected: { n: 18, median: 366.7, mean: 398.4 },
    },
    {
      name: 'concurrent and stagnation rods',
      fixture: fromFixture((t) => family(t.entity) === 'rod' && (t.flowConfig === 'Concurrent' || t.flowConfig === 'Stagnation')),
      ours: checks.concurrentAndStagnationRods,
      expected: { n: 18, median: 539.1, mean: 487.9 },
    },
    {
      name: 'concurrent rods alone',
      fixture: fromFixture((t) => family(t.entity) === 'rod' && t.flowConfig === 'Concurrent'),
      ours: checks.concurrentRods,
      expected: { n: 9, median: 513.8, mean: 432.9 },
    },
    {
      name: 'stagnation rods alone',
      fixture: fromFixture((t) => family(t.entity) === 'rod' && t.flowConfig === 'Stagnation'),
      ours: checks.stagnationRods,
      expected: { n: 9, median: 550.0, mean: 543.0 },
    },
  ]

  for (const { name, fixture, ours, expected } of cases) {
    it(`${name}: median ${expected.median}, mean ${expected.mean} over ${expected.n} tests`, () => {
      expect(fixture.n).toBe(expected.n)
      expect(Math.abs(fixture.median - expected.median)).toBeLessThanOrEqual(0.05)
      expect(Math.abs(fixture.mean - expected.mean)).toBeLessThanOrEqual(0.05)
      // And the same from the raw CSV.
      expect(ours.n).toBe(expected.n)
      expect(Math.abs((ours.median ?? NaN) - fixture.median)).toBeLessThanOrEqual(0.05)
      expect(Math.abs((ours.mean ?? NaN) - fixture.mean)).toBeLessThanOrEqual(0.05)
    })
  }
})

describe('the SUMMARIZE headline, from audit.json alone', () => {
  it('7 of 129 set aside (5 impossible, 2 none), lowest confirmed burning 13.6% (O4)', () => {
    expect(auditHeadline(auditFile)).toEqual({
      setAside: 7,
      o2Impossible: 5,
      o2Missing: 2,
      total: 129,
      lowestBurning: { value: 13.6, testId: 'O4' },
    })
    // The set-aside rows are exactly the quarantine bay.
    expect(auditHeadline(auditFile).setAside).toBe(auditGroups(auditFile.testIds).quarantined.length)
  })
})

describe('the generated files', () => {
  it('public/data/bass2.json is up to date with the CSV (run npm run data:bass2)', () => {
    expect(bass2File.rows).toEqual(JSON.parse(JSON.stringify(rows)))
    expect(bass2File.model).toBeNull()
    expect(bass2File.promptVersion).toBeNull()
    expect(bass2File.generatedBy).toBe('pipeline/scripts/compile-bass2.ts')
  })

  it('public/data/audit.json matches the summary', () => {
    expect(auditFile.counts).toEqual(summary.counts)
    expect(auditFile.byPi).toEqual(summary.byPi)
    expect(auditFile.testIds).toEqual(summary.testIds)
    expect(auditFile.lowestBurningO2).toEqual(nasaChecks(rows).lowestBurning)
  })

  it('found every Appendix A flow quote on its page', () => {
    for (const [testId, evidence] of Object.entries(bass2File.flowEvidence)) {
      expect(evidence.quoteChecked, testId).toBe(evidence.quote !== null)
    }
  })
})

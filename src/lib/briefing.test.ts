import { describe, expect, it } from 'vitest'
import flowByTestJson from '../../docs/fixtures/flow-by-test.json'
import csvText from '../../pipeline/sources/PSI-25/PSI-25_Experimental table_BASS-II.csv?raw'
import { compileBass2, summarizeAudit, type FlowByTest } from './audit'
import { briefingStats, checkBriefing, MAX_SENTENCES, MIN_SENTENCES, sentenceProblem, statsNumbers } from './briefing'
import type { BriefingFile } from './generatedData'

const rows = compileBass2(csvText, flowByTestJson as FlowByTest)
const stats = briefingStats(rows, summarizeAudit(rows, { generatedBy: 'test', generatedAt: '' }))
const numbers = statsNumbers(stats)

describe('briefingStats', () => {
  it('holds the audit’s counts as the audit bar shows them', () => {
    expect(stats.tests).toBe(129)
    expect(stats.finalOxygenReadings).toEqual({ usable: 122, setAside: 7, physicallyImpossible: 5, missing: 2 })
    expect(stats.otherFlags).toEqual({ carbonMonoxideAboveSensorRange: 4, otherSensorWarnings: 18, dateErrors: 3 })
    expect(stats.burnConfirmedBySensors.tests).toBe(65)
    expect(stats.testsByFlowDirection).toEqual({ opposed: 67, concurrent: 38, stagnation: 15, 'not stated': 9 })
  })

  it('holds the statistics the "Checked against NASA" panel shows, rounded the same way', () => {
    expect(stats.initialOxygenPercent).toEqual({ lowest: 13.6, highest: 22.2 })
    expect(stats.lowestFinalOxygenWithConfirmedBurn).toEqual({ percent: 13.6, test: 'O4' })
    expect(stats.lowestUsableFinalOxygen).toEqual({ percent: 13.5, test: 'O12' })
    expect(stats.carbonMonoxidePerCarbonDioxide.opposedSlabs).toMatchObject({ tests: 18, median: 366.7, mean: 398.4 })
    expect(stats.carbonMonoxidePerCarbonDioxide.opposedRods).toMatchObject({ median: 118.1, lowest: 23.3, highest: 388.9 })
  })

  it('counts every test once by sample family and by principal investigator', () => {
    const sum = (record: Record<string, number>) => Object.values(record).reduce((a, b) => a + b, 0)
    expect(sum(stats.testsBySampleFamily)).toBe(129)
    expect(sum(stats.testsByPrincipalInvestigator)).toBe(129)
    expect(sum(stats.testsByFlowDirection)).toBe(129)
  })
})

describe('the number check (SPEC F2)', () => {
  it('reads numbers out of the stats, including those inside its text', () => {
    expect(numbers).toEqual(expect.arrayContaining([129, 122, 7, 13.6, 366.7, 0.2, 0.1]))
  })

  it('passes a sentence whose numbers are all in the stats, as written or rounded to fewer decimals', () => {
    expect(sentenceProblem('The table lists 129 BASS-II tests, and 122 have a usable final O2 reading.', numbers)).toBeNull()
    expect(sentenceProblem('Opposed PMMA slabs made a median of 367 ppm of CO per 1% of CO2 over 18 tests.', numbers)).toBeNull()
    expect(sentenceProblem('The lowest final O2 with a confirmed burn was 13.6% in test O4.', numbers)).toBeNull()
  })

  it('fails a number that isn’t in the stats, even a derived one', () => {
    expect(sentenceProblem('About 95% of the tests have a usable reading.', numbers)).toBe('has 95, which is not in the stats')
    expect(sentenceProblem('The table lists 130 tests.', numbers)).toBe('has 130, which is not in the stats')
    expect(sentenceProblem('Rods made 370 ppm.', numbers)).toBe('has 370, which is not in the stats')
  })

  it('fails a number written in words, which it couldn’t check', () => {
    expect(sentenceProblem('Seven readings were set aside.', numbers)).toMatch(/number in words \("Seven"\)/)
    expect(sentenceProblem('About half of the tests burned.', numbers)).toMatch(/number in words/)
  })

  it('fails the words CLAUDE.md rules out', () => {
    expect(sentenceProblem('PMMA rods are safe below 13.6% O2.', numbers)).toBe('says "safe"')
    expect(sentenceProblem('Flames burned at 13.6% O2 in space.', numbers)).toBe('says "in space"')
    expect(sentenceProblem('The audit found 7 of NASA’s errors.', numbers)).toBe('calls the anomalies NASA’s errors')
  })
})

describe('checkBriefing', () => {
  const good = [
    'NASA’s BASS-II table lists 129 tests.',
    'Our audit set aside 7 final O2 readings: 5 are physically impossible and 2 are missing.',
    'The sensors confirm a burn in 65 tests.',
    'The lowest final O2 with a confirmed burn was 13.6% in test O4.',
  ]

  it('keeps a briefing of 4 to 6 checked sentences', () => {
    expect(checkBriefing(good, stats)).toEqual({ sentences: good, dropped: [], ok: true })
    expect(MIN_SENTENCES).toBe(4)
    expect(checkBriefing([...good, ...good], stats).sentences).toHaveLength(MAX_SENTENCES)
  })

  it('drops a sentence that fails, and is no briefing with fewer than 4 left', () => {
    const check = checkBriefing([...good.slice(0, 3), 'About 50% of tests burned.', 42], stats)
    expect(check.sentences).toEqual(good.slice(0, 3))
    expect(check.dropped.map((d) => d.problem)).toEqual(['has 50, which is not in the stats', 'is empty'])
    expect(check.ok).toBe(false)
  })
})

// The generated file, when the pipeline has written it: the same check, in `npm test`.
const generated = import.meta.glob('../../public/data/briefing.json', { eager: true, import: 'default' })
const briefing = Object.values(generated)[0] as BriefingFile | undefined

describe.skipIf(!briefing)('public/data/briefing.json', () => {
  it('records how it was made (CLAUDE.md rule 11)', () => {
    expect(briefing?.generatedBy).toBe('pipeline/scripts/briefing.ts')
    expect(briefing?.model).toBeTruthy()
    expect(briefing?.promptVersion).toMatch(/^briefing@\d+$/)
  })

  it('has 4 to 6 sentences, and every number in them is in the stats', () => {
    const check = checkBriefing(briefing?.sentences ?? [], stats)
    expect(check.dropped).toEqual([])
    expect(check.ok).toBe(true)
    expect(check.sentences).toEqual(briefing?.sentences)
  })
})

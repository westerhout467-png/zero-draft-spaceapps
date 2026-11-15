import { describe, expect, it } from 'vitest'
import { findQuote, metadataForModel, verifyInvestigation } from './investigationVerify'
import type { TextPage } from './pages'

// A made-up PSI record in the real files' shape: "Key<TAB>value" lines, bare keys, a value that
// runs over two lines.
const LINES = [
  'STUDY',
  'Study Identifier\tPSI-00',
  'Study Title\tSpacecraft Fabric Fire Test',
  'Comment[Approach]\tThe test was performed on a Cygnus resupply vehicle after it left the ISS. The air flow velocity was 20 cm/s and the cabin held 21.5 - 21.7 percent oxygen at 1 atm.',
  'Comment[Flight Platform]\tInternational Space Station (ISS)',
  'Comment[Investigation Acronym]\tFABRIC-1',
  'Comment[Objective]\t"The objectives were to:',
  '(1) see how fast a large fire grows and (2) compare limits with the ground test."',
  'Study Person Email\tsomeone@example.gov',
  'Study Factor Name',
  'Comment[Mission Start]\t',
]
const page: TextPage = { file: 'i_Investigation.txt', page: 1, reportPage: null, text: LINES.join('\n'), lines: LINES }
const ev = (quote: string) => [{ file: 'i_Investigation.txt', page: 1, quote }]
const field = (value: unknown, quote: string) => ({ value, evidence: ev(quote) })

const GOOD = {
  id: 'PSI-00',
  acronym: field('FABRIC-1', 'FABRIC-1'),
  title: field('Spacecraft Fabric Fire Test', 'Spacecraft Fabric Fire Test'),
  platform: field('Cygnus resupply vehicle', 'The test was performed on a Cygnus resupply vehicle after it left the ISS.'),
  o2Range: field({ min: 21.5, max: 21.7, unit: '% by volume' }, 'the cabin held 21.5 - 21.7 percent oxygen at 1 atm'),
  pressureRange: field({ min: 1, max: 1, unit: 'atm' }, 'the cabin held 21.5 - 21.7 percent oxygen at 1 atm'),
  flowRange: field({ min: 20, max: 20, unit: 'cm/s' }, 'The air flow velocity was 20 cm/s'),
  summary: [
    { text: 'A fabric fire test ran on a Cygnus cargo ship after it left the ISS.', evidence: ev('The test was performed on a Cygnus resupply vehicle after it left the ISS.') },
    { text: 'Air moved over the sample at 20 cm/s.', evidence: ev('The air flow velocity was 20 cm/s') },
  ],
}

describe('findQuote', () => {
  it('finds a quote in the text and records its line, whatever page the model named', () => {
    expect(findQuote([page], 'The air flow velocity was 20 cm/s', 'wrong.txt', 7)).toEqual({
      file: 'i_Investigation.txt',
      page: 1,
      reportPage: null,
      line: 4,
      quote: 'The air flow velocity was 20 cm/s',
    })
  })

  it('finds a quote that runs over two lines, with no single line to give', () => {
    const found = findQuote([page], 'The objectives were to: (1) see how fast a large fire grows')
    expect(found?.line).toBeNull()
    expect(found?.page).toBe(1)
  })

  it('returns null for words that aren’t there', () => {
    expect(findQuote([page], 'The air flow velocity was 30 cm/s')).toBeNull()
    expect(findQuote([page], '   ')).toBeNull()
  })
})

describe('verifyInvestigation', () => {
  it('keeps every field of an honest extraction, and converts units only afterwards', () => {
    const { summary, failures } = verifyInvestigation('PSI-00', [page], GOOD)
    expect(failures).toEqual([])
    expect(summary.acronym.value).toBe('FABRIC-1')
    expect(summary.platform.value).toBe('Cygnus resupply vehicle')
    expect(summary.platform.evidence[0].line).toBe(4)
    expect(summary.o2Pct.value).toEqual({ min: 21.5, max: 21.7 })
    expect(summary.pressure.value).toEqual({ min: 1, max: 1, unit: 'atm', psia: { min: 14.696, max: 14.696 } })
    expect(summary.flow.value).toEqual({ min: 20, max: 20, unit: 'cm/s', cmS: { min: 20, max: 20 } })
    expect(summary.summary.map((s) => s.text)).toEqual(GOOD.summary.map((s) => s.text))
  })

  it('converts kPa and mm/s as SPEC §7.2 says', () => {
    const lines = ['Comment[Approach]\tTests ran at 101.3 kPa with a flow of 200 mm/s over the sample.']
    const kpa: TextPage = { file: 'i_Investigation.txt', page: 1, reportPage: null, text: lines[0], lines }
    const { summary } = verifyInvestigation('PSI-01', [kpa], {
      pressureRange: field({ min: 101.3, max: 101.3, unit: 'kPa' }, 'Tests ran at 101.3 kPa with a flow of 200 mm/s'),
      flowRange: field({ min: 200, max: 200, unit: 'mm/s' }, 'Tests ran at 101.3 kPa with a flow of 200 mm/s'),
      summary: [],
    })
    expect(summary.pressure.value?.psia.min).toBeCloseTo(101.3 / 6.895, 9)
    expect(summary.flow.value?.cmS).toEqual({ min: 20, max: 20 })
  })

  it('treats a null field as not stated, without calling it a failure', () => {
    const { summary, failures } = verifyInvestigation('PSI-00', [page], { ...GOOD, pressureRange: { value: null, evidence: [] } })
    expect(summary.pressure).toEqual({ value: null, evidence: [] })
    expect(failures).toEqual([])
  })

  it('nulls a field whose quote isn’t in the text, and says so', () => {
    const { summary, failures } = verifyInvestigation('PSI-00', [page], {
      ...GOOD,
      flowRange: field({ min: 30, max: 30, unit: 'cm/s' }, 'The air flow velocity was 30 cm/s'),
    })
    expect(summary.flow.value).toBeNull()
    expect(failures).toEqual([expect.objectContaining({ id: 'PSI-00', field: 'flowRange', reason: 'no quote was found in the source' })])
  })

  it('nulls a range whose only quote is under 3 words, and says that, not that it wasn’t found', () => {
    const { summary, failures } = verifyInvestigation('PSI-00', [page], {
      ...GOOD,
      flowRange: field({ min: 20, max: 20, unit: 'cm/s' }, '20 cm/s'),
    })
    expect(summary.flow.value).toBeNull()
    expect(failures[0]).toMatchObject({ field: 'flowRange', reason: 'its quote “20 cm/s” is under 3 words, too short to prove a number' })
  })

  it('nulls a range whose number isn’t in its quotes, even if the quote is real', () => {
    const { summary, failures } = verifyInvestigation('PSI-00', [page], {
      ...GOOD,
      o2Range: field({ min: 21, max: 34, unit: '% by volume' }, 'the cabin held 21.5 - 21.7 percent oxygen at 1 atm'),
    })
    expect(summary.o2Pct.value).toBeNull()
    expect(failures[0]).toMatchObject({ field: 'o2Range', reason: '21 is not in any of its quotes' })
  })

  it('nulls a text value that isn’t inside its quote, a unit it doesn’t know, and an upside-down range', () => {
    const { summary, failures } = verifyInvestigation('PSI-00', [page], {
      ...GOOD,
      platform: field('A drop tower', 'The test was performed on a Cygnus resupply vehicle after it left the ISS.'),
      pressureRange: field({ min: 1, max: 1, unit: 'bar' }, 'the cabin held 21.5 - 21.7 percent oxygen at 1 atm'),
      o2Range: field({ min: 21.7, max: 21.5, unit: '% by volume' }, 'the cabin held 21.5 - 21.7 percent oxygen at 1 atm'),
    })
    expect(summary.platform.value).toBeNull()
    expect(summary.pressure.value).toBeNull()
    expect(summary.o2Pct.value).toBeNull()
    expect(failures.map((f) => f.field).sort()).toEqual(['o2Range', 'platform', 'pressureRange'])
  })

  it('leaves out a summary sentence with no real quote, or with a number its quotes don’t have', () => {
    const { summary, failures } = verifyInvestigation('PSI-00', [page], {
      ...GOOD,
      summary: [
        GOOD.summary[0],
        { text: 'It burned for 420 seconds.', evidence: ev('The air flow velocity was 20 cm/s') },
        { text: 'It was a groundbreaking test.', evidence: ev('It was a groundbreaking test') },
        { text: 'No quote at all.', evidence: [] },
      ],
    })
    // Only the first three sentences are read (the prompt allows 2 or 3).
    expect(summary.summary.map((s) => s.text)).toEqual([GOOD.summary[0].text])
    expect(failures.map((f) => `${f.field}: ${f.reason}`)).toEqual([
      'summary[2]: 420 is not in any of the sentence’s quotes',
      'summary[3]: no quote was found in the source',
    ])
  })

  it('survives a reply that isn’t the shape asked for', () => {
    const { summary, failures } = verifyInvestigation('PSI-00', [page], 'not json')
    expect(summary.summary).toEqual([])
    expect(summary.title.value).toBeNull()
    expect(failures.map((f) => f.field)).toEqual(['(whole reply)', 'summary'])
  })
})

describe('metadataForModel', () => {
  it('keeps the lines with a value and continuation lines; drops bare keys, headers and people’s details', () => {
    expect(metadataForModel(page).split('\n')).toEqual([
      'Study Identifier\tPSI-00',
      'Study Title\tSpacecraft Fabric Fire Test',
      LINES[3],
      'Comment[Flight Platform]\tInternational Space Station (ISS)',
      'Comment[Investigation Acronym]\tFABRIC-1',
      'Comment[Objective]\tThe objectives were to:',
      '(1) see how fast a large fire grows and (2) compare limits with the ground test.',
    ])
  })
})

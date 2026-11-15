import { describe, expect, it } from 'vitest'
import pagesJson from '../../pipeline/text/PSI-25.pages.json'
import flowByTestJson from '../../docs/fixtures/flow-by-test.json'
import csvText from '../../pipeline/sources/PSI-25/PSI-25_Experimental table_BASS-II.csv?raw'
import { compileBass2, type FlowByTest } from './audit'
import type { TestOutcomesFile } from './generatedData'
import {
  assembleOutcomes,
  checkOutcome,
  checkPage,
  MAX_QUOTE_WORDS,
  NOT_STATED_REASONS,
  notesOf,
  outcomeFindings,
  outcomeView,
  OUTCOMES,
  splitRows,
} from './outcomes'
import type { PagesFile } from './pages'

// A made-up page in Appendix A's shape: date, as-run number, test id, sample number, settings, notes.
const PAGE =
  'TABLE X Test observations 7/8/14 GMT 189 66 A1 217m 9.525-mm clear rod 250 F2 1,000 Cont 6 13.6 13.5 ' +
  'No flame at any flow, repeat of A2 test 7/9/14 GMT 190 67 A2 39M wax candle F2 1,600 7 s 3 17.4 ' +
  'Blue flame established at 3 cm/s then quenched 7/9/14 GMT 190 68 A3 12 fabric F4 1,000 Cont 4 Camera cable came loose aFootnote.'
const IDS = ['A1', 'A2', 'A3', 'F2', 'F4', 'A9']

describe('splitRows', () => {
  const rows = splitRows(PAGE, IDS)

  it('opens a row where a test id is followed by its sample number, in page order', () => {
    expect(rows.map((row) => row.testId)).toEqual(['A1', 'A2', 'A3'])
    expect(rows[0].text.startsWith('A1 217m 9.525-mm clear rod')).toBe(true)
    expect(rows[0].text).toContain('No flame at any flow')
    expect(rows[0].text).not.toContain('Blue flame')
  })

  it('doesn’t take the camera’s F-stop, or an id inside another test’s notes, for a row', () => {
    // "F2 1,000 Cont", "F2 1,600 7 s" and "F4 1,000 Cont" are camera settings; "A2 test" is a mention.
    expect(rows.some((row) => row.testId === 'F2' || row.testId === 'F4')).toBe(false)
    expect(rows.filter((row) => row.testId === 'A2')).toHaveLength(1)
    expect(rows[1].text.startsWith('A2 39M wax candle')).toBe(true)
  })

  it('leaves out a test that isn’t on the page, or that opens two rows', () => {
    expect(rows.some((row) => row.testId === 'A9')).toBe(false)
    expect(splitRows('5 A1 10 rod burned 6 A1 11 rod burned again', ['A1'])).toEqual([])
  })
})

describe('notesOf', () => {
  const rows = splitRows(PAGE, IDS)
  const row = (text: string) => ({ testId: 'A1', start: 0, text })

  it('keeps what follows the row’s last run of eight or more readings', () => {
    const full = row('A1 217m rod 250 ---- NA F2 1,000 Cont 6 52 13.6 13.5 12.7 12.6 1.72 1.71 +OR +OR No flame at any flow 7/9/14 GMT 190 67')
    expect(notesOf(full)).toBe('No flame at any flow 7/9/14 GMT 190 67')
    const blanks = row('A1 39M wax F2 1,600 7 s 3 46 21.7 0.9 20.8 ------ 0.36 ------ 2 --- Brief flash, then out')
    expect(notesOf(blanks)).toBe('Brief flash, then out')
    const over = row('A1 12 rod Cont 17 6 14.6 14.4 13.6 13.4 1.85 2.09 950 Over Only stayed lit for a minute')
    expect(notesOf(over)).toBe('Only stayed lit for a minute')
  })

  it('returns the whole row when it can’t find the readings, and drops the table’s footnotes', () => {
    // The made-up page has fewer than eight readings in a row.
    expect(notesOf(rows[0])).toBe(rows[0].text)
    const last = row('A1 12 fabric F4 1,000 Cont 4 Camera cable came loose aGreenwich Mean Time. bContinuous high (CH).')
    expect(notesOf(last)).toBe('A1 12 fabric F4 1,000 Cont 4 Camera cable came loose')
    const odd = row('A1 215M rod Cont 9 303 17.4 16.8 16.3 15.7 0.51 failed 33 79 Very low velocity test')
    expect(notesOf(odd)).toBe(odd.text)
  })
})

describe('outcomeView', () => {
  const place = { pdfPage: 118, reportPage: 110 }

  it('gives a read outcome its quote and the page its row is on', () => {
    expect(outcomeView({ testId: 'O12', outcome: 'no-ignition', quote: 'No sustained flame at any flow' }, place)).toEqual({
      outcome: 'no-ignition',
      quote: 'No sustained flame at any flow',
      reason: null,
      place,
    })
  })

  it('says why an outcome isn’t stated: no row in Appendix A, or a note that doesn’t describe the flame', () => {
    const none = { testId: 'O20', outcome: 'not-stated' as const, quote: null }
    expect(outcomeView(none, { pdfPage: null, reportPage: null }).reason).toBe('Not in Appendix A')
    expect(outcomeView(none, undefined).reason).toBe(NOT_STATED_REASONS['no-row'])
    expect(outcomeView({ ...none, testId: 'B2' }, place)).toEqual({
      outcome: 'not-stated',
      quote: null,
      reason: 'NASA’s note doesn’t describe the flame',
      place: null,
    })
  })

  it('never shows an outcome without its quote', () => {
    expect(outcomeView({ testId: 'B1', outcome: 'sustained', quote: null }, place).outcome).toBe('not-stated')
  })
})

describe('outcomeFindings', () => {
  const rows = compileBass2(csvText, flowByTestJson as FlowByTest)
  const row = (testId: string) => rows.find((r) => r.testId === testId)!

  it('counts from the rows and the outcomes: sensors, notes, and the SIBAL tests too small for the sensors', () => {
    // O4: sensors confirm, notes brief (a disagreement). T16: SIBAL, too small, notes sustained (the other one).
    const findings = outcomeFindings(rows, [
      { testId: 'O4', outcome: 'brief', quote: 'q' },
      { testId: 'T16', outcome: 'sustained', quote: 'q' },
      { testId: 'M5', outcome: 'sustained', quote: 'q' },
    ])
    expect(row('O4').burnConfirmed && row('M5').burnConfirmed && !row('T16').burnConfirmed).toBe(true)
    expect(findings.burnConfirmed).toBe(65)
    expect(findings.sustained).toBe(2)
    // 27 SIBAL tests, 2 of them quarantined (their readings are unusable, so "not checked").
    expect(findings.tooSmall).toBe(25)
    expect(findings.tooSmallSustained).toBe(1)
    expect(findings.sensorsYesNotesNo).toEqual(['O4'])
    expect(findings.notesYesSensorsNo).toEqual(['T16'])
  })

  it('reports an empty direction as empty, and treats a missing outcome as not stated', () => {
    const findings = outcomeFindings(rows, [])
    expect(findings.sustained).toBe(0)
    expect(findings.sensorsYesNotesNo).toEqual([])
    expect(findings.notesYesSensorsNo).toEqual([])
  })
})

describe('checkOutcome', () => {
  const [a1, a2, a3] = splitRows(PAGE, IDS)

  it('keeps an outcome whose quote is in its own row, normalized', () => {
    expect(checkOutcome({ testId: 'A2', outcome: 'sustained', quote: '  Blue flame established  at 3 cm/s ' }, a2)).toEqual({
      outcome: { testId: 'A2', outcome: 'sustained', quote: 'Blue flame established at 3 cm/s' },
      failure: null,
    })
  })

  it('turns a quote from the next row into not-stated, even though it is on the page', () => {
    expect(checkOutcome({ testId: 'A1', outcome: 'sustained', quote: 'Blue flame established at 3 cm/s' }, a1)).toEqual({
      outcome: { testId: 'A1', outcome: 'not-stated', quote: null },
      failure: 'quote-not-in-row',
    })
  })

  it('refuses a made-up quote, a missing one, one over 15 words, and an outcome that isn’t one of the four', () => {
    expect(checkOutcome({ testId: 'A1', outcome: 'no-ignition', quote: 'It did not ignite' }, a1).failure).toBe('quote-not-in-row')
    expect(checkOutcome({ testId: 'A1', outcome: 'no-ignition', quote: '' }, a1).failure).toBe('no-quote')
    const long = a1.text.slice(a1.testId.length).trim()
    expect(long.split(' ').length).toBeGreaterThan(MAX_QUOTE_WORDS)
    expect(checkOutcome({ testId: 'A1', outcome: 'no-ignition', quote: long }, a1).failure).toBe('quote-too-long')
    expect(checkOutcome({ testId: 'A1', outcome: 'burned', quote: 'No flame at any flow' }, a1).failure).toBe('bad-outcome')
    expect(checkOutcome({ testId: 'A2', outcome: 'sustained', quote: 'No flame at any flow' }, a1).failure).toBe('unknown-test')
  })

  it('won’t accept the test’s own id as the quote’s proof: the quote must come after it', () => {
    expect(checkOutcome({ testId: 'A3', outcome: 'sustained', quote: 'A3 12 fabric' }, a3).failure).toBe('quote-not-in-row')
  })

  it('takes not-stated as given, with no quote', () => {
    expect(checkOutcome({ testId: 'A3', outcome: 'not-stated', quote: 'Camera cable came loose' }, a3)).toEqual({
      outcome: { testId: 'A3', outcome: 'not-stated', quote: null },
      failure: null,
    })
  })
})

describe('checkPage and assembleOutcomes', () => {
  const rows = splitRows(PAGE, IDS)

  it('gives every row one outcome: a skipped or doubled row is not-stated', () => {
    const { outcomes, failures } = checkPage(rows, [
      { testId: 'A1', outcome: 'no-ignition', quote: 'No flame at any flow' },
      { testId: 'A3', outcome: 'not-stated', quote: '' },
      { testId: 'A3', outcome: 'sustained', quote: 'Camera cable came loose' },
      { testId: 'Z9', outcome: 'sustained', quote: 'x' },
    ])
    expect(outcomes).toEqual([
      { testId: 'A1', outcome: 'no-ignition', quote: 'No flame at any flow' },
      { testId: 'A2', outcome: 'not-stated', quote: null },
      { testId: 'A3', outcome: 'not-stated', quote: null },
    ])
    expect(failures.map((f) => f.testId)).toEqual(['A2', 'A3'])
  })

  it('lists every test once, in the given order, with not-stated for a test that has no row', () => {
    const all = assembleOutcomes(['A9', 'A1'], [{ testId: 'A1', outcome: 'brief', quote: 'q' }])
    expect(all).toEqual([
      { testId: 'A9', outcome: 'not-stated', quote: null },
      { testId: 'A1', outcome: 'brief', quote: 'q' },
    ])
  })
})

// The generated file, checked again here against the report's own pages (SPEC F2b, §7.2). It
// isn't in the repository until the reader's results pass these checks (O4 and F2 among them),
// so the block runs only when the file exists.
const generated = import.meta.glob('../../public/data/test-outcomes.json', { eager: true, import: 'default' })
const outcomesFile = Object.values(generated)[0] as TestOutcomesFile | undefined

describe.skipIf(!outcomesFile)('public/data/test-outcomes.json', () => {
  const file = outcomesFile as TestOutcomesFile
  const rows = compileBass2(csvText, flowByTestJson as FlowByTest)
  const testIds = rows.map((row) => row.testId)
  const appendix = (pagesJson as PagesFile).pages.filter((page) => page.page >= 111 && page.page <= 121)
  const appendixRows = appendix.flatMap((page) => splitRows(page.text, testIds))
  const of = (testId: string) => file.outcomes.find((o) => o.testId === testId)

  it('records how it was made (CLAUDE.md rule 11)', () => {
    expect(file.generatedBy).toBe('pipeline/scripts/outcomes.ts')
    expect(file.model).toBeTruthy()
    expect(file.promptVersion).toMatch(/^read-outcomes@\d+$/)
  })

  it('has exactly one entry for each of the 129 tests', () => {
    expect(file.outcomes).toHaveLength(129)
    expect(file.outcomes.map((o) => o.testId)).toEqual(testIds)
  })

  it('reads O12 as no ignition, and F3 and T28a as brief ignition only', () => {
    expect(of('O12')?.outcome).toBe('no-ignition')
    expect(of('O12')?.quote).toContain('No sustained flame at any flow')
    expect(of('F3')?.outcome).toBe('brief')
    expect(of('F3')?.quote).toContain('Brief ignition flash')
    expect(of('T28a')?.outcome).toBe('brief')
  })

  it('reads F2’s "flame would not sustain" as brief: a flame appeared and went out', () => {
    expect(of('F2')?.outcome).toBe('brief')
    expect(of('F2')?.quote).toContain('would not sustain')
  })

  it('reads O4, the lowest-O2 confirmed burn, as a sustained flame quenched by lowering the flow', () => {
    expect(of('O4')?.outcome).toBe('sustained')
  })

  it('holds only quotes that are in their own test’s row of Appendix A, 15 words at most', () => {
    expect(appendixRows).toHaveLength(126)
    for (const outcome of file.outcomes) {
      expect(OUTCOMES).toContain(outcome.outcome)
      if (outcome.outcome === 'not-stated') {
        expect(outcome.quote, outcome.testId).toBeNull()
        continue
      }
      const row = appendixRows.find((r) => r.testId === outcome.testId)
      expect(row, `${outcome.testId} has a row`).toBeDefined()
      expect(checkOutcome({ ...outcome }, row!).failure, `${outcome.testId}: ${outcome.quote}`).toBeNull()
    }
  })

  it('gives the model only the notes: 125 of the 126 rows trim to them, and no note loses its quote', () => {
    const trimmed = appendixRows.filter((row) => notesOf(row).length < row.text.length - 40)
    expect(trimmed.length).toBeGreaterThanOrEqual(125)
    for (const outcome of file.outcomes) {
      if (!outcome.quote) continue
      const row = appendixRows.find((r) => r.testId === outcome.testId)!
      expect(notesOf(row), outcome.testId).toContain(outcome.quote)
    }
  })

  it('finds each quote on the page the record cites for it (the flow evidence’s Appendix A page)', () => {
    const evidence = flowByTestJson as Record<string, { pdfPage: number | null }>
    for (const page of appendix) {
      for (const row of splitRows(page.text, testIds)) expect(evidence[row.testId].pdfPage, row.testId).toBe(page.page)
    }
    const inAppendix = testIds.filter((id) => evidence[id].pdfPage !== null)
    expect(inAppendix).toHaveLength(126)
  })

  it('calls a test not stated only when the model did: no failed quote check hides behind that label', () => {
    // The views say "NASA’s note doesn’t describe the flame" for these, so it has to be the
    // reader's own verdict. The kept raw replies say what the reader answered, page by page.
    const raws = import.meta.glob('../../pipeline/out/raw/outcomes-*.json', { eager: true, import: 'default' }) as Record<
      string,
      { promptVersion: string; model: string; text: string }
    >
    const answers = new Map<string, string[]>()
    for (const raw of Object.values(raws)) {
      // Only the replies this file was built from: the same prompt version, by the same model.
      if (raw.promptVersion !== file.promptVersion || raw.model !== file.model) continue
      for (const o of (JSON.parse(raw.text) as { outcomes: { testId: string; outcome: string }[] }).outcomes) {
        answers.set(o.testId, [...(answers.get(o.testId) ?? []), o.outcome])
      }
    }
    for (const outcome of file.outcomes) {
      if (outcome.outcome !== 'not-stated' || !appendixRows.some((row) => row.testId === outcome.testId)) continue
      expect(answers.get(outcome.testId), outcome.testId).toContain('not-stated')
    }
  })

  it('finds what the header says: sustained flames among tests the sensors couldn’t confirm', () => {
    const findings = outcomeFindings(rows, file.outcomes)
    expect(findings.burnConfirmed).toBe(65)
    expect(findings.sustained).toBe(file.outcomes.filter((o) => o.outcome === 'sustained').length)
    expect(findings.tooSmall).toBe(25)
    expect(findings.tooSmallSustained).toBeGreaterThan(0)
    expect(findings.tooSmallSustained).toBeLessThanOrEqual(findings.tooSmall)
    // Each list is one side of a disagreement, so no test is in both.
    expect(findings.sensorsYesNotesNo.filter((id) => findings.notesYesSensorsNo.includes(id))).toEqual([])
    for (const id of findings.sensorsYesNotesNo) expect(['brief', 'no-ignition']).toContain(of(id)?.outcome)
    for (const id of findings.notesYesSensorsNo) expect(of(id)?.outcome).toBe('sustained')
  })

  it('leaves the three 2016 tests, which aren’t in the appendix, not stated', () => {
    for (const id of ['O20', 'O21', 'O22']) expect(of(id)).toEqual({ testId: id, outcome: 'not-stated', quote: null })
  })
})

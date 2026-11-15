import { describe, expect, it } from 'vitest'
import { checkAnswer, isTraceable, MAX_SENTENCES, numbersIn, type RawAnswer } from './answerCheck'
import type { ToolResult } from './labProtocol'
import type { Chunk } from './retrieve'

const REPORT_P52: Chunk = {
  id: 'c0220',
  sourceId: 'nasa-tm-20210011385',
  pdfPage: 60,
  reportPage: 52,
  text:
    'the concurrent rod geometry that persist much longer in microgravity than in normal gravity due to the lower ' +
    'rate of convective cooling of the rod. This suggests that spacecraft fire suppression efforts should be ' +
    'maintained until the burning material has cooled and stopped emitting vapors.',
}
const REPORT_P8: Chunk = {
  id: 'c0036',
  sourceId: 'nasa-tm-20210011385',
  pdfPage: 16,
  reportPage: 8,
  text: 'the CO levels in the lab would only be 1.5 ppm, well below spacecraft maximum allowable concentration (SMAC) values',
}
const FLEX: Chunk = {
  id: 'c0588',
  sourceId: 'psi-69',
  file: 'i_Investigation.txt',
  line: 40,
  lineEnd: 42,
  lines: [
    [40, 0],
    [41, 27],
    [42, 44],
  ],
  text: 'Approach: The FLEX tests. Objectives: none. 1. Select the test pressure (0.5 - 1.5 atm) for the LOI tests.',
}
const ZAYAC: Chunk = {
  id: 'c0556',
  sourceId: 'zayac-2024',
  pdfPage: 1,
  reportPage: null,
  text: 'Upward flame images in 34% oxygen, 8.2 psi appear dimmer because the camera adjusts to the extreme brightness of the soot.',
}
const CABIN: ToolResult = {
  id: 'tool#1',
  name: 'run_cabin_preset',
  args: { preset: 'm5' },
  view: 'interpret',
  opensView: true,
  summary: 'ran Replay Test M5',
  fields: [
    { key: 'coPeakPpm', label: 'Highest CO, ppm (model)', value: 986.7, claimId: 'cabin.model' },
    { key: 'volumeM3', label: 'Volume, m³', value: 0.25, claimId: 'bass2.cstr.volume' },
    { key: 'smac55', label: '1-hour SMAC', value: 'Above the 1-hour SMAC (55 ppm) at T+01:31' },
  ],
  claimIds: ['cabin.model'],
}
const BROKEN: ToolResult = { ...CABIN, id: 'tool#2', error: 'Unknown preset', fields: [{ key: 'x', label: 'x', value: 7 }] }

const SHORT: Record<string, string> = { 'nasa-tm-20210011385': 'BASS-II report', 'psi-69': 'PSI-69', 'zayac-2024': 'Zayac 2024' }
const check = (answer: RawAnswer) =>
  checkAnswer({ answer, chunks: [REPORT_P52, REPORT_P8, FLEX, ZAYAC], tools: [CABIN, BROKEN], shortName: (id) => SHORT[id] })

const SUPPRESS = 'suppression efforts should be maintained until the burning material has cooled'

describe('numbersIn', () => {
  it('reads quantities, with thousands separators removed', () => {
    expect(numbersIn('CO reached 1,029 ppm in 27.2 min')).toEqual(['1029', '27.2'])
  })

  it('skips test ids, chemical formulas, references, pages, units and 1g', () => {
    expect(numbersIn('Test M5 burned in 0.25 m3; CO2 rose 2.78%')).toEqual(['0.25', '2.78'])
    expect(numbersIn('Eq. 6.1 gives 13.61% at 2 cm/s (Fig. 6.3, p. 75)')).toEqual(['13.61', '2'])
    expect(numbersIn('O4 burned to 13.6% O2, P22b read 39.1%')).toEqual(['13.6', '39.1'])
    expect(numbersIn('NASA Test 1 (NASA-STD-6001) gives the igniter 25 s')).toEqual(['25'])
    expect(numbersIn('a stretch rate of 9.44 s-1 in 1g with 4 cm/s')).toEqual(['9.44', '4'])
    expect(numbersIn('PSI-69 lists Table A.5 and Section 6.1.5.3')).toEqual([])
    // A source's name, as the chips write it, isn't a quantity; a bare year still is.
    expect(numbersIn('The Zayac 2024 poster and Olson & Ferkul 2017 agree; tests ran in 2014')).toEqual(['2014'])
  })
})

describe('isTraceable', () => {
  it('accepts a value as written, or rounded to fewer decimals', () => {
    expect(isTraceable('986.7', [986.7])).toBe(true)
    expect(isTraceable('987', [986.7])).toBe(true)
    expect(isTraceable('13.61', [13.6107])).toBe(true)
  })

  it('rejects a value that is not one of them', () => {
    expect(isTraceable('990', [986.7])).toBe(false)
    expect(isTraceable('1000', [986.7])).toBe(false)
    expect(isTraceable('1200', [986.7, 55])).toBe(false)
  })
})

describe('checkAnswer', () => {
  it('keeps a sentence whose quote is in its passage, and says where the passage is', () => {
    const out = check({
      sentences: [
        { text: `The report suggests ${SUPPRESS}.`, support: [{ chunkId: 'c0220', quote: SUPPRESS }] },
      ],
    })
    expect(out.refused).toBe(false)
    expect(out.dropped).toEqual([])
    expect(out.sentences[0].supports[0]).toMatchObject({
      kind: 'quote',
      chunkId: 'c0220',
      place: 'BASS-II report, p. 52',
      pdfPage: 60,
      reportPage: 52,
    })
  })

  it('strips a sentence with a fake quote', () => {
    const out = check({
      sentences: [
        { text: `The report suggests ${SUPPRESS}.`, support: [{ chunkId: 'c0220', quote: SUPPRESS }] },
        {
          text: 'Suppression must last at least an hour.',
          support: [{ chunkId: 'c0220', quote: 'suppression must last at least one hour' }],
        },
      ],
    })
    expect(out.sentences).toHaveLength(1)
    expect(out.dropped).toEqual([{ text: 'Suppression must last at least an hour.', reason: 'quote-not-found' }])
  })

  it('strips a sentence with a number it can’t trace, and keeps one it can', () => {
    const out = check({
      sentences: [
        { text: 'In the model, CO peaks near 987 ppm.', support: [{ tool: 'tool#1.coPeakPpm' }] },
        { text: 'In the model, CO peaks at 1,200 ppm.', support: [{ tool: 'tool#1.coPeakPpm' }] },
        { text: 'The report puts the US Lab at 1.5 ppm.', support: [{ chunkId: 'c0036', quote: 'would only be 1.5 ppm' }] },
      ],
    })
    expect(out.sentences.map((s) => s.text)).toEqual([
      'In the model, CO peaks near 987 ppm.',
      'The report puts the US Lab at 1.5 ppm.',
    ])
    expect(out.dropped).toEqual([{ text: 'In the model, CO peaks at 1,200 ppm.', reason: 'untraceable-number' }])
  })

  it('takes numbers only from the value a sentence cites, not the whole tool', () => {
    // 0.25 is in tool#1, but the sentence cites only coPeakPpm.
    const out = check({ sentences: [{ text: 'The glovebox holds 0.25 m3.', support: [{ tool: 'tool#1.coPeakPpm' }] }] })
    expect(out.dropped[0].reason).toBe('untraceable-number')
    const whole = check({ sentences: [{ text: 'The glovebox holds 0.25 m3.', support: [{ tool: 'tool#1' }] }] })
    expect(whole.sentences).toHaveLength(1)
  })

  it('finds numbers inside a tool’s text values', () => {
    const out = check({
      sentences: [{ text: 'It passes the 1-hour limit of 55 ppm at T+01:31.', support: [{ tool: 'tool#1.smac55' }] }],
    })
    expect(out.sentences).toHaveLength(1)
    expect(out.sentences[0].supports[0]).toEqual({
      kind: 'tool',
      ref: 'tool#1.smac55',
      label: '1-hour SMAC',
      claimId: 'cabin.model',
    })
  })

  it('drops sentences that cite nothing, a passage it wasn’t given, too short a quote, or no such result', () => {
    const out = check({
      sentences: [
        { text: 'BASS-II was a great experiment.', support: [] },
        { text: 'Something else.', support: [{ chunkId: 'c9999', quote: 'not in the retrieved chunks at all' }] },
        { text: 'It cooled.', support: [{ chunkId: 'c0220', quote: 'has cooled' }] },
        { text: 'The run ended.', support: [{ tool: 'tool#7' }] },
        { text: 'The broken call made 7.', support: [{ tool: 'tool#2' }] },
      ],
    })
    expect(out.dropped.map((d) => d.reason)).toEqual([
      'no-support',
      'unknown-chunk',
      'short-quote',
      'unknown-tool-result',
      'unknown-tool-result',
    ])
    expect(out.refused).toBe(true)
  })

  it('drops orders to the crew, but keeps the report’s advice reported as the report’s', () => {
    const out = check({
      sentences: [
        { text: 'Astronauts should keep suppressing until it cools.', support: [{ chunkId: 'c0220', quote: SUPPRESS }] },
        { text: 'Keep suppressing until it cools.', support: [{ chunkId: 'c0220', quote: SUPPRESS }] },
        { text: `The report suggests ${SUPPRESS}.`, support: [{ chunkId: 'c0220', quote: SUPPRESS }] },
      ],
    })
    expect(out.dropped.map((d) => d.reason)).toEqual(['order', 'order'])
    expect(out.sentences).toHaveLength(1)
  })

  it('drops a sentence that credits BASS-II or the report with another source’s words', () => {
    const zayacQuote = 'Upward flame images in 34% oxygen, 8.2 psi appear dimmer'
    const out = check({
      sentences: [
        // The mistake a weaker model made: the Zayac poster's 1g tests, credited to BASS-II.
        { text: 'In BASS-II tests, flames in 34% oxygen at 8.2 psi appear dimmer.', support: [{ chunkId: 'c0556', quote: zayacQuote }] },
        { text: 'The report says FLEX ran from 0.5 to 1.5 atm.', support: [{ chunkId: 'c0588', quote: 'Select the test pressure (0.5 - 1.5 atm)' }] },
        { text: 'The Zayac poster shows flames in 34% oxygen at 8.2 psi appear dimmer.', support: [{ chunkId: 'c0556', quote: zayacQuote }] },
        { text: 'In BASS-II tests the model gives 987 ppm.', support: [{ tool: 'tool#1.coPeakPpm' }] },
      ],
    })
    expect(out.dropped.map((d) => d.reason)).toEqual(['misattributed', 'misattributed'])
    expect(out.sentences.map((s) => s.text)).toEqual([
      'The Zayac poster shows flames in 34% oxygen at 8.2 psi appear dimmer.',
      'In BASS-II tests the model gives 987 ppm.',
    ])
  })

  it('removes citations a model copied into the sentence, then checks it as usual', () => {
    const copied = `The report suggests ${SUPPRESS} ({"chunkId": "c0220", "quote": "${SUPPRESS}"}, {"tool": "tool#1.coPeakPpm"}).`
    const out = check({ sentences: [{ text: copied, support: [{ chunkId: 'c0220', quote: SUPPRESS }] }] })
    expect(out.sentences.map((s) => s.text)).toEqual([`The report suggests ${SUPPRESS}.`])
  })

  it('drops garbled text, such as JSON braces left in a sentence', () => {
    const out = check({ sentences: [{ text: `The report suggests ${SUPPRESS}. {`, support: [{ chunkId: 'c0220', quote: SUPPRESS }] }] })
    expect(out.dropped).toEqual([{ text: `The report suggests ${SUPPRESS}. {`, reason: 'malformed' }])
  })

  it('does not count test ids and formulas as numbers', () => {
    const out = check({
      sentences: [{ text: 'In Test M5, CO2 rose and O2 fell.', support: [{ chunkId: 'c0220', quote: SUPPRESS }] }],
    })
    expect(out.sentences).toHaveLength(1)
  })

  it('points a PSI quote at the line it starts on', () => {
    const out = check({
      sentences: [
        {
          text: 'FLEX ran its tests from 0.5 to 1.5 atm.',
          support: [{ chunkId: 'c0588', quote: 'Select the test pressure (0.5 - 1.5 atm)' }],
        },
      ],
    })
    expect(out.sentences[0].supports[0]).toMatchObject({ kind: 'quote', file: 'i_Investigation.txt', line: 42 })
    expect((out.sentences[0].supports[0] as { place: string }).place).toBe('PSI-69, line 42')
  })

  it('refuses when the model refuses, or when nothing survives', () => {
    expect(check({ refusal: true, sentences: [{ text: 'x', support: [] }] })).toEqual({
      sentences: [],
      dropped: [],
      refused: true,
    })
    expect(check({ sentences: [] }).refused).toBe(true)
    expect(check({}).refused).toBe(true)
  })

  it(`keeps at most ${MAX_SENTENCES} sentences`, () => {
    const many = Array.from({ length: 9 }, () => ({
      text: `The report suggests ${SUPPRESS}.`,
      support: [{ chunkId: 'c0220', quote: SUPPRESS }],
    }))
    expect(check({ sentences: many }).sentences).toHaveLength(MAX_SENTENCES)
  })
})

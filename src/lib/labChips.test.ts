import { describe, expect, it } from 'vitest'
import { chipsFor } from './labChips'
import type { LabEvent, Support, ToolResult } from './labProtocol'
import { readLines } from './labStore'
import { argsInclude, SUGGESTED } from './labSuggested'

const TWIN: ToolResult = {
  id: 'tool#1',
  name: 'set_burn_twin',
  args: { flowCmS: 2, action: 'drain' },
  view: 'overview',
  opensView: false,
  summary: 'drained the oxygen',
  fields: [],
  claimIds: ['twin.orbit-limit'],
}

describe('chipsFor', () => {
  it('names a quote by its place, and a model value by its model, once each', () => {
    const supports: Support[] = [
      { kind: 'tool', ref: 'tool#1.orbitLimitPct', label: 'Orbit limit', claimId: 'twin.orbit-limit' },
      { kind: 'tool', ref: 'tool#1.gapPts', label: 'Gap', claimId: 'twin.gap' },
      { kind: 'tool', ref: 'tool#1.earthOutAtPct', label: 'Earth out', claimId: 'bass2.flam.vs-1g' },
      {
        kind: 'quote',
        chunkId: 'c0310',
        quote: 'zone of flow is unfortunately typical',
        sourceId: 'nasa-tm-20210011385',
        place: 'BASS-II report, p. 76',
        pdfPage: 84,
        reportPage: 76,
      },
    ]
    const chips = chipsFor(supports, [TWIN])
    expect(chips.map((chip) => chip.label)).toEqual(['Burn Twin model', 'BASS-II report, p. 76', 'BASS-II report, p. 76'])
    // The model chip opens its first claim; the quoted value opens its claim; the quote opens itself.
    expect(chips[0].opens).toBe('twin.orbit-limit')
    expect(chips[1].opens).toBe('bass2.flam.vs-1g')
    expect(chips[2].opens).toMatchObject({ kind: 'quoted', verified: true, quote: 'zone of flow is unfortunately typical' })
  })

  it('merges a quoted value and a quote of the same words from the same page', () => {
    const show: ToolResult = { ...TWIN, id: 'tool#1', name: 'navigate', view: 'summarize', claimIds: ['bass2.o2forensic.p22b'] }
    const supports: Support[] = [
      { kind: 'tool', ref: 'tool#1.o2FinalPct', label: 'Final O2', claimId: 'bass2.o2forensic.p22b' },
      {
        kind: 'quote',
        chunkId: 'c0440',
        quote: '20.0 39.1 ---- 19.1',
        sourceId: 'nasa-tm-20210011385',
        place: 'BASS-II report, p. 107',
        pdfPage: 115,
        reportPage: 107,
      },
    ]
    const chips = chipsFor(supports, [show])
    expect(chips.map((chip) => chip.label)).toEqual(['BASS-II report, p. 107'])
    expect(chips[0].opens).toBe('bass2.o2forensic.p22b')
  })

  it('shows a value with no claim behind it as a plain label', () => {
    const chips = chipsFor([{ kind: 'tool', ref: 'tool#2.tests', label: 'Tests', claimId: null }], [
      { ...TWIN, id: 'tool#2', name: 'filter_tests', view: 'summarize' },
    ])
    expect(chips).toEqual([{ key: 'PSI-25 data', label: 'PSI-25 data', opens: null }])
  })
})

describe('readLines', () => {
  it('reads whole lines of JSON and carries an unfinished one to the next chunk', () => {
    const done: LabEvent = { type: 'done', refused: false, model: 'm', promptVersion: 'p' }
    const first = readLines('', '{"type":"status","stage":"searching"}\n{"type":"do')
    expect(first.events).toEqual([{ type: 'status', stage: 'searching' }])
    const second = readLines(first.carry, 'ne","refused":false,"model":"m","promptVersion":"p"}\n')
    expect(second).toEqual({ events: [done], carry: '' })
  })

  it('skips blank and broken lines', () => {
    expect(readLines('', '\n{broken\n\n').events).toEqual([])
  })
})

describe('the suggested questions', () => {
  it('are the six of SPEC F5', () => {
    expect(SUGGESTED.map((s) => s.id)).toEqual(['breezes', 'm5', 'small-cabin', 'suppression', 'lunar', 'readings-39'])
  })

  it('match tool arguments that include what is expected', () => {
    expect(argsInclude({ flowCmS: 2, action: 'drain', rodMm: 6.35 }, { flowCmS: 2, action: 'drain' })).toBe(true)
    expect(argsInclude({ view: 'summarize', params: { test: 'P22b' } }, { view: 'summarize', params: { test: 'P22b' } })).toBe(true)
    expect(argsInclude({ flowCmS: 20, action: 'drain' }, { flowCmS: 2, action: 'drain' })).toBe(false)
    expect(argsInclude({ view: 'summarize', params: {} }, { view: 'summarize', params: { test: 'P22b' } })).toBe(false)
  })
})

import { describe, expect, it } from 'vitest'
import flowByTestJson from '../../docs/fixtures/flow-by-test.json'
import csvText from '../../pipeline/sources/PSI-25/PSI-25_Experimental table_BASS-II.csv?raw'
import { compileBass2, summarizeAudit, type FlowByTest } from './audit'
import { auditCounters, auditSegments, introClip, introCount, stepSegment } from './auditBar'

const rows = compileBass2(csvText, flowByTestJson as FlowByTest)
const summary = summarizeAudit(rows, { generatedBy: 'test', generatedAt: 'now' })

describe('auditCounters', () => {
  const counters = auditCounters(summary, rows)
  const value = (id: string) => counters.find((c) => c.id === id)?.value

  it('counts from the audit, never typed in', () => {
    expect(counters.map((c) => c.id)).toEqual([
      'tests',
      'o2-usable',
      'quarantined',
      'co-over-range',
      'sensor-warning',
      'date-error',
    ])
    expect(value('tests')).toBe(129)
    expect(value('o2-usable')).toBe(122)
    expect(value('quarantined')).toBe(7)
    expect(value('co-over-range')).toBe(4)
    expect(value('sensor-warning')).toBe(18)
    expect(value('date-error')).toBe(3)
  })

  it('writes definitions from the data', () => {
    const quarantined = counters.find((c) => c.id === 'quarantined')
    expect(quarantined?.definition).toBe('Final O2 missing, or physically impossible such as 39.1%')
    expect(counters.find((c) => c.id === 'co-over-range')?.definition).toBe(
      'Final CO above the sensor’s range: the cell says >500, OR or over',
    )
    expect(counters.find((c) => c.id === 'date-error')?.definition).toContain('2014 or 2016')
  })

  it('links each counter to its filter with the bay open', () => {
    for (const counter of counters) expect(counter.link.quarantine).toBe(true)
    expect(counters.find((c) => c.id === 'quarantined')?.link.filters).toEqual({ audit: 'quarantined' })
  })
})

describe('auditSegments', () => {
  const segments = auditSegments(rows)

  it('gives one segment per test in CSV order, colored by its most serious flag', () => {
    expect(segments).toHaveLength(129)
    expect(segments.map((s) => s.testId)).toEqual(rows.map((r) => r.testId))
    const tally = (severity: string) => segments.filter((s) => s.severity === severity).length
    expect(tally('quarantined')).toBe(7)
    expect(tally('co-over-range')).toBe(4)
    expect(tally('warning')).toBe(21)
    expect(tally('clean')).toBe(97)
  })

  it('labels each segment with its test and flag', () => {
    expect(segments.find((s) => s.testId === 'P22b')?.label).toBe('P22b: Quarantined, final O2 39.1%: impossible')
    expect(segments.find((s) => s.testId === 'B1')?.label).toBe('B1: No flags')
    expect(segments.find((s) => s.testId === 'T9')?.label).toBe('T9: Date errors, year outside the 2014 and 2016 runs')
  })
})

describe('intro and keyboard helpers', () => {
  it('ticks counters from 0 and reveals the bar left to right', () => {
    expect(introCount(129, 0)).toBe('0')
    expect(introCount(129, 0.5)).toBe('65')
    expect(introCount(129, 1)).toBe('129')
    expect(introClip(0)).toBe('inset(0 100% 0 0)')
    expect(introClip(1)).toBe('inset(0 0% 0 0)')
  })

  it('steps through segments with arrows, Home and End', () => {
    expect(stepSegment(0, 'ArrowRight', 3)).toBe(1)
    expect(stepSegment(2, 'ArrowRight', 3)).toBeNull()
    expect(stepSegment(0, 'ArrowLeft', 3)).toBeNull()
    expect(stepSegment(1, 'End', 3)).toBe(2)
    expect(stepSegment(1, 'Home', 3)).toBe(0)
    expect(stepSegment(1, 'a', 3)).toBeNull()
  })
})

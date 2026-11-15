import { describe, expect, it } from 'vitest'
import flowByTestJson from '../../docs/fixtures/flow-by-test.json'
import csvText from '../../pipeline/sources/PSI-25/PSI-25_Experimental table_BASS-II.csv?raw'
import { compileBass2, forensicClaimId, o2Forensic, type FlowByTest } from './audit'
import { getClaim } from './claims'
import {
  bayGroups,
  bayRows,
  FILL_MIX_PCT,
  linkFromParams,
  matchesFilters,
  moveInWall,
  NO_FILTERS,
  o2Domain,
  o2FillMixPct,
  paramsFromLink,
  tileLabel,
  wallColumns,
} from './testWall'

const rows = compileBass2(csvText, flowByTestJson as FlowByTest)
const columns = wallColumns(rows)
const count = (filters: Partial<typeof NO_FILTERS>) =>
  rows.filter((row) => matchesFilters(row, { ...NO_FILTERS, ...filters })).length

describe('wallColumns', () => {
  it('makes one column per PI in the CSV order, holding every test', () => {
    expect(columns.map((c) => [c.pi, c.rows.length])).toEqual([
      ['Bhattacharjee', 22],
      ['Ferkul', 4],
      ['Miller', 20],
      ['Olson', 27],
      ['Fernandez-Pello', 27],
      ["T'ien", 29],
    ])
  })

  it('orders each column by its Date cell as written, so the 2018 errors sort last', () => {
    for (const column of columns) {
      const dates = column.rows.map((r) => r.date)
      expect(dates).toEqual([...dates].sort())
    }
    expect(columns[5].rows.slice(-2).map((r) => r.testId)).toEqual(['T9', 'T18'])
  })

  it('groups the 7 quarantined tests in the bay by cause, from their forensics', () => {
    const forensics = new Map(
      rows.flatMap((r) => {
        const quote = getClaim(forensicClaimId(r.testId))?.quote
        return quote ? [[r.testId, o2Forensic(r, quote)] as const] : []
      }),
    )
    const groups = bayGroups(columns, (testId) => forensics.get(testId))
    expect(groups.map((g) => [g.label, g.rows.map((r) => r.testId)])).toEqual([
      ['Blank uncalibrated initial: the offset became the whole reading', ['P22b', 'T28b']],
      ['Blank uncalibrated final: the reading is just the offset', ['B2', 'P22a', 'T28a']],
      ['No final O2 recorded', ['B14', 'F3']],
    ])
    // Every quarantined test is in exactly one group, and P22b comes first.
    expect(groups.flatMap((g) => g.rows).map((r) => r.testId).sort()).toEqual(bayRows(columns).map((r) => r.testId).sort())
  })

  it('puts an impossible value with no Appendix A row in its own group', () => {
    const groups = bayGroups(columns, () => undefined)
    expect(groups.map((g) => g.cause)).toEqual(['no-final-o2', 'impossible'])
  })
})

describe('matchesFilters', () => {
  it('matches everything with no filters', () => {
    expect(count({})).toBe(129)
  })

  it('filters by PI, sample type and family, flow, initial O2, burn and audit group', () => {
    expect(count({ pi: 'Olson' })).toBe(27)
    expect(count({ sample: 'pmma-rod-6.35' })).toBe(31)
    expect(count({ sample: 'family:rod' })).toBe(54)
    expect(count({ sample: 'family:sibal' })).toBe(27)
    expect(count({ flow: 'Opposed' })).toBe(67)
    expect(count({ flow: 'Concurrent' })).toBe(38)
    expect(count({ flow: 'Stagnation' })).toBe(15)
    expect(count({ flow: 'not-stated' })).toBe(9)
    expect(count({ burn: 'confirmed' })).toBe(65)
    expect(count({ burn: 'not-confirmed' })).toBe(64)
    expect(count({ audit: 'quarantined' })).toBe(7)
    expect(count({ audit: 'co-over-range' })).toBe(4)
    expect(count({ audit: 'date-error' })).toBe(3)
    expect(count({ audit: 'o2-usable' })).toBe(122)
    expect(count({ o2: { min: 13.6, max: 22.2 } })).toBe(129)
    expect(count({ o2: { min: 22.2, max: 22.2 } })).toBe(rows.filter((r) => r.o2InitPct === 22.2).length)
  })

  it('filters by AI-read outcome when the outcomes are loaded, and leaves that filter out when they aren’t', () => {
    const outcomes = new Map([
      [rows[0].testId, 'sustained' as const],
      [rows[1].testId, 'brief' as const],
    ])
    const matching = (outcome: 'sustained' | 'brief' | 'not-stated') =>
      rows.filter((row) => matchesFilters(row, { ...NO_FILTERS, outcome }, outcomes)).map((row) => row.testId)
    expect(matching('sustained')).toEqual([rows[0].testId])
    expect(matching('brief')).toEqual([rows[1].testId])
    // A test with no entry counts as not stated.
    expect(matching('not-stated')).toHaveLength(rows.length - 2)
    expect(count({ outcome: 'sustained' })).toBe(rows.length)
  })

  it('combines filters', () => {
    expect(count({ sample: 'family:sibal', burn: 'confirmed' })).toBe(0)
    expect(count({ pi: 'Miller', flow: 'Opposed' })).toBe(20)
  })
})

describe('tile fill', () => {
  const domain = o2Domain(rows)

  it('spans the data’s initial O2', () => {
    expect(domain).toEqual({ min: 13.6, max: 22.2 })
  })

  it('maps the lowest and highest initial O2 to the ends of the cyan mix', () => {
    expect(o2FillMixPct(domain.min, domain)).toBe(FILL_MIX_PCT.min)
    expect(o2FillMixPct(domain.max, domain)).toBe(FILL_MIX_PCT.max)
    expect(o2FillMixPct(null, domain)).toBeNull()
  })
})

describe('moveInWall', () => {
  // Two PI blocks, three across:  a b c | h i
  //                               d _ f
  //                               g e
  const grid = [
    ['a', 'b', 'c', 'd', null, 'f', 'g', 'e'],
    ['h', 'i'],
  ]

  it('steps left and right through the whole wall, skipping empty slots', () => {
    expect(moveInWall(grid, 'd', 'ArrowRight')).toBe('f')
    expect(moveInWall(grid, 'e', 'ArrowRight')).toBe('h')
    expect(moveInWall(grid, 'h', 'ArrowLeft')).toBe('e')
    expect(moveInWall(grid, 'a', 'ArrowLeft')).toBeNull()
  })

  it('moves up and down a row within a column, past empty slots', () => {
    expect(moveInWall(grid, 'a', 'ArrowDown')).toBe('d')
    expect(moveInWall(grid, 'b', 'ArrowDown')).toBe('e') // the slot between is empty
    expect(moveInWall(grid, 'e', 'ArrowUp')).toBe('b')
    expect(moveInWall(grid, 'c', 'ArrowDown')).toBe('f')
    expect(moveInWall(grid, 'f', 'ArrowDown')).toBeNull()
    expect(moveInWall(grid, 'h', 'ArrowUp')).toBeNull()
  })

  it('jumps to the ends, and ignores other keys', () => {
    expect(moveInWall(grid, 'd', 'Home')).toBe('a')
    expect(moveInWall(grid, 'd', 'End')).toBe('i')
    expect(moveInWall(grid, 'd', 'Enter')).toBeNull()
  })
})

describe('deep links', () => {
  it('reads the parameters it knows and ignores the rest', () => {
    expect(linkFromParams({ test: 'P22b' })).toEqual({ test: 'P22b' })
    expect(linkFromParams({ audit: 'quarantined', quarantine: 'on' })).toEqual({
      filters: { audit: 'quarantined' },
      quarantine: true,
    })
    expect(linkFromParams({ audit: 'nonsense', sample: 'family:rod', flow: 'Opposed', pi: 'Olson' })).toEqual({
      filters: { sample: 'family:rod', flow: 'Opposed', pi: 'Olson' },
    })
    expect(linkFromParams({ sample: 'family:unknown' })).toEqual({})
    expect(linkFromParams({ outcome: 'no-ignition' })).toEqual({ filters: { outcome: 'no-ignition' } })
    expect(linkFromParams({ outcome: 'burned' })).toEqual({})
    expect(paramsFromLink({ filters: { outcome: 'sustained', burn: 'confirmed' } })).toEqual({ burn: 'confirmed', outcome: 'sustained' })
  })

  it('writes the same parameters back', () => {
    const params = { audit: 'co-over-range', quarantine: 'on', test: 'M5' }
    expect(paramsFromLink(linkFromParams(params))).toEqual(params)
  })
})

describe('tileLabel', () => {
  it('says in words what the tile shows', () => {
    const p22b = rows.find((r) => r.testId === 'P22b')
    expect(tileLabel(p22b!)).toBe(
      'Test P22b, Fernandez-Pello, PMMA rod, 9.525 mm, initial O2 20%, opposed flow, quarantined, burn not checked: a reading is unusable',
    )
    const t1 = rows.find((r) => r.testId === 'T1')
    expect(tileLabel(t1!)).toContain('flow not stated')
    expect(tileLabel(t1!)).toContain('fire too small for the sensors')
  })
})

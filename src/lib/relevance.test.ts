import { describe, expect, it } from 'vitest'
import flowByTestJson from '../../docs/fixtures/flow-by-test.json'
import csvText from '../../pipeline/sources/PSI-25/PSI-25_Experimental table_BASS-II.csv?raw'
import { compileBass2, type FlowByTest } from './audit'
import { getClaim, quotedField } from './claims'
import { investigations, PHENOMENA, saffire1TableSize, testedO2Range, type Investigation } from './investigations'
import { normalize } from './normalize'
import {
  covers,
  LUNAR_TARGETS,
  rankInvestigations,
  RELEVANCE_WEIGHTS,
  relevanceHeadline,
  scoreInvestigation,
} from './relevance'

const rows = compileBass2(csvText, flowByTestJson as FlowByTest)
const range = testedO2Range(rows)
const list = investigations(range)
const [normoxic, sea34] = LUNAR_TARGETS
const byId = (id: string) => list.find((i) => i.id === id) as Investigation
const scores = (target: (typeof LUNAR_TARGETS)[number]) =>
  Object.fromEntries(rankInvestigations(list, target).map((s) => [s.investigation.id, Number(s.relevance.toFixed(1))]))

describe('the investigation index', () => {
  it('takes BASS-II’s O2 range from the CSV: 13.6 % to 22.2 % initial O2', () => {
    expect(range).toEqual({ min: 13.6, max: 22.2 })
    expect(testedO2Range([])).toBeNull()
  })

  it('indexes the eight investigations, each fact on a verified claim', () => {
    expect(list.map((i) => i.name)).toEqual([
      'BASS-II',
      'BASS',
      'Saffire-I',
      'FLEX',
      'Saffire-II',
      'SAME',
      'Saffire-III',
      'PSI-62 flame spread models',
    ])
    for (const inv of list) {
      const ids = [
        inv.burned.claimId,
        inv.platform.claimId,
        inv.gravity.claimId,
        inv.o2Pct?.claimId,
        inv.pressurePsia?.claimId,
        inv.spacecraftMaterials,
        inv.testTable,
        ...Object.values(inv.phenomena),
      ].filter((id): id is string => typeof id === 'string')
      for (const id of ids) expect(getClaim(id)?.verified, `${inv.name}: ${id}`).toBe(true)
    }
  })

  it('quotes every number it uses', () => {
    const quote = (id: string) => normalize(getClaim(id)?.quote ?? '')
    expect(quote('bass2.sibal-o2')).toContain('16 to 21 percent')
    expect(quote('bass2.pressure-1atm')).toContain('1 atm')
    expect(quote('psi98.table-s1')).toContain('21.5 - 21.7')
    expect(quote('psi69.pressure')).toContain('0.5 - 1.5 atm')
    expect(quote('zayac.atmospheres')).toContain(
      `${normoxic.o2Pct}% oxygen at ${normoxic.psia} psia, and ${sea34.o2Pct}% oxygen at ${sea34.psia} psia`,
    )
  })

  it('states nothing it doesn’t have: no pressure for the Saffires and SAME, no O2 for FLEX', () => {
    for (const id of ['saffire-1', 'saffire-2', 'saffire-3', 'same', 'psi-62']) expect(byId(id).pressurePsia).toBeNull()
    expect(byId('flex').o2Pct).toBeNull()
    expect(byId('saffire-3').spacecraftMaterials).toBeNull()
    expect(byId('saffire-3').caveat?.value).toMatch(/copied from Saffire-I/)
    expect(getClaim(byId('saffire-3').caveat?.claimId ?? '')?.verified).toBe(true)
  })
})

describe('covers', () => {
  it('counts a target within the tolerance of a tested range, and says when the range is unknown', () => {
    expect(covers({ min: 21.5, max: 21.7 }, 21, 0.5)).toBe(true)
    expect(covers({ min: 21.5, max: 21.7 }, 20.9, 0.5)).toBe(false)
    expect(covers({ min: 14.696, max: 14.696 }, 14.7, 0.3)).toBe(true)
    expect(covers(null, 21, 0.5)).toBeNull()
  })
})

describe('relevance (SPEC F3d)', () => {
  it('weighs atmosphere 0.35, gravity 0.25, phenomena 0.20, materials 0.10, test table 0.10', () => {
    expect(Object.values(RELEVANCE_WEIGHTS).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12)
  })

  it('ranks for 21 % O2 at 14.7 psia: BASS-II first, then BASS, then Saffire-I', () => {
    expect(scores(normoxic)).toEqual({
      bass2: 73.5,
      bass: 59.5,
      'saffire-1': 58,
      flex: 38,
      'saffire-2': 30.5,
      same: 26.5,
      'saffire-3': 20.5,
      'psi-62': 4,
    })
  })

  it('finds nothing that tested 34 % O2 at 8.2 psia: FLEX’s pressure range is the closest', () => {
    const ranked = rankInvestigations(list, sea34)
    expect(scores(sea34)).toEqual({
      'saffire-1': 40.5,
      bass2: 38.5,
      flex: 38,
      'saffire-2': 30.5,
      same: 26.5,
      bass: 24.5,
      'saffire-3': 20.5,
      'psi-62': 4,
    })
    const headline = relevanceHeadline(ranked)
    expect(headline?.fullMatch).toBe(false)
    expect(headline?.bestAtmosphere).toBe(0.5)
    expect(headline?.closest.map((s) => s.investigation.id)).toEqual(['flex'])
    expect(headline?.top.investigation.id).toBe('saffire-1')
  })

  it('scores BASS-II’s parts: both atmosphere halves, half gravity, 4 of 5 phenomena, no materials claim', () => {
    const s = scoreInvestigation(byId('bass2'), normoxic)
    expect(s.o2).toBe(true)
    expect(s.pressure).toBe(true)
    expect(s.components).toEqual({ atmosphere: 1, gravity: 0.5, phenomena: 4 / PHENOMENA.length, materials: 0, data: 1 })
    expect(s.unknown).toEqual(['materials'])
  })

  it('flags an atmosphere it can’t judge, and gives a ground study no gravity credit', () => {
    expect(scoreInvestigation(byId('saffire-1'), normoxic).unknown).toContain('atmosphere')
    expect(scoreInvestigation(byId('psi-62'), normoxic).components.gravity).toBe(0)
  })

  it('says when an investigation did test the target atmosphere', () => {
    const headline = relevanceHeadline(rankInvestigations(list, normoxic))
    expect(headline?.fullMatch).toBe(true)
    expect(headline?.closest.map((s) => s.investigation.id)).toEqual(['bass2', 'bass'])
    expect(relevanceHeadline([])).toBeNull()
  })
})

describe('the record inconsistencies read their values from the quotes', () => {
  it('gives Saffire-I and SAME the same dates, and Saffire-II its own', () => {
    expect(quotedField('psi98.start')).toBe('03-02-2001')
    expect(quotedField('psi102.start')).toBe('03-02-2001')
    expect(quotedField('psi98.end')).toBe('02-28-2008')
    expect(quotedField('psi102.end')).toBe('02-28-2008')
    expect(quotedField('psi99.start')).toBe('09-30-2016')
    expect(quotedField('psi98.platform-field')).toBe('International Space Station (ISS)')
    expect(quotedField('psi98.cygnus')).toBe('')
  })

  it('reads Saffire-I’s table size as length 40.6 cm, width 94 cm, in the header’s column order', () => {
    expect(saffire1TableSize()).toEqual({ lengthCm: '40.6', widthCm: '94' })
    const header = (getClaim('psi98.table-header')?.quote ?? '').split(',').map((c) => c.trim())
    expect(header[3]).toBe('Sample Length (cm)')
    expect(header[4]).toBe('Sample Width (cm)')
  })
})

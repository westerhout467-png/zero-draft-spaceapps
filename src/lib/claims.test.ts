import { describe, expect, it } from 'vitest'
import { IGNITION_LIMIT_O2_PCT, PULSE_HZ, QUENCH_ASPECT_RATIO } from './burnTwin'
import {
  CO2_PER_O2,
  CO_PPM_PER_PCT_CO2,
  CO_SENSOR_CEILING_PPM,
  HUGGETT_J_PER_G_O2,
  MSG_N2_FLOW_CC_MIN,
  MSG_VOLUME_M3,
  R_CM3_ATM_PER_MOL_K,
  SMAC_1_HOUR_PPM,
  SMAC_LONG_TERM_PPM,
  US_LAB_VOLUME_M3,
} from './cabin'
import { CLAIMS, citePreview, getClaim, SOURCES, sourceLink, splitEmphasis } from './claims'
import { LUNAR_ATMOSPHERE, M5_START, M5_TEST, N2_PRESET } from './interpret'
import { normalize } from './normalize'
import { ALPHA_PMMA_CM2_S, EARTH_LIMIT_O2_PCT, R0_CM } from './physics'
import { TEST1_IGNITION_S } from './risk'

const claim = (id: string) => {
  const found = getClaim(id)
  if (!found) throw new Error(`missing claim ${id}`)
  return found
}
const quoteOf = (id: string) => normalize(claim(id).quote ?? '')

describe('claims.json', () => {
  it('holds the 87 report claims, the 55 PSI claims, the 3 Zayac poster claims and the 14 computed claims, each id once', () => {
    expect(CLAIMS).toHaveLength(159)
    expect(new Set(CLAIMS.map((c) => c.id)).size).toBe(159)
    expect(CLAIMS.filter((c) => c.sourceId === 'nasa-tm-20210011385')).toHaveLength(87)
    expect(CLAIMS.filter((c) => typeof c.locator?.pdfPage === 'number')).toHaveLength(90)
    expect(CLAIMS.filter((c) => typeof c.locator?.file === 'string')).toHaveLength(55)
    expect(CLAIMS.filter((c) => c.kind === 'computed')).toHaveLength(14)
  })

  it('quotes the lunar lander atmospheres from page 1 of the Zayac 2024 poster', () => {
    const zayac = claim('zayac.atmospheres')
    expect(zayac.sourceId).toBe('zayac-2024')
    expect(zayac.locator?.pdfPage).toBe(1)
    expect(zayac.quote).toBe('specifically 21% oxygen at 14.7 psia, and 34% oxygen at 8.2 psia')
  })

  it('gives every computed claim a formula and inputs that are verified claims', () => {
    for (const c of CLAIMS.filter((c) => c.kind === 'computed')) {
      expect(c.formula, c.id).toBeTruthy()
      expect(c.inputs?.length, c.id).toBeGreaterThan(0)
      for (const input of c.inputs ?? []) expect(getClaim(input)?.verified, `${c.id} → ${input}`).toBe(true)
    }
  })

  it('gives every quoted claim a quote, a locator and a source in sources.json', () => {
    const sourceIds = new Set(SOURCES.map((s) => s.id))
    for (const c of CLAIMS.filter((c) => c.kind === 'quoted')) {
      expect(c.quote, c.id).toBeTruthy()
      expect(c.locator, c.id).toBeTruthy()
      expect(sourceIds.has(c.sourceId ?? ''), `${c.id} → ${c.sourceId}`).toBe(true)
    }
  })

  it('gives every emphasis as an exact phrase of its own quote', () => {
    const emphasized = CLAIMS.filter((c) => c.emphasis !== undefined)
    expect(emphasized.length).toBeGreaterThan(0)
    for (const c of emphasized) {
      expect(c.emphasis, c.id).toBeTruthy()
      expect(c.quote ?? '', c.id).toContain(c.emphasis)
    }
  })

  it('underlines the 1g part of the header thesis quote (psi26.impacts)', () => {
    expect(claim('psi26.impacts').emphasis).toBe(
      'based on 1-g behavior without consideration of low gravity effects',
    )
  })
})

describe('sources.json', () => {
  it('lists the 11 sources from SPEC §8.5, each with a link except the cited-only paper', () => {
    expect(SOURCES).toHaveLength(11)
    for (const s of SOURCES) {
      if (s.id !== 'olson-ferkul-2017') expect(sourceLink(s), s.id).toBeTruthy()
    }
  })

  it('gives every source a short name for footnote previews', () => {
    for (const s of SOURCES) expect(s.short, s.id).toBeTruthy()
    expect(SOURCES.find((s) => s.id === 'nasa-tm-20210011385')?.short).toBe('BASS-II report')
    expect(SOURCES.find((s) => s.id === 'psi-102')?.short).toBe('PSI-102')
  })
})

// The footnote preview replaced the old [p. 76] badge; the same five locator cases are covered.
describe('citePreview', () => {
  it('names the source, then the report page, the PDF page when there is no report page, or the PSI file line', () => {
    expect(citePreview(claim('bass2.flam.vs-1g'))).toBe('BASS-II report, p. 76')
    expect(citePreview(claim('bass2.lab-partner'))).toBe('BASS-II report, PDF p. 4')
    expect(citePreview(claim('psi69.pressure'))).toBe('PSI-69, line 42')
    expect(citePreview(claim('psi26.impacts'))).toBe('PSI-26, line 69')
    expect(citePreview(claim('zayac.atmospheres'))).toBe('Zayac 2024, PDF p. 1')
  })

  it('says a computed value is calculated, and gives the row for data rows', () => {
    expect(citePreview({ id: 'x', topic: '', text: '', kind: 'computed', verified: true })).toBe(
      'Calculated from cited inputs',
    )
    const row = {
      id: 'y',
      topic: '',
      text: '',
      kind: 'quoted',
      sourceId: 'psi-25',
      verified: true,
      locator: { row: '129' },
    } as const
    expect(citePreview(row)).toBe('PSI-25, row 129')
  })
})

describe('splitEmphasis', () => {
  it('cuts the quote around its emphasis, keeping every character', () => {
    const quote = claim('psi26.impacts').quote ?? ''
    const parts = splitEmphasis(quote, claim('psi26.impacts').emphasis)
    expect(parts.emphasis).toBe('based on 1-g behavior without consideration of low gravity effects')
    expect(parts.before.endsWith('segregates material ')).toBe(true)
    expect(parts.after).toBe('.')
    expect(parts.before + parts.emphasis + parts.after).toBe(quote)
  })

  it('leaves the quote whole when there is no emphasis or it is not in the quote', () => {
    expect(splitEmphasis('A quote.', undefined)).toEqual({ before: 'A quote.', emphasis: '', after: '' })
    expect(splitEmphasis('A quote.', 'missing')).toEqual({ before: 'A quote.', emphasis: '', after: '' })
  })
})

// Every model constant that cites a claim must match that claim's value or appear in its quote.
describe('model constants match their quotes', () => {
  it('physics.ts', () => {
    expect(claim('bass2.flam.r0').value).toBe(R0_CM)
    expect(claim('bass2.ign.alpha-pmma').value).toBe(ALPHA_PMMA_CM2_S)
    expect(claim('bass2.flam.vs-1g').value).toBe(EARTH_LIMIT_O2_PCT)
    expect(quoteOf('bass2.flam.stretch-def')).toContain('a = (3/2)(U/r)')
  })

  it('burnTwin.ts', () => {
    expect(claim('bass2.ign.limit-14.5').value).toBe(IGNITION_LIMIT_O2_PCT)
    expect(quoteOf('bass2.ign.limit-14.5')).toContain(`~${IGNITION_LIMIT_O2_PCT} percent O2`)
    expect(claim('bass2.osc-1.1hz').value).toBe(PULSE_HZ)
    expect(quoteOf('bass2.osc-1.1hz')).toContain(`${PULSE_HZ} Hz`)
    expect(claim('bass2.aspect-0.5').value).toBe(QUENCH_ASPECT_RATIO)
    expect(quoteOf('bass2.aspect-0.5')).toContain(`to ${QUENCH_ASPECT_RATIO} at extinction`)
  })

  it('risk.ts', () => {
    expect(claim('bass2.ign.test1-25s').value).toBe(TEST1_IGNITION_S)
    expect(quoteOf('bass2.ign.test1-25s')).toContain(`~${TEST1_IGNITION_S} s`)
  })

  it('cabin.ts', () => {
    expect(quoteOf('bass2.calorimetry-inputs')).toContain(`R = ${R_CM3_ATM_PER_MOL_K}`)
    expect(claim('bass2.hrr.huggett').value).toBe(HUGGETT_J_PER_G_O2 / 1000)
    expect(quoteOf('bass2.stoich')).toContain('6 O2 > 5 CO2')
    expect(CO2_PER_O2).toBe(5 / 6)
    expect(claim('bass2.co.370').value).toBe(CO_PPM_PER_PCT_CO2['opposed-slab'])
    expect(claim('bass2.co.550').value).toBe(CO_PPM_PER_PCT_CO2['concurrent-rod'])
    expect(quoteOf('bass2.co.smac')).toContain(`(${SMAC_LONG_TERM_PPM} ppm)`)
    expect(quoteOf('bass2.co.smac')).toContain(`SMAC of ${SMAC_1_HOUR_PPM} ppm`)
    expect(claim('bass2.co.sensor-range').value).toBe(CO_SENSOR_CEILING_PPM)
    expect(claim('bass2.cstr.volume').value).toBe(MSG_VOLUME_M3)
    expect(claim('bass2.cstr.n2-flow').value).toBe(MSG_N2_FLOW_CC_MIN)
    expect(claim('bass2.us-lab-volume').value).toBe(US_LAB_VOLUME_M3)
  })

  it('interpret.ts', () => {
    // Table 5.1's M5 row: "M5 3 2.2 2 10 0.071 27.2 22.2 19" (flow, minutes, initial and final O2).
    expect(quoteOf('bass2.m5.row')).toContain(
      ` ${M5_TEST.flowCmS} 0.071 ${M5_TEST.minutes} ${M5_TEST.o2InitPct} ${M5_TEST.o2FinalPct}`,
    )
    // M5's row in Table A.4: calibrated O2, uncalibrated O2, then initial and final CO2 and CO.
    expect(quoteOf('bass2.table.a4-m5')).toContain(
      `${M5_TEST.o2InitPct} ${M5_TEST.o2FinalPct.toFixed(1)} 20.6 17.4 ${M5_START.co2InitPct} 3.22 ${M5_START.coInitPpm} >500`,
    )
    expect(quoteOf('zayac.atmospheres')).toContain(
      `${LUNAR_ATMOSPHERE.o2Pct}% oxygen at ${LUNAR_ATMOSPHERE.psia} psia`,
    )
    expect(claim('bass2.cstr.c0').value).toBe(N2_PRESET.o2InitPct)
    expect(quoteOf('bass2.cstr.c0')).toContain(`C(0) = ${N2_PRESET.o2InitPct} percent O2`)
  })
})

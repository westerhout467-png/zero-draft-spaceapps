// public/data/investigations.json, when the pipeline has written it: every quote in it is found
// again here in the investigation's own text, and every field passes verify.ts's checks a second
// time (SPEC F7, §7.2). Skipped only while the file doesn't exist.
import { describe, expect, it } from 'vitest'
import type { InvestigationsFile } from './generatedData'
import { findQuote, MIN_QUOTE_WORDS } from './investigationVerify'
import { numbersIn, isTraceable } from './answerCheck'
import type { PagesFile, TextPage } from './pages'

const IDS = ['PSI-25', 'PSI-26', 'PSI-62', 'PSI-69', 'PSI-98', 'PSI-99', 'PSI-100', 'PSI-102']
const pageFiles = import.meta.glob('../../pipeline/text/*.pages.json', { eager: true, import: 'default' }) as Record<string, PagesFile>
const pagesOf = (id: string): TextPage[] => Object.values(pageFiles).find((file) => file.id === id)?.pages ?? []

const generated = import.meta.glob('../../public/data/investigations.json', { eager: true, import: 'default' })
const file = Object.values(generated)[0] as InvestigationsFile | undefined

describe.skipIf(!file)('public/data/investigations.json', () => {
  const investigations = file?.investigations ?? []

  it('records how it was made (CLAUDE.md rule 11)', () => {
    expect(file?.generatedBy).toBe('pipeline/scripts/verify.ts')
    expect(file?.model).toBeTruthy()
    expect(file?.promptVersion).toMatch(/^extract-investigation@\d+$/)
  })

  it('holds the eight investigations, in order', () => {
    expect(investigations.map((inv) => inv.id)).toEqual(IDS)
  })

  it('holds only quotes that are in the investigation’s own text', () => {
    for (const inv of investigations) {
      const pages = pagesOf(inv.id)
      const all = [inv.acronym, inv.title, inv.platform, inv.o2Pct, inv.pressure, inv.flow, ...inv.summary].flatMap((f) => f.evidence)
      for (const evidence of all) {
        const found = findQuote(pages, evidence.quote, evidence.file, evidence.page)
        expect(found, `${inv.id}: “${evidence.quote}”`).not.toBeNull()
        expect(found?.page).toBe(evidence.page)
      }
    }
  })

  it('reads PSI-25 from the report’s summary page only (PDF p. 9)', () => {
    const psi25 = investigations.find((inv) => inv.id === 'PSI-25')
    const all = psi25 ? [psi25.acronym, psi25.title, psi25.platform, psi25.o2Pct, psi25.pressure, psi25.flow, ...psi25.summary] : []
    for (const evidence of all.flatMap((f) => f.evidence)) expect(evidence.page).toBe(9)
  })

  it('states no value without a quote, and no number its quotes don’t have', () => {
    for (const inv of investigations) {
      for (const field of [inv.acronym, inv.title, inv.platform]) {
        if (field.value === null) continue
        expect(field.evidence.some((e) => e.quote.toLowerCase().includes((field.value as string).toLowerCase())), `${inv.id}: ${field.value}`).toBe(true)
      }
      for (const field of [inv.o2Pct, inv.pressure, inv.flow]) {
        if (field.value === null) continue
        const quoted = field.evidence.flatMap((e) => numbersIn(e.quote).map(Number))
        expect(isTraceable(String(field.value.min), quoted) && isTraceable(String(field.value.max), quoted), `${inv.id}`).toBe(true)
      }
    }
  })

  it('gives every summary sentence a quote of 3 words or more, and no number the quote lacks', () => {
    for (const inv of investigations) {
      expect(inv.summary.length, inv.id).toBeLessThanOrEqual(3)
      for (const sentence of inv.summary) {
        expect(sentence.evidence.length, `${inv.id}: ${sentence.text}`).toBeGreaterThan(0)
        for (const e of sentence.evidence) expect(e.quote.split(' ').length).toBeGreaterThanOrEqual(MIN_QUOTE_WORDS)
        const quoted = sentence.evidence.flatMap((e) => numbersIn(e.quote).map(Number))
        for (const n of numbersIn(sentence.text)) expect(isTraceable(n, quoted), `${inv.id}: ${n} in “${sentence.text}”`).toBe(true)
      }
    }
  })

  it('lists what failed, and shows none of it', () => {
    for (const failure of file?.failures ?? []) {
      const inv = investigations.find((i) => i.id === failure.id)
      const key = { o2Range: 'o2Pct', pressureRange: 'pressure', flowRange: 'flow' }[failure.field] ?? failure.field
      if (key in (inv ?? {})) expect((inv as unknown as Record<string, { value: unknown }>)[key].value, `${failure.id} ${failure.field}`).toBeNull()
    }
  })
})
